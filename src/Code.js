// Entry points. doGet/doPost are called by Apps Script; checkSetup and sendLinkToKindle are run by
// the owner from the Apps Script editor. Everything that touches Apps Script services is in
// appsScriptServices_ so handleRequest can be tested with fakes.

function doGet(e) {
  return serve_(e, "GET");
}

function doPost(e) {
  return serve_(e, "POST");
}

function serve_(e, method) {
  const result = handleRequest({ method, params: (e && e.parameter) || {} }, appsScriptServices_());
  return HtmlService.createHtmlOutput(result.html)
    .setTitle(result.windowTitle || result.title + " - ShelfDrop")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

function handleRequest(request, services) {
  const params = request.params || {};
  let settings;
  try {
    settings = readSettings(services.properties());
  } catch {
    services.log("request failed: Script Properties could not be read");
    return renderNotFound();
  }

  // The token comes first: without it, nothing else is read and nothing about the app is shown.
  if (!tokenMatches(params.t, settings.token)) return renderNotFound();
  if (settings.problems.length) return renderSetupNeeded(settings.problems);

  // Any unexpected failure (folder unshared, a Google service down) gets a plain page instead of
  // Apps Script's error page, and a log line with the secrets hidden.
  try {
    return handleVerified_(request, services, settings);
  } catch (error) {
    services.log(
      "request failed: " + redact(error && error.message, [settings.kindleEmail, settings.token]),
    );
    return renderError();
  }
}

function handleVerified_(request, services, settings) {
  const params = request.params || {};
  const ctx = { appUrl: settings.webAppUrl, token: settings.token };

  if (request.method === "GET" && params.diag === "1") return renderDiag(ctx);

  if (params.f === undefined) {
    const files = services.listFolder(settings.folderId);
    return renderList({ ...ctx, books: listBooks(files, settings.maxBytes) });
  }

  const file = isDriveId(params.f) ? services.getFile(params.f) : null;
  const check = checkSendable(file, settings.folderId, settings.maxBytes);
  if (!check.ok) return renderMessage(ctx, "Can't send this", problemText_(check.reason));

  if (request.method !== "POST") return renderConfirm({ ...ctx, book: check.book });

  // One send at a time, so two taps (or a script) can't slip past the limits together.
  const outcome = services.withLock(() => {
    const now = services.now();
    const limits = checkSendLimits(services.state, file.id, now);
    if (!limits.ok) return { sent: false, text: limitText(limits.reason) };
    if (services.remainingQuota() < 1) {
      return { sent: false, text: "Today's e-mail limit is used up. Try again tomorrow." };
    }
    try {
      services.sendMail(buildBookMail(settings.kindleEmail, check.book, services.getBlob(file.id)));
    } catch (error) {
      services.log(
        "send failed: " + redact(error && error.message, [settings.kindleEmail, settings.token]),
      );
      return { sent: false, text: sendFailureText(error) };
    }
    recordSend(services.state, file.id, now, limits.count);
    return { sent: true };
  });
  if (!outcome) return renderMessage(ctx, "Not sent", limitText("busy"));
  if (!outcome.sent) return renderMessage(ctx, "Not sent", outcome.text);
  services.log("sent file " + file.id);
  return renderSent({ ...ctx, book: check.book });
}

function problemText_(reason) {
  if (reason === "too-big") return "This book is too big to send by e-mail.";
  if (reason === "not-a-book") return "Only EPUB and PDF books can be sent.";
  return "This book isn't on the shelf any more.";
}

function appsScriptServices_() {
  return {
    properties: () => PropertiesService.getScriptProperties().getProperties(),
    listFolder: (folderId) => {
      const files = [];
      const iterator = DriveApp.getFolderById(folderId).getFiles();
      while (iterator.hasNext()) files.push(fileInfo_(iterator.next()));
      return files;
    },
    getFile: (id) => {
      try {
        return fileInfo_(DriveApp.getFileById(id));
      } catch {
        return null; // no such file, or not shared with this account
      }
    },
    getBlob: (id) => DriveApp.getFileById(id).getBlob(),
    sendMail: (message) => MailApp.sendEmail(message),
    remainingQuota: () => MailApp.getRemainingDailyQuota(),
    log: (text) => console.log(text),
    now: () => Date.now(),
    // Runs fn while holding the script lock; returns null if the lock isn't free within 10 s.
    withLock: (fn) => {
      const lock = LockService.getScriptLock();
      if (!lock.tryLock(10000)) return null;
      try {
        return fn();
      } finally {
        lock.releaseLock();
      }
    },
    state: {
      get: (key) => PropertiesService.getScriptProperties().getProperty(key),
      set: (key, value) => PropertiesService.getScriptProperties().setProperty(key, value),
      keys: () => PropertiesService.getScriptProperties().getKeys(),
      remove: (key) => PropertiesService.getScriptProperties().deleteProperty(key),
    },
  };
}

function fileInfo_(file) {
  const parentIds = [];
  const parents = file.getParents();
  while (parents.hasNext()) parentIds.push(parents.next().getId());
  return {
    id: file.getId(),
    name: file.getName(),
    size: file.getSize(),
    mimeType: file.getMimeType(),
    trashed: file.isTrashed(),
    parentIds,
  };
}

// Run from the editor after setting Script Properties: triggers the authorisation screen (which
// should list only Drive read-only and send mail) and logs what it found, without any values.
function checkSetup() {
  const services = appsScriptServices_();
  const settings = readSettings(services.properties());
  console.log(
    settings.problems.length
      ? "Missing or invalid Script Properties: " + settings.problems.join(", ")
      : "Script Properties look right.",
  );
  if (!settings.problems.includes("FOLDER_ID")) {
    const books = listBooks(services.listFolder(settings.folderId), settings.maxBytes);
    console.log("Books found in the folder: " + books.length);
  }
  console.log("E-mails left today: " + services.remainingQuota());
  if (settings.problems.includes("WEB_APP_URL")) {
    console.log(
      "Set WEB_APP_URL to the Web app URL that `npm run deploy` printed (it ends with /exec).",
    );
  }
}

// Run from the editor once the web app is deployed: e-mails a small document with your private
// link to your Kindle, so you can tap it there instead of typing it.
function sendLinkToKindle() {
  const services = appsScriptServices_();
  const settings = readSettings(services.properties());
  if (settings.problems.length) {
    throw new Error("Fix these Script Properties first: " + settings.problems.join(", "));
  }
  const link = appLink(settings.webAppUrl, { t: settings.token });
  services.sendMail(
    buildLinkMail(settings.kindleEmail, link, (text, type, name) =>
      Utilities.newBlob(text, type, name),
    ),
  );
  console.log("Link sent to your Kindle.");
}
