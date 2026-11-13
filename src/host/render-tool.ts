/**
 * `a2ui_render`: the model-facing render tool.
 *
 * Plain `ToolDefinition` object (the shape `defineTool` returns) so the host
 * half imports no harness module at runtime. The browser toolview reads the
 * compiled wire messages and placement from the result's `meta` (`presentationMeta`).
 */
import { A2uiError, type AgentToRendererMessage } from '@a2ui/agent'
import { A2UI_LIMITS, normalizePlacement, type SurfacePlacement } from '../shared/catalog-schema.ts'
import type { RenderMeta } from '../shared/wire-types.ts'
import { RENDER_TOOL, type SurfaceSessions } from './generator.ts'

export { normalizePlacement, type RenderMeta }

/** What `execute` returns; `meta` for the browser is derived from it. */
export interface RenderValue {
  readonly status: 'rendered'
  readonly title: string | null
  readonly placement: SurfacePlacement
  readonly surfaceIds: string[]
  readonly messages: AgentToRendererMessage[]
}

export interface ToolExec {
  readonly callId?: string
  readonly parentCallId?: string
  readonly signal?: AbortSignal
  readonly agent?: {
    readonly isSubagent?: boolean
    readonly parent?: unknown
    readonly session?: {
      readonly id?: unknown
      readonly parentId?: unknown
      readonly header?: { readonly id?: unknown; readonly parentSession?: unknown }
    }
  }
}

const PARAMETERS = {
  type: 'object',
  properties: {
    ui: {
      type: 'string',
      description:
        'Raw A2UI Express program starting with surface("id") and assigning root = ... (no <a2ui> tags, no markdown fences). Use the Fast-Path signatures directly for display cards, or load the a2ui skill first for interactive forms and functions.',
    },
    title: {
      type: 'string',
      description: 'Short title shown on the tool row and card header.',
    },
    placement: {
      type: 'string',
      enum: ['answer', 'inline', 'dock'],
      description:
        'Where to place the surface: "answer" (default, permanent card below your reply), "inline" (inside the tool row only), or "dock" (persistent workspace panel above the chat composer across turns; update in place via update=true).',
    },
  },
  required: ['ui'],
  additionalProperties: false,
} as const

/** Read `{ ui, title, placement }` defensively: tool bridges have been seen double-encoding args. */
export function readArgs(args: unknown): {
  ui: string | undefined
  title: string | undefined
  placement: SurfacePlacement
} {
  let value: unknown = args
  for (let i = 0; i < 3; i++) {
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value)
      } catch {
        return { ui: value as string, title: undefined, placement: 'answer' }
      }
      continue
    }
    if (typeof value === 'object' && value !== null && 'arguments' in value && !('ui' in value)) {
      value = (value as { arguments: unknown }).arguments
      continue
    }
    break
  }
  if (typeof value !== 'object' || value === null) {
    return { ui: undefined, title: undefined, placement: 'answer' }
  }
  const record = value as Record<string, unknown>
  return {
    ui: typeof record.ui === 'string' ? record.ui : undefined,
    title: typeof record.title === 'string' && record.title.trim() !== '' ? record.title.trim() : undefined,
    placement: normalizePlacement(record.placement),
  }
}

export function surfaceIdsOf(messages: readonly AgentToRendererMessage[]): string[] {
  const ids = new Set<string>()
  for (const message of messages) {
    for (const value of Object.values(message as unknown as Record<string, unknown>)) {
      if (typeof value === 'object' && value !== null && 'surfaceId' in value) {
        const id = (value as { surfaceId: unknown }).surfaceId
        if (typeof id === 'string') ids.add(id)
      }
    }
  }
  return [...ids]
}

export function sessionIdOf(exec: ToolExec | undefined): string {
  const id = exec?.agent?.session?.id ?? exec?.agent?.session?.header?.id
  return typeof id === 'string' || typeof id === 'number' ? String(id) : 'global'
}

export function isSubagentCall(exec: ToolExec | undefined): boolean {
  if (!exec) return false
  if (exec.parentCallId !== undefined) return true
  if (exec.agent?.isSubagent === true) return true
  if (exec.agent?.parent !== undefined && exec.agent?.parent !== null) return true
  if (exec.agent?.session?.parentId !== undefined && exec.agent?.session?.parentId !== null) return true
  if (
    exec.agent?.session?.header?.parentSession !== undefined &&
    exec.agent?.session?.header?.parentSession !== null
  ) {
    return true
  }
  return false
}

function describePlacement(placement: SurfacePlacement): string {
  switch (placement) {
    case 'dock':
      return 'pinned in the persistent workspace dock above the chat input'
    case 'inline':
      return 'shown inline in the tool stream'
    case 'answer':
      return 'shown below your answer'
  }
}

/** Build the tool definition bound to the plugin's session states. */
export function createRenderTool(sessions: SurfaceSessions) {
  return {
    name: RENDER_TOOL,
    description: [
      'Render a structured interactive A2UI visual card (`Stat`, `KeyValue`, `Chart`, `Mermaid`, `Table`, `Tabs`, `Accordion`, `Steps`, `DiffView`, `FileTree`, `JsonTree`, `Callout`, `Progress`, `Code`, or interactive controls) whenever your answer contains >=3 parallel metrics/ranges/specs, trends/flows/distributions, architecture/sequence diagrams, multi-item comparisons, staged workflows, workspace trees, JSON payloads, or diffs — even when the user asked a short factual query without requesting a UI.',
      'For standard display cards, call `a2ui_render` directly in 1 step using the Fast-Path Express grammar; load the `a2ui` skill first only when using form inputs, validation checks, reactive functions, or `Event(...)` actions.',
      'Use `placement="dock"` to pin a persistent live workspace bar across turns (`update=true`), or `a2ui_ask` when you must pause and wait for structured user input.',
    ].join(' '),
    parameters: PARAMETERS,
    output: {
      schema: { type: 'object' },
      render(_args: unknown, value: RenderValue) {
        const ids = value.surfaceIds.length > 0 ? value.surfaceIds.join(', ') : 'none'
        return [
          {
            type: 'text',
            text: `UI rendered (surfaces: ${ids}, placement: ${value.placement}). The user sees it ${describePlacement(value.placement)}; do not restate it.`,
          },
        ]
      },
      presentationMeta(_args: unknown, value: RenderValue): RenderMeta {
        return {
          kind: 'dsh-a2ui',
          version: 1,
          title: value.title,
          placement: value.placement,
          surfaceIds: value.surfaceIds,
          messages: value.messages,
        }
      },
    },
    async execute(args: unknown, exec?: ToolExec): Promise<RenderValue> {
      if (isSubagentCall(exec)) {
        throw new Error(
          'a2ui_render cannot be called inside a background subagent because subagent tool outputs are not shown in the main chat stream. Return structured JSON/text findings to the parent agent so the parent agent can render the UI.',
        )
      }

      const { ui, title, placement } = readArgs(args)
      if (ui === undefined || ui.trim() === '') {
        throw new Error('a2ui_render: `ui` must be a non-empty A2UI Express program.')
      }

      const sid = sessionIdOf(exec)
      let messages: AgentToRendererMessage[]
      try {
        messages = sessions.compile(sid, ui)
      } catch (error) {
        if (error instanceof A2uiError) {
          const fails = sessions.recordCompileFailure(sid, 'render')
          if (fails > A2UI_LIMITS.maxRepairsPerTurn) {
            sessions.clearCompileFailures(sid, 'render')
            throw new Error(
              `a2ui_render: the program was rejected — ${error.message}\nRepair limit (${A2UI_LIMITS.maxRepairsPerTurn}) reached for this turn. STOP calling a2ui_render now and answer the user directly in concise Markdown.`,
            )
          }
          throw new Error(
            `a2ui_render: the program was rejected — ${error.message}\nFix it and call a2ui_render again (retry ${fails}/${A2UI_LIMITS.maxRepairsPerTurn}; if using interactive inputs or functions, load the a2ui skill for exact signatures).`,
          )
        }
        throw error
      }

      if (messages.length === 0) {
        throw new Error('a2ui_render: the program produced no UI messages (is `root` assigned?).')
      }

      sessions.clearCompileFailures(sid, 'render')
      return {
        status: 'rendered',
        title: title ?? null,
        placement,
        surfaceIds: surfaceIdsOf(messages),
        messages,
      }
    },
    presentCall(args: unknown) {
      const { title } = readArgs(args)
      return { card: 'generic', title: title ?? 'A2UI', kind: 'other' }
    },
    presentResult(args: unknown) {
      const { title } = readArgs(args)
      return { card: 'generic', title: title ?? 'A2UI' }
    },
  }
}
