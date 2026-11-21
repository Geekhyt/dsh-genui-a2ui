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
  return path.startsWith('/') || isAbsoluteWindows(path)
}

function isAbsoluteWindows(path: string): boolean {
  return isWindowsStylePath(path)
}

function hasPathTraversalSegment(rawPath: string): boolean {
  return rawPath.replace(/\\/g, '/').split('/').includes('..')
}

export function sessionFileAddress(sessionId: string, path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '')
  return `${FILE_ADDRESS_PREFIX}session/${encodeSegment(sessionId)}/${encodePath(normalized)}`
}

export function fileAddressFor(sessionId: string, cwd: string | undefined, path: string): string {
  const normalized = path.replace(/\\/g, '/')
  if (!isAbsoluteWorkspacePath(normalized)) {
    return sessionFileAddress(sessionId, normalized)
  }
  const root = cwd === undefined ? '' : cwd.replace(/\\/g, '/').replace(/\/+$/, '')
  if (root !== '' && normalized === root) {
    return sessionFileAddress(sessionId, '')
  }
  if (root !== '' && normalized.startsWith(`${root}/`)) {
    return sessionFileAddress(sessionId, normalized.slice(root.length + 1))
  }
  return sessionFileAddress(sessionId, normalized)
}

export function resolveSessionPath(workingDir: string | undefined, path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '')
  if (!workingDir || isAbsoluteWorkspacePath(normalized)) return normalized
  const base = workingDir.replace(/\\/g, '/').replace(/\/+$/, '')
  return base === '' ? normalized : `${base}/${normalized}`
}

export interface ParsedFileTarget {
  readonly path: string
  readonly line?: number | undefined
}

const URI_SCHEME_RE = /^[A-Za-z][A-Za-z0-9+.-]*:/
const CONTROL_CHAR_RE = /[\u0000-\u001f\u007f]/

export function parseFileTarget(rawPath: unknown, explicitLine?: unknown): ParsedFileTarget | null {
  if (typeof rawPath !== 'string') return null
  const trimmed = rawPath.trim()
  if (trimmed === '' || CONTROL_CHAR_RE.test(trimmed)) return null
  if (trimmed.startsWith('\\\\') || trimmed.startsWith('//')) return null
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
