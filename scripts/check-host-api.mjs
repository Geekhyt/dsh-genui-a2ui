#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

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
  '@tanstack/react-virtual',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
  '@deepseek-ai/dsh-client-ui-sidebar-right',
]

const REQUIRED_PRIMITIVE_EXPORTS = [
  'Button',
  'Checkbox',
  'Input',
  'Pill',
  'SegmentedControl',
  'SegmentedTabs',
  'Switch',
  'Tag',
  'Modal',
  'Menu',
  'Toast',
  'Tooltip',
  'CodeBlock',
  'JsonTree',
  'DisclosureRow',
  'MarkdownText',
  'StateDot',
  'HoverCard',
  'HoverCardGroup',
  'ImageLightbox',
  'FileTypeIcon',
  'PathLabel',
  'LinkIconRegular',
  'TextShimmer',
  'IconAppsAddOutlineRegular',
  'IconSearchOutlineRegular',
  'IconWarningOutlineRegular',
  'IconChevronDownOutlineRegular',
  'IconChevronUpOutlineRegular',
  'IconCheckOutlineRegular',
]

const OPTIONAL_HOST_TOKENS = new Set(['--dsw-font-family-mono'])

const REQUIRED_SLOTS = [
  'tool.call.toolview',
  'conversation.chat.turnTail',
  'conversation.input.dock',
  'conversation.input.left',
  'conversation.user.text.node',
]

if (!existsSync(ASAR_PATH)) {
  console.log(
    `[check-host-api] Skipped: DeepSeek Harness app.asar not present on this machine (${ASAR_PATH}).`,
  )
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

const pkgJson = JSON.parse(readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8'))
const injectModules = Array.isArray(pkgJson?.dsh?.client?.inject) ? pkgJson.dsh.client.inject : []
for (const mod of injectModules) {
  if (!raw.includes(`"${mod}"`) && !raw.includes(`'${mod}'`)) {
    errors.push(`missing dsh.client.inject module "${mod}"`)
  }
}

const srcRoot = resolve(import.meta.dirname, '../src')
const usedTokens = new Set()
const scanSourceForTokens = (dir) => {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, ent.name)
    if (ent.isDirectory()) {
      scanSourceForTokens(full)
    } else if (/\.(?:css|ts|tsx)$/.test(ent.name)) {
      const text = readFileSync(full, 'utf8')
      for (const m of text.matchAll(/--dsw-[a-z0-9-]+/g)) {
        usedTokens.add(m[0])
      }
    }
  }
}
scanSourceForTokens(srcRoot)

for (const token of [...usedTokens].sort()) {
  if (OPTIONAL_HOST_TOKENS.has(token)) continue
  if (!raw.includes(token)) {
    errors.push(`unknown host CSS token "${token}" not found in app.asar`)
  }
}

if (errors.length > 0) {
  console.error(`[check-host-api] FAILED against ${ASAR_PATH}:\n  - ${errors.join('\n  - ')}`)
  process.exit(1)
}

console.log(
  `[check-host-api] OK: verified ${REQUIRED_PLATFORM_MODULES.length} platform modules, ${injectModules.length} injected client modules, ${REQUIRED_PRIMITIVE_EXPORTS.length} primitives, ${REQUIRED_SLOTS.length} slots, and ${usedTokens.size} CSS tokens against ${ASAR_PATH}.`,
)
