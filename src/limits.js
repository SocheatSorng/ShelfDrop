// Limits on sending, so a leaked link can't flood the Kindle or use up the account's mail quota.
// State lives in Script Properties under keys starting with "_" (settings never start with "_"):
//   _sent:<fileId>      when that file was last sent (ms since 1970)
//   _count:<YYYY-MM-DD> how many books were sent that day (UTC)

var DAILY_SEND_CAP = 15;
var RESEND_COOLDOWN_MS = 10 * 60 * 1000;

function sentKey(fileId) {
  return "_sent:" + fileId;
}

function countKey(now) {
  return "_count:" + new Date(now).toISOString().slice(0, 10);
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
