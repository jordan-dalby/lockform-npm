import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Lockform, LockformNotFoundError } from '../dist/index.js'
import { makeFetch, parseBody, pathOf, extractQuery } from './helpers.mjs'

test('forms.list - GET /v1/forms with limit + cursor', async () => {
  const { fetch, calls } = makeFetch([
    { status: 200, body: { data: [{ id: 'f1' }, { id: 'f2' }], next_cursor: 'c2' } },
  ])
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  const page = await lf.forms.list({ limit: 50, cursor: 'c0' })
  assert.equal(calls[0].method, 'GET')
  assert.equal(pathOf(calls[0].url), '/v1/forms')
  assert.equal(extractQuery(calls[0].url).limit, '50')
  assert.equal(extractQuery(calls[0].url).cursor, 'c0')
  assert.equal(page.next_cursor, 'c2')
  assert.equal(page.data.length, 2)
})

test('forms.list - error mapping', async () => {
  const { fetch } = makeFetch([{ status: 401, body: { error: 'Invalid API key' } }])
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  await assert.rejects(() => lf.forms.list(), /Invalid API key/)
})

test('forms.create - POST /v1/forms with body', async () => {
  const { fetch, calls } = makeFetch([{ status: 201, body: { form: { id: 'f1', title: 'T' } } }])
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  const out = await lf.forms.create({ title: 'T' })
  assert.equal(calls[0].method, 'POST')
  assert.equal(pathOf(calls[0].url), '/v1/forms')
  assert.deepEqual(parseBody(calls[0]), { title: 'T' })
  assert.equal(out.form.id, 'f1')
})

test('forms.get - GET /v1/forms/:id', async () => {
  const { fetch, calls } = makeFetch([{ status: 200, body: { form: { id: 'f1' } } }])
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  await lf.forms.get('f1')
  assert.equal(pathOf(calls[0].url), '/v1/forms/f1')
})

test('forms.get - 404 → LockformNotFoundError', async () => {
  const { fetch } = makeFetch([{ status: 404, body: { error: 'Form not found' } }])
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  await assert.rejects(() => lf.forms.get('missing'), LockformNotFoundError)
})

test('forms.update - PATCH /v1/forms/:id', async () => {
  const { fetch, calls } = makeFetch([{ status: 200, body: { form: { id: 'f1' } } }])
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  await lf.forms.update('f1', { title: 'New', is_submissions_disabled: true })
  assert.equal(calls[0].method, 'PATCH')
  assert.equal(pathOf(calls[0].url), '/v1/forms/f1')
  assert.deepEqual(parseBody(calls[0]), { title: 'New', is_submissions_disabled: true })
})

test('forms.delete - DELETE /v1/forms/:id returns null', async () => {
  const { fetch, calls } = makeFetch([{ status: 204 }])
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  const out = await lf.forms.delete('f1')
  assert.equal(calls[0].method, 'DELETE')
  assert.equal(pathOf(calls[0].url), '/v1/forms/f1')
  assert.equal(out, null)
})

test('forms.clone - POST /v1/forms/:id/clone with optional title/description', async () => {
  const { fetch, calls } = makeFetch([
    {
      status: 200,
      body: { success: true, form: { id: 'f2' }, form_url: 'https://...', message: 'ok' },
    },
  ])
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  const out = await lf.forms.clone('f1', { title: 'Copy' })
  assert.equal(calls[0].method, 'POST')
  assert.equal(pathOf(calls[0].url), '/v1/forms/f1/clone')
  assert.deepEqual(parseBody(calls[0]), { title: 'Copy' })
  assert.equal(out.form.id, 'f2')
})

test('forms.iterate - paginates until next_cursor is null', async () => {
  const { fetch, calls } = makeFetch([
    { status: 200, body: { data: [{ id: 'f1' }, { id: 'f2' }], next_cursor: 'c2' } },
    { status: 200, body: { data: [{ id: 'f3' }], next_cursor: null } },
  ])
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  const ids = []
  for await (const f of lf.forms.iterate({ limit: 2 })) ids.push(f.id)
  assert.deepEqual(ids, ['f1', 'f2', 'f3'])
  assert.equal(calls.length, 2)
  assert.equal(extractQuery(calls[1].url).cursor, 'c2')
})

test('forms.images.upload - multipart POST /v1/forms/images', async () => {
  const { fetch, calls } = makeFetch([
    { status: 201, body: { url: 'https://cdn/x.png', path: 'org/abc.png', reused: false } },
  ])
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  const bytes = new Uint8Array([1, 2, 3, 4])
  const out = await lf.forms.images.upload({
    file: bytes,
    contentType: 'image/png',
    filename: 'x.png',
  })
  assert.equal(calls[0].method, 'POST')
  assert.equal(pathOf(calls[0].url), '/v1/forms/images')
  // Content-Type for multipart is set by FormData/fetch - verify body is FormData.
  assert.ok(calls[0].body instanceof FormData)
  assert.equal(out.path, 'org/abc.png')
})

test('forms.images.upload - accepts a Blob directly', async () => {
  const { fetch, calls } = makeFetch([
    { status: 200, body: { url: 'u', path: 'p', reused: true } },
  ])
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  const blob = new Blob([new Uint8Array([5, 6])], { type: 'image/png' })
  await lf.forms.images.upload({ file: blob, contentType: 'image/png' })
  assert.ok(calls[0].body instanceof FormData)
})

test('forms.images.delete - DELETE /v1/forms/images/<path> with each segment encoded', async () => {
  const { fetch, calls } = makeFetch([{ status: 204 }])
  const lf = new Lockform({ apiKey: 'lf_x', fetch })
  await lf.forms.images.delete('org_1/abc def.png')
  assert.equal(calls[0].method, 'DELETE')
  assert.equal(pathOf(calls[0].url), '/v1/forms/images/org_1/abc%20def.png')
})

test('forms.images.upload - JWT clients are rejected client-side (no silent 403)', async () => {
  const { fetch } = makeFetch([])
  const lf = new Lockform({ jwt: 'jwt_x', organizationId: 'org_1', fetch })
  await assert.rejects(
    () => lf.forms.images.upload({ file: new Uint8Array([1]), contentType: 'image/png' }),
    /requires API-key authentication/
  )
})

test('forms.images.delete - anonymous clients are rejected client-side', async () => {
  const { fetch } = makeFetch([])
  const lf = new Lockform({ fetch })
  await assert.rejects(
    () => lf.forms.images.delete('org_1/x.png'),
    /requires API-key authentication/
  )
})
