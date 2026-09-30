/**
 * Unit tests for the pure helpers exported from the conversation store:
 * in-flight status detection and the "continue truncated answer" request
 * builder.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildContinueMessages, isInFlightStatus } from '@/stores/conversationStore'
import type { Message } from '@/types'

function msg(partial: Partial<Message> & Pick<Message, 'id' | 'role'>): Message {
  return {
    conversationId: 'conv_1',
    content: 'hello',
    createdAt: 1,
    status: 'complete',
    order: 0,
    ...partial,
  }
}

test('isInFlightStatus: only pending and streaming count', () => {
  assert.equal(isInFlightStatus('pending'), true)
  assert.equal(isInFlightStatus('streaming'), true)
  assert.equal(isInFlightStatus('complete'), false)
  assert.equal(isInFlightStatus('error'), false)
  assert.equal(isInFlightStatus('stopped'), false)
})

test('buildContinueMessages: replays history, then truncated answer, then instruction', () => {
  const history: Message[] = [
    msg({ id: 'u1', role: 'user', content: 'Write a long essay', order: 0 }),
    msg({ id: 'a1', role: 'assistant', content: 'Once upon a time', order: 1, status: 'complete', finishReason: 'length' }),
  ]
  const out = buildContinueMessages(history, 'a1', 'CONTINUE')
  assert.equal(out.length, 3)
  assert.deepEqual(out[0], { role: 'user', content: 'Write a long essay' })
  assert.deepEqual(out[1], { role: 'assistant', content: 'Once upon a time' })
  assert.deepEqual(out[2], { role: 'user', content: 'CONTINUE' })
})

test('buildContinueMessages: includes the system prompt and skips broken messages', () => {
  const history: Message[] = [
    msg({ id: 's0', role: 'system', content: 'ignored role', order: 0 }),
    msg({ id: 'a0', role: 'assistant', content: '', order: 1, status: 'error' }),
    msg({ id: 'u1', role: 'user', content: 'Hi', order: 2 }),
    msg({ id: 'a1', role: 'assistant', content: 'Partial…', order: 3, status: 'complete', finishReason: 'length' }),
  ]
  const out = buildContinueMessages(history, 'a1', 'CONTINUE', 'Be terse.')
  assert.deepEqual(out[0], { role: 'system', content: 'Be terse.' })
  // The errored/empty assistant message must not leak into the request.
  assert.ok(out.every((m) => m.content !== ''))
  assert.ok(out.some((m) => m.role === 'assistant' && m.content === 'Partial…'))
  assert.equal(out[out.length - 1].content, 'CONTINUE')
})

test('buildContinueMessages: unknown assistant id falls back to plain history', () => {
  const history: Message[] = [msg({ id: 'u1', role: 'user', content: 'Hi' })]
  const out = buildContinueMessages(history, 'missing', 'CONTINUE')
  assert.equal(out.length, 1)
  assert.deepEqual(out[0], { role: 'user', content: 'Hi' })
})
