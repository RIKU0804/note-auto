/**
 * Symmetric encryption for at-rest secrets (X API tokens, etc.).
 *
 * Format: "v1:<iv_b64>:<tag_b64>:<ciphertext_b64>"
 *   v1   — version tag, allows future key/algo rotation.
 *   iv   — 12-byte nonce, freshly generated per encryption.
 *   tag  — 16-byte GCM auth tag.
 *
 * Key: env ENCRYPTION_KEY, 32 bytes (256 bits) hex-encoded.
 *
 * If ENCRYPTION_KEY is unset the helpers degrade to passthrough — this
 * keeps local development frictionless while loudly warning, and matches
 * the Python worker's behaviour so a partial rollout cannot corrupt data.
 */

import crypto from "crypto";

const VERSION = "v1";
const KEY_LEN = 32;

let warned = false;

function loadKey(): Buffer | null {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    if (!warned) {
      console.warn(
        "[crypto] ENCRYPTION_KEY is not set — secrets will be stored in plaintext.",
      );
      warned = true;
    }
    return null;
  }
  const key = Buffer.from(raw, "hex");
  if (key.length !== KEY_LEN) {
    throw new Error(
      `ENCRYPTION_KEY must be ${KEY_LEN} bytes hex-encoded (got ${key.length}).`,
    );
  }
  return key;
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(`${VERSION}:`);
}

export function encryptSecret(plaintext: string): string {
  if (!plaintext) return plaintext;
  if (isEncrypted(plaintext)) return plaintext;

  const key = loadKey();
  if (!key) return plaintext;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptSecret(blob: string | null | undefined): string | null {
  if (!blob) return blob ?? null;
  if (!isEncrypted(blob)) return blob;

  const key = loadKey();
  if (!key) {
    throw new Error(
      "Encountered an encrypted value but ENCRYPTION_KEY is not configured.",
    );
  }

  const parts = blob.split(":");
  if (parts.length !== 4) {
    throw new Error("Malformed encrypted secret.");
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(ctB64, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
