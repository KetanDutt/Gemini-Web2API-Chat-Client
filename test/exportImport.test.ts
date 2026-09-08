import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildExport,
  conversationToMarkdown,
  conversationToText,
  ImportError,
  parseImport,
  serializeConversation,
} from '@/services/exportImport'
import type { Conversation, Message } from '@/types'

function makeConversation(patch: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conv_1',
    title: 'Test conversation',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_100_000,
    model: 'gemini-3.6-flash',
    favorite: false,
    archived: false,
    ...patch,
  }
}

function makeMessage(patch: Partial<Message>): Message {
  return {
    id: 'msg_1',
    conversationId: 'conv_1',
    role: 'user',
    content: 'Hello',
    createdAt: 1_700_000_000_000,
    status: 'complete',
    order: 0,
    ...patch,
  }
}

test('parseImport: accepts a full GlassGem export', () => {
  const exportJson = JSON.stringify(
    buildExport([{ conversation: makeConversation(), messages: [makeMessage({})] }]),
  )
  const { conversations, prompts } = parseImport(exportJson)
  assert.equal(conversations.length, 1)
  assert.equal(conversations[0].messages.length, 1)
  assert.equal(conversations[0].conversation.title, 'Test conversation')
  assert.deepEqual(prompts, [])
})

test('parseImport: assigns fresh ids and sequential order', () => {
  const { conversations } = parseImport(
    JSON.stringify({ conversation: makeConversation(), messages: [makeMessage({}), makeMessage({ id: 'msg_2', role: 'assistant', content: 'Hi', order: 1 })] }),
  )
  const [item] = conversations
  assert.notEqual(item.conversation.id, 'conv_1')
  assert.notEqual(item.messages[0].id, 'msg_1')
  assert.deepEqual(item.messages.map((m) => m.order), [0, 1])
})

test('parseImport: accepts a bare {conversation, messages} object', () => {
  const { conversations } = parseImport(JSON.stringify({ conversation: makeConversation(), messages: [] }))
  assert.equal(conversations.length, 1)
})

test('parseImport: accepts OpenAI-style {messages:[...]} transcripts', () => {
  const { conversations } = parseImport(
    JSON.stringify({ messages: [{ role: 'user', content: 'one' }, { role: 'assistant', content: 'two' }] }),
  )
  assert.equal(conversations[0].messages.length, 2)
})

test('parseImport: drops invalid messages but keeps the rest', () => {
  const { conversations } = parseImport(
    JSON.stringify({ messages: [{ role: 'user', content: 'kept' }, { role: 'tool', content: 'dropped' }, { content: 'no role' }] }),
  )
  assert.deepEqual(conversations[0].messages.map((m) => m.content), ['kept'])
})

test('parseImport: validates attachments and strips bad data URLs', () => {
  const { conversations } = parseImport(
    JSON.stringify({
      messages: [
        {
          role: 'user',
          content: 'look',
          attachments: [
            { name: 'ok.png', mimeType: 'image/png', size: 10, dataUrl: 'data:image/png;base64,AAA' },
            { name: 'evil.png', dataUrl: 'javascript:alert(1)' },
            { name: '' },
          ],
        },
      ],
    }),
  )
  const atts = conversations[0].messages[0].attachments!
  assert.equal(atts.length, 1)
  assert.equal(atts[0].name, 'ok.png')
  assert.ok(atts[0].dataUrl?.startsWith('data:image/'))
})

test('parseImport: keeps message versions and clamps activeVersion', () => {
  const { conversations } = parseImport(
    JSON.stringify({
      messages: [
        { role: 'assistant', content: 'v2', versions: [{ content: 'v1' }, { content: 'v2' }], activeVersion: 99 },
      ],
    }),
  )
  const msg = conversations[0].messages[0]
  assert.equal(msg.versions?.length, 2)
  assert.equal(msg.activeVersion, 1)
  assert.equal(msg.content, 'v2')
})

test('parseImport: rejects invalid input with ImportError', () => {
  assert.throws(() => parseImport('not json'), ImportError)
  assert.throws(() => parseImport('[]'), ImportError)
  assert.throws(() => parseImport('{"conversations":[]}'), /no conversations/i)
})

test('parseImport: imports prompts with sanitised categories', () => {
  const { prompts } = parseImport(
    JSON.stringify({
      conversations: [{ conversation: makeConversation(), messages: [] }],
      prompts: [
        { name: 'Good', text: 'do things', category: 'Coding', favorite: true },
        { name: 'Weird', text: 'also', category: 'Hacking' },
        { name: 'Empty', text: '   ' },
      ],
    }),
  )
  assert.equal(prompts.length, 2)
  assert.equal(prompts[0].category, 'Coding')
  assert.equal(prompts[1].category, 'Personal')
})

test('conversationToMarkdown: includes title, turns and attachment markers', () => {
  const md = conversationToMarkdown(makeConversation({ systemPrompt: 'Be brief' }), [
    makeMessage({ content: 'What is this?', attachments: [{ id: 'a', name: 'photo.png', mimeType: 'image/png', size: 2048 }] }),
    makeMessage({ id: 'm2', role: 'assistant', content: 'An answer.', order: 1 }),
  ])
  assert.ok(md.startsWith('# Test conversation'))
  assert.ok(md.includes('## System'))
  assert.ok(md.includes('Be brief'))
  assert.ok(md.includes('## User'))
  assert.ok(md.includes('[image: photo.png'))
  assert.ok(md.includes('## Gemini'))
})

test('conversationToText: renders roles and timestamps', () => {
  const txt = conversationToText(makeConversation(), [makeMessage({ content: 'hi there' })])
  assert.ok(txt.includes('User ('))
  assert.ok(txt.includes('hi there'))
  assert.ok(txt.includes('Model: gemini-3.6-flash'))
})

test('serializeConversation: picks mime and extension per format', () => {
  const conv = makeConversation()
  const messages = [makeMessage({})]
  assert.equal(serializeConversation('markdown', conv, messages).ext, 'md')
  assert.equal(serializeConversation('txt', conv, messages).mime, 'text/plain')
  const json = serializeConversation('json', conv, messages)
  assert.equal(json.ext, 'json')
  const round = JSON.parse(json.content)
  assert.equal(round.app, 'GlassGem')
  assert.equal(round.conversations.length, 1)
})

test('buildExport: stamps app name, version and date', () => {
  const out = buildExport([])
  assert.equal(out.app, 'GlassGem')
  assert.equal(out.version, 1)
  assert.ok(!Number.isNaN(Date.parse(out.exportedAt)))
})
