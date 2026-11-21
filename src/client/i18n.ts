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
import { notifySubscribers } from './notify.ts'

const localeListeners = new Set<() => void>()
let sharedLocaleObserver: MutationObserver | null = null
let sharedOverrideUnsub: (() => void) | null = null
let sharedLanguageListenerAttached = false

function notifyLocaleListeners(): void {
  notifySubscribers(localeListeners, 'Locale')
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
  if (
    !sharedLanguageListenerAttached &&
    typeof window !== 'undefined' &&
    typeof window.addEventListener === 'function'
  ) {
    window.addEventListener('languagechange', notifyLocaleListeners)
    sharedLanguageListenerAttached = true
  }
  return () => {
    localeListeners.delete(listener)
    if (localeListeners.size === 0) {
      sharedLocaleObserver?.disconnect()
      sharedLocaleObserver = null
      sharedOverrideUnsub?.()
      sharedOverrideUnsub = null
      if (
        sharedLanguageListenerAttached &&
        typeof window !== 'undefined' &&
        typeof window.removeEventListener === 'function'
      ) {
        window.removeEventListener('languagechange', notifyLocaleListeners)
        sharedLanguageListenerAttached = false
      }
    }
  }
}

export function useUiLocale(): UiLocale {
  return useSyncExternalStore(subscribeClientLocale, resolveClientLocale, resolveClientLocale)
}

export function useShellMessages(): ShellUiMessages {
  return SHELL_MESSAGES[useUiLocale()]
}

export function useRuntimeMessages(): RuntimeUiMessages {
  return RUNTIME_MESSAGES[useUiLocale()]
}
