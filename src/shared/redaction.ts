import { isSecretKey } from './constants.ts'

export function escapeJsonPointerSegment(key: string): string {
  return key.replace(/~/g, '~0').replace(/\//g, '~1')
}

export function normalizePointerPath(pointer: string): string {
  const trimmed = pointer.trim()
  if (trimmed === '' || trimmed === '/') return '/'
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : withSlash
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

const INTERP_POINTER_RE = /\$\{([^}]+)\}/g

export function extractInterpolatedPointers(text: string): readonly string[] {
  if (!text.includes('${')) return []
  const out: string[] = []
  INTERP_POINTER_RE.lastIndex = 0
  let m = INTERP_POINTER_RE.exec(text)
  while (m !== null) {
    const inner = (m[1] ?? '').trim()
    if (inner.startsWith('/') || inner.startsWith('$/')) {
      out.push(inner.startsWith('$/') ? inner.slice(1) : inner)
    } else if (/^[A-Za-z_][A-Za-z0-9_/-]*$/.test(inner)) {
      out.push(inner)
    }
    m = INTERP_POINTER_RE.exec(text)
  }
  return out
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

export function referencesObscuredPointer(
  node: unknown,
  obscured: ReadonlySet<string>,
  depth = 0,
): boolean {
  if (obscured.size === 0 || depth > 8 || node === null || node === undefined) return false
  if (typeof node === 'string') {
    for (const ptr of extractInterpolatedPointers(node)) {
      if (isPointerObscured(ptr, obscured, true)) return true
    }
    return false
  }
  if (Array.isArray(node)) {
    return node.some((el) => referencesObscuredPointer(el, obscured, depth + 1))
  }
  if (typeof node === 'object') {
    const bound = extractBindingPointer(node)
    if (bound !== null && isPointerObscured(bound, obscured, true)) return true
    for (const val of Object.values(node as Record<string, unknown>)) {
      if (referencesObscuredPointer(val, obscured, depth + 1)) return true
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
    if (allowShortExact ? v.length >= 3 : v.length >= 4) outExact.add(v)
    if (v.length >= 4) outSubstrings.add(v)
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
  const walk = (node: unknown, path: string, depth: number, isSurfaceRoot: boolean) => {
    if (depth > 8 || node === null || node === undefined) return
    if (typeof node === 'string' || typeof node === 'number') {
      if (path !== '' && isPointerObscuredOrParent(path, obscuredPointers)) {
        recordSecretPrimitive(node, outExact, outSubstrings, true)
      }
      return
    }
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        walk(node[i], path === '' ? `/${i}` : `${path}/${i}`, depth + 1, false)
      }
      return
    }
    if (typeof node === 'object') {
      const rec = node as Record<string, unknown>
      const isKvSecret =
        !isSurfaceRoot &&
        ((typeof rec.key === 'string' && isSecretKey(rec.key)) ||
          (typeof rec.name === 'string' && isSecretKey(rec.name)))
      if (isKvSecret) {
        recordSecretPrimitive(rec.value, outExact, outSubstrings, false)
      }
      for (const [k, v] of Object.entries(rec)) {
        if (!isSurfaceRoot && isSecretKey(k)) {
          recordSecretPrimitive(v, outExact, outSubstrings, false)
        }
        const seg = escapeJsonPointerSegment(k)
        const nextPath = isSurfaceRoot ? '' : path === '' ? `/${seg}` : `${path}/${seg}`
        walk(v, nextPath, isSurfaceRoot ? depth : depth + 1, false)
      }
    }
  }
  walk(root, '', 0, stripPerSurfaceRoot)
}

export function scrubSecretString(
  input: string,
  blockedExact: ReadonlySet<string>,
  blockedSubstrings: ReadonlySet<string>,
): string | undefined {
  if (blockedExact.has(input)) return undefined
  let out = input
  for (const secret of blockedSubstrings) {
    if (secret.length >= 4 && out.includes(secret)) {
      out = out.split(secret).join('[REDACTED]')
    }
  }
  return out
}
