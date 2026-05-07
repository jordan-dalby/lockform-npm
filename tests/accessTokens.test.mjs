import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Lockform, LockformValidationError } from '../dist/index.js'
import { makeFetch, parseBody, pathOf } from './helpers.mjs'

test('accessTokens.list - GET .../access-tokens', async () => {
  const { fetch, calls } = makeFetch([{ status: 200, body: { data: [{ id: 't1' }] } }])
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  const out = await lf.accessTokens.list('f1')
  assert.equal(calls[0].method, 'GET')
  assert.equal(pathOf(calls[0].url), '/v1/forms/f1/access-tokens')
  assert.equal(out.data[0].id, 't1')
})

test('accessTokens.create - POST .../access-tokens with body, returns plaintext token', async () => {
  const { fetch, calls } = makeFetch([
    {
      status: 201,
      body: { access_token: { id: 't1', form_id: 'f1', token: 'plaintext_xyz' } },
    },
  ])
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  const out = await lf.accessTokens.create('f1', { label: 'public', expires_at: null })
  assert.equal(calls[0].method, 'POST')
  assert.equal(pathOf(calls[0].url), '/v1/forms/f1/access-tokens')
  assert.deepEqual(parseBody(calls[0]), { label: 'public', expires_at: null })
  assert.equal(out.access_token.token, 'plaintext_xyz')
})

test('accessTokens.create - defaults body to {} when input omitted', async () => {
  const { fetch, calls } = makeFetch([{ status: 201, body: { access_token: { id: 't1' } } }])
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  await lf.accessTokens.create('f1')
  assert.deepEqual(parseBody(calls[0]), {})
})

test('accessTokens.update - PATCH .../access-tokens/:id', async () => {
  const { fetch, calls } = makeFetch([{ status: 200, body: { access_token: { id: 't1' } } }])
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  await lf.accessTokens.update('f1', 't1', { is_active: false })
  assert.equal(calls[0].method, 'PATCH')
  assert.equal(pathOf(calls[0].url), '/v1/forms/f1/access-tokens/t1')
  assert.deepEqual(parseBody(calls[0]), { is_active: false })
})

test('accessTokens.delete - DELETE .../access-tokens/:id returns null', async () => {
  const { fetch, calls } = makeFetch([{ status: 204 }])
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  const out = await lf.accessTokens.delete('f1', 't1')
  assert.equal(calls[0].method, 'DELETE')
  assert.equal(pathOf(calls[0].url), '/v1/forms/f1/access-tokens/t1')
  assert.equal(out, null)
})

test('accessTokens.create - 400 maps to LockformValidationError', async () => {
  const { fetch } = makeFetch([{ status: 400, body: { error: 'Invalid input' } }])
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  await assert.rejects(() => lf.accessTokens.create('f1'), LockformValidationError)
})
