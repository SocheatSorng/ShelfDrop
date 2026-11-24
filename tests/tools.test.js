const test = require("node:test");
const assert = require("node:assert/strict");
const { newToken } = require("../tools/new-token");
const deploy = require("../tools/clasp-deploy");
const { loadSrc } = require("./helpers/apps-script");

const app = loadSrc();

test("new tokens are strong by the web app's own rule, and different each time", () => {
  const a = newToken();
  const b = newToken();
  assert.equal(a.length, 43);
  assert.equal(app.isStrongToken(a), true);
  assert.notEqual(a, b);
});

test("deploy: script and deployment IDs are checked before reaching the shell", () => {
  assert.equal(deploy.isScriptId("1AbC_dEf-GhIjKlMnOpQrStUvWxYz0123456789"), true);
  for (const bad of ["", "short", "abc def ghi jkl mno pqr", "x".repeat(30) + "&calc", undefined]) {
    assert.equal(deploy.isScriptId(bad), false, String(bad));
  }
  assert.equal(deploy.isDeploymentId("AKfycbx" + "a".repeat(60)), true);
  assert.equal(deploy.isDeploymentId("AKfycbx" + "a".repeat(30) + " & del"), false);
});

test("deploy: the deployment ID is found in clasp's output", () => {
  const id = "AKfycbz" + "Q1w2E3r4".repeat(8);
  assert.equal(deploy.findDeploymentId(`Deployed ${id} @3\n`), id);
  assert.equal(deploy.findDeploymentId("Error: no permission"), null);
  assert.equal(deploy.webAppUrl(id), `https://script.google.com/macros/s/${id}/exec`);
});
