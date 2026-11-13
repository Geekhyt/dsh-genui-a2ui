import { describe, expect, it } from 'vitest'
import { StreamingExpressSession } from '../src/client/streaming.ts'

describe('StreamingExpressSession', () => {
  it('progressively emits createSurface and update messages as an unwrapped ui string grows', () => {
    const session = new StreamingExpressSession()
    const full = [
      'surface("demo")',
      '$/user = "DeepSeek"',
      'root = Card(Column([',
      '  Text("### 欢迎使用 A2UI 1.0"),',
      '  TextField(label="用户名", value=$/user),',
      '  Button(Text("提交"), variant="primary", action=Event("submit", {user: $/user}))',
      ']))',
    ].join('\n')

    let prefix = ''
    let firstEmissionAt = -1
    let lastCount = 0

    for (let i = 0; i < full.length; i += 12) {
      prefix = full.slice(0, i + 12)
      const snap = session.advance(prefix)
      if (snap.messages.length > 0 && firstEmissionAt < 0) {
        firstEmissionAt = prefix.length
      }
      expect(snap.messages.length).toBeGreaterThanOrEqual(lastCount)
      lastCount = snap.messages.length
    }

    const finalSnap = session.advance(full, true)
    expect(firstEmissionAt).toBeGreaterThan(0)
    expect(firstEmissionAt).toBeLessThan(full.length)
    expect(finalSnap.surfaceIds).toEqual(['demo'])
    expect(finalSnap.messages.length).toBeGreaterThanOrEqual(2)
  })
})
