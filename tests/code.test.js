// Request handling end to end, with fake Drive, mail and properties (no Google calls).
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadSrc, plain } = require("./helpers/apps-script");

const MB = 1024 * 1024;
const TOKEN = "test-token-0123456789abcdefghijklmnop";
const KINDLE = "yourname@kindle.com";
const FOLDER = "folder-test-0001";
const URL = "https://script.google.com/macros/s/FAKE/exec";

const PROPS = { FOLDER_ID: FOLDER, KINDLE_EMAIL: KINDLE, ACCESS_TOKEN: TOKEN };

const FILES = {
  "vol-1-epub-id": { name: "Sample Series Vol 1.epub", size: 2 * MB, parentIds: [FOLDER] },
  "vol-10-pdf-id": { name: "Sample Series Vol 10.pdf", size: 5 * MB, parentIds: [FOLDER] },
  "vol-2-epub-id": { name: "Sample Series Vol 2.epub", size: 2 * MB, parentIds: [FOLDER] },
  "huge-pdf-id00": { name: "Huge Artbook.pdf", size: 40 * MB, parentIds: [FOLDER] },
  "sheet-xlsx-id": { name: "Budget.xlsx", size: MB, parentIds: [FOLDER] },
  "private-doc-id": { name: "Private.pdf", size: MB, parentIds: ["other-folder-01"] },
};

function fakeServices(overrides = {}) {
  const calls = { listFolder: 0, getFile: 0, sent: [], logs: [] };
  const services = {
    properties: () => ({ ...PROPS }),
    appUrl: () => URL,
    listFolder: (id) => {
      calls.listFolder++;
      return Object.entries(FILES)
        .filter(([, f]) => f.parentIds.includes(id))
        .map(([fid, f]) => ({ id: fid, trashed: false, ...f }));
    },
    getFile: (id) => {
      calls.getFile++;
      const f = Object.prototype.hasOwnProperty.call(FILES, id) ? FILES[id] : null;
      return f ? { id, trashed: false, ...f } : null;
    },
    getBlob: (id) => ({ blobOf: id }),
    sendMail: (message) => calls.sent.push(message),
    remainingQuota: () => 100,
    log: (text) => calls.logs.push(text),
    ...overrides,
  };
  return { services, calls };
}

const app = loadSrc();

function run(method, params, overrides) {
  const { services, calls } = fakeServices(overrides);
  const page = app.handleRequest({ method, params }, services);
  return { page, calls };
}

test("no token or a wrong token: not-found page, Drive is never read, nothing is sent", () => {
  for (const params of [{}, { t: "wrong" }, { t: TOKEN + "x", f: "vol-1-epub-id" }]) {
    for (const method of ["GET", "POST"]) {
      const { page, calls } = run(method, params);
      assert.equal(page.title, "Not found");
      assert.equal(calls.listFolder + calls.getFile, 0);
      assert.equal(calls.sent.length, 0);
    }
  }
});

test("an unset ACCESS_TOKEN locks everyone out, even with an empty t", () => {
  const { page } = run("GET", { t: "" }, { properties: () => ({ ...PROPS, ACCESS_TOKEN: "" }) });
  assert.equal(page.title, "Not found");
});

test("right token but other settings missing: setup page names them, shows no values", () => {
  const { page, calls } = run(
    "GET",
    { t: TOKEN },
    { properties: () => ({ ACCESS_TOKEN: TOKEN, KINDLE_EMAIL: "bad" }) },
  );
  assert.equal(page.title, "Setup needed");
  assert.ok(page.html.includes("FOLDER_ID") && page.html.includes("KINDLE_EMAIL"));
  assert.ok(!page.html.includes("bad<"));
  assert.equal(calls.listFolder, 0);
});

test("the list shows the folder's books in natural order, big ones not linked", () => {
  const { page } = run("GET", { t: TOKEN });
  assert.equal(page.title, "Books");
  const names = [...page.html.matchAll(/class="book[^"]*"[^>]*>([^<]+)</g)].map((m) => m[1]);
  assert.deepEqual(names, [
    "Huge Artbook.pdf",
    "Sample Series Vol 1.epub",
    "Sample Series Vol 2.epub",
    "Sample Series Vol 10.pdf",
  ]);
  assert.ok(!page.html.includes("Budget") && !page.html.includes("Private"));
  assert.ok(!page.html.includes("f=huge-pdf-id00"));
});

test("GET with a file shows the confirm page and sends nothing", () => {
  const { page, calls } = run("GET", { t: TOKEN, f: "vol-2-epub-id" });
  assert.equal(page.title, "Send to Kindle?");
  assert.equal(calls.sent.length, 0);
});

test("POST with a file sends exactly one e-mail with that book to the Kindle address", () => {
  const { page, calls } = run("POST", { t: TOKEN, f: "vol-2-epub-id" });
  assert.equal(page.title, "Sent");
  assert.deepEqual(plain(calls.sent), [
    {
      to: KINDLE,
      subject: "Sample Series Vol 2.epub",
      body: "Sent by ShelfDrop.",
      name: "ShelfDrop",
      attachments: [{ blobOf: "vol-2-epub-id" }],
    },
  ]);
  assert.deepEqual(calls.logs, ["sent file vol-2-epub-id"]);
});

test("files outside the shelf, non-books, too-big and unknown IDs are refused", () => {
  const cases = {
    "private-doc-id": "on the shelf any more",
    "sheet-xlsx-id": "Only EPUB and PDF",
    "huge-pdf-id00": "too big",
    "no-such-file-id": "on the shelf any more",
  };
  for (const [f, text] of Object.entries(cases)) {
    const { page, calls } = run("POST", { t: TOKEN, f });
    assert.equal(page.title, "Can't send this", f);
    assert.ok(page.html.includes(text), f);
    assert.equal(calls.sent.length, 0, f);
  }
});

test("a malformed file ID never reaches Drive", () => {
  for (const f of ["", "../../etc", "a".repeat(500), "id with spaces"]) {
    const { calls } = run("POST", { t: TOKEN, f });
    assert.equal(calls.getFile, 0, f);
    assert.equal(calls.sent.length, 0, f);
  }
});

test("no mail quota left: nothing is sent and the reader is told", () => {
  const { page, calls } = run(
    "POST",
    { t: TOKEN, f: "vol-1-epub-id" },
    { remainingQuota: () => 0 },
  );
  assert.equal(page.title, "Not sent");
  assert.ok(page.html.includes("limit"));
  assert.equal(calls.sent.length, 0);
});

test("a mail failure is logged without the Kindle address or token, and shown plainly", () => {
  const { page, calls } = run(
    "POST",
    { t: TOKEN, f: "vol-1-epub-id" },
    {
      sendMail: () => {
        throw new Error(`Failed to send to ${KINDLE} (token ${TOKEN})`);
      },
    },
  );
  assert.equal(page.title, "Not sent");
  assert.ok(!page.html.includes(KINDLE) && !page.html.includes("Failed to send"));
  assert.equal(calls.logs.length, 1);
  assert.ok(!calls.logs[0].includes(KINDLE) && !calls.logs[0].includes(TOKEN));
  assert.ok(calls.logs[0].includes("[hidden]"));
});

test("mail errors are mapped to plain words", () => {
  assert.match(app.sendFailureText(new Error("Service invoked too many times")), /limit/);
  assert.match(app.sendFailureText(new Error("Attachment too large")), /too big/);
  assert.match(app.sendFailureText(new Error("Something odd")), /couldn't be sent/);
  assert.match(app.sendFailureText(undefined), /couldn't be sent/);
});

test("the diag page needs the token too", () => {
  assert.equal(run("GET", { t: TOKEN, diag: "1" }).page.title, "Browser check");
  assert.equal(run("GET", { diag: "1" }).page.title, "Not found");
});

// The real entry points, with fake Apps Script services in the global scope.
function fakeGlobals({ props = PROPS, url = URL } = {}) {
  const out = { html: null, title: null, meta: [], sent: [], logs: [] };
  const htmlOutput = {
    setTitle(title) {
      out.title = title;
      return htmlOutput;
    },
    addMetaTag(name, content) {
      out.meta.push([name, content]);
      return htmlOutput;
    },
  };
  const iterator = (items) => {
    let i = 0;
    return { hasNext: () => i < items.length, next: () => items[i++] };
  };
  const driveFile = (id, f) => ({
    getId: () => id,
    getName: () => f.name,
    getSize: () => f.size,
    isTrashed: () => false,
    getParents: () => iterator(f.parentIds.map((pid) => ({ getId: () => pid }))),
    getBlob: () => ({ blobOf: id }),
  });
  const globals = {
    console: { log: (text) => out.logs.push(text) },
    HtmlService: {
      createHtmlOutput(html) {
        out.html = html;
        return htmlOutput;
      },
    },
    PropertiesService: { getScriptProperties: () => ({ getProperties: () => ({ ...props }) }) },
    ScriptApp: { getService: () => ({ getUrl: () => url }) },
    DriveApp: {
      getFolderById: (id) => ({
        getFiles: () =>
          iterator(
            Object.entries(FILES)
              .filter(([, f]) => f.parentIds.includes(id))
              .map(([fid, f]) => driveFile(fid, f)),
          ),
      }),
      getFileById: (id) => {
        if (!Object.prototype.hasOwnProperty.call(FILES, id)) throw new Error("No item");
        return driveFile(id, FILES[id]);
      },
    },
    MailApp: { sendEmail: (m) => out.sent.push(m), getRemainingDailyQuota: () => 99 },
    Utilities: { newBlob: (text, type, name) => ({ text, type, name }) },
  };
  return { globals, out };
}

test("doGet renders through HtmlService with a title and a viewport tag", () => {
  const { globals, out } = fakeGlobals();
  const ctx = loadSrc(globals);
  ctx.doGet({ parameter: { t: TOKEN } });
  assert.equal(out.title, "Books - ShelfDrop");
  assert.deepEqual(out.meta, [["viewport", "width=device-width, initial-scale=1"]]);
  assert.ok(out.html.includes("Sample Series Vol 10.pdf"));
});

test("doPost sends through MailApp; doGet without parameters is not found", () => {
  const { globals, out } = fakeGlobals();
  const ctx = loadSrc(globals);
  ctx.doPost({ parameter: { t: TOKEN, f: "vol-10-pdf-id" } });
  assert.equal(out.sent.length, 1);
  assert.equal(out.sent[0].to, KINDLE);
  ctx.doGet(undefined);
  assert.equal(out.title, "Not found - ShelfDrop");
});

test("a Drive lookup error (file not shared) is treated as not found", () => {
  const { globals, out } = fakeGlobals();
  const ctx = loadSrc(globals);
  ctx.doPost({ parameter: { t: TOKEN, f: "not-shared-file-id" } });
  assert.equal(out.sent.length, 0);
  assert.ok(out.html.includes("isn&#39;t on the shelf"));
});

test("checkSetup logs counts and names only, never the address or token", () => {
  const { globals, out } = fakeGlobals({ props: { ...PROPS, KINDLE_EMAIL: "" } });
  loadSrc(globals).checkSetup();
  const log = out.logs.join("\n");
  assert.match(log, /Missing or invalid Script Properties: KINDLE_EMAIL/);
  assert.match(log, /Books found in the folder: 4/);
  assert.ok(!log.includes(TOKEN));
});

test("sendLinkToKindle mails an HTML document with the private link", () => {
  const { globals, out } = fakeGlobals();
  loadSrc(globals).sendLinkToKindle();
  assert.equal(out.sent.length, 1);
  const [doc] = out.sent[0].attachments;
  assert.equal(doc.name, "ShelfDrop link.html");
  assert.equal(doc.type, "text/html");
  assert.ok(doc.text.includes(`href="${URL}?t=${TOKEN}"`));
  assert.ok(!out.logs.join("\n").includes(TOKEN));
});

test("sendLinkToKindle refuses until the web app is deployed (/exec URL)", () => {
  for (const url of [null, "https://script.google.com/macros/s/FAKE/dev"]) {
    const { globals, out } = fakeGlobals({ url });
    assert.throws(() => loadSrc(globals).sendLinkToKindle(), /Deploy the web app first/);
    assert.equal(out.sent.length, 0);
  }
});
