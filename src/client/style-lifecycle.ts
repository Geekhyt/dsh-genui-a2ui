/**
 * Reversible browser stylesheet lifecycle for `dsh-genui-a2ui`.
 *
 * Pairs with `cssInlinePlugin` in `build/preset.ts` so every `<style data-plugin>`
 * injected by main or lazy chunks is cleanly detached on Cordis plugin dispose
 * and deterministically restored if the plugin is re-enabled without reloading
 * the Electron / Web window.
 */

export interface PluginCssRegistry {
  mounted: boolean
  sheets: Map<string, string>
}

const DEFAULT_PLUGIN_ID = 'dsh-genui-a2ui'

export function getPluginCssRegistry(pluginId = DEFAULT_PLUGIN_ID): PluginCssRegistry {
  const key = `__dshPluginCss__:${pluginId}`
  const bag = globalThis as unknown as Record<string, PluginCssRegistry | undefined>
  let reg = bag[key]
  if (!reg) {
    reg = { mounted: true, sheets: new Map() }
    bag[key] = reg
  }
  return reg
}

export function isPluginStylesMounted(pluginId = DEFAULT_PLUGIN_ID): boolean {
  return getPluginCssRegistry(pluginId).mounted
}

export function mountPluginCssSheets(pluginId = DEFAULT_PLUGIN_ID): void {
  const reg = getPluginCssRegistry(pluginId)
  reg.mounted = true
  if (typeof document === 'undefined') return
  for (const [tagId, css] of reg.sheets.entries()) {
    if (document.querySelector(`style[data-plugin-css=${JSON.stringify(tagId)}]`) === null) {
      const tag = document.createElement('style')
      tag.dataset.plugin = pluginId
      tag.dataset.pluginCss = tagId
      tag.textContent = css
      document.head.appendChild(tag)
    }
  }
}

export function unmountPluginCssSheets(pluginId = DEFAULT_PLUGIN_ID): void {
  const reg = getPluginCssRegistry(pluginId)
  reg.mounted = false
  if (typeof document === 'undefined') return
  for (const node of document.querySelectorAll(`style[data-plugin=${JSON.stringify(pluginId)}]`)) {
    node.remove()
  }
}
