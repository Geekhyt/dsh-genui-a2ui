/**
 * Beautifies `[a2ui-action]` protocol user messages via DSH's official
 * `ctx.uiConversation.userText.register` + `conversation.user.text.node` slot.
 *
 * NOTE: `UserText` in `@deepseek-ai/dsh-client-ui-conversation` wraps rendered
 * nodes inside `<HoverCardGroup as="span">`, so every DOM node rendered here
 * intentionally uses phrasing/inline-valid tags (`<span>`, `<button>`) to avoid
 * React `<div>`/`<pre>` inside `<span>` nesting warnings.
 */
import { memo, useState } from 'react'
import {
  A2UI_ACTION_NODE_ID,
  a2uiActionUserTextRule,
  matchA2uiActionUserText,
  type ParsedA2uiActionData,
} from './action-protocol.ts'
import { DshCheckIcon, DshChevronDownIcon, DshChevronUpIcon } from './ui/primitives.tsx'
import css from './ActionUserChip.module.css'

export { A2UI_ACTION_NODE_ID, a2uiActionUserTextRule, matchA2uiActionUserText, type ParsedA2uiActionData }

function prettyJsonOrRaw(raw: string | null): string | null {
  if (!raw) return null
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

export interface A2uiActionUserChipProps {
  readonly node: {
    readonly id: string
    readonly start: number
    readonly end: number
    readonly data: ParsedA2uiActionData
  }
  readonly raw: string
  readonly interactive?: boolean
}

export const A2uiActionUserChip = memo(function A2uiActionUserChip({
  node,
  raw,
  interactive = true,
}: A2uiActionUserChipProps) {
  const [expanded, setExpanded] = useState(false)
  const { surfaceId, summaryLabel, paramsText, dataModelText } = node.data
  const hasDetails = Boolean(paramsText || dataModelText)

  const detailContent = expanded
    ? [
        paramsText ? `动作参数：\n${prettyJsonOrRaw(paramsText)}` : null,
        dataModelText ? `界面状态：\n${prettyJsonOrRaw(dataModelText)}` : null,
      ]
        .filter(Boolean)
        .join('\n\n')
    : ''

  return (
    <span className={css.wrapper} data-a2ui-action-chip="" title={interactive ? undefined : raw}>
      <span className={css.chip}>
        <span className={css.iconBadge} aria-hidden="true">
          <DshCheckIcon size={11} />
        </span>
        <span className={css.label}>已提交交互：{summaryLabel}</span>
        {surfaceId ? <span className={css.surfaceTag}>{surfaceId}</span> : null}
        {interactive && hasDetails ? (
          <button
            type="button"
            className={css.toggleBtn}
            aria-expanded={expanded}
            onClick={(e) => {
              e.stopPropagation()
              setExpanded((v) => !v)
            }}
          >
            <span>{expanded ? '收起数据' : '查看提交数据'}</span>
            {expanded ? <DshChevronUpIcon size={12} /> : <DshChevronDownIcon size={12} />}
          </button>
        ) : null}
      </span>
      {interactive && expanded && detailContent ? (
        <span className={css.detailPane} data-a2ui-action-detail="">
          {detailContent}
        </span>
      ) : null}
    </span>
  )
})
