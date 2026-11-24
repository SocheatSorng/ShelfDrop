// Pushes src/ to the owner's Apps Script project and deploys the web app with clasp 3.4.1.
//   node tools/clasp-deploy.js init <scriptId>   writes .clasp.json (git-ignored)
//   node tools/clasp-deploy.js deploy            push + deploy, keeping the same web app URL
// clasp runs through npx at a pinned version and is not a project dependency (see
// docs/phase1-plan.md). The deployment ID is kept in .deployment.json (git-ignored).
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const CLASP = "@google/clasp@3.4.1";
const root = path.join(__dirname, "..");
const claspFile = path.join(root, ".clasp.json");
const deploymentFile = path.join(root, ".deployment.json");

function isScriptId(id) {
  return typeof id === "string" && /^[A-Za-z0-9_-]{20,100}$/.test(id);
}

// Apps Script deployment IDs start with "AKfy".
function isDeploymentId(id) {
  return typeof id === "string" && /^AKfy[A-Za-z0-9_-]{20,120}$/.test(id);
}

function findDeploymentId(output) {
  const match = /\b(AKfy[A-Za-z0-9_-]{20,120})\b/.exec(String(output));
  return match ? match[1] : null;
}

function webAppUrl(deploymentId) {
  return "https://script.google.com/macros/s/" + deploymentId + "/exec";
}

function clasp(args) {
  // Every argument is a fixed word or a value checked above, so running through the shell (needed
  // for npx.cmd on Windows) can't inject anything.
  const result = spawnSync("npx", ["--yes", CLASP, ...args], {
    cwd: root,
    shell: true,
    encoding: "utf8",
    stdio: ["inherit", "pipe", "inherit"],
  });
  process.stdout.write(result.stdout || "");
  if (result.status !== 0) {
    throw new Error("clasp " + args[0] + " failed (exit " + result.status + ")");
  }
  return result.stdout || "";
}

function init(scriptId) {
  if (!isScriptId(scriptId)) throw new Error("That doesn't look like a Script ID.");
  if (fs.existsSync(claspFile)) throw new Error(".clasp.json already exists; delete it first.");
  fs.writeFileSync(claspFile, JSON.stringify({ scriptId, rootDir: "src" }, null, 2) + "\n");
  console.log("Wrote .clasp.json (git-ignored).");
}

function deploy() {
  if (!fs.existsSync(claspFile)) throw new Error("Run init <scriptId> first.");
  const version = require(path.join(root, "package.json")).version;
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Odd version in package.json.");
  const description = '"ShelfDrop ' + version + '"';

  clasp(["push", "--force"]);

  let deploymentId;
  if (fs.existsSync(deploymentFile)) {
    deploymentId = JSON.parse(fs.readFileSync(deploymentFile, "utf8")).deploymentId;
    if (!isDeploymentId(deploymentId)) throw new Error(".deployment.json has an odd ID.");
    clasp(["create-deployment", "-i", deploymentId, "-d", description]);
  } else {
    deploymentId = findDeploymentId(clasp(["create-deployment", "-d", description]));
    if (!deploymentId) {
      throw new Error("Couldn't read the deployment ID; run `npm run clasp -- deployments`.");
    }
    fs.writeFileSync(deploymentFile, JSON.stringify({ deploymentId }, null, 2) + "\n");
  }
  console.log("\nWeb app URL (add ?t=<your token> to open it):\n" + webAppUrl(deploymentId));
}

if (require.main === module) {
  try {
    const [command, arg] = process.argv.slice(2);
    if (command === "init") init(arg);
    else if (command === "deploy") deploy();
    else throw new Error("Usage: node tools/clasp-deploy.js init <scriptId> | deploy");
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = { isScriptId, isDeploymentId, findDeploymentId, webAppUrl };
