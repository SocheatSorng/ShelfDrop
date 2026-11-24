// Repo hygiene: the Kindle address, the access token and clasp's files must never be committed.
// Real settings live only in the Apps Script project's Script Properties (see README).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const skipDirs = new Set([".git", "node_modules", "dist", "coverage", "out"]);
const textExt = new Set([".js", ".json", ".md", ".html", ".yml", ".yaml", ".txt", ".gs", ""]);

function repoFiles(dir = root) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!skipDirs.has(entry.name)) out.push(...repoFiles(path.join(dir, entry.name)));
    } else if (textExt.has(path.extname(entry.name))) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

// Obvious placeholders are allowed in docs; anything else that looks like a real address is not.
const placeholders = new Set(["yourname", "you", "name", "example", "your-kindle", "kindle-name"]);

test(".gitignore keeps secrets and clasp files out of git", () => {
  const lines = fs.readFileSync(path.join(root, ".gitignore"), "utf8").split(/\r?\n/);
  for (const required of [
    ".env",
    ".clasp.json",
    ".clasprc.json",
    ".deployment.json",
    "node_modules/",
  ]) {
    assert.ok(lines.includes(required), `.gitignore must list ${required}`);
  }
});

test("no real Kindle address is in any repo file", () => {
  const kindleAddress = /([A-Za-z0-9._%+-]+)@(free\.)?kindle\.com/g;
  const found = [];
  for (const file of repoFiles()) {
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(kindleAddress)) {
      if (!placeholders.has(match[1].toLowerCase())) {
        found.push(`${path.relative(root, file)}: ${match[0]}`);
      }
    }
  }
  assert.deepEqual(found, [], "Kindle addresses belong in Script Properties, not in the repo");
});

test("this test's own scanner catches a real-looking address", () => {
  const kindleAddress = /([A-Za-z0-9._%+-]+)@(free\.)?kindle\.com/g;
  // Built from pieces so this file itself never contains a real-looking address.
  const domain = "@" + "kindle.com";
  const sample = `send to reader_7f3k${domain} and yourname${domain}`;
  const real = [...sample.matchAll(kindleAddress)].filter((m) => !placeholders.has(m[1]));
  assert.equal(real.length, 1);
  assert.equal(real[0][1], "reader_7f3k");
});
