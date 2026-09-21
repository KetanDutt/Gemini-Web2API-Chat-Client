import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  dateGroup,
  formatBytes,
  formatLatency,
  formatRelative,
  modelLabel,
  pluralize,
  previewFromContent,
  safeFilename,
  timestampSlug,
  titleFromMessage,
} from '@/lib/utils'

test('titleFromMessage: derives a short human title', () => {
  assert.equal(titleFromMessage('How does DNS resolution work?'), 'DNS Resolution Work Explained')
})

test('titleFromMessage: strips code, links and markdown noise', () => {
  const title = titleFromMessage('Please review ```js\nconst a = 1\n``` and see https://example.com for **details** about caching')
  assert.ok(!title.includes('```'))
  assert.ok(!title.includes('http'))
})

test('titleFromMessage: falls back gracefully', () => {
  assert.equal(titleFromMessage('```js\nonly code\n```'), 'New Chat')
  assert.equal(titleFromMessage(''), 'New Chat')
})

test('titleFromMessage: truncates long titles', () => {
  const title = titleFromMessage('alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu')
  assert.ok(title.length <= 48)
})

test('previewFromContent: flattens markdown and truncates', () => {
  const preview = previewFromContent('# Heading\n\nSome **bold** text', 20)
  assert.ok(!preview.includes('#'))
  assert.ok(!preview.includes('**'))
  assert.ok(preview.length <= 20)
})

test('previewFromContent: replaces code fences', () => {
  assert.ok(previewFromContent('look:\n```\ncode here\n```\ndone').includes('[code]'))
})

test('previewFromContent: strips elicitation markup', () => {
  const preview = previewFromContent('Answer text <ElicitationsGroup message="Next?"><Elicitation label="x" query="y"/></ElicitationsGroup>')
  assert.equal(preview, 'Answer text')
})

test('safeFilename: removes illegal characters', () => {
  assert.equal(safeFilename('a<b>c:d"e/f\\g|h?i*j'), 'abcdefghij')
  assert.equal(safeFilename('   '), 'conversation')
  assert.ok(safeFilename('x'.repeat(500)).length <= 80)
})

test('formatRelative: buckets by age', () => {
  const now = Date.now()
  assert.equal(formatRelative(now - 10_000, now), 'Just now')
  assert.equal(formatRelative(now - 5 * 60_000, now), '5m ago')
  assert.equal(formatRelative(now - 3 * 3_600_000, now), '3h ago')
})

test('dateGroup: groups relative to local midnight', () => {
  const now = Date.now()
  assert.equal(dateGroup(now, now), 'Today')
  assert.equal(dateGroup(now - 24 * 3_600_000, now) === 'Today', false)
  assert.equal(dateGroup(now - 400 * 24 * 3_600_000, now), 'Older')
})

test('modelLabel: prettifies model ids', () => {
  assert.equal(modelLabel('gemini-3.6-flash'), 'Gemini 3.6 Flash')
  assert.equal(modelLabel('models/gemini-pro'), 'Gemini PRO')
  assert.equal(modelLabel(''), 'No model')
})

test('formatLatency: renders ms and seconds', () => {
  assert.equal(formatLatency(250), '250ms')
  assert.equal(formatLatency(2500), '2.5s')
  assert.equal(formatLatency(undefined), '—')
})

test('formatBytes: human readable sizes', () => {
  assert.equal(formatBytes(512), '512 B')
  assert.equal(formatBytes(2048), '2.0 KB')
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB')
})

test('pluralize', () => {
  assert.equal(pluralize(1, 'model'), '1 model')
  assert.equal(pluralize(3, 'model'), '3 models')
})

test('timestampSlug: filesystem-safe, zero-padded, local time', () => {
  const ts = new Date(2026, 8, 21, 9, 5).getTime() // Sep 21 2026, 09:05 local
  assert.equal(timestampSlug(ts), '2026-09-21-0905')
  assert.ok(!/[^\d-]/.test(timestampSlug(Date.now())))
})
