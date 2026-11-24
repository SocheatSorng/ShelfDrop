// HTML for the Kindle browser: plain server-rendered pages that work with no JavaScript.
// Every page returns { title, html }; Code.js wraps it in HtmlService. Every link and form targets
// the top window, because HtmlService serves the page inside a sandboxed iframe.

var PAGE_CSS = [
  "body{margin:0;background:#fff;color:#000;font-family:Georgia,serif;font-size:20px;line-height:1.4}",
  "main{padding:12px 16px}",
  "h1{font-size:26px;margin:0 0 12px}",
  "h2{font-size:22px;margin:20px 0 4px}",
  "ul{list-style:none;margin:0;padding:0}",
  "li{border-bottom:2px solid #000}",
  ".book{display:block;padding:14px 4px;min-height:48px;color:#000;text-decoration:none}",
  ".off{color:#444}",
  ".meta{display:block;font-size:16px;margin-top:4px}",
  "button{font:inherit;font-size:22px;width:100%;min-height:64px;margin:16px 0;background:#000;color:#fff;border:3px solid #000}",
  "a{color:#000}",
  ".back{display:inline-block;padding:12px 0;min-height:48px}",
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

function page(title, body) {
  return {
    title,
    html:
      "<style>" + PAGE_CSS + "</style><main><h1>" + escapeHtml(title) + "</h1>" + body + "</main>",
  };
}

// Back to the book's series when it has one (a checked folder ID), otherwise to the shelf.
function backLink(ctx) {
  const toSeries = Boolean(ctx.seriesId);
  const params = toSeries ? { t: ctx.token, s: ctx.seriesId } : { t: ctx.token };
  return (
    '<p><a class="back" target="_top" href="' +
    escapeHtml(appLink(ctx.appUrl, params)) +
    '">&larr; Back to the ' +
    (toSeries ? "series" : "shelf") +
    "</a></p>"
  );
}

// Reloads a listing from Drive instead of the cache, for a book that was just added.
function refreshLink(ctx, params) {
  return (
    '<p><a class="back" target="_top" href="' +
    escapeHtml(appLink(ctx.appUrl, { t: ctx.token, ...params, r: "1" })) +
    '">Refresh</a></p>'
  );
}

function bookMeta(book) {
  return book.kind.toUpperCase() + " &middot; " + escapeHtml(formatSize(book.size));
}

function bookItem(ctx, book) {
  if (book.tooBig) {
    return (
      '<li><span class="book off">' +
      escapeHtml(book.name) +
      '<span class="meta">' +
      bookMeta(book) +
      " &middot; too big to send</span></span></li>"
    );
  }
  return (
    '<li><a class="book" target="_top" href="' +
    escapeHtml(appLink(ctx.appUrl, { t: ctx.token, f: book.id })) +
    '">' +
    escapeHtml(book.name) +
    '<span class="meta">' +
    bookMeta(book) +
    "</span></a></li>"
  );
}

// The first page: series (linked by their first folder ID), then loose books.
function renderShelf(ctx) {
  const parts = [];
  if (ctx.unreadable) {
    parts.push(
      '<p class="note">' +
        ctx.unreadable +
        (ctx.unreadable === 1 ? " shelf folder" : " shelf folders") +
        " couldn&#39;t be read.</p>",
    );
  }
  if (ctx.series.length) {
    const items = ctx.series.map(
      (series) =>
        '<li><a class="book" target="_top" href="' +
        escapeHtml(appLink(ctx.appUrl, { t: ctx.token, s: series.ids[0] })) +
        '">' +
        escapeHtml(series.name) +
        "</a></li>",
    );
    parts.push("<ul>" + items.join("") + "</ul>");
  }
  if (ctx.loose.length) {
    parts.push(
      "<h2>Books</h2><ul>" + ctx.loose.map((book) => bookItem(ctx, book)).join("") + "</ul>",
    );
  }
  if (!ctx.series.length && !ctx.loose.length) {
    parts.push("<p>No series or books on the shelf yet.</p>");
  }
  parts.push(refreshLink(ctx, {}));
  return page("Bookshelf", parts.join(""));
}

// One series: its volumes in natural order.
function renderSeries(ctx) {
  const list = ctx.volumes.length
    ? "<ul>" + ctx.volumes.map((book) => bookItem(ctx, book)).join("") + "</ul>"
    : "<p>No books yet.</p>";
  return page(
    ctx.series.name,
    list + refreshLink(ctx, { s: ctx.seriesId }) + backLink({ ...ctx, seriesId: null }),
  );
}

// The confirm step: sending is a POST, so a browser preloading a link can never send a book.
function renderConfirm(ctx) {
  return page(
    "Send to Kindle?",
    '<p class="name">' +
      escapeHtml(ctx.book.name) +
      '<span class="meta">' +
      bookMeta(ctx.book) +
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
      '<button type="submit">Send to Kindle</button></form>' +
      backLink(ctx),
  );
}

function renderSent(ctx) {
  return page(
    "Sent",
    "<p>" +
      escapeHtml(ctx.book.name) +
      " is on its way. It should appear in your Kindle library in a minute or two.</p>" +
      backLink(ctx),
  );
}

function renderMessage(ctx, title, text) {
  return page(title, "<p>" + escapeHtml(text) + "</p>" + backLink(ctx));
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
