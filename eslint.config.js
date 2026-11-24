const js = require("@eslint/js");
const security = require("eslint-plugin-security");
const fs = require("node:fs");
const path = require("node:path");
const globals = require("globals");

// Apps Script services the code in src/ may use. Anything else is an undefined global (lint error).
const appsScriptGlobals = {
  DriveApp: "readonly",
  MailApp: "readonly",
  HtmlService: "readonly",
  PropertiesService: "readonly",
  LockService: "readonly",
  Utilities: "readonly",
  Logger: "readonly",
  ScriptApp: "readonly",
  console: "readonly",
};

// Apps Script loads every src/*.js file into one global scope, so a function or var declared at the
// top level of one file is a global in the others. Collect those names so no-undef still catches
// typos but accepts calls across files.
function sharedSrcGlobals() {
  const dir = path.join(__dirname, "src");
  const names = {};
  if (!fs.existsSync(dir)) return names;
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".js"))) {
    const code = fs.readFileSync(path.join(dir, file), "utf8");
    for (const match of code.matchAll(/^(?:function|var)\s+([A-Za-z_$][\w$]*)/gm)) {
      names[match[1]] = "readonly";
    }
  }
  return names;
}

module.exports = [
  { ignores: ["node_modules/", "dist/", "coverage/", "tests/out/"] },
  js.configs.recommended,
  security.configs.recommended,
  {
    // Apps Script (V8): every .js file in src/ shares one global scope; no import/export.
    // tests/helpers/apps-script.js loads them the same way in Node.
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: { ...appsScriptGlobals, ...sharedSrcGlobals() },
    },
    rules: {
      // Top-level functions in src/ are used by other files or by Apps Script itself (doGet/doPost).
      "no-unused-vars": ["error", { vars: "local", args: "after-used" }],
      // Each file's own declarations are also in the shared list above; that is not a redeclare.
      "no-redeclare": ["error", { builtinGlobals: false }],
    },
  },
  {
    files: ["tests/**/*.js", "tools/**/*.js", "*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
    // Tests use fixed repo paths and their own fake data; these rules only add noise there.
    rules: {
      "security/detect-non-literal-fs-filename": "off",
      "security/detect-object-injection": "off",
    },
  },
  {
    rules: {
      eqeqeq: "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
    },
  },
];
