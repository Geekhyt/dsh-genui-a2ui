/**
 * Quote-safe, deterministic A2UI Express DSL pre-processing passes.
 *
 * Eliminates the two highest-frequency LLM codegen failure modes at compile time
 * while keeping 100% wire compliance with A2UI 1.0 (`MAX_FUNC_CALL_DEPTH = 5`):
 *
 * 1. `desugarExpressConcat`: rewrites natural string concatenation (`formatNumber(x) + " GB"`)
 *    into valid `concat([formatNumber(x), " GB"])` calls without touching string literals or bare math.
 * 2. `foldNestedCondToLookup`: collapses 2+ level `cond(eq(K, "a"), lit1, cond(eq(K, "b"), lit2, fallback))`
 *    chains into a single depth-1 `lookup(K, { "a": lit1, "b": lit2 }, fallback)` call.
 * 3. `flattenChainedCalc`: algebraically inlines chained local `calc()` variables
 *    (`a = calc(...)`, `b = calc("a * 12", { a: a })`) into a single flat `calc()` call,
 *    preventing `Recursion limit exceeded: functionCall depth > 5` on multi-step calculators.
 */

import { ALLOWED_CALC_FUNCTIONS } from './calc-engine.ts'

const CALC_BUILTINS = ALLOWED_CALC_FUNCTIONS

/** Splits `src` on a single-character separator ONLY at bracket depth 0 and outside quotes. */
function splitTopLevel(src: string, sep: string): string[] {
  const parts: string[] = []
  let depthParen = 0
  let depthBracket = 0
  let depthBrace = 0
  let quote: '"' | "'" | null = null
  let start = 0

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!
    if (quote !== null) {
      if (ch === '\\') {
        i += 1
      } else if (ch === quote) {
        quote = null
      }
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === '(') depthParen += 1
    else if (ch === ')') depthParen = Math.max(0, depthParen - 1)
    else if (ch === '[') depthBracket += 1
    else if (ch === ']') depthBracket = Math.max(0, depthBracket - 1)
    else if (ch === '{') depthBrace += 1
    else if (ch === '}') depthBrace = Math.max(0, depthBrace - 1)
    else if (ch === sep && depthParen === 0 && depthBracket === 0 && depthBrace === 0) {
      parts.push(src.slice(start, i))
      start = i + 1
    }
  }
  parts.push(src.slice(start))
  return parts
}

function findTopLevelChar(src: string, target: string): number {
  let depthParen = 0
  let depthBracket = 0
  let depthBrace = 0
  let quote: '"' | "'" | null = null

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!
    if (quote !== null) {
      if (ch === '\\') {
        i += 1
      } else if (ch === quote) {
        quote = null
      }
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === '(') depthParen += 1
    else if (ch === ')') depthParen = Math.max(0, depthParen - 1)
    else if (ch === '[') depthBracket += 1
    else if (ch === ']') depthBracket = Math.max(0, depthBracket - 1)
    else if (ch === '{') depthBrace += 1
    else if (ch === '}') depthBrace = Math.max(0, depthBrace - 1)
    else if (ch === target && depthParen === 0 && depthBracket === 0 && depthBrace === 0) {
      return i
    }
  }
  return -1
}

function findMatchingClose(src: string, openIdx: number, open: string, close: string): number {
  let depth = 1
  let quote: '"' | "'" | null = null
  for (let i = openIdx + 1; i < src.length; i++) {
    const ch = src[i]!
    if (quote !== null) {
      if (ch === '\\') {
        i += 1
      } else if (ch === quote) {
        quote = null
      }
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === open) depth += 1
    else if (ch === close) {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

// ---------------------------------------------------------------------------
// Pass 1: Quote-safe string `+` concatenation -> `concat([...])`
// ---------------------------------------------------------------------------

function isStringLikeConcatTerm(term: string): boolean {
  const t = term.trim()
  return (
    t.startsWith('"') ||
    t.startsWith("'") ||
    /^(?:formatNumber|formatCurrency|formatDate|formatString|concat)\s*\(/.test(t)
  )
}

function rewriteInnerBracketsForConcat(src: string): string {
  let out = ''
  let quote: '"' | "'" | null = null
  let i = 0
  while (i < src.length) {
    const ch = src[i]!
    if (quote !== null) {
      out += ch
      if (ch === '\\' && i + 1 < src.length) {
        out += src[i + 1]!
        i += 2
        continue
      }
      if (ch === quote) quote = null
      i += 1
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      out += ch
      i += 1
      continue
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      const close = ch === '(' ? ')' : ch === '[' ? ']' : '}'
      const closeIdx = findMatchingClose(src, i, ch, close)
      if (closeIdx !== -1) {
        const inner = src.slice(i + 1, closeIdx)
        const transformed = splitTopLevel(inner, ',')
          .map((item) => transformConcatChunk(item, ch === '{' ? ':' : '='))
          .join(',')
        out += `${ch}${transformed}${close}`
        i = closeIdx + 1
        continue
      }
    }
    out += ch
    i += 1
  }
  return out
}

function transformConcatChunk(chunk: string, kvSep: '=' | ':'): string {
  const sepIdx = findTopLevelChar(chunk, kvSep)
  if (sepIdx !== -1) {
    const lhs = chunk.slice(0, sepIdx + 1)
    const rhs = chunk.slice(sepIdx + 1)
    if (kvSep === '=' && (chunk[sepIdx + 1] === '=' || /[!<>]/.test(chunk[sepIdx - 1] ?? ''))) {
      return transformConcatRhs(chunk)
    }
    return `${lhs}${transformConcatRhs(rhs)}`
  }
  return transformConcatRhs(chunk)
}

function transformConcatRhs(rhs: string): string {
  const lead = /^\s*/.exec(rhs)?.[0] ?? ''
  const trail = /\s*$/.exec(rhs)?.[0] ?? ''
  const core = rhs.trim()
  if (core === '') return rhs

  const withInner = rewriteInnerBracketsForConcat(core)
  const terms = splitTopLevel(withInner, '+')
  if (
    terms.length >= 2 &&
    terms.every((t) => t.trim().length > 0) &&
    terms.some((t) => isStringLikeConcatTerm(t))
  ) {
    return `${lead}concat([${terms.map((t) => t.trim()).join(', ')}])${trail}`
  }
  return `${lead}${withInner}${trail}`
}

export function desugarExpressConcat(ui: string): string {
  if (!ui.includes('+')) return ui
  return splitTopLevel(ui, '\n')
    .map((stmt) => transformConcatChunk(stmt, '='))
    .join('\n')
}

// ---------------------------------------------------------------------------
// Pass 2: Nested `cond(eq(K, "a"), lit, cond(eq(K, "b"), lit, def))` -> `lookup(...)`
// ---------------------------------------------------------------------------

function isStaticScalarLiteral(expr: string): boolean {
  const t = expr.trim()
  if (/^-?\d+(?:\.\d+)?$/.test(t)) return true
  if (t === 'true' || t === 'false') return true
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    // Ensure single string literal with no outer operators
    const q = t[0]!
    let i = 1
    while (i < t.length - 1) {
      if (t[i] === '\\') {
        i += 2
        continue
      }
      if (t[i] === q) return false
      i += 1
    }
    return true
  }
  return false
}

function parseEqLiteralCall(expr: string): { keyExpr: string; matchKey: string } | null {
  const t = expr.trim()
  if (!t.startsWith('eq(') || !t.endsWith(')')) return null
  if (findMatchingClose(t, 2, '(', ')') !== t.length - 1) return null
  const args = splitTopLevel(t.slice(3, -1), ',')
  if (args.length !== 2) return null
  const a = args[0]!.trim()
  const b = args[1]!.trim()
  const isStr = (s: string) => s.startsWith('"') && s.endsWith('"') && isStaticScalarLiteral(s)
  if (isStr(b) && !isStr(a)) {
    return { keyExpr: a, matchKey: b }
  }
  if (isStr(a) && !isStr(b)) {
    return { keyExpr: b, matchKey: a }
  }
  return null
}

function tryFoldCondChain(condCall: string): string | null {
  let cur = condCall.trim()
  let sharedKey: string | null = null
  const entries: Array<[string, string]> = []
  const seenKeys = new Set<string>()

  while (cur.startsWith('cond(') && cur.endsWith(')')) {
    if (findMatchingClose(cur, 4, '(', ')') !== cur.length - 1) break
    const args = splitTopLevel(cur.slice(5, -1), ',')
    if (args.length !== 3) break
    const eqInfo = parseEqLiteralCall(args[0]!)
    const truthy = args[1]!.trim()
    const falsy = args[2]!.trim()
    if (!eqInfo || !isStaticScalarLiteral(truthy)) break
    if (sharedKey !== null && sharedKey !== eqInfo.keyExpr) break
    sharedKey = eqInfo.keyExpr
    // Preserve short-circuit `cond` semantics: later branches with the same key are unreachable.
    if (!seenKeys.has(eqInfo.matchKey)) {
      seenKeys.add(eqInfo.matchKey)
      entries.push([eqInfo.matchKey, truthy])
    }
    cur = falsy
  }

  // Only fold chains of >= 2 levels whose final fallback is also a static scalar literal
  if (sharedKey === null || entries.length < 2 || !isStaticScalarLiteral(cur)) {
    return null
  }
  const tableBody = entries.map(([k, v]) => `${k}: ${v}`).join(', ')
  return `lookup(${sharedKey}, { ${tableBody} }, ${cur})`
}

export function foldNestedCondToLookup(ui: string): string {
  if (!ui.includes('cond(')) return ui
  let out = ''
  let quote: '"' | "'" | null = null
  let i = 0
  while (i < ui.length) {
    const ch = ui[i]!
    if (quote !== null) {
      out += ch
      if (ch === '\\' && i + 1 < ui.length) {
        out += ui[i + 1]!
        i += 2
        continue
      }
      if (ch === quote) quote = null
      i += 1
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      out += ch
      i += 1
      continue
    }
    if (ui.startsWith('cond(', i) && (i === 0 || !/[A-Za-z0-9_$]/.test(ui[i - 1]!))) {
      const closeIdx = findMatchingClose(ui, i + 4, '(', ')')
      if (closeIdx !== -1) {
        const call = ui.slice(i, closeIdx + 1)
        const folded = tryFoldCondChain(call)
        if (folded !== null) {
          out += folded
          i = closeIdx + 1
          continue
        }
      }
    }
    out += ch
    i += 1
  }
  return out
}

// ---------------------------------------------------------------------------
// Pass 3: Chained local `calc()` inlining (`a = calc(...)`, `b = calc("a*12", { a })`)
// ---------------------------------------------------------------------------

interface CalcDef {
  readonly expr: string
  readonly vars: Record<string, string>
}

function parseSimpleObjectLiteral(src: string): Record<string, string> | null {
  const t = src.trim()
  if (!t.startsWith('{') || !t.endsWith('}')) return null
  if (findMatchingClose(t, 0, '{', '}') !== t.length - 1) return null
  const body = t.slice(1, -1).trim()
  if (body === '') return {}
  const entries = splitTopLevel(body, ',')
  const out: Record<string, string> = {}
  for (const entry of entries) {
    const colonIdx = findTopLevelChar(entry, ':')
    if (colonIdx === -1) return null
    const rawKey = entry.slice(0, colonIdx).trim()
    const key = rawKey.replace(/^["']|["']$/g, '')
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null
    const val = entry.slice(colonIdx + 1).trim()
    if (val === '') return null
    out[key] = val
  }
  return out
}

function parseCalcCall(
  rhs: string,
  localMaps: ReadonlyMap<string, Record<string, string>>,
): { expr: string; vars: Record<string, string>; decimalsArg: string | null } | null {
  const t = rhs.trim()
  if (!t.startsWith('calc(') || !t.endsWith(')')) return null
  if (findMatchingClose(t, 4, '(', ')') !== t.length - 1) return null
  const args = splitTopLevel(t.slice(5, -1), ',')
  if (args.length < 2 || args.length > 3) return null

  const exprArg = args[0]!.trim()
  if (!exprArg.startsWith('"') || !exprArg.endsWith('"') || !isStaticScalarLiteral(exprArg)) {
    return null
  }
  let expr: string
  try {
    expr = JSON.parse(exprArg) as string
  } catch {
    return null
  }

  let varsArg = args[1]!.trim()
  const varsNamedEq = findTopLevelChar(varsArg, '=')
  if (varsNamedEq !== -1 && varsArg.slice(0, varsNamedEq).trim() === 'vars') {
    varsArg = varsArg.slice(varsNamedEq + 1).trim()
  }
  const vars =
    parseSimpleObjectLiteral(varsArg) ??
    (/^[A-Za-z_][A-Za-z0-9_]*$/.test(varsArg) ? (localMaps.get(varsArg) ?? null) : null)
  if (!vars) return null

  const decimalsArg = args[2] !== undefined ? args[2].trim() : null
  return { expr, vars: { ...vars }, decimalsArg }
}

function countFormulaIdentOccurrences(formula: string, name: string): number {
  const re = new RegExp(`\\b${name}\\b`, 'g')
  let count = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(formula)) !== null) {
    const after = formula.slice(m.index + m[0].length).trimStart()
    if (after.startsWith('(') && CALC_BUILTINS.has(name)) continue
    count += 1
  }
  return count
}

function replaceFormulaIdent(formula: string, oldName: string, replacement: string): string {
  const re = new RegExp(`\\b${oldName}\\b`, 'g')
  return formula.replace(re, (match, offset: number, full: string) => {
    // Never replace function call names (followed by `(`)
    const after = full.slice(offset + match.length).trimStart()
    if (after.startsWith('(') && CALC_BUILTINS.has(oldName)) return match
    return replacement
  })
}

function inlineSingleCalcCall(
  calcSrc: string,
  localMaps: ReadonlyMap<string, Record<string, string>>,
  calcDefs: ReadonlyMap<string, CalcDef>,
  nextAlias: () => number,
): { def: CalcDef; rewritten: string; didInline: boolean } | null {
  const parsed = parseCalcCall(calcSrc, localMaps)
  if (!parsed) return null

  let mergedExpr = parsed.expr
  const mergedVars: Record<string, string> = {}
  let didInline = false

  for (const [k, rawVal] of Object.entries(parsed.vars)) {
    const refCalc = /^[A-Za-z_][A-Za-z0-9_]*$/.test(rawVal) ? calcDefs.get(rawVal) : undefined
    if (!refCalc) {
      mergedVars[k] = rawVal
      continue
    }

    // Guard against runaway expression growth by accounting for every occurrence of `k`
    const occurrences = countFormulaIdentOccurrences(mergedExpr, k)
    const projectedLen =
      mergedExpr.length + occurrences * Math.max(0, refCalc.expr.length + 2 - k.length)
    if (occurrences === 0 || projectedLen > 520) {
      mergedVars[k] = rawVal
      continue
    }

    let inlinedSub = refCalc.expr
    for (const [subKey, subVal] of Object.entries(refCalc.vars)) {
      if (mergedVars[subKey] === subVal || parsed.vars[subKey] === subVal) {
        mergedVars[subKey] = subVal
        continue
      }
      let targetKey = subKey
      while (Object.hasOwn(mergedVars, targetKey) || Object.hasOwn(parsed.vars, targetKey)) {
        targetKey = `_${subKey}_${nextAlias()}`
      }
      if (targetKey !== subKey) {
        inlinedSub = replaceFormulaIdent(inlinedSub, subKey, targetKey)
      }
      mergedVars[targetKey] = subVal
    }

    mergedExpr = replaceFormulaIdent(mergedExpr, k, `(${inlinedSub})`)
    didInline = true
  }

  const varsStr = Object.entries(mergedVars)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ')
  const decSuffix = parsed.decimalsArg !== null ? `, ${parsed.decimalsArg}` : ''
  return {
    def: { expr: mergedExpr, vars: mergedVars },
    rewritten: `calc(${JSON.stringify(mergedExpr)}, { ${varsStr} }${decSuffix})`,
    didInline,
  }
}

function rewriteInlineCalcsInStatement(
  stmt: string,
  localMaps: ReadonlyMap<string, Record<string, string>>,
  calcDefs: ReadonlyMap<string, CalcDef>,
  nextAlias: () => number,
): string {
  if (!stmt.includes('calc(') || calcDefs.size === 0) return stmt
  let out = ''
  let quote: '"' | "'" | null = null
  let i = 0
  while (i < stmt.length) {
    const ch = stmt[i]!
    if (quote !== null) {
      out += ch
      if (ch === '\\' && i + 1 < stmt.length) {
        out += stmt[i + 1]!
        i += 2
        continue
      }
      if (ch === quote) quote = null
      i += 1
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      out += ch
      i += 1
      continue
    }
    if (stmt.startsWith('calc(', i) && (i === 0 || !/[A-Za-z0-9_$]/.test(stmt[i - 1]!))) {
      const closeIdx = findMatchingClose(stmt, i + 4, '(', ')')
      if (closeIdx !== -1) {
        const callSrc = stmt.slice(i, closeIdx + 1)
        const inlined = inlineSingleCalcCall(callSrc, localMaps, calcDefs, nextAlias)
        if (inlined?.didInline) {
          out += inlined.rewritten
          i = closeIdx + 1
          continue
        }
      }
    }
    out += ch
    i += 1
  }
  return out
}

export function flattenChainedCalc(ui: string): string {
  if (!ui.includes('calc(')) return ui
  const stmts = splitTopLevel(ui, '\n')
  const localMaps = new Map<string, Record<string, string>>()
  const calcDefs = new Map<string, CalcDef>()
  let aliasSeq = 0
  const nextAlias = (): number => {
    aliasSeq += 1
    return aliasSeq
  }

  const outStmts = stmts.map((stmt) => {
    const trimmed = stmt.trim()
    const assignMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]+)$/.exec(trimmed)
    if (!assignMatch) {
      return rewriteInlineCalcsInStatement(stmt, localMaps, calcDefs, nextAlias)
    }

    const varName = assignMatch[1]!
    const rhs = assignMatch[2]!.trim()

    // Track local var maps like `v = { w: $/wan, y: $/years, r: $/rate }`
    const objMap = parseSimpleObjectLiteral(rhs)
    if (objMap !== null) {
      localMaps.set(varName, objMap)
      return stmt
    }

    const inlined = inlineSingleCalcCall(rhs, localMaps, calcDefs, nextAlias)
    if (!inlined) {
      return rewriteInlineCalcsInStatement(stmt, localMaps, calcDefs, nextAlias)
    }

    calcDefs.set(varName, inlined.def)
    if (!inlined.didInline) return stmt

    const lead = /^\s*/.exec(stmt)?.[0] ?? ''
    return `${lead}${varName} = ${inlined.rewritten}`
  })

  return outStmts.join('\n')
}

/** Runs all deterministic quote-safe Express pre-processing passes in optimal order. */
export function preprocessExpressProgram(ui: string): string {
  const step1 = desugarExpressConcat(ui)
  const step2 = foldNestedCondToLookup(step1)
  return flattenChainedCalc(step2)
}
