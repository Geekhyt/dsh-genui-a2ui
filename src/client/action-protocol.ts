import type { ActionPayload } from '@a2ui/web_core/v1_0'
import { isDangerousObjectKey } from '../shared/constants.ts'
import { resolveClientLocale, SHELL_MESSAGES } from '../shared/i18n.ts'
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

const USER_NOTE_PREFIXES = ['用户说明：', 'User note:'] as const
const PARAMS_PREFIXES = ['动作参数：', 'Action params:'] as const
const DATA_MODEL_PREFIXES = ['当前数据模型：', 'Current data model:'] as const
const TRAILING_PROMPT_PREFIXES = [
  '请根据上述交互结果继续处理',
  'Please continue based on the interaction above',
] as const

function stripMatchingPrefix(line: string, prefixes: readonly string[]): string | null {
  for (const prefix of prefixes) {
    if (line.startsWith(prefix)) {
      return line.slice(prefix.length).trim()
    }
  }
  return null
}

function extractClickSelection(action: ActionPayload): Record<string, unknown> | null {
  const meta = (action as { readonly metadata?: { readonly extensions?: Record<string, unknown> } })
    .metadata
  const raw = meta?.extensions?.dshSelection
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const cleaned = sanitizeDataModel(raw)
  return Object.keys(cleaned).length > 0 ? cleaned : null
}

function formatSelectionLabel(selection: Record<string, unknown>): string | undefined {
  const msg = SHELL_MESSAGES[resolveClientLocale()]
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
    return msg.actionViewFile(`${p}${ln}`)
  }
  const label =
    typeof selection.label === 'string' && selection.label.trim() !== ''
      ? selection.label.trim()
      : ''
  const series =
    typeof selection.series === 'string' && selection.series.trim() !== ''
      ? selection.series.trim()
      : ''
  const val =
    typeof selection.value === 'number' || typeof selection.value === 'string'
      ? String(selection.value)
      : ''
  const head = [label, series].filter(Boolean).join(' · ')
  if (head) return msg.actionDrillDown(head, val || undefined)
  return undefined
}

export function stripActionSelectionMetadata(action: ActionPayload): ActionPayload {
  const rawMeta = (action as { readonly metadata?: Record<string, unknown> }).metadata
  if (!rawMeta || typeof rawMeta !== 'object') return action
  const rawExt = rawMeta.extensions
  if (!rawExt || typeof rawExt !== 'object' || Array.isArray(rawExt)) return action
  if (!('dshSelection' in rawExt)) return action
  const nextExt: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(rawExt as Record<string, unknown>)) {
    if (k !== 'dshSelection') nextExt[k] = v
  }
  const nextMeta: Record<string, unknown> = { ...rawMeta }
  if (Object.keys(nextExt).length > 0) {
    nextMeta.extensions = nextExt
  } else {
    delete nextMeta.extensions
  }
  const nextAction = { ...(action as unknown as Record<string, unknown>) }
  if (Object.keys(nextMeta).length > 0) {
    nextAction.metadata = nextMeta
  } else {
    delete nextAction.metadata
  }
  return nextAction as unknown as ActionPayload
}

export function enrichActionWithSelection(action: ActionPayload): ActionPayload {
  const selection = extractClickSelection(action)
  const cleanContext = sanitizeDataModel(action.context ?? {})
  const stripped = stripActionSelectionMetadata(action)
  if (selection === null) {
    return { ...stripped, context: cleanContext }
  }
  const mergedContext = 'selection' in cleanContext ? cleanContext : { ...cleanContext, selection }
  const autoMsg =
    stripped.userMessage !== undefined && stripped.userMessage.trim() !== ''
      ? stripped.userMessage
      : formatSelectionLabel(selection)
  return {
    ...stripped,
    ...(autoMsg !== undefined ? { userMessage: autoMsg } : {}),
    context: mergedContext,
  }
}

function sanitizeHeaderAttr(value: unknown): string {
  return String(value ?? '')
    .replace(/[\r\n"]+/g, ' ')
    .trim()
}

function sanitizeSingleLineNote(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim()
}

export function formatActionMessage(
  rawAction: ActionPayload,
  dataModels: Record<string, unknown> | undefined,
): string {
  const msg = SHELL_MESSAGES[resolveClientLocale()]
  const action = enrichActionWithSelection(rawAction)
  const parts: string[] = [
    `[a2ui-action] surface="${sanitizeHeaderAttr(action.surfaceId)}" action="${sanitizeHeaderAttr(action.name)}" component="${sanitizeHeaderAttr(action.sourceComponentId)}"`,
  ]
  if (action.userMessage !== undefined && action.userMessage.trim() !== '') {
    const cleanNote = sanitizeSingleLineNote(action.userMessage)
    if (cleanNote !== '') {
      parts.push(`${msg.actionUserNotePrefix}${cleanNote}`)
    }
  }
  const cleanContext = sanitizeDataModel(action.context ?? {})
  if (Object.keys(cleanContext).length > 0) {
    parts.push(`${msg.actionParamsPrefix}${JSON.stringify(cleanContext)}`)
  }
  const cleanModels: Record<string, unknown> = {}
  if (dataModels !== undefined) {
    for (const [key, val] of Object.entries(dataModels)) {
      if (isDangerousObjectKey(key)) continue
      if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        const safeModel = sanitizeDataModel(val)
        if (Object.keys(safeModel).length > 0) {
          Object.defineProperty(cleanModels, key, {
            value: safeModel,
            enumerable: true,
            writable: true,
            configurable: true,
          })
        }
      } else {
        const safeFlat = sanitizeDataModel({ [key]: val })
        if (Object.hasOwn(safeFlat, key)) {
          Object.defineProperty(cleanModels, key, {
            value: safeFlat[key],
            enumerable: true,
            writable: true,
            configurable: true,
          })
        }
      }
    }
  }
  if (Object.keys(cleanModels).length > 0) {
    parts.push(`${msg.actionDataModelPrefix}${JSON.stringify(cleanModels)}`)
  }
  parts.push(msg.actionTrailingPrompt)
  return parts.join('\n')
}

const HEADER_RE =
  /(?:^|\n)\[a2ui-action\]\s+surface="([^"\r\n]*)"\s+action="([^"\r\n]*)"(?:\s+component="([^"\r\n]*)")?(?=\r?\n|$)/g

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
  const searchFrom = from > 0 && text[from - 1] === '\n' ? from - 1 : from
  HEADER_RE.lastIndex = searchFrom
  let headerMatch: RegExpExecArray | null
  while ((headerMatch = HEADER_RE.exec(text)) !== null) {
    const leadingNewline = headerMatch[0].startsWith('\n') ? 1 : 0
    const start = headerMatch.index + leadingNewline
    if (start < from) continue
    const surfaceId = headerMatch[1] ?? 'default'
    const actionName = headerMatch[2] ?? 'action'
    const componentId = headerMatch[3] ?? ''

    let cursor = headerMatch.index + headerMatch[0].length
    let userMessage: string | null = null
    let paramsText: string | null = null
    let dataModelText: string | null = null
    let hasTrailingPrompt = false

    while (cursor < text.length) {
      if (text[cursor] !== '\n' && text[cursor] !== '\r') break
      const lineStart = text[cursor] === '\r' && text[cursor + 1] === '\n' ? cursor + 2 : cursor + 1
      const nextNewline = text.indexOf('\n', lineStart)
      const lineEnd = nextNewline < 0 ? text.length : nextNewline
      const rawLine = text.slice(lineStart, lineEnd).replace(/\r$/, '')

      const noteVal = stripMatchingPrefix(rawLine, USER_NOTE_PREFIXES)
      if (noteVal !== null) {
        userMessage = noteVal || null
        cursor = lineEnd
        continue
      }
      const paramsVal = stripMatchingPrefix(rawLine, PARAMS_PREFIXES)
      if (paramsVal !== null) {
        paramsText = paramsVal || null
        cursor = lineEnd
        continue
      }
      const modelVal = stripMatchingPrefix(rawLine, DATA_MODEL_PREFIXES)
      if (modelVal !== null) {
        dataModelText = modelVal || null
        cursor = lineEnd
        continue
      }
      if (TRAILING_PROMPT_PREFIXES.some((prefix) => rawLine.startsWith(prefix))) {
        hasTrailingPrompt = true
        cursor = lineEnd
        break
      }
      break
    }

    if (!hasTrailingPrompt) continue

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
  return undefined
}

export const a2uiActionUserTextRule = {
  id: A2UI_ACTION_NODE_ID,
  order: 10,
  match(text: string, from: number) {
    return matchA2uiActionUserText(text, from)
  },
}
