// Settings come from the Apps Script project's Script Properties, never from the code.
//   FOLDER_ID     the Drive folder with the books
//   KINDLE_EMAIL  the Send to Kindle address
//   ACCESS_TOKEN  the secret in the bookmarked link
//   WEB_APP_URL   the web app's /exec URL that `npm run deploy` prints. Asking Apps Script for
//                 it (ScriptApp.getService().getUrl()) can return the owner-only /dev URL, which
//                 breaks every link on the Kindle.
//   MAX_MB        optional size limit in MB (default 25: Gmail's limit for one message)

var DEFAULT_MAX_MB = 25;

function isDriveId(id) {
  return typeof id === "string" && /^[A-Za-z0-9_-]{10,200}$/.test(id);
}

function isWebAppUrl(url) {
  return (
    typeof url === "string" &&
    /^https:\/\/script\.google\.com\/macros\/s\/AKfy[A-Za-z0-9_-]{20,120}\/exec$/.test(url)
  );
}

function isKindleEmail(address) {
  return (
    typeof address === "string" && /^[A-Za-z0-9._%+-]{1,64}@(free\.)?kindle\.com$/i.test(address)
  );
}

// Returns the settings plus the names (never the values) of any that are missing or invalid.
function readSettings(props) {
  const source = props || {};
  const problems = [];

  const folderId = String(source.FOLDER_ID || "").trim();
  if (!isDriveId(folderId)) problems.push("FOLDER_ID");

  const kindleEmail = String(source.KINDLE_EMAIL || "").trim();
  if (!isKindleEmail(kindleEmail)) problems.push("KINDLE_EMAIL");

  const token = String(source.ACCESS_TOKEN || "").trim();
  if (!isStrongToken(token)) problems.push("ACCESS_TOKEN");

  const webAppUrl = String(source.WEB_APP_URL || "").trim();
  if (!isWebAppUrl(webAppUrl)) problems.push("WEB_APP_URL");

  let maxMb = DEFAULT_MAX_MB;
  const rawMax = source.MAX_MB === undefined ? "" : String(source.MAX_MB).trim();
  if (rawMax !== "") {
    maxMb = Number(rawMax);
    if (!Number.isFinite(maxMb) || maxMb < 1 || maxMb > 50) {
      problems.push("MAX_MB");
      maxMb = DEFAULT_MAX_MB;
    }
  }

  return {
    folderId,
    kindleEmail,
    token,
    webAppUrl,
    maxBytes: Math.floor(maxMb * 1024 * 1024),
    problems,
  };
}
