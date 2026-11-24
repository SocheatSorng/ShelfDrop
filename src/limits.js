// Limits on sending, so a leaked link can't flood the Kindle or use up the account's mail quota.
// State lives in Script Properties under keys starting with "_" (settings never start with "_"):
//   _sent:<fileId>      when that file was last sent (ms since 1970)
//   _count:<YYYY-MM-DD> how many books were sent that day (Cambodia time)

var DAILY_SEND_CAP = 15;
var RESEND_COOLDOWN_MS = 10 * 60 * 1000;

function sentKey(fileId) {
  return "_sent:" + fileId;
}

// The owner's time zone, Asia/Phnom_Penh: UTC+7 all year (Cambodia has no daylight saving), so a
// fixed offset is exact and keeps this pure. It decides the daily limit's day and the sent dates.
var LOCAL_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

// The calendar date (YYYY-MM-DD) in Cambodia at the given moment.
function localDay(now) {
  return new Date(now + LOCAL_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

function countKey(now) {
  return "_count:" + localDay(now);
}

// When each file was last sent (ms), by file ID, from all Script Properties. Bad values are skipped.
function sentTimes(props) {
  const times = new Map();
  for (const [key, value] of Object.entries(props || {})) {
    if (!key.startsWith("_sent:")) continue;
    const ms = Number(value);
    if (Number.isFinite(ms) && ms > 0) times.set(key.slice("_sent:".length), ms);
  }
  return times;
}

var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "24 Nov" for a date this year, "24 Nov 2025" otherwise, in Cambodia time.
function formatSentDate(ms, now) {
  const [year, month, day] = localDay(ms).split("-").map(Number);
  const text = day + " " + MONTHS[month - 1];
  return localDay(now).slice(0, 4) === String(year) ? text : text + " " + year;
}

// state: { get(key) -> string|null }
function checkSendLimits(state, fileId, now) {
  const last = Number(state.get(sentKey(fileId)));
  if (last && now - last >= 0 && now - last < RESEND_COOLDOWN_MS) {
    return { ok: false, reason: "cooldown" };
  }
  const count = Number(state.get(countKey(now))) || 0;
  if (count >= DAILY_SEND_CAP) return { ok: false, reason: "daily-cap" };
  return { ok: true, count };
}

// state: { set(key, value), keys() -> string[], remove(key) }
function recordSend(state, fileId, now, count) {
  const today = countKey(now);
  state.set(sentKey(fileId), String(now));
  state.set(today, String(count + 1));
  for (const key of state.keys()) {
    if (key.startsWith("_count:") && key !== today) state.remove(key);
  }
}

function limitText(reason) {
  if (reason === "cooldown") {
    return "This book was sent a few minutes ago. Give it a moment to arrive.";
  }
  if (reason === "busy") return "Another book is being sent right now. Try again in a moment.";
  return "That's the limit of " + DAILY_SEND_CAP + " books for today. Try again tomorrow.";
}
