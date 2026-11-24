import { existsSync, readFileSync } from 'node:fs'
import { readFile, utimes } from 'node:fs/promises'
import { builtinModules, createRequire } from 'node:module'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { transform } from 'lightningcss'
import type { UserConfig } from 'tsdown'
import { PLATFORM_MODULES } from './web-platform.ts'

const CSS_VIRTUAL_PREFIX = '\0dsh-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'
const NODE_STUB_ID = '\0dsh-node-empty'

const NODE_BUILTINS = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)])

const INLINE_SAFE = /^@deepseek-ai\/dsh-(host-apiproxy|session|llm|tools|brand)(\/|$)/

const HEAVY_VIZ_ONLY = /^(echarts|zrender|mermaid|dagre-d3-es|cytoscape|katex)(\/|$)/

const RUNTIME_CHUNK_ONLY =
  /^(@a2ui\/(web_core|react|agent)|antlr4ng|@tanstack\/react-table|react-aria-components)(\/|$)/

const MAX_MAIN_CLIENT_BYTES = 100 * 1024

interface BundleBudgetFile {
  readonly gzipLevel?: number
  readonly chunks?: Readonly<
    Record<string, { readonly maxRawBytes: number; readonly maxGzipBytes: number }>
  >
}

const BUNDLE_BUDGET_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../.bundle-budget.json',
)
const BUNDLE_BUDGET: BundleBudgetFile | null = existsSync(BUNDLE_BUDGET_PATH)
  ? (JSON.parse(readFileSync(BUNDLE_BUDGET_PATH, 'utf8')) as BundleBudgetFile)
  : null

function assertChunkBudget(relFile: string, code: string): void {
  if (BUILD_MODE !== 'production') return
  const buf = Buffer.from(code, 'utf8')
  const rawBytes = buf.length
  if (relFile === 'lib/client.js' && rawBytes >= MAX_MAIN_CLIENT_BYTES) {
    throw new Error(
      `client bundle size gate: lib/client.js is ${rawBytes} bytes (>= ${MAX_MAIN_CLIENT_BYTES} bytes limit)`,
    )
  }
  const limit = BUNDLE_BUDGET?.chunks?.[relFile]
  if (!limit) return
  const gzipLevel = BUNDLE_BUDGET?.gzipLevel ?? 9
  const gzipBytes = gzipSync(buf, { level: gzipLevel }).length
  if (rawBytes > limit.maxRawBytes) {
    throw new Error(
      `bundle budget gate: ${relFile} raw ${rawBytes} B > ${limit.maxRawBytes} B (.bundle-budget.json)`,
    )
  }
  if (gzipBytes > limit.maxGzipBytes) {
    throw new Error(
      `bundle budget gate: ${relFile} gzip ${gzipBytes} B > ${limit.maxGzipBytes} B (.bundle-budget.json)`,
    )
  }
}

const localRequire = createRequire(import.meta.url)
const uuidPkgDir = dirname(localRequire.resolve('uuid/package.json'))
const UUID_BROWSER_ENTRY = existsSync(resolve(uuidPkgDir, 'dist/esm-browser/index.js'))
  ? resolve(uuidPkgDir, 'dist/esm-browser/index.js')
  : resolve(uuidPkgDir, 'dist/index.js')

export const CLIENT_EXTERNALS: readonly string[] = [...PLATFORM_MODULES]

const BUILD_MODE = process.env.A2UI_DEV_BUILD === '1' ? 'development' : 'production'
const NODE_ENV = JSON.stringify(BUILD_MODE)

function browserChunkInputOptions(): NonNullable<UserConfig['inputOptions']> {
  return {
    platform: 'browser',
    onLog(level, log, defaultHandler) {
      if (
        log.code === 'MODULE_LEVEL_DIRECTIVE' &&
        typeof log.message === 'string' &&
        log.message.includes('use client')
      ) {
        return
      }
      defaultHandler(level, log)
    },
  }
}

export interface PluginBuildOptions {
  readonly libExternal?: readonly (string | RegExp)[]
}

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
    plugins: [
      {
        name: 'dsh-host-bundle-budget',
        generateBundle(
          _options: unknown,
          bundle: Record<string, { type?: string; fileName?: string; code?: string }>,
        ) {
          for (const item of Object.values(bundle)) {
            if (
              item.type === 'chunk' &&
              item.fileName === 'index.js' &&
              typeof item.code === 'string'
            ) {
              assertChunkBudget('lib/index.js', item.code)
            }
          }
        },
      },
    ],
  }
}

function sharedBrowserPlugins(
  id: string,
  options: { readonly forbidVizEngines: boolean; readonly forbidA2uiRuntime: boolean },
) {
  return [
    {
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
      'import.meta.env': JSON.stringify({ MODE: BUILD_MODE }),
      __DSH_BUNDLED_CLIENT__: 'true',
    },
    inputOptions: browserChunkInputOptions(),
    plugins: [
      ...sharedBrowserPlugins(id, { forbidVizEngines, forbidA2uiRuntime: false }),
      {
        name: `dsh-client-chunk-wrap:${chunkFileName}`,
        generateBundle(
          _options: unknown,
          bundle: Record<string, { type?: string; fileName?: string; code?: string }>,
        ) {
          for (const item of Object.values(bundle)) {
            if (
              item.type === 'chunk' &&
              item.fileName === chunkFileName &&
              typeof item.code === 'string'
            ) {
              item.code = [
                `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, chunk: ${JSON.stringify(chunkFileName)}, factory: (require) => {`,
                'var module = { exports: {} }; var exports = module.exports;',
                item.code.trim(),
                'return module.exports; } });',
              ].join('\n')
              assertChunkBudget(`lib/${chunkFileName}`, item.code)
            } else if (item.type === 'chunk') {
              throw new Error(
                `client chunk "${chunkFileName}" emitted unexpected split sub-chunk "${item.fileName}"; DSH chunks must be 100% self-contained`,
              )
            }
          }
        },
        async writeBundle() {
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
      'import.meta.env': JSON.stringify({ MODE: BUILD_MODE }),
      __DSH_BUNDLED_CLIENT__: 'true',
    },
    inputOptions: browserChunkInputOptions(),
    plugins: [
      ...sharedBrowserPlugins(id, { forbidVizEngines: true, forbidA2uiRuntime: true }),
      {
        name: 'dsh-client-module-loader-wrap',
        generateBundle(
          _options: unknown,
          bundle: Record<string, { type?: string; fileName?: string; code?: string }>,
        ) {
          for (const item of Object.values(bundle)) {
            if (
              item.type === 'chunk' &&
              item.fileName === 'client.js' &&
              typeof item.code === 'string'
            ) {
              item.code = [
                `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`,
                'var module = { exports: {} }; var exports = module.exports;',
                item.code.trim(),
                'return module.exports; } });',
              ].join('\n')
              assertChunkBudget('lib/client.js', item.code)
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
  if (specifier.startsWith('.') || isAbsolute(specifier)) {
    if (importer === undefined) return specifier
    const cleanImporter = importer.startsWith('file://')
      ? fileURLToPath(importer)
      : (importer.split('?')[0] ?? importer)
    return resolve(dirname(cleanImporter), specifier)
  }
  try {
    return createRequire(
      importer !== undefined && existsSync(importer) ? importer : import.meta.url,
    ).resolve(specifier)
  } catch {
    return undefined
  }
}

const LOCAL_CSS_IMPORT_RE = /^@import\s+['"](\.[^'"]+\.css)['"]\s*;\s*$/

async function readExpandedCssSource(
  filePath: string,
  addWatchFile: (f: string) => void,
  seen = new Set<string>(),
): Promise<string> {
  const abs = resolve(filePath)
  if (seen.has(abs)) return ''
  seen.add(abs)
  addWatchFile(abs)
  const raw = await readFile(abs, 'utf8')
  const parts: string[] = []
  for (const line of raw.split('\n')) {
    const match = LOCAL_CSS_IMPORT_RE.exec(line.trim())
    if (match?.[1]) {
      const target = resolve(dirname(abs), match[1])
      parts.push(await readExpandedCssSource(target, addWatchFile, seen))
    } else {
      parts.push(line)
    }
  }
  return parts.join('\n')
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
      const addWatch = (f: string) => {
        ;(this as unknown as { addWatchFile(dep: string): void }).addWatchFile(f)
      }
      const expandedCss = await readExpandedCssSource(file, addWatch)
      const { code, exports } = transform({
        filename: file,
        code: Buffer.from(expandedCss, 'utf8'),
        cssModules: isModule ? { pattern: 'a2ui_[hash]_[local]' } : undefined,
        minify: true,
      })
      const classMap: Record<string, string> = {}
      for (const [local, exp] of Object.entries(exports ?? {}).sort(([a], [b]) => (a < b ? -1 : 1)))
        classMap[local] = exp.name
      const normalizedFile = file.replace(/\\/g, '/')
      const tagId = `${id}/${normalizedFile.split('/').slice(-2).join('/')}`
      const regKey = `__dshPluginCss__:${id}`
      return [
        `const css = ${JSON.stringify(code.toString())};`,
        `const tagId = ${JSON.stringify(tagId)};`,
        `const regKey = ${JSON.stringify(regKey)};`,
        'const reg = globalThis[regKey] || (globalThis[regKey] = { mounted: true, sheets: new Map() });',
        'reg.sheets.set(tagId, css);',
        "if (reg.mounted && typeof document !== 'undefined' && document.head && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {",
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
