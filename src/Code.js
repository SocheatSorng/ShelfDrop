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
    .setTitle(result.title + " - ShelfDrop")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

function handleRequest(request, services) {
  const settings = readSettings(services.properties());
  const params = request.params || {};

  // The token comes first: without it, nothing else is read and nothing about the app is shown.
  if (!tokenMatches(params.t, settings.token)) return renderNotFound();
  if (settings.problems.length) return renderSetupNeeded(settings.problems);

  const ctx = { appUrl: services.appUrl(), token: settings.token };

  if (request.method === "GET" && params.diag === "1") return renderDiag(ctx);

  if (params.f === undefined) {
    const files = services.listFolder(settings.folderId);
    return renderList({ ...ctx, books: listBooks(files, settings.maxBytes) });
  }

  const file = isDriveId(params.f) ? services.getFile(params.f) : null;
  const check = checkSendable(file, settings.folderId, settings.maxBytes);
  if (!check.ok) return renderMessage(ctx, "Can't send this", problemText_(check.reason));

  if (request.method !== "POST") return renderConfirm({ ...ctx, book: check.book });

  if (services.remainingQuota() < 1) {
    return renderMessage(ctx, "Not sent", "Today's e-mail limit is used up. Try again tomorrow.");
  }
  try {
    services.sendMail(buildBookMail(settings.kindleEmail, check.book, services.getBlob(file.id)));
  } catch (error) {
    services.log(
      "send failed: " + redact(error && error.message, [settings.kindleEmail, settings.token]),
    );
    return renderMessage(ctx, "Not sent", sendFailureText(error));
  }
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
    appUrl: () => ScriptApp.getService().getUrl(),
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
  console.log("Web app URL: " + (services.appUrl() || "not deployed yet"));
}

// Run from the editor once the web app is deployed: e-mails a small document with your private
// link to your Kindle, so you can tap it there instead of typing it.
function sendLinkToKindle() {
  const services = appsScriptServices_();
  const settings = readSettings(services.properties());
  if (settings.problems.length) {
    throw new Error("Fix these Script Properties first: " + settings.problems.join(", "));
  }
  const appUrl = services.appUrl();
  if (!appUrl || !/\/exec$/.test(appUrl)) {
    throw new Error("Deploy the web app first (the URL must end with /exec).");
  }
  const link = appLink(appUrl, { t: settings.token });
  services.sendMail(
    buildLinkMail(settings.kindleEmail, link, (text, type, name) =>
      Utilities.newBlob(text, type, name),
    ),
  );
  console.log("Link sent to your Kindle.");
}
