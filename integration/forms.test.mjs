import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import {
  Lockform,
  LockformAuthError,
  LockformNotFoundError,
  LockformValidationError,
} from '../dist/index.js'
import {
  BASE_URL,
  cleanupTestEnv,
  closePool,
  createTestEnv,
  makeClient,
  uniqueTitle,
} from './helpers.mjs'

describe('forms (integration)', () => {
  let env, lf

  before(async () => {
    env = await createTestEnv()
    lf = makeClient(env)
  })
  after(async () => {
    await cleanupTestEnv(env)
    await closePool()
  })

  test('create + get round-trip', async () => {
    const created = await lf.forms.create({ title: uniqueTitle('rt'), fields: [] })
    assert.ok(created.form.id)
    const fetched = await lf.forms.get(created.form.id)
    assert.equal(fetched.form.id, created.form.id)
    assert.equal(fetched.form.title, created.form.title)
  })

  test('update via PATCH persists', async () => {
    const created = await lf.forms.create({ title: uniqueTitle('upd'), fields: [] })
    const newTitle = uniqueTitle('renamed')
    await lf.forms.update(created.form.id, { title: newTitle })
    const fetched = await lf.forms.get(created.form.id)
    assert.equal(fetched.form.title, newTitle)
  })

  test('list + iterate yields the created form', async () => {
    const created = await lf.forms.create({ title: uniqueTitle('list'), fields: [] })
    let found = false
    for await (const form of lf.forms.iterate({ limit: 50 })) {
      if (form.id === created.form.id) {
        found = true
        break
      }
    }
    assert.ok(found, 'created form should appear in iterate()')
  })

  test('clone produces a distinct form', async () => {
    const created = await lf.forms.create({ title: uniqueTitle('orig'), fields: [] })
    const cloned = await lf.forms.clone(created.form.id, { title: uniqueTitle('cloned') })
    assert.ok(cloned.form?.id)
    assert.notEqual(cloned.form.id, created.form.id)
  })

  test('delete returns null and subsequent get → 404', async () => {
    const created = await lf.forms.create({ title: uniqueTitle('del'), fields: [] })
    const result = await lf.forms.delete(created.form.id)
    assert.equal(result, null)
    await assert.rejects(() => lf.forms.get(created.form.id), LockformNotFoundError)
  })

  test('error: get unknown id → LockformNotFoundError', async () => {
    await assert.rejects(
      () => lf.forms.get('00000000-0000-0000-0000-000000000000'),
      LockformNotFoundError
    )
  })

  test('error: create with missing title → LockformValidationError', async () => {
    await assert.rejects(() => lf.forms.create({}), LockformValidationError)
  })

  test('error: bad API key → LockformAuthError', async () => {
    const bad = new Lockform({ apiKey: 'lf_invalid_key_xxx', baseUrl: BASE_URL })
    await assert.rejects(() => bad.forms.list({ limit: 1 }), LockformAuthError)
  })
})
