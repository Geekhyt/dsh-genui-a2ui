import { memo, useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useShellMessages } from '../i18n.ts'
import {
  dismissCommandNotice,
  getA2uiEnabled,
  getCommandNotice,
  reconcileLatestA2uiCommand,
  resolveEffectiveA2uiEnabled,
  setA2uiEnabled,
  subscribeA2uiEnabled,
  subscribeCommandNotice,
} from '../persistence.ts'
import css from './TierControl.module.css'
import type { ChatExternalStore } from './ToolView.tsx'
import { isChatTimelineActive, resolveLatestA2uiCommandState } from './turn-surfaces.ts'
import { DshAppsIcon, DshToast, DshTooltip, DshWarningIcon } from '../ui/primitives.tsx'

export interface A2uiTierControlProps {
  readonly sessionId?: string | undefined
  readonly chatStore?: ChatExternalStore | undefined
  readonly syncHostEnabled?: ((enabled: boolean) => Promise<boolean>) | undefined
}

const NOOP_UNSUBSCRIBE = () => {}
const APPS_ICON_14 = <DshAppsIcon size={14} />
const WARNING_ICON_16 = <DshWarningIcon size={16} />

export const A2uiTierControl = memo(function A2uiTierControl({
  sessionId,
  chatStore,
  syncHostEnabled,
}: A2uiTierControlProps) {
  const [busyBySession, setBusyBySession] = useState<Readonly<Record<string, number>>>({})
  const reqSeqBySessionRef = useRef<Map<string, number>>(new Map())
  const sessionKey = sessionId ?? '__global__'
  const busy = Object.hasOwn(busyBySession, sessionKey)

  const getPersistedEnabled = useCallback(() => getA2uiEnabled(sessionId), [sessionId])
  useSyncExternalStore<boolean>(subscribeA2uiEnabled, getPersistedEnabled, getPersistedEnabled)

  const getNotice = useCallback(() => getCommandNotice(sessionId), [sessionId])
  const notice = useSyncExternalStore(subscribeCommandNotice, getNotice, getNotice)

  const subscribeChat = useCallback(
    (listener: () => void) => {
      if (!chatStore) return NOOP_UNSUBSCRIBE
      const syncFromChat = () => {
        const snap = chatStore.getSnapshot()
        reconcileLatestA2uiCommand(sessionId, resolveLatestA2uiCommandState(snap))
        if (isChatTimelineActive(snap) && getCommandNotice(sessionId) !== null) {
          dismissCommandNotice(sessionId)
        }
      }
      syncFromChat()
      return chatStore.subscribe(() => {
        syncFromChat()
        listener()
      })
    },
    [chatStore, sessionId],
  )
  const getChatSnapshot = useCallback(() => chatStore?.getSnapshot(), [chatStore])
  const chatSnapshot = useSyncExternalStore(subscribeChat, getChatSnapshot, getChatSnapshot)
  const chatActive = useMemo(() => isChatTimelineActive(chatSnapshot), [chatSnapshot])
  const latestCommand = useMemo(() => resolveLatestA2uiCommandState(chatSnapshot), [chatSnapshot])

  const enabled = resolveEffectiveA2uiEnabled(sessionId, latestCommand)
  const visibleNotice = notice !== null && !chatActive ? notice : null

  const handleDismissNotice = useCallback(() => {
    dismissCommandNotice(sessionId, notice?.seq)
  }, [notice?.seq, sessionId])

  const handleToggle = useCallback(() => {
    const prev = enabled
    const next = !prev
    const targetSessionId = sessionId
    const targetKey = targetSessionId ?? '__global__'
    const cmdSeq = latestCommand?.seq
    setA2uiEnabled(targetSessionId, next, cmdSeq, true)
    if (!syncHostEnabled) return
    const reqId = (reqSeqBySessionRef.current.get(targetKey) ?? 0) + 1
    reqSeqBySessionRef.current.set(targetKey, reqId)
    setBusyBySession((cur) => ({ ...cur, [targetKey]: reqId }))
    void syncHostEnabled(next)
      .then(
        (ok) => {
          if (!ok && reqSeqBySessionRef.current.get(targetKey) === reqId) {
            setA2uiEnabled(targetSessionId, prev, cmdSeq, false)
          }
        },
        () => {
          if (reqSeqBySessionRef.current.get(targetKey) === reqId) {
            setA2uiEnabled(targetSessionId, prev, cmdSeq, false)
          }
        },
      )
      .finally(() => {
        setBusyBySession((cur) => {
          if (cur[targetKey] !== reqId) return cur
          const copy = { ...cur }
          delete copy[targetKey]
          return copy
        })
      })
  }, [enabled, latestCommand?.seq, sessionId, syncHostEnabled])

  const msg = useShellMessages()
  const tooltip = enabled ? msg.toggleOnTooltip : msg.toggleOffTooltip

  const triggerClass = [css.trigger, enabled ? css.triggerOn : css.triggerOff]
    .filter(Boolean)
    .join(' ')

  return (
    <>
      <DshTooltip label={tooltip}>
        <button
          type="button"
          className={triggerClass}
          aria-label={tooltip}
          aria-pressed={enabled}
          disabled={busy}
          data-a2ui-toggle=""
          data-enabled={enabled ? 'true' : 'false'}
          onClick={handleToggle}
        >
          <span className={css.triggerIcon} aria-hidden="true">
            {APPS_ICON_14}
          </span>
          <span className={css.triggerLabel}>A2UI</span>
        </button>
      </DshTooltip>
      {visibleNotice !== null ? (
        <DshToast
          key={visibleNotice.seq}
          text={visibleNotice.text}
          tone={visibleNotice.kind === 'success' ? 'success' : undefined}
          icon={visibleNotice.kind === 'error' ? WARNING_ICON_16 : undefined}
          onDone={handleDismissNotice}
        />
      ) : null}
    </>
  )
})
