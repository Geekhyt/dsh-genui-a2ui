import { ALLOWED_CALC_FUNCTIONS } from './calc-engine.ts'
import { isDangerousObjectKey } from './constants.ts'

const CALC_BUILTINS = ALLOWED_CALC_FUNCTIONS
const CALC_CONSTANTS = new Set(['PI', 'E'])
const MAX_PREPROCESS_DEPTH = 64

function isIdentChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_$]/.test(ch)
}

function scanStringOrComment(src: string, idx: number): number {
  const ch = src[idx]
  if (ch === '#' || (ch === '-' && src[idx + 1] === '-') || (ch === '/' && src[idx + 1] === '/')) {
    const nl = src.indexOf('\n', idx + (ch === '#' ? 1 : 2))
    return nl === -1 ? src.length : nl
  }
  if (ch === '/' && src[idx + 1] === '*') {
    const end = src.indexOf('*/', idx + 2)
    return end === -1 ? src.length : end + 2
  }
  if (
    (ch === 'r' || ch === 'R') &&
    src[idx + 1] === '"' &&
    (idx === 0 || !isIdentChar(src[idx - 1]))
  ) {
    if (src[idx + 2] === '"' && src[idx + 3] === '"') {
      const end = src.indexOf('"""', idx + 4)
      return end === -1 ? src.length : end + 3
    }
    const end = src.indexOf('"', idx + 2)
    return end === -1 ? src.length : end + 1
  }
  if (ch === '"' && src[idx + 1] === '"' && src[idx + 2] === '"') {
    let i = idx + 3
    while (i < src.length) {
      if (src[i] === '\\') {
        i += 2
        continue
      }
      if (src[i] === '"' && src[i + 1] === '"' && src[i + 2] === '"') {
        return i + 3
      }
      i += 1
    }
    return src.length
  }
  if (ch === '"') {
    let i = idx + 1
    while (i < src.length) {
      if (src[i] === '\\') {
        i += 2
        continue
      }
      if (src[i] === '"') return i + 1
      i += 1
    }
    return src.length
  }
  return -1
}

function buildBracketMap(src: string): Int32Array {
  const map = new Int32Array(src.length)
  map.fill(-1)
  const openIdxStack: number[] = []
  const closeCharStack: string[] = []
  let i = 0
  while (i < src.length) {
    const skipped = scanStringOrComment(src, i)
    if (skipped !== -1) {
      i = skipped
      continue
    }
    const ch = src[i]!
    if (ch === '(' || ch === '[' || ch === '{') {
      openIdxStack.push(i)
      closeCharStack.push(ch === '(' ? ')' : ch === '[' ? ']' : '}')
    } else if (ch === ')' || ch === ']' || ch === '}') {
      for (let k = closeCharStack.length - 1; k >= 0; k--) {
        if (closeCharStack[k] === ch) {
          const openIdx = openIdxStack[k]!
          map[openIdx] = i
          openIdxStack.length = k
          closeCharStack.length = k
          break
        }
      }
    }
    i += 1
  }
  return map
}

function splitTopLevel(src: string, sep: string): string[] {
  const parts: string[] = []
  let depthParen = 0
  let depthBracket = 0
  let depthBrace = 0
  let start = 0
  let i = 0

  while (i < src.length) {
    const skipped = scanStringOrComment(src, i)
    if (skipped !== -1) {
      i = skipped
      continue
    }
    const ch = src[i]!
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
    i += 1
  }
  parts.push(src.slice(start))
  return parts
}

function findTopLevelChar(src: string, target: string): number {
  let depthParen = 0
  let depthBracket = 0
  let depthBrace = 0
  let i = 0

  while (i < src.length) {
    const skipped = scanStringOrComment(src, i)
    if (skipped !== -1) {
      i = skipped
      continue
    }
    const ch = src[i]!
    if (ch === '(') depthParen += 1
    else if (ch === ')') depthParen = Math.max(0, depthParen - 1)
    else if (ch === '[') depthBracket += 1
    else if (ch === ']') depthBracket = Math.max(0, depthBracket - 1)
    else if (ch === '{') depthBrace += 1
    else if (ch === '}') depthBrace = Math.max(0, depthBrace - 1)
    else if (ch === target && depthParen === 0 && depthBracket === 0 && depthBrace === 0) {
      return i
    }
    i += 1
  }
  return -1
}

function splitTrailingLineComment(line: string): { code: string; comment: string } {
  let i = 0
  while (i < line.length) {
    const ch = line[i]
    if (ch === '#' || (ch === '-' && line[i + 1] === '-') || (ch === '/' && line[i + 1] === '/')) {
      const nl = line.indexOf('\n', i)
      if (nl === -1) {
        return { code: line.slice(0, i), comment: line.slice(i) }
      }
      i = nl + 1
      continue
    }
    const skipped = scanStringOrComment(line, i)
    if (skipped !== -1) {
      i = skipped
      continue
    }
    i += 1
  }
  return { code: line, comment: '' }
}

function isStringLikeConcatTerm(term: string): boolean {
  const t = term.trim()
  return (
    t.startsWith('"') ||
    t.startsWith('r"') ||
    t.startsWith('R"') ||
    /^(?:formatNumber|formatCurrency|formatDate|formatString|concat)\s*\(/.test(t)
  )
}

function rewriteInnerBracketsForConcat(src: string, depth: number): string {
  if (depth >= MAX_PREPROCESS_DEPTH) return src
  const brackets = buildBracketMap(src)
  let out = ''
  let i = 0
  while (i < src.length) {
    const skipped = scanStringOrComment(src, i)
    if (skipped !== -1) {
      out += src.slice(i, skipped)
      i = skipped
      continue
    }
    const ch = src[i]!
    if (ch === '(' || ch === '[' || ch === '{') {
      const closeIdx = brackets[i] ?? -1
      if (closeIdx !== -1) {
        const close = src[closeIdx]!
        const inner = src.slice(i + 1, closeIdx)
        const transformed = splitTopLevel(inner, ',')
          .map((item) => transformConcatChunk(item, ch === '{' ? ':' : '=', depth + 1))
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

function transformConcatChunk(chunk: string, kvSep: '=' | ':', depth: number): string {
  if (depth >= MAX_PREPROCESS_DEPTH) return chunk
  const sepIdx = findTopLevelChar(chunk, kvSep)
  if (sepIdx !== -1) {
    const lhs = chunk.slice(0, sepIdx + 1)
    const rhs = chunk.slice(sepIdx + 1)
    if (kvSep === '=' && (chunk[sepIdx + 1] === '=' || /[!<>]/.test(chunk[sepIdx - 1] ?? ''))) {
      return transformConcatRhs(chunk, depth)
    }
    return `${lhs}${transformConcatRhs(rhs, depth)}`
  }
  return transformConcatRhs(chunk, depth)
}

function transformConcatRhs(rhs: string, depth: number): string {
  if (depth >= MAX_PREPROCESS_DEPTH) return rhs
  let leadEnd = 0
  while (leadEnd < rhs.length) {
    if (/\s/.test(rhs[leadEnd]!)) {
      leadEnd += 1
      continue
    }
    const ch = rhs[leadEnd]
    if (
      ch === '#' ||
      (ch === '-' && rhs[leadEnd + 1] === '-') ||
      (ch === '/' && (rhs[leadEnd + 1] === '/' || rhs[leadEnd + 1] === '*'))
    ) {
      const skipped = scanStringOrComment(rhs, leadEnd)
      if (skipped !== -1) {
        leadEnd = skipped
        continue
      }
    }
    break
  }
  const lead = rhs.slice(0, leadEnd)
  const rest = rhs.slice(leadEnd)
  const trail = /\s*$/.exec(rest)?.[0] ?? ''
  const core = rest.slice(0, rest.length - trail.length)
  if (core === '') return rhs

  const withInner = rewriteInnerBracketsForConcat(core, depth)
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
    .map((stmt) => {
      const { code, comment } = splitTrailingLineComment(stmt)
      if (!code.includes('+')) return stmt
      return `${transformConcatChunk(code, '=', 0)}${comment}`
    })
    .join('\n')
}

function isStaticScalarLiteral(expr: string): boolean {
  const t = expr.trim()
  if (/^-?\d+(?:\.\d+)?$/.test(t)) return true
  if (t === 'true' || t === 'false') return true
  if (t.startsWith('"') && t.endsWith('"')) {
    const end = scanStringOrComment(t, 0)
    return end === t.length
  }
  return false
}

function isNonCanonicalNumericString(str: string): boolean {
  const trimmed = str.trim()
  if (trimmed === '') return false
  if (!/^[+-]?(?:\d[\d,]*\.?\d*|\.\d+)$/.test(trimmed)) return false
  const cleaned = trimmed.replace(/,/g, '')
  const num = Number(cleaned)
  if (!Number.isFinite(num)) return false
  return String(num) !== str
}

function parseJsonStringLiteral(literal: string): string | null {
  if (!literal.startsWith('"') || !literal.endsWith('"') || !isStaticScalarLiteral(literal)) {
    return null
  }
  try {
    const parsed = JSON.parse(literal)
    return typeof parsed === 'string' ? parsed : null
  } catch {
    return null
  }
}

function parseEqLiteralCall(expr: string): { keyExpr: string; matchKey: string } | null {
  const t = expr.trim()
  if (!t.startsWith('eq(') || !t.endsWith(')')) return null
  const brackets = buildBracketMap(t)
  if (brackets[2] !== t.length - 1) return null
  const args = splitTopLevel(t.slice(3, -1), ',')
  if (args.length !== 2) return null
  const a = args[0]!.trim()
  const b = args[1]!.trim()
  const aStr = parseJsonStringLiteral(a)
  const bStr = parseJsonStringLiteral(b)
  if (
    bStr !== null &&
    aStr === null &&
    !isDangerousObjectKey(bStr) &&
    !bStr.startsWith('@') &&
    !isNonCanonicalNumericString(bStr)
  ) {
    return { keyExpr: a, matchKey: b }
  }
  if (
    aStr !== null &&
    bStr === null &&
    !isDangerousObjectKey(aStr) &&
    !aStr.startsWith('@') &&
    !isNonCanonicalNumericString(aStr)
  ) {
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
    const brackets = buildBracketMap(cur)
    if (brackets[4] !== cur.length - 1) break
    const args = splitTopLevel(cur.slice(5, -1), ',')
    if (args.length !== 3) break
    const eqInfo = parseEqLiteralCall(args[0]!)
    const truthy = args[1]!.trim()
    const falsy = args[2]!.trim()
    if (!eqInfo || !isStaticScalarLiteral(truthy)) break
    if (sharedKey !== null && sharedKey !== eqInfo.keyExpr) break
    sharedKey = eqInfo.keyExpr
    if (!seenKeys.has(eqInfo.matchKey)) {
      seenKeys.add(eqInfo.matchKey)
      entries.push([eqInfo.matchKey, truthy])
    }
    cur = falsy
  }

  if (sharedKey === null || entries.length < 2 || !isStaticScalarLiteral(cur)) {
    return null
  }
  const tableBody = entries.map(([k, v]) => `${k}: ${v}`).join(', ')
  return `lookup(${sharedKey}, { ${tableBody} }, ${cur})`
}

export function foldNestedCondToLookup(ui: string): string {
  if (!ui.includes('cond(')) return ui
  const brackets = buildBracketMap(ui)
  let out = ''
  let i = 0
  while (i < ui.length) {
    const skipped = scanStringOrComment(ui, i)
    if (skipped !== -1) {
      out += ui.slice(i, skipped)
      i = skipped
      continue
    }
    if (ui.startsWith('cond(', i) && (i === 0 || !isIdentChar(ui[i - 1]))) {
      let argStart = i + 5
      while (argStart < ui.length && /\s/.test(ui[argStart]!)) argStart += 1
      if (ui.startsWith('eq(', argStart)) {
        const closeIdx = brackets[i + 4] ?? -1
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
    }
    out += ui[i]!
    i += 1
  }
  return out
}

interface CalcDef {
  readonly expr: string
  readonly vars: Record<string, string>
  readonly decimals: number | null
  readonly hasDynamicDecimals: boolean
}

function parseDecimalsLiteral(arg: string | null): {
  readonly value: number | null
  readonly dynamic: boolean
} {
  if (arg === null) return { value: null, dynamic: false }
  let raw = arg.trim()
  const eqIdx = findTopLevelChar(raw, '=')
  if (eqIdx !== -1 && raw.slice(0, eqIdx).trim() === 'decimals') {
    raw = raw.slice(eqIdx + 1).trim()
  }
  if (/^[0-8]$/.test(raw)) {
    return { value: Number(raw), dynamic: false }
  }
  return { value: null, dynamic: true }
}

function parseSimpleObjectLiteral(src: string): Record<string, string> | null {
  const t = src.trim()
  if (!t.startsWith('{') || !t.endsWith('}')) return null
  const brackets = buildBracketMap(t)
  if (brackets[0] !== t.length - 1) return null
  const body = t.slice(1, -1).trim()
  const out = Object.create(null) as Record<string, string>
  if (body === '') return out
  const entries = splitTopLevel(body, ',').filter((e) => e.trim() !== '')
  for (const entry of entries) {
    const colonIdx = findTopLevelChar(entry, ':')
    if (colonIdx === -1) return null
    const rawKey = entry.slice(0, colonIdx).trim()
    const key = rawKey.replace(/^["']|["']$/g, '')
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || isDangerousObjectKey(key)) return null
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
  const brackets = buildBracketMap(t)
  if (brackets[4] !== t.length - 1) return null
  const args = splitTopLevel(t.slice(5, -1), ',').filter((a) => a.trim() !== '')
  if (args.length < 1 || args.length > 3) return null

  let exprRaw: string | null = null
  let varsRaw: string | null = null
  let decimalsArg: string | null = null
  const positional: string[] = []

  for (const rawArg of args) {
    const trimmed = rawArg.trim()
    const eqIdx = findTopLevelChar(trimmed, '=')
    if (eqIdx !== -1 && trimmed[eqIdx + 1] !== '=' && !/[!<>]/.test(trimmed[eqIdx - 1] ?? '')) {
      const name = trimmed.slice(0, eqIdx).trim()
      const val = trimmed.slice(eqIdx + 1).trim()
      if (name === 'expr') {
        if (exprRaw !== null) return null
        exprRaw = val
        continue
      }
      if (name === 'vars') {
        if (varsRaw !== null) return null
        varsRaw = val
        continue
      }
      if (name === 'decimals') {
        if (decimalsArg !== null) return null
        decimalsArg = trimmed
        continue
      }
      return null
    }
    positional.push(trimmed)
  }

  let posIdx = 0
  if (exprRaw === null && posIdx < positional.length) {
    exprRaw = positional[posIdx++]!
  }
  if (varsRaw === null && posIdx < positional.length) {
    varsRaw = positional[posIdx++]!
  }
  if (decimalsArg === null && posIdx < positional.length) {
    decimalsArg = positional[posIdx++]!
  }
  if (posIdx < positional.length || exprRaw === null) return null

  const expr = parseJsonStringLiteral(exprRaw)
  if (expr === null) return null

  if (varsRaw === null) {
    return { expr, vars: Object.create(null) as Record<string, string>, decimalsArg }
  }

  const vars =
    parseSimpleObjectLiteral(varsRaw) ??
    (/^[A-Za-z_][A-Za-z0-9_]*$/.test(varsRaw) ? (localMaps.get(varsRaw) ?? null) : null)
  if (!vars) return null

  const varsCopy = Object.create(null) as Record<string, string>
  for (const [k, v] of Object.entries(vars)) {
    if (!isDangerousObjectKey(k)) varsCopy[k] = v
  }
  return { expr, vars: varsCopy, decimalsArg }
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

function replaceFormulaIdents(formula: string, replacements: ReadonlyMap<string, string>): string {
  if (replacements.size === 0) return formula
  return formula.replace(/\b[A-Za-z_][A-Za-z0-9_]*\b/g, (match, offset: number, full: string) => {
    const next = replacements.get(match)
    if (next === undefined) return match
    const after = full.slice(offset + match.length).trimStart()
    if (after.startsWith('(') && CALC_BUILTINS.has(match)) return match
    return next
  })
}

function usesUnboundBuiltinConstant(formula: string, vars: Record<string, string>): string[] {
  const used: string[] = []
  for (const c of CALC_CONSTANTS) {
    if (!Object.hasOwn(vars, c) && countFormulaIdentOccurrences(formula, c) > 0) {
      used.push(c)
    }
  }
  return used
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
  const mergedVars = Object.create(null) as Record<string, string>
  let didInline = false
  const outerBuiltins = new Set<string>(usesUnboundBuiltinConstant(parsed.expr, parsed.vars))

  for (const [k, rawVal] of Object.entries(parsed.vars)) {
    let refCalc = /^[A-Za-z_][A-Za-z0-9_]*$/.test(rawVal) ? calcDefs.get(rawVal) : undefined
    if (!refCalc && rawVal.startsWith('calc(')) {
      const nested = inlineSingleCalcCall(rawVal, localMaps, calcDefs, nextAlias)
      if (nested) refCalc = nested.def
    }
    if (!refCalc || refCalc.hasDynamicDecimals) {
      mergedVars[k] = rawVal
      continue
    }

    const refConstants = usesUnboundBuiltinConstant(refCalc.expr, refCalc.vars)
    if (refConstants.some((c) => Object.hasOwn(parsed.vars, c) || Object.hasOwn(mergedVars, c))) {
      mergedVars[k] = rawVal
      continue
    }

    const occurrences = countFormulaIdentOccurrences(mergedExpr, k)
    const extraRoundingLen = refCalc.decimals !== null ? 10 : 0
    const projectedLen =
      mergedExpr.length +
      occurrences * Math.max(0, refCalc.expr.length + 2 + extraRoundingLen - k.length)
    if (occurrences === 0 || projectedLen > 520) {
      mergedVars[k] = rawVal
      continue
    }

    const renameMap = new Map<string, string>()
    const reserved = new Set<string>([
      ...Object.keys(mergedVars),
      ...Object.keys(parsed.vars),
      ...Object.keys(refCalc.vars),
      ...outerBuiltins,
    ])
    const pendingEntries: Array<[string, string]> = []

    for (const [subKey, subVal] of Object.entries(refCalc.vars)) {
      const sameMerged = Object.hasOwn(mergedVars, subKey) && mergedVars[subKey] === subVal
      const sameOuter = Object.hasOwn(parsed.vars, subKey) && parsed.vars[subKey] === subVal
      if (!outerBuiltins.has(subKey) && (sameMerged || sameOuter)) {
        pendingEntries.push([subKey, subVal])
        continue
      }
      let targetKey = subKey
      if (
        outerBuiltins.has(targetKey) ||
        Object.hasOwn(mergedVars, targetKey) ||
        Object.hasOwn(parsed.vars, targetKey)
      ) {
        do {
          targetKey = `_${subKey}_${nextAlias()}`
        } while (reserved.has(targetKey) || CALC_CONSTANTS.has(targetKey))
        reserved.add(targetKey)
        renameMap.set(subKey, targetKey)
      }
      pendingEntries.push([targetKey, subVal])
    }

    for (const [targetKey, subVal] of pendingEntries) {
      mergedVars[targetKey] = subVal
    }
    for (const c of refConstants) {
      outerBuiltins.add(c)
    }

    const renamedSub = replaceFormulaIdents(refCalc.expr, renameMap)
    const wrappedSub =
      refCalc.decimals !== null ? `round(${renamedSub}, ${refCalc.decimals})` : `(${renamedSub})`
    mergedExpr = replaceFormulaIdents(mergedExpr, new Map([[k, wrappedSub]]))
    didInline = true
  }

  const varsStr = Object.entries(mergedVars)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ')
  const decSuffix = parsed.decimalsArg !== null ? `, ${parsed.decimalsArg}` : ''
  const decMeta = parseDecimalsLiteral(parsed.decimalsArg)
  return {
    def: {
      expr: mergedExpr,
      vars: mergedVars,
      decimals: decMeta.value,
      hasDynamicDecimals: decMeta.dynamic,
    },
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
  if (!stmt.includes('calc(')) return stmt
  const brackets = buildBracketMap(stmt)
  let out = ''
  let i = 0
  while (i < stmt.length) {
    const skipped = scanStringOrComment(stmt, i)
    if (skipped !== -1) {
      out += stmt.slice(i, skipped)
      i = skipped
      continue
    }
    if (stmt.startsWith('calc(', i) && (i === 0 || !isIdentChar(stmt[i - 1]))) {
      const closeIdx = brackets[i + 4] ?? -1
      if (closeIdx !== -1) {
        const innerArgs = rewriteInlineCalcsInStatement(
          stmt.slice(i + 5, closeIdx),
          localMaps,
          calcDefs,
          nextAlias,
        )
        const callSrc = `calc(${innerArgs})`
        const inlined = inlineSingleCalcCall(callSrc, localMaps, calcDefs, nextAlias)
        if (inlined?.didInline) {
          out += inlined.rewritten
          i = closeIdx + 1
          continue
        }
        out += callSrc
        i = closeIdx + 1
        continue
      }
    }
    out += stmt[i]!
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
    const { code, comment } = splitTrailingLineComment(stmt)
    const trimmed = code.trim()
    const assignMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]+)$/.exec(trimmed)
    if (!assignMatch) {
      return `${rewriteInlineCalcsInStatement(code, localMaps, calcDefs, nextAlias)}${comment}`
    }

    const varName = assignMatch[1]!
    const rhs = assignMatch[2]!.trim()

    const objMap = parseSimpleObjectLiteral(rhs)
    if (objMap !== null) {
      calcDefs.delete(varName)
      const rewrittenCode = rewriteInlineCalcsInStatement(code, localMaps, calcDefs, nextAlias)
      const rewrittenMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]+)$/.exec(rewrittenCode.trim())
      const nextObjMap =
        rewrittenMatch !== null ? (parseSimpleObjectLiteral(rewrittenMatch[2]!) ?? objMap) : objMap
      localMaps.set(varName, nextObjMap)
      return `${rewrittenCode}${comment}`
    }

    const inlined = inlineSingleCalcCall(rhs, localMaps, calcDefs, nextAlias)
    if (!inlined) {
      const rewritten = rewriteInlineCalcsInStatement(code, localMaps, calcDefs, nextAlias)
      calcDefs.delete(varName)
      localMaps.delete(varName)
      return `${rewritten}${comment}`
    }

    localMaps.delete(varName)
    calcDefs.set(varName, inlined.def)
    if (!inlined.didInline) return stmt

    const lead = /^\s*/.exec(code)?.[0] ?? ''
    const trailSpace = /\s*$/.exec(code)?.[0] ?? ''
    return `${lead}${varName} = ${inlined.rewritten}${comment ? `${trailSpace}${comment}` : ''}`
  })

  return outStmts.join('\n')
}

function rewriteDateRangeCallArgs(inner: string): string {
  const args = splitTopLevel(inner, ',')
  let startExpr: string | null = null
  let endExpr: string | null = null
  const positional: string[] = []

  for (const arg of args) {
    const trimmed = arg.trim()
    if (trimmed === '' || trimmed.startsWith('?')) continue
    const eqIdx = findTopLevelChar(trimmed, '=')
    if (eqIdx !== -1 && trimmed[eqIdx + 1] !== '=' && !/[!<>]/.test(trimmed[eqIdx - 1] ?? '')) {
      const key = trimmed.slice(0, eqIdx).trim()
      const val = trimmed.slice(eqIdx + 1).trim()
      if (key === 'start') startExpr = val
      else if (key === 'end') endExpr = val
    } else {
      positional.push(trimmed)
    }
  }
  if (startExpr === null && positional.length >= 2) startExpr = positional[1]!
  if (endExpr === null && positional.length >= 3) endExpr = positional[2]!
  if (!startExpr || !endExpr) return inner

  let changed = false
  const nextArgs = args.map((arg) => {
    const { code: argCode, comment: argComment } = splitTrailingLineComment(arg)
    const lead = /^\s*/.exec(argCode)?.[0] ?? ''
    const trail = /\s*$/.exec(argCode)?.[0] ?? ''
    const trimmed = argCode.trim()
    if (!trimmed.startsWith('?')) return arg
    const afterQ = trimmed.slice(1).trimStart()
    if (afterQ === 'required') {
      changed = true
      return `${lead}?and([required(${startExpr}), required(${endExpr})])${trail}${argComment}`
    }
    if (!afterQ.startsWith('required(') || !afterQ.endsWith(')')) return arg
    const bMap = buildBracketMap(afterQ)
    if (bMap[8] !== afterQ.length - 1) return arg
    const reqArgs = splitTopLevel(afterQ.slice(9, -1), ',').filter((a) => a.trim() !== '')
    if (reqArgs.length === 0) {
      changed = true
      return `${lead}?and([required(${startExpr}), required(${endExpr})])${trail}${argComment}`
    }
    if (reqArgs.length === 1 && parseJsonStringLiteral(reqArgs[0]!.trim()) !== null) {
      changed = true
      return `${lead}?and([required(${startExpr}), required(${endExpr})], ${reqArgs[0]!.trim()})${trail}${argComment}`
    }
    return arg
  })
  return changed ? nextArgs.join(',') : inner
}

export function expandDateRangeShorthandChecks(ui: string): string {
  if (!ui.includes('DateRange(') || !ui.includes('?')) return ui
  const brackets = buildBracketMap(ui)
  let out = ''
  let i = 0
  while (i < ui.length) {
    const skipped = scanStringOrComment(ui, i)
    if (skipped !== -1) {
      out += ui.slice(i, skipped)
      i = skipped
      continue
    }
    if (ui.startsWith('DateRange(', i) && (i === 0 || !isIdentChar(ui[i - 1]))) {
      const closeIdx = brackets[i + 9] ?? -1
      if (closeIdx !== -1) {
        const inner = ui.slice(i + 10, closeIdx)
        out += `DateRange(${rewriteDateRangeCallArgs(inner)})`
        i = closeIdx + 1
        continue
      }
    }
    out += ui[i]!
    i += 1
  }
  return out
}

export function extractUpdateSurfaceIds(cleanedUi: string): string[] {
  if (!cleanedUi.includes('surface(')) return []
  const brackets = buildBracketMap(cleanedUi)
  const ids: string[] = []
  const seenUpdate = new Set<string>()
  const createdIds = new Set<string>()
  let i = 0
  while (i < cleanedUi.length) {
    const skipped = scanStringOrComment(cleanedUi, i)
    if (skipped !== -1) {
      i = skipped
      continue
    }
    if (cleanedUi.startsWith('surface(', i) && (i === 0 || !isIdentChar(cleanedUi[i - 1]))) {
      const closeIdx = brackets[i + 7] ?? -1
      if (closeIdx !== -1) {
        const args = splitTopLevel(cleanedUi.slice(i + 8, closeIdx), ',')
        let surfaceId: string | null = null
        let isUpdate = false
        for (let idx = 0; idx < args.length; idx++) {
          const arg = args[idx]!.trim()
          const eqIdx = findTopLevelChar(arg, '=')
          if (eqIdx !== -1) {
            const k = arg.slice(0, eqIdx).trim()
            const v = arg.slice(eqIdx + 1).trim()
            if (k === 'id' || k === 'surfaceId') {
              surfaceId = parseJsonStringLiteral(v)
            } else if (k === 'update' && v === 'true') {
              isUpdate = true
            }
          } else if (idx === 0) {
            surfaceId = parseJsonStringLiteral(arg)
          }
        }
        if (surfaceId !== null && surfaceId !== '') {
          if (isUpdate) {
            if (!createdIds.has(surfaceId) && !seenUpdate.has(surfaceId)) {
              seenUpdate.add(surfaceId)
              ids.push(surfaceId)
            }
          } else {
            createdIds.add(surfaceId)
          }
        }
        i = closeIdx + 1
        continue
      }
    }
    i += 1
  }
  return ids
}

export function preprocessExpressProgram(ui: string): string {
  const step0 = expandDateRangeShorthandChecks(ui)
  const step1 = desugarExpressConcat(step0)
  const step2 = foldNestedCondToLookup(step1)
  return flattenChainedCalc(step2)
}
