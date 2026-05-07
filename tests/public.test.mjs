import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  Lockform,
  LockformAuthError,
  LockformNetworkError,
  generateMnemonic15Words,
  deriveKeyPairFromMnemonic,
  exportPublicKeyBase64,
  decryptWebhookData,
} from '../dist/index.js'
import { makeFetch, parseBody, pathOf, extractQuery } from './helpers.mjs'

test('public.getForm - GET /v1/forms/:id/public?token=…  with no Authorization header', async () => {
  const { fetch, calls } = makeFetch([
    {
      status: 200,
      body: {
        form: {
          id: 'f1',
          organization_id: 'o',
          title: 'T',
          description: null,
          fields: [],
          submit_button: null,
          max_width: null,
          settings: {},
          created_at: 't',
          updated_at: 't',
        },
        public_key: 'PK',
        algorithm: 'X25519+AES-256-GCM',
      },
    },
  ])
  // Even with an apiKey configured, public routes must skip the Authorization
  // header - the API layer rejects API-key auth on access-token routes.
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  const out = await lf.public.getForm('f1', 'tok_anon')
  assert.equal(calls[0].method, 'GET')
  assert.equal(pathOf(calls[0].url), '/v1/forms/f1/public')
  assert.equal(extractQuery(calls[0].url).token, 'tok_anon')
  assert.equal(calls[0].headers.Authorization, undefined)
  assert.equal(out.public_key, 'PK')
})

test('public.submit - POST .../submissions?token=… with envelope, no Authorization', async () => {
  const { fetch, calls } = makeFetch([
    { status: 200, body: { success: true, submission_id: 's1', message: 'ok' } },
  ])
  const lf = new Lockform({ fetch })
  const envelope = {
    ciphertext: 'c',
    iv: 'i',
    salt: 'sa',
    ephemeral_public_key: 'e',
    algorithm: 'X25519+AES-256-GCM',
    nonce: 'n',
    timestamp: 1700000000,
  }
  const out = await lf.public.submit('f1', 'tok', envelope)
  assert.equal(calls[0].method, 'POST')
  assert.equal(pathOf(calls[0].url), '/v1/forms/f1/submissions')
  assert.equal(extractQuery(calls[0].url).token, 'tok')
  assert.equal(calls[0].headers.Authorization, undefined)
  assert.deepEqual(parseBody(calls[0]), envelope)
  assert.equal(out.submission_id, 's1')
})

test('public.prepareUpload - POST .../files/prepare-upload?token=…', async () => {
  const { fetch, calls } = makeFetch([
    {
      status: 200,
      body: {
        signed_url: 'https://signed',
        storage_path: 'forms/f1/abc',
        upload_token: 'tok_u',
        expires_in_seconds: 600,
      },
    },
  ])
  const lf = new Lockform({ fetch })
  const out = await lf.public.prepareUpload('f1', 'tok', { expected_size: 1024 })
  assert.equal(calls[0].method, 'POST')
  assert.equal(pathOf(calls[0].url), '/v1/forms/f1/files/prepare-upload')
  assert.equal(extractQuery(calls[0].url).token, 'tok')
  assert.deepEqual(parseBody(calls[0]), { expected_size: 1024 })
  assert.equal(out.upload_token, 'tok_u')
})

test('public.submit - 403 maps to LockformAuthError', async () => {
  const { fetch } = makeFetch([{ status: 403, body: { error: 'Invalid or expired access token' } }])
  const lf = new Lockform({ fetch })
  await assert.rejects(() =>
    lf.public.submit('f1', 'bad', {
      ciphertext: 'c',
      iv: 'i',
      salt: 's',
      ephemeral_public_key: 'e',
      algorithm: 'X25519+AES-256-GCM',
      nonce: 'n',
      timestamp: 1,
    }), LockformAuthError)
})

test('public.submitWithFiles - full e2e: getForm → prepareUpload → PUT → submit', async () => {
  const mnemonic = generateMnemonic15Words()
  const { publicKey } = deriveKeyPairFromMnemonic(mnemonic)
  const publicKeyBase64 = exportPublicKeyBase64(publicKey)

  let submittedEnvelope = null
  const responses = [
    // 1. getForm
    {
      status: 200,
      body: {
        form: {
          id: 'f1',
          organization_id: 'o',
          title: 'T',
          description: null,
          fields: [],
          submit_button: null,
          max_width: null,
          settings: {},
          created_at: 't',
          updated_at: 't',
        },
        public_key: publicKeyBase64,
        algorithm: 'X25519+AES-256-GCM',
      },
    },
    // 2. prepareUpload (file 1)
    {
      status: 200,
      body: {
        signed_url: 'https://storage.example/put/1',
        storage_path: 'forms/f1/o1',
        upload_token: 'tok_1',
        expires_in_seconds: 600,
      },
    },
    // 3. PUT to storage
    { status: 200 },
    // 4. submit
    (url, init) => {
      submittedEnvelope = JSON.parse(init.body)
      return new Response(
        JSON.stringify({ success: true, submission_id: 'sub_1', message: 'ok' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    },
  ]
  const { fetch, calls } = makeFetch(responses)
  const lf = new Lockform({ fetch })

  const result = await lf.public.submitWithFiles('f1', 'tok', {
    data: { name: 'Jane' },
    files: [
      {
        field: 'cv',
        file: new TextEncoder().encode('hello'),
        filename: 'cv.txt',
        contentType: 'text/plain',
      },
    ],
  })

  assert.equal(result.submission_id, 'sub_1')
  assert.equal(calls.length, 4)
  // Storage PUT used the signed URL and octet-stream content type.
  assert.equal(calls[2].url, 'https://storage.example/put/1')
  assert.equal(calls[2].method, 'PUT')
  assert.equal(calls[2].headers['Content-Type'], 'application/octet-stream')
  // Submission body has file_claims and a snake_case envelope.
  assert.equal(submittedEnvelope.file_claims.length, 1)
  assert.equal(submittedEnvelope.file_claims[0].upload_token, 'tok_1')
  assert.ok(typeof submittedEnvelope.ephemeral_public_key === 'string')

  // Decrypting the submitted envelope with the private mnemonic should yield
  // the original data plus a __lockform_files entry per uploaded attachment.
  const decrypted = await decryptWebhookData({
    payload: {
      event_type: 'e',
      submission_id: 'sub_1',
      form_id: 'f1',
      ciphertext: submittedEnvelope.ciphertext,
      iv: submittedEnvelope.iv,
      salt: submittedEnvelope.salt,
      ephemeral_public_key: submittedEnvelope.ephemeral_public_key,
      auth_tag: '',
      algorithm: submittedEnvelope.algorithm,
      nonce: submittedEnvelope.nonce,
      encryption_timestamp: submittedEnvelope.timestamp,
      timestamp: 't',
      field_mapping: { name: 'name' },
    },
    passphrase: mnemonic,
  })
  assert.equal(decrypted.mappedData.name, 'Jane')
  assert.equal(decrypted.rawData.__lockform_files.length, 1)
  assert.equal(decrypted.rawData.__lockform_files[0].field, 'cv')
  assert.ok(decrypted.rawData.__lockform_files[0].keyBase64)
})

test('public.submitWithFiles - accepts pre-fetched publicForm (skips getForm)', async () => {
  const mnemonic = generateMnemonic15Words()
  const { publicKey } = deriveKeyPairFromMnemonic(mnemonic)
  const publicKeyBase64 = exportPublicKeyBase64(publicKey)

  // Only one call expected (submit) - no getForm, no files.
  const { fetch, calls } = makeFetch([
    { status: 200, body: { success: true, submission_id: 's1', message: 'ok' } },
  ])
  const lf = new Lockform({ fetch })
  const out = await lf.public.submitWithFiles('f1', 'tok', {
    data: { x: 1 },
    publicForm: {
      form: {
        id: 'f1',
        organization_id: 'o',
        title: '',
        description: null,
        fields: [],
        submit_button: null,
        max_width: null,
        settings: {},
        created_at: '',
        updated_at: '',
      },
      public_key: publicKeyBase64,
      algorithm: 'X25519+AES-256-GCM',
    },
  })
  assert.equal(out.submission_id, 's1')
  assert.equal(calls.length, 1)
})

test('public.submitWithFiles - bubbles up storage upload failures as LockformNetworkError', async () => {
  const mnemonic = generateMnemonic15Words()
  const { publicKey } = deriveKeyPairFromMnemonic(mnemonic)
  const publicKeyBase64 = exportPublicKeyBase64(publicKey)

  const { fetch } = makeFetch([
    {
      status: 200,
      body: {
        form: {
          id: 'f1',
          organization_id: 'o',
          title: '',
          description: null,
          fields: [],
          submit_button: null,
          max_width: null,
          settings: {},
          created_at: '',
          updated_at: '',
        },
        public_key: publicKeyBase64,
        algorithm: 'X25519+AES-256-GCM',
      },
    },
    {
      status: 200,
      body: {
        signed_url: 'https://storage.example/put',
        storage_path: 'p',
        upload_token: 'u',
        expires_in_seconds: 600,
      },
    },
    { status: 500, body: 'storage failure' },
  ])
  const lf = new Lockform({ fetch })
  await assert.rejects(
    () =>
      lf.public.submitWithFiles('f1', 'tok', {
        data: {},
        files: [{ field: 'x', file: new Uint8Array([1]), contentType: 'application/octet-stream' }],
      }),
    LockformNetworkError
  )
})
