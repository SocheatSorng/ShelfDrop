// Request handling end to end, with fake Drive, mail and properties (no Google calls).
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadSrc, plain } = require("./helpers/apps-script");

const MB = 1024 * 1024;
const TOKEN = "test-token-0123456789abcdefghijklmnop";
const KINDLE = "yourname@kindle.com";
const FOLDER = "folder-test-0001";
const URL = "https://script.google.com/macros/s/" + "AKfy" + "cb" + "x".repeat(40) + "/exec";
const DEV_URL = "https://script.google.com/macros/s/" + "AKfy" + "cb" + "d".repeat(40) + "/dev";

const PROPS = { FOLDER_ID: FOLDER, KINDLE_EMAIL: KINDLE, ACCESS_TOKEN: TOKEN, WEB_APP_URL: URL };

const FILES = {
  "vol-1-epub-id": { name: "Sample Series Vol 1.epub", size: 2 * MB, parentIds: [FOLDER] },
  "vol-10-pdf-id": { name: "Sample Series Vol 10.pdf", size: 5 * MB, parentIds: [FOLDER] },
  "vol-2-epub-id": { name: "Sample Series Vol 2.epub", size: 2 * MB, parentIds: [FOLDER] },
  "huge-pdf-id00": { name: "Huge Artbook.pdf", size: 40 * MB, parentIds: [FOLDER] },
  "sheet-xlsx-id": { name: "Budget.xlsx", size: MB, parentIds: [FOLDER] },
  "private-doc-id": { name: "Private.pdf", size: MB, parentIds: ["other-folder-01"] },
};

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
  const calls = { listFolder: 0, getFile: 0, sent: [], logs: [], locks: 0 };
  const services = {
    properties: () => ({ ...PROPS }),
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

test("the diag page needs the token too", () => {
  assert.equal(run("GET", { t: TOKEN, diag: "1" }).page.title, "Browser check");
  assert.equal(run("GET", { diag: "1" }).page.title, "Not found");
});

// The real entry points, with fake Apps Script services in the global scope.
// ScriptApp answers with the /dev URL, as it does when run from the editor: it must never be used.
function fakeGlobals({ props = PROPS, url = DEV_URL, lockFree = true } = {}) {
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
  assert.equal(out.title, "Books - ShelfDrop");
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
    ["listFolder", { t: TOKEN }, "Something went wrong"],
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
