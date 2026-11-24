// Repo hygiene: the Kindle address, the access token, deployment IDs and clasp's files must never be
// committed (the repo is public). Real settings live only in Script Properties (see README).
// gitleaks runs the same token and deployment-ID patterns from .gitleaks.toml.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.join(__dirname, "..");

// Every file git would commit: tracked files plus new files that aren't git-ignored.
function repoFiles() {
  const out = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    {
      cwd: root,
      encoding: "utf8",
    },
  );
  return out
    .split("\0")
    .filter(Boolean)
    .map((name) => path.join(root, name))
    .filter((file) => fs.existsSync(file));
}

function readText(file) {
  const bytes = fs.readFileSync(file);
  return bytes.includes(0) ? null : bytes.toString("utf8"); // skip binary files
}

// Obvious placeholders are allowed in docs; anything else that looks real is not.
const placeholders = new Set(["yourname", "you", "name", "example", "your-kindle", "kindle-name"]);

const scanners = [
  {
    what: "Kindle address",
    pattern: /([A-Za-z0-9._%+-]+)@(free\.)?kindle\.com/g,
    allowed: (m) => placeholders.has(m[1].toLowerCase()),
  },
  {
    what: "access token in a link",
    pattern: /[?&]t=([A-Za-z0-9_-]{32,})/g,
    allowed: (m) => m[1].startsWith("test-token"),
  },
  {
    what: "access token value",
    pattern: /ACCESS_TOKEN["'`]?\s*[:=]\s*["'`]?([A-Za-z0-9_-]{32,})/g,
    allowed: (m) => m[1].startsWith("test-token"),
  },
  { what: "web app deployment ID", pattern: /AKfy[A-Za-z0-9_-]{40,}/g, allowed: () => false },
];

function findSecrets(text) {
  const found = [];
  for (const { what, pattern, allowed } of scanners) {
    for (const match of text.matchAll(pattern)) {
      if (!allowed(match)) found.push(`${what}: ${match[0].slice(0, 12)}…`);
    }
  }
  return found;
}

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

test("no Kindle address, token or deployment ID is in any file git would commit", () => {
  const files = repoFiles();
  assert.ok(files.length > 10, "git ls-files found the repo");
  const found = [];
  for (const file of files) {
    const text = readText(file);
    if (text === null) continue;
    for (const hit of findSecrets(text)) found.push(`${path.relative(root, file)}: ${hit}`);
  }
  assert.deepEqual(found, [], "these belong in Script Properties or git-ignored files");
});

test("the scanners catch real-looking values and let placeholders through", () => {
  // Built from pieces so this file itself never contains a real-looking value.
  const domain = "@" + "kindle.com";
  const token = "Zq9" + "xY7_wV5-uT3sR1qP0oN8mL6kJ4iH2gF";
  const deployment = "AKfy" + "cbz" + "Q1w2E3r4".repeat(6);
  const exec = "https://script.google.com/macros/s/x/exec";
  assert.deepEqual(
    findSecrets(`yourname${domain}, ${exec}?t=test-token-0123456789abcdefghijkl`),
    [],
  );
  assert.equal(findSecrets(`reader_7f3k${domain}`).length, 1);
  assert.equal(findSecrets(`${exec}?t=${token}`).length, 1);
  assert.equal(findSecrets(`ACCESS_TOKEN = "${token}"`).length, 1);
  assert.equal(findSecrets(`deployed ${deployment}`).length, 1);
});
