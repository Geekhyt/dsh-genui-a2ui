import { describe, expect, it } from 'vitest'
import { createGenerator, SurfaceSessions } from '../src/host/generator.ts'
import { createRenderTool } from '../src/host/render-tool.ts'
import { A2UI_LIMITS } from '../src/shared/catalog-schema.ts'

describe('a2ui_render host tool', () => {
  it('compiles a fresh Express program into v1.0 createSurface messages and presentationMeta', async () => {
    const sessions = new SurfaceSessions(createGenerator())
    const tool = createRenderTool(sessions)

    const value = await tool.execute(
      {
        title: '预算面板',
        ui: [
          'surface("budget")',
          '$/total = 1280',
          'root = Card(Text("预算总计"))',
        ].join('\n'),
      },
      { agent: { session: { id: 'sess-1' } } },
    )

    expect(value.status).toBe('rendered')
    expect(value.title).toBe('预算面板')
    expect(value.surfaceIds).toEqual(['budget'])
    expect(value.messages.length).toBeGreaterThan(0)

    const meta = tool.output.presentationMeta({}, value)
    expect(meta.kind).toBe('dsh-a2ui')
    expect(meta.version).toBe(1)
    expect(meta.surfaceIds).toEqual(['budget'])
    expect(meta.messages).toEqual(value.messages)

    const renderedText = tool.output.render({}, value)
    expect(renderedText[0]?.text).toContain('budget')
  })

  it('maintains per-session RendererState so surface("id", update=true) emits update messages', async () => {
    const sessions = new SurfaceSessions(createGenerator())
    const tool = createRenderTool(sessions)
    const exec = { agent: { session: { id: 'sess-update' } } }

    await tool.execute(
      { ui: 'surface("calc")\n$/count = "1"\nroot = Card(Text($/count))' },
      exec,
    )

    const second = await tool.execute(
      { ui: 'surface("calc", update=true)\n$/count = "2"' },
      exec,
    )

    expect(second.surfaceIds).toEqual(['calc'])
    expect(JSON.stringify(second.messages)).toContain('updateDataModel')
  })

  it('rejects unknown components with actionable diagnostics and preserves prior session state', async () => {
    const sessions = new SurfaceSessions(createGenerator())
    const tool = createRenderTool(sessions)
    const exec = { agent: { session: { id: 'sess-rollback' } } }

    await tool.execute(
      { ui: 'surface("main")\n$/ok = "yes"\nroot = Card(Text($/ok))' },
      exec,
    )

    await expect(
      tool.execute({ ui: 'surface("main", update=true)\nroot = NonExistentWidget(foo=1)' }, exec),
    ).rejects.toThrow(/rejected/)

    // Session state was rolled back cleanly: a subsequent valid update still succeeds!
    const recovered = await tool.execute(
      { ui: 'surface("main", update=true)\n$/ok = "recovered"' },
      exec,
    )
    expect(recovered.surfaceIds).toEqual(['main'])
  })

  it('tolerates accidental <a2ui> tags, markdown fences, or JSON-stringified args', async () => {
    const sessions = new SurfaceSessions(createGenerator())
    const tool = createRenderTool(sessions)

    const wrapped = JSON.stringify({
      title: '容错测试',
      ui: '<a2ui>\n```a2ui\nsurface("wrap")\nroot = Text("hello")\n```\n</a2ui>',
    })
    const res = await tool.execute(wrapped, { agent: { session: { id: 'sess-wrap' } } })
    expect(res.surfaceIds).toEqual(['wrap'])
    expect(res.title).toBe('容错测试')
  })

  it('enforces subagent guard, per-turn repair cap, and maxUiChars safety limits', async () => {
    const sessions = new SurfaceSessions(createGenerator())
    const tool = createRenderTool(sessions)
    expect(tool.description).toContain('Mermaid')
    expect(tool.description).toContain('Accordion')
    expect(tool.description).toContain('JsonTree')
    expect(tool.description).toContain('FileTree')

    await expect(
      tool.execute({ ui: 'surface("sub")\nroot = Text("hi")' }, { parentCallId: 'call_parent_1' }),
    ).rejects.toThrow(/subagent/)

    const disposedExec = { agent: { session: { id: 'sess-disposed' } } }
    await expect(
      tool.execute({ ui: 'surface("bad")\nroot = NopeWidget()' }, disposedExec),
    ).rejects.toThrow(new RegExp(`retry 1/${A2UI_LIMITS.maxRepairsPerTurn}`))
    sessions.forget('sess-disposed')
    await expect(
      tool.execute({ ui: 'surface("bad")\nroot = NopeWidget()' }, disposedExec),
    ).rejects.toThrow(new RegExp(`retry 1/${A2UI_LIMITS.maxRepairsPerTurn}`))

    const exec = { agent: { session: { id: 'sess-cap' } } }
    for (let i = 1; i <= A2UI_LIMITS.maxRepairsPerTurn; i++) {
      await expect(
        tool.execute({ ui: 'surface("bad")\nroot = NopeWidget()' }, exec),
      ).rejects.toThrow(new RegExp(`retry ${i}/${A2UI_LIMITS.maxRepairsPerTurn}`))
    }
    await expect(
      tool.execute({ ui: 'surface("bad")\nroot = NopeWidget()' }, exec),
    ).rejects.toThrow(/STOP calling a2ui_render/)

    const hugeUi = `surface("huge")\nroot = Text("${'x'.repeat(A2UI_LIMITS.maxUiChars + 100)}")`
    await expect(
      tool.execute({ ui: hugeUi }, { agent: { session: { id: 'sess-huge' } } }),
    ).rejects.toThrow(/exceeds maximum/)
  })
})
