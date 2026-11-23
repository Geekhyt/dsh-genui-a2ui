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
  const source = target ?? document.body ?? document.documentElement
  const value = getComputedStyle(source).getPropertyValue(name).trim()
  if (value === '') return fallback

  const probe = document.createElement('span')
  probe.style.setProperty('color', value, 'important')
  if (probe.style.color === '') return fallback
  probe.style.setProperty('display', 'none', 'important')
  const probeParent = target?.isConnected ? target : document.body
  probeParent.appendChild(probe)
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
  const brand = token('--dsw-alias-state-business-primary', dark ? '#60a5fa' : '#2563eb')
  const success = token('--dsw-alias-state-success-primary', dark ? '#34d399' : '#10b981')
  const warn = token('--dsw-alias-state-warn-primary', dark ? '#fbbf24' : '#f59e0b')
  const danger = token('--dsw-alias-state-error-primary', dark ? '#f87171' : '#ef4444')
  const line = token('--dsw-alias-label-tertiary', dark ? '#9ca3af' : '#6b7280')

  const pieColors = dark
    ? ['#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#ef4444', '#84cc16']
    : ['#2563eb', '#059669', '#d97706', '#7c3aed', '#0284c7', '#db2777', '#dc2626', '#65a30d']
  const scaleFills = dark
    ? ['#1d4ed8', '#0f766e', '#6d28d9', '#b45309', '#be185d', '#0369a1', '#047857', '#4338ca']
    : ['#dbeafe', '#ccfbf1', '#ede9fe', '#fef3c7', '#fce7f3', '#e0f2fe', '#d1fae5', '#e0e7ff']
  const scaleLabel = dark ? '#f8fafc' : '#0f172a'

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    theme: 'base',
    flowchart: {
      htmlLabels: true,
      curve: 'basis',
    },
    gantt: {
      axisFormat: '%m-%d',
      barHeight: 22,
      fontSize: 11,
      sectionFontSize: 11,
      leftPadding: 68,
      rightPadding: 28,
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
      sectionBkgColor: dark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.035)',
      sectionBkgColor2: dark ? 'rgba(255,255,255,0.02)' : 'rgba(15,23,42,0.015)',
      altSectionBkgColor: dark ? 'rgba(255,255,255,0.015)' : 'rgba(15,23,42,0.01)',
      gridColor: dark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.14)',
      excludeBkgColor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
      taskBkgColor: dark ? '#1d4ed8' : '#2563eb',
      taskBorderColor: brand,
      activeTaskBkgColor: dark ? '#b45309' : '#b45309',
      activeTaskBorderColor: warn,
      doneTaskBkgColor: dark ? '#047857' : '#047857',
      doneTaskBorderColor: success,
      critBkgColor: dark ? '#b91c1c' : '#dc2626',
      critBorderColor: danger,
      taskTextColor: '#ffffff',
      taskTextLightColor: '#ffffff',
      taskTextDarkColor: '#ffffff',
      taskTextOutsideColor: textPrimary,
      taskTextClickableColor: brand,
      todayLineColor: danger,
      pie1: pieColors[0],
      pie2: pieColors[1],
      pie3: pieColors[2],
      pie4: pieColors[3],
      pie5: pieColors[4],
      pie6: pieColors[5],
      pie7: pieColors[6],
      pie8: pieColors[7],
      pie9: pieColors[0],
      pie10: pieColors[1],
      pie11: pieColors[2],
      pie12: pieColors[3],
      pieTitleTextColor: textPrimary,
      pieSectionTextColor: '#ffffff',
      pieLegendTextColor: textPrimary,
      pieStrokeColor: dark ? '#18181b' : '#ffffff',
      pieOuterStrokeColor: border,
      pieOpacity: '0.94',
      cScale0: scaleFills[0],
      cScale1: scaleFills[1],
      cScale2: scaleFills[2],
      cScale3: scaleFills[3],
      cScale4: scaleFills[4],
      cScale5: scaleFills[5],
      cScale6: scaleFills[6],
      cScale7: scaleFills[7],
      cScaleLabel0: scaleLabel,
      cScaleLabel1: scaleLabel,
      cScaleLabel2: scaleLabel,
      cScaleLabel3: scaleLabel,
      cScaleLabel4: scaleLabel,
      cScaleLabel5: scaleLabel,
      cScaleLabel6: scaleLabel,
      cScaleLabel7: scaleLabel,
      git0: pieColors[0],
      git1: pieColors[1],
      git2: pieColors[2],
      git3: pieColors[3],
      git4: pieColors[4],
      git5: pieColors[5],
      git6: pieColors[6],
      git7: pieColors[7],
      gitBranchLabel0: '#ffffff',
      gitBranchLabel1: '#ffffff',
      gitBranchLabel2: '#ffffff',
      gitBranchLabel3: '#ffffff',
      gitBranchLabel4: '#ffffff',
      gitBranchLabel5: '#ffffff',
      gitBranchLabel6: '#ffffff',
      gitBranchLabel7: '#ffffff',
      commitLabelColor: textPrimary,
      commitLabelBackground: surfaceBg,
      tagLabelColor: textPrimary,
      tagLabelBackground: surfaceBg,
      tagLabelBorder: border,
      xyChart: {
        backgroundColor: 'transparent',
        titleColor: textPrimary,
        xAxisLabelColor: textSecondary,
        yAxisLabelColor: textSecondary,
        xAxisTitleColor: textPrimary,
        yAxisTitleColor: textPrimary,
        xAxisLineColor: border,
        yAxisLineColor: border,
        plotColorPalette: pieColors.join(','),
      },
    },
    themeCSS: [
      '.node rect, .node polygon, .node circle, .node ellipse { rx: 8px; ry: 8px; stroke-width: 1.2px; }',
      '.cluster rect { rx: 10px; ry: 10px; }',
      '.edgePath .path { stroke-width: 1.4px; }',
      '.label { color: inherit; }',
      `.tick text, .sectionTitle { fill: ${textSecondary} !important; }`,
      `.titleText, .pieTitleText, .legend text { fill: ${textPrimary} !important; }`,
      '.taskTextOutsideRight, .taskTextOutsideLeft { font-weight: 500; }',
      `.mindmap-node text, .mindmap-node tspan, .mindmap-node .nodeLabel { fill: ${scaleLabel} !important; color: ${scaleLabel} !important; }`,
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
const CSS_URL_START_RE = /\burl\s*\(/gi
const SAFE_FRAGMENT_URL_RE =
  /^\s*(?:"(#[A-Za-z0-9_.:-]+)"|'(#[A-Za-z0-9_.:-]+)'|(#[A-Za-z0-9_.:-]+))\s*\)/

function stripCssComments(cssText: string): string {
  return cssText.replace(/\/\*[\s\S]*?\*\//g, '')
}

function hasUnsafeCssContent(cssText: string): boolean {
  const clean = stripCssComments(cssText)
  if (clean.includes('/*') || UNSAFE_CSS_VALUE_RE.test(clean)) return true
  CSS_URL_START_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = CSS_URL_START_RE.exec(clean)) !== null) {
    const rest = clean.slice(CSS_URL_START_RE.lastIndex)
    if (!SAFE_FRAGMENT_URL_RE.test(rest)) return true
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
  const uncommented = stripCssComments(body).trim()
  if (uncommented === '' || uncommented.includes('/*')) return ''
  const rules = splitTopLevelCssRules(uncommented)
  const safeRules: string[] = []
  for (const rule of rules) {
    const openIdx = rule.indexOf('{')
    if (openIdx === -1 || !rule.endsWith('}')) continue
    const header = rule.slice(0, openIdx).trim()
    const inner = rule.slice(openIdx + 1, -1).trim()
    if (hasUnsafeCssContent(header)) continue
    if (header.startsWith('@')) {
      if (/^@(?:media|supports)\b/i.test(header)) {
        const filteredInner = filterScopedCssBlock(inner, rootId)
        if (filteredInner !== '') safeRules.push(`${header}{${filteredInner}}`)
      }
      continue
    }
    if (inner.includes('{') || inner.includes('}')) continue
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

function filterInlineStyleDeclarations(cssText: string): string {
  const clean = stripCssComments(cssText)
  if (clean.includes('/*')) return ''
  const kept = clean
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
  return kept.join('; ')
}

function sanitizeInlineStyleAttributes(svg: string): string {
  return svg.replace(/<(?:"[^"]*"|'[^']*'|[^'">])*>/g, (tag) => {
    if (/^<\s*(?:\/|!|\?|(?:[a-z][a-z0-9._-]*:)?svg\b)/i.test(tag)) return tag
    if (!/\bstyle\s*=/i.test(tag)) return tag
    const openMatch = /^<([A-Za-z][A-Za-z0-9:._-]*)/.exec(tag)
    if (!openMatch) return tag
    let out = openMatch[0]!
    let i = out.length
    const end = tag.endsWith('/>') ? tag.length - 2 : tag.length - 1
    while (i < end) {
      const wsStart = i
      while (i < end && /\s/.test(tag[i]!)) i += 1
      const ws = tag.slice(wsStart, i)
      if (i >= end) {
        out += ws
        break
      }
      const nameStart = i
      while (i < end && !/[\s=/>]/.test(tag[i]!)) i += 1
      const attrName = tag.slice(nameStart, i)
      if (attrName === '') {
        out += ws + tag[i]!
        i += 1
        continue
      }
      let eqIdx = i
      while (eqIdx < end && /\s/.test(tag[eqIdx]!)) eqIdx += 1
      if (eqIdx >= end || tag[eqIdx] !== '=') {
        out += ws + attrName
        continue
      }
      i = eqIdx + 1
      while (i < end && /\s/.test(tag[i]!)) i += 1
      let quote = ''
      let val = ''
      if (i < end && (tag[i] === '"' || tag[i] === "'")) {
        quote = tag[i]!
        const valStart = i + 1
        const closeQuote = tag.indexOf(quote, valStart)
        if (closeQuote === -1 || closeQuote >= end) {
          val = tag.slice(valStart, end)
          i = end
        } else {
          val = tag.slice(valStart, closeQuote)
          i = closeQuote + 1
        }
      } else {
        const valStart = i
        while (i < end && !/[\s/>]/.test(tag[i]!)) i += 1
        val = tag.slice(valStart, i)
      }
      if (attrName.toLowerCase() === 'style') {
        const cleaned = filterInlineStyleDeclarations(val)
        if (cleaned !== '') {
          const q = quote || '"'
          out += `${ws}style=${q}${cleaned}${q}`
        }
      } else if (quote !== '') {
        out += `${ws}${attrName}=${quote}${val}${quote}`
      } else {
        out += `${ws}${attrName}=${val}`
      }
    }
    return out + tag.slice(end)
  })
}

export function scopeMermaidStyleRules(svg: string, rootId: string): string {
  const scoped = svg.replace(
    /<(?:[a-z][a-z0-9._-]*:)?style\b(?:"[^"]*"|'[^']*'|[^'">])*>([\s\S]*?)<\/(?:[a-z][a-z0-9._-]*:)?style\s*>/gi,
    (_full, body: string) => {
      const safeBody = filterScopedCssBlock(body, rootId)
      return safeBody !== '' ? `<style>${safeBody}</style>` : ''
    },
  )
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
