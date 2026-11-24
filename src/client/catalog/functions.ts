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
  NumericApi,
  OpenUrlApi,
  RequiredApi,
} from '@a2ui/web_core/v1_0'
import { evaluateCalcExpression } from '../../shared/calc-engine.ts'
import {
  AvgApi,
  CalcApi,
  ConcatApi,
  CondApi,
  CopyTextApi,
  CountApi,
  EqApi,
  GtApi,
  IncludesApi,
  LookupApi,
  LtApi,
  MaxApi,
  MinApi,
  SumApi,
} from '../../shared/catalog-schema.ts'
import { resolveClientLocale } from '../../shared/i18n.ts'
import {
  filterTableRowsByField,
  normalizeCrossFilterTokens,
  parseFormattedNumericCell,
} from './v4-helpers.ts'

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

function filterAggregateItems(
  items: readonly unknown[],
  filterField?: string,
  filterValue?: unknown,
): readonly unknown[] {
  const tokens = normalizeCrossFilterTokens(filterValue)
  if (tokens.length === 0) return items
  const recordRows: Record<string, unknown>[] = []
  const scalarItems: unknown[] = []
  for (const item of items) {
    if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
      recordRows.push(item as Record<string, unknown>)
    } else {
      scalarItems.push(item)
    }
  }
  if (recordRows.length > 0) {
    return filterTableRowsByField(recordRows, filterField, tokens, false)
  }
  const lowerSet = new Set(tokens.map((t) => t.toLowerCase()))
  return scalarItems.filter((v) =>
    lowerSet.has(
      String(v ?? '')
        .trim()
        .toLowerCase(),
    ),
  )
}

export function extractNumericValues(
  items: readonly unknown[],
  field?: string,
  filterField?: string,
  filterValue?: unknown,
): number[] {
  const scoped = filterAggregateItems(items, filterField, filterValue)
  const nums: number[] = []
  for (const item of scoped) {
    const candidate =
      field !== undefined && field !== '' && typeof item === 'object' && item !== null
        ? (item as Record<string, unknown>)[field]
        : item
    const parsed = parseFormattedNumericCell(candidate)
    if (parsed !== null) {
      nums.push(parsed)
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

export function computeArraySum(
  items: readonly unknown[],
  field?: string,
  filterField?: string,
  filterValue?: unknown,
): number {
  let total = 0
  for (const n of extractNumericValues(items, field, filterField, filterValue)) {
    total += n
  }
  return total === 0 ? 0 : Number(total.toPrecision(12))
}

export function computeArrayAvg(
  items: readonly unknown[],
  field?: string,
  filterField?: string,
  filterValue?: unknown,
): number {
  const nums = extractNumericValues(items, field, filterField, filterValue)
  if (nums.length === 0) return 0
  let total = 0
  for (const n of nums) total += n
  const avg = total / nums.length
  return avg === 0 ? 0 : Number(avg.toPrecision(12))
}

export function computeArrayCount(
  items: readonly unknown[],
  filterField?: string,
  filterValue?: unknown,
): number {
  return filterAggregateItems(items, filterField, filterValue).length
}

export function computeArrayMin(
  items: readonly unknown[],
  field?: string,
  filterField?: string,
  filterValue?: unknown,
): number {
  const nums = extractNumericValues(items, field, filterField, filterValue)
  if (nums.length === 0) return 0
  let best = nums[0]!
  for (let i = 1; i < nums.length; i++) {
    if (nums[i]! < best) best = nums[i]!
  }
  return best === 0 ? 0 : Number(best.toPrecision(12))
}

export function computeArrayMax(
  items: readonly unknown[],
  field?: string,
  filterField?: string,
  filterValue?: unknown,
): number {
  const nums = extractNumericValues(items, field, filterField, filterValue)
  if (nums.length === 0) return 0
  let best = nums[0]!
  for (let i = 1; i < nums.length; i++) {
    if (nums[i]! > best) best = nums[i]!
  }
  return best === 0 ? 0 : Number(best.toPrecision(12))
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
  if (typeof left === 'string' && typeof right === 'string') {
    return left === right
  }
  const numL = tryFiniteScalar(left)
  const numR = tryFiniteScalar(right)
  if (numL !== null && numR !== null) {
    if (typeof left === 'string' && String(numL) !== left.trim()) return false
    if (typeof right === 'string' && String(numR) !== right.trim()) return false
    return numL === numR
  }
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
  if (
    typeof condition === 'object' &&
    condition !== null &&
    !Array.isArray(condition) &&
    'valid' in condition &&
    typeof (condition as { valid?: unknown }).valid === 'boolean'
  ) {
    return (condition as { valid: boolean }).valid ? truthy : falsy
  }
  if (Array.isArray(condition)) return condition.length > 0 ? truthy : falsy
  if (typeof condition === 'number')
    return Number.isFinite(condition) && condition !== 0 ? truthy : falsy
  return condition ? truthy : falsy
}

export function evaluateRequiredValue(value: unknown): { valid: boolean; message?: string } {
  if (value === null || value === undefined || value === false) {
    return { valid: false, message: 'This field is required.' }
  }
  if (typeof value === 'string' && value.trim() === '') {
    return { valid: false, message: 'This field is required.' }
  }
  if (Array.isArray(value) && value.length === 0) {
    return { valid: false, message: 'This field is required.' }
  }
  if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
    return { valid: false, message: 'This field is required.' }
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return { valid: false, message: 'This field is required.' }
  }
  return { valid: true }
}

export function evaluateNumericValue(
  value: unknown,
  min?: number,
  max?: number,
): { valid: boolean; message?: string } {
  const num = tryFiniteScalar(value)
  if (num === null) {
    return { valid: false, message: 'Value must be a valid number.' }
  }
  if (typeof min === 'number' && Number.isFinite(min) && num < min) {
    return { valid: false, message: `Minimum value is ${min}.` }
  }
  if (typeof max === 'number' && Number.isFinite(max) && num > max) {
    return { valid: false, message: `Maximum value is ${max}.` }
  }
  return { valid: true }
}

export const SafeRequiredImplementation = createFunctionImplementation(RequiredApi, (args) =>
  evaluateRequiredValue(args.value),
)

export const SafeNumericImplementation = createFunctionImplementation(NumericApi, (args) =>
  evaluateNumericValue(args.value, args.min, args.max),
)

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
  computeArraySum(
    Array.isArray(args.items) ? args.items : [],
    args.field,
    args.filterField,
    args.filterValue,
  ),
)

export const AvgImplementation = createFunctionImplementation(AvgApi, (args) =>
  computeArrayAvg(
    Array.isArray(args.items) ? args.items : [],
    args.field,
    args.filterField,
    args.filterValue,
  ),
)

export const CountImplementation = createFunctionImplementation(CountApi, (args) =>
  computeArrayCount(
    Array.isArray(args.items) ? args.items : [],
    args.filterField,
    args.filterValue,
  ),
)

export const MinImplementation = createFunctionImplementation(MinApi, (args) =>
  computeArrayMin(
    Array.isArray(args.items) ? args.items : [],
    args.field,
    args.filterField,
    args.filterValue,
  ),
)

export const MaxImplementation = createFunctionImplementation(MaxApi, (args) =>
  computeArrayMax(
    Array.isArray(args.items) ? args.items : [],
    args.field,
    args.filterField,
    args.filterValue,
  ),
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
  (args, context, abortSignal) => {
    const rawVal = (args as { value?: unknown }).value
    if (
      rawVal === null ||
      rawVal === undefined ||
      (typeof rawVal === 'string' && rawVal.trim() === '')
    ) {
      return ''
    }
    const coerced = tryFiniteScalar(rawVal)
    if (coerced === null) return ''
    return (resolveClientLocale() === 'zh' ? fmtNumberZh : fmtNumberEn).execute(
      { ...args, value: coerced },
      context,
      abortSignal,
    ) as string
  },
)

const fmtCurrencyZh = createFormatCurrencyImplementation('zh-CN')
const fmtCurrencyEn = createFormatCurrencyImplementation('en-US')
export const LocaleFormatCurrencyImplementation = createFunctionImplementation(
  FormatCurrencyApi,
  (args, context, abortSignal) => {
    const rawVal = (args as { value?: unknown }).value
    if (
      rawVal === null ||
      rawVal === undefined ||
      (typeof rawVal === 'string' && rawVal.trim() === '')
    ) {
      return ''
    }
    const coerced = tryFiniteScalar(rawVal)
    if (coerced === null) return ''
    return (resolveClientLocale() === 'zh' ? fmtCurrencyZh : fmtCurrencyEn).execute(
      { ...args, value: coerced },
      context,
      abortSignal,
    ) as string
  },
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

const OVERRIDDEN_BASIC_NAMES = new Set([
  'required',
  'numeric',
  'openUrl',
  'formatNumber',
  'formatCurrency',
  'formatDate',
])
const FILTERED_BASIC_FUNCTIONS = BASIC_FUNCTIONS.filter(
  (fn) => !OVERRIDDEN_BASIC_NAMES.has(fn.name),
)

export const SAFE_BASIC_FUNCTIONS: FunctionImplList = [
  ...FILTERED_BASIC_FUNCTIONS,
  SafeRequiredImplementation,
  SafeNumericImplementation,
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
  CountImplementation,
  MinImplementation,
  MaxImplementation,
  CalcImplementation,
  EqImplementation,
  GtImplementation,
  LtImplementation,
  IncludesImplementation,
  CondImplementation,
  ConcatImplementation,
  LookupImplementation,
]
