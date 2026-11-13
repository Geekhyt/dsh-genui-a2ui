/**
 * Composer toolbar 1-click A2UI switch mounted in `conversation.input.left`.
 *
 * Single click toggles `dsh-genui-a2ui` between:
 * - `true` (ON): exposes `a2ui_render` and `a2ui_ask` (all 32 DSH + Basic components);
 * - `false` (OFF): hides A2UI tools from the model's step toolSet (plain Markdown mode).
 *
 * Syncs with the Host via `session.command('/a2ui on|off')` (`recordInput: false`).
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useShellMessages } from './i18n.ts'
import { getA2uiEnabled, setA2uiEnabled, subscribeA2uiEnabled } from './persistence.ts'
import type { ChatExternalStore } from './ToolView.tsx'
import { resolveLatestA2uiCommandState } from './turn-surfaces.ts'
import { DshAppsIcon, DshTooltip } from './ui/primitives.tsx'
import css from './TierControl.module.css'

export interface A2uiTierControlProps {
  readonly sessionId?: string | undefined
  readonly chatStore?: ChatExternalStore | undefined
  readonly syncHostEnabled?: ((enabled: boolean) => Promise<boolean>) | undefined
}

const NOOP_SUBSCRIBE = () => () => {}

export const A2uiTierControl = memo(function A2uiTierControl({
  sessionId,
  chatStore,
  syncHostEnabled,
}: A2uiTierControlProps) {
  const [busy, setBusy] = useState(false)
  const lastCommandKeyRef = useRef<string | null>(null)

  const getEnabled = useCallback(() => getA2uiEnabled(sessionId), [sessionId])
  const enabled = useSyncExternalStore<boolean>(subscribeA2uiEnabled, getEnabled, getEnabled)

  const subscribeChat = useCallback(
    (listener: () => void) => (chatStore ? chatStore.subscribe(listener) : NOOP_SUBSCRIBE()),
    [chatStore],
  )
  const getChatSnapshot = useCallback(() => chatStore?.getSnapshot(), [chatStore])
  const chatSnapshot = useSyncExternalStore(subscribeChat, getChatSnapshot, () => undefined)
  const latestCommand = useMemo(
    () => resolveLatestA2uiCommandState(chatSnapshot),
    [chatSnapshot],
  )

  // Mirror manual `/a2ui` (`on` | `off` | toggle) slash commands back onto the client pill state.
  // Note: Do NOT auto-fire `syncHostEnabled` on session mount — `session.command('/a2ui ...')`
  // appends a visible command log row in DSH, and Host already persists `defaultEnabled` in
  // `~/.dsh/dsh-genui-a2ui-state.json`. Only dispatch `/a2ui` when the user clicks the toggle button.
  useEffect(() => {
    if (!latestCommand) return
    const key = `${sessionId ?? 'global'}::${latestCommand.seq}`
    if (lastCommandKeyRef.current === key) return
    const isInitialMountForSession =
      lastCommandKeyRef.current === null ||
      !lastCommandKeyRef.current.startsWith(`${sessionId ?? 'global'}::`)
    lastCommandKeyRef.current = key
    if (isInitialMountForSession) {
      setA2uiEnabled(sessionId, latestCommand.enabled)
      return
    }
    if (getA2uiEnabled(sessionId) !== latestCommand.enabled) {
      setA2uiEnabled(sessionId, latestCommand.enabled)
    }
  }, [latestCommand, sessionId])

  const handleToggle = useCallback(() => {
    const next = !enabled
    setA2uiEnabled(sessionId, next)
    if (!syncHostEnabled) return
    setBusy(true)
    void syncHostEnabled(next)
      .catch(() => false)
      .finally(() => {
        setBusy(false)
      })
  }, [enabled, sessionId, syncHostEnabled])

  const msg = useShellMessages()
  const tooltip = enabled ? msg.toggleOnTooltip : msg.toggleOffTooltip

  const triggerClass = [css.trigger, enabled ? css.triggerOn : css.triggerOff]
    .filter(Boolean)
    .join(' ')

  return (
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
          <DshAppsIcon size={14} />
        </span>
        <span className={css.triggerLabel}>A2UI</span>
      </button>
    </DshTooltip>
  )
})
