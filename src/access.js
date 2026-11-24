// The secret token in the bookmarked link is the only lock on the page.

var MIN_TOKEN_LENGTH = 32;

// A usable token: long, and only URL-safe characters (what tools/new-token.js makes).
function isStrongToken(token) {
  return (
    typeof token === "string" && token.length >= MIN_TOKEN_LENGTH && /^[A-Za-z0-9_-]+$/.test(token)
  );
}

// Compares in time that depends only on the expected token's length, so the response time
// doesn't reveal how many leading characters of a guess were right.
function tokenMatches(given, expected) {
  if (!isStrongToken(expected) || typeof given !== "string") return false;
  let diff = given.length ^ expected.length;
  for (let i = 0; i < expected.length; i++) {
    const g = i < given.length ? given.charCodeAt(i) : 0;
    diff |= g ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
