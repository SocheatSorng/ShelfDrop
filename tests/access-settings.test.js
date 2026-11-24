const test = require("node:test");
const assert = require("node:assert/strict");
const { loadSrc, plain } = require("./helpers/apps-script");

const app = loadSrc();
const TOKEN = "test-token-0123456789abcdefghijklmnop"; // fake, 37 characters

test("token: the right token matches", () => {
  assert.equal(app.tokenMatches(TOKEN, TOKEN), true);
});

test("token: wrong, shorter, longer, empty or missing tokens don't match", () => {
  for (const given of [
    TOKEN.slice(0, -1) + "X",
    TOKEN.slice(0, -1),
    TOKEN + "a",
    "",
    undefined,
    null,
    123,
  ]) {
    assert.equal(app.tokenMatches(given, TOKEN), false, `given ${String(given)}`);
  }
});

test("token: nothing matches when the setting is missing, short or has odd characters", () => {
  for (const expected of ["", undefined, "short-token", "a".repeat(31), "a".repeat(40) + " "]) {
    assert.equal(app.tokenMatches(expected, expected), false, `expected ${String(expected)}`);
  }
});

test("token: a 32-character URL-safe token is strong enough", () => {
  assert.equal(app.isStrongToken("A".repeat(16) + "z9_-".repeat(4)), true);
  assert.equal(app.isStrongToken("é".repeat(40)), false);
});

const good = {
  FOLDER_ID: "1AbCdEfGhIjKlMnOpQrStUv",
  KINDLE_EMAIL: "yourname@kindle.com",
  ACCESS_TOKEN: TOKEN,
};

test("settings: valid properties have no problems and a 25 MB default limit", () => {
  const s = plain(app.readSettings(good));
  assert.deepEqual(s.problems, []);
  assert.equal(s.folderId, good.FOLDER_ID);
  assert.equal(s.maxBytes, 25 * 1024 * 1024);
});

test("settings: missing or invalid properties are reported by name only", () => {
  const s = plain(
    app.readSettings({ FOLDER_ID: "../x", KINDLE_EMAIL: "me@gmail.com", ACCESS_TOKEN: "abc" }),
  );
  assert.deepEqual(s.problems, ["FOLDER_ID", "KINDLE_EMAIL", "ACCESS_TOKEN"]);
  assert.deepEqual(plain(app.readSettings(undefined)).problems, [
    "FOLDER_ID",
    "KINDLE_EMAIL",
    "ACCESS_TOKEN",
  ]);
});

test("settings: free.kindle.com and surrounding spaces are accepted", () => {
  const s = app.readSettings({ ...good, KINDLE_EMAIL: "  yourname@free.kindle.com " });
  assert.deepEqual(plain(s.problems), []);
  assert.equal(s.kindleEmail, "yourname@free.kindle.com");
});

test("settings: MAX_MB can change the limit, within 1 to 50", () => {
  assert.equal(app.readSettings({ ...good, MAX_MB: "30" }).maxBytes, 30 * 1024 * 1024);
  for (const bad of ["0", "51", "lots", "-5"]) {
    const s = app.readSettings({ ...good, MAX_MB: bad });
    assert.deepEqual(plain(s.problems), ["MAX_MB"], bad);
    assert.equal(s.maxBytes, 25 * 1024 * 1024);
  }
});
