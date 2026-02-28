import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 16; // AES block size is always 16 bytes

/**
 * Get the encryption key from environment.
 * Must be a 64-character hex string (32 bytes).
 */
function getKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "ENCRYPTION_KEY is not set in environment variables. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  if (key.length !== 64) {
    throw new Error(
      `ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). Got ${key.length} characters.`,
    );
  }
  return Buffer.from(key, "hex");
}

/**
 * Encrypt a plaintext string using AES-256-CBC.
 * Returns a string in the format: iv:encryptedData (both hex-encoded).
 *
 * @param {string} text - The plaintext to encrypt (e.g. a MongoDB URI)
 * @returns {string} The encrypted string in format "iv_hex:ciphertext_hex"
 */
export function encrypt(text) {
  if (!text || typeof text !== "string") return text;

  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH); // Fresh IV for every encryption

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  // Store as "iv:ciphertext" so we can extract the IV during decryption
  return `${iv.toString("hex")}:${encrypted}`;
}

/**
 * Decrypt an AES-256-CBC encrypted string.
 * Expects the format: iv_hex:ciphertext_hex
 *
 * @param {string} encryptedText - The encrypted string from encrypt()
 * @returns {string} The original plaintext
 */
export function decrypt(encryptedText) {
  if (!encryptedText || typeof encryptedText !== "string") return encryptedText;

  // If it doesn't contain ":" it's not encrypted (legacy plaintext data)
  if (!encryptedText.includes(":")) return encryptedText;

  const key = getKey();

  const firstColon = encryptedText.indexOf(":");
  const ivHex = encryptedText.substring(0, firstColon);
  const cipherHex = encryptedText.substring(firstColon + 1);

  // If IV is not 32 hex chars, it's likely a plaintext URL (e.g., "http://...")
  if (ivHex.length !== 32) return encryptedText;
  if (!cipherHex) return encryptedText;

  try {
    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(cipherHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    // If decryption fails, it might be legacy unencrypted data
    console.warn("Decryption failed, returning raw value:", err.message);
    return encryptedText;
  }
}

/**
 * Encrypt the sink object's URI field in-place.
 * Safe to call even if sink is null/undefined or URI is empty.
 *
 * @param {object|null} sink - The sink object { type, uri, collection }
 * @returns {object|null} A new sink object with encrypted URI
 */
export function encryptSink(sink) {
  if (!sink || !sink.uri || sink.type === null) return sink;

  return {
    ...sink,
    uri: encrypt(sink.uri),
  };
}

/**
 * Decrypt the sink object's URI field.
 * Safe to call even if sink is null/undefined or URI is empty.
 *
 * @param {object|null} sink - The sink object with encrypted URI
 * @returns {object|null} A new sink object with decrypted URI
 */
export function decryptSink(sink) {
  if (!sink || !sink.uri || sink.type === null) return sink;

  return {
    ...sink,
    uri: decrypt(sink.uri),
  };
}
