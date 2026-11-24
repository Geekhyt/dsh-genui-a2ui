import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

const DSH_PRIMITIVES_VIRTUAL = '\0dsh-client-ui-primitives-stub'
const LOCAL_CSS_IMPORT_RE = /^@import\s+['"](\.[^'"]+\.css)['"]\s*;\s*$/

function expandLocalCssSync(filePath: string, seen = new Set<string>()): string {
  const abs = resolve(filePath)
  if (seen.has(abs)) return ''
  seen.add(abs)
  const raw = readFileSync(abs, 'utf8')
  const parts: string[] = []
  for (const line of raw.split('\n')) {
    const match = LOCAL_CSS_IMPORT_RE.exec(line.trim())
    if (match?.[1]) {
      parts.push(expandLocalCssSync(resolve(dirname(abs), match[1]), seen))
    } else {
      parts.push(line)
    }
  }
  return parts.join('\n')
}

function expandCssModulePartialsPlugin() {
  return {
    name: 'dsh-expand-css-module-partials',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      const cleanId = id.split('?')[0] ?? id
      if (!cleanId.endsWith('.module.css') || !code.includes('@import')) return null
      return { code: expandLocalCssSync(cleanId), map: null }
    },
  }
}

function dshHostPrimitivesStubPlugin() {
  return {
    name: 'dsh-host-primitives-test-stub',
    resolveId(source: string) {
      if (source === '@deepseek-ai/dsh-client-ui-primitives') return DSH_PRIMITIVES_VIRTUAL
      return null
    },
    load(id: string) {
      if (id === DSH_PRIMITIVES_VIRTUAL) return 'export default {};'
      return null
    },
  }
}

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [expandCssModulePartialsPlugin()],
        test: {
          name: 'node',
          include: ['tests/**/*.spec.{ts,tsx}'],
          exclude: ['tests/**/*.dom.spec.{ts,tsx}'],
          environment: 'node',
        },
      },
      {
        plugins: [expandCssModulePartialsPlugin(), dshHostPrimitivesStubPlugin()],
        test: {
          name: 'dom',
          include: ['tests/**/*.dom.spec.{ts,tsx}'],
          environment: 'happy-dom',
        },
      },
    ],
  },
})
