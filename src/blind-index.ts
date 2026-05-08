/**
 * Blind index for duplicate-submission detection.
 *
 * Mirrors `Lockform/src/lib/crypto/blind-index.ts` byte-for-byte: HMAC-SHA-256
 * over the normalized (trimmed, lower-cased) field value, keyed by the form's
 * per-form `blind_index_key`. The output is base64 and matches what the
 * dashboard form-runtime sends as `unique_field_hash`.
 */

import { bytesToBase64 } from './util/base64'

export interface DuplicateDetectionConfig {
  enabled: boolean
  field_path: string
  blind_index_key: string
  error_message?: string
}

export async function generateBlindIndex(
  fieldValue: string,
  blindIndexKey: string
): Promise<string> {
  const keyBytes = Uint8Array.from(atob(blindIndexKey), (c) => c.charCodeAt(0))
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    keyBytes as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await globalThis.crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    new TextEncoder().encode(fieldValue) as BufferSource
  )
  return bytesToBase64(new Uint8Array(signature))
}

/**
 * The set of primitive values that can legitimately appear on a duplicate-
 * detection field. Forms only mark text/number/boolean inputs as unique - never
 * arrays, files, or nested objects - so this is the full domain.
 */
export type UniqueFieldValue = string | number | boolean

export function normalizeFieldValue(value: UniqueFieldValue): string {
  return String(value).trim().toLowerCase()
}

function lookupNested(
  data: Record<string, unknown>,
  path: string
): UniqueFieldValue | null | undefined {
  const value = path
    .split('.')
    .reduce<unknown>(
      (curr, key) =>
        curr && typeof curr === 'object'
          ? (curr as Record<string, unknown>)[key]
          : undefined,
      data
    )
  if (value === undefined || value === null) return value
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  throw new Error(
    `Field "${path}" must be a string, number, or boolean to be used for duplicate detection`
  )
}

export async function computeUniqueFieldHash(
  formData: Record<string, unknown>,
  config: DuplicateDetectionConfig
): Promise<string | null> {
  if (!config.enabled) return null
  const fieldValue = lookupNested(formData, config.field_path)
  if (fieldValue === undefined || fieldValue === null || fieldValue === '') {
    throw new Error(`Required unique field "${config.field_path}" is missing`)
  }
  return generateBlindIndex(normalizeFieldValue(fieldValue), config.blind_index_key)
}
