import { describe, expect, it } from 'vitest'
import { ExpressParser } from '@a2ui/agent'
import { createGenerator, SurfaceSessions } from '../src/host/generator.ts'
import { DSH_CATALOG_ID, dshSchemaCatalog } from '../src/shared/catalog-schema.ts'
// @ts-expect-error plain ESM helper script
import { ANALYTICS_UPDATE_UI, BOOKING_UI, DASHBOARD_UI } from '../scripts/mock-llm.mjs'

describe('M1: dshSchemaCatalog with @a2ui/agent ExpressParser', () => {
  it('serializes cleanly to A2UI v1.0 catalog JSON and compiles DSH extension components', () => {
    const json = dshSchemaCatalog.toJson()
    expect(json.catalogId).toBe(DSH_CATALOG_ID)
    const components = json.components as Record<string, unknown>
    expect(Object.keys(components)).toEqual(
      expect.arrayContaining(['Text', 'Button', 'Card', 'Chart', 'Table', 'Stat', 'Progress', 'Badge', 'Code']),
    )

    const parser = new ExpressParser([dshSchemaCatalog])
    const parts = parser.parseResponse(DASHBOARD_UI, { wrapped: false })
    const messages = parts.flatMap((p) => (p.type === 'a2ui' ? p.a2ui : []))
    expect(messages.length).toBeGreaterThanOrEqual(1)
    const createMsg = messages.find((m) => 'createSurface' in m) as
      | { createSurface: { surfaceId: string; catalogId: string; components?: Array<{ component: string }> } }
      | undefined
    expect(createMsg?.createSurface.surfaceId).toBe('analytics')
    expect(createMsg?.createSurface.catalogId).toBe(DSH_CATALOG_ID)
    const compTypes = (createMsg?.createSurface.components ?? []).map((c) => c.component)
    expect(compTypes).toEqual(
      expect.arrayContaining(['Chart', 'Table', 'Stat', 'Progress', 'Badge', 'Code', 'Tabs', 'Modal']),
    )
  })

  it('compiles mock-llm BOOKING_UI, DASHBOARD_UI, and ANALYTICS_UPDATE_UI end-to-end in SurfaceSessions', () => {
    const sessions = new SurfaceSessions(createGenerator())
    const bookingMsgs = sessions.compile('s1', BOOKING_UI)
    expect(bookingMsgs.length).toBeGreaterThan(0)

    const dashMsgs = sessions.compile('s1', DASHBOARD_UI)
    expect(dashMsgs.length).toBeGreaterThan(0)

    const updateMsgs = sessions.compile('s1', ANALYTICS_UPDATE_UI)
    expect(JSON.stringify(updateMsgs)).toContain('updateDataModel')
  })
})
