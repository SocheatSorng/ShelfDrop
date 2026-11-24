// Prints a new random ACCESS_TOKEN (256 bits, URL-safe). Run it in your own terminal:
//   npm run --silent token | clip      (copies it without showing it on screen)
// Then paste it into Script Properties > ACCESS_TOKEN. It is never written to a file.
const crypto = require("node:crypto");

function newToken() {
  return crypto.randomBytes(32).toString("base64url");
}

if (require.main === module) process.stdout.write(newToken() + "\n");

module.exports = { newToken };
