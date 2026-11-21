export type UiLocale = 'zh' | 'en'

interface SharedLocaleState {
  override: UiLocale | null
  readonly listeners: Set<() => void>
}

const LOCALE_STATE_KEY = '__dshA2uiI18n__'

function getSharedLocaleState(): SharedLocaleState {
  const bag = globalThis as unknown as Record<string, SharedLocaleState | undefined>
  let state = bag[LOCALE_STATE_KEY]
  if (!state) {
    state = { override: null, listeners: new Set() }
    bag[LOCALE_STATE_KEY] = state
  }
  return state
}

export function setUiLocaleOverride(next: UiLocale | null): void {
  const state = getSharedLocaleState()
  if (state.override === next) return
  state.override = next
  for (const listener of [...state.listeners]) {
    try {
      listener()
    } catch {}
  }
}

export function getUiLocaleOverride(): UiLocale | null {
  return getSharedLocaleState().override
}

export function subscribeUiLocaleOverride(listener: () => void): () => void {
  const state = getSharedLocaleState()
  state.listeners.add(listener)
  return () => {
    state.listeners.delete(listener)
  }
}

function parseLocaleTag(raw: unknown): UiLocale | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim().toLowerCase()
  if (trimmed === '') return null
  if (trimmed.startsWith('zh')) return 'zh'
  if (trimmed.startsWith('en')) return 'en'
  return null
}

function isVitestEnv(): boolean {
  return (
    typeof process !== 'undefined' &&
    typeof process.env === 'object' &&
    process.env !== null &&
    Boolean(process.env.VITEST)
  )
}

export function resolveClientLocale(): UiLocale {
  const override = getSharedLocaleState().override
  if (override !== null) return override

  const globalTag = parseLocaleTag(
    (globalThis as { readonly __DSH_A2UI_LOCALE__?: unknown }).__DSH_A2UI_LOCALE__,
  )
  if (globalTag !== null) return globalTag

  if (typeof document !== 'undefined') {
    const htmlLang =
      document.documentElement?.getAttribute?.('lang') ?? document.documentElement?.lang
    if (typeof htmlLang === 'string' && htmlLang.trim() !== '') {
      return htmlLang.trim().toLowerCase().startsWith('zh') ? 'zh' : 'en'
    }
  }

  if (!isVitestEnv()) {
    if (typeof process !== 'undefined' && process.env?.DSH_A2UI_LOCALE) {
      const envTag = parseLocaleTag(process.env.DSH_A2UI_LOCALE)
      if (envTag !== null) return envTag
    }
    if (typeof navigator !== 'undefined' && typeof navigator.language === 'string') {
      const navTag = parseLocaleTag(navigator.language)
      if (navTag !== null) return navTag
    }
  }

  return 'zh'
}

export function resolveHostLocale(): UiLocale {
  const override = getSharedLocaleState().override
  if (override !== null) return override
  if (typeof process !== 'undefined' && process.env) {
    const explicit = parseLocaleTag(process.env.DSH_A2UI_LOCALE)
    if (explicit !== null) return explicit
    if (process.env.VITEST) return 'zh'
    const sys = parseLocaleTag(process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG)
    if (sys !== null) return sys
  }
  return 'zh'
}
