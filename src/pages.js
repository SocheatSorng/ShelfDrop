// HTML for the Kindle browser: plain server-rendered pages that work with no JavaScript.
// Every page returns { title, html }; Code.js wraps it in HtmlService. Every link and form targets
// the top window, because HtmlService serves the page inside a sandboxed iframe.

var PAGE_CSS = [
  "body{margin:0;background:#fff;color:#000;font-family:Georgia,serif;font-size:20px;line-height:1.4}",
  "main{padding:12px 16px}",
  "h1{font-size:26px;margin:0 0 12px}",
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

function backLink(ctx) {
  return (
    '<p><a class="back" target="_top" href="' +
    escapeHtml(appLink(ctx.appUrl, { t: ctx.token })) +
    '">&larr; Back to the books</a></p>'
  );
}

function bookMeta(book) {
  return book.kind.toUpperCase() + " &middot; " + escapeHtml(formatSize(book.size));
}

function renderList(ctx) {
  if (!ctx.books.length) return page("Books", "<p>No EPUB or PDF books in this folder.</p>");
  const items = ctx.books.map((book) => {
    if (book.tooBig) {
      return (
        '<li><span class="book off">' +
        escapeHtml(book.name) +
        '<span class="meta">' +
        bookMeta(book) +
        " &middot; too big to send</span></span></li>"
      );
    }
    const href = appLink(ctx.appUrl, { t: ctx.token, f: book.id });
    return (
      '<li><a class="book" target="_top" href="' +
      escapeHtml(href) +
      '">' +
      escapeHtml(book.name) +
      '<span class="meta">' +
      bookMeta(book) +
      "</span></a></li>"
    );
  });
  return page("Books", "<ul>" + items.join("") + "</ul>");
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

// Shown for a missing or wrong token: no links, no names, nothing about the app.
function renderNotFound() {
  return page("Not found", "<p>This page doesn't exist.</p>");
}

function renderSetupNeeded(problems) {
  return page(
    "Setup needed",
    "<p>These Script Properties are missing or invalid:</p><ul>" +
      problems.map((name) => '<li class="book">' + escapeHtml(name) + "</li>").join("") +
      "</ul>",
  );
}

// Spike only: records what the Kindle browser is and whether JavaScript runs inside the iframe.
function renderDiag(ctx) {
  return page(
    "Browser check",
    '<p>JavaScript: <b id="js">off</b></p>' +
      '<p>Browser: <span id="ua">unknown (needs JavaScript)</span></p>' +
      '<p>Page width: <span id="w">unknown</span></p>' +
      "<script>" +
      'document.getElementById("js").textContent="on";' +
      'document.getElementById("ua").textContent=navigator.userAgent;' +
      'document.getElementById("w").textContent=window.innerWidth+" x "+window.innerHeight;' +
      "</script>" +
      backLink(ctx),
  );
}
