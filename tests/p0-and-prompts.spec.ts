import { describe, expect, it } from 'vitest'
import {
  computeLineDiff,
  normalizeKeyValueItems,
  normalizeStepItems,
  pairSplitDiffRows,
} from '../src/client/catalog/p0-helpers.ts'
import { createGenerator, SurfaceSessions } from '../src/host/generator.ts'
import {
  A2UI_SYSTEM_GUIDANCE,
  apply,
  FAST_PATH_EXAMPLE,
  GOLDEN_ASK_EXAMPLE,
  GOLDEN_CALCULATOR_EXAMPLE,
  GOLDEN_DASHBOARD_EXAMPLE,
  SKILL_DESCRIPTION,
  SKILL_PREAMBLE,
  SYSTEM_PROMPT_SECTION_NAME,
  SYSTEM_PROMPT_SECTION_ORDER,
} from '../src/index.ts'
import { DSH_COMPONENT_APIS, dshSchemaCatalog } from '../src/shared/catalog-schema.ts'

describe('P0 components: DiffView, Steps, Callout, KeyValue', () => {
  it('exposes all 32 components in dshSchemaCatalog and compiles P0 compositions cleanly', () => {
    expect(DSH_COMPONENT_APIS).toHaveLength(32)
    const json = dshSchemaCatalog.toJson()
    const compNames = Object.keys(json.components as Record<string, unknown>)
    expect(compNames).toEqual(
      expect.arrayContaining(['DiffView', 'Steps', 'Callout', 'KeyValue']),
    )

    const sessions = new SurfaceSessions(createGenerator())
    const compiled = sessions.compile(
      'sess-p0',
      [
        'surface("p0_review")',
        '$/oldCfg = "port: 8080\\nworkers: 2"',
        '$/newCfg = "port: 8080\\nworkers: 8\\ntimeout: 30s"',
        '$/stages = [',
        '  { title: "静态检查", status: "done", meta: "0.8s" },',
        '  { title: "灰度验证", status: "active", description: "Canary 25%" },',
        '  { title: "全量切流", status: "pending" }',
        ']',
        '$/meta = { "集群": "prod-cn-hz", "命名空间": "payments" }',
        'root = Card(Column([',
        '  Callout("发现高并发参数调整", "请审阅下方配置差异与发布阶段", tone="warning", collapsible=true, child=KeyValue($/meta, columns=2, copyable=true)),',
        '  DiffView($/oldCfg, $/newCfg, title="server.yaml", language="yaml", mode="split"),',
        '  Steps($/stages, direction="vertical", title="发布阶段")',
        ']))',
      ].join('\n'),
    )
    expect(compiled.length).toBeGreaterThan(0)
    const createMsg = compiled.find((m) => 'createSurface' in m) as
      | { createSurface: { components?: Array<{ component: string }> } }
      | undefined
    const usedTypes = (createMsg?.createSurface.components ?? []).map((c) => c.component)
    expect(usedTypes).toEqual(
      expect.arrayContaining(['Callout', 'KeyValue', 'DiffView', 'Steps']),
    )
  })

  it('computes accurate LCS line diffs, split rows, normalized steps, and key-value maps', () => {
    const diff = computeLineDiff('a\nb\nc\nd', 'a\nb_mod\nc\ne\nd')
    expect(diff.removed).toBe(1)
    expect(diff.added).toBe(2)
    const split = pairSplitDiffRows(diff.ops)
    expect(split.length).toBeGreaterThanOrEqual(4)

    const steps = normalizeStepItems(
      ['拉取镜像', { title: '数据库迁移', meta: '1.2s' }, '切流验证'],
      1,
    )
    expect(steps.map((s) => s.status)).toEqual(['done', 'active', 'pending'])
    expect(steps[1]?.meta).toBe('1.2s')

    const fromMap = normalizeKeyValueItems({ region: 'cn-east', replicas: 4 }, true)
    expect(fromMap).toEqual([
      { label: 'region', value: 'cn-east', copyable: true, mono: false },
      { label: 'replicas', value: '4', copyable: true, mono: false },
    ])
  })
})

describe('Prompt optimizations & cross-restart update=true hydration', () => {
  it('keeps Fast-Path and Golden Examples 100% valid against the live Express compiler', () => {
    const sessions = new SurfaceSessions(createGenerator())
    expect(sessions.compile('sess-fast', FAST_PATH_EXAMPLE).length).toBeGreaterThan(0)
    expect(sessions.compile('sess-golden-1', GOLDEN_DASHBOARD_EXAMPLE).length).toBeGreaterThan(0)
    expect(sessions.compile('sess-golden-calc', GOLDEN_CALCULATOR_EXAMPLE).length).toBeGreaterThan(0)
    expect(sessions.compile('sess-golden-2', GOLDEN_ASK_EXAMPLE).length).toBeGreaterThan(0)
  })

  it('compacts verbose CLDR pluralize prose, caps skill description <500 chars, and includes routing guards', () => {
    const sessions = new SurfaceSessions(createGenerator())
    const snippet = sessions.promptSnippet()
    expect(snippet).not.toContain('Slavic languages')
    expect(snippet).toContain('pluralize(value, other, one?, zero?)')
    expect(SKILL_DESCRIPTION.length).toBeLessThan(400)
    expect(SKILL_DESCRIPTION).toContain('only load when a2ui_render or a2ui_ask is available')
    expect(SKILL_PREAMBLE).toContain('ask_user_question')
    expect(A2UI_SYSTEM_GUIDANCE).toContain('information topology of your answer')
  })

  it('injects systemPrompt section when ON and emits 0 tokens when OFF, restricted, or in subagent', () => {
    let registeredSection:
      | {
          name: string
          order: number
          interpolate?: boolean
          text: (ctx: { scope?: unknown; toolSet?: unknown }) => string
        }
      | undefined
    let renderWhen: ((ctx: { agent?: unknown }) => boolean) | undefined
    let toggleCmd:
      | ((inv: { agent?: { session?: { id?: string } }; rawInput: string }) => { kind: string })
      | undefined
    let toolAdmitted = true

    const fakeCtx = {
      inject(_deps: string[], fn: (inner: unknown) => void) {
        fn({
          tools: {
            register: (def: { name: string }, opts?: { when?: (ctx: { agent?: unknown }) => boolean }) => {
              if (def.name === 'a2ui_render') renderWhen = opts?.when
              return () => {}
            },
            get: (name: string) => (name === 'a2ui_render' && toolAdmitted ? { name } : undefined),
          },
          systemPrompt: {
            section: (sec: typeof registeredSection) => {
              registeredSection = sec
              return () => {}
            },
          },
          skills: { register: () => () => {} },
          commands: {
            register: (cmd: { name: string; handler: typeof toggleCmd }) => {
              if (cmd.name === 'a2ui') toggleCmd = cmd.handler
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
    expect(registeredSection).toBeDefined()
    expect(registeredSection?.name).toBe(SYSTEM_PROMPT_SECTION_NAME)
    expect(registeredSection?.order).toBe(SYSTEM_PROMPT_SECTION_ORDER)
    expect(registeredSection?.interpolate).toBe(false)

    const mainAgent = { session: { id: 'sess-prompt' } }
    expect(renderWhen?.({ agent: mainAgent })).toBe(true)
    expect(registeredSection!.text({ scope: mainAgent })).toBe(A2UI_SYSTEM_GUIDANCE)

    // Subagent receives 0 system-prompt tokens and 0 tool schemas
    const subAgent = { isSubagent: true, session: { id: 'sess-sub' } }
    expect(renderWhen?.({ agent: subAgent })).toBe(false)
    expect(registeredSection!.text({ scope: subAgent })).toBe('')

    // Toolset restriction suppresses system-prompt guidance
    toolAdmitted = false
    expect(registeredSection!.text({ scope: mainAgent })).toBe('')
    toolAdmitted = true

    // Turning A2UI switch OFF suppresses both tools and system-prompt guidance (0 tokens)
    toggleCmd!({ agent: mainAgent, rawInput: 'off' })
    expect(renderWhen?.({ agent: mainAgent })).toBe(false)
    expect(registeredSection!.text({ scope: mainAgent })).toBe('')

    // Turning A2UI switch back ON restores both
    toggleCmd!({ agent: mainAgent, rawInput: 'on' })
    expect(renderWhen?.({ agent: mainAgent })).toBe(true)
    expect(registeredSection!.text({ scope: mainAgent })).toBe(A2UI_SYSTEM_GUIDANCE)
  })

  it('hydrates surface("id", update=true) seamlessly on a cold post-restart session', () => {
    const coldSessions = new SurfaceSessions(createGenerator())
    const messages = coldSessions.compile(
      'resumed-after-restart',
      'surface("ci_dock", update=true)\n$/pct = 100\n$/stage = "全量发布已完成"',
    )
    expect(messages.length).toBeGreaterThan(0)
    expect(JSON.stringify(messages)).toContain('updateDataModel')
  })
})
