#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const DEFAULT_SCAN_ROOTS = ['src', 'build', 'scripts', 'tests', 'tsdown.config.ts']
const IGNORED_DIRS = new Set(['node_modules', 'lib', 'dist', '.git', '.dsh-dev'])
const JS_TS_EXTS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs'])
const CSS_EXTS = new Set(['.css'])
const DIRECTIVE_RE = /^\/\*\s*[@#]__(?:PURE|NO_SIDE_EFFECTS)__\s*\*\/$/

export function isAllowedDirective(raw) {
  return DIRECTIVE_RE.test(raw.trim())
}

function getScriptKind(filePath) {
  const ext = extname(filePath)
  if (ext === '.tsx') return ts.ScriptKind.TSX
  if (ext === '.ts' || ext === '.mts' || ext === '.cts') return ts.ScriptKind.TS
  return ts.ScriptKind.JS
}

export function scanTsJsComments(source, filePath) {
  const sf = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(filePath),
  )
  const seen = new Map()

  const addRanges = (ranges) => {
    if (!ranges) return
    for (const r of ranges) {
      if (seen.has(r.pos)) continue
      const raw = source.slice(r.pos, r.end)
      if (isAllowedDirective(raw)) continue
      const startLC = sf.getLineAndCharacterOfPosition(r.pos)
      const endLC = sf.getLineAndCharacterOfPosition(Math.max(r.pos, r.end - 1))
      seen.set(r.pos, {
        file: filePath,
        kind: r.kind === ts.SyntaxKind.SingleLineCommentTrivia ? 'line' : 'block',
        start: r.pos,
        end: r.end,
        startLine: startLC.line + 1,
        endLine: endLC.line + 1,
        startCol: startLC.character + 1,
        raw,
      })
    }
  }

  const visit = (node) => {
    addRanges(ts.getLeadingCommentRanges(source, node.pos))
    addRanges(ts.getTrailingCommentRanges(source, node.end))
    for (const child of node.getChildren(sf)) {
      visit(child)
    }
  }

  visit(sf)
  return [...seen.values()].sort((a, b) => a.start - b.start)
}

export function scanCssComments(source, filePath) {
  const out = []
  let i = 0
  let line = 1
  let col = 1
  const len = source.length

  const advance = (ch) => {
    if (ch === '\n') {
      line += 1
      col = 1
    } else {
      col += 1
    }
  }

  while (i < len) {
    const ch = source[i]
    if (ch === '"' || ch === "'") {
      const quote = ch
      advance(ch)
      i += 1
      while (i < len) {
        const cur = source[i]
        if (cur === '\\' && i + 1 < len) {
          advance(cur)
          i += 1
          advance(source[i])
          i += 1
          continue
        }
        advance(cur)
        i += 1
        if (cur === quote) break
      }
      continue
    }

    if (ch === '/' && source[i + 1] === '*') {
      const start = i
      const startLine = line
      const startCol = col
      advance('/')
      advance('*')
      i += 2
      while (i < len && !(source[i] === '*' && source[i + 1] === '/')) {
        advance(source[i])
        i += 1
      }
      if (i < len) {
        advance('*')
        advance('/')
        i += 2
      }
      const raw = source.slice(start, i)
      if (!isAllowedDirective(raw)) {
        out.push({
          file: filePath,
          kind: 'block',
          start,
          end: i,
          startLine,
          endLine: line,
          startCol,
          raw,
        })
      }
      continue
    }

    advance(ch)
    i += 1
  }

  return out
}

export function scanFileComments(source, filePath) {
  const ext = extname(filePath)
  if (JS_TS_EXTS.has(ext)) return scanTsJsComments(source, filePath)
  if (CSS_EXTS.has(ext)) return scanCssComments(source, filePath)
  return []
}

export function collectTargetFiles(rootDir, roots = DEFAULT_SCAN_ROOTS) {
  const files = []

  const walk = (absPath) => {
    if (!existsSync(absPath)) return
    const st = statSync(absPath)
    if (st.isDirectory()) {
      for (const entry of readdirSync(absPath, { withFileTypes: true })) {
        if (IGNORED_DIRS.has(entry.name)) continue
        walk(join(absPath, entry.name))
      }
      return
    }
    const ext = extname(absPath)
    if (JS_TS_EXTS.has(ext) || CSS_EXTS.has(ext)) {
      files.push(relative(rootDir, absPath).replace(/\\/g, '/'))
    }
  }

  for (const r of roots) {
    walk(resolve(rootDir, r))
  }

  return files.sort()
}

export function scanRepositoryComments(rootDir, roots = DEFAULT_SCAN_ROOTS) {
  const files = collectTargetFiles(rootDir, roots)
  const byFile = new Map()
  let total = 0

  for (const relPath of files) {
    const absPath = resolve(rootDir, relPath)
    const source = readFileSync(absPath, 'utf8')
    const comments = scanFileComments(source, relPath)
    if (comments.length > 0) {
      byFile.set(relPath, comments)
      total += comments.length
    }
  }

  return { files, byFile, total }
}

export function evaluateRatchet(scanResult, ratchet) {
  const allowedFiles = ratchet?.files ?? {}
  const totalLimit = typeof ratchet?.totalLimit === 'number' ? ratchet.totalLimit : 0
  const violations = []
  const loosenings = []

  for (const [file, comments] of scanResult.byFile) {
    const limit = typeof allowedFiles[file] === 'number' ? allowedFiles[file] : 0
    if (comments.length > limit) {
      violations.push({
        file,
        actual: comments.length,
        limit,
        comments,
      })
    }
  }

  for (const [file, limit] of Object.entries(allowedFiles)) {
    const actual = scanResult.byFile.get(file)?.length ?? 0
    if (actual < limit) {
      loosenings.push({ file, actual, limit })
    }
  }

  const totalExceeded = scanResult.total > totalLimit
  const totalCanTighten = scanResult.total < totalLimit

  return {
    ok: violations.length === 0 && !totalExceeded && loosenings.length === 0 && !totalCanTighten,
    violations,
    loosenings,
    totalActual: scanResult.total,
    totalLimit,
    totalExceeded,
    totalCanTighten,
  }
}

export function buildRatchetConfig(scanResult) {
  const files = {}
  for (const [file, comments] of [...scanResult.byFile.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    if (comments.length > 0) {
      files[file] = comments.length
    }
  }
  return {
    version: 1,
    allowDirectives: [
      '/* @__PURE__ */',
      '/* #__PURE__ */',
      '/* @__NO_SIDE_EFFECTS__ */',
      '/* #__NO_SIDE_EFFECTS__ */',
    ],
    totalLimit: scanResult.total,
    files,
  }
}

function summarizeComment(raw) {
  const oneLine = raw.replace(/\s+/g, ' ').trim()
  return oneLine.length > 100 ? `${oneLine.slice(0, 97)}...` : oneLine
}

function runCli(argv) {
  const rootDir = process.cwd()
  const ratchetPath = resolve(rootDir, '.comment-ratchet.json')
  const isReport = argv.includes('--report')
  const isInit = argv.includes('--init')
  const isUpdate = argv.includes('--update-ratchet')

  const scanResult = scanRepositoryComments(rootDir)

  if (isReport) {
    console.log(
      `[check-no-comments] ${scanResult.total} comment(s) remaining across ${scanResult.byFile.size} file(s):`,
    )
    for (const [file, comments] of scanResult.byFile) {
      console.log(`\n${file} (${comments.length})`)
      for (const c of comments) {
        console.log(`  L${c.startLine}: ${summarizeComment(c.raw)}`)
      }
    }
    return 0
  }

  if (isInit) {
    const next = buildRatchetConfig(scanResult)
    writeFileSync(ratchetPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    console.log(
      `[check-no-comments] Initialized .comment-ratchet.json: ${next.totalLimit} comment(s) across ${Object.keys(next.files).length} file(s).`,
    )
    return 0
  }

  if (!existsSync(ratchetPath)) {
    console.error(
      '[check-no-comments] Missing .comment-ratchet.json. Run with --init to create a baseline.',
    )
    return 1
  }

  const ratchet = JSON.parse(readFileSync(ratchetPath, 'utf8'))
  const evaluation = evaluateRatchet(scanResult, ratchet)

  if (isUpdate) {
    if (evaluation.violations.length > 0 || evaluation.totalExceeded) {
      console.error('[check-no-comments] Refusing to loosen ratchet: comment count increased in:')
      for (const v of evaluation.violations) {
        console.error(`  - ${v.file}: ${v.actual} > limit ${v.limit}`)
      }
      return 1
    }
    const next = buildRatchetConfig(scanResult)
    writeFileSync(ratchetPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    console.log(
      `[check-no-comments] Tightened .comment-ratchet.json: ${evaluation.totalLimit} -> ${next.totalLimit} comment(s) across ${Object.keys(next.files).length} file(s).`,
    )
    return 0
  }

  if (evaluation.violations.length > 0 || evaluation.totalExceeded) {
    console.error(
      `[check-no-comments] FAILED: comments are forbidden (total ${evaluation.totalActual} / limit ${evaluation.totalLimit}).`,
    )
    console.error(
      'Delete redundant/outdated comments, file an issue for excuses, or migrate non-obvious decisions to docs/adr/.',
    )
    for (const v of evaluation.violations) {
      console.error(`\n  ${v.file}: ${v.actual} comment(s), allowed <= ${v.limit}`)
      for (const c of v.comments) {
        console.error(`    L${c.startLine}: ${summarizeComment(c.raw)}`)
      }
    }
    return 1
  }

  if (evaluation.loosenings.length > 0 || evaluation.totalCanTighten) {
    console.error(
      `[check-no-comments] Ratchet can be tightened (${evaluation.totalLimit} -> ${evaluation.totalActual}).`,
    )
    for (const l of evaluation.loosenings) {
      console.error(`  - ${l.file}: ${l.limit} -> ${l.actual}`)
    }
    console.error('Run: node scripts/check-no-comments.mjs --update-ratchet')
    return 1
  }

  console.log(
    `[check-no-comments] OK: ${evaluation.totalActual} ratcheted comment(s) across ${scanResult.byFile.size} file(s) (0 regressions; 0 comments in unratcheted files).`,
  )
  return 0
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))

if (isMain) {
  process.exit(runCli(process.argv.slice(2)))
}
