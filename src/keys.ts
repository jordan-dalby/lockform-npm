/**
 * X25519 key generation from BIP39 mnemonics.
 *
 * Mirrors `Lockform/src/lib/crypto/keyGeneration.ts` byte-for-byte so the
 * dashboard, edge functions, and SDK all derive identical keypairs from a
 * given 15-word passphrase.
 */

import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from 'bip39'
import { x25519 } from '@noble/curves/ed25519'
import { pbkdf2 } from '@noble/hashes/pbkdf2'
import { sha512 } from '@noble/hashes/sha2'
import { base64ToBytes, bytesToBase64 } from './util/base64'

const PBKDF2_ITERATIONS = 600_000
const PBKDF2_SALT = 'lockform-x25519-v1'

export function generateMnemonic15Words(): string {
  return generateMnemonic(160)
}

export function validateMnemonic15Words(mnemonic: string): boolean {
  const words = mnemonic.trim().split(/\s+/)
  if (words.length !== 15) return false
  return validateMnemonic(mnemonic)
}

function deriveX25519PrivateKey(mnemonic: string): Uint8Array {
  const seed = mnemonicToSeedSync(mnemonic)
  return pbkdf2(sha512, seed, PBKDF2_SALT, {
    c: PBKDF2_ITERATIONS,
    dkLen: 32,
  })
}

export function deriveKeyPairFromMnemonic(mnemonic: string): {
  privateKey: Uint8Array
  publicKey: Uint8Array
} {
  if (!validateMnemonic15Words(mnemonic)) {
    throw new Error('Invalid mnemonic phrase. Must be 15 valid BIP39 words.')
  }
  const privateKey = deriveX25519PrivateKey(mnemonic)
  const publicKey = x25519.getPublicKey(privateKey)
  return { privateKey, publicKey }
}

export function exportPublicKeyBase64(publicKey: Uint8Array): string {
  return bytesToBase64(publicKey)
}

export function exportPrivateKeyBase64(privateKey: Uint8Array): string {
  return bytesToBase64(privateKey)
}

export function importPublicKeyBase64(base64: string): Uint8Array {
  return base64ToBytes(base64)
}

export function importPrivateKeyBase64(base64: string): Uint8Array {
  return base64ToBytes(base64)
}

export function generateMnemonicAndKeys(): {
  mnemonic: string
  publicKey: Uint8Array
  privateKey: Uint8Array
  publicKeyBase64: string
} {
  const mnemonic = generateMnemonic15Words()
  const { privateKey, publicKey } = deriveKeyPairFromMnemonic(mnemonic)
  return {
    mnemonic,
    publicKey,
    privateKey,
    publicKeyBase64: exportPublicKeyBase64(publicKey),
  }
}
