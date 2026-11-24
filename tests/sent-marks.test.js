// Phase 3: the day in Cambodia time (daily limit) and the "✓ sent <date>" marks. Pure functions.
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadSrc } = require("./helpers/apps-script");

const app = loadSrc();
const at = (y, mo, d, h, mi = 0) => Date.UTC(y, mo - 1, d, h, mi);

test("the day follows Cambodia time (UTC+7): it changes at 17:00 UTC", () => {
  assert.equal(app.localDay(at(2026, 11, 24, 16, 59)), "2026-11-24");
  assert.equal(app.localDay(at(2026, 11, 24, 17, 0)), "2026-11-25");
  assert.equal(app.localDay(at(2026, 12, 31, 18, 0)), "2027-01-01");
});

test("the daily count key uses the Cambodia day", () => {
  assert.equal(app.countKey(at(2026, 11, 24, 17, 30)), "_count:2026-11-25");
});

test("sent times are read from _sent:<fileId> keys; missing or bad values give none", () => {
  const props = {
    "_sent:a-file-id-01": String(at(2026, 11, 24, 3)),
    "_sent:bad-file-id-1": "soon",
    "_sent:zero-file-id1": "0",
    "_sent:minus-file-id": "-5",
    "_count:2026-11-24": "3",
    FOLDER_ID: "folder-test-0001",
  };
  const sent = app.sentTimes(props);
  assert.equal(sent.get("a-file-id-01"), at(2026, 11, 24, 3));
  assert.equal(sent.size, 1);
  assert.equal(app.sentTimes(undefined).size, 0);
  // A Map, so a file ID like "constructor" never reaches Object.prototype.
  assert.equal(app.sentTimes({}).get("constructor"), undefined);
});

test("the sent date: day and month this year, with the year otherwise, in Cambodia time", () => {
  const now = at(2026, 11, 24, 12);
  assert.equal(app.formatSentDate(at(2026, 11, 24, 3), now), "24 Nov");
  assert.equal(app.formatSentDate(at(2026, 1, 2, 3), now), "2 Jan");
  assert.equal(app.formatSentDate(at(2025, 11, 24, 3), now), "24 Nov 2025");
  // 17:30 UTC on the 24th is 00:30 on the 25th in Cambodia.
  assert.equal(app.formatSentDate(at(2026, 11, 24, 17, 30), now), "25 Nov");
  // New Year's Eve 18:00 UTC is 1 January in Cambodia: a different year from "now".
  assert.equal(app.formatSentDate(at(2026, 12, 31, 18), at(2026, 12, 31, 12)), "1 Jan 2027");
});

// Security review SF-1: a huge time made toISOString throw, breaking every page with a mark.
test("sent times too large for a date are skipped, not shown", () => {
  const sent = app.sentTimes({ "_sent:huge-file-id1": "1e300", "_sent:far-file-id01": "3e14" });
  assert.equal(sent.size, 0);
});
