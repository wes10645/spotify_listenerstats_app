// Stores data in an encrypted cookie instead of server memory.
// Vercel runs the backend as short-lived functions that forget everything between requests,
// so the browser carries the (encrypted) data and the server decrypts it on each request.
const crypto = require("crypto");

if (process.env.VERCEL === "1" && !process.env.SESSION_SECRET) {
  throw new Error("Set SESSION_SECRET in the Vercel project's environment variables");
}
const SECRET = process.env.SESSION_SECRET || "dev-only-secret-change-me";
const KEY = crypto.createHash("sha256").update(SECRET).digest(); // 32 bytes for AES-256

// AES-256-GCM both hides the data and detects tampering.
function seal(data) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

// Returns the original data, or null if the cookie is missing, edited, or made with another secret.
function unseal(value) {
  if (!value) return null;
  try {
    const raw = Buffer.from(value, "base64url");
    const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const decrypted = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
    return JSON.parse(decrypted.toString("utf8"));
  } catch {
    return null;
  }
}

module.exports = { seal, unseal };
