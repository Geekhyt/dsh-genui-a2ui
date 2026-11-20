#!/usr/bin/env node
/**
 * P1 Real LLM & Offline Eval Runner for `dsh-genui-a2ui`.
 *
 * Usage:
 *   # 1. Offline deterministic CI benchmark (0 API cost, tests all 28 cases + A/B token comparison):
 *   npm run eval:llm -- --mode=mock --strategy=both --html=.dsh-dev/eval-report.html
 *
 *   # 2. Live DeepSeek-V3 / DeepSeek-R1 / OpenAI-compatible benchmark:
 *   DEEPSEEK_API_KEY=sk-... npm run eval:llm -- --mode=live --model=deepseek-chat --strategy=both --html=.dsh-dev/eval-live.html
 *
 *   # 3. Inspect all 28 cases without executing:
 *   npm run eval:llm -- --dry-run
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  aggregateEvalSummary,
  createEvalSession,
  EVAL_BENCHMARK_CASES,
  finalizeCaseResult,
  gradeToolAttempt,
} from '../src/host/eval-suite.ts'
import { DOMAIN_SKILL_META, SKILL_DOMAINS } from '../src/host/prompt-compact.ts'
import {
  A2UI_SYSTEM_GUIDANCE,
  GOLDEN_CALCULATOR_EXAMPLE,
  GOLDEN_VALIDATED_FORM_EXAMPLE,
  SKILL_PREAMBLE,
} from '../src/index.ts'
import {
  SHOWCASE_ACCORDION_MODAL_UI,
  SHOWCASE_ALL_FORMS_MEDIA_UI,
  SHOWCASE_ANTD_CAPACITY_UI,
  SHOWCASE_API_RING_DATERANGE_UI,
  SHOWCASE_ARCHITECTURE_UI,
  SHOWCASE_COMPARISON_SOURCES_UI,
  SHOWCASE_DOCK_PIPELINE_UI,
  SHOWCASE_ENTERPRISE_PROTABLE_UI,
  SHOWCASE_EXECUTIVE_UI,
  SHOWCASE_EXTREME_EDGE_TORTURE_B_UI,
  SHOWCASE_FINOPS_WATERFALL_SUNBURST_UI,
  SHOWCASE_KANBAN_TIMELINE_MATRIX_UI,
  SHOWCASE_LLM_PARALLEL_BENCHMARK_UI,
  SHOWCASE_MARKET_CANDLE_UI,
  SHOWCASE_RISK_RUNBOOK_UI,
  SHOWCASE_SRE_APM_UI,
  SHOWCASE_SRE_COMBO_CALENDAR_UI,
  SHOWCASE_STORE_OPS_UI,
} from './mock-llm.mjs'

function parseArgs(argv) {
  const opts = {
    mode: 'mock',
    strategy: 'both',
    model: process.env.EVAL_MODEL || 'deepseek-chat',
    baseUrl: (process.env.EVAL_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, ''),
    apiKey:
      process.env.EVAL_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || '',
    concurrency: 3,
    limit: EVAL_BENCHMARK_CASES.length,
    casesFilter: null,
    maxRepairs: 2,
    jsonOut: '',
    htmlOut: '',
    dryRun: false,
  }
  for (const arg of argv) {
    if (arg === '--dry-run') opts.dryRun = true
    else if (arg.startsWith('--mode=')) opts.mode = arg.slice(7)
    else if (arg.startsWith('--strategy=')) opts.strategy = arg.slice(11)
    else if (arg.startsWith('--model=')) opts.model = arg.slice(8)
    else if (arg.startsWith('--base-url=')) opts.baseUrl = arg.slice(11).replace(/\/+$/, '')
    else if (arg.startsWith('--concurrency='))
      opts.concurrency = Math.max(1, Number(arg.slice(14)) || 1)
    else if (arg.startsWith('--limit=')) opts.limit = Math.max(1, Number(arg.slice(8)) || 1)
    else if (arg.startsWith('--cases=')) {
      opts.casesFilter = new Set(
        arg
          .slice(8)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      )
    } else if (arg.startsWith('--max-repairs='))
      opts.maxRepairs = Math.max(0, Number(arg.slice(14)) || 2)
    else if (arg.startsWith('--json=')) opts.jsonOut = arg.slice(7)
    else if (arg.startsWith('--html=')) opts.htmlOut = arg.slice(7)
  }
  return opts
}

function buildSkillLibrary(sessions, strategy) {
  if (strategy === 'monolithic') {
    const legacyContent = SKILL_PREAMBLE + sessions.rawPromptSnippet()
    return {
      listText: '- `a2ui`: Full 57-component A2UI 1.0 Express grammar & reference.',
      skills: new Map([['a2ui', legacyContent]]),
    }
  }
  const domains = ['core', 'analytics', 'devops', 'forms']
  const skills = new Map()
  const lines = []
  for (const d of domains) {
    const meta = DOMAIN_SKILL_META[d]
    const content =
      d === 'core' ? SKILL_PREAMBLE + sessions.promptSnippet('core') : sessions.promptSnippet(d)
    skills.set(meta.name, content)
    lines.push(`- \`${meta.name}\`: ${meta.description}`)
  }
  return { listText: lines.join('\n'), skills }
}

/** Deterministic offline fixture responses + 3 realistic first-pass error -> self-repair probes. */
const MOCK_FIXTURES = {
  'bi-01-funnel-sankey-radar': { ui: SHOWCASE_EXECUTIVE_UI, skills: ['a2ui-analytics'] },
  'bi-02-finops-waterfall-sunburst': {
    ui: SHOWCASE_FINOPS_WATERFALL_SUNBURST_UI,
    skills: ['a2ui-analytics'],
  },
  'bi-03-combo-slo-calendar': { ui: SHOWCASE_SRE_COMBO_CALENDAR_UI, skills: ['a2ui-analytics'] },
  'bi-04-parallel-model-benchmark': {
    ui: SHOWCASE_LLM_PARALLEL_BENCHMARK_UI,
    skills: ['a2ui-analytics'],
  },
  'bi-05-store-area-heatmap': { ui: SHOWCASE_STORE_OPS_UI, skills: ['a2ui-analytics'] },
  'bi-06-market-candlestick-boxplot': {
    ui: SHOWCASE_MARKET_CANDLE_UI,
    skills: ['a2ui-analytics'],
  },
  'form-01-loan-calc': { ui: GOLDEN_CALCULATOR_EXAMPLE, skills: ['a2ui'] },
  'form-02-gpu-capacity-checkcard': { ui: SHOWCASE_ANTD_CAPACITY_UI, skills: ['a2ui-forms'] },
  'form-03-validated-quota-form': { ui: GOLDEN_VALIDATED_FORM_EXAMPLE, skills: ['a2ui'] },
  'form-04-hybrid-search-comparison': {
    ui: SHOWCASE_COMPARISON_SOURCES_UI,
    skills: ['a2ui-forms', 'a2ui-analytics'],
  },
  'form-05-api-daterange-rings': {
    // Realistic first-pass mistake (`latencyMs` instead of `latency`) -> self-repairs on attempt 2!
    firstPassBadUi: [
      'surface("api_bad")',
      'root = Card(ApiEndpoint("POST", "/v1/quota", latencyMs=34))',
    ].join('\n'),
    ui: SHOWCASE_API_RING_DATERANGE_UI,
    skills: ['a2ui-devops'],
  },
  'ops-01-sre-topology-trace-log': { ui: SHOWCASE_SRE_APM_UI, skills: ['a2ui-devops'] },
  'ops-02-ddl-approval-terminal-schedule': {
    ui: SHOWCASE_RISK_RUNBOOK_UI,
    skills: ['a2ui-devops'],
  },
  'ops-03-blocking-diff-ask': {
    ui: [
      'surface("confirm_canary_ask")',
      '$/before = "weight: 5%\\ntimeout: 3000ms"',
      '$/after = "weight: 20%\\ntimeout: 1500ms\\ncircuitBreaker: true"',
      '$/cluster = "prod-hz"',
      '$/rollback = true',
      'root = Card(Column([',
      '  Callout("灰度权重将提升至 20%", "请确认双栏配置差异后放行", tone="warning"),',
      '  DiffView($/before, $/after, title="gateway.yaml", language="yaml", mode="split"),',
      '  Row([Select("生效集群", [{ value: "prod-hz", label: "杭州主集群" }, { value: "prod-sh", label: "上海集群" }], $/cluster, weight=1), Switch("异常自动回滚", $/rollback, weight=1)]),',
      '  Row([Button(Text("确认放行"), variant="primary", action=Event("approve_canary", { cluster: $/cluster, rollback: $/rollback }))], justify="end")',
      ']))',
    ].join('\n'),
    skills: ['a2ui-devops'],
  },
  'ops-04-mermaid-filetree-jsontree': { ui: SHOWCASE_ARCHITECTURE_UI, skills: ['a2ui-devops'] },
  'ops-05-persistent-dock-pipeline': {
    ui: SHOWCASE_DOCK_PIPELINE_UI,
    placement: 'dock',
    skills: ['a2ui-devops'],
  },
  'ops-06-failover-kanban-timeline-matrix-result': {
    ui: SHOWCASE_KANBAN_TIMELINE_MATRIX_UI,
    skills: ['a2ui-analytics'],
  },
  'edge-01-table-plain-scalar': {
    // Realistic first-pass mistake (hallucinated unknown component `StatusPill`) -> self-repairs on attempt 2!
    firstPassBadUi: ['surface("svc_table_bad")', 'root = Card(StatusPill("healthy"))'].join('\n'),
    ui: [
      'surface("svc_health_table")',
      '$/rows = [',
      '  { svc: "api-gateway", status: "🟢 正常", p99: "18ms", err: "0.01%" },',
      '  { svc: "checkout-api", status: "🟡 预警", p99: "184ms", err: "0.42%" },',
      '  { svc: "fraud-scorer", status: "🔴 异常", p99: "312ms", err: "1.85%" },',
      '  { svc: "ledger-core", status: "🟢 正常", p99: "24ms", err: "0.00%" },',
      '  { svc: "notify-push", status: "🟢 正常", p99: "41ms", err: "0.03%" },',
      '  { svc: "search-idx", status: "🟢 正常", p99: "29ms", err: "0.02%" }',
      ']',
      'root = Card(Table($/rows, title="微服务健康巡检表", searchable=true, exportable=true))',
    ].join('\n'),
    skills: ['a2ui-analytics'],
  },
  'edge-02-calc-local-variable': {
    // Realistic first-pass mistake (`calc(...)` assigned directly to `$/monthly`) -> self-repairs on attempt 2!
    firstPassBadUi: [
      'surface("cloud_calc_bad")',
      '$/cpu = 8',
      '$/mem = 32',
      '$/monthly = calc("c * 25 + m * 4", { c: $/cpu, m: $/mem }, decimals=2)',
      'root = Card(Stat("月费", $/monthly))',
    ].join('\n'),
    ui: [
      'surface("cloud_calc")',
      '$/cpu = 8',
      '$/mem = 32',
      'v = { c: $/cpu, m: $/mem }',
      'unitPrice = calc("c * 25 + m * 4", v, decimals=2)',
      'discounted = calc("(c * 25 + m * 4) * 0.85", v, decimals=2)',
      'yearlySave = calc("(c * 25 + m * 4) * 0.15 * 12", v, decimals=2)',
      'root = Card(Column([',
      '  Slider("vCPU 核数", 2, 64, $/cpu, steps=31),',
      '  Slider("内存 (GB)", 4, 256, $/mem, steps=63),',
      '  Row([Stat("目录月价", formatCurrency(unitPrice, "CNY", 2), weight=1), Stat("折扣后月费", formatCurrency(discounted, "CNY", 2), weight=1), Stat("年付净省", formatCurrency(yearlySave, "CNY", 2), weight=1)])',
      ']))',
    ].join('\n'),
    skills: ['a2ui'],
  },
  'edge-03-accordion-modal-triage': { ui: SHOWCASE_ACCORDION_MODAL_UI, skills: ['a2ui'] },
  'cov-01-cluster-governance-protable': {
    ui: SHOWCASE_ENTERPRISE_PROTABLE_UI,
    skills: ['a2ui-analytics'],
  },
  'cov-02-horizontal-bar-reference': {
    ui: SHOWCASE_EXTREME_EDGE_TORTURE_B_UI,
    skills: ['a2ui-analytics'],
  },
  'cov-03-media-preview-form': { ui: SHOWCASE_ALL_FORMS_MEDIA_UI, skills: ['a2ui-forms'] },
}

async function runMockCase(testCase, strategy) {
  const t0 = performance.now()
  const sessions = createEvalSession()
  const lib = buildSkillLibrary(sessions, strategy)

  const basePromptTokens = Math.round(
    (A2UI_SYSTEM_GUIDANCE.length + testCase.prompt.length + lib.listText.length) / 3.8,
  )

  if (testCase.expectedTool === 'none') {
    const attempt = gradeToolAttempt(sessions, testCase.id, 1, 'none')
    return finalizeCaseResult(testCase, [attempt], [], {
      promptTokens: basePromptTokens,
      completionTokens: 120,
      latencyMs: Math.max(1, Math.round(performance.now() - t0)),
    })
  }

  const fix = MOCK_FIXTURES[testCase.id]
  if (!fix) throw new Error(`Missing mock fixture for ${testCase.id}`)

  const loadedSkills = strategy === 'monolithic' ? ['a2ui'] : fix.skills
  const skillChars = loadedSkills.reduce((s, name) => s + (lib.skills.get(name)?.length ?? 0), 0)
  const promptTokens = basePromptTokens + Math.round(skillChars / 3.8)
  const attempts = []

  // Inject realistic first-pass error probes on 3 designated edge cases to exercise self-repair diagnostics
  if (fix.firstPassBadUi) {
    attempts.push(
      gradeToolAttempt(
        sessions,
        `${testCase.id}-1`,
        1,
        testCase.expectedTool,
        fix.firstPassBadUi,
        fix.placement ?? 'answer',
      ),
    )
    attempts.push(
      gradeToolAttempt(
        sessions,
        `${testCase.id}-2`,
        2,
        testCase.expectedTool,
        fix.ui,
        fix.placement ?? 'answer',
      ),
    )
  } else {
    attempts.push(
      gradeToolAttempt(
        sessions,
        `${testCase.id}-1`,
        1,
        testCase.expectedTool,
        fix.ui,
        fix.placement ?? 'answer',
      ),
    )
  }

  return finalizeCaseResult(testCase, attempts, loadedSkills, {
    promptTokens: promptTokens + (attempts.length > 1 ? Math.round(promptTokens * 0.25) : 0),
    completionTokens: Math.round((fix.ui.length / 3.8) * (attempts.length > 1 ? 1.35 : 1)),
    latencyMs: Math.max(1, Math.round(performance.now() - t0)),
  })
}

function buildOpenAiTools(skillNames) {
  return [
    {
      type: 'function',
      function: {
        name: 'load_skill',
        description:
          'Load an A2UI grammar/component skill reference before calling a2ui_render or a2ui_ask.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', enum: [...skillNames] },
          },
          required: ['name'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'a2ui_render',
        description: 'Render an interactive A2UI 1.0 Express surface inline in chat.',
        parameters: {
          type: 'object',
          properties: {
            ui: {
              type: 'string',
              description: 'Raw A2UI Express program (no markdown fences, no <a2ui> tags).',
            },
            placement: { type: 'string', enum: ['answer', 'inline', 'dock'] },
          },
          required: ['ui'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'a2ui_ask',
        description: 'Pause the turn and render a blocking interactive approval/form surface.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            ui: { type: 'string', description: 'Raw A2UI Express program.' },
          },
          required: ['ui'],
        },
      },
    },
  ]
}

async function runLiveCase(testCase, strategy, opts) {
  const t0 = performance.now()
  const sessions = createEvalSession()
  const lib = buildSkillLibrary(sessions, strategy)
  const tools = buildOpenAiTools(lib.skills.keys())

  const systemContent = [
    A2UI_SYSTEM_GUIDANCE,
    '',
    '## Available Skills (call `load_skill` if you need detailed signatures)',
    lib.listText,
  ].join('\n')

  const messages = [
    { role: 'system', content: systemContent },
    { role: 'user', content: testCase.prompt },
  ]

  const loadedSkills = []
  const attempts = []
  let promptTokens = 0
  let completionTokens = 0
  let uiCallCount = 0

  for (let step = 0; step < 6; step++) {
    const reqBody = {
      model: opts.model,
      messages,
      tools,
    }
    if (!opts.model.toLowerCase().includes('reasoner')) {
      reqBody.temperature = 0.2
    }
    let res
    for (let retry = 0; retry < 3; retry++) {
      try {
        res = await fetch(`${opts.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${opts.apiKey}`,
          },
          body: JSON.stringify(reqBody),
          signal: AbortSignal.timeout(90_000),
        })
        if (res.ok || (res.status < 500 && res.status !== 429)) break
      } catch (err) {
        if (retry === 2) throw err
      }
      await new Promise((r) => setTimeout(r, 1500 * (retry + 1)))
    }
    if (!res.ok) {
      const txt = await res.text()
      throw new Error(`LLM API ${res.status}: ${txt.slice(0, 300)}`)
    }
    const data = await res.json()
    promptTokens += data.usage?.prompt_tokens ?? 0
    completionTokens += data.usage?.completion_tokens ?? 0

    const choice = data.choices?.[0]?.message
    if (!choice) break
    messages.push(choice)

    const toolCalls = choice.tool_calls ?? []
    if (toolCalls.length === 0) {
      if (attempts.length === 0) {
        attempts.push(gradeToolAttempt(sessions, testCase.id, 1, 'none'))
      }
      break
    }

    let settled = false
    for (const tc of toolCalls) {
      const fnName = tc.function?.name
      let args = {}
      try {
        args = JSON.parse(tc.function?.arguments || '{}')
      } catch {
        args = {}
      }

      if (fnName === 'load_skill') {
        const skName = String(args.name || '')
        const content = lib.skills.get(skName)
        if (content && !loadedSkills.includes(skName)) loadedSkills.push(skName)
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content:
            content ?? `Unknown skill "${skName}". Available: ${[...lib.skills.keys()].join(', ')}`,
        })
        continue
      }

      if (fnName === 'a2ui_render' || fnName === 'a2ui_ask') {
        uiCallCount += 1
        const rec = gradeToolAttempt(
          sessions,
          `${testCase.id}-try-${uiCallCount}`,
          uiCallCount,
          fnName,
          typeof args.ui === 'string' ? args.ui : '',
          typeof args.placement === 'string' ? args.placement : 'answer',
        )
        attempts.push(rec)

        if (rec.compiledOk) {
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify({ ok: true, components: rec.usedComponents.length }),
          })
          settled = true
        } else {
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify({
              ok: false,
              error: rec.errorMessage,
              hint: 'Fix the A2UI Express error and call the tool again.',
            }),
          })
          if (uiCallCount > opts.maxRepairs) settled = true
        }
      }
    }
    if (settled) break
  }

  return finalizeCaseResult(testCase, attempts, loadedSkills, {
    promptTokens,
    completionTokens,
    latencyMs: Math.round(performance.now() - t0),
  })
}

async function runPool(items, concurrency, fn) {
  const results = new Array(items.length)
  let nextIdx = 0
  async function worker() {
    while (nextIdx < items.length) {
      const i = nextIdx++
      results[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
  return results
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Generates a self-contained interactive HTML Eval Report (A/B Scoped vs. Monolithic). */
export function renderEvalHtmlReport(summaries) {
  const primary = summaries.find((s) => s.strategy === 'scoped') ?? summaries[0]
  const baseline = summaries.find((s) => s.strategy === 'monolithic')
  const hasAb = Boolean(primary && baseline && primary !== baseline)
  const tokenDiffPct = hasAb
    ? Math.round(
        ((primary.avgPromptTokens - baseline.avgPromptTokens) /
          Math.max(1, baseline.avgPromptTokens)) *
          1000,
      ) / 10
    : 0

  const topComps = Object.entries(primary.componentCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 16)
  const maxCompUse = topComps[0]?.[1] ?? 1

  const topCharts = Object.entries(primary.chartKindCounts).sort((a, b) => b[1] - a[1])
  const errorEntries = Object.entries(primary.errorTaxonomy)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])

  const allCatalog = Object.values(SKILL_DOMAINS).flat()
  const unusedComps = allCatalog.filter((c) => !primary.componentCounts[c])

  const catLabels = {
    analytics: 'BI / 图表分析',
    forms: '计算器 / 高阶表单',
    devops: 'DevOps / SRE / 审批',
    constraints: '语法边界约束',
    negative: '负例（仅 Markdown）',
  }

  const caseRowsHtml = primary.results
    .map((r) => {
      const statusBadge =
        r.expectedTool === 'none'
          ? r.routingCorrect
            ? '<span class="px-2 py-0.5 rounded border border-[var(--success)] text-[var(--success)] font-bold">PASS (0 UI)</span>'
            : '<span class="px-2 py-0.5 rounded border border-[var(--error)] text-[var(--error)] font-bold">误触发</span>'
          : r.firstPassCompiled
            ? '<span class="px-2 py-0.5 rounded border border-[var(--success)] text-[var(--success)] font-bold">0-Repair PASS</span>'
            : r.repaired
              ? '<span class="px-2 py-0.5 rounded border border-[var(--warning)] text-[var(--warning)] font-bold">自愈通过</span>'
              : '<span class="px-2 py-0.5 rounded border border-[var(--error)] text-[var(--error)] font-bold">FAIL</span>'

      const baseRes = baseline?.results.find((b) => b.caseId === r.caseId)
      const tokCell = baseRes
        ? `<span class="font-mono">${r.promptTokens.toLocaleString()}</span> <span class="text-[var(--muted-foreground)] font-mono">(原 ${baseRes.promptTokens.toLocaleString()})</span>`
        : `<span class="font-mono">${r.promptTokens.toLocaleString()}</span>`

      const errNote = r.attempts
        .filter((a) => !a.compiledOk)
        .map((a) => `<code>${escapeHtml(a.errorBucket || 'ERR')}</code>`)
        .join(', ')

      return `
        <tr data-cat="${r.category}" data-status="${r.firstPassCompiled ? 'pass' : r.repaired ? 'repaired' : 'fail'}">
          <td class="py-2 pr-3 font-mono text-[var(--muted-foreground)]">${escapeHtml(r.caseId)}</td>
          <td class="py-2 px-2 font-medium">${escapeHtml(r.title)}</td>
          <td class="py-2 px-2 font-mono">${escapeHtml(r.loadedSkills.join(', ') || '—')}</td>
          <td class="py-2 px-2">${tokCell}</td>
          <td class="py-2 px-2">${errNote || '<span class="text-[var(--muted-foreground)]">—</span>'}</td>
          <td class="py-2 pl-2 whitespace-nowrap">${statusBadge}</td>
        </tr>
      `
    })
    .join('\n')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>dsh-genui-a2ui · P1 LLM 生成评测基准报告 (${escapeHtml(primary.model)})</title>
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
  <style>
    .flt-btn[aria-selected="true"] {
      background: var(--primary);
      color: var(--primary-foreground);
      border-color: var(--primary);
    }
  </style>
</head>
<body class="bg-[var(--background)] text-[var(--foreground)] antialiased m-0 p-0">
  <main class="max-w-6xl mx-auto px-5 py-7 space-y-6">
    <header class="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 space-y-5">
      <div class="space-y-2">
        <div class="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span class="px-2.5 py-1 rounded-full bg-[var(--secondary)] text-[var(--secondary-foreground)] border border-[var(--border)]">P1 LLM Eval Benchmark · 28 用例</span>
          <span class="px-2.5 py-1 rounded-full border border-[var(--chart-1)] text-[var(--chart-1)]">模式：${escapeHtml(primary.mode.toUpperCase())} · 模型：${escapeHtml(primary.model)}</span>
          ${hasAb ? `<span class="px-2.5 py-1 rounded-full border border-[var(--success)] text-[var(--success)]">A/B 对照：P0 分层均值省流 ${tokenDiffPct}%</span>` : ''}
        </div>
        <h1 class="text-2xl md:text-3xl font-bold tracking-tight">
          dsh-genui-a2ui · P1 生成合格率、自愈恢复与路由精准度评测报告
        </h1>
        <p class="text-sm text-[var(--muted-foreground)] leading-relaxed">
          使用真实 Host 编译器（<code>SurfaceSessions.compile</code>）对 <strong>28 个端到端任务</strong>（23 个交互 UI 正例 + 5 个纯 Markdown 负例）进行全自动评分，量化统计 <strong>0-Repair 一次编译通过率</strong>、<strong>自愈恢复率</strong>、<strong>误触发率</strong>、<strong>8 类报错归因分布</strong>与 <strong>P0 四域分层 vs. 单体全量 Token 成本</strong>。
        </p>
      </div>

      <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div class="rounded-xl p-4 bg-[var(--background)] border border-[var(--card-border)]">
          <div class="text-xs text-[var(--muted-foreground)]">0-Repair 一次通过率</div>
          <div class="text-2xl font-bold mt-1 tabular-nums" style="color: var(--chart-1);">${primary.firstPassCompileRatePct}%</div>
          <div class="text-xs text-[var(--muted-foreground)] mt-1">最终通过率 <strong class="text-[var(--success)]">${primary.finalCompileRatePct}%</strong></div>
        </div>
        <div class="rounded-xl p-4 bg-[var(--background)] border border-[var(--card-border)]">
          <div class="text-xs text-[var(--muted-foreground)]">编译器自愈恢复率</div>
          <div class="text-2xl font-bold mt-1 tabular-nums text-[var(--success)]">${primary.selfRepairRecoveryPct}%</div>
          <div class="text-xs text-[var(--muted-foreground)] mt-1">≤ 2 轮精确行号诊断自愈</div>
        </div>
        <div class="rounded-xl p-4 bg-[var(--background)] border border-[var(--card-border)]">
          <div class="text-xs text-[var(--muted-foreground)]">路由精准度（含负例）</div>
          <div class="text-2xl font-bold mt-1 tabular-nums text-[var(--success)]">${primary.routingAccuracyPct}%</div>
          <div class="text-xs text-[var(--muted-foreground)] mt-1">负例误触发：<strong>${primary.falsePositiveCount} / ${primary.negativeCases}</strong></div>
        </div>
        <div class="rounded-xl p-4 bg-[var(--background)] border border-[var(--card-border)]">
          <div class="text-xs text-[var(--muted-foreground)]">单任务均值 Prompt Token</div>
          <div class="text-2xl font-bold mt-1 tabular-nums text-[var(--success)]">${primary.avgPromptTokens.toLocaleString()}</div>
          <div class="text-xs text-[var(--muted-foreground)] mt-1">${hasAb ? `旧单体 ${baseline.avgPromptTokens.toLocaleString()} (${tokenDiffPct}%)` : `策略：${primary.strategy}`}</div>
        </div>
        <div class="rounded-xl p-4 bg-[var(--background)] border border-[var(--card-border)]">
          <div class="text-xs text-[var(--muted-foreground)]">组件覆盖广度</div>
          <div class="text-2xl font-bold mt-1 tabular-nums" style="color: var(--chart-2);">${primary.uniqueComponentsUsed} / ${primary.totalCatalogComponents}</div>
          <div class="text-xs text-[var(--muted-foreground)] mt-1">涵盖 ${topCharts.length} 类 ECharts 图表</div>
        </div>
      </div>
    </header>

    <!-- Section 1: Category Breakdown + A/B Token Bar -->
    <section class="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <div class="lg:col-span-7 bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 space-y-4">
        <h2 class="text-lg font-bold">一、五大评测桶得分矩阵（28 用例）</h2>
        <div class="space-y-3">
          ${Object.entries(primary.byCategory)
            .map(([cat, s]) => {
              const firstPct = s.total ? Math.round((s.firstPassOk / s.total) * 100) : 100
              const finalPct = s.total ? Math.round((s.finalOk / s.total) * 100) : 100
              return `
                <div class="space-y-1">
                  <div class="flex items-center justify-between text-xs">
                    <span class="font-semibold">${catLabels[cat]} <span class="text-[var(--muted-foreground)]">(${s.total} 题)</span></span>
                    <span class="font-mono">一次 ${s.firstPassOk}/${s.total} (${firstPct}%) · 最终 <strong class="text-[var(--success)]">${s.finalOk}/${s.total} (${finalPct}%)</strong></span>
                  </div>
                  <div class="h-3 rounded-full bg-[var(--background)] border border-[var(--card-border)] overflow-hidden relative">
                    <div class="h-full rounded-full opacity-35 absolute inset-y-0 left-0" style="width:${finalPct}%; background: var(--success);"></div>
                    <div class="h-full rounded-full relative" style="width:${firstPct}%; background: var(--chart-1);"></div>
                  </div>
                </div>
              `
            })
            .join('')}
        </div>
      </div>

      <div class="lg:col-span-5 bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 space-y-4">
        <h2 class="text-lg font-bold">二、高频编译错题本（8 类归因）</h2>
        ${
          errorEntries.length === 0
            ? '<p class="text-xs text-[var(--success)]">本次评测 0 编译错误！</p>'
            : `<div class="space-y-2.5">${errorEntries
                .map(
                  ([bucket, count]) => `
                <div class="rounded-xl p-3 bg-[var(--background)] border border-[var(--card-border)] flex items-center justify-between text-xs">
                  <span class="font-mono font-bold text-[var(--warning)]">${escapeHtml(bucket)}</span>
                  <span class="font-mono">${count} 次（自愈已捕获）</span>
                </div>`,
                )
                .join('')}</div>`
        }
        ${
          hasAb
            ? `<div class="rounded-xl p-3.5 bg-[var(--background)] border border-[var(--success)] space-y-1.5 text-xs">
                <div class="font-bold text-[var(--success)]">A/B Token 对照（28 任务累计）</div>
                <div class="flex justify-between font-mono"><span>旧版单体 Skill：</span><span>${baseline.totalPromptTokens.toLocaleString()} tok</span></div>
                <div class="flex justify-between font-mono"><span>P0 四域分层：</span><strong class="text-[var(--success)]">${primary.totalPromptTokens.toLocaleString()} tok (${tokenDiffPct}%)</strong></div>
              </div>`
            : ''
        }
      </div>
    </section>

    <!-- Section 2: Component Usage Heatmap -->
    <section class="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-lg font-bold">三、组件与图表使用热力分布</h2>
        <span class="text-xs text-[var(--muted-foreground)]">已触发 ${primary.uniqueComponentsUsed} / ${primary.totalCatalogComponents} 组件 · 未覆盖 ${unusedComps.length} 个</span>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
        ${topComps
          .map(([comp, cnt]) => {
            const pct = Math.round((cnt / maxCompUse) * 100)
            return `
            <div class="space-y-1">
              <div class="flex justify-between text-xs font-mono">
                <span class="font-semibold">${escapeHtml(comp)}</span>
                <span class="text-[var(--muted-foreground)]">${cnt} 次</span>
              </div>
              <div class="h-2 rounded-full bg-[var(--background)] border border-[var(--card-border)] overflow-hidden">
                <div class="h-full rounded-full" style="width:${pct}%; background: var(--chart-2);"></div>
              </div>
            </div>`
          })
          .join('')}
      </div>
      <div class="pt-2 border-t border-[var(--card-border)] flex flex-wrap items-center gap-1.5 text-xs">
        <span class="font-semibold text-[var(--muted-foreground)] mr-1">已验证 ECharts 种类 (${topCharts.length})：</span>
        ${topCharts.map(([k, n]) => `<span class="px-2 py-0.5 rounded-md font-mono bg-[var(--secondary)] text-[var(--secondary-foreground)]">${escapeHtml(k)} (${n})</span>`).join('')}
      </div>
    </section>

    <!-- Section 3: Interactive 28-Case Ledger -->
    <section class="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-lg font-bold">四、28 题逐项评分明细</h2>
        <div id="caseFilters" class="flex flex-wrap gap-1.5 text-xs">
          <button type="button" class="flt-btn px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--background)] cursor-pointer" data-f="all" aria-selected="true">全部 (${primary.totalCases})</button>
          <button type="button" class="flt-btn px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--background)] cursor-pointer" data-f="repaired" aria-selected="false">仅看自愈/失败</button>
          <button type="button" class="flt-btn px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--background)] cursor-pointer" data-f="negative" aria-selected="false">负例控制 (${primary.negativeCases})</button>
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="border-b border-[var(--border)] text-[var(--muted-foreground)]">
              <th class="py-2 pr-3">用例 ID</th>
              <th class="py-2 px-2">场景标题</th>
              <th class="py-2 px-2">加载 Skill</th>
              <th class="py-2 px-2">Prompt Token</th>
              <th class="py-2 px-2">首轮报错桶</th>
              <th class="py-2 pl-2">结论</th>
            </tr>
          </thead>
          <tbody id="caseTableBody" class="divide-y divide-[var(--card-border)]">
            ${caseRowsHtml}
          </tbody>
        </table>
      </div>
    </section>
  </main>

  <script>
    const btns = document.querySelectorAll('.flt-btn');
    const rows = document.querySelectorAll('#caseTableBody tr');
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        const f = btn.dataset.f;
        btns.forEach(b => b.setAttribute('aria-selected', String(b === btn)));
        rows.forEach(r => {
          const show = f === 'all' || (f === 'negative' && r.dataset.cat === 'negative') || (f === 'repaired' && r.dataset.status !== 'pass');
          r.style.display = show ? '' : 'none';
        });
      });
    });
  </script>
</body>
</html>`
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const cases = (
    opts.casesFilter
      ? EVAL_BENCHMARK_CASES.filter((c) => opts.casesFilter.has(c.id))
      : EVAL_BENCHMARK_CASES
  ).slice(0, opts.limit)

  if (opts.dryRun) {
    console.log(`[eval-llm] Dry run: ${cases.length} benchmark cases ready`)
    for (const c of cases) {
      console.log(
        `  - ${c.id.padEnd(46)} [${c.category.padEnd(11)}] expected=${c.expectedTool}${c.expectedPlacement ? `(${c.expectedPlacement})` : ''} domain=${c.expectedDomain ?? 'none'}`,
      )
    }
    return
  }

  if (opts.mode === 'live' && !opts.apiKey) {
    console.error(
      '[eval-llm] --mode=live requires DEEPSEEK_API_KEY, EVAL_API_KEY, or OPENAI_API_KEY.',
    )
    process.exit(2)
  }

  const strategies = opts.strategy === 'both' ? ['scoped', 'monolithic'] : [opts.strategy]
  const summaries = []

  for (const strategy of strategies) {
    let doneCount = 0
    const results = await runPool(cases, opts.mode === 'live' ? opts.concurrency : 6, async (c) => {
      const r =
        opts.mode === 'live' ? await runLiveCase(c, strategy, opts) : await runMockCase(c, strategy)
      doneCount += 1
      if (opts.mode === 'live') {
        const tag =
          r.expectedTool === 'none'
            ? r.routingCorrect
              ? 'NEG-PASS'
              : 'FALSE-POS'
            : r.firstPassCompiled
              ? '0-REPAIR'
              : r.repaired
                ? 'REPAIRED'
                : 'FAIL'
        console.log(
          `[eval-llm] (${doneCount}/${cases.length}) ${strategy} ${c.id} -> ${tag} (${(r.latencyMs / 1000).toFixed(1)}s, ${r.promptTokens} tok, skills=[${r.loadedSkills.join(',')}])`,
        )
      }
      return r
    })
    const summary = aggregateEvalSummary(results, {
      model: opts.mode === 'live' ? opts.model : 'offline-deterministic-mock',
      strategy,
      mode: opts.mode,
    })
    summaries.push(summary)

    console.log(
      `[eval-llm] strategy=${strategy.padEnd(10)} cases=${summary.totalCases} routing=${summary.routingAccuracyPct}% 0-repair=${summary.firstPassCompileRatePct}% final=${summary.finalCompileRatePct}% recovery=${summary.selfRepairRecoveryPct}% avgPromptTok=${summary.avgPromptTokens} uniqueComps=${summary.uniqueComponentsUsed}/${summary.totalCatalogComponents}`,
    )
  }

  if (opts.jsonOut) {
    const p = resolve(opts.jsonOut)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, JSON.stringify(summaries, null, 2), 'utf8')
    console.log(`[eval-llm] Wrote JSON results to ${p}`)
  }

  if (opts.htmlOut) {
    const p = resolve(opts.htmlOut)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, renderEvalHtmlReport(summaries), 'utf8')
    console.log(`[eval-llm] Wrote HTML report to ${p}`)
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]).endsWith('eval-llm.mjs')
if (isMain) {
  main().catch((err) => {
    console.error('[eval-llm] Fatal:', err)
    process.exit(1)
  })
}
