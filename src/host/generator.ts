import {
  A2uiError,
  A2uiGenerator,
  type A2uiRequestProcessor,
  type AgentToRendererMessage,
  CatalogConfig,
  ExpressFormatFactory,
  ExpressPromptGenerator,
  type InferenceFormat,
  type InferenceFormatFactory,
  type RendererState,
} from '@a2ui/agent'

type SchemaCatalogInput = ConstructorParameters<typeof CatalogConfig>[0]

import { validateCalcExpression } from '../shared/calc-engine.ts'
import { isSecretKey } from '../shared/constants.ts'
import {
  collectKvSecretsFromValue,
  extractBindingPointer,
  normalizePointerPath,
  resolveTemplateObscuredPointers,
} from '../shared/redaction.ts'
import { A2UI_LIMITS, ASK_TOOL, dshSchemaCatalog, RENDER_TOOL } from '../shared/catalog-schema.ts'
import {
  desugarExpressConcat,
  extractUpdateSurfaceIds,
  flattenChainedCalc,
  foldNestedCondToLookup,
  preprocessExpressProgram,
} from '../shared/express-preprocess.ts'
import {
  compactPromptSnippet,
  type SkillDomain,
  slicePromptSnippetByDomain,
} from './prompt-compact.ts'

export type { SkillDomain }
export {
  ASK_TOOL,
  desugarExpressConcat,
  flattenChainedCalc,
  foldNestedCondToLookup,
  preprocessExpressProgram,
  RENDER_TOOL,
}

export const SENTINEL_PARAGRAPH =
  /IMPORTANT: You MUST always surround the entire A2UI Express block with the literal sentinel tags[^\n]*\n/

export const TOOL_CONTRACT = [
  `IMPORTANT: In this host you never write A2UI Express into your reply text. Pass the whole Express program as the \`ui\` argument of \`${RENDER_TOOL}\` (display / dashboard / workspace dock) or \`${ASK_TOOL}\` (suspend the turn and wait for user submission), without \`<a2ui>\` tags and without markdown fences.`,
  `The tool compiles and validates the program. When it returns an error, fix the program and call the tool again; after a successful call, do not restate the UI in prose.`,
  '',
].join('\n')

class ToolChannelPromptGenerator extends ExpressPromptGenerator {
  override generateBaseRules(): string {
    const base = super.generateBaseRules()
    const swapped = base.replace(SENTINEL_PARAGRAPH, TOOL_CONTRACT)
    return swapped === base ? `${TOOL_CONTRACT}\n${base}` : swapped
  }
}

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

const DEFAULT_CATALOGS: readonly SchemaCatalogInput[] = [dshSchemaCatalog]

const CAPABILITIES = {
  '1.0': { supportedCatalogIds: DEFAULT_CATALOGS.map((c) => c.id) },
}

export function createGenerator(
  catalogs: readonly SchemaCatalogInput[] = DEFAULT_CATALOGS,
): A2uiGenerator {
  return new A2uiGenerator(
    catalogs.map((c) => new CatalogConfig(c)),
    undefined,
    new ToolChannelFormatFactory(),
  )
}

const MAX_DATA_MODEL_DEPTH = 32

function findExpressionInDataModel(node: unknown, currentPath = '', depth = 0): string | null {
  if (typeof node !== 'object' || node === null) return null
  if (depth > MAX_DATA_MODEL_DEPTH) {
    throw new A2uiError(
      `Data model nesting exceeds maximum depth (${MAX_DATA_MODEL_DEPTH}) at "$${currentPath || '/'}". Flatten nested data structures before rendering.`,
      'VALIDATION_ERROR',
    )
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const hit = findExpressionInDataModel(node[i], `${currentPath}/${i}`, depth + 1)
      if (hit) return hit
    }
    return null
  }
  const rec = node as Record<string, unknown>
  if ('@call' in rec || '@path' in rec) {
    return currentPath || '/'
  }
  for (const [k, v] of Object.entries(rec)) {
    const hit = findExpressionInDataModel(v, `${currentPath}/${k}`, depth + 1)
    if (hit) return hit
  }
  return null
}

function isDynamicBindingObject(rec: Record<string, unknown>): boolean {
  const keys = Object.keys(rec)
  if (keys.length === 0) return false
  if (keys.length === 1 && (typeof rec['@path'] === 'string' || typeof rec.path === 'string')) {
    return true
  }
  if (typeof rec['@call'] === 'string' || typeof rec.call === 'string') {
    return keys.every((k) => k === '@call' || k === 'call' || k === 'args' || k === 'returnType')
  }
  return false
}

const CHECK_VALUE_VALIDATORS = new Set(['required', 'numeric', 'length', 'regex', 'email'])

function validateCheckConditionNode(
  cond: unknown,
  compId: string,
  compName: string,
  depth = 0,
): void {
  if (depth > 8 || typeof cond !== 'object' || cond === null) return
  const condRec = cond as Record<string, unknown>
  const callName = condRec['@call'] ?? condRec.call
  const args = condRec.args
  if (typeof callName !== 'string' || typeof args !== 'object' || args === null) return
  const argsRec = args as Record<string, unknown>
  if (callName === 'and' || callName === 'or') {
    if (Array.isArray(argsRec.values)) {
      for (const child of argsRec.values) {
        validateCheckConditionNode(child, compId, compName, depth + 1)
      }
    }
    return
  }
  if (callName === 'not') {
    validateCheckConditionNode(argsRec.value, compId, compName, depth + 1)
    return
  }
  if (!CHECK_VALUE_VALIDATORS.has(callName)) return
  const val = argsRec.value
  const isBound =
    typeof val === 'object' &&
    val !== null &&
    !Array.isArray(val) &&
    isDynamicBindingObject(val as Record<string, unknown>)
  if (!isBound) {
    if (callName === 'required' && typeof val === 'string') {
      throw new A2uiError(
        `Component "${compId}" (${compName}) has ?required(${JSON.stringify(val)}) without a target $/path binding. Pass the target $/path as the first argument (e.g. ?required($/field, ${JSON.stringify(val)})).`,
        'VALIDATION_ERROR',
      )
    }
    throw new A2uiError(
      `Component "${compId}" (${compName}) has ?${callName}(...) with a literal value (${JSON.stringify(val)}) instead of a $/path binding. Pass the target $/path as the first argument (e.g. ?${callName}($/field, ...)).`,
      'VALIDATION_ERROR',
    )
  }
}

function validateCheckRulesInComponents(components: readonly unknown[]): void {
  for (const item of components) {
    if (typeof item !== 'object' || item === null) continue
    const rec = item as Record<string, unknown>
    if (!Array.isArray(rec.checks)) continue
    const compName = typeof rec.component === 'string' ? rec.component : 'Component'
    const compId = typeof rec.id === 'string' ? rec.id : compName
    for (const rule of rec.checks) {
      if (typeof rule !== 'object' || rule === null) continue
      validateCheckConditionNode((rule as Record<string, unknown>).condition, compId, compName)
    }
  }
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
        if (!isDynamicBindingObject(varsRec)) {
          providedVars = new Set<string>(Object.keys(varsRec))
        }
      } else {
        throw new A2uiError(
          `Invalid calc() formula "${args.expr}": vars must be an object map or $/path binding.`,
          'VALIDATION_ERROR',
        )
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
        `${err.message}. Tip: A2UI caps nested function call depth at 5. NEVER nest 3+ \`cond(...)\` inside \`calc(...)\` + \`formatNumber(...)\` and NEVER chain \`calc()\` variables — collapse math into one flat \`calc()\` reading \`$/paths\` directly (e.g. \`calc("p * r * (1 + r)^n / ((1 + r)^n - 1)", { p: $/p, r: $/r, n: $/n }, decimals=2)\`), and bind derived results to plain local variables (never \`$/paths\`).`,
        'VALIDATION_ERROR',
      )
    }
    if (PRUNED_MATH_FN_RE.test(err.message)) {
      throw new A2uiError(
        `${err.message} Tip: Arithmetic & rounding are unified in \`calc(expr, vars?, decimals?)\`, e.g. \`calc("a * b", { a: $/a, b: $/b }, decimals=2)\`; for comparisons use \`eq\`, \`gt\`, \`lt\`, or \`not(...)\`.`,
        'VALIDATION_ERROR',
      )
    }
    if (/token recognition error at:\s*'[\s]*[+*/]/i.test(err.message)) {
      throw new A2uiError(
        `${err.message} Tip: A2UI Express DSL has NO \`+\`, \`*\`, or \`/\` operators outside \`calc()\`. NEVER concatenate strings with \`+\` (put units in \`label\`/\`caption\`) and NEVER write math inside \`formatNumber(a * 100)\` or \`{ q: $/a / $/b }\` — put ALL arithmetic inside the \`calc("a / b * 100", { a: $/a, b: $/b }, decimals=1)\` formula string.`,
        'VALIDATION_ERROR',
      )
    }
    if (
      /token recognition error at:\s*'\.[a-zA-Z_]/i.test(err.message) ||
      /mismatched input '\[' expecting \{',', '\)'\}/i.test(err.message)
    ) {
      throw new A2uiError(
        `${err.message} Tip: A2UI Express DSL has NO JavaScript dot-access (\`obj.prop\`) or bracket indexing (\`arr[0]\`) on variables. Use JSON Pointer paths (\`$/obj/prop\`) for data model fields, or flat scalar local variables (\`gpuName = cond(eq($/gpu, "a800"), "A800", "H800")\`).`,
        'VALIDATION_ERROR',
      )
    }
    if (/token recognition error at:\s*'`/i.test(err.message)) {
      throw new A2uiError(
        `${err.message} Tip: A2UI Express DSL does NOT support JS backtick template literals (\`...\`). Use standard double-quoted strings with \`\\n\` for newlines.`,
        'VALIDATION_ERROR',
      )
    }
    if (/extraneous input ':' expecting \{',', '\)'\}/i.test(err.message)) {
      throw new A2uiError(
        `${err.message} Tip: Named component arguments MUST use \`=\` (e.g. \`EntityHeader("...", avatarText="HR", status="healthy")\`), NOT \`:\`. Use \`:\` ONLY inside \`{ key: value }\` object literals.`,
        'VALIDATION_ERROR',
      )
    }
    if (
      /(?:approveAction|rejectAction|action):.*Expected object, received string|(?:approveAction|rejectAction|action)\.event: Expected object/i.test(
        err.message,
      )
    ) {
      throw new A2uiError(
        `${err.message} Tip: Action props MUST use \`Event("action_name", { key: $/val })\` (e.g. \`approveAction=Event("approve")\`, \`rejectAction=Event("reject")\`), never a plain string or \`{ action: ... }\`.`,
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

      if (
        (kind === 'createSurface' || kind === 'updateComponents') &&
        Array.isArray(p.components)
      ) {
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
        validateCheckRulesInComponents(p.components)
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

  let compiledBytes = 0
  for (const msg of messages) {
    compiledBytes += Buffer.byteLength(JSON.stringify(msg), 'utf8')
    if (compiledBytes > A2UI_LIMITS.maxCompiledBytes) {
      throw new A2uiError(
        `Compiled A2UI message payload exceeds limit (${compiledBytes} bytes > ${A2UI_LIMITS.maxCompiledBytes} bytes). Avoid deeply repeated variable expansions or oversized inline payloads.`,
        'VALIDATION_ERROR',
      )
    }
  }
}

const MAX_HOST_SESSIONS = 256

function touchMapLru<K, V>(map: Map<K, V>, key: K, value: V, limit: number): void {
  map.delete(key)
  map.set(key, value)
  while (map.size > limit) {
    const oldest = map.keys().next()
    if (oldest.done) break
    map.delete(oldest.value)
  }
}

interface SurfaceRedactionRecord {
  readonly obscuredPointers: Set<string>
  readonly kvPointers: Set<string>
  readonly componentsById: Map<string, Record<string, unknown>>
}

function getAtPointerLocal(root: unknown, pointer: string): unknown {
  const norm = normalizePointerPath(pointer)
  if (norm === '/') return root
  const parts = norm.slice(1).split('/')
  let cur: unknown = root
  for (const rawSeg of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined
    const seg = rawSeg.replace(/~1/g, '/').replace(/~0/g, '~')
    if (Array.isArray(cur)) {
      const idx = Number(seg)
      if (!Number.isInteger(idx) || idx < 0 || idx >= cur.length) return undefined
      cur = cur[idx]
    } else {
      const rec = cur as Record<string, unknown>
      if (!Object.hasOwn(rec, seg)) return undefined
      cur = rec[seg]
    }
  }
  return cur
}

export class SurfaceSessions {
  private readonly states = new Map<string, RendererState>()
  private readonly enabledBySession = new Map<string, boolean>()
  private readonly failuresBySession = new Map<string, { render: number; ask: number }>()
  private readonly redactionBySession = new Map<string, Map<string, SurfaceRedactionRecord>>()
  private readonly generator: A2uiGenerator
  private defaultEnabled: boolean

  constructor(generator: A2uiGenerator = createGenerator(DEFAULT_CATALOGS), initialEnabled = true) {
    this.generator = generator
    this.defaultEnabled = initialEnabled
  }

  getDefaultEnabled(): boolean {
    return this.defaultEnabled
  }

  isEnabled(sessionId: string): boolean {
    return this.enabledBySession.get(sessionId) ?? this.defaultEnabled
  }

  setEnabled(sessionId: string, enabled: boolean): void {
    touchMapLru(this.enabledBySession, sessionId, enabled, MAX_HOST_SESSIONS)
  }

  setDefaultEnabled(enabled: boolean): void {
    this.defaultEnabled = enabled
  }

  private recordRedactionMessages(
    sessionId: string,
    messages: readonly AgentToRendererMessage[],
  ): void {
    let bySurface = this.redactionBySession.get(sessionId)
    if (!bySurface) {
      bySurface = new Map<string, SurfaceRedactionRecord>()
      touchMapLru(this.redactionBySession, sessionId, bySurface, MAX_HOST_SESSIONS)
    } else {
      touchMapLru(this.redactionBySession, sessionId, bySurface, MAX_HOST_SESSIONS)
    }
    const ensureSurface = (surfaceId: string): SurfaceRedactionRecord => {
      let rec = bySurface.get(surfaceId)
      if (!rec) {
        rec = {
          obscuredPointers: new Set<string>(),
          kvPointers: new Set<string>(),
          componentsById: new Map<string, Record<string, unknown>>(),
        }
        bySurface.set(surfaceId, rec)
      }
      return rec
    }
    const ingestComponents = (surfaceId: string, list: unknown) => {
      if (!Array.isArray(list)) return
      const rec = ensureSurface(surfaceId)
      for (const item of list) {
        if (typeof item !== 'object' || item === null) continue
        const comp = item as Record<string, unknown>
        const id =
          typeof comp.id === 'string' && comp.id !== ''
            ? comp.id
            : `anon_${rec.componentsById.size}`
        rec.componentsById.set(id, comp)
        if (comp.component === 'KvEditor') {
          const p = extractBindingPointer(comp.items)
          if (p !== null) rec.kvPointers.add(p)
        }
      }
      resolveTemplateObscuredPointers([...rec.componentsById.values()], rec.obscuredPointers)
    }
    const ingestDataModel = (surfaceId: string, dmPath: string, dmValue: unknown) => {
      const rec = bySurface.get(surfaceId)
      if (!rec || rec.kvPointers.size === 0) return
      for (const kvPtr of rec.kvPointers) {
        const normKv = normalizePointerPath(kvPtr)
        if (dmPath === normKv) {
          collectKvSecretsFromValue(dmValue, normKv, rec.obscuredPointers, new Set(), new Set())
        } else if (dmPath === '/') {
          const val = getAtPointerLocal(dmValue, normKv)
          if (val !== undefined) {
            collectKvSecretsFromValue(val, normKv, rec.obscuredPointers, new Set(), new Set())
          }
        } else if (normKv.startsWith(`${dmPath}/`)) {
          const val = getAtPointerLocal(dmValue, normKv.slice(dmPath.length))
          if (val !== undefined) {
            collectKvSecretsFromValue(val, normKv, rec.obscuredPointers, new Set(), new Set())
          }
        } else if (dmPath.startsWith(`${normKv}/`)) {
          const seg =
            dmPath
              .slice(normKv.length + 1)
              .split('/')[0]
              ?.replace(/~1/g, '/')
              .replace(/~0/g, '~') ?? ''
          if (seg !== '' && isSecretKey(seg)) {
            rec.obscuredPointers.add(dmPath)
          }
        }
      }
    }
    for (const msg of messages) {
      const rec = msg as unknown as Record<string, unknown>
      if (rec.deleteSurface && typeof rec.deleteSurface === 'object') {
        const sid = (rec.deleteSurface as { surfaceId?: unknown }).surfaceId
        if (typeof sid === 'string') bySurface.delete(sid)
      }
      if (rec.createSurface && typeof rec.createSurface === 'object') {
        const cs = rec.createSurface as Record<string, unknown>
        const sid = typeof cs.surfaceId === 'string' ? cs.surfaceId : ''
        if (sid !== '') {
          bySurface.delete(sid)
          ingestComponents(sid, cs.components)
          if (cs.dataModel !== undefined) ingestDataModel(sid, '/', cs.dataModel)
        }
      }
      if (rec.updateComponents && typeof rec.updateComponents === 'object') {
        const uc = rec.updateComponents as Record<string, unknown>
        const sid = typeof uc.surfaceId === 'string' ? uc.surfaceId : ''
        if (sid !== '') ingestComponents(sid, uc.components)
      }
      if (rec.updateDataModel && typeof rec.updateDataModel === 'object') {
        const dm = rec.updateDataModel as { surfaceId?: unknown; path?: unknown; value?: unknown }
        const sid = typeof dm.surfaceId === 'string' ? dm.surfaceId : ''
        if (sid !== '') {
          const dmPath = normalizePointerPath(typeof dm.path === 'string' ? dm.path : '/')
          ingestDataModel(sid, dmPath, dm.value)
        }
      }
    }
  }

  getSessionRedactionState(
    sessionId: string,
    surfaceIds?: readonly string[],
  ): { obscuredPointers: Set<string>; kvPointers: Set<string> } {
    const obscuredPointers = new Set<string>()
    const kvPointers = new Set<string>()
    const bySurface = this.redactionBySession.get(sessionId)
    if (!bySurface) return { obscuredPointers, kvPointers }
    const targetIds =
      surfaceIds !== undefined && surfaceIds.length > 0 ? surfaceIds : [...bySurface.keys()]
    for (const sid of targetIds) {
      const rec = bySurface.get(sid)
      if (!rec) continue
      for (const p of rec.obscuredPointers) obscuredPointers.add(p)
      for (const k of rec.kvPointers) kvPointers.add(k)
    }
    return { obscuredPointers, kvPointers }
  }

  rawPromptSnippet(): string {
    return this.generator.createProcessor(CAPABILITIES).promptSnippet
  }

  promptSnippet(domain?: SkillDomain): string {
    const raw = this.rawPromptSnippet()
    return domain === undefined
      ? compactPromptSnippet(raw)
      : slicePromptSnippetByDomain(raw, domain)
  }

  processor(sessionId: string): A2uiRequestProcessor {
    let state = this.states.get(sessionId)
    if (state === undefined) {
      state = this.generator.createProcessor(CAPABILITIES).createState()
    }
    touchMapLru(this.states, sessionId, state, MAX_HOST_SESSIONS)
    return this.generator.createProcessor(CAPABILITIES, undefined, { state })
  }

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

    const hadPrevState = this.states.has(sessionId)
    const cleaned = preprocessExpressProgram(stripWrapping(ui))

    const runCompile = (): AgentToRendererMessage[] => {
      let parts: ReturnType<A2uiRequestProcessor['parseResponse']>
      try {
        parts = this.processor(sessionId).parseResponse(cleaned, { wrapped: false })
      } catch (firstErr) {
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
              proc.parseResponse(`surface(${JSON.stringify(id)})\nroot = Text("")`, {
                wrapped: false,
              })
            }
            parts = proc.parseResponse(cleaned, { wrapped: false })
          } catch (retryErr) {
            enrichCompilerError(retryErr)
          }
        } else {
          enrichCompilerError(firstErr)
        }
      }
      const messages = parts.flatMap((part) => (part.type === 'a2ui' ? part.a2ui : []))
      validateCompiledLimits(messages)
      return messages
    }

    const prevState = this.states.get(sessionId)
    if (prevState !== undefined) {
      const compiled = prevState.transaction(runCompile)
      this.recordRedactionMessages(sessionId, compiled)
      return compiled
    }

    try {
      const compiled = runCompile()
      this.recordRedactionMessages(sessionId, compiled)
      return compiled
    } catch (err) {
      if (!hadPrevState) {
        this.states.delete(sessionId)
      }
      throw err
    }
  }

  recordCompileFailure(sessionId: string, channel: 'render' | 'ask'): number {
    const entry = this.failuresBySession.get(sessionId) ?? { render: 0, ask: 0 }
    const next =
      channel === 'render'
        ? { render: entry.render + 1, ask: entry.ask }
        : { render: entry.render, ask: entry.ask + 1 }
    this.failuresBySession.set(sessionId, next)
    return next[channel]
  }

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
    this.redactionBySession.delete(sessionId)
  }
}

export function stripWrapping(ui: string): string {
  let text = ui.trim()
  for (let pass = 0; pass < 2; pass += 1) {
    let changed = false
    if (text.startsWith('```') && text.endsWith('```') && text.length >= 6) {
      const nl = text.indexOf('\n')
      if (nl !== -1) {
        const info = text.slice(3, nl).trim()
        if (/^[\w-]*$/.test(info)) {
          let inner = text.slice(nl + 1, text.length - 3)
          if (inner.endsWith('\n')) inner = inner.slice(0, -1)
          if (inner.endsWith('\r')) inner = inner.slice(0, -1)
          text = inner.trim()
          changed = true
        }
      }
    }
    if (/^<a2ui>/i.test(text) && /<\/a2ui>$/i.test(text) && text.length >= 13) {
      text = text.slice(6, text.length - 7).trim()
      changed = true
    }
    if (!changed) break
  }
  return text
}
