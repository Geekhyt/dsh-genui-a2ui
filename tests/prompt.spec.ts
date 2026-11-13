import { describe, expect, it } from 'vitest'
import { ExpressPromptGenerator } from '@a2ui/agent'
import { basicCatalog } from '@a2ui/web_core/v1_0'
import { createGenerator, RENDER_TOOL, SENTINEL_PARAGRAPH, SurfaceSessions } from '../src/host/generator.ts'

describe('ToolChannelPromptGenerator', () => {
  it('replaces the SDK <a2ui> sentinel paragraph with the a2ui_render tool contract', () => {
    // Guard against upstream SDK wording changes silently skipping our replacement.
    const upstream = new ExpressPromptGenerator([basicCatalog]).generateBaseRules()
    expect(SENTINEL_PARAGRAPH.test(upstream)).toBe(true)

    const sessions = new SurfaceSessions(createGenerator())
    const snippet = sessions.promptSnippet()
    expect(snippet).toContain(RENDER_TOOL)
    expect(snippet).not.toMatch(SENTINEL_PARAGRAPH)
    expect(snippet).toContain('Card(')
    expect(snippet).toContain('Button(')
    expect(snippet).toContain('Text(')
    expect(snippet).toContain('Chart(')
    expect(snippet).toContain('Table(')
    expect(snippet).toContain('Stat(')
    expect(snippet).toContain('Progress(')
    expect(snippet).toContain('Badge(')
    expect(snippet).toContain('Code(')
  })
})
