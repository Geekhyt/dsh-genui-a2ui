/**
 * Isomorphic wire & presentation metadata types shared between the Host tools
 * (`a2ui_render`, `a2ui_ask`) and the Browser projections/views.
 *
 * Kept strictly `import type`-only so `src/client/` never imports `src/host/`
 * and zero runtime bytes are added to `lib/client.js`.
 */
import type { AgentToRendererMessage } from '@a2ui/agent'
import type { SurfacePlacement } from './constants.ts'

/** Result meta produced by `a2ui_render` (`presentationMeta`) and consumed by client projections. */
export interface RenderMeta {
  readonly kind: 'dsh-a2ui'
  readonly version: 1
  readonly title: string | null
  readonly placement: SurfacePlacement
  readonly surfaceIds: string[]
  readonly messages: AgentToRendererMessage[]
}

/** Payload sent from `AskToolView` / `AskDockView` to `/a2ui-answer` to settle an in-flight `a2ui_ask`. */
export interface AskAnswerInput {
  readonly callId?: string | undefined
  readonly skipped?: boolean | undefined
  readonly action?: string | undefined
  readonly surfaceId?: string | undefined
  readonly sourceComponentId?: string | undefined
  readonly userMessage?: string | undefined
  readonly context?: Record<string, unknown> | undefined
  readonly dataModels?: Record<string, unknown> | undefined
}

/** Result meta produced by `a2ui_ask` (`presentationMeta`) and consumed by client projections. */
export interface AskMeta {
  readonly kind: 'dsh-a2ui-ask'
  readonly version: 1
  readonly status: 'answered' | 'skipped' | 'timed_out'
  readonly callId: string
  readonly title: string | null
  readonly action: string | null
  readonly userMessage: string | null
  readonly context: Record<string, unknown> | null
  readonly surfaceIds: string[]
  readonly messages: AgentToRendererMessage[]
}
