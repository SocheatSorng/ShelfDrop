const js = require("@eslint/js");
const security = require("eslint-plugin-security");
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
  Session: "readonly",
};

module.exports = [
  { ignores: ["node_modules/", "dist/", "coverage/", "tests/out/"] },
  js.configs.recommended,
  security.configs.recommended,
  {
    // Apps Script (V8): every .js file in src/ shares one global scope; no import/export.
    // Files end with `if (typeof module !== "undefined") module.exports = {...}` so the tests can
    // load them in Node; in Apps Script `module` is undefined and the line does nothing.
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: { ...appsScriptGlobals, module: "writable" },
    },
    rules: {
      // Top-level functions in src/ are used by other files or by Apps Script itself (doGet/doPost).
      "no-unused-vars": ["error", { vars: "local", args: "after-used" }],
    },
  },
  {
    files: ["tests/**/*.js", "*.js"],
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
