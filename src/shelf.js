// Pure bookshelf logic. Files are plain objects made by the Drive adapter in Code.js:
//   { id, name, size, trashed, parentIds }

// "epub" or "pdf" for a supported book, otherwise null.
function bookKind(name) {
  const match = /\.(epub|pdf)$/i.exec(String(name || ""));
  return match ? match[1].toLowerCase() : null;
}

// Natural order: "Vol 2" before "Vol 10", case-insensitive.
function compareNatural(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

// A real book file: EPUB/PDF by name, not empty, and not a Google Doc, Sheet, shortcut or folder
// that merely has a ".pdf" name (Drive would convert a Doc to PDF on download, and its size is 0,
// which would get past the size limit).
function isBookFile(file) {
  return (
    Boolean(bookKind(file.name)) &&
    file.size > 0 &&
    !String(file.mimeType || "").startsWith("application/vnd.google-apps.")
  );
}

function toBook(file, maxBytes) {
  return {
    id: file.id,
    name: file.name,
    kind: bookKind(file.name),
    size: file.size,
    tooBig: !(file.size <= maxBytes),
  };
}

// The books in a folder listing: EPUB/PDF only, not trashed, in natural order.
function listBooks(files, maxBytes) {
  return (files || [])
    .filter((file) => !file.trashed && isBookFile(file))
    .map((file) => toBook(file, maxBytes))
    .sort((a, b) => compareNatural(a.name, b.name));
}

// Where a file sits on the shelf: { seriesId: null } for a loose book in a shelf folder,
// { seriesId } for a volume in a series folder (a folder whose parent is a shelf folder), or null.
// parentFolders are the file's parent folders as read fresh from Drive, never from the URL.
function locateFile(file, shelfIds, parentFolders) {
  if (!file || file.trashed) return null;
  const parents = file.parentIds || [];
  if (parents.some((id) => shelfIds.includes(id))) return { seriesId: null };
  const series = (parentFolders || []).find(
    (folder) =>
      folder &&
      !folder.trashed &&
      parents.includes(folder.id) &&
      (folder.parentIds || []).some((id) => shelfIds.includes(id)),
  );
  return series ? { seriesId: series.id } : null;
}

// The parent folders Code.js must read to place a file: those that aren't shelf folders.
function parentsToCheck(file, shelfIds) {
  return file ? (file.parentIds || []).filter((id) => !shelfIds.includes(id)) : [];
}

// Whether a requested file may be sent. A file outside the bookshelf answers "not-found", the same
// as a file that doesn't exist, so the page never confirms what else is in the owner's Drive.
function checkSendable(file, shelfIds, maxBytes, parentFolders) {
  const where = locateFile(file, shelfIds, parentFolders);
  if (!where) return { ok: false, reason: "not-found" };
  if (!isBookFile(file)) return { ok: false, reason: "not-a-book" };
  if (!(file.size <= maxBytes)) return { ok: false, reason: "too-big" };
  return { ok: true, book: toBook(file, maxBytes), seriesId: where.seriesId };
}

// Series names match ignoring case and extra spaces, so "Isekai Tales" in one account and
// "isekai tales" in another are one series.
function seriesKey(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

// The shelf from the listings of each shelf folder ({ folders, files }, or null when a folder
// couldn't be read): { series: [{ name, ids }], loose: books, unreadable: count }.
function buildShelf(listings, maxBytes) {
  const byKey = new Map();
  const files = [];
  let unreadable = 0;
  for (const listing of listings || []) {
    if (!listing) {
      unreadable++;
      continue;
    }
    for (const folder of listing.folders || []) {
      if (folder.trashed) continue;
      const key = seriesKey(folder.name);
      if (!byKey.has(key)) byKey.set(key, { name: String(folder.name).trim(), ids: [] });
      byKey.get(key).ids.push(folder.id);
    }
    files.push(...(listing.files || []));
  }
  const series = [...byKey.values()].sort((a, b) => compareNatural(a.name, b.name));
  return { series, loose: listBooks(files, maxBytes), unreadable };
}

// The series holding a folder ID from the URL, only if the shelf listing itself has that ID.
function findSeries(shelf, folderId) {
  if (typeof folderId !== "string" || !folderId) return null;
  return shelf.series.find((series) => series.ids.includes(folderId)) || null;
}

// A series' volumes from the listings of all its folders (folders inside a series are ignored).
function listVolumes(listings, maxBytes) {
  return listBooks(
    (listings || []).flatMap((listing) => (listing && listing.files) || []),
    maxBytes,
  );
}

function formatSize(bytes) {
  const mb = (Number(bytes) || 0) / (1024 * 1024);
  if (mb < 0.1) return "0.1 MB";
  return (mb < 10 ? mb.toFixed(1) : String(Math.round(mb))) + " MB";
}
