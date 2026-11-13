#!/usr/bin/env node
/**
 * Drift check against the installed DeepSeek Harness Desktop `app.asar`.
 *
 * Scans the unpacked ASAR payload in pure Node (no external CLI required) to
 * verify that every `PLATFORM_MODULES` key, `@deepseek-ai/dsh-client-ui-primitives`
 * export, and client UI slot name `dsh-genui-a2ui` relies on is present in the host.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

function resolveAsarPath() {
  if (process.env.DSH_ASAR_PATH) return process.env.DSH_ASAR_PATH
  const candidates = [
    '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar',
    process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, 'Programs', 'DeepSeek Harness', 'resources', 'app.asar')
      : '',
    process.env.PROGRAMFILES
      ? join(process.env.PROGRAMFILES, 'DeepSeek Harness', 'resources', 'app.asar')
      : '',
    '/opt/DeepSeek Harness/resources/app.asar',
    '/usr/lib/deepseek-harness/resources/app.asar',
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return candidates[0]
}

const ASAR_PATH = resolveAsarPath()

const REQUIRED_PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-system-prompt',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-sidebar-right',
]

const REQUIRED_PRIMITIVE_EXPORTS = [
  'Button',
  'Checkbox',
  'Input',
  'Pill',
  'SegmentedTabs',
  'Tag',
  'Modal',
  'Menu',
  'Tooltip',
  'CodeBlock',
  'JsonTree',
  'DisclosureRow',
  'MarkdownText',
  'IconAppsAddOutlineRegular',
  'IconSearchOutlineRegular',
]

const REQUIRED_SLOTS = [
  'tool.call.toolview',
  'conversation.chat.turnTail',
  'conversation.input.dock',
  'conversation.input.left',
  'conversation.user.text.node',
]

if (!existsSync(ASAR_PATH)) {
  console.log(`[check-host-api] Skipped: DeepSeek Harness app.asar not present on this machine (${ASAR_PATH}).`)
  process.exit(0)
}

const raw = readFileSync(ASAR_PATH, 'latin1')
const errors = []

for (const mod of REQUIRED_PLATFORM_MODULES) {
  if (!raw.includes(`"${mod}"`) && !raw.includes(`'${mod}'`)) {
    errors.push(`missing platform module "${mod}"`)
  }
}

for (const sym of REQUIRED_PRIMITIVE_EXPORTS) {
  if (!raw.includes(`${sym}:`) && !raw.includes(`exports.${sym}`)) {
    errors.push(`missing dsh-client-ui-primitives export "${sym}"`)
  }
}

for (const slot of REQUIRED_SLOTS) {
  if (!raw.includes(slot)) {
    errors.push(`missing client UI slot "${slot}"`)
  }
}

if (errors.length > 0) {
  console.error(`[check-host-api] FAILED against ${ASAR_PATH}:\n  - ${errors.join('\n  - ')}`)
  process.exit(1)
}

console.log(
  `[check-host-api] OK: verified ${REQUIRED_PLATFORM_MODULES.length} platform modules, ${REQUIRED_PRIMITIVE_EXPORTS.length} primitives, and ${REQUIRED_SLOTS.length} slots against ${ASAR_PATH}.`,
)
