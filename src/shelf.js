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
    .filter((file) => !file.trashed && bookKind(file.name))
    .map((file) => toBook(file, maxBytes))
    .sort((a, b) => compareNatural(a.name, b.name));
}

// Whether a requested file may be sent. A file outside the bookshelf answers "not-found", the same
// as a file that doesn't exist, so the page never confirms what else is in the owner's Drive.
function checkSendable(file, folderId, maxBytes) {
  if (!file || file.trashed || !(file.parentIds || []).includes(folderId)) {
    return { ok: false, reason: "not-found" };
  }
  if (!bookKind(file.name)) return { ok: false, reason: "not-a-book" };
  if (!(file.size <= maxBytes)) return { ok: false, reason: "too-big" };
  return { ok: true, book: toBook(file, maxBytes) };
}

function formatSize(bytes) {
  const mb = (Number(bytes) || 0) / (1024 * 1024);
  if (mb < 0.1) return "0.1 MB";
  return (mb < 10 ? mb.toFixed(1) : String(Math.round(mb))) + " MB";
}
