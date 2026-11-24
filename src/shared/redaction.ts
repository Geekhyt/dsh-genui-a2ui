import { isSecretKey } from './constants.ts'

export function escapeJsonPointerSegment(key: string): string {
  return key.replace(/~/g, '~0').replace(/\//g, '~1')
}

export function normalizePointerPath(pointer: string): string {
  const trimmed = pointer.trim()
  if (trimmed === '' || trimmed === '/') return '/'
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  let end = withSlash.length
  while (end > 1 && withSlash[end - 1] === '/') {
    end -= 1
  }
  return end === withSlash.length ? withSlash : withSlash.slice(0, end)
}

function matchesWildcardPointer(norm: string, obs: string, matchParent: boolean): boolean {
  const normSegs = norm.slice(1).split('/')
  const obsSegs = obs.slice(1).split('/')
  if (normSegs.length >= obsSegs.length) {
    let ok = true
    for (let i = 0; i < obsSegs.length; i++) {
      if (obsSegs[i] !== '*' && obsSegs[i] !== normSegs[i]) {
        ok = false
        break
      }
    }
    if (ok) return true
  }
  if (matchParent && normSegs.length < obsSegs.length) {
    for (let i = 0; i < normSegs.length; i++) {
      if (obsSegs[i] !== '*' && obsSegs[i] !== normSegs[i]) return false
    }
    return true
  }
  return false
}

export function isPointerObscured(
  pointer: string,
  obscuredPointers: ReadonlySet<string>,
  matchParent = false,
): boolean {
  if (obscuredPointers.size === 0) return false
  const norm = normalizePointerPath(pointer)
  if (matchParent && norm === '/') return true
  for (const rawObs of obscuredPointers) {
    const trimmed = rawObs.trim()
    if (trimmed === '') continue
    const isRelative = !trimmed.startsWith('/')
    const obs = normalizePointerPath(trimmed)
    if (obs === '/') return true
    if (obs.includes('/*') && matchesWildcardPointer(norm, obs, matchParent)) return true
    if (norm === obs || norm.startsWith(`${obs}/`)) return true
    if (matchParent && obs.startsWith(`${norm}/`)) return true
    if (isRelative && (norm.endsWith(obs) || norm.includes(`${obs}/`))) return true
  }
  return false
}

export function isPointerObscuredOrParent(
  pointer: string,
  obscuredPointers: ReadonlySet<string>,
): boolean {
  return isPointerObscured(pointer, obscuredPointers, true)
}

export function extractBindingPointer(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const rec = raw as { path?: unknown; '@path'?: unknown }
  const p = rec.path ?? rec['@path']
  return typeof p === 'string' && p.trim() !== '' ? p.trim() : null
}

export function extractRawBindingPointer(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const rec = raw as { path?: unknown; '@path'?: unknown }
  const p = rec.path ?? rec['@path']
  return typeof p === 'string' ? p.trim() : null
}

const INTERP_TOKEN_RE = /(?:\$\/[^\s,():"'{}[\]]+|\/[^\s,():"'{}[\]]+|[^\s,():"'{}[\]]+)/gu

function scanExpressionPointers(expr: string, out: string[], depth: number): boolean {
  if (depth > 8) {
    out.push('/')
    return false
  }
  const trimmed = expr.trim()
  if (trimmed === '') return true
  if (trimmed.includes('${')) {
    const nested = extractInterpolatedPointers(trimmed, depth + 1)
    for (const p of nested) out.push(p)
  }
  let i = 0
  while (i < trimmed.length) {
    const ch = trimmed[i]!
    if (ch === '"' || ch === "'") {
      const quote = ch
      let j = i + 1
      let strVal = ''
      while (j < trimmed.length) {
        if (trimmed[j] === '\\' && j + 1 < trimmed.length) {
          strVal += trimmed[j + 1]!
          j += 2
          continue
        }
        if (trimmed[j] === quote) break
        strVal += trimmed[j]!
        j += 1
      }
      if (j >= trimmed.length) {
        out.push('/')
        return false
      }
      if (strVal.includes('${')) {
        for (const p of extractInterpolatedPointers(strVal, depth + 1)) out.push(p)
      }
      i = j + 1
      continue
    }
    if (ch === '$' && trimmed[i + 1] === '{') {
      i += 2
      continue
    }
    if (/\s/.test(ch) || ch === ',' || ch === '(' || ch === ')' || ch === ':' || ch === '}') {
      i += 1
      continue
    }
    INTERP_TOKEN_RE.lastIndex = i
    const m = INTERP_TOKEN_RE.exec(trimmed)
    if (!m || m.index !== i) {
      i += 1
      continue
    }
    const token = m[0]!
    const nextNonWsIdx = (() => {
      let k = i + token.length
      while (k < trimmed.length && /\s/.test(trimmed[k]!)) k += 1
      return k
    })()
    const nextCh = trimmed[nextNonWsIdx]
    i += token.length
    if (nextCh === '(' || nextCh === ':') {
      continue
    }
    if (
      token === 'true' ||
      token === 'false' ||
      token === 'null' ||
      /^[+-]?\d+(?:\.\d+)?$/.test(token)
    ) {
      continue
    }
    if (token.startsWith('$/')) {
      out.push(token.slice(1))
    } else if (token.startsWith('/')) {
      out.push(token)
    } else {
      out.push(token)
      if (token.includes('.')) {
        out.push(token.replace(/\./g, '/'))
      }
    }
  }
  return true
}

export function extractInterpolatedPointers(text: string, depth = 0): readonly string[] {
  if (!text.includes('${')) return []
  if (depth > 8) return ['/']
  const out: string[] = []
  let i = 0
  while (i < text.length) {
    const start = text.indexOf('${', i)
    if (start === -1) break
    let j = start + 2
    let braceDepth = 1
    let inQuote: string | null = null
    while (j < text.length && braceDepth > 0) {
      const ch = text[j]!
      if (inQuote !== null) {
        if (ch === '\\' && j + 1 < text.length) {
          j += 2
          continue
        }
        if (ch === inQuote) inQuote = null
        j += 1
        continue
      }
      if (ch === '"' || ch === "'") {
        inQuote = ch
        j += 1
        continue
      }
      if (ch === '{') braceDepth += 1
      else if (ch === '}') braceDepth -= 1
      j += 1
    }
    if (braceDepth !== 0) {
      out.push('/')
      break
    }
    const inner = text.slice(start + 2, j - 1)
    scanExpressionPointers(inner, out, depth + 1)
    i = j
  }
  return out
}

function collectChildComponentIds(comp: Record<string, unknown>, outIds: string[]): void {
  const pushStr = (v: unknown) => {
    if (typeof v === 'string' && v !== '') outIds.push(v)
  }
  pushStr(comp.child)
  pushStr(comp.trigger)
  pushStr(comp.content)
  if (Array.isArray(comp.children)) {
    for (const c of comp.children) pushStr(c)
  }
  if (Array.isArray(comp.tabs)) {
    for (const tab of comp.tabs) {
      if (typeof tab === 'object' && tab !== null) {
        pushStr((tab as Record<string, unknown>).child)
      }
    }
  }
  if (Array.isArray(comp.items)) {
    for (const item of comp.items) {
      if (typeof item === 'object' && item !== null) {
        pushStr((item as Record<string, unknown>).child)
      }
    }
  }
}

function composeTemplatePath(outerTplPath: string, rawInnerPath: string): string {
  const trimmed = rawInnerPath.trim()
  if (trimmed === '' || trimmed === '/') return outerTplPath
  if (trimmed.startsWith('/')) return normalizePointerPath(trimmed)
  let start = 0
  while (start < trimmed.length && trimmed[start] === '/') start += 1
  const cleanRel = trimmed.slice(start)
  return cleanRel === '' ? outerTplPath : `${outerTplPath}/*/${cleanRel}`
}

export function buildTemplatePathMap(
  components: readonly Record<string, unknown>[],
): Map<string, Set<string>> {
  const byId = new Map<string, Record<string, unknown>>()
  for (const comp of components) {
    if (typeof comp.id === 'string' && comp.id !== '') {
      byId.set(comp.id, comp)
    }
  }
  const templatePathByCompId = new Map<string, Set<string>>()
  const queue: Array<{ readonly id: string; readonly tplPath: string }> = []

  const enqueue = (id: string, tplPath: string) => {
    let paths = templatePathByCompId.get(id)
    if (!paths) {
      paths = new Set<string>()
      templatePathByCompId.set(id, paths)
    }
    if (paths.has(tplPath)) return
    if (paths.size >= 8) return
    paths.add(tplPath)
    queue.push({ id, tplPath })
  }

  for (const comp of components) {
    const children = comp.children
    if (typeof children === 'object' && children !== null && !Array.isArray(children)) {
      const rec = children as Record<string, unknown>
      const tplPath = typeof rec.path === 'string' ? rec.path.trim() : ''
      const tplCompId = typeof rec.componentId === 'string' ? rec.componentId.trim() : ''
      if (tplPath !== '' && tplCompId !== '') {
        enqueue(tplCompId, normalizePointerPath(tplPath))
      }
    }
  }

  while (queue.length > 0) {
    const { id, tplPath } = queue.shift()!
    const comp = byId.get(id)
    if (!comp) continue
    const childIds: string[] = []
    collectChildComponentIds(comp, childIds)
    for (const cid of childIds) {
      enqueue(cid, tplPath)
    }
    const children = comp.children
    if (typeof children === 'object' && children !== null && !Array.isArray(children)) {
      const rec = children as Record<string, unknown>
      const innerPath = typeof rec.path === 'string' ? rec.path.trim() : ''
      const innerCompId = typeof rec.componentId === 'string' ? rec.componentId.trim() : ''
      if (innerPath !== '' && innerCompId !== '') {
        enqueue(innerCompId, composeTemplatePath(tplPath, innerPath))
      }
    }
  }

  return templatePathByCompId
}

export function resolveTemplateObscuredPointers(
  components: readonly Record<string, unknown>[],
  outObscured: Set<string>,
): void {
  const templatePathByCompId = buildTemplatePathMap(components)

  for (const comp of components) {
    if (comp.component !== 'TextField' || comp.variant !== 'obscured') continue
    const rawPtr = extractRawBindingPointer(comp.value)
    if (rawPtr === null) continue
    if (rawPtr.startsWith('/')) {
      outObscured.add(normalizePointerPath(rawPtr))
      continue
    }
    const id = typeof comp.id === 'string' ? comp.id : ''
    const tplPaths = id !== '' ? templatePathByCompId.get(id) : undefined
    if (tplPaths && tplPaths.size > 0) {
      for (const tp of tplPaths) {
        outObscured.add(composeTemplatePath(tp, rawPtr))
      }
    } else {
      outObscured.add(rawPtr === '' ? '/' : normalizePointerPath(rawPtr))
    }
  }
}

export function isBindingExpression(node: unknown): boolean {
  if (typeof node === 'string') return node.includes('${')
  if (typeof node !== 'object' || node === null || Array.isArray(node)) return false
  const rec = node as Record<string, unknown>
  return (
    typeof rec.path === 'string' ||
    typeof rec['@path'] === 'string' ||
    typeof rec.call === 'string' ||
    typeof rec['@call'] === 'string'
  )
}

function isPointerObscuredInScope(
  ptr: string,
  obscured: ReadonlySet<string>,
  templatePrefixes?: ReadonlySet<string>,
): boolean {
  if (isPointerObscured(ptr, obscured, true)) return true
  if (templatePrefixes && templatePrefixes.size > 0 && !ptr.trim().startsWith('/')) {
    for (const tp of templatePrefixes) {
      const scoped = composeTemplatePath(tp, ptr)
      if (isPointerObscured(scoped, obscured, true)) return true
    }
  }
  return false
}

export function referencesObscuredPointer(
  node: unknown,
  obscured: ReadonlySet<string>,
  depth = 0,
  templatePrefixes?: ReadonlySet<string>,
): boolean {
  if (obscured.size === 0 || depth > 8 || node === null || node === undefined) return false
  if (typeof node === 'string') {
    for (const ptr of extractInterpolatedPointers(node)) {
      if (isPointerObscuredInScope(ptr, obscured, templatePrefixes)) return true
    }
    return false
  }
  if (Array.isArray(node)) {
    return node.some((el) => referencesObscuredPointer(el, obscured, depth + 1, templatePrefixes))
  }
  if (typeof node === 'object') {
    const bound = extractBindingPointer(node)
    if (bound !== null && isPointerObscuredInScope(bound, obscured, templatePrefixes)) return true
    for (const val of Object.values(node as Record<string, unknown>)) {
      if (referencesObscuredPointer(val, obscured, depth + 1, templatePrefixes)) return true
    }
  }
  return false
}

const BENIGN_SECRET_SENTINELS = new Set([
  'true',
  'false',
  'none',
  'null',
  'auto',
  'default',
  'enabled',
  'disabled',
  'required',
  'optional',
  'public',
  'private',
])

export function recordSecretPrimitive(
  v: unknown,
  outExact: Set<string>,
  outSubstrings: Set<string>,
  allowShortExact = false,
): void {
  if (typeof v === 'string') {
    const trimmed = v.trim()
    if (trimmed === '' || BENIGN_SECRET_SENTINELS.has(trimmed.toLowerCase())) return
    const minExact = allowShortExact ? 3 : 4
    if (v.length >= minExact) outExact.add(v)
    if (trimmed.length >= minExact) outExact.add(trimmed)
    if (v.length >= 4) outSubstrings.add(v)
    if (trimmed.length >= 4) outSubstrings.add(trimmed)
  } else if (typeof v === 'number' && Number.isFinite(v)) {
    const s = String(v)
    if (s.length >= 6) {
      outExact.add(s)
      outSubstrings.add(s)
    }
  }
}

export function isScrubbableNumericSecret(v: number, blockedExact: ReadonlySet<string>): boolean {
  if (!Number.isFinite(v)) return false
  const s = String(v)
  return s.length >= 6 && blockedExact.has(s)
}

export function collectKvSecretsFromValue(
  node: unknown,
  basePointer: string,
  outPointers: Set<string>,
  outExact: Set<string>,
  outSubstrings: Set<string>,
): void {
  const base = normalizePointerPath(basePointer)
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const entry = node[i]
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue
      const rec = entry as Record<string, unknown>
      const k = typeof rec.key === 'string' ? rec.key : typeof rec.name === 'string' ? rec.name : ''
      if (k !== '' && isSecretKey(k)) {
        outPointers.add(base === '/' ? `/${i}/value` : `${base}/${i}/value`)
        recordSecretPrimitive(rec.value, outExact, outSubstrings, true)
      }
    }
    return
  }
  if (typeof node === 'object' && node !== null) {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (isSecretKey(k)) {
        const seg = escapeJsonPointerSegment(k)
        outPointers.add(base === '/' ? `/${seg}` : `${base}/${seg}`)
        recordSecretPrimitive(v, outExact, outSubstrings, true)
      }
    }
  }
}

export function collectSecretsFromNode(
  root: unknown,
  obscuredPointers: ReadonlySet<string>,
  outExact: Set<string>,
  outSubstrings: Set<string>,
  stripPerSurfaceRoot = false,
): void {
  const walk = (
    node: unknown,
    path: string,
    depth: number,
    isSurfaceRoot: boolean,
    withinSecret: boolean,
  ) => {
    if (depth > 8 || node === null || node === undefined) return
    if (typeof node === 'string' || typeof node === 'number') {
      const explicitObscured = path !== '' && isPointerObscured(path, obscuredPointers, false)
      if (explicitObscured || withinSecret) {
        recordSecretPrimitive(node, outExact, outSubstrings, explicitObscured)
      }
      return
    }
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        walk(node[i], path === '' ? `/${i}` : `${path}/${i}`, depth + 1, false, withinSecret)
      }
      return
    }
    if (typeof node === 'object') {
      const rec = node as Record<string, unknown>
      const isKvSecret =
        !isSurfaceRoot &&
        ((typeof rec.key === 'string' && isSecretKey(rec.key)) ||
          (typeof rec.name === 'string' && isSecretKey(rec.name)))
      for (const [k, v] of Object.entries(rec)) {
        const childSecret =
          withinSecret || (!isSurfaceRoot && (isSecretKey(k) || (isKvSecret && k === 'value')))
        if (childSecret && (typeof v === 'string' || typeof v === 'number')) {
          recordSecretPrimitive(v, outExact, outSubstrings, false)
        }
        const seg = escapeJsonPointerSegment(k)
        const nextPath = isSurfaceRoot ? '' : path === '' ? `/${seg}` : `${path}/${seg}`
        walk(v, nextPath, isSurfaceRoot ? depth : depth + 1, false, childSecret)
      }
    }
  }
  walk(root, '', 0, stripPerSurfaceRoot, false)
}

export function scrubSecretString(
  input: string,
  blockedExact: ReadonlySet<string>,
  blockedSubstrings: ReadonlySet<string>,
): string | undefined {
  if (blockedExact.has(input)) return undefined
  if (blockedSubstrings.size === 0) return input
  const sorted = [...blockedSubstrings]
    .filter((s) => s.length >= 4)
    .sort((a, b) => b.length - a.length)
  let out = input
  for (const secret of sorted) {
    if (out.includes(secret)) {
      out = out.split(secret).join('[REDACTED]')
    }
  }
  return out
}
