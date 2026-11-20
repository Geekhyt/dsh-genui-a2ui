/**
 * Reactive DSH client locale hooks (`html[lang]`), mirroring `src/client/theme.ts`.
 *
 * DeepSeek Harness `LocaleRuntime` syncs the active UI language onto
 * `document.documentElement.lang` (`"zh-CN"` vs `"en"`). Observing that attribute
 * updates every A2UI chrome label live without reloading the window.
 */
import { useSyncExternalStore } from 'react'
import {
  RUNTIME_MESSAGES,
  type RuntimeUiMessages,
  resolveClientLocale,
  SHELL_MESSAGES,
  type ShellUiMessages,
  subscribeUiLocaleOverride,
  type UiLocale,
} from '../shared/i18n.ts'

const localeListeners = new Set<() => void>()
let sharedLocaleObserver: MutationObserver | null = null
let sharedOverrideUnsub: (() => void) | null = null

function notifyLocaleListeners(): void {
  for (const listener of localeListeners) {
    listener()
  }
}

export function subscribeClientLocale(listener: () => void): () => void {
  localeListeners.add(listener)
  if (sharedOverrideUnsub === null) {
    sharedOverrideUnsub = subscribeUiLocaleOverride(notifyLocaleListeners)
  }
  if (
    sharedLocaleObserver === null &&
    typeof document !== 'undefined' &&
    typeof MutationObserver !== 'undefined' &&
    document.documentElement
  ) {
    sharedLocaleObserver = new MutationObserver(notifyLocaleListeners)
    sharedLocaleObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['lang'],
    })
  }
  return () => {
    localeListeners.delete(listener)
    if (localeListeners.size === 0) {
      sharedLocaleObserver?.disconnect()
      sharedLocaleObserver = null
      sharedOverrideUnsub?.()
      sharedOverrideUnsub = null
    }
  }
}

/** Reactively track DSH UI language (`'zh'` | `'en'`). */
export function useUiLocale(): UiLocale {
  return useSyncExternalStore(subscribeClientLocale, resolveClientLocale, resolveClientLocale)
}

/** Shell-level bilingual UI strings (`lib/client.js`). */
export function useShellMessages(): ShellUiMessages {
  return SHELL_MESSAGES[useUiLocale()]
}

/** Runtime & 57-widget catalog bilingual UI strings (`lib/client.runtime.js`). */
export function useRuntimeMessages(): RuntimeUiMessages {
  return RUNTIME_MESSAGES[useUiLocale()]
}
