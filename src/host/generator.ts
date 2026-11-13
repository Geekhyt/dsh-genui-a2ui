/**
 * A2UI generation core for the host half: catalog, the tool-channel Express
 * prompt, safety limits, on/off switch state, and per-session renderer state.
 *
 * The model never writes `<a2ui>` blocks into its reply. It passes the A2UI
 * Express program as the `ui` argument of `a2ui_render` or `a2ui_ask`; the host
 * compiles and validates it with the official SDK against the session's
 * RendererState, so `surface("id", update=true)` updates an earlier surface in place.
 */
import {
  A2uiError,
  A2uiGenerator,
  CatalogConfig,
  ExpressFormatFactory,
  ExpressPromptGenerator,
  type A2uiRequestProcessor,
  type AgentToRendererMessage,
  type InferenceFormat,
  type InferenceFormatFactory,
  type RendererState,
} from '@a2ui/agent'

type SchemaCatalogInput = ConstructorParameters<typeof CatalogConfig>[0]
import {
  A2UI_LIMITS,
  ASK_TOOL,
  dshSchemaCatalog,
  RENDER_TOOL,
} from '../shared/catalog-schema.ts'
import { validateCalcExpression } from '../shared/calc-engine.ts'

export { ASK_TOOL, RENDER_TOOL }

/**
 * The SDK's Express output contract tells the model to wrap blocks in
 * `<a2ui>` sentinel tags inside its reply. In this host the program travels as
 * a tool argument instead, so that one paragraph is swapped for the tool
 * contract. `tests/prompt.spec.ts` fails if an SDK upgrade changes the
 * paragraph, so the swap can never silently stop applying.
 */
export const SENTINEL_PARAGRAPH = /IMPORTANT: You MUST always surround the entire A2UI Express block with the literal sentinel tags[^\n]*\n/

export const TOOL_CONTRACT = [
  `IMPORTANT: In this host you never write A2UI Express into your reply text. Pass the whole Express program as the \`ui\` argument of \`${RENDER_TOOL}\` (display / dashboard / workspace dock) or \`${ASK_TOOL}\` (suspend the turn and wait for user submission), without \`<a2ui>\` tags and without markdown fences.`,
  `The tool compiles and validates the program. When it returns an error, fix the program and call the tool again; after a successful call, do not restate the UI in prose.`,
  '',
].join('\n')

/** Express prompt generator with the tool-channel output contract. */
class ToolChannelPromptGenerator extends ExpressPromptGenerator {
  override generateBaseRules(): string {
    const base = super.generateBaseRules()
    const swapped = base.replace(SENTINEL_PARAGRAPH, TOOL_CONTRACT)
    return swapped === base ? `${TOOL_CONTRACT}\n${base}` : swapped
  }
}

/** Express everywhere, except the prompt speaks about the tool argument. */
class ToolChannelFormatFactory implements InferenceFormatFactory {
  private readonly inner = new ExpressFormatFactory()
  createFormat(
    catalogs: Parameters<InferenceFormatFactory['createFormat']>[0],
    examples?: Parameters<InferenceFormatFactory['createFormat']>[1],
  ): InferenceFormat {
    const format = this.inner.createFormat(catalogs, examples)
    const promptGenerator = new ToolChannelPromptGenerator(catalogs, examples as never)
    return { promptGenerator, createParser: () => format.createParser() }
  }
}

const PLURALIZE_VERBOSE_BLOCK = /• pluralize\([^\n]*\n(?: {2}- [^\n]*\n)+/

const COMPACT_PLURALIZE = [
  '• pluralize(value, other, one?, zero?)',
  '  - Description: Selects a string based on the count (`value`), falling back to `other`.',
  '',
].join('\n')

function extractUpdateSurfaceIds(cleanedUi: string): string[] {
  const ids: string[] = []
  const re = /\bsurface\(\s*"([^"]+)"[^)]*\bupdate\s*=\s*true/g
  let match: RegExpExecArray | null
  while ((match = re.exec(cleanedUi)) !== null) {
    if (match[1]) ids.push(match[1])
  }
  return ids
}

const DEFAULT_CATALOGS: readonly SchemaCatalogInput[] = [dshSchemaCatalog]

const CAPABILITIES = {
  '1.0': { supportedCatalogIds: DEFAULT_CATALOGS.map((c) => c.id) },
}

/** Agent-lifetime generator backed by the 32-component DSH catalog. */
export function createGenerator(
  catalogs: readonly SchemaCatalogInput[] = DEFAULT_CATALOGS,
): A2uiGenerator {
  return new A2uiGenerator(
    catalogs.map((c) => new CatalogConfig(c)),
    undefined,
    new ToolChannelFormatFactory(),
  )
}

function findExpressionInDataModel(node: unknown, currentPath = ''): string | null {
  if (typeof node !== 'object' || node === null) return null
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const hit = findExpressionInDataModel(node[i], `${currentPath}/${i}`)
      if (hit) return hit
    }
    return null
  }
  const rec = node as Record<string, unknown>
  if ('@call' in rec || '@path' in rec) {
    return currentPath || '/'
  }
  for (const [k, v] of Object.entries(rec)) {
    const hit = findExpressionInDataModel(v, `${currentPath}/${k}`)
    if (hit) return hit
  }
  return null
}

function validateCalcCallsInNode(node: unknown): void {
  if (typeof node !== 'object' || node === null) return
  if (Array.isArray(node)) {
    for (const item of node) validateCalcCallsInNode(item)
    return
  }
  const rec = node as Record<string, unknown>
  const callName = rec['@call'] ?? rec.call
  if (callName === 'calc' && typeof rec.args === 'object' && rec.args !== null) {
    const args = rec.args as Record<string, unknown>
    if (typeof args.expr === 'string') {
      let providedVars: ReadonlySet<string> | undefined
      const rawVars = args.vars
      if (rawVars === undefined || rawVars === null) {
        providedVars = new Set<string>()
      } else if (typeof rawVars === 'object' && !Array.isArray(rawVars)) {
        const varsRec = rawVars as Record<string, unknown>
        // Skip static key check only if `vars` itself is a dynamic $/path or @call expression
        if (!('@path' in varsRec) && !('path' in varsRec) && !('@call' in varsRec) && !('call' in varsRec)) {
          providedVars = new Set<string>(Object.keys(varsRec))
        }
      }
      const err = validateCalcExpression(args.expr, providedVars)
      if (err !== null) {
        throw new A2uiError(`Invalid calc() formula "${args.expr}": ${err}`, 'VALIDATION_ERROR')
      }
    }
  }
  for (const val of Object.values(rec)) {
    validateCalcCallsInNode(val)
  }
}

const PRUNED_MATH_FN_RE =
  /Function '(add|sub|mul|div|pow|sqrt|exp|log|abs|min|max|clamp|round|neq|gte|lte)' is not defined/i

function enrichCompilerError(err: unknown): never {
  if (err instanceof Error) {
    if (/functionCall depth >/i.test(err.message)) {
      throw new A2uiError(
        `${err.message}. Tip: A2UI limits nested function call depth to 5; collapse math into a single \`calc("p * r * (1 + r)^n / ((1 + r)^n - 1)", { p: $/p, r: $/r, n: $/n }, decimals=2)\` call.`,
        'VALIDATION_ERROR',
      )
    }
    if (PRUNED_MATH_FN_RE.test(err.message)) {
      throw new A2uiError(
        `${err.message} Tip: Arithmetic & rounding are unified in \`calc(expr, vars?, decimals?)\`, e.g. \`calc("a * b", { a: $/a, b: $/b }, decimals=2)\`; for comparisons use \`eq\`, \`gt\`, \`lt\`, or \`not(...)\`.`,
        'VALIDATION_ERROR',
      )
    }
  }
  throw err
}

function validateCompiledLimits(messages: readonly AgentToRendererMessage[]): void {
  const surfaceIds = new Set<string>()
  const componentCounts = new Map<string, number>()
  let dataBytes = 0

  for (const msg of messages) {
    const rec = msg as unknown as Record<string, unknown>
    for (const [kind, payload] of Object.entries(rec)) {
      if (typeof payload !== 'object' || payload === null) continue
      const p = payload as Record<string, unknown>
      const sid = typeof p.surfaceId === 'string' ? p.surfaceId : undefined
      if (sid) surfaceIds.add(sid)

      if ((kind === 'createSurface' || kind === 'updateComponents') && Array.isArray(p.components)) {
        const key = sid ?? '_default'
        const nextCount = (componentCounts.get(key) ?? 0) + p.components.length
        if (nextCount > A2UI_LIMITS.maxComponentsPerSurface) {
          throw new A2uiError(
            `Surface "${key}" exceeds maximum component limit (${nextCount} > ${A2UI_LIMITS.maxComponentsPerSurface}). Use Table(...) or Chart(...) instead of manually instantiating hundreds of components.`,
            'VALIDATION_ERROR',
          )
        }
        componentCounts.set(key, nextCount)
        validateCalcCallsInNode(p.components)
      }

      if (kind === 'createSurface' && p.dataModel !== undefined) {
        const badPath = findExpressionInDataModel(p.dataModel)
        if (badPath !== null) {
          const varName = badPath.replace(/^\/+/, '').replace(/\//g, '_') || 'calc_val'
          throw new A2uiError(
            `Data path "$${badPath}" cannot store a reactive expression (\`$${badPath} = fn(...)\`). Store literal initial values in \`$/paths\` (e.g. \`$/v = 100\`), and assign reusable reactive formulas to local variables WITHOUT \`$/\` (e.g. \`${varName} = calc("v * 0.5", { v: $/v })\`, then pass \`${varName}\` directly to Stat, Progress, KeyValue, Chart, etc.).`,
            'VALIDATION_ERROR',
          )
        }
        dataBytes += Buffer.byteLength(JSON.stringify(p.dataModel), 'utf8')
      } else if (kind === 'updateDataModel' && p.value !== undefined) {
        const badPath = findExpressionInDataModel(p.value, typeof p.path === 'string' ? p.path : '')
        if (badPath !== null) {
          const varName = badPath.replace(/^\/+/, '').replace(/\//g, '_') || 'calc_val'
          throw new A2uiError(
            `Data path "$${badPath}" cannot store a reactive expression. Store literal data in \`$/paths\`, and assign reactive formulas to local variables WITHOUT \`$/\` (e.g. \`${varName} = calc("v * 0.5", { v: $/v })\`).`,
            'VALIDATION_ERROR',
          )
        }
        dataBytes += Buffer.byteLength(JSON.stringify(p.value), 'utf8')
      }
    }
  }

  if (surfaceIds.size > A2UI_LIMITS.maxSurfacesPerCall) {
    throw new A2uiError(
      `Too many surfaces in a single call (${surfaceIds.size} > ${A2UI_LIMITS.maxSurfacesPerCall}). Consolidate related sections into Tabs or Cards inside one surface.`,
      'VALIDATION_ERROR',
    )
  }

  if (dataBytes > A2UI_LIMITS.maxDataModelBytes) {
    throw new A2uiError(
      `Surface data model payload is too large (${dataBytes} bytes > ${A2UI_LIMITS.maxDataModelBytes} bytes). Summarize or paginate large datasets before rendering.`,
      'VALIDATION_ERROR',
    )
  }
}

/** Session-scoped renderer state & on/off switch controller. */
export class SurfaceSessions {
  private readonly states = new Map<string, RendererState>()
  private readonly enabledBySession = new Map<string, boolean>()
  private readonly failuresBySession = new Map<string, { render: number; ask: number }>()
  private defaultEnabled: boolean

  constructor(
    private readonly generator: A2uiGenerator = createGenerator(DEFAULT_CATALOGS),
    initialEnabled = true,
  ) {
    this.defaultEnabled = initialEnabled
  }

  /** Whether A2UI tools are enabled for `sessionId` (falls back to `defaultEnabled`). */
  isEnabled(sessionId: string): boolean {
    return this.enabledBySession.get(sessionId) ?? this.defaultEnabled
  }

  /** Set the enabled state for one session. */
  setEnabled(sessionId: string, enabled: boolean): void {
    this.enabledBySession.set(sessionId, enabled)
  }

  /** Set the default enabled state inherited by sessions without an explicit override. */
  setDefaultEnabled(enabled: boolean): void {
    this.defaultEnabled = enabled
  }

  /** The Express prompt snippet for the DSH catalog (with verbose CLDR prose compacted). */
  promptSnippet(): string {
    const raw = this.generator.createProcessor(CAPABILITIES).promptSnippet
    return raw.replace(PLURALIZE_VERBOSE_BLOCK, COMPACT_PLURALIZE)
  }

  processor(sessionId: string): A2uiRequestProcessor {
    let state = this.states.get(sessionId)
    if (state === undefined) {
      state = this.generator.createProcessor(CAPABILITIES).createState()
      this.states.set(sessionId, state)
    }
    return this.generator.createProcessor(CAPABILITIES, undefined, { state })
  }

  /**
   * Compile one Express program for a session.
   * - Throws a plain `Error` if A2UI is turned off for the session.
   * - Throws `A2uiError` (rolling back `RendererState`) on syntax/schema/limit failure.
   */
  compile(sessionId: string, ui: string): AgentToRendererMessage[] {
    if (!this.isEnabled(sessionId)) {
      throw new Error(
        'A2UI generative UI is currently turned OFF by the user (/a2ui off). Do NOT call a2ui_render or a2ui_ask; respond in concise Markdown.',
      )
    }

    if (ui.length > A2UI_LIMITS.maxUiChars) {
      throw new A2uiError(
        `Express program length (${ui.length} chars) exceeds maximum (${A2UI_LIMITS.maxUiChars} chars). Keep UI concise and bind compact arrays in $/paths.`,
        'VALIDATION_ERROR',
      )
    }

    const prevState = this.states.get(sessionId)
    let backup: RendererState | undefined
    if (prevState !== undefined) {
      try {
        backup = structuredClone(prevState)
      } catch {
        backup = undefined
      }
    }

    const cleaned = stripWrapping(ui)
    let parts: ReturnType<A2uiRequestProcessor['parseResponse']>
    try {
      parts = this.processor(sessionId).parseResponse(cleaned, { wrapped: false })
    } catch (firstErr) {
      // Cross-restart hydration: if a resumed conversation patches an earlier surface via
      // `surface("id", update=true)` after DSH restarted (when host memory is cold), seed the
      // surface placeholder once and retry before treating it as an error.
      const updateIds = extractUpdateSurfaceIds(cleaned)
      const msgText = firstErr instanceof Error ? firstErr.message : ''
      if (
        firstErr instanceof A2uiError &&
        updateIds.length > 0 &&
        /not exist|not found|unknown surface|createSurface/i.test(msgText)
      ) {
        try {
          const proc = this.processor(sessionId)
          for (const id of updateIds) {
            proc.parseResponse(`surface(${JSON.stringify(id)})\nroot = Text("")`, { wrapped: false })
          }
          parts = proc.parseResponse(cleaned, { wrapped: false })
        } catch (retryErr) {
          if (prevState === undefined) {
            this.states.delete(sessionId)
          } else if (backup !== undefined) {
            this.states.set(sessionId, backup)
          }
          enrichCompilerError(retryErr)
        }
      } else {
        if (prevState === undefined) {
          this.states.delete(sessionId)
        } else if (backup !== undefined) {
          this.states.set(sessionId, backup)
        }
        enrichCompilerError(firstErr)
      }
    }
    const messages = parts.flatMap((part) => (part.type === 'a2ui' ? part.a2ui : []))

    try {
      validateCompiledLimits(messages)
    } catch (err) {
      if (prevState === undefined) {
        this.states.delete(sessionId)
      } else if (backup !== undefined) {
        this.states.set(sessionId, backup)
      }
      throw err
    }

    return messages
  }

  /** Increment and return consecutive compile failure count for a session/tool channel. */
  recordCompileFailure(sessionId: string, channel: 'render' | 'ask'): number {
    const entry = this.failuresBySession.get(sessionId) ?? { render: 0, ask: 0 }
    const next =
      channel === 'render'
        ? { render: entry.render + 1, ask: entry.ask }
        : { render: entry.render, ask: entry.ask + 1 }
    this.failuresBySession.set(sessionId, next)
    return next[channel]
  }

  /** Reset consecutive compile failure count for a session/tool channel. */
  clearCompileFailures(sessionId: string, channel?: 'render' | 'ask'): void {
    if (channel === undefined) {
      this.failuresBySession.delete(sessionId)
      return
    }
    const entry = this.failuresBySession.get(sessionId)
    if (!entry) return
    const next =
      channel === 'render' ? { render: 0, ask: entry.ask } : { render: entry.render, ask: 0 }
    if (next.render === 0 && next.ask === 0) {
      this.failuresBySession.delete(sessionId)
    } else {
      this.failuresBySession.set(sessionId, next)
    }
  }

  forget(sessionId: string): void {
    this.states.delete(sessionId)
    this.enabledBySession.delete(sessionId)
    this.failuresBySession.delete(sessionId)
  }
}

/** Tolerate `<a2ui>` tags or a markdown fence around the program. */
export function stripWrapping(ui: string): string {
  let text = ui.trim()
  const tag = /^<a2ui>\s*([\s\S]*?)\s*<\/a2ui>$/.exec(text)
  if (tag !== null) text = tag[1] ?? ''
  const fence = /^```[\w-]*\s*\n([\s\S]*?)\n?```$/.exec(text)
  if (fence !== null) text = fence[1] ?? ''
  return text
}
