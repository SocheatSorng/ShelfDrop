// Builds the Send to Kindle e-mail and turns mail failures into plain words.

function buildBookMail(kindleEmail, book, blob) {
  return {
    to: kindleEmail,
    subject: book.name,
    body: "Sent by ShelfDrop.",
    name: "ShelfDrop",
    attachments: [blob],
  };
}

// The e-mail with the bookmarkable link (sent from the Apps Script editor by sendLinkToKindle).
// Send to Kindle turns the HTML file into a document; tapping the link opens the Kindle browser.
function buildLinkMail(kindleEmail, link, makeBlob) {
  const html =
    "<html><head><title>ShelfDrop link</title></head><body>" +
    "<h1>ShelfDrop</h1><p>Tap the link, then bookmark the page in the browser.</p>" +
    '<p><a href="' +
    escapeHtml(link) +
    '">Open my bookshelf</a></p></body></html>';
  return {
    to: kindleEmail,
    subject: "ShelfDrop link",
    body: "Sent by ShelfDrop.",
    name: "ShelfDrop",
    attachments: [makeBlob(html, "text/html", "ShelfDrop link.html")],
  };
}

// Replaces every secret in a text, so logs never hold the Kindle address or the token.
// Case-insensitive, because Gmail may print the address in a different case.
function redact(text, secrets) {
  let out = String(text === undefined || text === null ? "" : text);
  for (const secret of secrets) {
    if (!secret) continue;
    const needle = String(secret).toLowerCase();
    let at = out.toLowerCase().indexOf(needle);
    while (at !== -1) {
      out = out.slice(0, at) + "[hidden]" + out.slice(at + needle.length);
      at = out.toLowerCase().indexOf(needle, at + "[hidden]".length);
    }
  }
  return out;
}

// Gmail refuses a message whose attachments total more than 25 MB (measured in E6: 20 MB arrived,
// 36 MB was refused).
var GMAIL_MAX_BYTES = 25 * 1024 * 1024;

// What to tell the reader when MailApp throws. Decided from facts, never from the error text:
// Google words its errors in the account's language (E6 came back in Khmer).
function sendFailureText(bookSize, quotaLeft) {
  if (bookSize > GMAIL_MAX_BYTES) return "This book is too big to send by e-mail.";
  if (quotaLeft < 1) return "Today's e-mail limit is used up. Try again tomorrow.";
  return "The book couldn't be sent. Try again in a few minutes.";
}
