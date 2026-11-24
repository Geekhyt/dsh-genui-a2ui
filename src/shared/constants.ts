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
  'range',
  'bullet',
  'histogram',
  'dumbbell',
  'rose',
  'radialBar',
  'chord',
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
  'passkey',
  'credential',
  'credentials',
  'authorization',
  'cookie',
  'pin',
  'otp',
  'totp',
  'cvv',
  'cvc',
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
  'encrypt',
  'decrypt',
  'master',
  'client',
  'auth',
  'session',
  'oauth',
  'refresh',
  'bearer',
  'csrf',
  'mfa',
  'secret',
  'deepseek',
  'openai',
  'anthropic',
  'github',
  'gitlab',
  'stripe',
  'aws',
  'gcp',
  'azure',
  'slack',
  'discord',
  'webhook',
  'license',
  'bot',
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
  'secret',
  'github',
  'gitlab',
  'stripe',
  'aws',
  'gcp',
  'azure',
  'slack',
  'discord',
  'webhook',
  'bot',
  'pat',
  'personal',
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
  'total',
  'cache',
  'cached',
  'per',
  'sec',
  'speed',
])

const TOKEN_DIRECTION_WORDS = new Set(['input', 'output'])

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

const KEY_QUALIFIER_WORDS = new Set([
  'rsa',
  'dsa',
  'ecdsa',
  'ed',
  'pem',
  'der',
  'jwk',
  'tls',
  'ssl',
  'aes',
  'hmac',
  'sha',
  'v',
  'id',
  'public',
  'prod',
  'dev',
  'staging',
  'test',
  'live',
  'sandbox',
  'primary',
  'secondary',
  'backup',
  'new',
  'old',
  'next',
  'prev',
  'current',
  'active',
  'user',
  'service',
  'account',
  'app',
  'org',
  'team',
  'project',
])

function hasPrecedingSecretKeyPrefix(words: readonly string[], keyIdx: number): boolean {
  for (let j = keyIdx - 1; j >= 0; j -= 1) {
    const w = words[j] ?? ''
    if (SECRET_KEY_PREFIXES.has(w)) return true
    if (!KEY_QUALIFIER_WORDS.has(w)) return false
  }
  return false
}

const PLURAL_SECRET_MAP: Record<string, string> = {
  passwords: 'password',
  passwds: 'passwd',
  secrets: 'secret',
  passphrases: 'passphrase',
  passcodes: 'passcode',
  passkeys: 'passkey',
  credentials: 'credential',
  cookies: 'cookie',
  pins: 'pin',
  otps: 'otp',
  totps: 'totp',
  cvvs: 'cvv',
  cvcs: 'cvc',
  jwts: 'jwt',
  keys: 'key',
}

const COMPOUND_SUBSTRING_ROOTS = [
  'password',
  'passphrase',
  'passcode',
  'passkey',
  'credential',
  'authorization',
] as const

const COMPOUND_SUFFIX_ROOTS = ['passwd', 'secret', 'cookie', 'totp', 'jwt'] as const

const COMPOUND_KEY_PREFIXES = [
  'api',
  'ssh',
  'private',
  'access',
  'signing',
  'master',
  'client',
  'encryption',
  'auth',
  'session',
  'oauth',
  'secret',
  'deepseek',
  'openai',
  'anthropic',
  'github',
  'gitlab',
  'stripe',
  'aws',
  'gcp',
  'azure',
  'slack',
  'webhook',
  'license',
] as const

const COMPOUND_TOKEN_PREFIXES = [
  'access',
  'refresh',
  'auth',
  'id',
  'session',
  'bearer',
  'mfa',
  'csrf',
  'api',
  'oauth',
  'secret',
  'github',
  'gitlab',
  'stripe',
  'slack',
  'discord',
  'bot',
  'webhook',
  'personal',
  'pat',
] as const

const CJK_SECRET_RE =
  /密码|密钥|秘钥|令牌|口令|私钥|通行码|授权码|(?:安全|登录|访问|认证|鉴权|身份|接口|账号|账户|用户)凭证/

function stripTrailingDigits(raw: string): string {
  let end = raw.length
  while (end > 0) {
    const code = raw.charCodeAt(end - 1)
    if (code < 48 || code > 57) break
    end -= 1
  }
  return end === raw.length ? raw : raw.slice(0, end)
}

function isCompoundSecretWord(raw: string): boolean {
  const base = stripTrailingDigits(raw)
  if (base.length < 5) return false
  const singular = base.endsWith('s') ? base.slice(0, -1) : base
  for (const root of COMPOUND_SUBSTRING_ROOTS) {
    if (base.includes(root)) return true
  }
  for (const root of COMPOUND_SUFFIX_ROOTS) {
    if (base.endsWith(root) || singular.endsWith(root)) return true
  }
  if (singular.endsWith('key') && singular.length > 3) {
    const prefix = singular.slice(0, -3)
    for (const p of COMPOUND_KEY_PREFIXES) {
      if (prefix === p || prefix.endsWith(p)) return true
    }
  }
  if (singular.endsWith('token') && singular.length > 5) {
    const prefix = singular.slice(0, -5)
    for (const p of COMPOUND_TOKEN_PREFIXES) {
      if (prefix === p || prefix.endsWith(p)) return true
    }
  }
  return false
}

function normalizeSecretWord(raw: string): string {
  const noDigits = stripTrailingDigits(raw)
  return Object.hasOwn(PLURAL_SECRET_MAP, noDigits) ? PLURAL_SECRET_MAP[noDigits]! : noDigits
}

export function isSecretKey(key: string): boolean {
  if (CJK_SECRET_RE.test(key)) return true
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
    if (w === 'tokens' || w === 'token') {
      const hasForceNeighbor = words.some(
        (other, idx) =>
          idx !== i && (SECRET_FORCE_NEIGHBORS.has(other) || (w === 'tokens' && other === 'id')),
      )
      if (hasForceNeighbor) return true
      if (w === 'tokens') continue
      const hasBenignNeighbor =
        words.length > 1 &&
        words.some(
          (other, idx) =>
            idx !== i &&
            (TOKEN_BENIGN_WORDS.has(other) || (idx < i && TOKEN_DIRECTION_WORDS.has(other))),
        )
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
    if (isCompoundSecretWord(raw)) return true
    if (w === 'key' && i > 0 && hasPrecedingSecretKeyPrefix(words, i)) return true
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
