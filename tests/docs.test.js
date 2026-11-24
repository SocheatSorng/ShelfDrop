// Phase 4: the README and the setup guide must stay in step with the code, because nobody re-runs
// the guide by hand (owner's decision). Each check names what in the docs points at nothing.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const docs = ["README.md", "docs/setup.md", "CHANGELOG.md"];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function srcText() {
  const dir = path.join(root, "src");
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => fs.readFileSync(path.join(dir, name), "utf8"))
    .join("\n");
}

const scripts = JSON.parse(read("package.json")).scripts;

// The Script Properties the code reads (source.X in src/settings.js).
const settingsRead = [
  ...new Set([...read("src/settings.js").matchAll(/\bsource\.([A-Z_]+)\b/g)].map((m) => m[1])),
];

for (const doc of docs) {
  test(`${doc}: every \`npm run <script>\` exists in package.json`, () => {
    const used = [...read(doc).matchAll(/npm run (?:--silent )?([a-z][a-z:-]*)/g)].map((m) => m[1]);
    assert.ok(used.length > 0 || doc === "CHANGELOG.md", "expected some npm run commands");
    for (const name of used) assert.ok(scripts[name], `${doc} uses missing script "${name}"`);
  });

  test(`${doc}: every relative link points to a file in the repo`, () => {
    const base = path.dirname(path.join(root, doc));
    for (const [, target] of read(doc).matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^[a-z]+:/i.test(target) || target.startsWith("#")) continue;
      const file = path.join(base, decodeURIComponent(target.split("#")[0]));
      assert.ok(fs.existsSync(file), `${doc} links to missing ${target}`);
    }
  });
}

test("the guide lists every Script Property the code reads, and no others", () => {
  const guide = read("docs/setup.md");
  const listed = [...new Set([...guide.matchAll(/^\| `([A-Z][A-Z_]+)`\s+\|/gm)].map((m) => m[1]))];
  assert.deepEqual([...listed].sort(), [...settingsRead].sort());
});

test("the guide's editor functions (**checkSetup**, ...) exist in src/", () => {
  const src = srcText();
  const names = [...read("docs/setup.md").matchAll(/\*\*([a-z]+[A-Z][A-Za-z]+)\*\*/g)].map(
    (m) => m[1],
  );
  assert.ok(names.includes("checkSetup") && names.includes("sendLinkToKindle"));
  for (const name of names) {
    assert.ok(src.includes(`\nfunction ${name}(`), `no function ${name} in src/`);
  }
});

test("the guide's code names and src/ paths exist (time zone note)", () => {
  const guide = read("docs/setup.md");
  for (const [, rel] of guide.matchAll(/`((?:src|tools|tests)\/[\w./-]+)`/g)) {
    assert.ok(fs.existsSync(path.join(root, rel)), `the guide names missing ${rel}`);
  }
  assert.match(guide, /LOCAL_UTC_OFFSET_MS/);
  assert.match(read("src/limits.js"), /var LOCAL_UTC_OFFSET_MS = /);
});

test("the CHANGELOG's newest entry is the package.json version", () => {
  const version = JSON.parse(read("package.json")).version;
  const first = /^## \[?(\d+\.\d+\.\d+)/m.exec(read("CHANGELOG.md"));
  assert.ok(first, "no version heading in CHANGELOG.md");
  assert.equal(first[1], version);
});

test("the license is MIT in package.json and LICENSE", () => {
  assert.equal(JSON.parse(read("package.json")).license, "MIT");
  assert.match(read("LICENSE"), /^MIT License/);
});
