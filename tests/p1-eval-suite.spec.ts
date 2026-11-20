import { describe, expect, it } from 'vitest'
import { computeConcat, computeLookup } from '../src/client/catalog/functions.ts'
import {
  aggregateEvalSummary,
  classifyCompileError,
  createEvalSession,
  EVAL_BENCHMARK_CASES,
  finalizeCaseResult,
  gradeToolAttempt,
} from '../src/host/eval-suite.ts'
import {
  desugarExpressConcat,
  flattenChainedCalc,
  foldNestedCondToLookup,
} from '../src/host/express-preprocess.ts'
import { SKILL_DOMAINS } from '../src/host/prompt-compact.ts'
import { validateCalcExpression } from '../src/shared/calc-engine.ts'

describe('P1 Real LLM Generation & Self-Repair Eval Suite', () => {
  it('defines 28 unique, well-formed benchmark cases covering all 4 skill domains + negative controls', () => {
    expect(EVAL_BENCHMARK_CASES).toHaveLength(28)

    const ids = new Set(EVAL_BENCHMARK_CASES.map((c) => c.id))
    expect(ids.size).toBe(28)

    const positives = EVAL_BENCHMARK_CASES.filter((c) => c.expectedTool !== 'none')
    const negatives = EVAL_BENCHMARK_CASES.filter((c) => c.expectedTool === 'none')
    expect(positives.length).toBe(23)
    expect(negatives.length).toBe(5)

    // Covers a2ui_ask blocking wizard and persistent dock placement
    expect(EVAL_BENCHMARK_CASES.some((c) => c.expectedTool === 'a2ui_ask')).toBe(true)
    expect(EVAL_BENCHMARK_CASES.some((c) => c.expectedPlacement === 'dock')).toBe(true)

    // Covers all 4 P0 skill domains
    const domainsCovered = new Set(positives.map((c) => c.expectedDomain).filter(Boolean))
    expect([...domainsCovered].sort()).toEqual(['analytics', 'core', 'devops', 'forms'])

    // Every expected component name is a real registered catalog component
    const allRegistered = new Set(Object.values(SKILL_DOMAINS).flat())
    for (const c of positives) {
      for (const comp of c.expectedAnyComponents ?? []) {
        expect(allRegistered.has(comp), `Unknown component ${comp} in case ${c.id}`).toBe(true)
      }
    }
  })

  it('classifies real SurfaceSessions.compile() failures into deterministic error taxonomy buckets', () => {
    const sessions = createEvalSession()

    // 1. Expression assigned to $/path -> EXPR_IN_DATA_MODEL
    const exprRes = gradeToolAttempt(
      sessions,
      'err-expr',
      1,
      'a2ui_render',
      'surface("bad1")\n$/x = 10\n$/y = calc("x * 2", { x: $/x })\nroot = Card(Stat("Y", $/y))',
    )
    expect(exprRes.compiledOk).toBe(false)
    expect(exprRes.errorBucket).toBe('EXPR_IN_DATA_MODEL')

    // 2. Unknown hallucinated component -> UNKNOWN_COMPONENT
    const unkRes = gradeToolAttempt(
      sessions,
      'err-unk',
      1,
      'a2ui_render',
      'surface("bad2")\nroot = Card(TotallyFakeWidget("hi"))',
    )
    expect(unkRes.compiledOk).toBe(false)
    expect(unkRes.errorBucket).toBe('UNKNOWN_COMPONENT')

    // 3. Invalid prop key (`latencyMs` instead of `latency`) -> INVALID_PROP_OR_ARG
    const propRes = gradeToolAttempt(
      sessions,
      'err-prop',
      1,
      'a2ui_render',
      'surface("bad3")\nroot = Card(ApiEndpoint("GET", "/v1/health", latencyMs=12))',
    )
    expect(propRes.compiledOk).toBe(false)
    expect(propRes.errorBucket).toBe('INVALID_PROP_OR_ARG')

    // 4. Direct classifier checks for remaining buckets
    expect(classifyCompileError('Invalid calc() formula AST depth exceeded')).toBe(
      'CALC_SAFETY_OR_SYNTAX',
    )
    expect(
      classifyCompileError('Table cells must be plain scalar primitives, no nested Badge'),
    ).toBe('NESTED_TABLE_CELL')
    expect(classifyCompileError('Express program length exceeds maximum (64000 chars)')).toBe(
      'LIMIT_EXCEEDED',
    )
    expect(classifyCompileError('Syntax error: unexpected token ```')).toBe('SYNTAX_OR_FENCE')

    // 5. Quote-safe `+` string concatenation auto-desugars to `concat([...])` and compiles cleanly!
    const plusAutoFixed = gradeToolAttempt(
      sessions,
      'ok-plus-concat',
      1,
      'a2ui_render',
      'surface("p")\n$/x = 10\nroot = Card(Stat("Mem", formatNumber($/x) + " GB", caption="总计 " + formatNumber($/x) + " GB"))',
    )
    expect(plusAutoFixed.compiledOk).toBe(true)
    expect(plusAutoFixed.usedComponents).toEqual(expect.arrayContaining(['Card', 'Stat']))

    // Bare numeric `+` (no string literal / format*) is NOT desugared and still returns helpful calc() tip
    const bareMathErr = gradeToolAttempt(
      sessions,
      'err-bare-math',
      1,
      'a2ui_render',
      'surface("m")\n$/a = 1\n$/b = 2\nroot = Card(Stat("Sum", $/a + $/b))',
    )
    expect(bareMathErr.compiledOk).toBe(false)
    expect(bareMathErr.errorMessage).toContain('calc(')

    const colonErr = gradeToolAttempt(
      sessions,
      'err-colon',
      1,
      'a2ui_render',
      'surface("c")\nroot = Card(EntityHeader("Title", status: "healthy"))',
    )
    expect(colonErr.compiledOk).toBe(false)
    expect(colonErr.errorMessage).toContain('Named component arguments MUST use `=`')

    const actionErr = gradeToolAttempt(
      sessions,
      'err-act',
      1,
      'a2ui_render',
      'surface("a")\nroot = Card(ApprovalCard("DDL", approveAction="ok"))',
    )
    expect(actionErr.compiledOk).toBe(false)
    expect(actionErr.errorMessage).toContain('Event("action_name"')

    const dotErr = gradeToolAttempt(
      sessions,
      'err-dot',
      1,
      'a2ui_render',
      'surface("d")\n$/g = { name: "A800" }\n$/gpuName = g.name\nroot = Card(Text($/gpuName))',
    )
    expect(dotErr.compiledOk).toBe(false)
    expect(dotErr.errorMessage).toContain('NO JavaScript dot-access')
  })

  it('aggregates 0-repair first-pass rate, self-repair recovery, routing accuracy, and component heatmaps', () => {
    const sessions = createEvalSession()
    const posCase = EVAL_BENCHMARK_CASES[0]!
    const negCase = EVAL_BENCHMARK_CASES.find((c) => c.expectedTool === 'none')!

    // Case 1: fails on attempt 1, recovers on attempt 2
    const bad1 = gradeToolAttempt(
      sessions,
      'agg-1a',
      1,
      'a2ui_render',
      'surface("s1")\nroot = Card(ApiEndpoint("GET", "/v1/x", latencyMs=9))',
    )
    const ok2 = gradeToolAttempt(
      sessions,
      'agg-1b',
      2,
      'a2ui_render',
      'surface("s1")\n$/d = [{ k: "A", v: 10 }, { k: "B", v: 20 }]\nroot = Card(Column([Stat("Total", "30"), Chart("bar", $/d, xField="k", yField="v")]))',
    )
    const r1 = finalizeCaseResult(posCase, [bad1, ok2], ['a2ui-analytics'], {
      promptTokens: 5200,
      completionTokens: 400,
      latencyMs: 900,
    })
    expect(r1.firstPassCompiled).toBe(false)
    expect(r1.finalCompiled).toBe(true)
    expect(r1.repaired).toBe(true)
    expect(r1.usedComponents).toEqual(expect.arrayContaining(['Card', 'Column', 'Stat', 'Chart']))
    expect(r1.usedChartKinds).toEqual(['bar'])

    // Case 2: negative control properly stays in Markdown (no UI call)
    const negAttempt = gradeToolAttempt(sessions, 'agg-neg', 1, 'none')
    const r2 = finalizeCaseResult(negCase, [negAttempt], [], {
      promptTokens: 2900,
      completionTokens: 110,
      latencyMs: 300,
    })
    expect(r2.routingCorrect).toBe(true)
    expect(r2.firstPassCompiled).toBe(true)

    const summary = aggregateEvalSummary([r1, r2], {
      model: 'test-model',
      strategy: 'scoped',
      mode: 'mock',
    })
    expect(summary.totalCases).toBe(2)
    expect(summary.routingAccuracyPct).toBe(100)
    expect(summary.falsePositiveCount).toBe(0)
    expect(summary.firstPassCompileRatePct).toBe(0)
    expect(summary.finalCompileRatePct).toBe(100)
    expect(summary.selfRepairRecoveryPct).toBe(100)
    expect(summary.errorTaxonomy.INVALID_PROP_OR_ARG).toBe(1)
    expect(summary.chartKindCounts.bar).toBe(1)
    expect(summary.skillLoadCounts['a2ui-analytics']).toBe(1)
  })

  it('desugars JS + string concatenation and folds nested cond(eq(...)) + chained calc() under depth 5', () => {
    // 1. desugarExpressConcat preserves calc("a + b") and quotes while rewriting formatNumber(x) + " GB"
    const rawConcat =
      'surface("s_cat")\n$/n = 4\ntotal = calc("n + 2", { n: $/n })\nroot = Card(Stat("VRAM", formatNumber(total) + " GB", caption="A + B"))'
    const desugared = desugarExpressConcat(rawConcat)
    expect(desugared).toContain('calc("n + 2", { n: $/n })')
    expect(desugared).toContain('caption="A + B"')
    expect(desugared).toContain('concat([formatNumber(total), " GB"])')

    // 2. foldNestedCondToLookup collapses 3-level cond(eq(...)) chain to depth-1 lookup()
    const rawCond =
      'vram = cond(eq($/tier, "l40s"), 48, cond(eq($/tier, "a800"), 80, cond(eq($/tier, "h800"), 80, 96)))'
    const folded = foldNestedCondToLookup(rawCond)
    expect(folded).toBe('vram = lookup($/tier, { "l40s": 48, "a800": 80, "h800": 80 }, 96)')

    // 3. Runtime computeConcat & computeLookup (including single-select ChoicePicker array unwrap)
    expect(computeConcat(['¥', 120, ' 万'])).toBe('¥120 万')
    expect(computeLookup('h800', { l40s: 48, h800: 80 }, 96)).toBe(80)
    expect(computeLookup(['a800'], { l40s: 48, a800: 80 }, 96)).toBe(80)
    expect(computeLookup('unknown', { l40s: 48 }, 96)).toBe(96)

    // 4. Multi-step chained calculator (including inline calc() inside KeyValue) compiles under MAX_FUNC_CALL_DEPTH = 5
    const chainedDsl = [
      'surface("cloud_vm_cost")',
      '$/vcpu = 8',
      '$/mem = 32',
      '$/region = "cn-north"',
      '$/term = "yearly"',
      '$/os = "linux"',
      '$/prepay = true',
      'v = { c: $/vcpu, m: $/mem }',
      'listPrice = calc("c * 42 + m * 9.5", v, decimals=2)',
      'regionRate = cond(eq($/region, "cn-north"), 1, cond(eq($/region, "cn-east"), 1.08, 1.15))',
      'osRate = cond(eq($/os, "windows"), 1.12, 1)',
      'termRate = cond(eq($/term, "yearly"), 0.72, cond(eq($/term, "quarterly"), 0.85, 1))',
      'prepayRate = cond($/prepay, 0.95, 1)',
      'discount = calc("regionRate * osRate * termRate * prepayRate", { regionRate: regionRate, osRate: osRate, termRate: termRate, prepayRate: prepayRate }, decimals=4)',
      'finalMonthly = calc("listPrice * discount", { listPrice: listPrice, discount: discount }, decimals=2)',
      'savedMonthly = calc("listPrice - finalMonthly", { listPrice: listPrice, finalMonthly: finalMonthly }, decimals=2)',
      'yearlySave = calc("savedMonthly * 12", { savedMonthly: savedMonthly }, decimals=2)',
      'specs = KeyValue([{ label: "折后单价", value: formatCurrency(calc("finalMonthly / c", { finalMonthly: finalMonthly, c: $/vcpu }, decimals=2), "CNY", 2) + " / vCPU" }])',
      'root = Card(Column([Stat("年付节省", formatCurrency(yearlySave, "CNY", 2)), specs]))',
    ].join('\n')

    expect(flattenChainedCalc(chainedDsl)).not.toContain('{ savedMonthly: savedMonthly }')
    const sessions = createEvalSession()
    const res = gradeToolAttempt(sessions, 'chained-calc', 1, 'a2ui_render', chainedDsl)
    expect(res.compiledOk).toBe(true)

    // 5. calc-engine allows 4-level parenthesized expressions while still guarding genuine deep nesting (>36)
    const okFormula = validateCalcExpression(
      '((c * 42 + m * 9.5) - ((c * 42 + m * 9.5) * r)) * 12',
      new Set(['c', 'm', 'r']),
    )
    expect(okFormula).toBeNull()
    const deepNesting = `${'('.repeat(40)}c${')'.repeat(40)}`
    const tooDeep = validateCalcExpression(deepNesting, new Set(['c']))
    expect(tooDeep).toContain('nesting depth exceeds maximum')
  })
})
