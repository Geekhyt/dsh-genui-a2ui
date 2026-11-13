/**
 * tsdown preset for a DSH UI plugin:
 * - Node half (`lib/index.js`, ESM)
 * - Main browser entry (`lib/client.js`, `< 50 kB`, gated `< 500 kB`)
 * - Self-contained package-local browser chunks (`lib/client.runtime.js`,
 *   `lib/client.echarts.js`, `lib/client.mermaid.js`) loaded on demand through
 *   DSH's official `require.async("./client.<name>.js")` protocol
 *   (`window.__ModuleLoader__.load({ id, chunk, factory })`).
 *
 * - Platform modules (react, cordis, ui-slots, ui-primitives, …) stay external
 *   and resolve from the shell's frozen module table;
 * - Heavy engines (`@a2ui/*`, `echarts`, `mermaid`) are forbidden in `lib/client.js`
 *   and isolated in their dedicated self-contained chunks so zero relative sync
 *   `require("./client.*.js")` edges can ever form between chunks;
 * - CSS (global + `*.module.css`) is compiled by lightningcss and injected as a
 *   `<style data-plugin>` tag that the loader removes on unload.
 */
import { readFile, utimes } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { builtinModules, createRequire } from 'node:module'
import type { UserConfig } from 'tsdown'
import { transform } from 'lightningcss'
import { PLATFORM_MODULES } from './web-platform.ts'

const CSS_VIRTUAL_PREFIX = '\0dsh-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'
const NODE_STUB_ID = '\0dsh-node-empty'

const NODE_BUILTINS = new Set([
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
])

/** Wire/type layers a client bundle may inline (no shared runtime identity). */
const INLINE_SAFE = /^@deepseek-ai\/dsh-(host-apiproxy|session|llm|tools|brand)(\/|$)/

/** Visualization engines forbidden outside their dedicated lazy chunks. */
const HEAVY_VIZ_ONLY = /^(echarts|zrender|mermaid|dagre-d3-es|cytoscape|katex)(\/|$)/

/** Heavy A2UI / parser runtimes forbidden in the cold-boot `lib/client.js` entry. */
const RUNTIME_CHUNK_ONLY = /^(@a2ui\/(web_core|react|agent)|antlr4ng|@tanstack\/react-table|react-aria-components)(\/|$)/

const MAX_MAIN_CLIENT_BYTES = 500 * 1024

const localRequire = createRequire(import.meta.url)
const UUID_BROWSER_ENTRY = resolve(
  dirname(localRequire.resolve('uuid/package.json')),
  'dist/esm-browser/index.js',
)

export const CLIENT_EXTERNALS: readonly string[] = [...PLATFORM_MODULES]

const NODE_ENV = JSON.stringify(process.env.NODE_ENV ?? 'production')

export interface PluginBuildOptions {
  /** Extra Node-side externals (cordis + node built-ins are always external). */
  readonly libExternal?: readonly (string | RegExp)[]
}

/** Build host ESM, self-contained lazy client chunks, and main client entry. */
export function pluginBuild(id: string, options: PluginBuildOptions = {}): UserConfig[] {
  return [
    hostConfig(id, options.libExternal ?? []),
    clientChunkConfig(id, 'client.runtime.js', 'src/client/chunks/runtime-chunk.ts', true),
    clientChunkConfig(id, 'client.echarts.js', 'src/client/chunks/echarts-chunk.ts', false),
    clientChunkConfig(id, 'client.mermaid.js', 'src/client/chunks/mermaid-chunk.ts', false),
    clientConfig(id),
  ]
}

function hostConfig(id: string, extraExternal: readonly (string | RegExp)[]): UserConfig {
  return {
    name: id,
    entry: ['src/index.ts'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    minify: true,
    clean: false,
    deps: {
      onlyBundle: false,
      neverBundle: ['@deepseek-ai/cordis', ...NODE_BUILTINS, ...extraExternal],
      alwaysBundle: (dep: string) => {
        if (dep === '@deepseek-ai/cordis' || dep.startsWith('@deepseek-ai/')) return false
        if (NODE_BUILTINS.has(dep)) return false
        return true
      },
    },
  }
}

function sharedBrowserPlugins(
  id: string,
  options: { readonly forbidVizEngines: boolean; readonly forbidA2uiRuntime: boolean },
) {
  return [
    {
      // Force browser-native Web Crypto UUID (`uuid/dist/esm-browser/index.js`) and stub
      // unreachable Node built-ins (`@a2ui/agent` barrel re-exports `FileSystemCatalogProvider`).
      name: 'dsh-client-node-stub',
      resolveId(source: string, importer?: string) {
        if (source === 'uuid') return UUID_BROWSER_ENTRY
        if (NODE_BUILTINS.has(source)) return NODE_STUB_ID
        if (importer?.endsWith('chunk-loader.ts') && source.startsWith('./chunks/')) {
          return NODE_STUB_ID
        }
        return null
      },
      load(modId: string) {
        if (modId === NODE_STUB_ID) {
          return [
            'export default {};',
            'export const readFileSync = undefined, writeFileSync = undefined, existsSync = undefined;',
            'export const readdirSync = undefined, statSync = undefined, realpathSync = undefined;',
            'export const mkdirSync = undefined, rmSync = undefined;',
            'export const join = undefined, resolve = undefined, dirname = undefined, basename = undefined, extname = undefined;',
            'export const sep = "/", posix = {}, win32 = {};',
          ].join('\n')
        }
        return null
      },
    },
    {
      // Cross-plugin value imports either duplicate a runtime instance or ask
      // the module table for something it cannot answer: fail the build.
      name: 'dsh-client-bundle-purity',
      resolveId(source: string) {
        if (options.forbidVizEngines && HEAVY_VIZ_ONLY.test(source)) {
          throw new Error(
            `client bundle size gate: "${source}" must stay in its lazy client.<name>.js chunk`,
          )
        }
        if (options.forbidA2uiRuntime && RUNTIME_CHUNK_ONLY.test(source)) {
          throw new Error(
            `client bundle size gate: "${source}" must stay in lazy client.runtime.js, never in main lib/client.js`,
          )
        }
        if (!source.startsWith('@deepseek-ai/')) return null
        if (CLIENT_EXTERNALS.includes(source)) return null
        if (INLINE_SAFE.test(source)) return null
        throw new Error(
          `client bundle purity: "${source}" is not a DSH platform module; use cordis services or type-only imports`,
        )
      },
    },
    cssInlinePlugin(id),
  ]
}

function clientChunkConfig(
  id: string,
  chunkFileName: string,
  entryPath: string,
  forbidVizEngines: boolean,
): UserConfig {
  const enableSourcemap = process.env.A2UI_SOURCEMAP === '1'
  return {
    name: `${id}/${chunkFileName}`,
    entry: { chunk: entryPath },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    dts: false,
    minify: true,
    sourcemap: enableSourcemap,
    clean: false,
    deps: {
      onlyBundle: false,
      neverBundle: [...CLIENT_EXTERNALS],
      alwaysBundle: (dep: string) => !CLIENT_EXTERNALS.includes(dep),
    },
    define: {
      'process.env.NODE_ENV': NODE_ENV,
      'import.meta.env.MODE': NODE_ENV,
      'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
      '__DSH_BUNDLED_CLIENT__': 'true',
    },
    plugins: [
      ...sharedBrowserPlugins(id, { forbidVizEngines, forbidA2uiRuntime: false }),
      {
        name: `dsh-client-chunk-wrap:${chunkFileName}`,
        generateBundle(
          _options: unknown,
          bundle: Record<string, { type?: string; fileName?: string; code?: string }>,
        ) {
          for (const item of Object.values(bundle)) {
            if (item.type === 'chunk' && item.fileName === chunkFileName && typeof item.code === 'string') {
              item.code = [
                `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, chunk: ${JSON.stringify(chunkFileName)}, factory: (require) => {`,
                'var module = { exports: {} }; var exports = module.exports;',
                item.code.trim(),
                'return module.exports; } });',
              ].join('\n')
            } else if (item.type === 'chunk') {
              throw new Error(
                `client chunk "${chunkFileName}" emitted unexpected split sub-chunk "${item.fileName}"; DSH chunks must be 100% self-contained`,
              )
            }
          }
        },
        async writeBundle() {
          // Ensure main `lib/client.js` mtime advances if a chunk rebuilds after it.
          const mainEntry = resolve('lib/client.js')
          if (existsSync(mainEntry)) {
            const now = new Date()
            await utimes(mainEntry, now, now).catch(() => {})
          }
        },
      },
    ],
    outputOptions: {
      entryFileNames: chunkFileName,
      codeSplitting: false,
    },
  }
}

function clientConfig(id: string): UserConfig {
  const enableSourcemap = process.env.A2UI_SOURCEMAP === '1'
  return {
    name: `${id}/client`,
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    dts: false,
    minify: true,
    sourcemap: enableSourcemap,
    clean: false,
    deps: {
      onlyBundle: false,
      neverBundle: [...CLIENT_EXTERNALS],
      alwaysBundle: (dep: string) => !CLIENT_EXTERNALS.includes(dep),
    },
    define: {
      'process.env.NODE_ENV': NODE_ENV,
      'import.meta.env.MODE': NODE_ENV,
      'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
      '__DSH_BUNDLED_CLIENT__': 'true',
    },
    plugins: [
      ...sharedBrowserPlugins(id, { forbidVizEngines: true, forbidA2uiRuntime: true }),
      {
        name: 'dsh-client-module-loader-wrap',
        generateBundle(
          _options: unknown,
          bundle: Record<string, { type?: string; fileName?: string; code?: string }>,
        ) {
          for (const item of Object.values(bundle)) {
            if (item.type === 'chunk' && item.fileName === 'client.js' && typeof item.code === 'string') {
              item.code = [
                `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`,
                'var module = { exports: {} }; var exports = module.exports;',
                item.code.trim(),
                'return module.exports; } });',
              ].join('\n')
              const bytes = Buffer.byteLength(item.code, 'utf8')
              if (bytes >= MAX_MAIN_CLIENT_BYTES) {
                throw new Error(
                  `client bundle size gate: lib/client.js is ${bytes} bytes (>= ${MAX_MAIN_CLIENT_BYTES} bytes limit)`,
                )
              }
            } else if (item.type === 'chunk') {
              throw new Error(
                `client entry emitted unexpected unsplit chunk "${item.fileName}"; lazy chunks must load via require.async("./client.<name>.js")`,
              )
            }
          }
        },
      },
    ],
    outputOptions: {
      entryFileNames: 'client.js',
      codeSplitting: false,
    },
  }
}

function resolveCssFile(specifier: string, importer: string | undefined): string | undefined {
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    if (importer === undefined) return specifier
    return new URL(specifier, `file://${importer}`).pathname
  }
  try {
    return createRequire(importer !== undefined && existsSync(importer) ? importer : import.meta.url).resolve(specifier)
  } catch {
    return undefined
  }
}

function cssInlinePlugin(id: string) {
  const files = new Map<string, string>()
  return {
    name: 'dsh-css-inline',
    resolveId(source: string, importer: string | undefined) {
      const specifier = source.split('?')[0] ?? source
      if (!specifier.endsWith('.css')) return null
      const abs = resolveCssFile(specifier, importer)
      if (abs === undefined) return null
      const kind = specifier.endsWith('.module.css') ? 'module' : 'global'
      const virtualId = `${CSS_VIRTUAL_PREFIX}${kind}:${abs}${CSS_VIRTUAL_SUFFIX}`
      files.set(virtualId, abs)
      return virtualId
    },
    async load(virtualId: string) {
      if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
      const rest = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
      const isModule = rest.startsWith('module:')
      const file = files.get(virtualId) ?? rest.slice(isModule ? 7 : 7)
      ;(this as unknown as { addWatchFile(f: string): void }).addWatchFile(file)
      const { code, exports } = transform({
        filename: file,
        code: await readFile(file),
        cssModules: isModule ? { pattern: 'a2ui_[hash]_[local]' } : undefined,
        minify: true,
      })
      const classMap: Record<string, string> = {}
      for (const [local, exp] of Object.entries(exports ?? {}).sort(([a], [b]) => (a < b ? -1 : 1))) classMap[local] = exp.name
      const tagId = `${id}/${file.split('/').slice(-2).join('/')}`
      return [
        `const css = ${JSON.stringify(code.toString())};`,
        `const tagId = ${JSON.stringify(tagId)};`,
        "if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {",
        "  const tag = document.createElement('style');",
        `  tag.dataset.plugin = ${JSON.stringify(id)};`,
        '  tag.dataset.pluginCss = tagId;',
        '  tag.textContent = css;',
        '  document.head.appendChild(tag);',
        '}',
        `export default ${JSON.stringify(classMap)};`,
      ].join('\n')
    },
  }
}
