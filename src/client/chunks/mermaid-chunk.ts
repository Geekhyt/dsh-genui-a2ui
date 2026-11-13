/**
 * Self-contained Mermaid lazy chunk (`lib/client.mermaid.js`).
 *
 * Loaded on demand via `require.async("./client.mermaid.js")` only when a
 * surface mounts `<Mermaid>`. Enforces `securityLevel: 'strict'`, strips
 * untrusted `%%{init}%%` directives, syncs DSH `--dsw-*` tokens into sRGB
 * `themeVariables`, measures labels in an off-screen container, and verifies
 * the output SVG via `assertSafeSvg`.
 */
import mermaid from 'mermaid'
import {
  ALLOWED_MERMAID_KINDS,
  assertSafeSvg,
  ensureFlowchartKind,
  extractMermaidKind,
  repairMermaidSource,
} from '../mermaid-safe.ts'

let renderSeq = 0
let renderChain: Promise<unknown> = Promise.resolve()

/** Resolve DSH `--dsw-*` CSS custom properties (including `oklch()` / `color-mix()`) to sRGB for Mermaid. */
function readMermaidThemeColor(name: string, fallback: string, target?: HTMLElement | null): string {
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
    assertSafeSvg(svg)
    return svg
  } finally {
    container.remove()
  }
}

/**
 * Serialize Mermaid renders through a single async queue so concurrent `<Mermaid>`
 * cards never race on `mermaid.initialize(...)` global state.
 */
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
      const repaired = repairMermaidSource(normalized)
      if (repaired !== normalized) {
        return await renderIntoOffscreen(`dsh-a2ui-mermaid-${++renderSeq}`, repaired)
      }
      throw firstErr
    }
  })
  renderChain = job.catch(() => {})
  return job
}
