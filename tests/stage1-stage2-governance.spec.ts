import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Catalog, DataContext, MessageProcessor } from '@a2ui/web_core/v1_0'
import { describe, expect, it } from 'vitest'
import { enrichActionWithSelection, formatActionMessage } from '../src/client/action-protocol.ts'
import {
  computeCalc,
  computeCond,
  computeEq,
  computeGt,
  computeIncludes,
  computeLt,
  DSH_FUNCTIONS,
} from '../src/client/catalog/functions.ts'
import { StreamingExpressSession } from '../src/client/streaming.ts'
import {
  A2UI_SURFACE_NODE_KIND,
  filterMessagesBySurfaceIds,
  resolveDockBatch,
  resolveLatestA2uiCommandState,
  resolveTurnTailBatch,
  type ChatTargetSnapshot,
} from '../src/client/turn-surfaces.ts'
import { createGenerator, SurfaceSessions } from '../src/host/generator.ts'
import { apply, GOLDEN_CALCULATOR_EXAMPLE } from '../src/index.ts'
import { validateCalcExpression } from '../src/shared/calc-engine.ts'
import { DSH_CATALOG_ID, DSH_COMPONENT_APIS, DSH_FUNCTION_APIS } from '../src/shared/catalog-schema.ts'

describe('Stage 1 Governance: surface message pruning, memo stability, & switch sync', () => {
  it('prunes unrelated surface messages per turn and preserves === batch identity across snapshots', () => {
    const nodes = [
      {
        kind: A2UI_SURFACE_NODE_KIND,
        id: 'call-1',
        anchorSeq: 10,
        location: { turn: { turn: 1, status: 'closed' } },
        data: {
          callId: 'call-1',
          turn: 1,
          seq: 10,
          title: '北京气候',
          placement: 'answer',
          surfaceIds: ['weather'],
          messages: [{ version: '1.0', createSurface: { surfaceId: 'weather' } } as never],
        },
      },
      {
        kind: A2UI_SURFACE_NODE_KIND,
        id: 'call-2',
        anchorSeq: 20,
        location: { turn: { turn: 2, status: 'closed' } },
        data: {
          callId: 'call-2',
          turn: 2,
          seq: 20,
          title: '机型对比',
          placement: 'answer',
          surfaceIds: ['compare'],
          messages: [{ version: '1.0', createSurface: { surfaceId: 'compare' } } as never],
        },
      },
      {
        kind: A2UI_SURFACE_NODE_KIND,
        id: 'call-3',
        anchorSeq: 30,
        location: { turn: { turn: 3, status: 'closed' } },
        data: {
          callId: 'call-3',
          turn: 3,
          seq: 30,
          title: '北京气候（已更新）',
          placement: 'answer',
          surfaceIds: ['weather'],
          messages: [
            { version: '1.0', updateDataModel: { surfaceId: 'weather', path: '/hi', value: 12 } } as never,
          ],
        },
      },
      {
        kind: A2UI_SURFACE_NODE_KIND,
        id: 'call-dock',
        anchorSeq: 35,
        location: { turn: { turn: 3, status: 'closed' } },
        data: {
          callId: 'call-dock',
          turn: 3,
          seq: 35,
          title: '任务进度',
          placement: 'dock',
          surfaceIds: ['dock_bar'],
          messages: [{ version: '1.0', createSurface: { surfaceId: 'dock_bar' } } as never],
        },
      },
    ]

    const snap1: ChatTargetSnapshot = { nodes: { values: () => nodes } }
    const t2First = resolveTurnTailBatch(snap1, 2)
    expect(t2First).not.toBeNull()
    // Turn 2 ONLY receives `compare` messages — zero `weather` messages leaked!
    expect(t2First!.messages).toHaveLength(1)
    expect(JSON.stringify(t2First!.messages)).toContain('compare')
    expect(JSON.stringify(t2First!.messages)).not.toContain('weather')

    // Turn 3 receives `weather`'s full cross-turn chain (Turn 1 create + Turn 3 update), zero `compare` or `dock_bar`!
    const t3 = resolveTurnTailBatch(snap1, 3)
    expect(t3!.messages).toHaveLength(2)
    expect(JSON.stringify(t3!.messages)).not.toContain('compare')

    // Dock ONLY receives `dock_bar` messages!
    const dock = resolveDockBatch(snap1)
    expect(dock!.messages).toHaveLength(1)
    expect(JSON.stringify(dock!.messages)).toContain('dock_bar')

    // New snapshot during Turn 4 text streaming keeps exact === reference for Turn 2 & Dock!
    const snap2: ChatTargetSnapshot = {
      nodes: {
        values: () => [
          ...nodes,
          { kind: 'assistant-text', id: 'txt-4', anchorSeq: 40, data: { text: 'streaming...' } },
        ],
      },
    }
    expect(resolveTurnTailBatch(snap2, 2)).toBe(t2First)
    expect(resolveDockBatch(snap2)).toBe(dock)
    expect(filterMessagesBySurfaceIds(t3!.messages, new Set())).toEqual([])
  })

  it('persists /a2ui switch state across Host restarts and detects /a2ui slash commands in chat', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'dsh-a2ui-state-'))
    const stateFile = join(tmp, 'state.json')
    try {
      let cmdHandler:
        | ((inv: { agent?: { session?: { id?: string } }; rawInput: string }) => {
            kind: string
            text?: string
          })
        | undefined

      const makeCtx = () => ({
        inject(_deps: string[], fn: (inner: unknown) => void) {
          fn({
            tools: { register: () => () => {} },
            skills: { register: () => () => {} },
            commands: {
              register: (cmd: { name: string; handler: typeof cmdHandler }) => {
                if (cmd.name === 'a2ui') cmdHandler = cmd.handler
                return () => {}
              },
            },
            effect: (cb: () => () => void) => cb(),
          })
        },
        on: () => () => {},
      })

      apply(makeCtx() as never, { stateFile })
      const agent = { session: { id: 's-persist' } }
      expect(cmdHandler!({ agent, rawInput: 'status' }).text).toContain('已开启')
      expect(cmdHandler!({ agent, rawInput: 'off' }).text).toContain('已关闭')

      // Simulate cold Host restart reading from the same `stateFile`
      apply(makeCtx() as never, { stateFile })
      expect(cmdHandler!({ agent: { session: { id: 's-new' } }, rawInput: 'status' }).text).toContain(
        '已关闭',
      )

      // Client chat command detector picks up the latest `/a2ui` command outcome
      const chatSnap: ChatTargetSnapshot = {
        nodes: {
          values: () => [
            {
              kind: 'command',
              anchorSeq: 12,
              data: { name: 'a2ui', seq: 12, outcome: { kind: 'success', text: 'A2UI 生成式界面已关闭' } },
            },
            {
              kind: 'command',
              anchorSeq: 18,
              data: { name: 'a2ui', seq: 18, outcome: { kind: 'success', text: 'A2UI 生成式界面已开启' } },
            },
          ],
        },
      }
      expect(resolveLatestA2uiCommandState(chatSnap)).toEqual({ seq: 18, enabled: true })
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('tolerates numeric Stat values, Text h1-h5 variants, and streaming update=true hydration', () => {
    const sessions = new SurfaceSessions(createGenerator())
    const compiled = sessions.compile(
      'sess-tolerant',
      [
        'surface("tolerant_demo")',
        'root = Card(Column([',
        '  Text("11月北京气候概览", variant="h3"),',
        '  Row([Stat("日均高温", 10, delta=-4, trend="down", weight=1), Stat("降水天数", 3, weight=1)])',
        ']))',
      ].join('\n'),
    )
    expect(compiled.length).toBeGreaterThan(0)

    // Client streaming parser seeds unknown `update=true` surfaces on the fly
    const stream = new StreamingExpressSession()
    const snap = stream.advance('surface("cold_card", update=true)\n$/temp = 11\n', true)
    expect(snap.error).toBeNull()
    expect(snap.surfaceIds).toContain('cold_card')
    expect(JSON.stringify(snap.messages)).toContain('updateDataModel')
  })
})

describe('Stage 2 Evolution: slimmed calc() formula gateway, static validation & Click-to-Drill', () => {
  it('keeps Catalog function surface orthogonal (only 9 DSH semantic functions) and evaluates calc & comparators', () => {
    // 14 Basic functions + 9 orthogonal DSH functions = 23 total (no redundant add/mul/pow bloat)
    expect(DSH_FUNCTION_APIS).toHaveLength(23)
    const fnNames = DSH_FUNCTION_APIS.map((f) => f.name)
    expect(fnNames).toContain('calc')
    expect(fnNames).not.toContain('add')
    expect(fnNames).not.toContain('mul')
    expect(fnNames).not.toContain('pow')

    // ChoicePicker single-select array unwrapping + minimal UI comparators
    expect(computeEq(['benxi'], 'benxi')).toBe(true)
    expect(computeEq('100', 100)).toBe(true)
    expect(computeGt(5000, 4688.08)).toBe(true)
    expect(computeLt(3.85, 4.2)).toBe(true)
    expect(computeIncludes(['cdn', 'rds'], 'rds')).toBe(true)
    expect(computeIncludes(['cdn', 'rds'], 'oss')).toBe(false)
    expect(computeCond(true, '预算内', '超预算')).toBe('预算内')
    expect(computeCond(false, '预算内', '超预算')).toBe('超预算')

    // Algebraic `calc(expr, vars, decimals)` engine (infix ^, unary -exp, ternaries, functions, safety)
    expect(computeCalc('0.1 + 0.2')).toBe(0.3)
    expect(computeCalc('2 ^ 10')).toBe(1024)
    expect(computeCalc('round(exp(1), 4)')).toBe(2.7183)
    expect(computeCalc('log(1000, 10) + sqrt(144) + clamp(150, 0, 100)')).toBe(115)
    expect(
      computeCalc(
        'p * (r/1200) / (1 - (1 + r/1200)^-(y*12))',
        { p: 1_000_000, r: 3.85, y: 30 },
        2,
      ),
    ).toBe(4688.08)
    expect(computeCalc('pmt(r/1200, y*12, p)', { p: 1_000_000, r: 3.85, y: 30 }, 2)).toBe(4688.08)
    expect(
      computeCalc(
        'nodes * unit * months * (months >= 12 ? 0.85 : months >= 6 ? 0.92 : 1) + storage * 0.35',
        { nodes: 4, unit: 680, months: 12, storage: 500 },
        2,
      ),
    ).toBe(27919)
    expect(computeCalc('100 / 0', {}, 2)).toBe(0)
    expect(computeCalc('window.alert(1)', {}, 2)).toBe(0)
    expect(validateCalcExpression('p * (1 + r)^n', new Set(['p', 'r', 'n']))).toBeNull()
  })

  it('executes exact equal-installment & equal-principal mortgage formulas reactively via DataContext', () => {
    const sessions = new SurfaceSessions(createGenerator())
    const msgs = sessions.compile('sess-mortgage', GOLDEN_CALCULATOR_EXAMPLE)
    const testCatalog = new Catalog(
      DSH_CATALOG_ID,
      '1.0',
      DSH_COMPONENT_APIS.map((api) => ({ ...api, widget: () => null })),
      DSH_FUNCTIONS,
    )
    const proc = new MessageProcessor([testCatalog], () => {})
    proc.processMessages(msgs as never)

    const surface = proc.getSurfaces().get('loan_calc')!
    expect(surface).toBeDefined()
    const ctx = new DataContext(surface, '/')

    const stats = [...surface.componentsModel.entries]
      .filter(([, c]) => c.type === 'Stat')
      .map(([, c]) => c)
    const chart = [...surface.componentsModel.entries].find(([, c]) => c.type === 'Chart')![1]

    // Default: 100万, 30年, 3.85%, 等额本息 -> exact monthly = 4,688.08, total interest = 68.77万, total = 168.77万
    expect(ctx.resolveDynamicValue(stats[0]!.properties.label as never)).toBe('每月月供')
    expect(String(ctx.resolveDynamicValue(stats[0]!.properties.value as never))).toContain('4,688.08')
    expect(ctx.resolveDynamicValue(stats[1]!.properties.value as never)).toBe(68.77)
    expect(ctx.resolveDynamicValue(stats[2]!.properties.value as never)).toBe(168.77)
    expect(ctx.resolveDynamicValue(chart.properties.data as never)).toEqual([
      { item: '贷款本金', wan: 100 },
      { item: '累计利息', wan: 68.77 },
    ])

    // Switch ChoicePicker mode to 等额本金 (`$/mode = ["benjin"]`) -> exact first-month = 5,986.11, interest = 57.91万
    surface.dataModel.set('/mode', ['benjin'])
    expect(ctx.resolveDynamicValue(stats[0]!.properties.label as never)).toBe('首月月供')
    expect(String(ctx.resolveDynamicValue(stats[0]!.properties.value as never))).toContain('5,986.11')
    expect(ctx.resolveDynamicValue(stats[1]!.properties.value as never)).toBe(57.91)
    expect(ctx.resolveDynamicValue(chart.properties.data as never)).toEqual([
      { item: '贷款本金', wan: 100 },
      { item: '累计利息', wan: 57.91 },
    ])

    // Drag Years slider to 20 years (`$/years = 20`) back on 等额本息 -> live recomputation
    surface.dataModel.set('/mode', ['benxi'])
    surface.dataModel.set('/years', 20)
    expect(String(ctx.resolveDynamicValue(stats[0]!.properties.value as never))).toContain('5,981.06')
  })

  it('statically validates calc() syntax, unknown functions, unbound vars, pruned math, and $/path traps on Host', () => {
    const sessions = new SurfaceSessions(createGenerator())

    // 1. $/path storing a reactive expression
    expect(() =>
      sessions.compile(
        'sess-bad-path',
        'surface("bad")\n$/v = 1000000\n$/x = calc("v * 0.5", { v: $/v })\nroot = Stat("测试", $/x)',
      ),
    ).toThrow(/WITHOUT `\$\/`/)

    // 2. Unclosed parenthesis inside calc() expr caught at Host compile time!
    expect(() =>
      sessions.compile(
        'sess-bad-syntax',
        'surface("bad_syn")\n$/w = 100\nroot = Stat("测试", calc("w * (1 + 2", { w: $/w }))',
      ),
    ).toThrow(/Invalid calc\(\) formula.*Unclosed "\("/)

    // 3. Unknown function inside calc() expr caught at Host compile time!
    expect(() =>
      sessions.compile(
        'sess-bad-fn',
        'surface("bad_fn")\n$/w = 100\nroot = Stat("测试", calc("unknownFn(w)", { w: $/w }))',
      ),
    ).toThrow(/Unknown math function "unknownFn\(\.\.\.\)"/)

    // 4. Forgotten variable in `vars` map caught at Host compile time!
    expect(() =>
      sessions.compile(
        'sess-unbound-var',
        'surface("bad_var")\n$/w = 100\nroot = Stat("测试", calc("w * r", { w: $/w }))',
      ),
    ).toThrow(/Unbound variable "r"/)

    // 5. Calling pruned binary math (`mul`) emits actionable `calc(...)` self-repair tip
    expect(() =>
      sessions.compile(
        'sess-pruned-mul',
        'surface("pruned")\n$/w = 100\nroot = Stat("测试", mul($/w, 2))',
      ),
    ).toThrow(/unified in `calc\(expr, vars\?, decimals\?\)`/)
  })

  it('compiles Chart & Table click-to-drill actions and enriches [a2ui-action] selection payloads', () => {
    const sessions = new SurfaceSessions(createGenerator())
    const drillMsgs = sessions.compile(
      'sess-drill',
      [
        'surface("drill_demo")',
        '$/rows = [{ period: "上旬", hi: 14, lo: 3 }, { period: "下旬", hi: 4, lo: -5 }]',
        'root = Card(Column([',
        '  Chart("bar", $/rows, xField="period", yField=["hi", "lo"], action=Event("drill_chart")),',
        '  Table($/rows, searchable=true, action=Event("drill_row"))',
        ']))',
      ].join('\n'),
    )
    expect(drillMsgs.length).toBeGreaterThan(0)

    const rawAction = {
      name: 'drill_chart',
      surfaceId: 'drill_demo',
      sourceComponentId: 'c_chart',
      context: { view: 'climate' },
      metadata: {
        extensions: {
          dshSelection: {
            source: 'chart',
            label: '下旬',
            series: 'lo',
            value: -5,
            index: 1,
            row: { period: '下旬', hi: 4, lo: -5 },
          },
        },
      },
    }
    const enriched = enrichActionWithSelection(rawAction as never)
    expect(enriched.userMessage).toBe('下钻查看：下旬 · lo (-5)')
    const wireText = formatActionMessage(rawAction as never, {})
    expect(wireText).toContain('用户说明：下钻查看：下旬 · lo (-5)')
    expect(wireText).toContain('"selection":{"source":"chart","label":"下旬","series":"lo","value":-5')
  })
})
