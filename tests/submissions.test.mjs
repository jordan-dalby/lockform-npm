import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Lockform, LockformAuthError } from '../dist/index.js'
import { makeFetch, parseBody, pathOf, extractQuery } from './helpers.mjs'

test('submissions.list - GET /v1/forms/:id/submissions with filters', async () => {
  const { fetch, calls } = makeFetch([
    { status: 200, body: { data: [{ id: 's1' }], next_cursor: null } },
  ])
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  await lf.submissions.list('f1', {
    limit: 10,
    cursor: 'c0',
    from: '2026-01-01',
    to: '2026-02-01',
  })
  assert.equal(calls[0].method, 'GET')
  assert.equal(pathOf(calls[0].url), '/v1/forms/f1/submissions')
  const q = extractQuery(calls[0].url)
  assert.equal(q.limit, '10')
  assert.equal(q.cursor, 'c0')
  assert.equal(q.from, '2026-01-01')
  assert.equal(q.to, '2026-02-01')
})

test('submissions.list - accepts JWT auth (dual-auth route)', async () => {
  const { fetch, calls } = makeFetch([
    { status: 200, body: { data: [], next_cursor: null } },
  ])
  const lf = new Lockform({ jwt: 'jwt', organizationId: 'org_1', fetch })
  await lf.submissions.list('f1')
  assert.equal(calls[0].headers.Authorization, 'Bearer jwt')
  assert.equal(extractQuery(calls[0].url).organization_id, 'org_1')
})

test('submissions.count - GET .../submissions/count', async () => {
  const { fetch, calls } = makeFetch([{ status: 200, body: { count: 42 } }])
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  const out = await lf.submissions.count('f1')
  assert.equal(pathOf(calls[0].url), '/v1/forms/f1/submissions/count')
  assert.equal(out.count, 42)
})

test('submissions.deleteAll - DELETE returns deletion count', async () => {
  const { fetch, calls } = makeFetch([{ status: 200, body: { deleted: 7 } }])
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  const out = await lf.submissions.deleteAll('f1')
  assert.equal(calls[0].method, 'DELETE')
  assert.equal(pathOf(calls[0].url), '/v1/forms/f1/submissions')
  assert.equal(out.deleted, 7)
})

test('submissions.get - GET /v1/submissions/:id', async () => {
  const { fetch, calls } = makeFetch([{ status: 200, body: { submission: { id: 's1' } } }])
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  await lf.submissions.get('s1')
  assert.equal(pathOf(calls[0].url), '/v1/submissions/s1')
})

test('submissions.update - PATCH with envelope', async () => {
  const { fetch, calls } = makeFetch([{ status: 200, body: { submission: { id: 's1' } } }])
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  const envelope = {
    ciphertext: 'c',
    iv: 'i',
    salt: 'sa',
    ephemeral_public_key: 'e',
    algorithm: 'X25519+AES-256-GCM',
    nonce: 'n',
    timestamp: 1700000000,
  }
  await lf.submissions.update('s1', envelope)
  assert.equal(calls[0].method, 'PATCH')
  assert.equal(pathOf(calls[0].url), '/v1/submissions/s1')
  assert.deepEqual(parseBody(calls[0]), envelope)
})

test('submissions.delete - DELETE returns null', async () => {
  const { fetch, calls } = makeFetch([{ status: 204 }])
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  const out = await lf.submissions.delete('s1')
  assert.equal(calls[0].method, 'DELETE')
  assert.equal(pathOf(calls[0].url), '/v1/submissions/s1')
  assert.equal(out, null)
})

test('submissions.iterate - paginates across multiple pages', async () => {
  const { fetch, calls } = makeFetch([
    { status: 200, body: { data: [{ id: 's1' }], next_cursor: 'c1' } },
    { status: 200, body: { data: [{ id: 's2' }, { id: 's3' }], next_cursor: null } },
  ])
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  const ids = []
  for await (const s of lf.submissions.iterate('f1')) ids.push(s.id)
  assert.deepEqual(ids, ['s1', 's2', 's3'])
  assert.equal(calls.length, 2)
})

test('submissions.list - 401 maps to LockformAuthError', async () => {
  const { fetch } = makeFetch([{ status: 401, body: { error: 'Invalid API key' } }])
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  await assert.rejects(() => lf.submissions.list('f1'), LockformAuthError)
})
