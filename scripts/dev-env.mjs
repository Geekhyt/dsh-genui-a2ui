#!/usr/bin/env node
/**
 * Isolated DSH development harness (`DSH_HOME=.dsh-dev`).
 *
 * Commands:
 *   node scripts/dev-env.mjs setup   — initialize `.dsh-dev` and install `dsh-genui-a2ui` into its `web` profile
 *   node scripts/dev-env.mjs serve   — start mock LLM + `dsh web` on 127.0.0.1:18992
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { startMockLlmServer } from './mock-llm.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const DSH_HOME = resolve(ROOT, '.dsh-dev')
const DSH_BIN = process.env.DSH_BIN ?? '/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh'
const WEB_PORT = Number(process.env.DSH_DEV_PORT ?? 18992)
const MOCK_PORT = Number(process.env.MOCK_LLM_PORT ?? 18991)

const baseEnv = {
  ...process.env,
  DSH_HOME,
  MOCK_A2UI_API_KEY: 'mock-local-key',
  DSH_TELEMETRY_MODE: 'DISABLED',
}

function runSync(args) {
  const res = spawnSync(DSH_BIN, args, {
    cwd: ROOT,
    env: baseEnv,
    stdio: 'inherit',
  })
  if (res.status !== 0) {
    process.exit(res.status ?? 1)
  }
}

const cmd = process.argv[2] ?? 'setup'
mkdirSync(DSH_HOME, { recursive: true })

if (cmd === 'setup') {
  console.log(`[dev-env] Installing dsh-genui-a2ui into isolated DSH_HOME=${DSH_HOME} (profile: web)...`)
  runSync(['plugin', '--profile', 'web', 'add', `link:${ROOT}`])
  console.log('[dev-env] Verifying composed config...')
  const check = spawnSync(DSH_BIN, ['--profile', 'web', '--patch', resolve(ROOT, 'scripts/mock-overlay.yml'), '--dump-config'], {
    cwd: ROOT,
    env: baseEnv,
    encoding: 'utf8',
  })
  if (check.status !== 0) {
    console.error(check.stderr)
    process.exit(check.status ?? 1)
  }
  if (!check.stdout.includes('dsh-genui-a2ui')) {
    console.error('[dev-env] ERROR: dsh-genui-a2ui not found in composed profile config!')
    process.exit(1)
  }
  console.log('[dev-env] OK: dsh-genui-a2ui + mock-a2ui overlay verified in isolated profile.')
} else if (cmd === 'serve') {
  const mockServer = await startMockLlmServer(MOCK_PORT)
  console.log(`[dev-env] Mock LLM ready at http://127.0.0.1:${MOCK_PORT}/v1`)
  const child = spawn(
    DSH_BIN,
    [
      '--profile',
      'web',
      '--patch',
      resolve(ROOT, 'scripts/mock-overlay.yml'),
      '--no-open',
      '--host',
      '127.0.0.1',
      '--port',
      String(WEB_PORT),
    ],
    {
      cwd: ROOT,
      env: baseEnv,
      stdio: 'inherit',
    },
  )
  const shutdown = () => {
    child.kill('SIGTERM')
    mockServer.close(() => process.exit(0))
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
  child.on('exit', (code) => {
    mockServer.close(() => process.exit(code ?? 0))
  })
} else {
  console.error(`Unknown subcommand "${cmd}". Use "setup" or "serve".`)
  process.exit(1)
}
