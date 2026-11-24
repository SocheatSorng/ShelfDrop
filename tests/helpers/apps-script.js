// Loads every src/*.js file into one shared global scope, the way Apps Script does, so tests run
// the real files unchanged. Pass fake Apps Script services (DriveApp, MailApp, ...) as `globals`.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const srcDir = path.join(__dirname, "..", "..", "src");

function srcFiles() {
  return fs
    .readdirSync(srcDir)
    .filter((name) => name.endsWith(".js"))
    .sort();
}

function loadSrc(globals = {}) {
  const context = vm.createContext({ ...globals });
  for (const name of srcFiles()) {
    const code = fs.readFileSync(path.join(srcDir, name), "utf8");
    vm.runInContext(code, context, { filename: `src/${name}` });
  }
  return context;
}

// Objects made inside the vm have other prototypes; compare them as plain JSON data.
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = { loadSrc, plain, srcDir, srcFiles };
