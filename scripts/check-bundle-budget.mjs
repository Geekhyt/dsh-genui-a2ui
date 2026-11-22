#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

export const HARD_MAX_CLIENT_RAW_BYTES = 100 * 1024

export function measureBufferBytes(content, gzipLevel = 9) {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8')
  const gz = gzipSync(buf, { level: gzipLevel })
  return { rawBytes: buf.length, gzipBytes: gz.length }
}

export function loadBundleBudget(budgetPath) {
  const raw = JSON.parse(readFileSync(budgetPath, 'utf8'))
  if (
    typeof raw !== 'object' ||
    raw === null ||
    typeof raw.chunks !== 'object' ||
    raw.chunks === null
  ) {
    throw new Error(`Invalid bundle budget config: ${budgetPath}`)
  }
  const gzipLevel =
    typeof raw.gzipLevel === 'number' && raw.gzipLevel >= 1 && raw.gzipLevel <= 9
      ? raw.gzipLevel
      : 9
  return {
    version: typeof raw.version === 'number' ? raw.version : 1,
    gzipLevel,
    chunks: raw.chunks,
  }
}

export function evaluateBundleBudgets(rootDir, budget) {
  const results = []
  const violations = []
  const gzipLevel = budget.gzipLevel ?? 9

  for (const [relPath, limits] of Object.entries(budget.chunks)) {
    const absPath = resolve(rootDir, relPath)
    if (!existsSync(absPath)) {
      violations.push({
        file: relPath,
        kind: 'missing',
        message: `${relPath} is missing; run "npm run build" first`,
      })
      continue
    }
    const { rawBytes, gzipBytes } = measureBufferBytes(readFileSync(absPath), gzipLevel)
    const maxRawBytes = Number(limits.maxRawBytes)
    const maxGzipBytes = Number(limits.maxGzipBytes)
    const rawPct = maxRawBytes > 0 ? Math.round((rawBytes / maxRawBytes) * 1000) / 10 : 100
    const gzipPct = maxGzipBytes > 0 ? Math.round((gzipBytes / maxGzipBytes) * 1000) / 10 : 100

    results.push({
      file: relPath,
      rawBytes,
      maxRawBytes,
      rawPct,
      gzipBytes,
      maxGzipBytes,
      gzipPct,
    })

    if (relPath === 'lib/client.js' && rawBytes >= HARD_MAX_CLIENT_RAW_BYTES) {
      violations.push({
        file: relPath,
        kind: 'hard-raw',
        actual: rawBytes,
        limit: HARD_MAX_CLIENT_RAW_BYTES,
        message: `${relPath} raw ${rawBytes} B exceeds hard ${HARD_MAX_CLIENT_RAW_BYTES} B cold-boot limit`,
      })
    }
    if (rawBytes > maxRawBytes) {
      violations.push({
        file: relPath,
        kind: 'raw',
        actual: rawBytes,
        limit: maxRawBytes,
        message: `${relPath} raw ${rawBytes} B > budget ${maxRawBytes} B (+${rawBytes - maxRawBytes} B)`,
      })
    }
    if (gzipBytes > maxGzipBytes) {
      violations.push({
        file: relPath,
        kind: 'gzip',
        actual: gzipBytes,
        limit: maxGzipBytes,
        message: `${relPath} gzip ${gzipBytes} B > budget ${maxGzipBytes} B (+${gzipBytes - maxGzipBytes} B)`,
      })
    }
  }

  return { ok: violations.length === 0, results, violations }
}

function roundUpToKilobyte(bytes) {
  return Math.ceil(bytes / 1024) * 1024
}

export function ratchetBundleBudgets(budget, results, headroomRatio = 0.08) {
  const nextChunks = {}
  for (const [relPath, limits] of Object.entries(budget.chunks)) {
    const measured = results.find((r) => r.file === relPath)
    if (!measured) {
      nextChunks[relPath] = { ...limits }
      continue
    }
    const candidateRaw = roundUpToKilobyte(Math.ceil(measured.rawBytes * (1 + headroomRatio)))
    const candidateGzip = roundUpToKilobyte(Math.ceil(measured.gzipBytes * (1 + headroomRatio)))
    nextChunks[relPath] = {
      maxRawBytes: Math.min(limits.maxRawBytes, Math.max(measured.rawBytes, candidateRaw)),
      maxGzipBytes: Math.min(limits.maxGzipBytes, Math.max(measured.gzipBytes, candidateGzip)),
    }
  }
  return {
    version: budget.version ?? 1,
    gzipLevel: budget.gzipLevel ?? 9,
    chunks: nextChunks,
  }
}

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(2)} kB`
}

function runCli() {
  const args = new Set(process.argv.slice(2))
  const rootDir = resolve(import.meta.dirname, '..')
  const budgetPath = resolve(rootDir, '.bundle-budget.json')
  const budget = loadBundleBudget(budgetPath)
  const report = evaluateBundleBudgets(rootDir, budget)

  if (args.has('--ratchet')) {
    if (!report.ok) {
      for (const v of report.violations) {
        console.error(`[check-bundle-budget] ${v.message}`)
      }
      process.exit(1)
    }
    const tightened = ratchetBundleBudgets(budget, report.results)
    writeFileSync(budgetPath, `${JSON.stringify(tightened, null, 2)}\n`, 'utf8')
    console.log(`[check-bundle-budget] Ratcheted ${budgetPath}`)
    return
  }

  if (args.has('--json')) {
    console.log(JSON.stringify(report, null, 2))
    if (!report.ok) process.exit(1)
    return
  }

  for (const row of report.results) {
    console.log(
      `[check-bundle-budget] ${row.file.padEnd(23)} raw ${formatKb(row.rawBytes).padStart(10)} / ${formatKb(row.maxRawBytes).padStart(10)} (${String(row.rawPct).padStart(5)}%) | gzip ${formatKb(row.gzipBytes).padStart(9)} / ${formatKb(row.maxGzipBytes).padStart(9)} (${String(row.gzipPct).padStart(5)}%)`,
    )
  }

  if (!report.ok) {
    console.error(`[check-bundle-budget] FAILED (${report.violations.length} violation(s)):`)
    for (const v of report.violations) {
      console.error(`  - ${v.message}`)
    }
    process.exit(1)
  }
  console.log(
    `[check-bundle-budget] OK: all ${report.results.length} bundle chunks within raw & gzip budgets.`,
  )
}

const isEntry =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isEntry) {
  runCli()
}
