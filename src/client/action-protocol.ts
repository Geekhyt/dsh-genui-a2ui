/**
 * Pure protocol serializer & `userText` matcher for `[a2ui-action]` user messages.
 *
 * Kept free of React and host UI primitives so both browser components and Node
 * unit tests can import it directly.
 */
import type { ActionPayload } from '@a2ui/web_core/v1_0'
import { sanitizeDataModel } from './persistence.ts'

export const A2UI_ACTION_NODE_ID = 'a2ui-action'

export interface ParsedA2uiActionData {
  readonly surfaceId: string
  readonly actionName: string
  readonly componentId: string
  readonly userMessage: string | null
  readonly paramsText: string | null
  readonly dataModelText: string | null
  readonly summaryLabel: string
}

const TRAILING_PROMPT_LINE =
  '请根据上述交互结果继续处理；如需更新界面，请调用 a2ui_render（对已有 surface 可使用 update=true）。'

function extractClickSelection(action: ActionPayload): Record<string, unknown> | null {
  const meta = (action as { readonly metadata?: { readonly extensions?: Record<string, unknown> } }).metadata
  const raw = meta?.extensions?.dshSelection
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const cleaned = sanitizeDataModel(raw)
  return Object.keys(cleaned).length > 0 ? cleaned : null
}

function formatSelectionLabel(selection: Record<string, unknown>): string | undefined {
  if (
    selection.source === 'fileTree' &&
    typeof selection.path === 'string' &&
    selection.path.trim() !== ''
  ) {
    const p = selection.path.trim()
    const ln =
      typeof selection.line === 'number' && Number.isFinite(selection.line)
        ? `:${Math.trunc(selection.line)}`
        : ''
    return `查看文件：${p}${ln}`
  }
  const label = typeof selection.label === 'string' && selection.label.trim() !== '' ? selection.label.trim() : ''
  const series = typeof selection.series === 'string' && selection.series.trim() !== '' ? selection.series.trim() : ''
  const val =
    typeof selection.value === 'number' || typeof selection.value === 'string'
      ? String(selection.value)
      : ''
  const head = [label, series].filter(Boolean).join(' · ')
  if (head && val) return `下钻查看：${head} (${val})`
  if (head) return `下钻查看：${head}`
  return undefined
}

/** Enrich an `ActionPayload` with any attached click-to-drill `dshSelection` metadata. */
export function enrichActionWithSelection(action: ActionPayload): ActionPayload {
  const selection = extractClickSelection(action)
  const cleanContext = sanitizeDataModel(action.context ?? {})
  if (selection === null) {
    return { ...action, context: cleanContext }
  }
  const mergedContext =
    'selection' in cleanContext ? cleanContext : { ...cleanContext, selection }
  const autoMsg =
    action.userMessage !== undefined && action.userMessage.trim() !== ''
      ? action.userMessage
      : formatSelectionLabel(selection)
  return {
    ...action,
    ...(autoMsg !== undefined ? { userMessage: autoMsg } : {}),
    context: mergedContext,
  }
}

/** Format an outbound A2UI action + optional surface data model as a user turn message. */
export function formatActionMessage(
  rawAction: ActionPayload,
  dataModels: Record<string, unknown> | undefined,
): string {
  const action = enrichActionWithSelection(rawAction)
  const parts: string[] = [
    `[a2ui-action] surface="${action.surfaceId}" action="${action.name}" component="${action.sourceComponentId}"`,
  ]
  if (action.userMessage !== undefined && action.userMessage.trim() !== '') {
    parts.push(`用户说明：${action.userMessage.trim()}`)
  }
  const cleanContext = sanitizeDataModel(action.context ?? {})
  if (Object.keys(cleanContext).length > 0) {
    parts.push(`动作参数：${JSON.stringify(cleanContext)}`)
  }
  const cleanModels = dataModels !== undefined ? sanitizeDataModel(dataModels) : {}
  if (Object.keys(cleanModels).length > 0) {
    parts.push(`当前数据模型：${JSON.stringify(cleanModels)}`)
  }
  parts.push(TRAILING_PROMPT_LINE)
  return parts.join('\n')
}

const HEADER_RE = /\[a2ui-action\]\s+surface="([^"]*)"\s+action="([^"]*)"(?:\s+component="([^"]*)")?/g

/** Match the next `[a2ui-action]` block in `text` starting at `from`. */
export function matchA2uiActionUserText(
  text: string,
  from: number,
):
  | {
      readonly id: typeof A2UI_ACTION_NODE_ID
      readonly start: number
      readonly end: number
      readonly data: ParsedA2uiActionData
    }
  | undefined {
  HEADER_RE.lastIndex = from
  const headerMatch = HEADER_RE.exec(text)
  if (headerMatch === null) return undefined

  const start = headerMatch.index
  const surfaceId = headerMatch[1] ?? 'default'
  const actionName = headerMatch[2] ?? 'action'
  const componentId = headerMatch[3] ?? ''

  let cursor = start + headerMatch[0].length
  let userMessage: string | null = null
  let paramsText: string | null = null
  let dataModelText: string | null = null

  while (cursor < text.length) {
    if (text[cursor] !== '\n' && text[cursor] !== '\r') break
    const lineStart = text[cursor] === '\r' && text[cursor + 1] === '\n' ? cursor + 2 : cursor + 1
    const nextNewline = text.indexOf('\n', lineStart)
    const lineEnd = nextNewline < 0 ? text.length : nextNewline
    const rawLine = text.slice(lineStart, lineEnd).replace(/\r$/, '')

    if (rawLine.startsWith('用户说明：')) {
      userMessage = rawLine.slice('用户说明：'.length).trim() || null
      cursor = lineEnd
      continue
    }
    if (rawLine.startsWith('动作参数：')) {
      paramsText = rawLine.slice('动作参数：'.length).trim() || null
      cursor = lineEnd
      continue
    }
    if (rawLine.startsWith('当前数据模型：')) {
      dataModelText = rawLine.slice('当前数据模型：'.length).trim() || null
      cursor = lineEnd
      continue
    }
    if (rawLine === TRAILING_PROMPT_LINE || rawLine.startsWith('请根据上述交互结果继续处理')) {
      cursor = lineEnd
      break
    }
    break
  }

  return {
    id: A2UI_ACTION_NODE_ID,
    start,
    end: cursor,
    data: {
      surfaceId,
      actionName,
      componentId,
      userMessage,
      paramsText,
      dataModelText,
      summaryLabel: userMessage ?? actionName,
    },
  }
}

/** Rule registered on `ctx.uiConversation.userText.register(...)`. */
export const a2uiActionUserTextRule = {
  id: A2UI_ACTION_NODE_ID,
  order: 10,
  match(text: string, from: number) {
    return matchA2uiActionUserText(text, from)
  },
}
