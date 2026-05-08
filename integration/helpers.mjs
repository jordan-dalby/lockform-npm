/**
 * Integration tests against a real Lockform API + local Supabase.
 *
 * Setup:
 *   1. From the Lockform repo: `supabase start`
 *   2. From LockformAPI: start the API on localhost:3002 pointing at local
 *      Supabase (its own .env.test or equivalent).
 *   3. Optionally export overrides:
 *        SUPABASE_DB_URL    (default: postgresql://postgres:postgres@127.0.0.1:54322/postgres)
 *        LOCKFORM_BASE_URL  (default: http://localhost:3002)
 *   4. From here: npm run integration
 *
 * Each describe block bootstraps its own org + auth user + encryption key +
 * API key directly via Postgres, runs its tests, then cascades-deletes the
 * org. There is no production-credential path - the helpers refuse to run
 * against any non-local DB URL.
 *
 * Why direct Postgres for auth.users (mirrors LockformAPI/tests/integration):
 * GoTrue's admin createUser API corrupts its own session search_path on
 * repeated calls against a local stack and breaks every subsequent request
 * until the container restarts. Inserting into auth.users is enough to
 * satisfy the api_keys.created_by FK.
 */

import { Pool } from 'pg'
import crypto from 'node:crypto'
import {
  Lockform,
  exportPublicKeyBase64,
  generateMnemonicAndKeys,
} from '../dist/index.js'

export const BASE_URL = process.env.LOCKFORM_BASE_URL ?? 'http://localhost:3002'
const DB_URL =
  process.env.SUPABASE_DB_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

if (!/(127\.0\.0\.1|localhost)/.test(DB_URL)) {
  throw new Error(
    `Refusing to run integration tests against non-local SUPABASE_DB_URL. Got "${DB_URL}".`
  )
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(BASE_URL)) {
  throw new Error(
    `Refusing to run integration tests against non-local LOCKFORM_BASE_URL. Got "${BASE_URL}".`
  )
}

let pgPool
function pool() {
  if (!pgPool) pgPool = new Pool({ connectionString: DB_URL, max: 4 })
  return pgPool
}

export async function closePool() {
  if (pgPool) {
    const p = pgPool
    pgPool = undefined
    await p.end()
  }
}

// Make sure we don't leak the pool past the test run.
process.on('beforeExit', () => {
  closePool().catch(() => {})
})

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex')
}

function generateApiKey() {
  return 'lf_test_' + crypto.randomBytes(24).toString('hex')
}

async function seedAuthUser(client) {
  const userId = crypto.randomUUID()
  const stamp = Date.now() + '-' + crypto.randomBytes(3).toString('hex')
  const email = `sdk-integration-${stamp}@lockform.test`
  await client.query(
    `INSERT INTO auth.users (
       instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
     )
     VALUES (
       '00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2,
       '', NOW(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
       NOW(), NOW(), false
     )`,
    [userId, email]
  )
  return { id: userId, email }
}

/**
 * Provision a fresh org with everything needed to drive the SDK end-to-end:
 * auth user, org, owner membership, subscription, X25519 encryption key
 * (linked at the org level - `forms.create` will auto-attach it via form_keys),
 * and an API key. Returns the plaintext API key + the mnemonic so tests can
 * decrypt submissions afterwards.
 */
export async function createTestEnv({ tier = 'unlimited' } = {}) {
  const client = await pool().connect()
  try {
    await client.query('BEGIN')

    const user = await seedAuthUser(client)
    const stamp = Date.now() + '-' + crypto.randomBytes(3).toString('hex')

    const {
      rows: [org],
    } = await client.query(
      `INSERT INTO organizations (name) VALUES ($1) RETURNING id, name`,
      [`SDK Test Org ${stamp}`]
    )

    await client.query(
      `INSERT INTO organization_members (organization_id, user_id, role)
       VALUES ($1, $2, 'owner')`,
      [org.id, user.id]
    )

    if (tier !== 'free') {
      await client.query(
        `INSERT INTO subscriptions (organization_id, stripe_customer_id, tier, status)
         VALUES ($1, $2, $3, 'active')`,
        [org.id, `cus_test_${stamp}`, tier]
      )
    }

    const { mnemonic, publicKey, privateKey } = generateMnemonicAndKeys()
    const publicKeyBase64 = exportPublicKeyBase64(publicKey)
    await client.query(
      `INSERT INTO keys (organization_id, key, algorithm)
       VALUES ($1, $2, 'X25519+AES-256-GCM')`,
      [org.id, publicKeyBase64]
    )

    const plaintextKey = generateApiKey()
    await client.query(
      `INSERT INTO api_keys (organization_id, name, key_hash, key_prefix, created_by)
       VALUES ($1, 'SDK integration test', $2, $3, $4)`,
      [org.id, sha256Hex(plaintextKey), plaintextKey.slice(0, 8), user.id]
    )

    await client.query('COMMIT')

    return { org, user, plaintextKey, mnemonic, publicKey, privateKey, publicKeyBase64 }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export async function cleanupTestEnv(env) {
  if (!env) return
  const client = await pool().connect()
  try {
    if (env.org?.id) {
      await client.query('DELETE FROM organizations WHERE id = $1', [env.org.id])
    }
    if (env.user?.id) {
      await client.query('DELETE FROM auth.users WHERE id = $1', [env.user.id])
    }
  } catch (err) {
    console.warn(`[integration cleanup] ${err?.message ?? err}`)
  } finally {
    client.release()
  }
}

export function makeClient(env, overrides = {}) {
  return new Lockform({ apiKey: env.plaintextKey, baseUrl: BASE_URL, ...overrides })
}

export function makeAnonClient() {
  return new Lockform({ baseUrl: BASE_URL })
}

let counter = 0
export function uniqueTitle(label) {
  counter += 1
  return `[sdk-integration] ${label} ${Date.now()}-${counter}`
}

export async function createTempForm(lf, label = 'form', extra = {}) {
  const created = await lf.forms.create({
    title: uniqueTitle(label),
    fields: [],
    ...extra,
  })
  return created.form
}

/** 1×1 transparent PNG, smallest valid file for upload tests. */
export const TINY_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9c, 0x63, 0xfa, 0xff, 0xff, 0x3f,
  0x03, 0x00, 0x00, 0x07, 0x00, 0x03, 0xfd, 0xc7,
  0x29, 0x88, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
  0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
])

/**
 * Adapt a Submission row from the admin API to the WebhookPayload shape
 * `decryptWebhookData` expects. `field_mapping` is identity (key → key).
 */
export function submissionToWebhookPayload(submission, fieldKeys) {
  const mapping = {}
  for (const k of fieldKeys) mapping[k] = k
  return {
    event_type: 'integration',
    submission_id: submission.id,
    form_id: submission.form_id,
    ciphertext: submission.ciphertext,
    iv: submission.iv,
    salt: submission.salt,
    ephemeral_public_key: submission.ephemeral_public_key,
    auth_tag: submission.auth_tag ?? '',
    algorithm: submission.algorithm,
    nonce: submission.nonce,
    encryption_timestamp: submission.encryption_timestamp,
    timestamp: submission.submitted_at,
    field_mapping: mapping,
  }
}
