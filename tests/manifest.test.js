// The manifest decides what the script may do: keep it to the two least-privilege scopes.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "src", "appsscript.json"), "utf8"),
);

test("runs on the V8 runtime", () => {
  assert.equal(manifest.runtimeVersion, "V8");
});

test("asks only for read-only Drive and send-only mail", () => {
  assert.deepEqual([...manifest.oauthScopes].sort(), [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/script.send_mail",
  ]);
});

test("web app runs as the owner and opens without a Google sign-in (token checked in code)", () => {
  assert.deepEqual(manifest.webapp, { executeAs: "USER_DEPLOYING", access: "ANYONE_ANONYMOUS" });
});

test("uses no advanced services or libraries", () => {
  assert.equal(manifest.dependencies, undefined);
});
