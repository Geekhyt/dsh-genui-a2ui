import { describe, expect, it } from 'vitest'
import {
  computeArrayAvg,
  computeArraySum,
  parseSafeExternalUrl,
} from '../src/client/catalog/functions.ts'
import { createGenerator, SurfaceSessions } from '../src/host/generator.ts'
import { apply } from '../src/index.ts'

describe('M3: hardened openUrl & DSH local functions (copyText, sum, avg)', () => {
  it('allows explicit https/http/mailto URLs and blocks relative or javascript/file URLs', () => {
    expect(parseSafeExternalUrl('https://a2ui.org/quickstart/')).toBe('https://a2ui.org/quickstart/')
    expect(parseSafeExternalUrl('mailto:team@example.com')).toBe('mailto:team@example.com')

    expect(() => parseSafeExternalUrl('/api/internal')).toThrow(/Invalid or relative URL/)
    expect(() => parseSafeExternalUrl('javascript:alert(1)')).toThrow(/Unsupported URL scheme/)
    expect(() => parseSafeExternalUrl('file:///etc/passwd')).toThrow(/Unsupported URL scheme/)
    expect(() => parseSafeExternalUrl('data:text/html,<h1>x</h1>')).toThrow(/Unsupported URL scheme/)
  })

  it('computes reactive sum and avg over bound arrays and compiles them in Express', () => {
    const rows = [{ q2: 1520 }, { q2: 1140 }, { q2: 1360 }]
    expect(computeArraySum(rows, 'q2')).toBe(4020)
    expect(computeArrayAvg(rows, 'q2')).toBe(1340)

    const sessions = new SurfaceSessions(createGenerator())
    const compiled = sessions.compile(
      'sess-fn',
      [
        'surface("kpi_fn")',
        '$/rows = [{ q2: 1520 }, { q2: 1140 }]',
        '$/sql = "SELECT * FROM sales;"',
        'root = Card(Column([',
        '  Stat("Q2 汇总", formatNumber(value=sum(items=$/rows, field="q2"))),',
        '  Stat("Q2 均值", formatNumber(value=avg(items=$/rows, field="q2"))),',
        '  Button(Text("复制 SQL"), action=copyText(text=$/sql))',
        ']))',
      ].join('\n'),
    )
    expect(compiled.length).toBeGreaterThan(0)
  })
})

describe('M3: /a2ui 1-click toggle & on/off command', () => {
  it('toggles on empty input and accepts explicit on / off arguments', async () => {
    let toggleHandler:
      | ((inv: { agent?: { session?: { id?: string } }; rawInput: string }) => { kind: string; text?: string })
      | undefined

    const fakeCtx = {
      inject(_deps: string[], fn: (inner: unknown) => void) {
        fn({
          tools: { register: () => () => {} },
          skills: { register: () => () => {} },
          commands: {
            register: (cmd: { name: string; handler: typeof toggleHandler }) => {
              if (cmd.name === 'a2ui') toggleHandler = cmd.handler
              return () => {}
            },
          },
          effect: (cb: () => () => void) => cb(),
        })
      },
      on() {
        return () => {}
      },
    }

    apply(fakeCtx as never)
    expect(toggleHandler).toBeDefined()

    const agent = { session: { id: 'sess-cmd' } }

    // Empty input toggles ON -> OFF -> ON
    const r1 = toggleHandler!({ agent, rawInput: '' })
    expect(r1).toEqual({ kind: 'success', text: 'A2UI 生成式界面已关闭' })

    const r2 = toggleHandler!({ agent, rawInput: '' })
    expect(r2).toEqual({ kind: 'success', text: 'A2UI 生成式界面已开启' })

    // Explicit `off` / `on`
    expect(toggleHandler!({ agent, rawInput: 'off' })).toEqual({
      kind: 'success',
      text: 'A2UI 生成式界面已关闭',
    })
    expect(toggleHandler!({ agent, rawInput: 'on' })).toEqual({
      kind: 'success',
      text: 'A2UI 生成式界面已开启',
    })

    // Unknown argument rejected cleanly
    expect(toggleHandler!({ agent, rawInput: 'invalid' }).kind).toBe('error')
  })
})
