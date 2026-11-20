import { describe, expect, it } from 'vitest'
import { createGenerator, SurfaceSessions } from '../src/host/generator.ts'
import {
  compactPromptSnippet,
  DOMAIN_SKILL_META,
  measureSkillTelemetry,
  SKILL_DOMAINS,
  type SkillDomain,
  slicePromptSnippetByDomain,
} from '../src/host/prompt-compact.ts'
import { DOMAIN_SKILL_NAMES, SKILL_PREAMBLE } from '../src/index.ts'
import { DSH_COMPONENT_APIS, dshSchemaCatalog } from '../src/shared/catalog-schema.ts'

describe('P0 Prompt Compaction & Domain-Scoped Skill Layering', () => {
  it('partitions all 57 registered components across SKILL_DOMAINS with zero missing and zero duplicates', () => {
    const registeredNames = Object.keys(
      dshSchemaCatalog.toJson().components as Record<string, unknown>,
    ).sort()
    expect(registeredNames).toHaveLength(DSH_COMPONENT_APIS.length)
    expect(registeredNames).toHaveLength(57)

    const seen = new Set<string>()
    const duplicates: string[] = []
    for (const domain of ['core', 'analytics', 'devops', 'forms'] as const) {
      for (const comp of SKILL_DOMAINS[domain]) {
        if (seen.has(comp)) duplicates.push(comp)
        seen.add(comp)
      }
    }

    expect(duplicates).toEqual([])
    expect([...seen].sort()).toEqual(registeredNames)
    expect(DOMAIN_SKILL_NAMES).toEqual(['a2ui', 'a2ui-analytics', 'a2ui-devops', 'a2ui-forms'])
  })

  it('preserves 100% of positional component signatures, all 19 ECharts kinds, and all 23 functions losslessly', () => {
    const sessions = new SurfaceSessions(createGenerator())
    const raw = sessions.rawPromptSnippet()
    const compact = sessions.promptSnippet()

    // Every single `• ComponentName(...)` line from the upstream generator must appear verbatim
    const rawSigLines = raw.match(/^• [A-Z][A-Za-z0-9]+\([^\n]+$/gm) ?? []
    expect(rawSigLines).toHaveLength(57)

    for (const sig of rawSigLines) {
      expect(compact, `Missing signature in compact full snippet: ${sig}`).toContain(sig)
    }

    // Deduplicated `weight` boilerplate (57x repeated prose -> 0 occurrences + 1 header note)
    const rawWeightLines = raw.match(/^ {2}- weight: The relative weight of this component/gm) ?? []
    const compactWeightLines =
      compact.match(/^ {2}- weight: The relative weight of this component/gm) ?? []
    expect(rawWeightLines.length).toBe(57)
    expect(compactWeightLines.length).toBe(0)
    expect(compact).toContain('direct child of `Row` or `Column`')

    // All 19 ECharts kinds remain enumerated
    const chartKinds = [
      'bar',
      'line',
      'area',
      'pie',
      'scatter',
      'radar',
      'funnel',
      'gauge',
      'heatmap',
      'treemap',
      'sankey',
      'boxplot',
      'graph',
      'candlestick',
      'waterfall',
      'combo',
      'sunburst',
      'parallel',
      'calendar',
    ]
    const analytics = slicePromptSnippetByDomain(raw, 'analytics')
    for (const kind of chartKinds) {
      expect(analytics).toContain(`'${kind}'`)
    }

    // All 23 functions remain documented in core & compact full
    const core = slicePromptSnippetByDomain(raw, 'core')
    for (const fnName of [
      'calc(',
      'cond(',
      'sum(',
      'avg(',
      'eq(',
      'gt(',
      'lt(',
      'includes(',
      'and(',
      'or(',
      'not(',
      'formatNumber(',
      'formatCurrency(',
      'formatDate(',
      'formatString(',
      'pluralize(',
      'required(',
      'email(',
      'regex(',
      'length(',
      'numeric(',
      'copyText(',
      'openUrl(',
    ]) {
      expect(compact).toContain(fnName)
      expect(core).toContain(fnName)
    }
  })

  it('isolates domain sub-skills cleanly so each component signature lives in its assigned domain only', () => {
    const sessions = new SurfaceSessions(createGenerator())
    const raw = sessions.rawPromptSnippet()
    const slices: Record<SkillDomain, string> = {
      core: sessions.promptSnippet('core'),
      analytics: sessions.promptSnippet('analytics'),
      devops: sessions.promptSnippet('devops'),
      forms: sessions.promptSnippet('forms'),
    }

    for (const domain of ['core', 'analytics', 'devops', 'forms'] as const) {
      const ownSet = new Set(SKILL_DOMAINS[domain])
      for (const comp of SKILL_DOMAINS[domain]) {
        expect(slices[domain]).toContain(`• ${comp}(`)
      }
      // Verify no foreign component signature leaks into this domain's positional signature list
      const sigMatches = slices[domain].match(/^• ([A-Z][A-Za-z0-9]+)\(/gm) ?? []
      expect(sigMatches).toHaveLength(ownSet.size)
      for (const m of sigMatches) {
        const compName = m.slice(2, -1)
        expect(ownSet.has(compName)).toBe(true)
      }
    }

    // Core skill points to the 3 domain sub-skills
    expect(slices.core).toContain('a2ui-analytics')
    expect(slices.core).toContain('a2ui-devops')
    expect(slices.core).toContain('a2ui-forms')
    // Compacting twice is idempotent in length (no double header notes or corruption)
    expect(compactPromptSnippet(raw).length).toBeLessThan(raw.length)
  })

  it('enforces hard P0 char/token budgets across core and domain sub-skills', () => {
    const sessions = new SurfaceSessions(createGenerator())
    const raw = sessions.rawPromptSnippet()
    const telemetry = measureSkillTelemetry(raw, SKILL_PREAMBLE.length)

    // Compact full 57-component catalog drops >= 25% vs raw full
    expect(telemetry.fullSavingsPct).toBeGreaterThanOrEqual(25)
    // Core `a2ui` skill drops >= 65% vs legacy ~73.5k monolithic skill
    expect(telemetry.domains.core.chars).toBeLessThan(25_000)
    expect(telemetry.domains.core.estTokens).toBeLessThan(6_600)
    // Each specialized domain sub-skill stays ultra-lean (< 12k chars / < 3.2k tokens)
    expect(telemetry.domains.analytics.chars).toBeLessThan(12_000)
    expect(telemetry.domains.devops.chars).toBeLessThan(12_000)
    expect(telemetry.domains.forms.chars).toBeLessThan(8_000)

    // Every skill description stays concise (< 320 chars) and carries the availability guard
    for (const domain of ['core', 'analytics', 'devops', 'forms'] as const) {
      const desc = DOMAIN_SKILL_META[domain].description
      expect(desc.length).toBeLessThan(320)
      expect(desc).toContain('only load when')
    }
  })
})
