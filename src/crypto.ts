import { webcrypto } from 'node:crypto'
import { x25519 } from '@noble/curves/ed25519'
import { hkdf } from '@noble/hashes/hkdf'
import { sha256 } from '@noble/hashes/sha2'
import { pbkdf2 } from '@noble/hashes/pbkdf2'
import { sha512 } from '@noble/hashes/sha2'
import { mnemonicToSeedSync } from 'bip39'

const crypto = webcrypto

export async function base64ToArrayBuffer(base64: string): Promise<Uint8Array> {
  const binary = Buffer.from(base64, 'base64').toString('binary')
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export function arrayBufferToString(buffer: ArrayBuffer | Uint8Array): string {
  return new TextDecoder().decode(buffer)
}

export function importPrivateKeyFromMnemonic(mnemonic: string): Uint8Array {
  const seed = mnemonicToSeedSync(mnemonic)
  const privateKey = pbkdf2(sha512, seed, 'lockform-x25519-v1', {
    c: 600_000,
    dkLen: 32,
  })
  return privateKey
}

export function importPrivateKeyFromBase64(base64: string): Uint8Array {
  return Buffer.from(base64, 'base64')
}

function deriveSharedSecret(
  privateKey: Uint8Array,
  publicKey: Uint8Array
): Uint8Array {
  return x25519.getSharedSecret(privateKey, publicKey)
}

function deriveAESKey(sharedSecret: Uint8Array, salt: Uint8Array): Uint8Array {
  const info = new TextEncoder().encode('lockform-encryption-v1')
  return hkdf(sha256, sharedSecret, salt, info, 32)
}

async function decryptWithAES(
  ciphertext: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array,
  additionalData?: Uint8Array
): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  )

  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv,
      ...(additionalData && { additionalData }),
    },
    cryptoKey,
    ciphertext
  )

  const decoder = new TextDecoder()
  return decoder.decode(decrypted)
}

export async function decryptSubmission(
  ciphertext: string,
  iv: string,
  salt: string,
  ephemeralPublicKey: string,
  privateKey: Uint8Array,
  metadata?: { formId?: string; encryptionTimestamp?: number }
): Promise<string> {
  const ciphertextBuffer = await base64ToArrayBuffer(ciphertext)
  const ivBuffer = await base64ToArrayBuffer(iv)
  const saltBuffer = await base64ToArrayBuffer(salt)
  const ephemeralPublicKeyBuffer = await base64ToArrayBuffer(ephemeralPublicKey)

  const sharedSecret = deriveSharedSecret(privateKey, ephemeralPublicKeyBuffer)
  const aesKey = deriveAESKey(sharedSecret, saltBuffer)

  const aad = metadata
    ? new TextEncoder().encode(`${metadata.formId ?? ''}:${metadata.encryptionTimestamp ?? 0}`)
    : undefined

  return await decryptWithAES(ciphertextBuffer, aesKey, ivBuffer, aad)
}

export async function createHmacSignature(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(secret)
  const messageData = encoder.encode(payload)

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData)

  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
