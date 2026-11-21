import {
  A2uiExpressionError,
  BASIC_FUNCTIONS,
  createFormatCurrencyImplementation,
  createFormatDateImplementation,
  createFormatNumberImplementation,
  createFunctionImplementation,
  FormatCurrencyApi,
  FormatDateApi,
  FormatNumberApi,
  type FunctionImplementation,
  OpenUrlApi,
} from '@a2ui/web_core/v1_0'
import { evaluateCalcExpression } from '../../shared/calc-engine.ts'
import {
  AvgApi,
  CalcApi,
  ConcatApi,
  CondApi,
  CopyTextApi,
  EqApi,
  GtApi,
  IncludesApi,
  LookupApi,
  LtApi,
  SumApi,
} from '../../shared/catalog-schema.ts'
import { resolveClientLocale } from '../../shared/i18n.ts'

type FunctionImplList = readonly FunctionImplementation[]

export function parseSafeExternalUrl(rawInput: unknown): string {
  if (typeof rawInput !== 'string' || rawInput.trim() === '') {
    throw new A2uiExpressionError('openUrl requires a non-empty absolute URL', 'openUrl')
  }
  const trimmed = rawInput.trim()
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch (err) {
    throw new A2uiExpressionError(`Invalid or relative URL rejected: ${trimmed}`, 'openUrl', err)
  }
  if (
    parsed.protocol !== 'https:' &&
    parsed.protocol !== 'http:' &&
    parsed.protocol !== 'mailto:'
  ) {
    throw new A2uiExpressionError(`Unsupported URL scheme "${parsed.protocol}"`, 'openUrl')
  }
  return parsed.href
}

export function executeSafeOpenUrl(rawInput: unknown): void {
  const href = parseSafeExternalUrl(rawInput)
  if (typeof window === 'undefined' || typeof window.open !== 'function') return
  const activation = (
    globalThis.navigator as { userActivation?: { isActive?: boolean } } | undefined
  )?.userActivation
  if (activation !== undefined && activation.isActive === false) {
    throw new A2uiExpressionError('openUrl blocked: requires direct user gesture', 'openUrl')
  }
  window.open(href, '_blank', 'noopener,noreferrer')
}

export function extractNumericValues(items: readonly unknown[], field?: string): number[] {
  const nums: number[] = []
  for (const item of items) {
    const candidate =
      field !== undefined && field !== '' && typeof item === 'object' && item !== null
        ? (item as Record<string, unknown>)[field]
        : item
    if (typeof candidate === 'number') {
      if (Number.isFinite(candidate)) nums.push(candidate)
    } else if (typeof candidate === 'string') {
      const cleaned = candidate.replace(/,/g, '').trim()
      if (cleaned !== '') {
        const num = Number(cleaned)
        if (Number.isFinite(num)) nums.push(num)
      }
    }
  }
  return nums
}

export function computeArraySum(items: readonly unknown[], field?: string): number {
  let total = 0
  for (const n of extractNumericValues(items, field)) {
    total += n
  }
  return total === 0 ? 0 : Number(total.toPrecision(12))
}

export function computeArrayAvg(items: readonly unknown[], field?: string): number {
  const nums = extractNumericValues(items, field)
  if (nums.length === 0) return 0
  let total = 0
  for (const n of nums) total += n
  const avg = total / nums.length
  return avg === 0 ? 0 : Number(avg.toPrecision(12))
}

export function coerceFiniteNumber(input: unknown, fallback = 0): number {
  if (typeof input === 'number') return Number.isFinite(input) ? input : fallback
  if (typeof input === 'string') {
    const cleaned = input.replace(/,/g, '').trim()
    if (cleaned === '') return fallback
    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return fallback
}

export function computeCalc(expr: unknown, vars?: unknown, decimals?: unknown): number {
  return evaluateCalcExpression(expr, vars, decimals)
}

function unwrapSingleChoice(val: unknown): unknown {
  return Array.isArray(val) && val.length === 1 ? val[0] : val
}

function tryFiniteScalar(val: unknown): number | null {
  if (typeof val === 'number') return Number.isFinite(val) ? val : null
  if (typeof val === 'string') {
    const cleaned = val.replace(/,/g, '').trim()
    if (cleaned === '') return null
    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export function computeEq(a: unknown, b: unknown): boolean {
  const left = unwrapSingleChoice(a)
  const right = unwrapSingleChoice(b)
  if (left === right) return true
  const numL = tryFiniteScalar(left)
  const numR = tryFiniteScalar(right)
  if (numL !== null && numR !== null) return numL === numR
  if (
    (typeof left === 'string' || typeof left === 'number' || typeof left === 'boolean') &&
    (typeof right === 'string' || typeof right === 'number' || typeof right === 'boolean')
  ) {
    return String(left) === String(right)
  }
  return false
}

export function computeGt(a: unknown, b: unknown): boolean {
  const numL = tryFiniteScalar(unwrapSingleChoice(a))
  const numR = tryFiniteScalar(unwrapSingleChoice(b))
  if (numL === null || numR === null) return false
  return numL > numR
}

export function computeLt(a: unknown, b: unknown): boolean {
  const numL = tryFiniteScalar(unwrapSingleChoice(a))
  const numR = tryFiniteScalar(unwrapSingleChoice(b))
  if (numL === null || numR === null) return false
  return numL < numR
}

export function computeIncludes(items: unknown, value: unknown): boolean {
  if (Array.isArray(items)) {
    return items.some((el) => computeEq(el, value))
  }
  if (typeof items === 'string') {
    if (value === undefined || value === null) return false
    return items.includes(String(value))
  }
  return false
}

export function computeCond(condition: unknown, truthy: unknown, falsy: unknown): unknown {
  if (Array.isArray(condition)) return condition.length > 0 ? truthy : falsy
  if (typeof condition === 'number')
    return Number.isFinite(condition) && condition !== 0 ? truthy : falsy
  return condition ? truthy : falsy
}

export const SafeOpenUrlImplementation = createFunctionImplementation(OpenUrlApi, (args) => {
  executeSafeOpenUrl(args.url)
})

export const CopyTextImplementation = createFunctionImplementation(CopyTextApi, (args) => {
  const text = args.text === undefined || args.text === null ? '' : String(args.text)
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(text).catch(() => {})
  }
})

export const SumImplementation = createFunctionImplementation(SumApi, (args) =>
  computeArraySum(Array.isArray(args.items) ? args.items : [], args.field),
)

export const AvgImplementation = createFunctionImplementation(AvgApi, (args) =>
  computeArrayAvg(Array.isArray(args.items) ? args.items : [], args.field),
)

export const CalcImplementation = createFunctionImplementation(CalcApi, (args) =>
  computeCalc(args.expr, args.vars, args.decimals),
)

export const EqImplementation = createFunctionImplementation(EqApi, (args) =>
  computeEq(args.a, args.b),
)

export const GtImplementation = createFunctionImplementation(GtApi, (args) =>
  computeGt(args.a, args.b),
)

export const LtImplementation = createFunctionImplementation(LtApi, (args) =>
  computeLt(args.a, args.b),
)

export const IncludesImplementation = createFunctionImplementation(IncludesApi, (args) =>
  computeIncludes(args.items, args.value),
)

export function computeConcat(items: unknown): string {
  if (!Array.isArray(items)) return items == null ? '' : String(items)
  return items.map((part) => (part == null ? '' : String(part))).join('')
}

export function computeLookup(key: unknown, table: unknown, fallback?: unknown): unknown {
  const unwrapped = Array.isArray(key) && key.length === 1 ? key[0] : key
  if (
    typeof table === 'object' &&
    table !== null &&
    !Array.isArray(table) &&
    unwrapped !== undefined &&
    unwrapped !== null
  ) {
    const rec = table as Record<string, unknown>
    const strKey = String(unwrapped)
    if (Object.hasOwn(rec, strKey)) {
      return rec[strKey]
    }
  }
  return fallback
}

export const LookupImplementation = createFunctionImplementation(LookupApi, (args) =>
  computeLookup(args.key, args.table, args.fallback),
)

export const ConcatImplementation = createFunctionImplementation(ConcatApi, (args) =>
  computeConcat(args.items),
)

export const CondImplementation = createFunctionImplementation(CondApi, (args) =>
  computeCond(args.condition, args.truthy, args.falsy),
)

const fmtNumberZh = createFormatNumberImplementation('zh-CN')
const fmtNumberEn = createFormatNumberImplementation('en-US')
export const LocaleFormatNumberImplementation = createFunctionImplementation(
  FormatNumberApi,
  (args, context, abortSignal) =>
    (resolveClientLocale() === 'zh' ? fmtNumberZh : fmtNumberEn).execute(
      args,
      context,
      abortSignal,
    ) as string,
)

const fmtCurrencyZh = createFormatCurrencyImplementation('zh-CN')
const fmtCurrencyEn = createFormatCurrencyImplementation('en-US')
export const LocaleFormatCurrencyImplementation = createFunctionImplementation(
  FormatCurrencyApi,
  (args, context, abortSignal) =>
    (resolveClientLocale() === 'zh' ? fmtCurrencyZh : fmtCurrencyEn).execute(
      args,
      context,
      abortSignal,
    ) as string,
)

const fmtDateZh = createFormatDateImplementation('zh-CN')
const fmtDateEn = createFormatDateImplementation('en-US')
export const LocaleFormatDateImplementation = createFunctionImplementation(
  FormatDateApi,
  (args, context, abortSignal) =>
    (resolveClientLocale() === 'zh' ? fmtDateZh : fmtDateEn).execute(
      args,
      context,
      abortSignal,
    ) as string,
)

const OVERRIDDEN_BASIC_NAMES = new Set(['openUrl', 'formatNumber', 'formatCurrency', 'formatDate'])
const FILTERED_BASIC_FUNCTIONS = BASIC_FUNCTIONS.filter(
  (fn) => !OVERRIDDEN_BASIC_NAMES.has(fn.name),
)

export const SAFE_BASIC_FUNCTIONS: FunctionImplList = [
  ...FILTERED_BASIC_FUNCTIONS,
  LocaleFormatNumberImplementation,
  LocaleFormatCurrencyImplementation,
  LocaleFormatDateImplementation,
  SafeOpenUrlImplementation,
]

export const DSH_FUNCTIONS: FunctionImplList = [
  ...SAFE_BASIC_FUNCTIONS,
  CopyTextImplementation,
  SumImplementation,
  AvgImplementation,
  CalcImplementation,
  EqImplementation,
  GtImplementation,
  LtImplementation,
  IncludesImplementation,
  CondImplementation,
  ConcatImplementation,
  LookupImplementation,
]
