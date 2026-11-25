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
  /<(?:[a-z][a-z0-9._-]*:)?(?:script|iframe|object|embed|applet|meta|base|dialog|animate|animateTransform|animateMotion|animateColor|set|discard|handler|img|image|feImage)\b/i

const TAG_EVENT_HANDLER_RE = /<(?:"[^"]*"|'[^']*'|[^'">])*[\s/]on[a-z]+\s*=/i

const OBFUSCATED_URI_RE =
  /(?:javascript|vbscript)\s*:|data\s*:\s*(?:text\/html|image\/svg\+xml|application\/xhtml\+xml)/i

const EXTERNAL_ATTR_URI_RE =
  /\b(?:background|poster|src|srcset|action|formaction|ping|cite|(?:xlink:)?href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi

const EXTERNAL_SCHEME_RE = /^(?:https?:|ftp:|file:|\/\/)/i

const TAG_OPEN_RE = /<(?:"[^"]*"|'[^']*'|[^'">])*>/g
const STYLE_BLOCK_RE =
  /<(?:[a-z][a-z0-9._-]*:)?style\b(?:"[^"]*"|'[^']*'|[^'">])*>([\s\S]*?)<\/(?:[a-z][a-z0-9._-]*:)?style\s*>/gi

const NAMED_ENTITY_MAP: Record<string, string> = {
  colon: ':',
  tab: '',
  newline: '',
  lpar: '(',
  rpar: ')',
  semi: ';',
  sol: '/',
  quot: '"',
  apos: "'",
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

function hasExternalFetchAttrInTag(tag: string): boolean {
  EXTERNAL_ATTR_URI_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = EXTERNAL_ATTR_URI_RE.exec(tag)) !== null) {
    const raw = (m[1] ?? m[2] ?? m[3] ?? '').trim()
    if (raw === '' || raw.startsWith('#')) continue
    const decoded = decodeHtmlEntities(raw).trim()
    if (EXTERNAL_SCHEME_RE.test(raw) || EXTERNAL_SCHEME_RE.test(decoded)) {
      return true
    }
  }
  return false
}

function hasUnsafeUriInTagsOrStyles(svg: string): boolean {
  TAG_OPEN_RE.lastIndex = 0
  let tagMatch: RegExpExecArray | null
  while ((tagMatch = TAG_OPEN_RE.exec(svg)) !== null) {
    const tag = tagMatch[0]
    if (
      OBFUSCATED_URI_RE.test(tag) ||
      OBFUSCATED_URI_RE.test(decodeHtmlEntities(tag)) ||
      hasExternalFetchAttrInTag(tag)
    ) {
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
const HARMLESS_XML_DECL_RE =
  /^\uFEFF?\s*<\?xml(?:\s+(?:version|encoding|standalone)\s*=\s*(?:"[^"]*"|'[^']*'))*\s*\?>/i
const XML_PROLOG_OR_DOCTYPE_RE = /<!\s*(?:DOCTYPE|ENTITY)\b|<\?/i
const INLINE_STYLE_ATTR_RE = /<(?:"[^"]*"|'[^']*'|[^'">])*\bstyle\s*=/i
const SVG_URL_CALL_RE = /\burl\s*\(([^)]*)\)/gi

function hasExternalUrlInStaticSvg(svg: string): boolean {
  const decoded = decodeHtmlEntities(svg)
  for (const candidate of [svg, decoded]) {
    SVG_URL_CALL_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = SVG_URL_CALL_RE.exec(candidate)) !== null) {
      const inner = (m[1] ?? '')
        .trim()
        .replace(/^(?:['"]|&quot;|&apos;|&#0*(?:34|39);|&#x0*(?:22|27);)/i, '')
        .replace(/(?:['"]|&quot;|&apos;|&#0*(?:34|39);|&#x0*(?:22|27);)$/i, '')
        .trim()
      if (inner !== '' && !inner.startsWith('#')) return true
    }
  }
  return false
}

const SAFE_STATIC_SVG_TAGS = new Set([
  'svg',
  'g',
  'defs',
  'title',
  'desc',
  'switch',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'textpath',
  'lineargradient',
  'radialgradient',
  'stop',
  'clippath',
  'mask',
  'pattern',
  'symbol',
  'marker',
  'filter',
  'fegaussianblur',
  'fedropshadow',
  'feoffset',
  'feblend',
  'fecolormatrix',
  'fecomponenttransfer',
  'fefuncr',
  'fefuncg',
  'fefuncb',
  'fefunca',
  'fecomposite',
  'feconvolvematrix',
  'fedisplacementmap',
  'feflood',
  'femerge',
  'femergenode',
  'femorphology',
  'fetile',
  'feturbulence',
])

const UNSAFE_ATTR_PROTOCOL_RE = /^\s*(?:javascript|vbscript|data|blob|file)\s*:/i

function verifyStaticSvgWithDomParser(body: string): boolean {
  if (typeof DOMParser === 'undefined') return true
  try {
    const doc = new DOMParser().parseFromString(body, 'image/svg+xml')
    if (!doc?.documentElement) return false
    if (doc.getElementsByTagName('parsererror').length > 0) return false
    if (doc.documentElement.localName.toLowerCase() !== 'svg') return false
    for (let i = 0; i < doc.childNodes.length; i += 1) {
      const nt = doc.childNodes[i]?.nodeType
      if (nt === 7 || nt === 10) return false
    }
    const stack: Element[] = [doc.documentElement]
    while (stack.length > 0) {
      const el = stack.pop()!
      if (!SAFE_STATIC_SVG_TAGS.has(el.localName.toLowerCase())) return false
      for (let i = 0; i < el.attributes.length; i += 1) {
        const attr = el.attributes[i]!
        const name = attr.name.toLowerCase()
        const local = attr.localName.toLowerCase()
        const val = attr.value.trim()
        if (local === 'style' || local.startsWith('on') || name.startsWith('on')) return false
        if (local === 'href' || name === 'xlink:href' || local === 'src') {
          if (val !== '' && !val.startsWith('#')) return false
        }
        if (UNSAFE_ATTR_PROTOCOL_RE.test(val)) return false
        if (hasExternalUrlInStaticSvg(val)) return false
      }
      for (let i = 0; i < el.childNodes.length; i += 1) {
        const child = el.childNodes[i]!
        if (child.nodeType === 7 || child.nodeType === 10) return false
        if (child.nodeType === 1) stack.push(child as Element)
      }
    }
    return true
  } catch {
    return false
  }
}

export function isSafeStaticSvgImage(svg: string): boolean {
  const body = svg.replace(HARMLESS_XML_DECL_RE, '')
  if (XML_PROLOG_OR_DOCTYPE_RE.test(body)) return false
  if (!/<(?:[a-z][a-z0-9._-]*:)?svg\b/i.test(body)) return false
  if (/<(?:[a-z][a-z0-9._-]*:)?(?:foreignObject|use|a|style)\b/i.test(body)) return false
  if (INLINE_STYLE_ATTR_RE.test(body)) return false
  if (hasExternalUrlInStaticSvg(body)) return false
  try {
    assertSafeSvg(body)
  } catch {
    return false
  }
  EXTERNAL_HREF_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = EXTERNAL_HREF_RE.exec(body)) !== null) {
    const val = (m[1] ?? m[2] ?? '').trim()
    if (val !== '' && !val.startsWith('#')) return false
  }
  return verifyStaticSvgWithDomParser(body)
}

const YAML_FRONTMATTER_RE =
  /^[ \t]*---[ \t]*(?:\r\n|\n|\r)[\s\S]*?(?:\r\n|\n|\r)[ \t]*---[ \t]*(?:\r\n|\n|\r|$)/
const INIT_DIRECTIVE_RE = /%%\{(?:[\s\S]*?\}%%|[^\r\n]*)/g

export function stripUnsafeDirectives(code: string): string {
  let out = code.trimStart()
  let prev = ''
  while (out !== prev) {
    prev = out
    out = out.replace(YAML_FRONTMATTER_RE, '').trimStart()
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

function maskFlowchartEdgesLinear(cleaned: string, spans: string[]): string {
  return cleaned
    .split('\n')
    .map((line) => {
      if (!line.includes('-->') && !line.includes('==>') && !line.includes('.->')) {
        return line
      }
      let out = ''
      let cursor = 0
      while (cursor < line.length) {
        let startIdx = -1
        let startLen = 0
        for (let k = cursor; k < line.length - 1; k += 1) {
          const two = line.slice(k, k + 2)
          if (
            (two === '--' && line[k + 2] !== '>') ||
            (two === '==' && line[k + 2] !== '>') ||
            two === '-.'
          ) {
            startIdx = k
            startLen = 2
            break
          }
        }
        if (startIdx === -1) {
          out += line.slice(cursor)
          break
        }
        const searchFrom = startIdx + startLen
        const ends = [
          line.indexOf('-->', searchFrom),
          line.indexOf('==>', searchFrom),
          line.indexOf('.->', searchFrom),
        ].filter((idx) => idx !== -1)
        if (ends.length === 0) {
          out += line.slice(cursor)
          break
        }
        const endIdx = Math.min(...ends) + 3
        const span = line.slice(startIdx, endIdx)
        const inner = span.slice(startLen, -3)
        if (!inner.includes('--') && !/^[-=.<>]+$/.test(span)) {
          out += line.slice(cursor, startIdx)
          spans.push(span)
          out += `\uE000${spans.length - 1}\uE001`
          cursor = endIdx
        } else {
          out += line.slice(cursor, startIdx + startLen)
          cursor = startIdx + startLen
        }
      }
      return out
    })
    .join('\n')
}

export function repairMermaidSource(code: string): string {
  const kind = extractMermaidKind(code)
  if (kind !== 'graph' && kind !== 'flowchart') return code
  const cleaned = code.replace(/`/g, '').replace(/<br\s*\/?>/gi, ' ')

  const spans: string[] = []
  const masked = maskFlowchartEdgesLinear(cleaned, spans)

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

  const quoteSpans: string[] = []
  const maskQuotedLiterals = (text: string): string =>
    text.replace(/"(?:\\.|[^"\\\n])*"/g, (lit) => {
      quoteSpans.push(lit)
      return `\uE004${quoteSpans.length - 1}\uE005`
    })

  const quoted = maskedPipes
    .split('\n')
    .map((line) => {
      if (/^\s*(?:style|classDef|linkStyle)\b/i.test(line)) return line
      let cur = maskQuotedLiterals(line)
      cur = cur.replace(/\[\(([^()[\]"\n\uE004\uE005]+)\)\]/g, (w, inner: string) => {
        const t = inner.trim()
        return t && needsQuote(t) ? `[("${t}")]` : w
      })
      cur = maskQuotedLiterals(cur)
      cur = cur.replace(/\[([^[\]"\n\uE004\uE005]+)\]/g, (w, inner: string) => {
        const t = inner.trim()
        if (!t || (t.startsWith('(') && t.endsWith(')'))) return w
        return needsQuote(t) ? `["${t}"]` : w
      })
      cur = maskQuotedLiterals(cur)
      cur = cur.replace(/\{([^{}"\n\uE004\uE005]+)\}/g, (w, inner: string) => {
        const t = inner.trim()
        return t && needsQuote(t) ? `{"${t}"}` : w
      })
      cur = maskQuotedLiterals(cur)
      cur = cur.replace(/\(([^()[\]{}"\n\uE004\uE005]+)\)/g, (w, inner: string) => {
        const t = inner.trim()
        return t && needsQuote(t) ? `("${t}")` : w
      })
      return cur.replace(
        /\uE004(\d+)\uE005/g,
        (whole, idx: string) => quoteSpans[Number(idx)] ?? whole,
      )
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

const SVG_OPEN_TAG_RE = /<(?:"[^"]*"|'[^']*'|[^'">])*>/g

function rewriteCssUrlRefs(text: string, idMap: ReadonlyMap<string, string>): string {
  return text.replace(
    /url\(\s*(["']|&quot;|&#34;|&#39;|&apos;)?#([^)"'&]+)\1\s*\)/gi,
    (_full, q: string | undefined, oldId: string) => {
      const quote = q ?? ''
      return `url(${quote}#${idMap.get(oldId) ?? oldId}${quote})`
    },
  )
}

function rewriteCssSelectorIds(cssBody: string, idMap: ReadonlyMap<string, string>): string {
  let out = ''
  let depth = 0
  let quote: '"' | "'" | null = null
  let segStart = 0
  let blockHeader = ''
  const flushSelector = (end: number) => {
    const chunk = cssBody.slice(segStart, end)
    blockHeader = chunk.trim()
    out += chunk.replace(/#([A-Za-z_][A-Za-z0-9_-]*)/g, (hit, oldId: string) => {
      const next = idMap.get(oldId)
      return next ? `#${next}` : hit
    })
  }
  for (let i = 0; i < cssBody.length; i += 1) {
    const ch = cssBody[i]!
    if (quote !== null) {
      if (ch === '\\') i += 1
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === '/' && cssBody[i + 1] === '*') {
      const end = cssBody.indexOf('*/', i + 2)
      i = end === -1 ? cssBody.length : end + 1
      continue
    }
    if (ch === '{') {
      if (depth === 0) {
        flushSelector(i)
        segStart = i + 1
      }
      depth += 1
    } else if (ch === '}') {
      if (depth > 0) depth -= 1
      if (depth === 0) {
        const inner = cssBody.slice(segStart, i)
        const rewrittenInner = /^@(?:media|supports|layer)\b/i.test(blockHeader)
          ? rewriteCssSelectorIds(inner, idMap)
          : rewriteCssUrlRefs(inner, idMap)
        out += `{${rewrittenInner}}`
        blockHeader = ''
        segStart = i + 1
      }
    }
  }
  if (segStart < cssBody.length) {
    if (depth === 0) flushSelector(cssBody.length)
    else out += `{${rewriteCssUrlRefs(cssBody.slice(segStart), idMap)}`
  }
  return out
}

export function namespaceSvgIds(markup: string, prefix: string): string {
  const idMap = new Map<string, string>()
  const idDeclRe = /(?<=[\s])id=(["'])([^"']+)\1/g
  SVG_OPEN_TAG_RE.lastIndex = 0
  let tagMatch: RegExpExecArray | null = SVG_OPEN_TAG_RE.exec(markup)
  while (tagMatch !== null) {
    const tag = tagMatch[0]
    if (!tag.startsWith('</') && !tag.startsWith('<!') && !tag.startsWith('<?')) {
      idDeclRe.lastIndex = 0
      let m: RegExpExecArray | null = idDeclRe.exec(tag)
      while (m !== null) {
        const oldId = m[2]!
        if (!idMap.has(oldId)) {
          idMap.set(oldId, `${prefix}${oldId}`)
        }
        m = idDeclRe.exec(tag)
      }
    }
    tagMatch = SVG_OPEN_TAG_RE.exec(markup)
  }
  if (idMap.size === 0) return markup
  let out = markup.replace(SVG_OPEN_TAG_RE, (tag) => {
    if (tag.startsWith('</') || tag.startsWith('<!') || tag.startsWith('<?')) return tag
    let nextTag = tag.replace(
      /(?<=[\s])id=(["'])([^"']+)\1/g,
      (_full, q: string, oldId: string) => `id=${q}${idMap.get(oldId) ?? oldId}${q}`,
    )
    nextTag = rewriteCssUrlRefs(nextTag, idMap)
    nextTag = nextTag.replace(
      /(?<=[\s])((?:xlink:)?href)=(["'])#([^"']+)\2/g,
      (_full, attr: string, q: string, oldId: string) =>
        `${attr}=${q}#${idMap.get(oldId) ?? oldId}${q}`,
    )
    nextTag = nextTag.replace(
      /(?<=[\s])(aria-(?:labelledby|describedby))=(["'])([^"']+)\2/gi,
      (_full, attr: string, q: string, list: string) => {
        const mapped = list
          .split(/\s+/)
          .map((tok) => idMap.get(tok) ?? tok)
          .join(' ')
        return `${attr}=${q}${mapped}${q}`
      },
    )
    return nextTag
  })
  out = out.replace(
    /<style([^>]*)>([\s\S]*?)<\/style>/gi,
    (_full, attrs: string, cssBody: string) =>
      `<style${attrs}>${rewriteCssSelectorIds(cssBody, idMap)}</style>`,
  )
  return out
}
