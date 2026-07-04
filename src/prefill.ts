/**
 * Prefill-link recipient box.
 *
 * Wire-format-compatible with `Lockform/src/lib/crypto/prefill.ts`: a raw
 * AES-256-GCM ciphertext under a per-link key K that travels in the URL
 * fragment (`#k=`). The recipient's browser decrypts it to render prefilled +
 * locked fields. It is cosmetic - tamper-proofing comes from the separate
 * authoritative box (a standard X25519 submission envelope, `encryptSubmission`)
 * read only at export.
 *
 * Contract:
 *   - K: 32 random bytes, base64url in the fragment.
 *   - box: AES-256-GCM(K, iv) over JSON.stringify(PrefillPayload). No AAD.
 *   - iv: 12 random bytes, standard base64.
 */

import { base64ToBytes, bytesToBase64 } from "./util/base64";

export type LockedFieldDisplay = "readonly" | "hidden";

export interface LockedField {
  id: string;
  display: LockedFieldDisplay;
}

export interface PrefillPayload {
  values: Record<string, unknown>;
  lockedFields: LockedField[];
}

export interface RecipientBox {
  recipient_ciphertext: string;
  recipient_iv: string;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function keyToBytes(keyBase64: string): Uint8Array {
  const normalized = keyBase64.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return base64ToBytes(padded);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

/** Generate a fresh 32-byte link key, base64url-encoded for the URL fragment. */
export function generatePrefillKey(): string {
  const key = globalThis.crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64Url(key);
}

/** Encrypt a prefill payload under key K. Returns the recipient box. */
export async function encryptRecipientBox(
  payload: PrefillPayload,
  keyBase64: string,
): Promise<RecipientBox> {
  const key = keyToBytes(keyBase64);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const data = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    cryptoKey,
    data as BufferSource,
  );
  return {
    recipient_ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    recipient_iv: bytesToBase64(iv),
  };
}

/**
 * Decrypt the recipient box with the fragment key K. Throws if K is wrong or
 * the ciphertext was tampered with (AES-GCM auth failure). Provided for
 * symmetry and tests; the recipient path lives in the form renderer.
 */
export async function decryptRecipientBox(
  ciphertextBase64: string,
  ivBase64: string,
  keyBase64: string,
): Promise<PrefillPayload> {
  const key = keyToBytes(keyBase64);
  const iv = base64ToBytes(ivBase64);
  const ciphertext = base64ToBytes(ciphertextBase64);
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const decrypted = await globalThis.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    cryptoKey,
    toArrayBuffer(ciphertext),
  );
  const parsed = JSON.parse(
    new TextDecoder().decode(decrypted),
  ) as PrefillPayload;
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof parsed.values !== "object" ||
    !Array.isArray(parsed.lockedFields)
  ) {
    throw new Error("Malformed prefill payload");
  }
  return parsed;
}

/**
 * Compose the recipient-facing form URL. `formUrl` is the form's page URL
 * (e.g. `https://app.lockform.io/f/<formId>`). The access token and prefill
 * token go in the query; the link key K goes in the fragment so it is never
 * sent to the server.
 */
export function buildPrefillUrl(params: {
  formUrl: string;
  accessToken: string;
  prefillToken: string;
  key: string;
}): string {
  const sep = params.formUrl.includes("?") ? "&" : "?";
  const query = `token=${encodeURIComponent(params.accessToken)}&p=${encodeURIComponent(params.prefillToken)}`;
  return `${params.formUrl}${sep}${query}#k=${params.key}`;
}
