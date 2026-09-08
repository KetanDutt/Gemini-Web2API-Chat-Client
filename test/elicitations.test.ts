import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeEntities, parseElicitations, stripElicitations } from '@/lib/elicitations'

const SAMPLE = `Here is the plan we discussed.

<ElicitationsGroup message="Where should we go from here?"> <Elicitation label="Get a ComfyUI node setup" query="Show me the optimal ComfyUI workflow and node structure for generating high-resolution line art."/> <Elicitation label="Build the Python script" query="Write a Python script that compiles PNG images into a print-ready PDF."/> <Elicitation label="Learn Ollama to n8n" query="Explain how to connect Ollama to n8n for listing generation."/> </ElicitationsGroup>`

test('parseElicitations: extracts group message and all elicitations', () => {
  const { clean, groups } = parseElicitations(SAMPLE)
  assert.equal(groups.length, 1)
  assert.equal(groups[0].message, 'Where should we go from here?')
  assert.equal(groups[0].elicitations.length, 3)
  assert.equal(groups[0].elicitations[0].label, 'Get a ComfyUI node setup')
  assert.ok(groups[0].elicitations[1].query.startsWith('Write a Python script'))
})

test('parseElicitations: strips the markup from the rendered text', () => {
  const { clean } = parseElicitations(SAMPLE)
  assert.equal(clean, 'Here is the plan we discussed.')
  assert.ok(!clean.includes('Elicitation'))
})

test('parseElicitations: multiline layout with one item per line', () => {
  const text = 'Done.\n<ElicitationsGroup message="Next?">\n  <Elicitation label="A" query="Do A"/>\n  <Elicitation label="B" query="Do B"/>\n</ElicitationsGroup>\n'
  const { clean, groups } = parseElicitations(text)
  assert.equal(clean, 'Done.')
  assert.deepEqual(groups[0].elicitations.map((e) => e.label), ['A', 'B'])
})

test('parseElicitations: multiple groups and text in between', () => {
  const text = 'One <ElicitationsGroup><Elicitation label="x" query="X"/></ElicitationsGroup> two <ElicitationsGroup><Elicitation label="y" query="Y"/></ElicitationsGroup>'
  const { clean, groups } = parseElicitations(text)
  assert.equal(clean, 'One  two')
  assert.equal(groups.length, 2)
})

test('parseElicitations: decodes entities in attributes', () => {
  const text = '<ElicitationsGroup message="A &amp; B"><Elicitation label="Say &quot;hi&quot; &#39;there&#39;" query="q &lt;1&gt;"/></ElicitationsGroup>'
  const { groups } = parseElicitations(text)
  assert.equal(groups[0].message, 'A & B')
  assert.equal(groups[0].elicitations[0].label, 'Say "hi" \'there\'')
  assert.equal(groups[0].elicitations[0].query, 'q <1>')
})

test('parseElicitations: accepts single-quoted attributes', () => {
  const { groups } = parseElicitations("<ElicitationsGroup message='Next'><Elicitation label='Go' query='Go now'/></ElicitationsGroup>")
  assert.equal(groups[0].message, 'Next')
  assert.equal(groups[0].elicitations[0].query, 'Go now')
})

test('parseElicitations: skips items missing label or query', () => {
  const text = '<ElicitationsGroup><Elicitation label="only-label"/><Elicitation query="only-query"/><Elicitation label="ok" query="fine"/></ElicitationsGroup>'
  const { groups } = parseElicitations(text)
  assert.deepEqual(groups[0].elicitations, [{ label: 'ok', query: 'fine' }])
})

test('parseElicitations: empty group is stripped but not listed', () => {
  const { clean, groups } = parseElicitations('Text <ElicitationsGroup message="hi"></ElicitationsGroup>')
  assert.equal(clean, 'Text')
  assert.equal(groups.length, 0)
})

test('parseElicitations: unterminated group is left alone when not streaming', () => {
  const text = 'Body <ElicitationsGroup message="oops"><Elicitation label="a" query="b"/>'
  assert.equal(parseElicitations(text).clean, text)
})

test('parseElicitations: streaming hides an unterminated group', () => {
  const { clean, groups } = parseElicitations('Body <ElicitationsGroup message="par', { streaming: true })
  assert.equal(clean, 'Body')
  assert.equal(groups.length, 0)
})

test('parseElicitations: streaming hides a partially typed opening tag', () => {
  assert.equal(parseElicitations('Body <Elicit', { streaming: true }).clean, 'Body')
  assert.equal(parseElicitations('Body <ElicitationsGro', { streaming: true }).clean, 'Body')
})

test('parseElicitations: streaming still extracts finished groups', () => {
  const { clean, groups } = parseElicitations(`${SAMPLE} tail`, { streaming: true })
  assert.equal(clean, 'Here is the plan we discussed.\n\n tail')
  assert.equal(groups.length, 1)
})

test('parseElicitations: no markup is a fast passthrough', () => {
  const text = 'Just a normal answer with <code> bits & stuff'
  assert.equal(parseElicitations(text).clean, text)
  assert.equal(parseElicitations('').clean, '')
})

test('stripElicitations: returns plain text', () => {
  assert.equal(stripElicitations(SAMPLE), 'Here is the plan we discussed.')
})

test('decodeEntities: unknown entities are preserved', () => {
  assert.equal(decodeEntities('a &unknown; b &amp; c &#65;'), 'a &unknown; b & c A')
})
