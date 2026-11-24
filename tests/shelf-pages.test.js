const test = require("node:test");
const assert = require("node:assert/strict");
const { loadSrc, plain } = require("./helpers/apps-script");

const app = loadSrc();
const MB = 1024 * 1024;
const LIMIT = 25 * MB;
const FOLDER = "folder-test-0001";

function file(name, size = MB, extra = {}) {
  return {
    id: "id-" + name.replace(/\W/g, ""),
    name,
    size,
    trashed: false,
    parentIds: [FOLDER],
    ...extra,
  };
}

test("shelf: only EPUB and PDF are books, any case", () => {
  assert.equal(app.bookKind("a.EPUB"), "epub");
  assert.equal(app.bookKind("a.pdf"), "pdf");
  for (const name of ["a.mobi", "a.azw3", "a.epub.zip", "notes", "", undefined]) {
    assert.equal(app.bookKind(name), null, String(name));
  }
});

test("shelf: volumes sort naturally (2 before 10), case-insensitive", () => {
  const books = app.listBooks(
    [file("Series Vol 10.epub"), file("series vol 2.epub"), file("Series Vol 1.pdf")],
    LIMIT,
  );
  assert.deepEqual(plain(books.map((b) => b.name)), [
    "Series Vol 1.pdf",
    "series vol 2.epub",
    "Series Vol 10.epub",
  ]);
});

test("shelf: other formats and trashed files are left out; big files are marked", () => {
  const books = plain(
    app.listBooks(
      [
        file("a.epub"),
        file("b.mobi"),
        file("c.pdf", 30 * MB),
        file("d.epub", MB, { trashed: true }),
        file("e.pdf", LIMIT),
      ],
      LIMIT,
    ),
  );
  assert.deepEqual(
    books.map((b) => [b.name, b.tooBig]),
    [
      ["a.epub", false],
      ["c.pdf", true],
      ["e.pdf", false],
    ],
  );
});

test("shelf: a file is sendable only if it is a book inside the bookshelf and not too big", () => {
  assert.equal(app.checkSendable(file("a.epub"), FOLDER, LIMIT).ok, true);
  const cases = [
    [null, "not-found"],
    [file("a.epub", MB, { parentIds: ["someone-elses-folder"] }), "not-found"],
    [file("a.epub", MB, { parentIds: undefined }), "not-found"],
    [file("a.epub", MB, { trashed: true }), "not-found"],
    [file("taxes.xlsx"), "not-a-book"],
    [file("big.pdf", LIMIT + 1), "too-big"],
  ];
  for (const [f, reason] of cases) {
    assert.deepEqual(plain(app.checkSendable(f, FOLDER, LIMIT)), { ok: false, reason });
  }
});

test("shelf: sizes read well", () => {
  assert.equal(app.formatSize(1000), "0.1 MB");
  assert.equal(app.formatSize(1.25 * MB), "1.3 MB");
  assert.equal(app.formatSize(24.6 * MB), "25 MB");
});

const URL = "https://script.google.com/macros/s/FAKE/exec";
const TOKEN = "test-token-0123456789abcdefghijklmnop";
const ctx = { appUrl: URL, token: TOKEN };

test("pages: names from Drive are escaped everywhere", () => {
  const nasty = `<img src=x onerror="alert(1)">'&.epub`;
  const book = { ...app.listBooks([file(nasty)], LIMIT)[0] };
  for (const out of [
    app.renderList({ ...ctx, books: [book] }),
    app.renderConfirm({ ...ctx, book }),
    app.renderSent({ ...ctx, book }),
  ]) {
    assert.ok(!out.html.includes("<img"), out.title);
    assert.ok(out.html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&#39;&amp;.epub"));
  }
});

test("pages: every link and form targets the top window (HtmlService iframe)", () => {
  const book = app.listBooks([file("a.epub")], LIMIT)[0];
  const pages = [
    app.renderList({ ...ctx, books: [book] }),
    app.renderConfirm({ ...ctx, book }),
    app.renderSent({ ...ctx, book }),
    app.renderMessage(ctx, "Oops", "Text"),
    app.renderDiag(ctx),
  ];
  for (const { html, title } of pages) {
    const opened = html.match(/<(a|form)\s/g) || [];
    const targeted = html.match(/<(a|form)\s[^>]*target="_top"/g) || [];
    assert.ok(opened.length > 0, title);
    assert.equal(targeted.length, opened.length, title);
  }
});

test("pages: list links carry the token and file ID, URL-encoded", () => {
  const book = app.listBooks([file("a.epub")], LIMIT)[0];
  const { html } = app.renderList({ ...ctx, books: [book] });
  assert.ok(html.includes(`href="${URL}?t=${TOKEN}&amp;f=id-aepub"`));
  assert.equal(app.appLink(URL, { t: "a b&c", f: "x" }), URL + "?t=a%20b%26c&f=x");
});

test("pages: too-big books are shown but not linked", () => {
  const book = app.listBooks([file("huge.pdf", 40 * MB)], LIMIT)[0];
  const { html } = app.renderList({ ...ctx, books: [book] });
  assert.ok(html.includes("too big to send"));
  assert.ok(!html.includes("<a "));
});

test("pages: the confirm page sends with a POST form carrying t and f", () => {
  const book = app.listBooks([file("a.epub")], LIMIT)[0];
  const { html } = app.renderConfirm({ ...ctx, book });
  assert.match(
    html,
    /<form method="post" target="_top" action="https:\/\/script\.google\.com\/macros\/s\/FAKE\/exec">/,
  );
  assert.ok(html.includes(`<input type="hidden" name="t" value="${TOKEN}">`));
  assert.ok(html.includes('<input type="hidden" name="f" value="id-aepub">'));
});

test("pages: the not-found page reveals nothing and links nowhere", () => {
  const { html } = app.renderNotFound();
  assert.ok(!html.includes("<a"));
  assert.ok(!html.includes("t="));
  assert.ok(!/book|kindle|shelf/i.test(html.replace(/<style>.*<\/style>/, "")));
});

test("pages: the empty shelf and setup pages read sensibly", () => {
  assert.ok(app.renderList({ ...ctx, books: [] }).html.includes("No EPUB or PDF books"));
  const { html } = app.renderSetupNeeded(["KINDLE_EMAIL"]);
  assert.ok(html.includes("KINDLE_EMAIL"));
});
