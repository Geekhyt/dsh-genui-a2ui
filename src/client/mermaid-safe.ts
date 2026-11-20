/**
 * Pure Mermaid sanitization, directive stripping, kind allowlist, and CJK label repair.
 *
 * Zero `mermaid` imports — lightweight enough (~2 kB) to unit-test directly in Node
 * and share between `MermaidWidget` and `mermaid-chunk`.
 */

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

const SVG_INJECTION_RE =
  /<script|<iframe|<object|<embed|<applet|<meta|<base|(?:javascript|vbscript)\s*:|data\s*:\s*text\/html/i

/** Match inline `on*="..."` attributes strictly inside HTML/SVG opening tags, never inside `<text>` content. */
const TAG_EVENT_HANDLER_RE = /<(?:"[^"]*"|'[^']*'|[^'">])*\bon[a-z]+\s*=/i

const OBFUSCATED_URI_RE = /(?:javascript|vbscript)\s*:|data\s*:\s*text\/html/i

function decodeHtmlNumericEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) => {
      const cp = Number.parseInt(hex, 16)
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ''
    })
    .replace(/&#([0-9]+);?/g, (_, dec: string) => {
      const cp = Number.parseInt(dec, 10)
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ''
    })
    .replace(/[\u0000-\u0020]+/g, '')
}

/** Reject any rendered SVG carrying script/embed tags, inline event handlers, or `javascript:`/`vbscript:` URIs. */
export function assertSafeSvg(svg: string): void {
  if (
    SVG_INJECTION_RE.test(svg) ||
    TAG_EVENT_HANDLER_RE.test(svg) ||
    OBFUSCATED_URI_RE.test(decodeHtmlNumericEntities(svg))
  ) {
    throw new Error('Mermaid SVG failed sanitization check; refusing to render')
  }
}

/**
 * Strip model-supplied `%%{init: ...}%%` directives and YAML frontmatter blocks so
 * untrusted diagram text can never override `securityLevel: "strict"` or theme settings.
 */
export function stripUnsafeDirectives(code: string): string {
  return code
    .replace(/^\s*---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
    .replace(/%%\{[\s\S]*?\}%%/g, '')
    .trim()
}

/** Extract the diagram kind token from the first non-comment, non-empty line. */
export function extractMermaidKind(code: string): string {
  for (const rawLine of code.split('\n')) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('%%')) continue
    return /^([A-Za-z][A-Za-z0-9-]*)/.exec(line)?.[1] ?? ''
  }
  return ''
}

const FLOWCHART_EDGE_RE = /-->(?!>)|==>|-\.->/

/**
 * If a model emits bare flowchart edges (`A --> B`) without the leading `graph TD`
 * declaration, prepend `graph TD` automatically while leaving other syntax untouched.
 */
export function ensureFlowchartKind(code: string): string {
  const cleaned = stripUnsafeDirectives(code)
  const kind = extractMermaidKind(cleaned)
  if ((ALLOWED_MERMAID_KINDS as readonly string[]).includes(kind)) return cleaned
  if (!FLOWCHART_EDGE_RE.test(cleaned)) return cleaned
  return `graph TD\n${cleaned}`
}

/**
 * Conservative fallback repair for model-authored `graph` / `flowchart` diagrams
 * when the initial parse fails (quotes unquoted CJK/spaced node labels and bracketed
 * pipe labels while preserving labeled edge arrows `-- text -->`).
 */
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

  return quoted
    .replace(/\uE002(\d+)\uE003/g, (whole, idx: string) => pipeSpans[Number(idx)] ?? whole)
    .replace(/\uE000(\d+)\uE001/g, (whole, idx: string) => spans[Number(idx)] ?? whole)
}

export interface PreparedMermaidSvg {
  readonly markup: string
  readonly width: number
  readonly height: number
}

/**
 * Extract intrinsic vector dimensions from a rendered Mermaid `<svg>` and strip
 * Mermaid's inline `style="max-width: ...px"` / percentage width lock so explicit
 * vector zoom (`10%` – `2000%`) and viewport-fit scaling render crisply at any ratio.
 */
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
  if (vbMatch) {
    width = Number.parseFloat(vbMatch[1]!)
    height = Number.parseFloat(vbMatch[2]!)
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

  if (!vbMatch) {
    nextOpenTag = nextOpenTag.replace(/^<svg\b/i, `<svg viewBox="0 0 ${safeW} ${safeH}"`)
  }
  nextOpenTag = nextOpenTag.replace(/^<svg\b/i, `<svg width="${safeW}" height="${safeH}"`)

  const markup =
    rawSvg.slice(0, openTagMatch.index) +
    nextOpenTag +
    rawSvg.slice(openTagMatch.index + openTag.length)

  return { markup, width: safeW, height: safeH }
}
