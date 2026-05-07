import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Lockform, LockformAuthError, LockformNotFoundError } from '../dist/index.js'
import { makeFetch, parseBody, pathOf } from './helpers.mjs'

test('files.prepareDownload - POST /v1/submissions/:id/files/prepare-download with storage_path', async () => {
  const { fetch, calls } = makeFetch([
    { status: 200, body: { signed_url: 'https://signed', expires_in_seconds: 60 } },
  ])
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  const out = await lf.files.prepareDownload('s1', 'forms/f1/abc')
  assert.equal(calls[0].method, 'POST')
  assert.equal(pathOf(calls[0].url), '/v1/submissions/s1/files/prepare-download')
  assert.deepEqual(parseBody(calls[0]), { storage_path: 'forms/f1/abc' })
  assert.equal(out.signed_url, 'https://signed')
})

test('files.prepareDownload - accepts JWT auth (dual-auth route)', async () => {
  const { fetch, calls } = makeFetch([
    { status: 200, body: { signed_url: 'https://signed', expires_in_seconds: 60 } },
  ])
  const lf = new Lockform({ jwt: 'jwt', organizationId: 'org_1', fetch })
  await lf.files.prepareDownload('s1', 'p')
  // POST → org id goes in body, not query
  const body = parseBody(calls[0])
  assert.equal(body.storage_path, 'p')
  assert.equal(body.organization_id, 'org_1')
})

test('files.prepareDownload - 404 when submission/file not found', async () => {
  const { fetch } = makeFetch([{ status: 404, body: { error: 'File not found' } }])
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  await assert.rejects(() => lf.files.prepareDownload('s1', 'p'), LockformNotFoundError)
})

test('files.prepareDownload - 401 maps correctly', async () => {
  const { fetch } = makeFetch([{ status: 401, body: { error: 'Invalid API key' } }])
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  await assert.rejects(() => lf.files.prepareDownload('s1', 'p'), LockformAuthError)
})
