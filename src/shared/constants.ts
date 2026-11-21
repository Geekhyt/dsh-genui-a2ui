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
  maxCompiledBytes: 512_000,
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

const SECRET_SINGLE_WORDS = new Set([
  'password',
  'passwd',
  'pwd',
  'secret',
  'passphrase',
  'passcode',
  'credential',
  'credentials',
  'authorization',
  'cookie',
  'pin',
  'otp',
  'totp',
  'cvv',
  'jwt',
  'bearer',
  'oauth',
  'token',
])

const SECRET_KEY_PREFIXES = new Set([
  'api',
  'private',
  'access',
  'ssh',
  'signing',
  'encryption',
  'master',
  'client',
  'auth',
  'session',
  'oauth',
  'refresh',
  'bearer',
  'csrf',
  'mfa',
])

const SECRET_FORCE_NEIGHBORS = new Set([
  'auth',
  'api',
  'access',
  'refresh',
  'session',
  'bearer',
  'csrf',
  'mfa',
  'oauth',
  'private',
  'signing',
  'encryption',
  'master',
  'client',
  'ssh',
  'credit',
  'debit',
  'bank',
  'atm',
  'card',
  'account',
])

const TOKEN_BENIGN_WORDS = new Set([
  'budget',
  'price',
  'cost',
  'count',
  'limit',
  'max',
  'min',
  'avg',
  'usage',
  'rate',
  'length',
  'len',
  'size',
  'window',
  'prompt',
  'completion',
  'input',
  'output',
  'total',
  'cache',
  'cached',
  'per',
  'sec',
  'speed',
  'budget',
])

const PIN_BENIGN_WORDS = new Set([
  'dock',
  'sidebar',
  'panel',
  'tab',
  'top',
  'bottom',
  'header',
  'footer',
  'column',
  'row',
])

const PLURAL_SECRET_MAP: Record<string, string> = {
  passwords: 'password',
  passwds: 'passwd',
  secrets: 'secret',
  passphrases: 'passphrase',
  passcodes: 'passcode',
  credentials: 'credential',
  cookies: 'cookie',
  pins: 'pin',
  otps: 'otp',
  totps: 'totp',
  cvvs: 'cvv',
  jwts: 'jwt',
  keys: 'key',
}

const SECRET_COMPOUND_RE =
  /(?:password|passwd|passphrase|passcode|secret|credential|authorization|cookie|totp|jwt)s?\d*$|(?:api|ssh|private|access|signing|master|client|encryption|auth|session|oauth)keys?\d*$|(?:access|refresh|auth|id|session|bearer|mfa|csrf|api|oauth)tokens?\d*$/

function normalizeSecretWord(raw: string): string {
  const noDigits = raw.replace(/\d+$/, '')
  return Object.hasOwn(PLURAL_SECRET_MAP, noDigits) ? PLURAL_SECRET_MAP[noDigits]! : noDigits
}

export function isSecretKey(key: string): boolean {
  const rawWords = key
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  const words = rawWords.map(normalizeSecretWord)
  for (let i = 0; i < words.length; i++) {
    const raw = rawWords[i] ?? ''
    const w = words[i]
    if (!w) continue
    if (raw === 'tokens' || w === 'token') {
      const hasForceNeighbor = words.some(
        (other, idx) => idx !== i && SECRET_FORCE_NEIGHBORS.has(other),
      )
      if (hasForceNeighbor) return true
      if (raw === 'tokens') continue
      const hasBenignNeighbor =
        words.length > 1 && words.some((other, idx) => idx !== i && TOKEN_BENIGN_WORDS.has(other))
      if (!hasBenignNeighbor) return true
      continue
    }
    if (w === 'pin') {
      const hasForceNeighbor = words.some(
        (other, idx) => idx !== i && SECRET_FORCE_NEIGHBORS.has(other),
      )
      if (hasForceNeighbor) return true
      const hasBenignNeighbor =
        words.length > 1 && words.some((other, idx) => idx !== i && PIN_BENIGN_WORDS.has(other))
      if (!hasBenignNeighbor) return true
      continue
    }
    if (SECRET_SINGLE_WORDS.has(w)) return true
    if (SECRET_COMPOUND_RE.test(raw)) return true
    if (w === 'key' && i > 0 && SECRET_KEY_PREFIXES.has(words[i - 1] ?? '')) return true
  }
  return false
}

export function safeStringifyJson(value: unknown, space = 2): string {
  const ancestors: object[] = []
  try {
    const serialized = JSON.stringify(
      value,
      function (this: unknown, _key: string, current: unknown) {
        if (typeof current === 'bigint') return current.toString()
        if (typeof current === 'object' && current !== null) {
          while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) {
            ancestors.pop()
          }
          if (ancestors.includes(current)) return '[Circular]'
          ancestors.push(current)
        }
        return current
      },
      space,
    )
    return serialized ?? 'null'
  } catch {
    return '"[Unserializable]"'
  }
}

export function sanitizeInlineUrlText(input: unknown): string {
  if (input === null || input === undefined) return ''
  return String(input)
    .replace(
      /(?:image|https?|file|blob):\/\/\S+|(?:javascript|vbscript|data):[ \t]*[^\s"'<>]*/gi,
      '',
    )
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}
