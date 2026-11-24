const test = require("node:test");
const assert = require("node:assert/strict");
const { loadSrc, plain } = require("./helpers/apps-script");

const app = loadSrc();
const MB = 1024 * 1024;
const LIMIT = 25 * MB;
const FOLDER = "folder-test-0001";

function mimeOf(name) {
  return name.endsWith(".pdf") ? "application/pdf" : "application/epub+zip";
}

function file(name, size = MB, extra = {}) {
  return {
    id: "id-" + name.replace(/\W/g, ""),
    name,
    size,
    mimeType: mimeOf(name),
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
  assert.equal(app.checkSendable(file("a.epub"), [FOLDER], LIMIT).ok, true);
  const cases = [
    [null, "not-found"],
    [file("a.epub", MB, { parentIds: ["someone-elses-folder"] }), "not-found"],
    [file("a.epub", MB, { parentIds: undefined }), "not-found"],
    [file("a.epub", MB, { trashed: true }), "not-found"],
    [file("taxes.xlsx"), "not-a-book"],
    [file("big.pdf", LIMIT + 1), "too-big"],
  ];
  for (const [f, reason] of cases) {
    assert.deepEqual(plain(app.checkSendable(f, [FOLDER], LIMIT)), { ok: false, reason });
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
const SERIES = { name: "Sample Series", ids: ["ser-1", "ser-2"] };

function seriesPage(volumes, extra = {}) {
  return app.renderSeries({ ...ctx, series: SERIES, seriesId: "ser-2", volumes, ...extra });
}

function shelfPage(extra = {}) {
  return app.renderShelf({ ...ctx, series: [SERIES], loose: [], unreadable: 0, ...extra });
}

test("pages: names from Drive are escaped everywhere", () => {
  const nasty = `<img src=x onerror="alert(1)">'&.epub`;
  const book = { ...app.listBooks([file(nasty)], LIMIT)[0] };
  for (const out of [
    seriesPage([book]),
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
    seriesPage([book]),
    app.renderConfirm({ ...ctx, book }),
    app.renderSent({ ...ctx, book }),
    app.renderMessage(ctx, "Oops", "Text"),
    shelfPage({ loose: [book] }),
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
  const { html } = seriesPage([book]);
  assert.ok(html.includes(`href="${URL}?t=${TOKEN}&amp;f=id-aepub"`));
  assert.equal(app.appLink(URL, { t: "a b&c", f: "x" }), URL + "?t=a%20b%26c&f=x");
});

test("pages: too-big books are shown but not linked", () => {
  const book = app.listBooks([file("huge.pdf", 40 * MB)], LIMIT)[0];
  const { html } = seriesPage([book]);
  assert.ok(html.includes("too big to send"));
  assert.ok(!html.includes("f=id-hugepdf"));
});

test("pages: no page links to the old browser check or runs a script", () => {
  for (const { html } of [seriesPage([]), shelfPage()]) {
    assert.ok(!html.includes("diag") && !html.includes("<script"));
  }
  assert.equal(app.renderDiag, undefined);
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
  assert.ok(seriesPage([]).html.includes("No books yet"));
  assert.ok(shelfPage({ series: [] }).html.includes("No series or books"));
  const { html } = app.renderSetupNeeded(["KINDLE_EMAIL"]);
  assert.ok(html.includes("KINDLE_EMAIL"));
});

// Security review S3: Google Docs, shortcuts and empty files named ".pdf" are not books.
test("shelf: Google-native files and empty files are never books, whatever their name", () => {
  const fakes = [
    file("Notes.pdf", 0, { mimeType: "application/vnd.google-apps.document" }),
    file("Link.pdf", 1, { mimeType: "application/vnd.google-apps.shortcut" }),
    file("Folder.epub", 1, { mimeType: "application/vnd.google-apps.folder" }),
    file("Empty.epub", 0),
  ];
  assert.deepEqual(plain(app.listBooks(fakes, LIMIT)), []);
  for (const f of fakes) {
    assert.deepEqual(plain(app.checkSendable(f, [FOLDER], LIMIT)), {
      ok: false,
      reason: "not-a-book",
    });
  }
});

test("shelf: an EPUB uploaded with a generic type still counts", () => {
  const f = file("Odd upload.epub", MB, { mimeType: "application/octet-stream" });
  assert.equal(app.checkSendable(f, [FOLDER], LIMIT).ok, true);
});

test("pages: the shelf links each series by its first folder ID, then lists loose books", () => {
  const loose = app.listBooks([file("Loose One.epub")], LIMIT);
  const { title, html } = shelfPage({ loose });
  assert.equal(title, "Bookshelf");
  assert.ok(html.includes(`href="${URL}?t=${TOKEN}&amp;s=ser-1">Sample Series</a>`));
  assert.ok(html.indexOf("Sample Series") < html.indexOf("<h2>Books</h2>"));
  assert.ok(html.includes(`href="${URL}?t=${TOKEN}&amp;f=id-LooseOneepub"`));
  assert.ok(!shelfPage().html.includes("<h2>Books</h2>"));
});

test("pages: the shelf says when a shelf folder couldn't be read, without its ID", () => {
  assert.ok(shelfPage({ unreadable: 1 }).html.includes("1 shelf folder couldn&#39;t be read"));
  assert.ok(shelfPage({ unreadable: 2 }).html.includes("2 shelf folders couldn&#39;t be read"));
  assert.ok(!shelfPage().html.includes("couldn"));
});

test("pages: shelf and series pages have a Refresh link; the series page goes back to the shelf", () => {
  assert.ok(shelfPage().html.includes(`href="${URL}?t=${TOKEN}&amp;r=1">Refresh</a>`));
  const { title, html } = seriesPage([]);
  assert.equal(title, "Sample Series");
  assert.ok(html.includes(`href="${URL}?t=${TOKEN}&amp;s=ser-2&amp;r=1">Refresh</a>`));
  assert.ok(html.includes(`href="${URL}?t=${TOKEN}">&larr; Back to the shelf</a>`));
});

// UI pass: on the Kindle a long series must not need a scroll to reach Back or Refresh.
test("pages: Back and Refresh come before the list; a long series repeats Back at its end", () => {
  const back = `href="${URL}?t=${TOKEN}">&larr; Back to the shelf</a>`;
  const books = app.listBooks(
    Array.from({ length: 13 }, (_, i) => file(`Tales Vol ${i + 1}.epub`)),
    LIMIT,
  );
  const { html } = seriesPage(books);
  const firstBook = html.indexOf("Tales Vol 1.epub");
  assert.ok(html.indexOf(back) < firstBook);
  assert.ok(html.indexOf('&amp;r=1">Refresh</a>') < firstBook);
  assert.ok(html.lastIndexOf(back) > html.indexOf("Tales Vol 13.epub"));
  assert.equal(seriesPage(books.slice(0, 2)).html.split(back).length, 2); // short: Back once
  const shelf = shelfPage().html;
  assert.ok(shelf.indexOf(">Refresh</a>") < shelf.indexOf("Sample Series"));
});

test("pages: confirm and sent pages go back to the book's series, or to the shelf", () => {
  const book = app.listBooks([file("a.epub")], LIMIT)[0];
  for (const render of [app.renderConfirm, app.renderSent]) {
    const inSeries = render({ ...ctx, book, seriesId: "ser-2" }).html;
    assert.ok(
      inSeries.includes(`href="${URL}?t=${TOKEN}&amp;s=ser-2">&larr; Back to the series</a>`),
    );
    const loose = render({ ...ctx, book, seriesId: null }).html;
    assert.ok(loose.includes(`href="${URL}?t=${TOKEN}">&larr; Back to the shelf</a>`));
  }
});

test("pages: series names are escaped on the shelf and as the series page title", () => {
  const nasty = { name: '<b onclick="x">&</b>', ids: ["ser-1"] };
  assert.ok(!shelfPage({ series: [nasty] }).html.includes("<b "));
  const page = app.renderSeries({ ...ctx, series: nasty, seriesId: "ser-1", volumes: [] });
  assert.ok(!page.html.includes("<b "));
});

// Security review SF2: a listing cut short at 300 files / 100 folders says so, without an ID.
test("pages: shelf and series pages say when some books aren't shown", () => {
  const text = "Some books aren&#39;t shown: a folder holds too many files.";
  assert.ok(shelfPage({ truncated: 1 }).html.includes(text));
  assert.ok(seriesPage([], { truncated: 1 }).html.includes(text));
  assert.ok(!shelfPage().html.includes("aren&#39;t shown"));
  assert.ok(!seriesPage([]).html.includes("aren&#39;t shown"));
});

// Scope change 2026-11-24: a book in a volume folder shows the folder name, file name underneath.
test("pages: a volume-folder book shows its folder name, with the file name in the meta line", () => {
  const [book] = app.listBooks([file("scan<5>.epub")], LIMIT, 'Volume "5" & <i>');
  for (const { html } of [seriesPage([book]), app.renderConfirm({ ...ctx, book })]) {
    assert.ok(html.includes("Volume &quot;5&quot; &amp; &lt;i&gt;"));
    assert.ok(html.includes("scan&lt;5&gt;.epub &middot; EPUB"));
    assert.ok(!html.includes("<i>"));
  }
  const [plainBook] = app.listBooks([file("Tales 1.epub")], LIMIT);
  assert.ok(!seriesPage([plainBook]).html.includes("Tales 1.epub &middot;"));
});
