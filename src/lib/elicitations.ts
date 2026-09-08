/**
 * Parsing for Gemini "elicitations" — follow-up suggestions that some Web2API
 * servers append to a response as XML-like markup:
 *
 *   <ElicitationsGroup message="Where should we go from here?">
 *     <Elicitation label="Short button text" query="Full follow-up prompt"/>
 *     ...
 *   </ElicitationsGroup>
 *
 * The markup is not Markdown. GlassGem strips it from the rendered text and
 * shows the suggestions as clickable chips instead; the raw text stays in the
 * stored message so exports and re-sends remain faithful.
 */

export interface Elicitation {
  label: string
  query: string
}

export interface ElicitationGroup {
  message?: string
  elicitations: Elicitation[]
}

export interface ParsedElicitations {
  /** The response text with all elicitation markup removed. */
  clean: string
  groups: ElicitationGroup[]
}

const GROUP_OPEN = '<ElicitationsGroup'
const GROUP_CLOSE = '</ElicitationsGroup>'
const GROUP_RE = /<ElicitationsGroup(\s[^>]*)?>([\s\S]*?)<\/ElicitationsGroup>/g
const ITEM_RE = /<Elicitation\s([^>]*?)\/>/g
const ATTR_RE = /([A-Za-z_][\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g

const ENTITIES: Record<string, string> = {
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  nbsp: '\u00A0',
}

/** Decodes the common XML character entities found in attribute values. */
export function decodeEntities(value: string): string {
  return value.replace(/&(#[xX]?[0-9a-fA-F]+|[A-Za-z]+);/g, (match, body: string) => {
    if (body.startsWith('#')) {
      const hex = body[1] === 'x' || body[1] === 'X'
      const code = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
    }
    return ENTITIES[body] ?? ENTITIES[body.toLowerCase()] ?? match
  })
}

function parseAttributes(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  ATTR_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = ATTR_RE.exec(raw))) {
    out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? '')
  }
  return out
}

/**
 * During streaming the buffer can end with a half-written opening tag
 * (anything from "<" up to "<ElicitationsGroup"). Such a tail is removed so
 * partial markup does not flicker on screen; it reappears naturally once more
 * tokens arrive and the text is re-parsed.
 */
function cutPartialGroupStart(content: string): string {
  for (let len = Math.min(GROUP_OPEN.length - 1, content.length); len >= 2; len--) {
    if (content.endsWith(GROUP_OPEN.slice(0, len))) return content.slice(0, -len)
  }
  return content
}

/**
 * Extracts elicitation groups from a response. With `{ streaming: true }` an
 * unterminated trailing group (or a partially typed opening tag) is also
 * hidden so users never see half of the markup.
 */
export function parseElicitations(content: string, opts: { streaming?: boolean } = {}): ParsedElicitations {
  const groups: ElicitationGroup[] = []
  if (!content) return { clean: content, groups }

  let text = content
  if (opts.streaming) {
    const openIdx = text.lastIndexOf(GROUP_OPEN)
    if (openIdx !== -1 && text.indexOf(GROUP_CLOSE, openIdx) === -1) {
      text = text.slice(0, openIdx).replace(/\s+$/, '')
    } else {
      const cut = cutPartialGroupStart(text)
      if (cut !== text) text = cut.replace(/\s+$/, '')
    }
  }

  if (text.indexOf(GROUP_OPEN) === -1) return { clean: text, groups }

  GROUP_RE.lastIndex = 0
  let stripped = false
  text = text.replace(GROUP_RE, (_whole, attrs: string | undefined, inner: string) => {
    stripped = true
    const elicitations: Elicitation[] = []
    ITEM_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = ITEM_RE.exec(inner))) {
      const a = parseAttributes(m[1])
      const label = (a.label ?? '').trim()
      const query = (a.query ?? '').trim()
      if (label && query) elicitations.push({ label, query })
    }
    if (elicitations.length) {
      const message = (parseAttributes(attrs ?? '').message ?? '').trim()
      groups.push({ ...(message ? { message } : {}), elicitations })
    }
    return ''
  })

  if (stripped) text = text.replace(/\s+$/, '')
  return { clean: text, groups }
}

/** Convenience helper: response text without any elicitation markup. */
export function stripElicitations(content: string): string {
  return parseElicitations(content).clean
}
