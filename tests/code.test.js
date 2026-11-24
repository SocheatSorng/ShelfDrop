// Request handling end to end, with fake Drive, mail and properties (no Google calls).
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadSrc, plain } = require("./helpers/apps-script");

const MB = 1024 * 1024;
const TOKEN = "test-token-0123456789abcdefghijklmnop";
const KINDLE = "yourname@kindle.com";
const FOLDER = "folder-test-0001";
const FOLDER_B = "folder-test-0002"; // a second account's shelf folder
const URL = "https://script.google.com/macros/s/" + "AKfy" + "cb" + "x".repeat(40) + "/exec";
const DEV_URL = "https://script.google.com/macros/s/" + "AKfy" + "cb" + "d".repeat(40) + "/dev";

const PROPS = {
  FOLDER_ID: FOLDER + "," + FOLDER_B,
  KINDLE_EMAIL: KINDLE,
  ACCESS_TOKEN: TOKEN,
  WEB_APP_URL: URL,
};

const FILES = {
  "vol-1-epub-id": { name: "Sample Series Vol 1.epub", size: 2 * MB, parentIds: [FOLDER] },
  "vol-10-pdf-id": { name: "Sample Series Vol 10.pdf", size: 5 * MB, parentIds: [FOLDER] },
  "vol-2-epub-id": { name: "Sample Series Vol 2.epub", size: 2 * MB, parentIds: [FOLDER] },
  "huge-pdf-id00": { name: "Huge Artbook.pdf", size: 40 * MB, parentIds: [FOLDER] },
  "sheet-xlsx-id": { name: "Budget.xlsx", size: MB, parentIds: [FOLDER] },
  "private-doc-id": { name: "Private.pdf", size: MB, parentIds: ["other-folder-01"] },
  "b-loose-id-01": { name: "Another Account Book.epub", size: MB, parentIds: [FOLDER_B] },
  "tales-3-id-001": { name: "Tales Vol 3.epub", size: MB, parentIds: ["ser-tales-a01"] },
  "tales-12-id-01": { name: "Tales Vol 12.pdf", size: MB, parentIds: ["ser-tales-b01"] },
  "tales-x-id-001": { name: "Tales Artbook.pdf", size: MB, parentIds: ["ser-extras-01"] },
  "tales-5-id-001": { name: "scan_005.epub", size: MB, parentIds: ["vol-tales-05"] },
  "other-1-id-001": { name: "Other 1.epub", size: MB, parentIds: ["ser-other-b01"] },
  "private-2-id01": { name: "Private 2.epub", size: MB, parentIds: ["not-shelf-sub1"] },
};

// Series folders: "Tales" exists in both accounts and has a volume folder "Volume 5"; "Extras" sits
// inside that volume folder (three levels down, ignored);
// "not-shelf-sub1" is a subfolder of a folder that isn't on the shelf.
const FOLDERS = {
  [FOLDER]: { name: "Light Novels", parentIds: ["my-drive-root1"] },
  [FOLDER_B]: { name: "Manga", parentIds: ["my-drive-root2"] },
  "ser-tales-a01": { name: "Tales", parentIds: [FOLDER] },
  "ser-tales-b01": { name: "tales", parentIds: [FOLDER_B] },
  "ser-other-b01": { name: "Other Series", parentIds: [FOLDER_B] },
  "vol-tales-05": { name: "Volume 5", parentIds: ["ser-tales-a01"] }, // a volume folder
  "ser-extras-01": { name: "Extras", parentIds: ["vol-tales-05"] }, // three levels down
  "not-shelf-sub1": { name: "Private stuff", parentIds: ["other-folder-01"] },
};

function has(map, id) {
  return Object.prototype.hasOwnProperty.call(map, id);
}

function listingOf(id) {
  if (!has(FOLDERS, id)) throw new Error("No item with the given ID could be found");
  return {
    name: FOLDERS[id].name,
    folders: Object.entries(FOLDERS)
      .filter(([, f]) => f.parentIds.includes(id))
      .map(([fid, f]) => ({ id: fid, name: f.name, trashed: false })),
    files: Object.entries(FILES)
      .filter(([, f]) => f.parentIds.includes(id))
      .map(([fid, f]) => ({ id: fid, trashed: false, ...f })),
  };
}

// An in-memory stand-in for Script Properties used as state.
function memoryState(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get: (key) => (map.has(key) ? map.get(key) : null),
    set: (key, value) => map.set(key, value),
    keys: () => [...map.keys()],
    remove: (key) => map.delete(key),
  };
}

const NOW = Date.UTC(2026, 10, 24, 12, 0, 0);

function fakeServices(overrides = {}) {
  const calls = { listFolder: 0, getFile: 0, getFolder: 0, sent: [], logs: [], locks: 0 };
  const services = {
    properties: () => ({ ...PROPS }),
    listFolder: (id) => {
      calls.listFolder++;
      return listingOf(id);
    },
    getFolder: (id) => {
      calls.getFolder++;
      return has(FOLDERS, id) ? { id, trashed: false, ...FOLDERS[id] } : null;
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
    now: () => NOW,
    withLock: (fn) => {
      calls.locks++;
      return fn();
    },
    state: memoryState(),
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

// Phase 5: the first page lists the main folders (FOLDER_ID) by name, linked by their place in
// FOLDER_ID; each folder's page shows its own series, then its loose books, big ones not linked.
test("the first page lists the main folders; each folder page shows its series, then its books", () => {
  const names = (html) => [...html.matchAll(/class="book[^"]*"[^>]*>([^<]+)</g)].map((m) => m[1]);
  const { page } = run("GET", { t: TOKEN });
  assert.equal(page.title, "ShelfDrop");
  assert.deepEqual(names(page.html), ["Light Novels", "Manga"]);
  assert.ok(page.html.includes('href="' + URL + "?t=" + TOKEN + '&amp;m=1">Light Novels</a>'));
  assert.ok(page.html.includes('href="' + URL + "?t=" + TOKEN + '&amp;m=2">Manga</a>'));
  const first = run("GET", { t: TOKEN, m: "1" }).page;
  assert.equal(first.title, "Light Novels");
  assert.deepEqual(names(first.html), [
    "Tales",
    "Huge Artbook.pdf",
    "Sample Series Vol 1.epub",
    "Sample Series Vol 2.epub",
    "Sample Series Vol 10.pdf",
  ]);
  assert.ok(!first.html.includes("Budget") && !first.html.includes("Private"));
  assert.ok(!first.html.includes("f=huge-pdf-id00"));
  const second = run("GET", { t: TOKEN, m: "2" }).page;
  assert.equal(second.title, "Manga");
  assert.deepEqual(names(second.html), ["Other Series", "tales", "Another Account Book.epub"]);
});

test("a folder page is chosen only by a place in FOLDER_ID, never by an ID from the URL", () => {
  for (const m of ["0", "3", "01", "1 ", "-1", "1e0", FOLDER, "", "99"]) {
    const { page, calls } = run("GET", { t: TOKEN, m });
    assert.equal(page.title, "Not on the shelf", JSON.stringify(m));
    assert.equal(calls.listFolder, 0, JSON.stringify(m));
  }
});

test("with one main folder the first page is that folder's page, with no way back", () => {
  const one = () => ({ ...PROPS, FOLDER_ID: FOLDER });
  const { page } = run("GET", { t: TOKEN }, { properties: one });
  assert.equal(page.title, "Light Novels");
  assert.ok(page.html.includes(">Tales<") && !page.html.includes("Back to"));
  assert.ok(page.html.includes('href="' + URL + "?t=" + TOKEN + '&amp;r=1">Refresh</a>'));
  const series = run("GET", { t: TOKEN, s: "ser-tales-a01" }, { properties: one }).page;
  assert.ok(
    series.html.includes('href="' + URL + "?t=" + TOKEN + '">&larr; Back to the folder</a>'),
  );
  const dead = run(
    "GET",
    { t: TOKEN },
    {
      properties: one,
      listFolder: () => {
        throw new Error("Access denied");
      },
    },
  ).page;
  assert.equal(dead.title, "ShelfDrop");
  assert.ok(dead.html.includes("1 shelf folder couldn&#39;t be read"));
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

test("mail failures are explained from the file size and quota, not the error text", () => {
  const MB = 1024 * 1024;
  assert.match(app.sendFailureText(36 * MB, 90), /too big/);
  assert.match(app.sendFailureText(2 * MB, 0), /limit is used up/);
  assert.match(app.sendFailureText(2 * MB, 90), /couldn't be sent/);
  assert.match(app.sendFailureText(25 * MB, 90), /couldn't be sent/);
});

// Bug found in E6: Gmail's refusal of a 36 MB file came back in Khmer, so matching English words
// in the error text showed "try again" for a file that can never be sent.
test("a Gmail refusal in any language is explained correctly", () => {
  const khmer = "ហួសដែនកំណត់";
  const quotaGone = run(
    "POST",
    { t: TOKEN, f: "vol-1-epub-id" },
    {
      remainingQuota: (() => {
        let calls = 0;
        return () => (calls++ === 0 ? 5 : 0); // quota ran out between the check and the send
      })(),
      sendMail: () => {
        throw new Error(khmer);
      },
    },
  );
  assert.ok(quotaGone.page.html.includes("limit is used up"));
  const unknown = run(
    "POST",
    { t: TOKEN, f: "vol-1-epub-id" },
    {
      sendMail: () => {
        throw new Error(khmer);
      },
    },
  );
  assert.ok(unknown.page.html.includes("couldn&#39;t be sent"));
});

// Security review N4: the spike's browser check is gone; diag=1 is just an unknown parameter.
test("the old diag page is gone", () => {
  const { page } = run("GET", { t: TOKEN, diag: "1" });
  assert.notEqual(page.title, "Browser check");
  assert.ok(!page.html.includes("<script"));
});

// The real entry points, with fake Apps Script services in the global scope.
// ScriptApp answers with the /dev URL, as it does when run from the editor: it must never be used.
function fakeGlobals({ props = PROPS, url = DEV_URL, lockFree = true, unreadable = [] } = {}) {
  const out = {
    html: null,
    title: null,
    meta: [],
    sent: [],
    logs: [],
    state: new Map(),
    locks: [],
  };
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
    getMimeType: () => (f.name.endsWith(".pdf") ? "application/pdf" : "application/epub+zip"),
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
    PropertiesService: {
      getScriptProperties: () => ({
        getProperties: () => ({ ...props, ...Object.fromEntries(out.state) }),
        getProperty: (key) => (out.state.has(key) ? out.state.get(key) : null),
        setProperty: (key, value) => out.state.set(key, value),
        getKeys: () => [...Object.keys(props), ...out.state.keys()],
        deleteProperty: (key) => out.state.delete(key),
      }),
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => {
          out.locks.push("taken");
          return lockFree;
        },
        releaseLock: () => out.locks.push("released"),
      }),
    },
    ScriptApp: { getService: () => ({ getUrl: () => url }) },
    DriveApp: {
      getFolderById: (id) => {
        if (!has(FOLDERS, id) || unreadable.includes(id)) throw new Error("No item");
        const listing = listingOf(id);
        return {
          getId: () => id,
          getName: () => FOLDERS[id].name,
          isTrashed: () => false,
          getParents: () => iterator(FOLDERS[id].parentIds.map((pid) => ({ getId: () => pid }))),
          getFiles: () => iterator(listing.files.map((f) => driveFile(f.id, f))),
          getFolders: () =>
            iterator(
              listing.folders.map((f) => ({
                getId: () => f.id,
                getName: () => f.name,
                isTrashed: () => false,
              })),
            ),
        };
      },
      getFileById: (id) => {
        if (!Object.prototype.hasOwnProperty.call(FILES, id)) throw new Error("No item");
        return driveFile(id, FILES[id]);
      },
    },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
    MailApp: { sendEmail: (m) => out.sent.push(m), getRemainingDailyQuota: () => 99 },
    Utilities: { newBlob: (text, type, name) => ({ text, type, name }) },
  };
  return { globals, out };
}

test("doGet renders through HtmlService with a title and a viewport tag", () => {
  const { globals, out } = fakeGlobals();
  const ctx = loadSrc(globals);
  ctx.doGet({ parameter: { t: TOKEN } });
  assert.equal(out.title, "ShelfDrop");
  assert.deepEqual(out.meta, [["viewport", "width=device-width, initial-scale=1"]]);
  assert.ok(out.html.includes(">Light Novels<") && out.html.includes(">Manga<"));
  ctx.doGet({ parameter: { t: TOKEN, m: "1" } });
  assert.equal(out.title, "Light Novels - ShelfDrop");
  assert.ok(out.html.includes("Sample Series Vol 10.pdf") && out.html.includes(">Tales<"));
});

test("doPost sends through MailApp; doGet without parameters is not found", () => {
  const { globals, out } = fakeGlobals();
  const ctx = loadSrc(globals);
  ctx.doPost({ parameter: { t: TOKEN, f: "vol-10-pdf-id" } });
  assert.equal(out.sent.length, 1);
  assert.equal(out.sent[0].to, KINDLE);
  ctx.doGet(undefined);
  // Bug found in the owner's E7 check: the tab said "Not found - ShelfDrop", naming the app to
  // anyone without the token.
  assert.equal(out.title, "Not found");
  assert.ok(!/shelfdrop/i.test(out.html));
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
  assert.match(log, /Shelf: 3 series, 5 loose books in 2 folders\./);
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

test("sendLinkToKindle refuses without a valid WEB_APP_URL", () => {
  for (const value of [undefined, DEV_URL]) {
    const { globals, out } = fakeGlobals({ props: { ...PROPS, WEB_APP_URL: value } });
    assert.throws(() => loadSrc(globals).sendLinkToKindle(), /WEB_APP_URL/);
    assert.equal(out.sent.length, 0);
  }
});

// Security review S1: limits on sending.
test("the same book isn't sent twice within 10 minutes, but can be after", () => {
  const state = memoryState();
  const at = (now) => ({ state, now: () => now });
  const first = run("POST", { t: TOKEN, f: "vol-1-epub-id" }, at(NOW));
  assert.equal(first.page.title, "Sent");
  const again = run("POST", { t: TOKEN, f: "vol-1-epub-id" }, at(NOW + 9 * 60 * 1000));
  assert.equal(again.page.title, "Not sent");
  assert.ok(again.page.html.includes("a few minutes ago"));
  assert.equal(again.calls.sent.length, 0);
  const other = run("POST", { t: TOKEN, f: "vol-2-epub-id" }, at(NOW + 9 * 60 * 1000));
  assert.equal(other.page.title, "Sent");
  const later = run("POST", { t: TOKEN, f: "vol-1-epub-id" }, at(NOW + 10 * 60 * 1000));
  assert.equal(later.page.title, "Sent");
});

test("at most 15 books a day; the count starts again the next day and old days are removed", () => {
  const state = memoryState({ "_count:2026-11-23": "7" });
  const day = 24 * 60 * 60 * 1000;
  for (let i = 0; i < 15; i++) {
    state.remove("_sent:vol-1-epub-id"); // send the same file again without waiting
    const { page } = run("POST", { t: TOKEN, f: "vol-1-epub-id" }, { state, now: () => NOW + i });
    assert.equal(page.title, "Sent", "send " + (i + 1));
  }
  state.remove("_sent:vol-1-epub-id");
  const sixteenth = run("POST", { t: TOKEN, f: "vol-1-epub-id" }, { state, now: () => NOW + 20 });
  assert.equal(sixteenth.page.title, "Not sent");
  assert.ok(sixteenth.page.html.includes("limit of 15 books"));
  assert.equal(sixteenth.calls.sent.length, 0);
  assert.equal(state.get("_count:2026-11-24"), "15");
  assert.equal(state.get("_count:2026-11-23"), null);
  const tomorrow = run("POST", { t: TOKEN, f: "vol-2-epub-id" }, { state, now: () => NOW + day });
  assert.equal(tomorrow.page.title, "Sent");
});

test("the daily limit starts again at midnight in Cambodia (17:00 UTC), not at UTC midnight", () => {
  const state = memoryState();
  const beforeMidnight = Date.UTC(2026, 10, 24, 16, 59, 0);
  for (let i = 0; i < 15; i++) {
    state.remove("_sent:vol-1-epub-id");
    const { page } = run(
      "POST",
      { t: TOKEN, f: "vol-1-epub-id" },
      { state, now: () => beforeMidnight + i },
    );
    assert.equal(page.title, "Sent", "send " + (i + 1));
  }
  const full = run(
    "POST",
    { t: TOKEN, f: "vol-2-epub-id" },
    { state, now: () => beforeMidnight + 20 },
  );
  assert.equal(full.page.title, "Not sent");
  const midnight = Date.UTC(2026, 10, 24, 17, 0, 0);
  const next = run("POST", { t: TOKEN, f: "vol-2-epub-id" }, { state, now: () => midnight });
  assert.equal(next.page.title, "Sent");
  assert.equal(state.get("_count:2026-11-25"), "1");
});

test("a failed send counts for nothing (no cooldown, no daily count)", () => {
  const state = memoryState();
  run(
    "POST",
    { t: TOKEN, f: "vol-1-epub-id" },
    {
      state,
      sendMail: () => {
        throw new Error("Service unavailable");
      },
    },
  );
  assert.deepEqual(state.keys(), ["_lastError"]);
});

// Found in E6: the owner couldn't see why a send failed, because Apps Script hides the log lines
// of web app runs by anonymous visitors. The latest failure is kept for checkSetup to show.
test("a failed send keeps the redacted reason as _lastError", () => {
  const state = memoryState();
  run(
    "POST",
    { t: TOKEN, f: "vol-1-epub-id" },
    {
      state,
      sendMail: () => {
        throw new Error(`Limit Exceeded: Email Total Attachments Size for ${KINDLE} ${TOKEN}`);
      },
    },
  );
  const note = state.get("_lastError");
  assert.ok(note.startsWith("2026-11-24T12:00:00.000Z send failed: Limit Exceeded"), note);
  assert.ok(!note.toLowerCase().includes(KINDLE) && !note.includes(TOKEN), note);
});

test("_lastError is cut to a sane length, and failing to save it changes nothing", () => {
  const state = memoryState();
  run(
    "POST",
    { t: TOKEN, f: "vol-1-epub-id" },
    {
      state,
      sendMail: () => {
        throw new Error("x".repeat(5000));
      },
    },
  );
  assert.ok(state.get("_lastError").length < 340);
  const broken = {
    ...memoryState(),
    set: () => {
      throw new Error("properties full");
    },
  };
  const { page } = run(
    "POST",
    { t: TOKEN, f: "vol-1-epub-id" },
    {
      state: broken,
      sendMail: () => {
        throw new Error("Service unavailable");
      },
    },
  );
  assert.equal(page.title, "Not sent");
});

test("checkSetup shows the last error, or none", () => {
  const clean = fakeGlobals();
  loadSrc(clean.globals).checkSetup();
  assert.ok(clean.out.logs.includes("Last error: none"));
  const { globals, out } = fakeGlobals();
  out.state.set("_lastError", "2026-11-24T12:00:00.000Z send failed: something");
  loadSrc(globals).checkSetup();
  assert.ok(out.logs.includes("Last error: 2026-11-24T12:00:00.000Z send failed: something"));
});

test("sending happens inside the lock; a busy lock sends nothing; GET never locks", () => {
  const { calls } = run("POST", { t: TOKEN, f: "vol-1-epub-id" });
  assert.equal(calls.locks, 1);
  const busy = run("POST", { t: TOKEN, f: "vol-1-epub-id" }, { withLock: () => null });
  assert.equal(busy.page.title, "Not sent");
  assert.ok(busy.page.html.includes("being sent right now"));
  assert.equal(busy.calls.sent.length, 0);
  assert.equal(run("GET", { t: TOKEN, f: "vol-1-epub-id" }).calls.locks, 0);
});

test("the real script lock is always released, and a busy one sends nothing", () => {
  const { globals, out } = fakeGlobals();
  loadSrc(globals).doPost({ parameter: { t: TOKEN, f: "vol-1-epub-id" } });
  assert.deepEqual(out.locks, ["taken", "released"]);
  assert.equal(out.sent.length, 1);
  assert.ok(out.state.has("_sent:vol-1-epub-id"));
  const busy = fakeGlobals({ lockFree: false });
  loadSrc(busy.globals).doPost({ parameter: { t: TOKEN, f: "vol-1-epub-id" } });
  assert.equal(busy.out.sent.length, 0);
  assert.deepEqual(busy.out.locks, ["taken"]);
});

test("the limit state in Script Properties doesn't disturb the settings", () => {
  const { globals, out } = fakeGlobals();
  const ctx = loadSrc(globals);
  ctx.doPost({ parameter: { t: TOKEN, f: "vol-1-epub-id" } });
  ctx.doGet({ parameter: { t: TOKEN } });
  assert.equal(out.title, "ShelfDrop");
});

// Security review S2: no raw Apps Script error pages.
test("unreadable properties: not-found page, even with the right token", () => {
  const { page, calls } = run(
    "GET",
    { t: TOKEN },
    {
      properties: () => {
        throw new Error("Service error: PropertiesService");
      },
    },
  );
  assert.equal(page.title, "Not found");
  assert.deepEqual(calls.logs, ["request failed: Script Properties could not be read"]);
});

test("a failure after the token check gives a plain page and a redacted log line", () => {
  const cases = [
    ["listFolder", { t: TOKEN }, "ShelfDrop"], // every shelf folder skipped, and noted
    ["remainingQuota", { t: TOKEN, f: "vol-1-epub-id" }, "Something went wrong"],
    ["getBlob", { t: TOKEN, f: "vol-1-epub-id" }, "Not sent"],
  ];
  for (const [broken, params, title] of cases) {
    const { page, calls } = run("POST", params, {
      [broken]: () => {
        throw new Error("Exception in " + broken + " for " + KINDLE.toUpperCase());
      },
    });
    assert.equal(page.title, title, broken);
    assert.ok(!page.html.includes("Exception"), broken);
    assert.equal(calls.sent.length, 0, broken);
    assert.ok(!calls.logs.join(" ").toLowerCase().includes(KINDLE), broken);
  }
});

test("the error page links nowhere", () => {
  assert.ok(!app.renderError().html.includes("<a"));
});

// Security review N7.
test("redact hides secrets in any letter case", () => {
  assert.equal(
    app.redact("to YourName@Kindle.COM and yourname@kindle.com.", [KINDLE]),
    "to [hidden] and [hidden].",
  );
  assert.equal(app.redact(undefined, [KINDLE]), "");
});

// Bug found in the owner's first checkSetup run: ScriptApp.getService().getUrl() gave the
// owner-only /dev URL. Links must come from WEB_APP_URL, never from ScriptApp.
test("links use WEB_APP_URL even when Apps Script reports a /dev URL", () => {
  const { globals, out } = fakeGlobals();
  loadSrc(globals).doGet({ parameter: { t: TOKEN } });
  assert.ok(out.html.includes('href="' + URL + "?t=" + TOKEN + "&amp;m=1"));
  assert.ok(!out.html.includes("/dev"));
  loadSrc(globals).doGet({ parameter: { t: TOKEN, m: "1" } });
  assert.ok(out.html.includes('href="' + URL + "?t=" + TOKEN + "&amp;f="));
  assert.ok(!out.html.includes("/dev"));
});

test("a missing or /dev WEB_APP_URL shows the setup page, and checkSetup says what to do", () => {
  const { page } = run(
    "GET",
    { t: TOKEN },
    { properties: () => ({ ...PROPS, WEB_APP_URL: DEV_URL }) },
  );
  assert.equal(page.title, "Setup needed");
  assert.ok(page.html.includes("WEB_APP_URL"));
  const { globals, out } = fakeGlobals({ props: { ...PROPS, WEB_APP_URL: "" } });
  loadSrc(globals).checkSetup();
  assert.match(out.logs.join("\n"), /Set WEB_APP_URL .* ends with \/exec/);
});

// Phase 2: series from several accounts.
// Phase 5 (owner's decision): series merge only inside one main folder, never across them.
test("a series page lists its folder's volumes only, never a same-named series of another folder", () => {
  const names = (html) => [...html.matchAll(/class="book[^"]*"[^>]*>([^<]+)</g)].map((m) => m[1]);
  const b = run("GET", { t: TOKEN, s: "ser-tales-b01" }).page;
  assert.equal(b.title, "tales");
  assert.deepEqual(names(b.html), ["Tales Vol 12.pdf"]);
  assert.ok(b.html.includes("s=ser-tales-b01&amp;r=1"));
  assert.ok(
    b.html.includes('href="' + URL + "?t=" + TOKEN + '&amp;m=2">&larr; Back to the folder</a>'),
  );
  const a = run("GET", { t: TOKEN, s: "ser-tales-a01" }).page;
  assert.equal(a.title, "Tales");
  assert.deepEqual(names(a.html), ["Tales Vol 3.epub", "Volume 5"]);
  assert.ok(a.html.includes("scan_005.epub") && !a.html.includes("Artbook"));
  assert.ok(
    a.html.includes('href="' + URL + "?t=" + TOKEN + '&amp;m=1">&larr; Back to the folder</a>'),
  );
});

// Security review N6: a series ID from the URL is never trusted.
test("a series ID the shelf didn't list shows 'not on the shelf' and lists nothing", () => {
  for (const s of [
    FOLDER,
    "vol-tales-05",
    "ser-extras-01",
    "not-shelf-sub1",
    "no-such-folder",
    "",
    "../x",
  ]) {
    const { page, calls } = run("GET", { t: TOKEN, s });
    assert.equal(page.title, "Not on the shelf", s);
    assert.ok(!page.html.includes("Artbook") && !page.html.includes("Private"), s);
    assert.equal(calls.listFolder, 2, s); // only the two shelf folders
  }
});

test("a volume in a series sends, and its pages go back to its series", () => {
  const back = 's=ser-tales-b01">&larr; Back to the series';
  const confirm = run("GET", { t: TOKEN, f: "tales-12-id-01" });
  assert.equal(confirm.page.title, "Send to Kindle?");
  assert.ok(confirm.page.html.includes(back));
  const sent = run("POST", { t: TOKEN, f: "tales-12-id-01" });
  assert.equal(sent.page.title, "Sent");
  assert.equal(sent.calls.sent.length, 1);
  assert.ok(sent.page.html.includes(back));
});

test("files two levels down or under a folder off the shelf are refused", () => {
  for (const f of ["tales-x-id-001", "private-2-id01"]) {
    const { page, calls } = run("POST", { t: TOKEN, f });
    assert.equal(page.title, "Can't send this", f);
    assert.equal(calls.sent.length, 0, f);
  }
});

test("a loose book needs no folder lookups", () => {
  const { calls } = run("GET", { t: TOKEN, f: "vol-1-epub-id" });
  assert.equal(calls.getFolder, 0);
});

test("an unreadable shelf folder is skipped and noted; checkSetup says which one", () => {
  const { page } = run(
    "GET",
    { t: TOKEN },
    {
      listFolder: (id) => {
        if (id === FOLDER_B) throw new Error("Access denied");
        return listingOf(id);
      },
    },
  );
  assert.equal(page.title, "ShelfDrop");
  assert.ok(page.html.includes("1 shelf folder couldn&#39;t be read"));
  assert.ok(page.html.includes(">Light Novels<") && !page.html.includes(">Manga<"));
  assert.ok(!page.html.includes(FOLDER_B));
  const { globals, out } = fakeGlobals({ unreadable: [FOLDER_B] });
  loadSrc(globals).checkSetup();
  assert.match(out.logs.join("\n"), /Shelf folder 2 of 2 in FOLDER_ID couldn't be read/);
});

// Phase 2 decision 3: listings are cached for 30 minutes, with a Refresh link.
function memoryCache() {
  const map = new Map();
  return {
    map,
    get: (key) => (map.has(key) ? map.get(key).value : null),
    put: (key, value, seconds) => map.set(key, { value, seconds }),
  };
}

test("the shelf and series listings come from the cache the second time", () => {
  const cache = memoryCache();
  assert.equal(run("GET", { t: TOKEN }, { cache }).calls.listFolder, 2);
  const again = run("GET", { t: TOKEN }, { cache });
  assert.equal(again.calls.listFolder, 0);
  assert.equal(again.page.title, "ShelfDrop");
  const folder = run("GET", { t: TOKEN, m: "1" }, { cache });
  assert.equal(folder.calls.listFolder, 0); // the first page cached it, name included
  assert.equal(folder.page.title, "Light Novels");
  // the "Tales" folder and its "Volume 5" folder
  assert.equal(run("GET", { t: TOKEN, s: "ser-tales-a01" }, { cache }).calls.listFolder, 2);
  const series = run("GET", { t: TOKEN, s: "ser-tales-a01" }, { cache });
  assert.equal(series.calls.listFolder, 0);
  assert.ok(series.page.html.includes("Volume 5"));
  for (const { seconds } of cache.map.values()) assert.equal(seconds, 30 * 60);
});

test("Refresh reads Drive again and updates the cache", () => {
  const cache = memoryCache();
  run("GET", { t: TOKEN }, { cache });
  assert.equal(run("GET", { t: TOKEN, r: "1" }, { cache }).calls.listFolder, 2);
  assert.equal(run("GET", { t: TOKEN, m: "2", r: "1" }, { cache }).calls.listFolder, 1);
  const series = run("GET", { t: TOKEN, s: "ser-tales-a01", r: "1" }, { cache });
  assert.equal(series.calls.listFolder, 2); // "Tales" and "Volume 5"; the main folder is cached
});

test("the cache keeps only what the pages need: no token, no address, no non-books", () => {
  const cache = memoryCache();
  run("GET", { t: TOKEN }, { cache });
  const stored = [...cache.map.values()].map((v) => v.value).join("\n");
  assert.ok(stored.includes("Sample Series Vol 1.epub"));
  assert.ok(!stored.includes(TOKEN) && !stored.includes(KINDLE) && !stored.includes("Budget"));
});

test("sending never trusts the cache: a book moved off the shelf is refused", () => {
  const cache = memoryCache();
  run("GET", { t: TOKEN }, { cache });
  const moved = { ...FILES["vol-1-epub-id"], parentIds: ["other-folder-01"] };
  const { page, calls } = run(
    "POST",
    { t: TOKEN, f: "vol-1-epub-id" },
    { cache, getFile: (id) => ({ id, trashed: false, ...moved }) },
  );
  assert.equal(page.title, "Can't send this");
  assert.equal(calls.sent.length, 0);
});

test("a broken cache or an unreadable folder never breaks the page", () => {
  const broken = {
    get: () => {
      throw new Error("cache down");
    },
    put: () => {
      throw new Error("too big");
    },
  };
  const { page } = run("GET", { t: TOKEN }, { cache: broken });
  assert.equal(page.title, "ShelfDrop");
  assert.equal(run("GET", { t: TOKEN, m: "1" }, { cache: broken }).page.title, "Light Novels");
  const cache = memoryCache();
  run(
    "GET",
    { t: TOKEN },
    {
      cache,
      listFolder: (id) => {
        if (id === FOLDER_B) throw new Error("Access denied");
        return listingOf(id);
      },
    },
  );
  // Only a short "unreadable" marker is kept for the dead folder (review SF1), never a listing.
  assert.equal(cache.map.get("dir+:" + FOLDER_B).value, JSON.stringify({ unreadable: true }));
});

// Phase 2 security review SF1: a dead shelf folder must not bury the last send failure, and must
// not cost a Drive read and a Script Properties write on every page.
test("an unreadable folder is noted apart from send failures and retried at most every 5 min", () => {
  const cache = memoryCache();
  const state = memoryState({ _lastError: "2026-11-24T11:00:00.000Z send failed: quota" });
  let deadReads = 0;
  const listFolder = (id) => {
    if (id === FOLDER_B) {
      deadReads++;
      throw new Error("Access denied");
    }
    return listingOf(id);
  };
  const opts = { cache, state, listFolder };
  for (let i = 0; i < 3; i++) run("GET", { t: TOKEN }, opts);
  run("GET", { t: TOKEN, s: "ser-tales-a01" }, opts);
  run("GET", { t: TOKEN, s: "ser-tales-a01" }, opts);
  assert.equal(deadReads, 1);
  assert.equal(state.get("_lastError"), "2026-11-24T11:00:00.000Z send failed: quota");
  assert.match(state.get("_lastFolderError"), /folder unreadable: Access denied/);
  const negative = [...cache.map.entries()].find(([key]) => key.endsWith(FOLDER_B));
  assert.equal(negative[1].seconds, 5 * 60);
  run("GET", { t: TOKEN, r: "1" }, opts);
  assert.equal(deadReads, 2); // Refresh tries again at once
});

test("checkSetup shows the last folder error too", () => {
  const { globals, out } = fakeGlobals({ unreadable: [FOLDER_B] });
  loadSrc(globals).checkSetup();
  assert.match(out.logs.join("\n"), /Last folder error: \S+ folder unreadable: No item/);
});

// Review N12: a series folder moved off the shelf stops showing at once, cache or not.
test("a series page re-checks in Drive that its folders are still on the shelf", () => {
  const cache = memoryCache();
  run("GET", { t: TOKEN }, { cache });
  const moved = (id) =>
    id === "ser-tales-b01"
      ? { id, trashed: false, name: "tales", parentIds: ["somewhere-else"] }
      : has(FOLDERS, id)
        ? { id, trashed: false, ...FOLDERS[id] }
        : null;
  const gone = run("GET", { t: TOKEN, s: "ser-tales-b01" }, { cache, getFolder: moved });
  assert.equal(gone.page.title, "Not on the shelf");
  assert.ok(!gone.page.html.includes("Tales Vol"));
  const rest = run("GET", { t: TOKEN, s: "ser-tales-a01" }, { cache, getFolder: moved });
  assert.equal(rest.page.title, "Tales");
  assert.ok(rest.page.html.includes("Tales Vol 3.epub") && !rest.page.html.includes("Vol 12"));
});

// Review N17: a series name from Drive becomes the tab title; keep it short.
test("the window title is capped at 100 characters", () => {
  const title = app.windowTitle_({ title: "x".repeat(300) });
  assert.equal(title.length, 100);
  assert.equal(app.windowTitle_({ title: "Tales" }), "Tales - ShelfDrop");
  assert.equal(app.windowTitle_({ title: "Not found", windowTitle: "Not found" }), "Not found");
});

// Review SF2: a shelf folder holding a whole library must not slow every page or overflow the cache.
test("a folder listing stops at 300 files and 100 folders and says so", () => {
  const iterator = (n, make) => {
    let i = 0;
    return { hasNext: () => i < n, next: () => make(i++) };
  };
  const driveFile = (i) => ({
    getId: () => "big-file-" + String(i).padStart(6, "0"),
    getName: () => "Book " + i + ".epub",
    getSize: () => MB,
    getMimeType: () => "application/epub+zip",
    isTrashed: () => false,
  });
  const driveFolder = (i) => ({
    getId: () => "big-folder-" + String(i).padStart(6, "0"),
    getName: () => "Series " + i,
    isTrashed: () => false,
  });
  const globals = {
    DriveApp: {
      getFolderById: () => ({
        getName: () => "Huge",
        getFiles: () => iterator(1000, driveFile),
        getFolders: () => iterator(500, driveFolder),
      }),
    },
    CacheService: { getScriptCache: () => null },
  };
  const listing = loadSrc(globals).appsScriptServices_().listFolder("huge-folder-01", true);
  assert.equal(listing.files.length, 300);
  assert.equal(listing.folders.length, 100);
  assert.equal(listing.truncated, true);
  const cache = memoryCache();
  assert.equal(listing.name, "Huge");
  run("GET", { t: TOKEN }, { cache, listFolder: () => listing });
  for (const { value } of cache.map.values()) assert.ok(value.length < 100 * 1024);
});

// Scope change 2026-11-24: one level of volume folders inside a series.
test("a book in a volume folder can be sent; its pages show the folder name and go back to the series", () => {
  const confirm = run("GET", { t: TOKEN, f: "tales-5-id-001" });
  assert.equal(confirm.page.title, "Send to Kindle?");
  assert.ok(confirm.page.html.includes("Volume 5") && confirm.page.html.includes("scan_005.epub"));
  assert.ok(confirm.page.html.includes('s=ser-tales-a01">&larr; Back to the series'));
  const sent = run("POST", { t: TOKEN, f: "tales-5-id-001" });
  assert.equal(sent.page.title, "Sent");
  assert.equal(sent.calls.sent[0].subject, "scan_005.epub");
  assert.ok(sent.calls.getFolder <= 6);
});

// Volume folder review SF-A / SF-B: a series page reads at most 40 volume folders and stops after
// about 15 s, and says when some aren't shown.
function bigSeriesServices(volumesEach, extra = {}) {
  const seriesIds = ["big-series-1", "big-series-2", "big-series-3"];
  return {
    listFolder: (id) => {
      if (id === FOLDER) {
        return { folders: seriesIds.map((sid) => ({ id: sid, name: "Big" })), files: [] };
      }
      if (id === FOLDER_B) return { folders: [], files: [] };
      if (seriesIds.includes(id)) {
        return {
          folders: Array.from({ length: volumesEach }, (_, i) => ({
            id: id + "-vol-" + String(i).padStart(3, "0"),
            name: "Volume " + (i + 1),
          })),
          files: [],
        };
      }
      return { folders: [], files: [{ id: id + "-book", name: "b.epub", size: MB }] };
    },
    getFolder: (id) => ({ id, name: "Big", trashed: false, parentIds: [FOLDER] }),
    ...extra,
  };
}

test("a series page reads at most 40 volume folders and says some aren't shown", () => {
  const { page } = run("GET", { t: TOKEN, s: "big-series-1" }, bigSeriesServices(50));
  assert.equal(page.title, "Big");
  const rows = page.html.match(/class="book"/g) || [];
  assert.equal(rows.length, 40);
  assert.ok(page.html.includes("Some books aren&#39;t shown"));
});

test("dropped volume folders are noted even when no single listing hit its limit", () => {
  const { page } = run("GET", { t: TOKEN, s: "big-series-1" }, bigSeriesServices(20));
  const rows = page.html.match(/class="book"/g) || [];
  assert.equal(rows.length, 40); // 60 volume folders, 40 read
  assert.ok(page.html.includes("Some books aren&#39;t shown"));
  const small = run("GET", { t: TOKEN, s: "big-series-1" }, bigSeriesServices(5));
  assert.equal((small.page.html.match(/class="book"/g) || []).length, 15);
  assert.ok(!small.page.html.includes("aren&#39;t shown"));
});

test("a series page stops reading volume folders after about 15 seconds", () => {
  let clock = NOW;
  const { page } = run(
    "GET",
    { t: TOKEN, s: "big-series-1" },
    bigSeriesServices(5, { now: () => (clock += 2000) }), // every Drive step "takes" 2 s
  );
  const rows = page.html.match(/class="book"/g) || [];
  assert.ok(rows.length > 0 && rows.length < 15, String(rows.length));
  assert.ok(page.html.includes("Some books aren&#39;t shown"));
});

// Review N-2: the send check's Drive lookups are bounded.
test("the send check reads at most 5 parents and 5 grandparents, and none when it needn't", () => {
  const parentIds = Array.from({ length: 7 }, (_, i) => "odd-parent-" + i);
  let lookups = 0;
  const { page, calls } = run(
    "POST",
    { t: TOKEN, f: "many-parents-1" },
    {
      getFile: (id) => ({ id, name: "x.epub", size: MB, trashed: false, parentIds }),
      getFolder: (id) => {
        lookups++;
        return {
          id,
          name: "x",
          trashed: false,
          parentIds: Array.from({ length: 7 }, (_, i) => id + "-up-" + i),
        };
      },
    },
  );
  assert.equal(page.title, "Can't send this");
  assert.equal(calls.sent.length, 0);
  assert.ok(lookups <= 10, String(lookups));
  const direct = run("GET", { t: TOKEN, f: "tales-3-id-001" });
  assert.equal(direct.page.title, "Send to Kindle?");
  assert.equal(direct.calls.getFolder, 1);
});

// Phase 3: "✓ sent <date>" marks.

// Script Properties as Apps Script has them: the settings plus what the app wrote to state.
function propsWith(state) {
  return () => ({ ...PROPS, ...Object.fromEntries(state.keys().map((k) => [k, state.get(k)])) });
}

const marks = (html) => (html.match(/&#10003; sent [^<]*/g) || []).map((m) => m.slice(9));

test("a sent book shows its last send date on its row and its confirm page; others don't", () => {
  const state = memoryState({
    "_sent:vol-1-epub-id": String(NOW - 60 * 60 * 1000),
    "_sent:tales-3-id-001": String(Date.UTC(2025, 10, 2, 5)),
    "_sent:tales-5-id-001": "not a time",
  });
  const props = propsWith(state);
  const shelf = run("GET", { t: TOKEN, m: "1" }, { state, properties: props });
  assert.deepEqual(marks(shelf.page.html), ["sent 24 Nov"]);
  assert.ok(/Vol 1\.epub[\s\S]*?&#10003; sent 24 Nov[\s\S]*?Vol 2\.epub/.test(shelf.page.html));
  const series = run("GET", { t: TOKEN, s: "ser-tales-a01" }, { state, properties: props });
  assert.deepEqual(marks(series.page.html), ["sent 2 Nov 2025"]);
  const confirm = run("GET", { t: TOKEN, f: "vol-1-epub-id" }, { state, properties: props });
  assert.deepEqual(marks(confirm.page.html), ["sent 24 Nov"]);
  const unsent = run("GET", { t: TOKEN, f: "vol-2-epub-id" }, { state, properties: props });
  assert.deepEqual(marks(unsent.page.html), []);
});

test("the mark shows at once after a send, though the listing comes from the cache", () => {
  const state = memoryState();
  const cache = memoryCache();
  const props = propsWith(state);
  assert.deepEqual(
    marks(run("GET", { t: TOKEN, m: "1" }, { state, cache, properties: props }).page.html),
    [],
  );
  const later = NOW + 2 * 60 * 60 * 1000; // 21:00 in Cambodia, still the 24th
  run(
    "POST",
    { t: TOKEN, f: "vol-2-epub-id" },
    { state, cache, properties: props, now: () => later },
  );
  const again = run(
    "GET",
    { t: TOKEN, m: "1" },
    { state, cache, properties: props, now: () => later },
  );
  assert.equal(again.calls.listFolder, 0);
  assert.deepEqual(marks(again.page.html), ["sent 24 Nov"]);
});

test("sending again moves the mark to the new date", () => {
  const state = memoryState({ "_sent:vol-1-epub-id": String(Date.UTC(2026, 10, 1, 5)) });
  const props = propsWith(state);
  run("POST", { t: TOKEN, f: "vol-1-epub-id" }, { state, properties: props });
  const confirm = run("GET", { t: TOKEN, f: "vol-1-epub-id" }, { state, properties: props });
  assert.deepEqual(marks(confirm.page.html), ["sent 24 Nov"]);
});

// Phase 3 audit: every page a reader can reach shows no Kindle address, no shelf folder ID and no
// Google error text, and the token appears only inside links and the send form.
test("safe messages: no page shows the address, folder IDs, IDs in text or Google's error text", () => {
  const leak = "Google says: " + KINDLE.toUpperCase() + " " + FOLDER + " " + TOKEN;
  const boom = () => {
    throw new Error(leak);
  };
  const full = memoryState({ ["_count:2026-11-24"]: "15" });
  const recent = memoryState({ "_sent:vol-1-epub-id": String(NOW - 60 * 1000) });
  const send = { t: TOKEN, f: "vol-1-epub-id" };
  const cases = [
    ["no token", "GET", {}, {}],
    ["setup needed", "GET", { t: TOKEN }, { properties: () => ({ ...PROPS, WEB_APP_URL: "bad" }) }],
    ["unknown series", "GET", { t: TOKEN, s: "ser-unknown-01" }, {}],
    ["series off the shelf", "GET", { t: TOKEN, s: "not-shelf-sub1" }, {}],
    ["file not on the shelf", "GET", { t: TOKEN, f: "private-doc-id" }, {}],
    ["file too big", "POST", { t: TOKEN, f: "huge-pdf-id00" }, {}],
    ["not a book", "POST", { t: TOKEN, f: "sheet-xlsx-id" }, {}],
    ["no such file", "POST", { t: TOKEN, f: "no-such-file-01" }, {}],
    ["cooldown", "POST", send, { state: recent }],
    ["daily cap", "POST", send, { state: full }],
    ["busy", "POST", send, { withLock: () => null }],
    ["quota used up", "POST", send, { remainingQuota: () => 0 }],
    ["mail refused", "POST", send, { sendMail: boom }],
    ["file unreadable", "POST", send, { getBlob: boom }],
    ["Drive down", "GET", send, { getFile: boom }],
    ["shelf unreadable", "GET", { t: TOKEN }, { listFolder: boom }],
    ["folder unreadable", "GET", { t: TOKEN, m: "2" }, { listFolder: boom }],
    ["unknown folder", "GET", { t: TOKEN, m: "7" }, {}],
    ["folder ID as m", "GET", { t: TOKEN, m: FOLDER }, {}],
  ];
  for (const [name, method, params, overrides] of cases) {
    const { page } = run(method, params, overrides);
    const html = page.html;
    assert.ok(!html.toLowerCase().includes(KINDLE), name + ": address");
    assert.ok(!html.includes("Google says"), name + ": error text");
    for (const id of [FOLDER, FOLDER_B]) assert.ok(!html.includes(id), name + ": shelf folder ID");
    // Outside attributes (the text the reader sees) there's no token and no Drive ID at all.
    const text = html.replace(/<style>[\s\S]*?<\/style>/, "").replace(/<[^>]*>/g, " ");
    assert.ok(!text.includes(TOKEN), name + ": token in text");
    const ids = [...Object.keys(FILES), ...Object.keys(FOLDERS), params.s, params.f];
    for (const id of ids.filter(Boolean)) {
      assert.ok(!text.includes(id), name + ": ID " + id + " in text");
    }
    assert.ok(!page.windowTitle || !page.windowTitle.includes(TOKEN), name + ": title");
  }
});

// Security review SF-1, end to end: a corrupt mark doesn't break the shelf page.
test("a corrupt _sent: value leaves the page working, with no mark", () => {
  const state = memoryState({ "_sent:vol-1-epub-id": "1e300" });
  const { page } = run("GET", { t: TOKEN, m: "1" }, { state, properties: propsWith(state) });
  assert.equal(page.title, "Light Novels");
  assert.deepEqual(marks(page.html), []);
});

// Security review SF-2: with Script Properties full, a new _sent: key can't be written. The daily
// count must still go up (so the cap holds), and the reader is told the book was sent.
test("full Script Properties: the count still rises, the cap still holds, the send says Sent", () => {
  const state = memoryState();
  const set = state.set;
  state.set = (key, value) => {
    if (key.startsWith("_sent:") && state.get(key) === null) throw new Error("quota " + KINDLE);
    return set(key, value);
  };
  for (let i = 0; i < 15; i++) {
    const { page, calls } = run(
      "POST",
      { t: TOKEN, f: "vol-1-epub-id" },
      { state, now: () => NOW + i },
    );
    assert.equal(page.title, "Sent", "send " + (i + 1));
    assert.equal(calls.sent.length, 1);
    assert.ok(!calls.logs.join(" ").includes(KINDLE));
  }
  assert.equal(state.get("_count:2026-11-24"), "15");
  const sixteenth = run("POST", { t: TOKEN, f: "vol-2-epub-id" }, { state, now: () => NOW + 20 });
  assert.equal(sixteenth.page.title, "Not sent");
  assert.ok(state.get("_lastError").includes("couldn't record"));
});

test("checkSetup reports how much of Script Properties the sent marks use", () => {
  const props = { ...PROPS };
  for (let i = 0; i < 9000; i++)
    props["_sent:file-id-" + String(i).padStart(20, "0")] = String(NOW);
  const { globals, out } = fakeGlobals({ props });
  loadSrc(globals).checkSetup();
  const logs = out.logs;
  const line = logs.find((l) => l.startsWith("Sent marks:"));
  assert.ok(line && line.includes("9000 books"), line);
  assert.ok(logs.some((l) => l.includes("nearly full") && l.includes("docs/setup.md part L")));
  const small = fakeGlobals();
  loadSrc(small.globals).checkSetup();
  assert.ok(!small.out.logs.some((l) => l.includes("nearly full")));
});

// Security review SF-3: the normal pages too, with marks, and the browser tab's title.
test("safe messages: shelf, series, confirm and Sent pages, and every tab title, leak nothing", () => {
  const state = memoryState({ "_sent:vol-1-epub-id": String(NOW - 60 * 60 * 1000) });
  const props = propsWith(state);
  const cases = [
    ["shelf", "GET", { t: TOKEN }],
    ["folder", "GET", { t: TOKEN, m: "1" }],
    ["other folder", "GET", { t: TOKEN, m: "2" }],
    ["series", "GET", { t: TOKEN, s: "ser-tales-a01" }],
    ["loose book", "GET", { t: TOKEN, f: "b-loose-id-01" }],
    ["confirm", "GET", { t: TOKEN, f: "vol-1-epub-id" }],
    ["sent", "POST", { t: TOKEN, f: "vol-2-epub-id" }],
    ["not found", "GET", { t: "wrong" }],
  ];
  for (const [name, method, params] of cases) {
    const { page } = run(method, params, { state, properties: props });
    assert.ok(!page.html.toLowerCase().includes(KINDLE), name + ": address");
    for (const id of [FOLDER, FOLDER_B]) assert.ok(!page.html.includes(id), name + ": shelf ID");
    const text = page.html.replace(/<style>[\s\S]*?<\/style>/, "").replace(/<[^>]*>/g, " ");
    assert.ok(!text.includes(TOKEN), name + ": token in text");
    const tab = app.windowTitle_(page);
    for (const secret of [TOKEN, KINDLE, FOLDER, FOLDER_B, ...Object.keys(FILES)]) {
      assert.ok(!tab.includes(secret), name + ": tab title");
    }
  }
});
