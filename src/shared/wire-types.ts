import type { AgentToRendererMessage } from '@a2ui/agent'
import type { SurfacePlacement } from './constants.ts'

export interface RenderMeta {
  readonly kind: 'dsh-a2ui'
  readonly version: 1
  readonly title: string | null
  readonly placement: SurfacePlacement
  readonly surfaceIds: string[]
  readonly messages: AgentToRendererMessage[]
}

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
