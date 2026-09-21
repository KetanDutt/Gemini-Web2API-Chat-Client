import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deleteDraft, getAttachmentDraft, getDraft, setAttachmentDraft, setDraft } from '@/services/drafts'

test('drafts: set, get, delete round-trip', () => {
  const id = `test-${Date.now()}-a`
  assert.equal(getDraft(id), '')

  setDraft(id, 'hello world')
  assert.equal(getDraft(id), 'hello world')

  setDraft(id, 'edited')
  assert.equal(getDraft(id), 'edited')

  deleteDraft(id)
  assert.equal(getDraft(id), '')
})

test('drafts: empty text removes the entry', () => {
  const id = `test-${Date.now()}-b`
  setDraft(id, 'something')
  setDraft(id, '')
  assert.equal(getDraft(id), '')
})

test('drafts: conversations are isolated from each other', () => {
  const a = `test-${Date.now()}-c1`
  const b = `test-${Date.now()}-c2`
  setDraft(a, 'for A')
  setDraft(b, 'for B')
  assert.equal(getDraft(a), 'for A')
  assert.equal(getDraft(b), 'for B')
  deleteDraft(a)
  assert.equal(getDraft(a), '')
  assert.equal(getDraft(b), 'for B')
  deleteDraft(b)
})

test('drafts: attachment drafts are runtime-only and isolated', () => {
  const a = `test-${Date.now()}-d1`
  const b = `test-${Date.now()}-d2`
  assert.deepEqual(getAttachmentDraft(a), [])

  setAttachmentDraft(a, [{ id: 'att_1' }])
  assert.deepEqual(getAttachmentDraft(a), [{ id: 'att_1' }])
  assert.deepEqual(getAttachmentDraft(b), [])

  setAttachmentDraft(a, [])
  assert.deepEqual(getAttachmentDraft(a), [])
})
