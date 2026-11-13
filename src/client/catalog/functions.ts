/**
 * Hardened A2UI 1.0 renderer functions + DSH-native semantic primitives (`M3`).
 *
 * Kept intentionally minimal and orthogonal to uphold A2UI's declarative philosophy:
 * - Hardens `openUrl` (rejects relative URLs, `javascript:`, `file:`, `data:`, and non-gesture calls).
 * - Action helper: `copyText(text)`.
 * - Array aggregates: `sum(items, field?)`, `avg(items, field?)`.
 * - Single numeric formula gateway: `calc(expr, vars?, decimals?)` (validated statically on Host).
 * - Minimal UI branching primitives: `cond(condition, truthy, falsy)`, `eq(a, b)`, `gt(a, b)`,
 *   `lt(a, b)`, `includes(items, value)`.
 */
import {
  A2uiExpressionError,
  BASIC_FUNCTIONS,
  OpenUrlApi,
  createFunctionImplementation,
  type FunctionImplementation,
} from '@a2ui/web_core/v1_0'
import { evaluateCalcExpression } from '../../shared/calc-engine.ts'
import {
  AvgApi,
  CalcApi,
  CondApi,
  CopyTextApi,
  EqApi,
  GtApi,
  IncludesApi,
  LtApi,
  SumApi,
} from '../../shared/catalog-schema.ts'

type FunctionImplList = readonly FunctionImplementation[]

/** Validate an external URL strictly without resolving relative paths against the DSH origin. */
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
  const activation = (globalThis.navigator as { userActivation?: { isActive?: boolean } } | undefined)
    ?.userActivation
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
    const num = typeof candidate === 'number' ? candidate : Number(candidate)
    if (Number.isFinite(num)) {
      nums.push(num)
    }
  }
  return nums
}

export function computeArraySum(items: readonly unknown[], field?: string): number {
  let total = 0
  for (const n of extractNumericValues(items, field)) {
    total += n
  }
  return Math.round(total * 1_000_000) / 1_000_000
}

export function computeArrayAvg(items: readonly unknown[], field?: string): number {
  const nums = extractNumericValues(items, field)
  if (nums.length === 0) return 0
  let total = 0
  for (const n of nums) total += n
  return Math.round((total / nums.length) * 100) / 100
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
  return coerceFiniteNumber(a) > coerceFiniteNumber(b)
}

export function computeLt(a: unknown, b: unknown): boolean {
  return coerceFiniteNumber(a) < coerceFiniteNumber(b)
}

export function computeIncludes(items: unknown, value: unknown): boolean {
  if (Array.isArray(items)) {
    return items.some((el) => computeEq(el, value))
  }
  if (typeof items === 'string') {
    return items.includes(String(value ?? ''))
  }
  return false
}

export function computeCond(condition: unknown, truthy: unknown, falsy: unknown): unknown {
  return Boolean(condition) ? truthy : falsy
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

export const CondImplementation = createFunctionImplementation(CondApi, (args) =>
  computeCond(args.condition, args.truthy, args.falsy),
)

const FILTERED_BASIC_FUNCTIONS = BASIC_FUNCTIONS.filter((fn) => fn.name !== 'openUrl')

export const SAFE_BASIC_FUNCTIONS: FunctionImplList = [
  ...FILTERED_BASIC_FUNCTIONS,
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
]
