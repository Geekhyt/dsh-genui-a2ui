export const DSH_CATALOG_ID = 'https://dsh-a2ui.local/specification/v1_0/catalogs/dsh/catalog.json'
export const BASIC_CATALOG_ID = 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json'

export const RENDER_TOOL = 'a2ui_render'
export const ASK_TOOL = 'a2ui_ask'
export const TIER_COMMAND = 'a2ui'
export const ANSWER_COMMAND = 'a2ui-answer'

export const A2UI_LIMITS = {
  maxUiChars: 64_000,
  maxSurfacesPerCall: 8,
  maxComponentsPerSurface: 250,
  maxDataModelBytes: 256_000,
  maxRepairsPerTurn: 2,
} as const

export const CHART_KINDS = [
  'bar',
  'line',
  'area',
  'pie',
  'scatter',
  'radar',
  'funnel',
  'gauge',
  'heatmap',
  'treemap',
  'sankey',
  'boxplot',
  'graph',
  'candlestick',
  'waterfall',
  'combo',
  'sunburst',
  'parallel',
  'calendar',
] as const

export type ChartKind = (typeof CHART_KINDS)[number]

export type A2uiEnabled = boolean

export type SurfacePlacement = 'answer' | 'inline' | 'dock'

export const SURFACE_PLACEMENTS: readonly SurfacePlacement[] = ['answer', 'inline', 'dock']

export function normalizePlacement(raw: unknown): SurfacePlacement {
  if (typeof raw === 'string') {
    const trimmed = raw.trim() as SurfacePlacement
    if ((SURFACE_PLACEMENTS as readonly string[]).includes(trimmed)) {
      return trimmed
    }
  }
  return 'answer'
}

const DANGEROUS_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export function isDangerousObjectKey(key: string): boolean {
  return DANGEROUS_OBJECT_KEYS.has(key)
}

const SECRET_SINGLE_WORDS = new Set(['password', 'passwd', 'pwd', 'secret'])
const SECRET_TOKEN_PREFIXES = new Set([
  'access',
  'refresh',
  'auth',
  'bearer',
  'id',
  'session',
  'api',
  'oauth',
  'csrf',
  'jwt',
  'secret',
])

export function isSecretKey(key: string): boolean {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    if (!w) continue
    if (SECRET_SINGLE_WORDS.has(w)) return true
    if (w === 'apikey' || w === 'privatekey') return true
    if (w === 'key' && i > 0 && (words[i - 1] === 'api' || words[i - 1] === 'private')) return true
    if (w === 'token' && i > 0 && SECRET_TOKEN_PREFIXES.has(words[i - 1] ?? '')) return true
  }
  return false
}
