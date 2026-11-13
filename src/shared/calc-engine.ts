/**
 * Isomorphic, zero-`eval` algebraic evaluator & static validator for `calc(expr, vars?, decimals?)`.
 *
 * Shared by:
 * - **Host (`src/host/generator.ts`)**: statically validates formula syntax, function whitelist,
 *   and `vars` variable bindings at compile time so typos fail fast and self-repair in-turn.
 * - **Client (`src/client/catalog/functions.ts`)**: evaluates pre-parsed cached ASTs at 0ms
 *   during 60fps `Slider` / `ChoicePicker` interactions while keeping A2UI wire `funcDepth = 1`.
 */

const MAX_EXPR_LENGTH = 2_048
const MAX_TOKENS = 512
const MAX_AST_DEPTH = 36
const MAX_CACHE_ENTRIES = 256

export const ALLOWED_CALC_FUNCTIONS: ReadonlySet<string> = new Set([
  'pow',
  'sqrt',
  'exp',
  'ln',
  'log10',
  'log',
  'abs',
  'floor',
  'ceil',
  'round',
  'min',
  'max',
  'clamp',
  'pmt',
  'sin',
  'cos',
  'tan',
])

type Token =
  | { readonly kind: 'num'; readonly value: number }
  | { readonly kind: 'ident'; readonly name: string }
  | { readonly kind: 'op'; readonly op: string }
  | { readonly kind: 'lparen' }
  | { readonly kind: 'rparen' }
  | { readonly kind: 'comma' }
  | { readonly kind: 'question' }
  | { readonly kind: 'colon' }
  | { readonly kind: 'eof' }

type ExprNode =
  | { readonly kind: 'num'; readonly value: number }
  | { readonly kind: 'var'; readonly name: string }
  | { readonly kind: 'unary'; readonly op: '-' | '+' | '!'; readonly arg: ExprNode }
  | { readonly kind: 'binary'; readonly op: string; readonly left: ExprNode; readonly right: ExprNode }
  | { readonly kind: 'ternary'; readonly cond: ExprNode; readonly truthy: ExprNode; readonly falsy: ExprNode }
  | { readonly kind: 'call'; readonly fn: string; readonly args: readonly ExprNode[] }

const astCache = new Map<string, ExprNode | null>()

function tokenize(src: string): { readonly tokens?: readonly Token[]; readonly error?: string } {
  if (src.length === 0) return { error: 'Formula expression cannot be empty.' }
  if (src.length > MAX_EXPR_LENGTH) {
    return { error: `Formula exceeds maximum length (${MAX_EXPR_LENGTH} chars).` }
  }
  const tokens: Token[] = []
  let i = 0
  const n = src.length

  while (i < n) {
    if (tokens.length > MAX_TOKENS) {
      return { error: `Formula exceeds maximum token count (${MAX_TOKENS}).` }
    }
    const ch = src[i]!
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++
      continue
    }

    if ((ch >= '0' && ch <= '9') || (ch === '.' && i + 1 < n && src[i + 1]! >= '0' && src[i + 1]! <= '9')) {
      const start = i
      while (i < n && src[i]! >= '0' && src[i]! <= '9') i++
      if (i < n && src[i] === '.') {
        i++
        while (i < n && src[i]! >= '0' && src[i]! <= '9') i++
      }
      if (i < n && (src[i] === 'e' || src[i] === 'E')) {
        i++
        if (i < n && (src[i] === '+' || src[i] === '-')) i++
        const expStart = i
        while (i < n && src[i]! >= '0' && src[i]! <= '9') i++
        if (i === expStart) return { error: `Invalid scientific notation near "${src.slice(start, i + 2)}".` }
      }
      const parsed = Number(src.slice(start, i))
      if (!Number.isFinite(parsed)) return { error: `Non-finite numeric literal "${src.slice(start, i)}".` }
      tokens.push({ kind: 'num', value: parsed })
      continue
    }

    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
      const start = i
      i++
      while (
        i < n &&
        ((src[i]! >= 'a' && src[i]! <= 'z') ||
          (src[i]! >= 'A' && src[i]! <= 'Z') ||
          (src[i]! >= '0' && src[i]! <= '9') ||
          src[i] === '_')
      ) {
        i++
      }
      tokens.push({ kind: 'ident', name: src.slice(start, i) })
      continue
    }

    if (ch === '(') {
      tokens.push({ kind: 'lparen' })
      i++
      continue
    }
    if (ch === ')') {
      tokens.push({ kind: 'rparen' })
      i++
      continue
    }
    if (ch === ',') {
      tokens.push({ kind: 'comma' })
      i++
      continue
    }
    if (ch === '?') {
      tokens.push({ kind: 'question' })
      i++
      continue
    }
    if (ch === ':') {
      tokens.push({ kind: 'colon' })
      i++
      continue
    }

    const two = i + 1 < n ? src.slice(i, i + 2) : ''
    if (
      two === '**' ||
      two === '==' ||
      two === '!=' ||
      two === '<=' ||
      two === '>=' ||
      two === '&&' ||
      two === '||'
    ) {
      tokens.push({ kind: 'op', op: two })
      i += 2
      continue
    }

    if (
      ch === '+' ||
      ch === '-' ||
      ch === '*' ||
      ch === '/' ||
      ch === '%' ||
      ch === '^' ||
      ch === '<' ||
      ch === '>' ||
      ch === '!'
    ) {
      tokens.push({ kind: 'op', op: ch })
      i++
      continue
    }

    return {
      error: `Unsupported character "${ch}" at position ${i} (property access, $/paths, and strings are not allowed inside calc expr; pass $/paths via vars={ k: $/path }).`,
    }
  }

  tokens.push({ kind: 'eof' })
  return { tokens }
}

function parseTokens(tokens: readonly Token[]): { readonly ast?: ExprNode; readonly error?: string } {
  let pos = 0
  let parseErr: string | undefined
  const peek = (): Token => tokens[pos] ?? { kind: 'eof' }
  const consume = (): Token => tokens[pos++] ?? { kind: 'eof' }

  const fail = (msg: string): null => {
    if (!parseErr) parseErr = msg
    return null
  }

  const matchOp = (...ops: string[]): string | null => {
    const t = peek()
    if (t.kind === 'op' && ops.includes(t.op)) {
      pos++
      return t.op
    }
    return null
  }

  const parseTernary = (depth: number): ExprNode | null => {
    if (depth > MAX_AST_DEPTH) return fail('Formula nesting depth exceeds maximum (36).')
    const cond = parseOr(depth + 1)
    if (!cond) return null
    if (peek().kind === 'question') {
      consume()
      const truthy = parseTernary(depth + 1)
      if (!truthy) return null
      if (peek().kind !== 'colon') return fail('Expected ":" in ternary "? :" expression.')
      consume()
      const falsy = parseTernary(depth + 1)
      if (!falsy) return null
      return { kind: 'ternary', cond, truthy, falsy }
    }
    return cond
  }

  const parseOr = (depth: number): ExprNode | null => {
    let left = parseAnd(depth + 1)
    if (!left) return null
    while (matchOp('||')) {
      const right = parseAnd(depth + 1)
      if (!right) return null
      left = { kind: 'binary', op: '||', left, right }
    }
    return left
  }

  const parseAnd = (depth: number): ExprNode | null => {
    let left = parseEquality(depth + 1)
    if (!left) return null
    while (matchOp('&&')) {
      const right = parseEquality(depth + 1)
      if (!right) return null
      left = { kind: 'binary', op: '&&', left, right }
    }
    return left
  }

  const parseEquality = (depth: number): ExprNode | null => {
    let left = parseRelational(depth + 1)
    if (!left) return null
    let op: string | null
    while ((op = matchOp('==', '!=')) !== null) {
      const right = parseRelational(depth + 1)
      if (!right) return null
      left = { kind: 'binary', op, left, right }
    }
    return left
  }

  const parseRelational = (depth: number): ExprNode | null => {
    let left = parseAdditive(depth + 1)
    if (!left) return null
    let op: string | null
    while ((op = matchOp('<', '<=', '>', '>=')) !== null) {
      const right = parseAdditive(depth + 1)
      if (!right) return null
      left = { kind: 'binary', op, left, right }
    }
    return left
  }

  const parseAdditive = (depth: number): ExprNode | null => {
    let left = parseMultiplicative(depth + 1)
    if (!left) return null
    let op: string | null
    while ((op = matchOp('+', '-')) !== null) {
      const right = parseMultiplicative(depth + 1)
      if (!right) return null
      left = { kind: 'binary', op, left, right }
    }
    return left
  }

  const parseMultiplicative = (depth: number): ExprNode | null => {
    let left = parseUnary(depth + 1)
    if (!left) return null
    let op: string | null
    while ((op = matchOp('*', '/', '%')) !== null) {
      const right = parseUnary(depth + 1)
      if (!right) return null
      left = { kind: 'binary', op, left, right }
    }
    return left
  }

  const parseUnary = (depth: number): ExprNode | null => {
    if (depth > MAX_AST_DEPTH) return fail('Formula nesting depth exceeds maximum (36).')
    const op = matchOp('-', '+', '!')
    if (op !== null) {
      const arg = parseUnary(depth + 1)
      if (!arg) return null
      return { kind: 'unary', op: op as '-' | '+' | '!', arg }
    }
    return parsePower(depth + 1)
  }

  const parsePower = (depth: number): ExprNode | null => {
    if (depth > MAX_AST_DEPTH) return fail('Formula nesting depth exceeds maximum (36).')
    const base = parsePrimary(depth + 1)
    if (!base) return null
    if (matchOp('^', '**') !== null) {
      const exp = parseUnary(depth + 1)
      if (!exp) return null
      return { kind: 'binary', op: '^', left: base, right: exp }
    }
    return base
  }

  const parsePrimary = (depth: number): ExprNode | null => {
    if (depth > MAX_AST_DEPTH) return fail('Formula nesting depth exceeds maximum (36).')
    const t = peek()
    if (t.kind === 'num') {
      consume()
      return { kind: 'num', value: t.value }
    }
    if (t.kind === 'lparen') {
      consume()
      const inner = parseTernary(depth + 1)
      if (!inner) return null
      if (peek().kind !== 'rparen') return fail('Unclosed "(" — missing matching ")".')
      consume()
      return inner
    }
    if (t.kind === 'ident') {
      consume()
      if (peek().kind === 'lparen') {
        consume()
        const args: ExprNode[] = []
        if (peek().kind !== 'rparen') {
          while (true) {
            const arg = parseTernary(depth + 1)
            if (!arg) return null
            args.push(arg)
            if (peek().kind === 'comma') {
              consume()
              continue
            }
            break
          }
        }
        if (peek().kind !== 'rparen') {
          return fail(`Unclosed "(" in call to "${t.name}(...)".`)
        }
        consume()
        return { kind: 'call', fn: t.name, args }
      }
      if (t.name === 'PI') return { kind: 'num', value: Math.PI }
      if (t.name === 'E') return { kind: 'num', value: Math.E }
      if (t.name === 'true') return { kind: 'num', value: 1 }
      if (t.name === 'false') return { kind: 'num', value: 0 }
      return { kind: 'var', name: t.name }
    }
    return fail(`Unexpected token "${t.kind === 'op' ? t.op : t.kind}" in formula.`)
  }

  const root = parseTernary(0)
  if (!root) return { error: parseErr ?? 'Malformed formula syntax.' }
  if (peek().kind !== 'eof') {
    const rem = peek()
    return { error: `Unexpected trailing token "${rem.kind === 'op' ? rem.op : rem.kind}".` }
  }
  return { ast: root }
}

function validateAstSemantics(
  node: ExprNode,
  providedVars?: ReadonlySet<string>,
): string | null {
  switch (node.kind) {
    case 'num':
      return null
    case 'var':
      if (providedVars !== undefined && !providedVars.has(node.name)) {
        return `Unbound variable "${node.name}" — pass it in vars={ ${node.name}: $/... }.`
      }
      return null
    case 'unary':
      return validateAstSemantics(node.arg, providedVars)
    case 'binary':
      return (
        validateAstSemantics(node.left, providedVars) ??
        validateAstSemantics(node.right, providedVars)
      )
    case 'ternary':
      return (
        validateAstSemantics(node.cond, providedVars) ??
        validateAstSemantics(node.truthy, providedVars) ??
        validateAstSemantics(node.falsy, providedVars)
      )
    case 'call': {
      if (!ALLOWED_CALC_FUNCTIONS.has(node.fn)) {
        return `Unknown math function "${node.fn}(...)" in calc(); supported: ${[...ALLOWED_CALC_FUNCTIONS].join(', ')}.`
      }
      for (const arg of node.args) {
        const err = validateAstSemantics(arg, providedVars)
        if (err) return err
      }
      return null
    }
  }
}

/**
 * Compile-time validator for `calc(expr, vars?, decimals?)`.
 * Returns `null` when valid, or an actionable error message when invalid.
 */
export function validateCalcExpression(
  expr: string,
  providedVars?: ReadonlySet<string>,
): string | null {
  const trimmed = expr.trim()
  const tokRes = tokenize(trimmed)
  if (tokRes.error || !tokRes.tokens) return tokRes.error ?? 'Tokenization failed.'
  const parseRes = parseTokens(tokRes.tokens)
  if (parseRes.error || !parseRes.ast) return parseRes.error ?? 'Syntax error.'
  return validateAstSemantics(parseRes.ast, providedVars)
}

function getCompiledAst(expr: string): ExprNode | null {
  if (astCache.has(expr)) return astCache.get(expr) ?? null
  const tokRes = tokenize(expr)
  const parseRes = tokRes.tokens ? parseTokens(tokRes.tokens) : undefined
  const semErr = parseRes?.ast ? validateAstSemantics(parseRes.ast) : 'invalid'
  const ast = semErr === null && parseRes?.ast ? parseRes.ast : null
  if (astCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = astCache.keys().next().value
    if (oldest !== undefined) astCache.delete(oldest)
  }
  astCache.set(expr, ast)
  return ast
}

function coerceVarValue(raw: unknown): number {
  const unwrapped = Array.isArray(raw) && raw.length === 1 ? raw[0] : raw
  if (typeof unwrapped === 'number') return Number.isFinite(unwrapped) ? unwrapped : 0
  if (typeof unwrapped === 'boolean') return unwrapped ? 1 : 0
  if (typeof unwrapped === 'string') {
    const cleaned = unwrapped.replace(/,/g, '').trim()
    if (cleaned === '') return 0
    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function evalBuiltinCall(fn: string, args: readonly number[]): number {
  const a0 = args[0] ?? 0
  const a1 = args[1] ?? 0
  switch (fn) {
    case 'pow':
      return Math.pow(a0, a1)
    case 'sqrt':
      return a0 <= 0 ? 0 : Math.sqrt(a0)
    case 'exp':
      return Math.exp(a0)
    case 'ln':
      return a0 <= 0 ? 0 : Math.log(a0)
    case 'log10':
      return a0 <= 0 ? 0 : Math.log10(a0)
    case 'log': {
      if (a0 <= 0) return 0
      if (args.length >= 2) {
        if (a1 <= 0 || a1 === 1) return 0
        return Math.log(a0) / Math.log(a1)
      }
      return Math.log(a0)
    }
    case 'abs':
      return Math.abs(a0)
    case 'floor':
      return Math.floor(a0)
    case 'ceil':
      return Math.ceil(a0)
    case 'round': {
      const d = args.length >= 2 && Number.isInteger(a1) ? Math.min(8, Math.max(0, a1)) : 0
      const f = 10 ** d
      return Math.round((a0 + Number.EPSILON) * f) / f
    }
    case 'min':
      return args.length === 0 ? 0 : Math.min(...args)
    case 'max':
      return args.length === 0 ? 0 : Math.max(...args)
    case 'clamp': {
      const lo = Math.min(a1, args[2] ?? a1)
      const hi = Math.max(a1, args[2] ?? a1)
      return Math.min(hi, Math.max(lo, a0))
    }
    case 'pmt': {
      const rate = a0
      const nper = a1
      const pv = args[2] ?? 0
      if (nper <= 0) return 0
      if (Math.abs(rate) < 1e-12) return pv / nper
      const factor = Math.pow(1 + rate, nper)
      const denom = factor - 1
      return denom === 0 ? 0 : (pv * rate * factor) / denom
    }
    case 'sin':
      return Math.sin(a0)
    case 'cos':
      return Math.cos(a0)
    case 'tan':
      return Math.tan(a0)
    default:
      return 0
  }
}

function evalAst(node: ExprNode, vars: Record<string, unknown>): number {
  switch (node.kind) {
    case 'num':
      return node.value
    case 'var':
      return coerceVarValue(vars[node.name])
    case 'unary': {
      const v = evalAst(node.arg, vars)
      if (node.op === '-') return -v
      if (node.op === '!') return v === 0 ? 1 : 0
      return v
    }
    case 'ternary':
      return evalAst(node.cond, vars) !== 0
        ? evalAst(node.truthy, vars)
        : evalAst(node.falsy, vars)
    case 'call': {
      const evaluated = node.args.map((arg) => evalAst(arg, vars))
      const res = evalBuiltinCall(node.fn, evaluated)
      return Number.isFinite(res) ? res : 0
    }
    case 'binary': {
      if (node.op === '&&') {
        return evalAst(node.left, vars) !== 0 && evalAst(node.right, vars) !== 0 ? 1 : 0
      }
      if (node.op === '||') {
        return evalAst(node.left, vars) !== 0 || evalAst(node.right, vars) !== 0 ? 1 : 0
      }
      const l = evalAst(node.left, vars)
      const r = evalAst(node.right, vars)
      let out = 0
      switch (node.op) {
        case '+':
          out = l + r
          break
        case '-':
          out = l - r
          break
        case '*':
          out = l * r
          break
        case '/':
          out = r === 0 ? 0 : l / r
          break
        case '%':
          out = r === 0 ? 0 : l % r
          break
        case '^':
          out = Math.pow(l, r)
          break
        case '==':
          out = l === r ? 1 : 0
          break
        case '!=':
          out = l !== r ? 1 : 0
          break
        case '<':
          out = l < r ? 1 : 0
          break
        case '<=':
          out = l <= r ? 1 : 0
          break
        case '>':
          out = l > r ? 1 : 0
          break
        case '>=':
          out = l >= r ? 1 : 0
          break
      }
      return Number.isFinite(out) ? out : 0
    }
  }
}

/**
 * Evaluate an algebraic formula string safely against `vars`, optionally rounding to `decimals`.
 * Returns `0` for malformed expressions, NaN, Infinity, or division by zero.
 */
export function evaluateCalcExpression(
  expr: unknown,
  vars?: unknown,
  decimals?: unknown,
): number {
  if (typeof expr !== 'string' || expr.trim() === '') return 0
  const ast = getCompiledAst(expr.trim())
  if (!ast) return 0
  const env =
    typeof vars === 'object' && vars !== null && !Array.isArray(vars)
      ? (vars as Record<string, unknown>)
      : {}
  const raw = evalAst(ast, env)
  if (!Number.isFinite(raw) || raw === 0) return 0
  if (typeof decimals === 'number' && Number.isInteger(decimals) && decimals >= 0 && decimals <= 8) {
    const factor = 10 ** decimals
    return Math.round((raw + Number.EPSILON) * factor) / factor
  }
  return Number(raw.toPrecision(14))
}
