import DOMPurify from 'dompurify'
import mermaid from 'mermaid'
import {
  ALLOWED_MERMAID_KINDS,
  assertSafeSvg,
  ensureFlowchartKind,
  extractMermaidKind,
  repairMermaidSource,
  stripUnsafeDirectives,
} from '../mermaid-safe.ts'

let renderSeq = 0
let renderChain: Promise<unknown> = Promise.resolve()

function readMermaidThemeColor(
  name: string,
  fallback: string,
  target?: HTMLElement | null,
): string {
  if (typeof document === 'undefined' || document.body === null) return fallback
  const source = target ?? document.documentElement
  const value = getComputedStyle(source).getPropertyValue(name).trim()
  if (value === '') return fallback

  const probe = document.createElement('span')
  probe.style.setProperty('color', value, 'important')
  if (probe.style.color === '') return fallback
  probe.style.setProperty('display', 'none', 'important')
  document.body.appendChild(probe)
  let color: string
  try {
    color = getComputedStyle(probe).color
  } finally {
    probe.remove()
  }
  if (/^rgba?\([\d.,\s]+\)$/i.test(color) || /^#[0-9a-f]{3,8}$/i.test(color)) return color

  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext('2d')
  if (context === null) return fallback
  context.fillStyle = '#010203'
  const sentinel = context.fillStyle
  context.fillStyle = color
  if (context.fillStyle === sentinel) return fallback
  try {
    context.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
    return `rgba(${r}, ${g}, ${b}, ${(a ?? 255) / 255})`
  } catch {
    return fallback
  }
}

function configureMermaidForHost(dark: boolean, target?: HTMLElement | null): void {
  const cache = new Map<string, string>()
  const token = (name: string, fallback: string): string => {
    const hit = cache.get(name)
    if (hit !== undefined) return hit
    const resolved = readMermaidThemeColor(name, fallback, target)
    cache.set(name, resolved)
    return resolved
  }

  const fontFamily =
    typeof document !== 'undefined' && document.body
      ? getComputedStyle(target ?? document.body).fontFamily
      : 'ui-sans-serif, system-ui, sans-serif'

  const surfaceBg = token('--dsw-alias-bg-layer-2', dark ? '#27272a' : '#f4f4f5')
  const textPrimary = token('--dsw-alias-label-primary', dark ? '#f4f4f5' : '#18181b')
  const textSecondary = token('--dsw-alias-label-secondary', dark ? '#a1a1aa' : '#52525b')
  const border = token('--dsw-alias-border-l2', dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.16)')
  const brand = token('--dsw-alias-brand-primary', dark ? '#60a5fa' : '#2563eb')
  const line = token('--dsw-alias-label-tertiary', dark ? '#9ca3af' : '#6b7280')

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    theme: 'base',
    flowchart: {
      htmlLabels: true,
      curve: 'basis',
    },
    themeVariables: {
      darkMode: dark,
      background: 'transparent',
      fontFamily,
      fontSize: '13px',
      primaryColor: surfaceBg,
      primaryTextColor: textPrimary,
      primaryBorderColor: brand,
      secondaryColor: surfaceBg,
      secondaryTextColor: textPrimary,
      secondaryBorderColor: border,
      tertiaryColor: surfaceBg,
      tertiaryTextColor: textPrimary,
      tertiaryBorderColor: border,
      mainBkg: surfaceBg,
      nodeBorder: border,
      nodeTextColor: textPrimary,
      lineColor: line,
      textColor: textPrimary,
      edgeLabelBackground: dark ? '#18181b' : '#ffffff',
      clusterBkg: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
      clusterBorder: border,
      titleColor: textPrimary,
      actorBkg: surfaceBg,
      actorBorder: brand,
      actorTextColor: textPrimary,
      signalColor: line,
      signalTextColor: textPrimary,
      noteBkgColor: surfaceBg,
      noteBorderColor: border,
      noteTextColor: textSecondary,
    },
    themeCSS: [
      '.node rect, .node polygon, .node circle, .node ellipse { rx: 8px; ry: 8px; stroke-width: 1.2px; }',
      '.cluster rect { rx: 10px; ry: 10px; }',
      '.edgePath .path { stroke-width: 1.4px; }',
      '.label { color: inherit; }',
    ].join(' '),
  })
}

const FORBID_SVG_TAGS = [
  'script',
  'iframe',
  'object',
  'embed',
  'applet',
  'form',
  'input',
  'textarea',
  'button',
  'meta',
  'link',
  'base',
  'img',
  'image',
  'feImage',
  'use',
  'a',
  'audio',
  'video',
  'animate',
  'animateTransform',
  'animateMotion',
  'set',
]

const UNSAFE_CSS_VALUE_RE =
  /\\|@import\b|expression\s*\(|image-set\s*\(|javascript\s*:|vbscript\s*:/i
const CSS_URL_RE = /url\s*\(\s*(['"]?)([^)'"]*)\1\s*\)/gi

function hasUnsafeCssContent(cssText: string): boolean {
  if (UNSAFE_CSS_VALUE_RE.test(cssText)) return true
  CSS_URL_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = CSS_URL_RE.exec(cssText)) !== null) {
    const target = (m[2] ?? '').trim()
    if (!target.startsWith('#')) return true
  }
  return false
}

function splitTopLevelCssRules(body: string): string[] {
  const rules: string[] = []
  let depth = 0
  let quote: '"' | "'" | null = null
  let start = 0
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!
    if (quote !== null) {
      if (ch === '\\') i += 1
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === '{') {
      depth += 1
    } else if (ch === '}') {
      depth = Math.max(0, depth - 1)
      if (depth === 0) {
        const rule = body.slice(start, i + 1).trim()
        if (rule !== '') rules.push(rule)
        start = i + 1
      }
    } else if (ch === ';' && depth === 0) {
      const rule = body.slice(start, i + 1).trim()
      if (rule !== '') rules.push(rule)
      start = i + 1
    }
  }
  const tail = body.slice(start).trim()
  if (tail !== '') rules.push(tail)
  return rules
}

function isSelectorScopedToRoot(selector: string, rootId: string): boolean {
  const trimmed = selector.trim()
  const prefix = `#${rootId}`
  if (!trimmed.startsWith(prefix)) return false
  const next = trimmed[prefix.length]
  return next === undefined || /[\s>+~.:[#,]/.test(next)
}

function filterScopedCssBlock(body: string, rootId: string): string {
  const uncommented = body.replace(/\/\*[\s\S]*?\*\//g, '').trim()
  if (uncommented === '') return ''
  const rules = splitTopLevelCssRules(uncommented)
  const safeRules: string[] = []
  for (const rule of rules) {
    const openIdx = rule.indexOf('{')
    if (openIdx === -1 || !rule.endsWith('}')) continue
    const header = rule.slice(0, openIdx).trim()
    const inner = rule.slice(openIdx + 1, -1).trim()
    if (hasUnsafeCssContent(header)) continue
    if (header.startsWith('@')) {
      if (/^@(?:keyframes|-webkit-keyframes)\b/i.test(header)) {
        if (!hasUnsafeCssContent(inner)) safeRules.push(rule)
      } else if (/^@(?:media|supports)\b/i.test(header)) {
        const filteredInner = filterScopedCssBlock(inner, rootId)
        if (filteredInner !== '') safeRules.push(`${header}{${filteredInner}}`)
      }
      continue
    }
    if (hasUnsafeCssContent(inner)) continue
    const selectors = header
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (selectors.length === 0) continue
    if (selectors.every((s) => isSelectorScopedToRoot(s, rootId))) {
      safeRules.push(rule)
    }
  }
  return safeRules.join('\n')
}

const UNSAFE_INLINE_STYLE_PROP_RE =
  /^(?:position|z-index|inset|top|right|bottom|left|behavior|-moz-binding)$/i

function sanitizeInlineStyleAttributes(svg: string): string {
  return svg.replace(
    /(<(?!svg\b)[A-Za-z][A-Za-z0-9:-]*\b[^>]*?)\s+style\s*=\s*(["'])([\s\S]*?)\2/gi,
    (_full, prefix: string, quote: string, cssText: string) => {
      const kept = cssText
        .split(';')
        .map((decl) => decl.trim())
        .filter((decl) => {
          if (decl === '') return false
          const colon = decl.indexOf(':')
          if (colon === -1) return false
          const prop = decl.slice(0, colon).trim()
          const val = decl.slice(colon + 1).trim()
          if (UNSAFE_INLINE_STYLE_PROP_RE.test(prop)) return false
          if (hasUnsafeCssContent(val)) return false
          return true
        })
      return kept.length > 0 ? `${prefix} style=${quote}${kept.join('; ')}${quote}` : prefix
    },
  )
}

export function scopeMermaidStyleRules(svg: string, rootId: string): string {
  const scoped = svg.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_full, body: string) => {
    const safeBody = filterScopedCssBlock(body, rootId)
    return safeBody !== '' ? `<style>${safeBody}</style>` : ''
  })
  return sanitizeInlineStyleAttributes(scoped)
}

async function renderIntoOffscreen(id: string, source: string): Promise<string> {
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '-100000px'
  container.style.top = '0'
  container.style.margin = '0'
  container.style.pointerEvents = 'none'
  document.body?.appendChild(container)
  try {
    const { svg } = await mermaid.render(id, source, container)
    if (typeof DOMPurify?.sanitize !== 'function') {
      throw new Error('DOMPurify sanitizer unavailable; refusing to render unsanitized Mermaid SVG')
    }
    const cleanSvg = scopeMermaidStyleRules(
      DOMPurify.sanitize(svg, {
        ADD_TAGS: ['foreignObject', 'foreignobject'],
        ADD_ATTR: ['dominant-baseline'],
        FORBID_TAGS: FORBID_SVG_TAGS,
        ALLOW_UNKNOWN_PROTOCOLS: false,
        HTML_INTEGRATION_POINTS: { foreignobject: true },
      }),
      id,
    )
    assertSafeSvg(cleanSvg)
    return cleanSvg
  } finally {
    container.remove()
  }
}

export function renderMermaidDiagram(
  rawCode: string,
  dark: boolean,
  target?: HTMLElement | null,
): Promise<string> {
  const job = renderChain.then(async () => {
    const normalized = ensureFlowchartKind(rawCode)
    const kind = extractMermaidKind(normalized)
    if (!(ALLOWED_MERMAID_KINDS as readonly string[]).includes(kind)) {
      throw new Error(`Unsupported Mermaid diagram kind "${kind || 'unknown'}"`)
    }
    configureMermaidForHost(dark, target)
    try {
      return await renderIntoOffscreen(`dsh-a2ui-mermaid-${++renderSeq}`, normalized)
    } catch (firstErr) {
      const repaired = stripUnsafeDirectives(repairMermaidSource(normalized))
      if (repaired !== normalized) {
        return await renderIntoOffscreen(`dsh-a2ui-mermaid-${++renderSeq}`, repaired)
      }
      throw firstErr
    }
  })
  renderChain = job.catch(() => {})
  return job
}
