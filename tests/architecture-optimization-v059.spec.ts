import { Catalog, MessageProcessor, type ProcessableMessage } from '@a2ui/web_core/v1_0'
import { describe, expect, it } from 'vitest'
import { DSH_FUNCTIONS } from '../src/client/catalog/functions.ts'
import { StreamingExpressSession } from '../src/client/runtime/streaming.ts'
import { A2UI_SYSTEM_GUIDANCE } from '../src/index.ts'
import { DSH_CATALOG_ID, dshSchemaCatalog } from '../src/shared/catalog-schema.ts'

const nodeEvalCatalog = new Catalog(
  DSH_CATALOG_ID,
  '1.0',
  [...dshSchemaCatalog.components.values()],
  DSH_FUNCTIONS,
)

function materializeSurface(messages: readonly unknown[], surfaceId: string) {
  const proc = new MessageProcessor([nodeEvalCatalog])
  proc.processMessages(messages as ProcessableMessage[])
  const surf = proc.model.getSurface(surfaceId)
  expect(surf).toBeDefined()
  return {
    data: surf?.dataModel.get('/'),
    components: [...(surf?.componentsModel.entries ?? [])].map(([id, comp]) => [
      id,
      comp.type,
      comp.properties,
    ]),
  }
}

describe('Core bundle & streaming optimizations (v0.5.9)', () => {
  it('keeps always-on A2UI_SYSTEM_GUIDANCE compact while preserving core contracts', () => {
    expect(A2UI_SYSTEM_GUIDANCE.length).toBeLessThan(8500)
    expect(A2UI_SYSTEM_GUIDANCE).toContain('a2ui_render')
    expect(A2UI_SYSTEM_GUIDANCE).toContain('a2ui_ask')
    expect(A2UI_SYSTEM_GUIDANCE).toContain('Scoped Skills')
    expect(A2UI_SYSTEM_GUIDANCE).toContain('surface("snake_id")')
    expect(A2UI_SYSTEM_GUIDANCE).toContain('calc(')
  })

  it('converges to identical surface state under token-by-token prefix caching and incremental validation', () => {
    const program = [
      'surface("stream_inc")',
      '$/count = 3',
      '$/rate = 0.95',
      'k1 = Stat("Active", "128", delta="+12%", trend="up")',
      'k2 = Stat("Error Rate", "0.2%", delta="-0.1%", trend="down")',
      'root = Column([Text("Summary", variant="h3"), Row([k1, k2])])',
    ].join('\n')

    const tokenSession = new StreamingExpressSession()
    let lastState = tokenSession.advance('', false)
    for (let i = 1; i < program.length; i += 3) {
      lastState = tokenSession.advance(program.slice(0, i), false)
      expect(lastState.error).toBeNull()
    }
    const finalIncremental = tokenSession.advance(program, true)
    expect(finalIncremental.error).toBeNull()

    const oneShot = new StreamingExpressSession().advance(program, true)
    expect(oneShot.error).toBeNull()
    expect(materializeSurface(finalIncremental.messages, 'stream_inc')).toEqual(
      materializeSurface(oneShot.messages, 'stream_inc'),
    )
  })
})
