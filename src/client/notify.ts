export function notifySubscribers(listeners: ReadonlySet<() => void>, label: string): void {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch (err) {
      console.error(`[dsh-genui-a2ui] ${label} listener threw:`, err)
    }
  }
}
