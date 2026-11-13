import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PLATFORM_MODULES } from '../build/web-platform.ts'

const LIB_DIR = resolve(import.meta.dirname, '../lib')
const PKG_PATH = resolve(import.meta.dirname, '../package.json')
const SRC_DIR = resolve(import.meta.dirname, '../src')

function collectSourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...collectSourceFiles(full))
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

function extractSyncRequires(code: string): string[] {
  return [
    ...new Set(
      [...code.matchAll(/(?<!\.)\brequire\((["'`])([^"'`]+)\1\)/g)].map((m) => m[2]!),
    ),
  ]
}

describe('Spike 1 & Dynamic Chunk Architecture: DSH bundle purity & <500 kB gate', () => {
  it('keeps main lib/client.js < 100 kB, wraps in __ModuleLoader__.load, and lazy-loads runtime via require.async', () => {
    const clientPath = resolve(LIB_DIR, 'client.js')
    const clientCode = readFileSync(clientPath, 'utf8')
    const clientBytes = statSync(clientPath).size

    // Hard target < 500 kB; cold-boot entry is ~46 kB!
    expect(clientBytes).toBeLessThan(100 * 1024)
    expect(clientCode.startsWith('window.__ModuleLoader__.load({')).toBe(true)
    expect(
      clientCode.includes('id: "dsh-genui-a2ui"') || clientCode.includes('id:`dsh-genui-a2ui`'),
    ).toBe(true)
    expect(/return module\.exports;\s*\}\s*\}\);/.test(clientCode)).toBe(true)
    expect(/require\.async\(["'`]\.\/client\.runtime\.js["'`]\)/.test(clientCode)).toBe(true)

    const syncRequires = extractSyncRequires(clientCode)
    expect(syncRequires.length).toBeGreaterThan(0)
    for (const req of syncRequires) {
      expect(PLATFORM_MODULES).toContain(req)
    }
    expect(syncRequires).not.toContain('zod')

    // Cordis strict service guard + official right-sidebar file jump injection
    expect(clientCode).toMatch(/["'`]slots["'`]/)
    expect(clientCode).toMatch(/["'`]sessions["'`]/)
    expect(clientCode).toMatch(/["'`]uiConversation["'`]/)
    expect(clientCode).toMatch(/["'`]sidebarRight["'`]/)

    // Heavy engines and Node globals must NEVER appear in main lib/client.js
    expect(clientCode).not.toContain('Buffer.byteLength')
    expect(clientCode).not.toContain('CandlestickChart')
    expect(clientCode).not.toContain('sequenceDiagram')
    expect(clientCode).not.toContain('ExpressLexer')

    const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf8')) as {
      files: string[]
      dsh: { client: { inject: string[] } }
    }
    expect(pkg.dsh.client.inject).toContain('@deepseek-ai/dsh-client-ui-sidebar-right')
    expect(pkg.files).toEqual(
      expect.arrayContaining([
        'lib/client.js',
        'lib/client.runtime.js',
        'lib/client.echarts.js',
        'lib/client.mermaid.js',
      ]),
    )
  })

  it('emits self-contained DSH chunks (client.runtime.js, client.echarts.js, client.mermaid.js) with zero relative sync requires', () => {
    for (const chunkName of ['client.runtime.js', 'client.echarts.js', 'client.mermaid.js']) {
      const chunkPath = resolve(LIB_DIR, chunkName)
      expect(existsSync(chunkPath)).toBe(true)
      const code = readFileSync(chunkPath, 'utf8')
      expect(
        code.startsWith(
          `window.__ModuleLoader__.load({ id: "dsh-genui-a2ui", chunk: ${JSON.stringify(chunkName)}, factory: (require) => {`,
        ),
      ).toBe(true)
      expect(code).toMatch(/return module\.exports;\s*\}\s*\}\);/)

      const syncRequires = extractSyncRequires(code)
      for (const req of syncRequires) {
        // Every synchronous require() inside a chunk MUST hit the shell's frozen PLATFORM_MODULES table;
        // never a relative `./client.*.js` edge or Node built-in (`crypto`, `fs`, `path`).
        expect(req.startsWith('.')).toBe(false)
        expect(PLATFORM_MODULES).toContain(req)
      }
    }

    const runtimeCode = readFileSync(resolve(LIB_DIR, 'client.runtime.js'), 'utf8')
    expect(/require\.async\(["'`]\.\/client\.echarts\.js["'`]\)/.test(runtimeCode)).toBe(true)
    expect(/require\.async\(["'`]\.\/client\.mermaid\.js["'`]\)/.test(runtimeCode)).toBe(true)
    expect(runtimeCode.includes('CandlestickChart')).toBe(false)
  })

  it('enforces unidirectional shared <- client / shared <- host module boundaries (zero client->host imports)', () => {
    const clientAndSharedFiles = [
      ...collectSourceFiles(join(SRC_DIR, 'client')),
      ...collectSourceFiles(join(SRC_DIR, 'shared')),
    ]
    expect(clientAndSharedFiles.length).toBeGreaterThan(15)
    for (const filePath of clientAndSharedFiles) {
      const src = readFileSync(filePath, 'utf8')
      expect(src, `${filePath} must not import from src/host/`).not.toMatch(
        /from\s+['"](?:\.\.\/)+host\//,
      )
    }
  })

  it(
    'loads lib/index.js cleanly in Node ESM and registers tools, skill, and RPC commands',
    async () => {
      const libHref = new URL('../lib/index.js', import.meta.url).href
      const hostMod = (await import(libHref)) as typeof import('../src/index.ts')
      expect(hostMod.name).toBe('dsh-genui-a2ui')
      expect(typeof hostMod.apply).toBe('function')

      const registeredTools: string[] = []
      const registeredCommands: string[] = []
      let registeredSkill: { name: string; content: string } | undefined

      const fakeCtx = {
        inject(_deps: string[], fn: (inner: unknown) => void) {
          fn({
            tools: {
              register: (def: { name: string }) => {
                registeredTools.push(def.name)
                return () => {}
              },
            },
            skills: {
              register: (sk: { name: string; content: string }) => {
                registeredSkill = sk
                return () => {}
              },
            },
            commands: {
              register: (cmd: { name: string }) => {
                registeredCommands.push(cmd.name)
                return () => {}
              },
            },
            effect: (cb: () => () => void) => cb(),
          })
        },
        on() {
          return () => {}
        },
      }

      hostMod.apply(fakeCtx as never)
      expect(registeredTools).toEqual(['a2ui_render', 'a2ui_ask'])
      expect(registeredCommands).toEqual(['a2ui', 'a2ui-answer'])
      expect(registeredSkill?.name).toBe('a2ui')
      expect(registeredSkill?.content).toContain('a2ui_render')
      expect(registeredSkill?.content).toContain('a2ui_ask')
      expect(registeredSkill?.content).toContain('Mermaid(')
      expect(registeredSkill?.content).toContain('Accordion(')
      expect(registeredSkill?.content).toContain('JsonTree(')
      expect(registeredSkill?.content).toContain('FileTree(')
    },
    15_000,
  )

  it('keeps every locale/*.json detail markdown clean, HTML-free, and fully packaged in package.json files', () => {
    const rootDir = resolve(import.meta.dirname, '..')
    const localeDir = join(rootDir, 'locale')
    const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf8')) as { files: string[] }
    const localeFiles = readdirSync(localeDir).filter((f) => f.endsWith('.json'))
    expect(localeFiles.length).toBeGreaterThanOrEqual(3)

    for (const localeFile of localeFiles) {
      const parsed = JSON.parse(readFileSync(join(localeDir, localeFile), 'utf8')) as {
        meta?: { title?: string; description?: string; detail?: string }
      }
      const expectedTitle = localeFile.startsWith('zh') ? 'A2UI 生成式交互界面' : 'A2UI generative UI'
      expect(parsed.meta?.title).toBe(expectedTitle)
      expect(parsed.meta?.description?.length).toBeGreaterThan(20)
      const detail = parsed.meta?.detail
      expect(typeof detail).toBe('string')
      const detailPath = join(rootDir, detail!)
      expect(existsSync(detailPath)).toBe(true)
      expect(pkg.files).toContain(detail)

      const detailMd = readFileSync(detailPath, 'utf8')
      expect(detailMd).not.toMatch(/<\/?(?:details|summary)\b/i)
      expect(detailMd).not.toContain('img.shields.io')

      for (const imgMatch of detailMd.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
        const rawTarget = imgMatch[1]!
        expect(rawTarget.startsWith('http')).toBe(false)
        const resolvedImg = resolve(join(detailPath, '..'), rawTarget)
        expect(existsSync(resolvedImg)).toBe(true)
        const relImg = resolvedImg.slice(rootDir.length + 1).replace(/\\/g, '/')
        expect(pkg.files).toContain(relImg)
      }
    }
  })
})
