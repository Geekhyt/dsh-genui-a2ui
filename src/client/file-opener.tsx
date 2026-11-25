import { createContext, useContext } from 'react'

const FILE_ADDRESS_PREFIX = 'dsh-resource://file/'

function encodeSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/%3A/gi, ':')
}

function encodePath(path: string): string {
  return path.split('/').map(encodeSegment).join('/')
}

export function isWindowsStylePath(value: string): boolean {
  return /^[A-Za-z]:[/\\]/.test(value)
}

export function isAbsoluteWorkspacePath(path: string): boolean {
  const slashNorm = path.replace(/\\/g, '/')
  return slashNorm.startsWith('/') || isAbsoluteWindows(slashNorm)
}

function isAbsoluteWindows(path: string): boolean {
  return isWindowsStylePath(path)
}

function stripTrailingSlashes(p: string): string {
  let end = p.length
  while (end > 0 && p[end - 1] === '/') {
    end -= 1
  }
  return end === p.length ? p : p.slice(0, end)
}

function collapseDuplicateSlashes(p: string): string {
  return p.replace(/\/{2,}/g, '/')
}

function hasPathTraversalSegment(rawPath: string): boolean {
  return rawPath.replace(/\\/g, '/').split('/').includes('..')
}

export function sessionFileAddress(sessionId: string, path: string): string {
  const normalized = collapseDuplicateSlashes(path.replace(/\\/g, '/')).replace(/^(?:\.\/)+/, '')
  return `${FILE_ADDRESS_PREFIX}session/${encodeSegment(sessionId)}/${encodePath(normalized)}`
}

function normalizeForPrefixCompare(p: string): string {
  const collapsed = collapseDuplicateSlashes(p.replace(/\\/g, '/'))
  if (collapsed === '/') return '/'
  const isWin = isWindowsStylePath(collapsed) || /^[A-Za-z]:$/.test(collapsed)
  const stripped = stripTrailingSlashes(collapsed)
  return isWin ? stripped.toLowerCase() : stripped
}

export function isPathWithinWorkspace(targetPath: string, cwd: string | undefined): boolean {
  const rawSlashes = targetPath.replace(/\\/g, '/')
  if (rawSlashes.startsWith('//') || hasPathTraversalSegment(rawSlashes)) return false
  const normalized = collapseDuplicateSlashes(rawSlashes)
  if (!isAbsoluteWorkspacePath(normalized)) return true
  if (!cwd || cwd.trim() === '') return false
  const rootCmp = normalizeForPrefixCompare(cwd)
  const targetCmp = normalizeForPrefixCompare(normalized)
  if (rootCmp === '') return false
  if (rootCmp === '/') return targetCmp.startsWith('/')
  return targetCmp === rootCmp || targetCmp.startsWith(`${rootCmp}/`)
}

export function fileAddressFor(sessionId: string, cwd: string | undefined, path: string): string {
  const normalized = collapseDuplicateSlashes(path.replace(/\\/g, '/'))
  if (!isAbsoluteWorkspacePath(normalized)) {
    return sessionFileAddress(sessionId, normalized)
  }
  const collapsedCwd = cwd === undefined ? '' : collapseDuplicateSlashes(cwd.replace(/\\/g, '/'))
  const root = collapsedCwd === '/' ? '/' : stripTrailingSlashes(collapsedCwd)
  if (root !== '') {
    const rootCmp = normalizeForPrefixCompare(root)
    const normCmp = normalizeForPrefixCompare(normalized)
    if (normCmp === rootCmp) {
      return sessionFileAddress(sessionId, '')
    }
    if (rootCmp === '/' && normCmp.startsWith('/')) {
      return sessionFileAddress(sessionId, normalized.slice(1))
    }
    if (normCmp.startsWith(`${rootCmp}/`)) {
      return sessionFileAddress(sessionId, normalized.slice(root.length + 1))
    }
  }
  return sessionFileAddress(sessionId, normalized)
}

export function resolveSessionPath(workingDir: string | undefined, path: string): string {
  const normalized = collapseDuplicateSlashes(path.replace(/\\/g, '/')).replace(/^(?:\.\/)+/, '')
  if (!workingDir || isAbsoluteWorkspacePath(normalized)) return normalized
  const collapsed = collapseDuplicateSlashes(workingDir.replace(/\\/g, '/'))
  if (collapsed === '/') return `/${normalized}`
  const base = stripTrailingSlashes(collapsed)
  return base === '' ? normalized : `${base}/${normalized}`
}

export interface ParsedFileTarget {
  readonly path: string
  readonly line?: number | undefined
}

const URI_SCHEME_RE = /^[A-Za-z][A-Za-z0-9+.-]*:/
const CONTROL_CHAR_RE = /[\u0000-\u001f\u007f]/
const ENCODED_TRAVERSAL_RE = /%(?:2e|2f|5c|00)/i

function hasEncodedTraversalOrControl(raw: string): boolean {
  if (ENCODED_TRAVERSAL_RE.test(raw)) return true
  let cur = raw
  for (let pass = 0; pass < 3; pass++) {
    if (!cur.includes('%')) break
    let decoded: string
    try {
      decoded = decodeURIComponent(cur)
    } catch {
      return true
    }
    if (decoded === cur) break
    if (CONTROL_CHAR_RE.test(decoded) || hasPathTraversalSegment(decoded)) return true
    if (decoded.replace(/\\/g, '/').startsWith('//')) return true
    cur = decoded
  }
  return false
}

export function parseFileTarget(rawPath: unknown, explicitLine?: unknown): ParsedFileTarget | null {
  if (typeof rawPath !== 'string') return null
  const trimmed = rawPath.trim()
  if (trimmed === '' || CONTROL_CHAR_RE.test(trimmed) || hasEncodedTraversalOrControl(trimmed)) {
    return null
  }
  const slashNorm = trimmed.replace(/\\/g, '/')
  if (slashNorm.startsWith('//')) return null
  if (!isWindowsStylePath(trimmed) && URI_SCHEME_RE.test(trimmed)) return null

  let cleanPath = trimmed
  let inferredLine: number | undefined

  const hashMatch = /^(.+?)#L(\d+)(?:-L?\d+)?$/i.exec(cleanPath)
  if (hashMatch?.[1] && hashMatch[2]) {
    cleanPath = hashMatch[1]
    inferredLine = Number(hashMatch[2])
  } else {
    const colonMatch = /^(.+?):(\d+)(?::\d+)?$/.exec(cleanPath)
    if (colonMatch?.[1] && colonMatch[2] && !/^[A-Za-z]$/.test(colonMatch[1])) {
      cleanPath = colonMatch[1]
      inferredLine = Number(colonMatch[2])
    }
  }

  let line: number | undefined
  if (typeof explicitLine === 'number' && Number.isFinite(explicitLine) && explicitLine >= 1) {
    line = Math.trunc(explicitLine)
  } else if (typeof explicitLine === 'string' && /^\d+$/.test(explicitLine.trim())) {
    const parsed = Number(explicitLine.trim())
    if (parsed >= 1) line = parsed
  } else if (inferredLine !== undefined && inferredLine >= 1) {
    line = inferredLine
  }

  const finalPath = cleanPath.trim()
  if (finalPath === '' || hasPathTraversalSegment(finalPath)) return null
  return { path: finalPath, ...(line !== undefined ? { line } : {}) }
}

export type WorkspaceFileOpener = (filePath: string, line?: number) => void

export const FileOpenContext = createContext<WorkspaceFileOpener | undefined>(undefined)

export function useFileOpener(): WorkspaceFileOpener | undefined {
  return useContext(FileOpenContext)
}
