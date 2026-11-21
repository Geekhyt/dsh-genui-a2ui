export const ALLOWED_MERMAID_KINDS = [
  'flowchart',
  'graph',
  'sequenceDiagram',
  'classDiagram',
  'stateDiagram',
  'stateDiagram-v2',
  'erDiagram',
  'gantt',
  'pie',
  'journey',
  'gitGraph',
  'mindmap',
  'timeline',
  'quadrantChart',
  'xychart-beta',
] as const

const FORBIDDEN_SVG_TAG_RE =
  /<(?:script|iframe|object|embed|applet|meta|base|animate|animateTransform|animateMotion|set|image|feImage)\b/i

const TAG_EVENT_HANDLER_RE = /<(?:"[^"]*"|'[^']*'|[^'">])*\bon[a-z]+\s*=/i

const OBFUSCATED_URI_RE =
  /(?:javascript|vbscript)\s*:|data\s*:\s*(?:text\/html|image\/svg\+xml|application\/xhtml\+xml)/i

const TAG_OPEN_RE = /<(?:"[^"]*"|'[^']*'|[^'">])*>/g
const STYLE_BLOCK_RE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi

const NAMED_ENTITY_MAP: Record<string, string> = {
  colon: ':',
  tab: '',
  newline: '',
  lpar: '(',
  rpar: ')',
  semi: ';',
  sol: '/',
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) => {
      const cp = Number.parseInt(hex, 16)
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ''
    })
    .replace(/&#([0-9]+);?/g, (_, dec: string) => {
      const cp = Number.parseInt(dec, 10)
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ''
    })
    .replace(/&([a-z]+);/gi, (m, name: string) => {
      const lower = name.toLowerCase()
      return Object.hasOwn(NAMED_ENTITY_MAP, lower) ? (NAMED_ENTITY_MAP[lower] ?? '') : m
    })
    .replace(/[\u0000-\u0020]+/g, '')
}

function hasUnsafeUriInTagsOrStyles(svg: string): boolean {
  TAG_OPEN_RE.lastIndex = 0
  let tagMatch: RegExpExecArray | null
  while ((tagMatch = TAG_OPEN_RE.exec(svg)) !== null) {
    const tag = tagMatch[0]
    if (OBFUSCATED_URI_RE.test(tag) || OBFUSCATED_URI_RE.test(decodeHtmlEntities(tag))) {
      return true
    }
  }
  STYLE_BLOCK_RE.lastIndex = 0
  let styleMatch: RegExpExecArray | null
  while ((styleMatch = STYLE_BLOCK_RE.exec(svg)) !== null) {
    const body = styleMatch[1] ?? ''
    if (OBFUSCATED_URI_RE.test(body) || OBFUSCATED_URI_RE.test(decodeHtmlEntities(body))) {
      return true
    }
  }
  return false
}

export function assertSafeSvg(svg: string): void {
  if (
    FORBIDDEN_SVG_TAG_RE.test(svg) ||
    TAG_EVENT_HANDLER_RE.test(svg) ||
    hasUnsafeUriInTagsOrStyles(svg)
  ) {
    throw new Error('Mermaid SVG failed sanitization check; refusing to render')
  }
}

const EXTERNAL_HREF_RE = /\b(?:xlink:)?href\s*=\s*(?:"([^"]*)"|'([^']*)')/gi

export function isSafeStaticSvgImage(svg: string): boolean {
  if (!/<svg\b/i.test(svg)) return false
  if (/<foreignObject\b|<use\b|<a\b|<style\b/i.test(svg)) return false
  try {
    assertSafeSvg(svg)
  } catch {
    return false
  }
  EXTERNAL_HREF_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = EXTERNAL_HREF_RE.exec(svg)) !== null) {
    const val = (m[1] ?? m[2] ?? '').trim()
    if (val !== '' && !val.startsWith('#')) return false
  }
  return true
}

const YAML_FRONTMATTER_RE = /^\s*---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/
const INIT_DIRECTIVE_RE = /%%\{[\s\S]*?\}%%/g

export function stripUnsafeDirectives(code: string): string {
  let out = code
  let prev = ''
  while (out !== prev) {
    prev = out
    out = out.replace(YAML_FRONTMATTER_RE, '')
    out = out.replace(INIT_DIRECTIVE_RE, '')
  }
  return out.trim()
}

export function extractMermaidKind(code: string): string {
  for (const rawLine of code.split('\n')) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('%%')) continue
    return /^([A-Za-z][A-Za-z0-9-]*)/.exec(line)?.[1] ?? ''
  }
  return ''
}

const FLOWCHART_EDGE_RE = /-->(?!>)|==>|-\.->/

export function ensureFlowchartKind(code: string): string {
  const cleaned = stripUnsafeDirectives(code)
  const kind = extractMermaidKind(cleaned)
  if ((ALLOWED_MERMAID_KINDS as readonly string[]).includes(kind)) return cleaned
  if (!FLOWCHART_EDGE_RE.test(cleaned)) return cleaned
  return `graph TD\n${cleaned}`
}

export function repairMermaidSource(code: string): string {
  const kind = extractMermaidKind(code)
  if (kind !== 'graph' && kind !== 'flowchart') return code
  const cleaned = code.replace(/`/g, '').replace(/<br\s*\/?>/gi, ' ')

  const EDGE = /(--|==|-\.)(?!>)[ \t]*([^-\n]|-(?!--))*?[ \t]*(-->|==>|\.->)/g
  const spans: string[] = []
  const masked = cleaned.replace(EDGE, (span) => {
    if (/^[-=.<>]+$/.test(span)) return span
    spans.push(span)
    return `\uE000${spans.length - 1}\uE001`
  })

  const PIPE_LINK = /(?:<|[ox])?(?:-{2,}[>ox]?|={2,}[>ox]?|-\.+-[>ox]?)[ \t]*\|/y
  const pipeSpans: string[] = []
  const closers: string[] = []
  let inQuote = false
  let copied = 0
  let maskedPipes = ''

  for (let i = 0; i < masked.length; i++) {
    const ch = masked[i]!
    if (inQuote) {
      if (ch === '\\') i++
      else if (ch === '"') inQuote = false
      continue
    }
    if (ch === '"') {
      inQuote = true
      continue
    }
    if (ch === '%' && masked[i + 1] === '%') {
      const end = masked.indexOf('\n', i)
      if (end === -1) break
      i = end
      continue
    }
    if ('[({'.includes(ch)) {
      closers.push(ch === '[' ? ']' : ch === '(' ? ')' : '}')
      continue
    }
    if (ch === closers[closers.length - 1]) {
      closers.pop()
      continue
    }
    if (closers.length > 0 || !'<ox-='.includes(ch)) continue
    if (i > 0 && '-=.'.includes(masked[i - 1]!)) continue

    PIPE_LINK.lastIndex = i
    const link = PIPE_LINK.exec(masked)
    if (link === null) continue
    const start = PIPE_LINK.lastIndex
    let end = start
    let labelQuote = false
    for (; end < masked.length && masked[end] !== '\n'; end++) {
      if (masked[end] === '\\' && labelQuote) {
        end++
        continue
      }
      if (masked[end] === '"') labelQuote = !labelQuote
      if (masked[end] === '|' && !labelQuote) break
    }
    if (masked[end] !== '|') continue
    const text = masked.slice(start, end)
    const trimmed = text.trim()
    const label = /[@[\]()]/.test(trimmed) && !trimmed.includes('"') ? `"${trimmed}"` : text
    pipeSpans.push(`${link[0]}${label}|`)
    maskedPipes += `${masked.slice(copied, i)}\uE002${pipeSpans.length - 1}\uE003`
    copied = end + 1
    i = end
  }
  maskedPipes += masked.slice(copied)

  const needsQuote = (s: string) =>
    /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(s) || /\s/.test(s) || /[()/:?]/.test(s)

  const quoted = maskedPipes
    .split('\n')
    .map((line) => {
      if (/^\s*(?:style|classDef|linkStyle)\b/i.test(line)) return line
      return line
        .replace(/\[\(([^()[\]"\n]+)\)\]/g, (w, inner: string) => {
          const t = inner.trim()
          return t && needsQuote(t) ? `[("${t}")]` : w
        })
        .replace(/\[([^[\]"\n]+)\]/g, (w, inner: string) => {
          const t = inner.trim()
          if (!t || (t.startsWith('(') && t.endsWith(')'))) return w
          return needsQuote(t) ? `["${t}"]` : w
        })
        .replace(/\{([^{}"\n]+)\}/g, (w, inner: string) => {
          const t = inner.trim()
          return t && needsQuote(t) ? `{"${t}"}` : w
        })
        .replace(/\(([^()[\]{}"\n]+)\)/g, (w, inner: string) => {
          const t = inner.trim()
          return t && needsQuote(t) ? `("${t}")` : w
        })
    })
    .join('\n')

  const restored = quoted
    .replace(/\uE002(\d+)\uE003/g, (whole, idx: string) => pipeSpans[Number(idx)] ?? whole)
    .replace(/\uE000(\d+)\uE001/g, (whole, idx: string) => spans[Number(idx)] ?? whole)
  return stripUnsafeDirectives(restored)
}

export interface PreparedMermaidSvg {
  readonly markup: string
  readonly width: number
  readonly height: number
}

export function prepareMermaidSvg(rawSvg: string): PreparedMermaidSvg {
  const openTagMatch = /<svg\b[^>]*>/i.exec(rawSvg)
  if (!openTagMatch) {
    return { markup: rawSvg, width: 800, height: 480 }
  }
  const openTag = openTagMatch[0]

  let width = 0
  let height = 0
  const vbMatch =
    /\bviewBox\s*=\s*["']\s*[+-]?\d*\.?\d+(?:e[+-]?\d+)?[\s,]+\s*[+-]?\d*\.?\d+(?:e[+-]?\d+)?[\s,]+\s*([+-]?\d*\.?\d+(?:e[+-]?\d+)?)[\s,]+\s*([+-]?\d*\.?\d+(?:e[+-]?\d+)?)\s*["']/i.exec(
      openTag,
    )
  let hasValidViewBox = false
  if (vbMatch) {
    width = Number.parseFloat(vbMatch[1]!)
    height = Number.parseFloat(vbMatch[2]!)
    hasValidViewBox = Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0
  }

  if (!(width > 0)) {
    const maxWMatch = /max-width\s*:\s*([0-9.]+)\s*px/i.exec(openTag)
    const wAttrMatch = /\bwidth\s*=\s*["']\s*([0-9.]+)(?:px)?\s*["']/i.exec(openTag)
    width = maxWMatch
      ? Number.parseFloat(maxWMatch[1]!)
      : wAttrMatch
        ? Number.parseFloat(wAttrMatch[1]!)
        : 800
  }
  if (!(height > 0)) {
    const hAttrMatch = /\bheight\s*=\s*["']\s*([0-9.]+)(?:px)?\s*["']/i.exec(openTag)
    height = hAttrMatch ? Number.parseFloat(hAttrMatch[1]!) : Math.round(width * 0.6)
  }

  const safeW = Math.max(1, Math.round(width * 100) / 100)
  const safeH = Math.max(1, Math.round(height * 100) / 100)

  let nextOpenTag = openTag
    .replace(/\bstyle\s*=\s*(["'])([\s\S]*?)\1/i, (_full, quote: string, cssText: string) => {
      const cleanedCss = cssText
        .split(';')
        .map((part) => part.trim())
        .filter((part) => part !== '' && !/^max-width\s*:/i.test(part))
        .join('; ')
      return cleanedCss ? `style=${quote}${cleanedCss}${quote}` : ''
    })
    .replace(/\s+\b(?:width|height)\s*=\s*["'][^"']*["']/gi, '')

  if (!hasValidViewBox) {
    nextOpenTag = nextOpenTag.replace(/\s+\bviewBox\s*=\s*["'][^"']*["']/gi, '')
    nextOpenTag = nextOpenTag.replace(/^<svg\b/i, `<svg viewBox="0 0 ${safeW} ${safeH}"`)
  }
  if (!/\bpreserveAspectRatio\s*=/i.test(nextOpenTag)) {
    nextOpenTag = nextOpenTag.replace(/^<svg\b/i, '<svg preserveAspectRatio="xMidYMid meet"')
  }
  nextOpenTag = nextOpenTag.replace(/^<svg\b/i, `<svg width="${safeW}" height="${safeH}"`)

  const markup =
    rawSvg.slice(0, openTagMatch.index) +
    nextOpenTag +
    rawSvg.slice(openTagMatch.index + openTag.length)

  return { markup, width: safeW, height: safeH }
}
