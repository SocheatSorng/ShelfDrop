// The phase 2 shelf: series folders and loose books from one or more shelf folders.
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadSrc, plain } = require("./helpers/apps-script");

const app = loadSrc();
const MB = 1024 * 1024;
const LIMIT = 25 * MB;
const SHELF_A = "shelf-a-000001";
const SHELF_B = "shelf-b-000001";

function book(name, parentId, extra = {}) {
  return {
    id: "id-" + name.replace(/\W/g, ""),
    name,
    size: MB,
    mimeType: name.endsWith(".pdf") ? "application/pdf" : "application/epub+zip",
    trashed: false,
    parentIds: [parentId],
    ...extra,
  };
}

function folder(id, name, parentId, extra = {}) {
  return { id, name, trashed: false, parentIds: [parentId], ...extra };
}

test("shelf: series are the shelf's subfolders in natural order, loose books listed apart", () => {
  const shelf = plain(
    app.buildShelf(
      [
        {
          folders: [
            folder("ser-10", "Series 10", SHELF_A),
            folder("ser-2", "series 2", SHELF_A),
            folder("ser-old", "Old", SHELF_A, { trashed: true }),
          ],
          files: [
            book("Loose B.pdf", SHELF_A),
            book("Loose A.epub", SHELF_A),
            book("x.mobi", SHELF_A),
          ],
        },
      ],
      LIMIT,
    ),
  );
  assert.deepEqual(
    shelf.series.map((s) => [s.name, s.ids]),
    [
      ["series 2", ["ser-2"]],
      ["Series 10", ["ser-10"]],
    ],
  );
  assert.deepEqual(
    shelf.loose.map((b) => b.name),
    ["Loose A.epub", "Loose B.pdf"],
  );
  assert.equal(shelf.unreadable, 0);
});

test("shelf: same-named series from two accounts become one; unreadable folders are counted", () => {
  const shelf = plain(
    app.buildShelf(
      [
        {
          folders: [folder("a-isekai", "Isekai Tales", SHELF_A)],
          files: [book("A.epub", SHELF_A)],
        },
        null,
        {
          folders: [
            folder("b-isekai", " isekai  tales ", SHELF_B),
            folder("b-other", "Other", SHELF_B),
          ],
          files: [book("B.epub", SHELF_B)],
        },
      ],
      LIMIT,
    ),
  );
  assert.deepEqual(
    shelf.series.map((s) => [s.name, s.ids]),
    [
      ["Isekai Tales", ["a-isekai", "b-isekai"]],
      ["Other", ["b-other"]],
    ],
  );
  assert.deepEqual(
    shelf.loose.map((b) => b.name),
    ["A.epub", "B.epub"],
  );
  assert.equal(shelf.unreadable, 1);
});

test("shelf: a series is found only by an ID the shelf listing itself produced", () => {
  const shelf = app.buildShelf(
    [{ folders: [folder("ser-1", "One", SHELF_A), folder("ser-2", "one", SHELF_A)], files: [] }],
    LIMIT,
  );
  assert.equal(app.findSeries(shelf, "ser-2").name, "One");
  assert.deepEqual(plain(app.findSeries(shelf, "ser-2").ids), ["ser-1", "ser-2"]);
  for (const id of ["ser-3", SHELF_A, "", undefined]) {
    assert.equal(app.findSeries(shelf, id), null, String(id));
  }
});

test("shelf: a series' volumes come from all its folders, books only, natural order", () => {
  const volumes = plain(
    app.listVolumes(
      [
        { folders: [], files: [book("Tales Vol 10.epub", "a"), book("notes.txt", "a")] },
        { folders: [folder("inner", "Extras", "b")], files: [book("Tales Vol 2.pdf", "b")] },
      ],
      LIMIT,
    ),
  );
  assert.deepEqual(
    volumes.map((b) => b.name),
    ["Tales Vol 2.pdf", "Tales Vol 10.epub"],
  );
});

test("send check: a loose book or a volume in a series folder of any shelf folder is sendable", () => {
  const shelfIds = [SHELF_A, SHELF_B];
  const loose = app.checkSendable(book("A.epub", SHELF_B), shelfIds, LIMIT, []);
  assert.equal(loose.ok, true);
  assert.equal(loose.seriesId, null);
  const series = folder("ser-1", "One", SHELF_A);
  const volume = app.checkSendable(book("One 1.epub", "ser-1"), shelfIds, LIMIT, [series]);
  assert.equal(volume.ok, true);
  assert.equal(volume.seriesId, "ser-1");
});

// Security review N6: never trust where a file claims to be; check its real parents.
test("send check: files deeper down, beside the shelf, or under a trashed series are refused", () => {
  const shelfIds = [SHELF_A];
  const deep = folder("extras", "Extras", "ser-1");
  const elsewhere = folder("other", "Other", "someone-elses-root");
  const trashed = folder("ser-old", "Old", SHELF_A, { trashed: true });
  const cases = [
    [book("x.epub", "extras"), [deep]],
    [book("x.epub", "other"), [elsewhere]],
    [book("x.epub", "ser-old"), [trashed]],
    [book("x.epub", "ser-1"), []], // parent folder couldn't be read
    [book("x.epub", "ser-1"), [folder("ser-2", "Two", SHELF_A)]], // a folder that isn't a parent
  ];
  for (const [file, parents] of cases) {
    assert.deepEqual(plain(app.checkSendable(file, shelfIds, LIMIT, parents)), {
      ok: false,
      reason: "not-found",
    });
  }
});

test("send check: the parents to look up are the file's parents that aren't shelf folders", () => {
  const file = book("x.epub", "ser-1", { parentIds: ["ser-1", SHELF_A, "ser-9"] });
  assert.deepEqual(plain(app.parentsToCheck(file, [SHELF_A])), ["ser-1", "ser-9"]);
  assert.deepEqual(plain(app.parentsToCheck(null, [SHELF_A])), []);
});

// Review N18: a folder named only with spaces still gets a visible, tappable name.
test("shelf: a series folder with a blank name is shown as (no name)", () => {
  const shelf = app.buildShelf(
    [{ folders: [folder("blank-1", "   ", SHELF_A)], files: [] }],
    LIMIT,
  );
  assert.equal(shelf.series[0].name, "(no name)");
});

// Review SF2: the shelf knows when a listing was cut short.
test("shelf: listings cut short at the size limit are counted", () => {
  const shelf = app.buildShelf(
    [
      { folders: [], files: [], truncated: true },
      { folders: [], files: [] },
    ],
    LIMIT,
  );
  assert.equal(shelf.truncated, 1);
  assert.equal(app.buildShelf([{ folders: [], files: [] }], LIMIT).truncated, 0);
});
