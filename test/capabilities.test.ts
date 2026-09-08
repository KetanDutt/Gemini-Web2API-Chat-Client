import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_CAPABILITIES,
  shouldSendSamplingParams,
  shouldSendSystemMessage,
  shouldTryStreaming,
  type Capabilities,
} from '@/services/capabilities'

const caps = (patch: Partial<Capabilities>): Capabilities => ({ ...DEFAULT_CAPABILITIES, ...patch })

test('DEFAULT_CAPABILITIES: everything unknown except image input', () => {
  assert.equal(DEFAULT_CAPABILITIES.chatCompletions, 'unknown')
  assert.equal(DEFAULT_CAPABILITIES.streaming, 'unknown')
  // Image input is never assumed; the user opts in once their server is verified.
  assert.equal(DEFAULT_CAPABILITIES.imageInput, 'unsupported')
})

test('shouldTryStreaming: respects the user preference first', () => {
  assert.equal(shouldTryStreaming(caps({ streaming: 'supported' }), false), false)
})

test('shouldTryStreaming: tries when unknown or supported, skips when unsupported', () => {
  assert.equal(shouldTryStreaming(caps({ streaming: 'unknown' }), true), true)
  assert.equal(shouldTryStreaming(caps({ streaming: 'supported' }), true), true)
  assert.equal(shouldTryStreaming(caps({ streaming: 'unsupported' }), true), false)
})

test('shouldSendSystemMessage: only skipped once proven unsupported', () => {
  assert.equal(shouldSendSystemMessage(caps({ systemMessages: 'unknown' })), true)
  assert.equal(shouldSendSystemMessage(caps({ systemMessages: 'supported' })), true)
  assert.equal(shouldSendSystemMessage(caps({ systemMessages: 'unsupported' })), false)
})

test('shouldSendSamplingParams: requires both user opt-in and no known failure', () => {
  assert.equal(shouldSendSamplingParams(caps({ samplingParams: 'unknown' }), false), false)
  assert.equal(shouldSendSamplingParams(caps({ samplingParams: 'unknown' }), true), true)
  assert.equal(shouldSendSamplingParams(caps({ samplingParams: 'unsupported' }), true), false)
})
