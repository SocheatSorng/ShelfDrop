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

// label is what the row shows: the file name, or the volume folder's name for a book in a volume
// folder (owner's choice, 2026-11-24).
function toBook(file, maxBytes, label) {
  return {
    id: file.id,
    name: file.name,
    label: label || file.name,
    kind: bookKind(file.name),
    size: file.size,
    tooBig: !(file.size <= maxBytes),
  };
}

// The books in a folder listing: EPUB/PDF only, not trashed, in natural order of their labels.
// label, if given, labels every book (the volume folder's name).
function listBooks(files, maxBytes, label) {
  return (files || [])
    .filter((file) => !file.trashed && isBookFile(file))
    .map((file) => toBook(file, maxBytes, label))
    .sort(compareBooks);
}

function compareBooks(a, b) {
  return compareNatural(a.label, b.label) || compareNatural(a.name, b.name);
}

function folderLabel(folder) {
  return String(folder.name || "").trim() || "(no name)";
}

// Where a file sits on the shelf, with every link checked against folders read fresh from Drive
// (never from the URL). mainId is the shelf folder (main folder) it is under:
//   { mainId, seriesId: null }         a loose book directly in a shelf folder
//   { mainId, seriesId }               a book directly in a series folder (parent is a shelf folder)
//   { mainId, seriesId, label }        a book in a volume folder (parent is a series folder)
//   null                               anywhere else, deeper, trashed, or a folder couldn't be read
function locateFile(file, shelfIds, folders) {
  if (!file || file.trashed) return null;
  const parents = file.parentIds || [];
  const shelfParent = (item) => (item.parentIds || []).find((id) => shelfIds.includes(id));
  const loose = shelfParent(file);
  if (loose) return { mainId: loose, seriesId: null };
  const known = (folders || []).filter((folder) => folder && !folder.trashed);
  const byId = (id) => known.find((folder) => folder.id === id);
  const isSeries = (folder) => Boolean(shelfParent(folder));
  const parentFolders = parents.map(byId).filter(Boolean);
  const series = parentFolders.find(isSeries);
  if (series) return { mainId: shelfParent(series), seriesId: series.id };
  for (const volume of parentFolders) {
    const owner = (volume.parentIds || []).map(byId).find((folder) => folder && isSeries(folder));
    if (owner)
      return { mainId: shelfParent(owner), seriesId: owner.id, label: folderLabel(volume) };
  }
  return null;
}

// The parent folders Code.js must read to place a file or folder: those that aren't shelf folders.
function parentsToCheck(item, shelfIds) {
  return item ? (item.parentIds || []).filter((id) => !shelfIds.includes(id)) : [];
}

// Whether a requested file may be sent. A file outside the bookshelf answers "not-found", the same
// as a file that doesn't exist, so the page never confirms what else is in the owner's Drive.
function checkSendable(file, shelfIds, maxBytes, folders) {
  const where = locateFile(file, shelfIds, folders);
  if (!where) return { ok: false, reason: "not-found" };
  if (!isBookFile(file)) return { ok: false, reason: "not-a-book" };
  if (!(file.size <= maxBytes)) return { ok: false, reason: "too-big" };
  return {
    ok: true,
    book: toBook(file, maxBytes, where.label),
    seriesId: where.seriesId,
    mainId: where.mainId,
  };
}

// The main folders are the folders in FOLDER_ID. mains is [{ id, listing }] in FOLDER_ID order,
// listing null when the folder couldn't be read.

// The rows of the first page, in FOLDER_ID order so the owner chooses it: [{ id, n, name }], n
// being the folder's place in FOLDER_ID (1, 2, ...), which links use instead of the ID (a setting
// never shown in a page, phase 3). Each is
// its own row, even with the same name as another (owner's decision, 2026-11-24). A folder that
// couldn't be read is left out (the page counts it). A listing without a name (cached before
// names were kept, or blank) shows its place in FOLDER_ID.
function mainFolders(mains) {
  return (mains || [])
    .map((main, i) => {
      if (!main.listing) return null;
      const name = String(main.listing.name || "").trim();
      return { id: main.id, n: i + 1, name: name || "Folder " + (i + 1) };
    })
    .filter(Boolean);
}

// The main folder whose listing has this series folder, or null. Only an ID a listing itself
// produced is ever used (review N6).
function findMainOfSeries(mains, seriesId) {
  if (typeof seriesId !== "string" || !seriesId) return null;
  return (
    (mains || []).find(
      (main) =>
        main.listing &&
        (main.listing.folders || []).some((folder) => folder.id === seriesId && !folder.trashed),
    ) || null
  );
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
// couldn't be read): { series: [{ name, ids }], loose: books, unreadable: count, truncated: count
// of listings cut short at the size limit }.
function buildShelf(listings, maxBytes) {
  const byKey = new Map();
  const files = [];
  let unreadable = 0;
  let truncated = 0;
  for (const listing of listings || []) {
    if (!listing) {
      unreadable++;
      continue;
    }
    for (const folder of listing.folders || []) {
      if (folder.trashed) continue;
      const key = seriesKey(folder.name);
      if (!byKey.has(key)) {
        byKey.set(key, { name: folderLabel(folder), ids: [] });
      }
      byKey.get(key).ids.push(folder.id);
    }
    files.push(...(listing.files || []));
    if (listing.truncated) truncated++;
  }
  const series = [...byKey.values()].sort((a, b) => compareNatural(a.name, b.name));
  return { series, loose: listBooks(files, maxBytes), unreadable, truncated };
}

// The series holding a folder ID from the URL, only if the shelf listing itself has that ID.
function findSeries(shelf, folderId) {
  if (typeof folderId !== "string" || !folderId) return null;
  return shelf.series.find((series) => series.ids.includes(folderId)) || null;
}

// A series' volumes: the books directly in its folders, plus the books directly in each volume
// folder (a folder inside a series folder), labelled with that folder's name. volumeListings is a
// Map from a volume folder ID to its listing (null if it couldn't be read). Deeper is ignored.
function listVolumes(listings, maxBytes, volumeListings) {
  const books = [];
  for (const listing of listings || []) {
    if (!listing) continue;
    books.push(...listBooks(listing.files, maxBytes));
    for (const folder of listing.folders || []) {
      if (folder.trashed || !volumeListings) continue;
      const volume = volumeListings.get(folder.id);
      if (volume) books.push(...listBooks(volume.files, maxBytes, folderLabel(folder)));
    }
  }
  return books.sort(compareBooks);
}

// The volume folders whose listings a series page needs.
function volumeFolderIds(listings) {
  return (listings || []).flatMap((listing) =>
    ((listing && listing.folders) || []).filter((folder) => !folder.trashed).map((f) => f.id),
  );
}

function formatSize(bytes) {
  const mb = (Number(bytes) || 0) / (1024 * 1024);
  if (mb < 0.1) return "0.1 MB";
  return (mb < 10 ? mb.toFixed(1) : String(Math.round(mb))) + " MB";
}
