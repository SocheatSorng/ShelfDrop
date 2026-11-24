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
  WEB_APP_URL: "https://script.google.com/macros/s/" + "AKfy" + "cb" + "x".repeat(40) + "/exec",
};

test("settings: valid properties have no problems and a 25 MB default limit", () => {
  const s = plain(app.readSettings(good));
  assert.deepEqual(s.problems, []);
  assert.deepEqual(s.folderIds, [good.FOLDER_ID]);
  assert.equal(s.maxBytes, 25 * 1024 * 1024);
});

test("settings: missing or invalid properties are reported by name only", () => {
  const s = plain(
    app.readSettings({ FOLDER_ID: "../x", KINDLE_EMAIL: "me@gmail.com", ACCESS_TOKEN: "abc" }),
  );
  assert.deepEqual(s.problems, ["FOLDER_ID", "KINDLE_EMAIL", "ACCESS_TOKEN", "WEB_APP_URL"]);
  assert.deepEqual(plain(app.readSettings(undefined)).problems, [
    "FOLDER_ID",
    "KINDLE_EMAIL",
    "ACCESS_TOKEN",
    "WEB_APP_URL",
  ]);
});

test("settings: free.kindle.com and surrounding spaces are accepted", () => {
  const s = app.readSettings({ ...good, KINDLE_EMAIL: "  yourname@free.kindle.com " });
  assert.deepEqual(plain(s.problems), []);
  assert.equal(s.kindleEmail, "yourname@free.kindle.com");
});

test("settings: MAX_MB can only lower the limit, within 1 to 25 (Gmail refuses more)", () => {
  assert.equal(app.readSettings({ ...good, MAX_MB: "20" }).maxBytes, 20 * 1024 * 1024);
  for (const bad of ["0", "26", "40", "lots", "-5"]) {
    const s = app.readSettings({ ...good, MAX_MB: bad });
    assert.deepEqual(plain(s.problems), ["MAX_MB"], bad);
    assert.equal(s.maxBytes, 25 * 1024 * 1024);
  }
});

test("settings: WEB_APP_URL must be a script.google.com /exec deployment URL", () => {
  const base = "https://script.google.com/macros/s/" + "AKfy" + "cb" + "x".repeat(40);
  assert.deepEqual(
    plain(app.readSettings({ ...good, WEB_APP_URL: " " + base + "/exec " }).problems),
    [],
  );
  for (const bad of [
    "",
    base + "/dev",
    base + "/exec?t=x",
    base.replace("script.google.com", "evil.example") + "/exec",
    "http://script.google.com/macros/s/" + "AKfy" + "cb" + "x".repeat(40) + "/exec",
  ]) {
    assert.deepEqual(
      plain(app.readSettings({ ...good, WEB_APP_URL: bad }).problems),
      ["WEB_APP_URL"],
      bad,
    );
  }
});

// Phase 2 decision 1: books live in several Google accounts, one shared folder each.
test("settings: FOLDER_ID takes several folder IDs, comma- or space-separated", () => {
  const a = "1AbCdEfGhIjKlMnOpQrStUv";
  const b = "1ZyXwVuTsRqPoNmLkJiHgFe";
  for (const value of [
    a + "," + b,
    " " + a + " , " + b + " ",
    a + "\n" + b,
    a + "," + b + "," + a,
  ]) {
    const s = plain(app.readSettings({ ...good, FOLDER_ID: value }));
    assert.deepEqual(s.problems, [], value);
    assert.deepEqual(s.folderIds, [a, b], value);
  }
});

test("settings: one bad ID, an empty list or more than 10 folders is a FOLDER_ID problem", () => {
  const ids = Array.from(
    { length: 11 },
    (_, i) => "1AbCdEfGhIjKlMnOpQr" + String(i).padStart(4, "0"),
  );
  for (const value of ["", " , ", "1AbCdEfGhIjKlMnOpQrStUv,../x", ids.join(",")]) {
    const s = plain(app.readSettings({ ...good, FOLDER_ID: value }));
    assert.deepEqual(s.problems, ["FOLDER_ID"], value);
    assert.deepEqual(s.folderIds, [], value);
  }
  assert.deepEqual(
    plain(app.readSettings({ ...good, FOLDER_ID: ids.slice(0, 10).join(",") }).problems),
    [],
  );
});
