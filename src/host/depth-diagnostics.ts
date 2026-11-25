export interface DeepFunctionCallSite {
  readonly line: number
  readonly target: string
  readonly depth: number
  readonly chain: readonly string[]
}

const STATEMENT_HEADS = new Set(['surface', 'deleteSurface'])

function isIdent(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_$]/.test(ch)
}

function skipStringOrComment(src: string, idx: number): number {
  const ch = src[idx]
  if (ch === '#' || (ch === '-' && src[idx + 1] === '-') || (ch === '/' && src[idx + 1] === '/')) {
    const nl = src.indexOf('\n', idx + (ch === '#' ? 1 : 2))
    return nl === -1 ? src.length : nl
  }
  if (ch === '/' && src[idx + 1] === '*') {
    const end = src.indexOf('*/', idx + 2)
    return end === -1 ? src.length : end + 2
  }
  if ((ch === 'r' || ch === 'R') && src[idx + 1] === '"' && (idx === 0 || !isIdent(src[idx - 1]))) {
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
      if (src[i] === '"' && src[i + 1] === '"' && src[i + 2] === '"') return i + 3
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

function nextNonWs(src: string, idx: number): string {
  let i = idx
  while (i < src.length) {
    const c = src[i]!
    if (c !== ' ' && c !== '\t' && c !== '\r' && c !== '\n') return c
    i += 1
  }
  return ''
}

function findMatchingParen(src: string, openIdx: number): number {
  let depth = 0
  let i = openIdx
  while (i < src.length) {
    const skipped = skipStringOrComment(src, i)
    if (skipped !== -1) {
      i = skipped
      continue
    }
    const ch = src[i]!
    if (ch === '(') depth += 1
    else if (ch === ')') {
      depth -= 1
      if (depth === 0) return i
    }
    i += 1
  }
  return -1
}

interface DepthInfo {
  readonly depth: number
  readonly chain: readonly string[]
}

const ZERO_DEPTH: DepthInfo = { depth: 0, chain: [] }

function measureExprCallDepth(
  expr: string,
  varDepths: ReadonlyMap<string, DepthInfo>,
  guard = 0,
): DepthInfo {
  if (guard > 64) return ZERO_DEPTH
  let best: DepthInfo = ZERO_DEPTH
  let i = 0
  while (i < expr.length) {
    const skipped = skipStringOrComment(expr, i)
    if (skipped !== -1) {
      i = skipped
      continue
    }
    const ch = expr[i]!
    if (
      /[A-Za-z_]/.test(ch) &&
      (i === 0 || (!isIdent(expr[i - 1]) && expr[i - 1] !== '.' && expr[i - 1] !== '/'))
    ) {
      let j = i + 1
      while (j < expr.length && isIdent(expr[j])) j += 1
      const ident = expr.slice(i, j)
      let k = j
      while (k < expr.length && (expr[k] === ' ' || expr[k] === '\t')) k += 1
      if (expr[k] === '(') {
        const closeIdx = findMatchingParen(expr, k)
        if (closeIdx !== -1) {
          const inner = measureExprCallDepth(expr.slice(k + 1, closeIdx), varDepths, guard + 1)
          const isLowerFn = /^[a-z][A-Za-z0-9_]*$/.test(ident) && !STATEMENT_HEADS.has(ident)
          const cand: DepthInfo = isLowerFn
            ? { depth: inner.depth + 1, chain: [ident, ...inner.chain] }
            : inner
          if (cand.depth > best.depth) best = cand
          i = closeIdx + 1
          continue
        }
      } else {
        const after = nextNonWs(expr, j)
        const isPropOrNamedArg = after === ':' || (after === '=' && expr[j + 1] !== '=')
        if (!isPropOrNamedArg) {
          const ref = varDepths.get(ident)
          if (ref && ref.depth > best.depth) best = ref
        }
      }
      i = j
      continue
    }
    i += 1
  }
  return best
}

function splitStatementsWithLines(
  ui: string,
): Array<{ readonly line: number; readonly text: string }> {
  const out: Array<{ readonly line: number; readonly text: string }> = []
  let depthParen = 0
  let depthBracket = 0
  let depthBrace = 0
  let start = 0
  let startLine = 1
  let curLine = 1
  let i = 0

  const flush = (end: number) => {
    const slice = ui.slice(start, end).trim()
    if (slice !== '') out.push({ line: startLine, text: slice })
  }

  while (i < ui.length) {
    const skipped = skipStringOrComment(ui, i)
    if (skipped !== -1) {
      for (let p = i; p < skipped; p += 1) {
        if (ui[p] === '\n') curLine += 1
      }
      i = skipped
      continue
    }
    const ch = ui[i]!
    if (ch === '(') depthParen += 1
    else if (ch === ')') depthParen = Math.max(0, depthParen - 1)
    else if (ch === '[') depthBracket += 1
    else if (ch === ']') depthBracket = Math.max(0, depthBracket - 1)
    else if (ch === '{') depthBrace += 1
    else if (ch === '}') depthBrace = Math.max(0, depthBrace - 1)
    else if (
      (ch === '\n' || ch === ';') &&
      depthParen === 0 &&
      depthBracket === 0 &&
      depthBrace === 0
    ) {
      flush(i)
      if (ch === '\n') curLine += 1
      start = i + 1
      startLine = curLine
      i += 1
      continue
    }
    if (ch === '\n') curLine += 1
    i += 1
  }
  flush(ui.length)
  return out
}

export function findDeepestFunctionCallSites(
  ui: string,
  threshold = 5,
): readonly DeepFunctionCallSite[] {
  const stmts = splitStatementsWithLines(ui)
  const varDepths = new Map<string, DepthInfo>()
  const culprits: DeepFunctionCallSite[] = []

  for (const stmt of stmts) {
    if (/^(?:surface|deleteSurface)\s*\(/.test(stmt.text)) {
      varDepths.clear()
      continue
    }
    const assignMatch = /^(\$?\/?[A-Za-z_][A-Za-z0-9_/]*)\s*=\s*([\s\S]+)$/.exec(stmt.text)
    const target = assignMatch ? assignMatch[1]! : stmt.text.slice(0, 28)
    const rhs = assignMatch ? assignMatch[2]! : stmt.text
    const info = measureExprCallDepth(rhs, varDepths)
    if (assignMatch && /^[A-Za-z_][A-Za-z0-9_]*$/.test(target)) {
      varDepths.set(target, info)
    }
    if (info.depth > threshold) {
      culprits.push({
        line: stmt.line,
        target,
        depth: info.depth,
        chain: info.chain.slice(0, 8),
      })
    }
  }

  return culprits.sort((a, b) => b.depth - a.depth || a.line - b.line).slice(0, 3)
}
