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
  let props;
  try {
    props = services.properties();
    settings = readSettings(props);
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
    return handleVerified_(request, services, settings, props);
  } catch (error) {
    noteFailure_(services, settings, "request failed", error);
    return renderError();
  }
}

function handleVerified_(request, services, settings, props) {
  const params = request.params || {};
  // Sent marks come from this request's Script Properties, never the cache, so a book sent a
  // minute ago shows its mark at once.
  const ctx = {
    appUrl: settings.webAppUrl,
    token: settings.token,
    sent: sentTimes(props),
    now: services.now(),
    // With two or more main folders (FOLDER_ID entries) the first page lists them (phase 5).
    multi: settings.folderIds.length > 1,
  };

  if (params.f === undefined) {
    const refresh = params.r === "1";
    if (params.s === undefined) {
      // A main folder's page, by its place in FOLDER_ID (1, 2, ...): folder IDs are settings and
      // never appear in a page or link.
      if (params.m !== undefined) {
        const mainId = mainIdAt_(settings, params.m);
        if (!mainId) {
          return renderMessage(ctx, "Not on the shelf", "This folder isn't on the shelf.");
        }
        return folderPage_(services, settings, ctx, mainId, refresh);
      }
      if (!ctx.multi) return folderPage_(services, settings, ctx, settings.folderIds[0], refresh);
      const mains = readMains_(services, settings, refresh);
      return renderFolders({
        ...ctx,
        mains: mainFolders(mains),
        unreadable: mains.filter((main) => !main.listing).length,
      });
    }
    // Only a series ID a main folder's listing itself produced is used (review N6), and same-named
    // series merge only inside that main folder (phase 5: never across main folders).
    // The listing may be up to 30 minutes old, so each of the series' folders is checked fresh in
    // Drive (review N12): one moved off the shelf stops showing at once.
    const main = findMainOfSeries(readMains_(services, settings, false), params.s);
    const found = main ? findSeries(buildShelf([main.listing], settings.maxBytes), params.s) : null;
    const ids = found ? found.ids.filter((id) => stillOnShelf_(services, id, main.id)) : [];
    if (!ids.includes(params.s)) {
      return renderMessage(ctx, "Not on the shelf", "This series isn't on the shelf any more.");
    }
    ctx.mainNo = settings.folderIds.indexOf(main.id) + 1;
    const series = { ...found, ids };
    const listings = ids.map((id) => readListing_(services, settings, id, true, refresh));
    // One level of volume folders inside the series (scope change 2026-11-24), at most 40 and for
    // about 15 s, so a cold or refreshed series page can't run for a minute (review SF-A).
    const started = services.now();
    const allVolumeIds = volumeFolderIds(listings);
    const volumeListings = new Map();
    for (const id of allVolumeIds.slice(0, MAX_VOLUME_FOLDERS)) {
      if (services.now() - started > VOLUME_TIME_BUDGET_MS) break;
      volumeListings.set(id, readListing_(services, settings, id, false, refresh));
    }
    const dropped = allVolumeIds.length > volumeListings.size ? 1 : 0; // review SF-B
    const all = listings.concat([...volumeListings.values()]);
    return renderSeries({
      ...ctx,
      series,
      seriesId: params.s,
      volumes: listVolumes(listings, settings.maxBytes, volumeListings),
      truncated: all.filter((listing) => listing && listing.truncated).length + dropped,
    });
  }

  // The send check always reads the file and its parent folders fresh from Drive.
  const file = isDriveId(params.f) ? services.getFile(params.f) : null;
  const parents = parentFoldersOf_(services, settings, file);
  const check = checkSendable(file, settings.folderIds, settings.maxBytes, parents);
  if (!check.ok) return renderMessage(ctx, "Can't send this", problemText_(check.reason));
  ctx.seriesId = check.seriesId;
  ctx.mainNo = settings.folderIds.indexOf(check.mainId) + 1;

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
    try {
      recordSend(services.state, file.id, now, limits.count);
    } catch (error) {
      // The book is on its way; only its mark (or, at worst, the count) is missing (review SF-2).
      noteFailure_(services, settings, "sent, but couldn't record the send", error);
    }
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
var MAX_VOLUME_FOLDERS = 40;
var VOLUME_TIME_BUDGET_MS = 15 * 1000;

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
    // The folder's own name: a main folder's page and row show it (phase 5).
    name: String(listing.name || ""),
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

// Whether a series folder, read fresh from Drive, still sits directly in the main folder whose
// (maybe 30-minute-old) listing it came from. One moved to another main folder stops showing
// under the old one at once (phase 5 security review, note 3).
function stillOnShelf_(services, folderId, mainId) {
  const folder = services.getFolder(folderId);
  return Boolean(folder && !folder.trashed && (folder.parentIds || []).includes(mainId));
}

// The main folder ID at place m ("1", "2", ... from the URL) in FOLDER_ID, or null.
function mainIdAt_(settings, m) {
  if (typeof m !== "string" || !/^[1-9][0-9]?$/.test(m)) return null;
  return settings.folderIds.find((id, i) => i + 1 === Number(m)) || null;
}

// Every main folder (FOLDER_ID entry) with its listing, null if it couldn't be read.
function readMains_(services, settings, refresh) {
  return settings.folderIds.map((id) => ({
    id,
    listing: readListing_(services, settings, id, true, refresh),
  }));
}

// One main folder's page: its series and loose books, titled by its name. mainId is in FOLDER_ID.
function folderPage_(services, settings, ctx, mainId, refresh) {
  const listing = readListing_(services, settings, mainId, true, refresh);
  if (!listing) {
    return ctx.multi
      ? renderMessage(ctx, "Can't open this folder", "It couldn't be read. Try again later.")
      : renderFolders({ ...ctx, mains: [], unreadable: 1 });
  }
  // Only this folder is read; the others are given as unread so the name's place stays right.
  const [main] = mainFolders(
    settings.folderIds.map((id) => ({ id, listing: id === mainId ? listing : null })),
  );
  return renderShelf({ ...ctx, main, ...buildShelf([listing], settings.maxBytes) });
}

// The parent folders needed to place a file that isn't directly in a shelf folder (at most 5:
// Drive files have one parent nowadays).
// For a book in a volume folder, also the parents of those folders (the series folder). At most
// 5 + 5 lookups: Drive files and folders have one parent nowadays.
function parentFoldersOf_(services, settings, file) {
  if (!file || (file.parentIds || []).some((id) => settings.folderIds.includes(id))) return [];
  const shelfIds = settings.folderIds;
  const parents = parentsToCheck(file, shelfIds)
    .slice(0, 5)
    .map((id) => services.getFolder(id));
  const isSeries = (folder) =>
    folder && !folder.trashed && (folder.parentIds || []).some((id) => shelfIds.includes(id));
  if (parents.some(isSeries)) return parents;
  const grandparentIds = [
    ...new Set(parents.flatMap((folder) => parentsToCheck(folder, shelfIds))),
  ].slice(0, 5);
  return parents.concat(grandparentIds.map((id) => services.getFolder(id)));
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
      return { name: folder.getName(), folders, files, truncated };
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
    // Counted per main folder, as the pages show them (series never merge across folders).
    const shelves = listings.filter(Boolean).map((l) => buildShelf([l], settings.maxBytes));
    const count = (pick) => shelves.reduce((sum, shelf) => sum + pick(shelf).length, 0);
    console.log(
      "Shelf: " +
        count((s) => s.series) +
        " series, " +
        count((s) => s.loose) +
        " loose books in " +
        shelves.length +
        (shelves.length === 1 ? " folder." : " folders."),
    );
  }
  console.log("E-mails left today: " + services.remainingQuota());
  const usage = propertiesUsage(services.properties());
  console.log(
    "Sent marks: " +
      usage.marks +
      " books. Script Properties use about " +
      Math.ceil(usage.bytes / 1024) +
      " KB of " +
      PROPERTIES_MAX_BYTES / 1024 +
      " KB.",
  );
  if (usage.nearlyFull) {
    console.log(
      "Script Properties are nearly full: see docs/setup.md part L to remove old _sent: marks.",
    );
  }
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
