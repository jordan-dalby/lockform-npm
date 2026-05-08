import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import {
  cleanupTestEnv,
  closePool,
  createTempForm,
  createTestEnv,
  makeClient,
} from './helpers.mjs'

describe('access tokens (integration)', () => {
  let env, lf, formId

  before(async () => {
    env = await createTestEnv()
    lf = makeClient(env)
    const form = await createTempForm(lf, 'at')
    formId = form.id
  })
  after(async () => {
    await cleanupTestEnv(env)
    await closePool()
  })

  test('full lifecycle: list → create → list → update → delete', async () => {
    // The DB trigger create_initial_form_token seeds an access token on form
    // insert, so the initial list isn't empty - we just want to verify the
    // shape and that no plaintext token leaks through list().
    let list = await lf.accessTokens.list(formId)
    for (const t of list.data) {
      assert.equal(t.token, undefined, 'plaintext token must NOT appear on list()')
    }
    const initialCount = list.data.length

    const created = await lf.accessTokens.create(formId, { label: 'integration' })
    assert.ok(created.access_token.id)
    assert.ok(
      created.access_token.token,
      'plaintext token must be present once on create()'
    )

    list = await lf.accessTokens.list(formId)
    assert.equal(list.data.length, initialCount + 1)
    const newRow = list.data.find((t) => t.id === created.access_token.id)
    assert.ok(newRow)
    assert.equal(newRow.token, undefined)

    const updated = await lf.accessTokens.update(formId, created.access_token.id, {
      label: 'renamed',
      is_active: false,
    })
    assert.equal(updated.access_token.label, 'renamed')
    assert.equal(updated.access_token.is_active, false)

    const deleted = await lf.accessTokens.delete(formId, created.access_token.id)
    assert.equal(deleted, null)

    list = await lf.accessTokens.list(formId)
    assert.equal(list.data.length, initialCount)
  })
})
