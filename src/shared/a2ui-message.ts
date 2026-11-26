import type { AgentToRendererMessage } from '@a2ui/agent'

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function getMessageRecord(message: AgentToRendererMessage): Record<string, unknown> | null {
  return isPlainRecord(message) ? message : null
}

export function getMessagePayloads(
  message: AgentToRendererMessage,
): ReadonlyArray<readonly [string, Record<string, unknown>]> {
  const rec = getMessageRecord(message)
  if (rec === null) return []
  const out: Array<readonly [string, Record<string, unknown>]> = []
  for (const [kind, payload] of Object.entries(rec)) {
    if (isPlainRecord(payload)) {
      out.push([kind, payload])
    }
  }
  return out
}

export function collectMessageSurfaceIds(
  messages: readonly AgentToRendererMessage[],
  target: Set<string>,
): void {
  for (const msg of messages) {
    for (const [, payload] of getMessagePayloads(msg)) {
      if (typeof payload.surfaceId === 'string') {
        target.add(payload.surfaceId)
      }
    }
  }
}

export function collectMessageComponents(
  messages: readonly AgentToRendererMessage[],
  target: Record<string, unknown>[],
): void {
  for (const msg of messages) {
    const rec = getMessageRecord(msg)
    if (rec === null) continue
    for (const key of ['createSurface', 'updateComponents'] as const) {
      const payload = rec[key]
      if (!isPlainRecord(payload) || !Array.isArray(payload.components)) continue
      for (const item of payload.components) {
        if (isPlainRecord(item)) {
          target.push(item)
        }
      }
    }
  }
}

export function getCreateSurfaceDataModel(message: AgentToRendererMessage): unknown {
  const rec = getMessageRecord(message)
  if (rec === null || !isPlainRecord(rec.createSurface)) return undefined
  return rec.createSurface.dataModel
}

export function getUpdateDataModelPayload(
  message: AgentToRendererMessage,
): { readonly path: unknown; readonly value: unknown } | null {
  const rec = getMessageRecord(message)
  if (rec === null || !isPlainRecord(rec.updateDataModel)) return null
  return {
    path: rec.updateDataModel.path,
    value: rec.updateDataModel.value,
  }
}
