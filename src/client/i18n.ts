/**
 * Reactive DSH client locale hooks (`html[lang]`), mirroring `src/client/theme.ts`.
 *
 * DeepSeek Harness `LocaleRuntime` syncs the active UI language onto
 * `document.documentElement.lang` (`"zh-CN"` vs `"en"`). Observing that attribute
 * updates every A2UI chrome label live without reloading the window.
 */
import { useSyncExternalStore } from 'react'
import {
  resolveClientLocale,
  RUNTIME_MESSAGES,
  type RuntimeUiMessages,
  SHELL_MESSAGES,
  type ShellUiMessages,
  subscribeUiLocaleOverride,
  type UiLocale,
} from '../shared/i18n.ts'

function subscribeClientLocale(listener: () => void): () => void {
  const unsubOverride = subscribeUiLocaleOverride(listener)
  if (
    typeof document === 'undefined' ||
    typeof MutationObserver === 'undefined' ||
    !document.documentElement
  ) {
    return unsubOverride
  }
  const observer = new MutationObserver(listener)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['lang'],
  })
  return () => {
    observer.disconnect()
    unsubOverride()
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

/** Runtime & 32-widget catalog bilingual UI strings (`lib/client.runtime.js`). */
export function useRuntimeMessages(): RuntimeUiMessages {
  return RUNTIME_MESSAGES[useUiLocale()]
}
