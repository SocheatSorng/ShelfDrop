// HTML for the Kindle browser: plain server-rendered pages that work with no JavaScript.
// Every page returns { title, html }; Code.js wraps it in HtmlService. Every link and form targets
// the top window, because HtmlService serves the page inside a sandboxed iframe.

// Sizes are in rem so the Kindle's own text-size setting scales the page; 1rem = 16px at default.
// Every tap target is at least 3rem (48px) tall. Black on white only, with one dark grey (#333)
// for books too big to send, which stays dark enough on e-ink and when Kindle dark mode inverts it.
var PAGE_CSS = [
  "*{box-sizing:border-box}",
  "body{margin:0;background:#fff;color:#000;font-family:Georgia,serif;font-size:1.25rem;line-height:1.4}",
  "main{padding:0 1rem 1rem}",
  "a{color:#000}",
  ".bar{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #000;margin-bottom:.5rem}",
  ".bar a{display:block;min-height:3rem;padding:.6rem 0;font-weight:bold}",
  ".bar a+a{margin-left:1rem}",
  ".head{display:flex;align-items:center;justify-content:space-between}",
  ".head a{display:block;min-height:3rem;padding:.6rem 0 .6rem 1rem;font-weight:bold}",
  "h1{font-size:1.6rem;line-height:1.25;margin:.5rem 0}",
  "h2{font-size:1.4rem;margin:1.5rem 0 .25rem}",
  "p{margin:.75rem 0}",
  ".note{border:2px solid #000;padding:.5rem .75rem}",
  "ul{list-style:none;margin:0;padding:0;border-top:2px solid #000}",
  "li{position:relative;border-bottom:2px solid #000}",
  ".book{display:flex;flex-direction:column;justify-content:center;min-height:3.5rem;padding:.65rem 2.25rem .65rem .25rem;color:#000;text-decoration:none}",
  // Rows that open another list (a main folder, a series) are bold, and a gap splits them from the
  // book rows below them, so in one merged list a reader can tell "opens a page" from "sends a book".
  ".dir .book{font-weight:bold}",
  ".dir+li:not(.dir){margin-top:1rem;border-top:2px solid #000}",
  "a.book:after{content:'\\203A';position:absolute;right:.5rem;top:50%;margin-top:-1rem;font-size:2rem;line-height:2rem;font-weight:bold}",
  ".off{color:#333}",
  ".off .meta{font-style:italic}",
  ".meta{display:block;font-size:1.125rem}",
  ".name{font-size:1.4rem;font-weight:bold}",
  ".name .meta{font-weight:normal}",
  // The sent mark is bold so sent volumes stand out when scanning, and never splits over two lines.
  ".sent{font-weight:bold;font-style:normal;white-space:nowrap}",
  ".end{margin:.5rem 0 0}",
  ".end a{display:inline-block;min-height:3rem;padding:.6rem 0;font-weight:bold}",
  "button{font:inherit;font-weight:bold;font-size:1.4rem;width:100%;min-height:4rem;margin:1rem 0;background:#000;color:#fff;border:3px solid #000}",
].join("");

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// A link back to this web app with the given query parameters (values are URL-encoded).
function appLink(appUrl, params) {
  const query = Object.entries(params)
    .map(([key, value]) => encodeURIComponent(key) + "=" + encodeURIComponent(value))
    .join("&");
  return appUrl + (query ? "?" + query : "");
}

// nav.back and nav.refresh are links (or empty). With a back link, both sit in a bar above the
// title, so going back never needs a scroll past a long list; without one, Refresh sits beside
// the title to save a row of the 647px Kindle screen.
function page(title, body, nav = {}) {
  const h1 = "<h1>" + escapeHtml(title) + "</h1>";
  let top = h1;
  if (nav.back) {
    top = '<nav class="bar">' + nav.back + (nav.refresh || "") + "</nav>" + h1;
  } else if (nav.refresh) {
    top = '<div class="head">' + h1 + nav.refresh + "</div>";
  }
  return {
    title,
    html: "<style>" + PAGE_CSS + "</style><main>" + top + body + "</main>",
  };
}

// The link parameters of a main folder's page, by its place n in FOLDER_ID (never its ID). With one
// main folder (ctx.multi false) that page is the first page, so it needs none.
function folderParams(ctx, n) {
  return ctx.multi ? { t: ctx.token, m: String(n) } : { t: ctx.token };
}

// Back to the book's series when it has one (a checked folder ID), else to its main folder
// (ctx.mainNo, from the send check or the series lookup, never the URL), else to the first page.
function backLink(ctx) {
  let params = { t: ctx.token };
  let to = "shelf";
  if (ctx.seriesId) {
    params = { t: ctx.token, s: ctx.seriesId };
    to = "series";
  } else if (ctx.mainNo) {
    params = folderParams(ctx, ctx.mainNo);
    to = "folder";
  }
  return (
    '<a target="_top" href="' +
    escapeHtml(appLink(ctx.appUrl, params)) +
    '">&larr; Back to the ' +
    to +
    "</a>"
  );
}

// Reloads a listing from Drive instead of the cache, for a book that was just added.
function refreshLink(ctx, params) {
  return (
    '<a target="_top" href="' +
    escapeHtml(appLink(ctx.appUrl, { t: ctx.token, ...params, r: "1" })) +
    '">Refresh</a>'
  );
}

// The row's text: the volume folder's name for a book in a volume folder, else the file name.
function bookLabel(book) {
  return escapeHtml(book.label || book.name);
}

// Type and size, led by the file name when the row shows a volume folder's name instead, and
// followed by "✓ sent 24 Nov" if the book was sent before.
function bookMeta(book, ctx) {
  const file = book.label && book.label !== book.name ? escapeHtml(book.name) + " &middot; " : "";
  return (
    file +
    book.kind.toUpperCase() +
    " &middot; " +
    // A no-break space keeps "3.4 MB" on one line when a long meta line wraps.
    escapeHtml(formatSize(book.size)).replace(" ", "&nbsp;") +
    sentMark(ctx, book)
  );
}

// The last send, in Cambodia time (phase 3 decision). Nothing for a book never sent.
function sentMark(ctx, book) {
  const ms = ctx && ctx.sent && ctx.sent.get(book.id);
  return ms
    ? ' &middot; <span class="sent">&#10003; sent ' +
        escapeHtml(formatSentDate(ms, ctx.now)) +
        "</span>"
    : "";
}

function bookItem(ctx, book) {
  if (book.tooBig) {
    return (
      '<li><span class="book off">' +
      bookLabel(book) +
      '<span class="meta">' +
      bookMeta(book, ctx) +
      " &middot; too big to send</span></span></li>"
    );
  }
  return (
    '<li><a class="book" target="_top" href="' +
    escapeHtml(appLink(ctx.appUrl, { t: ctx.token, f: book.id })) +
    '">' +
    bookLabel(book) +
    '<span class="meta">' +
    bookMeta(book, ctx) +
    "</span></a></li>"
  );
}

// Shown when a folder listing stopped at its size limit (review SF2). No folder ID is shown.
function truncatedNote(ctx) {
  return ctx.truncated
    ? '<p class="note">Some books aren&#39;t shown: a folder holds too many files.</p>'
    : "";
}

// A list row linking to another page of the app.
function linkItem(ctx, params, name) {
  return (
    '<li class="dir"><a class="book" target="_top" href="' +
    escapeHtml(appLink(ctx.appUrl, { t: ctx.token, ...params })) +
    '">' +
    escapeHtml(name) +
    "</a></li>"
  );
}

// The first page with two or more main folders (phase 5): one row per folder in FOLDER_ID, by its
// own name, in FOLDER_ID order. No folder ID is shown as text.
function renderFolders(ctx) {
  const parts = [];
  if (ctx.unreadable) {
    parts.push(
      '<p class="note">' +
        ctx.unreadable +
        (ctx.unreadable === 1 ? " shelf folder" : " shelf folders") +
        " couldn&#39;t be read.</p>",
    );
  }
  if (ctx.mains.length) {
    parts.push(
      "<ul>" +
        ctx.mains.map((main) => linkItem(ctx, { m: String(main.n) }, main.name)).join("") +
        "</ul>",
    );
  } else {
    parts.push("<p>No shelf folders could be read.</p>");
  }
  // The tab says just "ShelfDrop", not "ShelfDrop - ShelfDrop".
  return {
    ...page("ShelfDrop", parts.join(""), { refresh: refreshLink(ctx, {}) }),
    windowTitle: "ShelfDrop",
  };
}

// A main folder's page, titled by the folder's name: its series (linked by their first folder ID),
// then its loose books. With one main folder this is the first page, with nothing to go back to.
function renderShelf(ctx) {
  const parts = [truncatedNote(ctx)];
  const items = ctx.series
    .map((series) => linkItem(ctx, { s: series.ids[0] }, series.name))
    .concat(ctx.loose.map((book) => bookItem(ctx, book)));
  parts.push(
    items.length
      ? "<ul>" + items.join("") + "</ul>"
      : "<p>No series or books in this folder yet.</p>",
  );
  return page(ctx.main.name, parts.join(""), {
    back: ctx.multi ? backLink({ appUrl: ctx.appUrl, token: ctx.token }) : "",
    refresh: refreshLink(ctx, ctx.multi ? { m: String(ctx.main.n) } : {}),
  });
}

// One series: its volumes in natural order.
function renderSeries(ctx) {
  const list = ctx.volumes.length
    ? "<ul>" + ctx.volumes.map((book) => bookItem(ctx, book)).join("") + "</ul>"
    : "<p>No books yet.</p>";
  // A long list also gets Back at its end, for a reader who scrolled to the last volume.
  const end =
    ctx.volumes.length > 5 ? '<p class="end">' + backLink({ ...ctx, seriesId: null }) + "</p>" : "";
  return page(ctx.series.name, truncatedNote(ctx) + list + end, {
    back: backLink({ ...ctx, seriesId: null }),
    refresh: refreshLink(ctx, { s: ctx.seriesId }),
  });
}

// The confirm step: sending is a POST, so a browser preloading a link can never send a book.
function renderConfirm(ctx) {
  return page(
    "Send to Kindle?",
    '<p class="name">' +
      bookLabel(ctx.book) +
      '<span class="meta">' +
      bookMeta(ctx.book, ctx) +
      "</span></p>" +
      '<form method="post" target="_top" action="' +
      escapeHtml(ctx.appUrl) +
      '">' +
      '<input type="hidden" name="t" value="' +
      escapeHtml(ctx.token) +
      '">' +
      '<input type="hidden" name="f" value="' +
      escapeHtml(ctx.book.id) +
      '">' +
      '<button type="submit">Send to Kindle</button></form>',
    { back: backLink(ctx) },
  );
}

function renderSent(ctx) {
  return page(
    "Sent",
    "<p>" +
      escapeHtml(ctx.book.name) +
      " is on its way. It should appear in your Kindle library in a minute or two.</p>",
    { back: backLink(ctx) },
  );
}

function renderMessage(ctx, title, text) {
  return page(title, "<p>" + escapeHtml(text) + "</p>", { back: backLink(ctx) });
}

// Shown when something unexpected failed after the token was checked. Links nowhere, because
// even the app's own URL may be what failed.
function renderError() {
  return page("Something went wrong", "<p>Try again in a few minutes.</p>");
}

// Shown for a missing or wrong token: no links, no names, nothing about the app.
// The browser tab says just "Not found", without the app's name.
function renderNotFound() {
  return { ...page("Not found", "<p>This page doesn't exist.</p>"), windowTitle: "Not found" };
}

function renderSetupNeeded(problems) {
  return page(
    "Setup needed",
    "<p>These Script Properties are missing or invalid:</p><ul>" +
      problems.map((name) => '<li class="book">' + escapeHtml(name) + "</li>").join("") +
      "</ul>",
  );
}
