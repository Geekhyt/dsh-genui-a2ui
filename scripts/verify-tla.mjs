#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { finished } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

export const TLA2TOOLS_RELEASE_URL =
  'https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar'

export function resolveJavaBinary() {
  const candidates = [
    process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', 'java') : '',
    '/opt/homebrew/opt/openjdk@21/bin/java',
    '/opt/homebrew/opt/openjdk/bin/java',
    '/usr/local/opt/openjdk@21/bin/java',
    '/usr/local/opt/openjdk/bin/java',
    'java',
  ].filter(Boolean)

  for (const bin of candidates) {
    if (bin !== 'java' && !existsSync(bin)) continue
    const probe = spawnSync(bin, ['-version'], { encoding: 'utf8' })
    if (probe.status === 0) return bin
  }
  return null
}

export function resolveTlaJar(rootDir) {
  const candidates = [
    process.env.TLA2TOOLS_JAR ?? '',
    join(rootDir, '.tla-cache', 'tla2tools.jar'),
    join(homedir(), '.cache', 'tla', 'tla2tools.jar'),
    '/usr/local/share/tla/tla2tools.jar',
    '/opt/homebrew/share/tla/tla2tools.jar',
  ].filter(Boolean)

  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return null
}

export function discoverSpecs(rootDir) {
  const specsDir = join(rootDir, 'specs')
  if (!existsSync(specsDir)) return []
  return readdirSync(specsDir)
    .filter((f) => f.endsWith('.tla'))
    .sort()
    .map((tlaFile) => {
      const name = basename(tlaFile, '.tla')
      return {
        name,
        tlaPath: join(specsDir, tlaFile),
        cfgPath: join(specsDir, `${name}.cfg`),
      }
    })
}

export function validateSpecStructure(spec) {
  const errors = []
  if (!existsSync(spec.tlaPath)) {
    errors.push(`Missing TLA+ module: ${spec.tlaPath}`)
    return errors
  }
  if (!existsSync(spec.cfgPath)) {
    errors.push(`Missing TLC config: ${spec.cfgPath}`)
    return errors
  }
  const tla = readFileSync(spec.tlaPath, 'utf8')
  const cfg = readFileSync(spec.cfgPath, 'utf8')
  if (!new RegExp(`----+\\s+MODULE\\s+${spec.name}\\s+----+`).test(tla)) {
    errors.push(`${spec.name}.tla missing "---- MODULE ${spec.name} ----" header`)
  }
  if (!/====+/.test(tla)) {
    errors.push(`${spec.name}.tla missing "====" footer`)
  }
  if (!/\bINVARIANT\b/.test(cfg)) {
    errors.push(`${spec.name}.cfg must declare at least one INVARIANT`)
  }
  if (!/\b(?:SPECIFICATION|INIT)\b/.test(cfg)) {
    errors.push(`${spec.name}.cfg must declare SPECIFICATION or INIT/NEXT`)
  }
  return errors
}

export function parseTlcOutput(stdout) {
  const statesMatch = /(\d+)\s+states generated,\s+(\d+)\s+distinct states found/.exec(stdout)
  const depthMatch = /The depth of the complete state graph search is (\d+)\./.exec(stdout)
  const ok = /Model checking completed\.\s+No error has been found\./.test(stdout)
  return {
    ok,
    statesGenerated: statesMatch ? Number(statesMatch[1]) : 0,
    distinctStates: statesMatch ? Number(statesMatch[2]) : 0,
    diameter: depthMatch ? Number(depthMatch[1]) : 0,
  }
}

async function downloadTlaJar(destPath) {
  mkdirSync(resolve(destPath, '..'), { recursive: true })
  const res = await fetch(TLA2TOOLS_RELEASE_URL, { redirect: 'follow' })
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download tla2tools.jar: HTTP ${res.status}`)
  }
  const tmpPath = `${destPath}.tmp`
  const ws = createWriteStream(tmpPath)
  await finished(Readable.fromWeb(res.body).pipe(ws))
  const { renameSync } = await import('node:fs')
  renameSync(tmpPath, destPath)
  return destPath
}

export function runTlcForSpec(javaBin, jarPath, spec) {
  const metaDir = join(tmpdir(), `dsh-tlc-${spec.name}-${Date.now()}`)
  mkdirSync(metaDir, { recursive: true })
  try {
    const res = spawnSync(
      javaBin,
      [
        '-XX:+UseParallelGC',
        '-cp',
        jarPath,
        'tlc2.TLC',
        '-metadir',
        metaDir,
        '-workers',
        'auto',
        '-cleanup',
        '-config',
        spec.cfgPath,
        spec.tlaPath,
      ],
      {
        cwd: resolve(spec.tlaPath, '..'),
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
      },
    )
    const combined = `${res.stdout ?? ''}\n${res.stderr ?? ''}`
    const parsed = parseTlcOutput(combined)
    return {
      spec: spec.name,
      status: res.status ?? 1,
      ok: res.status === 0 && parsed.ok,
      ...parsed,
      output: combined,
    }
  } finally {
    rmSync(metaDir, { recursive: true, force: true })
  }
}

async function runCli() {
  const args = process.argv.slice(2)
  const flagSet = new Set(args)
  const rootDir = resolve(import.meta.dirname, '..')
  const filterArg = args.find((a) => a.startsWith('--spec='))
  const filterName = filterArg ? filterArg.slice(7) : null

  const specs = discoverSpecs(rootDir).filter((s) => filterName === null || s.name === filterName)
  if (specs.length === 0) {
    console.error('[verify-tla] No TLA+ specs found in specs/.')
    process.exit(1)
  }

  for (const spec of specs) {
    const structuralErrors = validateSpecStructure(spec)
    if (structuralErrors.length > 0) {
      console.error(`[verify-tla] Structural validation failed for ${spec.name}:`)
      for (const e of structuralErrors) console.error(`  - ${e}`)
      process.exit(1)
    }
  }

  const javaBin = resolveJavaBinary()
  let jarPath = resolveTlaJar(rootDir)

  if (jarPath === null && flagSet.has('--download')) {
    const target = join(homedir(), '.cache', 'tla', 'tla2tools.jar')
    console.log(`[verify-tla] Downloading tla2tools.jar to ${target}...`)
    jarPath = await downloadTlaJar(target)
  }

  if (javaBin === null || jarPath === null) {
    const missing = []
    if (javaBin === null) missing.push('Java (OpenJDK 17+)')
    if (jarPath === null) missing.push('tla2tools.jar (run with --download or set TLA2TOOLS_JAR)')
    const msg = `[verify-tla] Structural check OK for ${specs.length} spec(s); TLC skipped (missing ${missing.join(' & ')}).`
    if (flagSet.has('--strict')) {
      console.error(msg)
      process.exit(1)
    }
    console.log(msg)
    return
  }

  let allOk = true
  for (const spec of specs) {
    const r = runTlcForSpec(javaBin, jarPath, spec)
    if (r.ok) {
      console.log(
        `[verify-tla] PASS ${spec.name.padEnd(22)} distinct=${String(r.distinctStates).padStart(7)} generated=${String(r.statesGenerated).padStart(8)} depth=${r.diameter}`,
      )
    } else {
      allOk = false
      console.error(`[verify-tla] FAIL ${spec.name}:`)
      console.error(r.output)
    }
  }

  if (!allOk) process.exit(1)
  console.log(
    `[verify-tla] OK: TLC verified all ${specs.length} formal state-machine specs with 0 errors.`,
  )
}

const isEntry =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isEntry) {
  runCli().catch((err) => {
    console.error('[verify-tla] Fatal:', err)
    process.exit(1)
  })
}
