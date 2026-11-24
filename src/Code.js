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
    .setTitle(windowTitle_(result))
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

// The browser tab's title. A series name from Drive can be long, so it is cut to 100 characters.
function windowTitle_(result) {
  return String(result.windowTitle || result.title + " - ShelfDrop").slice(0, 100);
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
    noteFailure_(services, settings, "request failed", error);
    return renderError();
  }
}

function handleVerified_(request, services, settings) {
  const params = request.params || {};
  const ctx = { appUrl: settings.webAppUrl, token: settings.token };

  if (params.f === undefined) {
    const refresh = params.r === "1";
    const shelf = readShelf_(services, settings, refresh && params.s === undefined);
    if (params.s === undefined) return renderShelf({ ...ctx, ...shelf });
    // Only a series ID the shelf listing itself produced is used (review N6).
    // The listing may be up to 30 minutes old, so each of the series' folders is checked fresh in
    // Drive (review N12): one moved off the shelf stops showing at once.
    const found = findSeries(shelf, params.s);
    const ids = found ? found.ids.filter((id) => stillOnShelf_(services, settings, id)) : [];
    if (!ids.includes(params.s)) {
      return renderMessage(ctx, "Not on the shelf", "This series isn't on the shelf any more.");
    }
    const series = { ...found, ids };
    const listings = ids.map((id) => readListing_(services, settings, id, false, refresh));
    return renderSeries({
      ...ctx,
      series,
      seriesId: params.s,
      volumes: listVolumes(listings, settings.maxBytes),
      truncated: listings.filter((listing) => listing && listing.truncated).length,
    });
  }

  // The send check always reads the file and its parent folders fresh from Drive.
  const file = isDriveId(params.f) ? services.getFile(params.f) : null;
  const parents = parentFoldersOf_(services, settings, file);
  const check = checkSendable(file, settings.folderIds, settings.maxBytes, parents);
  if (!check.ok) return renderMessage(ctx, "Can't send this", problemText_(check.reason));
  ctx.seriesId = check.seriesId;

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
      noteFailure_(services, settings, "send failed", error);
      let quotaLeft = 1;
      try {
        quotaLeft = services.remainingQuota();
      } catch {
        // unknown: fall back to the generic message
      }
      return { sent: false, text: sendFailureText(check.book.size, quotaLeft) };
    }
    recordSend(services.state, file.id, now, limits.count);
    return { sent: true };
  });
  if (!outcome) return renderMessage(ctx, "Not sent", limitText("busy"));
  if (!outcome.sent) return renderMessage(ctx, "Not sent", outcome.text);
  services.log("sent file " + file.id);
  return renderSent({ ...ctx, book: check.book });
}

// Logs a failure with the secrets hidden, and keeps the latest one in Script Properties
// (_lastError) so checkSetup can show it: Apps Script often hides the log lines of web app runs
// by anonymous visitors such as the Kindle.
function noteFailure_(services, settings, label, error, key) {
  const text = (
    label +
    ": " +
    redact(error && error.message, [settings.kindleEmail, settings.token])
  ).slice(0, 300);
  services.log(text);
  try {
    services.state.set(key || "_lastError", new Date(services.now()).toISOString() + " " + text);
  } catch {
    // Saving the note must never turn a handled failure into an unhandled one.
  }
}

var LISTING_CACHE_SECONDS = 30 * 60;
var UNREADABLE_CACHE_SECONDS = 5 * 60;
// A shelf folder holding a whole library must not slow every page or overflow the cache's 100 KB
// per entry (review SF2): listings stop here and the page says some books aren't shown.
var MAX_LISTED_FILES = 300;
var MAX_LISTED_FOLDERS = 100;

// A folder's listing, or null if it can't be read (unshared, deleted, Drive down). The failure is
// noted as _lastFolderError for checkSetup (apart from _lastError, so it never hides a failed
// send), and remembered for 5 minutes so a dead folder costs one Drive read per 5 minutes, not one
// per page (review SF1). Listings are cached (books and folders only) unless refresh is set.
// The cache only feeds the lists: the send check always reads Drive.
function readListing_(services, settings, folderId, withFolders, refresh) {
  const key = (withFolders ? "dir+:" : "dir:") + folderId;
  if (!refresh) {
    const cached = cacheGet_(services, key);
    if (cached) return cached.unreadable ? null : cached;
  }
  let listing;
  try {
    listing = services.listFolder(folderId, withFolders);
  } catch (error) {
    noteFailure_(services, settings, "folder unreadable", error, "_lastFolderError");
    cachePut_(services, key, { unreadable: true }, UNREADABLE_CACHE_SECONDS);
    return null;
  }
  const slim = {
    folders: (listing.folders || [])
      .filter((folder) => !folder.trashed)
      .map((folder) => ({ id: folder.id, name: folder.name })),
    files: (listing.files || [])
      .filter((file) => !file.trashed && isBookFile(file))
      .map((file) => ({ id: file.id, name: file.name, size: file.size, mimeType: file.mimeType })),
  };
  if (listing.truncated) slim.truncated = true;
  cachePut_(services, key, slim);
  return slim;
}

function cacheGet_(services, key) {
  try {
    const text = services.cache && services.cache.get(key);
    return text ? JSON.parse(text) : null;
  } catch {
    return null; // a cache problem only costs a Drive read
  }
}

function cachePut_(services, key, value, seconds) {
  try {
    if (services.cache) {
      services.cache.put(key, JSON.stringify(value), seconds || LISTING_CACHE_SECONDS);
    }
  } catch {
    // too big for the cache (100 KB per entry) or the cache is down: the page still works
  }
}

// Whether a series folder, read fresh from Drive, still sits directly in a shelf folder.
function stillOnShelf_(services, settings, folderId) {
  const folder = services.getFolder(folderId);
  return Boolean(
    folder &&
    !folder.trashed &&
    (folder.parentIds || []).some((id) => settings.folderIds.includes(id)),
  );
}

function readShelf_(services, settings, refresh) {
  const listings = settings.folderIds.map((id) =>
    readListing_(services, settings, id, true, refresh),
  );
  return buildShelf(listings, settings.maxBytes);
}

// The parent folders needed to place a file that isn't directly in a shelf folder (at most 5:
// Drive files have one parent nowadays).
function parentFoldersOf_(services, settings, file) {
  if (!file || (file.parentIds || []).some((id) => settings.folderIds.includes(id))) return [];
  return parentsToCheck(file, settings.folderIds)
    .slice(0, 5)
    .map((id) => services.getFolder(id));
}

function problemText_(reason) {
  if (reason === "too-big") return "This book is too big to send by e-mail.";
  if (reason === "not-a-book") return "Only EPUB and PDF books can be sent.";
  return "This book isn't on the shelf any more.";
}

function appsScriptServices_() {
  return {
    properties: () => PropertiesService.getScriptProperties().getProperties(),
    // A folder's files (and subfolders if asked), without parent lookups: they cost one Drive
    // call per file, and the listing doesn't need them.
    listFolder: (folderId, withFolders) => {
      const folder = DriveApp.getFolderById(folderId);
      const files = [];
      const fileIterator = folder.getFiles();
      let truncated = false;
      while (fileIterator.hasNext()) {
        if (files.length >= MAX_LISTED_FILES) {
          truncated = true;
          break;
        }
        const file = fileIterator.next();
        files.push({
          id: file.getId(),
          name: file.getName(),
          size: file.getSize(),
          mimeType: file.getMimeType(),
          trashed: file.isTrashed(),
        });
      }
      const folders = [];
      if (withFolders) {
        const folderIterator = folder.getFolders();
        while (folderIterator.hasNext()) {
          if (folders.length >= MAX_LISTED_FOLDERS) {
            truncated = true;
            break;
          }
          const sub = folderIterator.next();
          folders.push({ id: sub.getId(), name: sub.getName(), trashed: sub.isTrashed() });
        }
      }
      return { folders, files, truncated };
    },
    getFolder: (id) => {
      try {
        const folder = DriveApp.getFolderById(id);
        const parentIds = [];
        const parents = folder.getParents();
        while (parents.hasNext()) parentIds.push(parents.next().getId());
        return {
          id: folder.getId(),
          name: folder.getName(),
          trashed: folder.isTrashed(),
          parentIds,
        };
      } catch {
        return null; // no such folder, or not shared with this account
      }
    },
    getFile: (id) => {
      try {
        return fileInfo_(DriveApp.getFileById(id));
      } catch {
        return null; // no such file, or not shared with this account
      }
    },
    getBlob: (id) => DriveApp.getFileById(id).getBlob(),
    cache: CacheService.getScriptCache(),
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
    const ids = settings.folderIds;
    const listings = ids.map((id) => readListing_(services, settings, id, true, true));
    listings.forEach((listing, i) => {
      if (!listing) {
        console.log(
          "Shelf folder " +
            (i + 1) +
            " of " +
            ids.length +
            " in FOLDER_ID couldn't be read. " +
            "Is it shared with this account as Viewer?",
        );
      }
    });
    const shelf = buildShelf(listings, settings.maxBytes);
    console.log(
      "Shelf: " + shelf.series.length + " series, " + shelf.loose.length + " loose books.",
    );
  }
  console.log("E-mails left today: " + services.remainingQuota());
  const lastError = services.state.get("_lastError");
  console.log("Last error: " + (lastError || "none"));
  console.log("Last folder error: " + (services.state.get("_lastFolderError") || "none"));
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
