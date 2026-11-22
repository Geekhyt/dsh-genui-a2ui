# dsh-genui-a2ui

[简体中文](./README.md) | **English** | [Developer and architecture guide](./docs/DEVELOPMENT.md)

[![CI](https://github.com/Geekhyt/dsh-genui-a2ui/actions/workflows/ci.yml/badge.svg)](https://github.com/Geekhyt/dsh-genui-a2ui/actions/workflows/ci.yml) [![npm version](https://img.shields.io/npm/v/dsh-genui-a2ui.svg)](https://www.npmjs.com/package/dsh-genui-a2ui) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE) [![Protocol: A2UI 1.0](https://img.shields.io/badge/Protocol-A2UI%201.0-10b981.svg)](https://github.com/google/A2UI) [![DSH: >= 0.2.0](https://img.shields.io/badge/DeepSeek%20Harness-%3E%3D%200.2.0-4f46e5.svg)](./package.json)

**Don't just chat. Let AI speak in interfaces.**

`dsh-genui-a2ui` brings Google's open A2UI (Agent to User Interface) standard to DeepSeek Harness. Simple questions still get fast text replies. When plain text falls short, AI renders clickable, draggable, filterable native UI directly inside your chat.

## Quick start

**Option 1: Install directly inside DeepSeek Harness (recommended, no terminal or restart needed)**

Open **Plugins** in the left sidebar, click **Add plugin**, enter `dsh-genui-a2ui`, and choose **Enable now**.

**Option 2: Install via CLI**

```bash
dsh plugin --profile desktop add dsh-genui-a2ui
```

To install from a local clone instead, run `npm ci && npm run build` and then `dsh plugin --profile desktop add link:./dsh-genui-a2ui`. To upgrade later, run `dsh plugin --profile desktop add dsh-genui-a2ui@latest`; to uninstall, run `dsh plugin --profile desktop remove dsh-genui-a2ui`.

Once enabled, ask questions as usual. Click **A2UI** below the input box or type `/a2ui off` anytime to switch back to plain text.

<details>
<summary><strong>Click to expand 22 ready-to-run example prompts</strong></summary>

1. **Executive conversion and health dashboard**: `Build a quarterly growth and conversion diagnostic dashboard with four KPI cards with sparklines on top, a four-stage Sankey flow paired with a five-axis health radar chart side by side, plus tabs for regional growth bars and a searchable channel ROI table.`
2. **0ms Chart ↔ ProTable bidirectional cross-filtering & 1-click export**: `Build a regional operations cross-filter workbench with reactive KPI cards on top, side-by-side regional GMV bar and revenue share donut charts (supporting 0ms local cross-filter highlighting on click plus 1-click PNG download & CSV copy), and a linked orders ProTable below that filters instantly on chart or row click.`
3. **FinOps ARR variance waterfall & drill-down cost sunburst**: `Build a quarterly ARR variance bridge and compute cost attribution dashboard with an entity header and four sparkline KPI cards on top, a waterfall bridge with a ¥680w target reference line paired side by side with a 3-level drill-down sunburst chart, and a searchable billing summary table below.`
4. **Dual-axis combo chart, live SLO slider & change calendar heatmap**: `Build a core gateway throughput and SLO diagnostic dashboard with three radial gauges and a live slider controlling the right-axis SLO threshold line, a zoomable dual-axis combo chart (stacked traffic bars + P99 latency & miss-rate lines), a 14-day SLA tracker strip, and a production change calendar heatmap.`
5. **Multi-model 5-axis parallel coordinates benchmark**: `Compare DeepSeek-R1, DeepSeek-V3, Qwen3, Claude-4, and Llama-4 across reasoning score, TTFT latency, throughput, token cost, and pass rate using a 5-axis parallel coordinates chart paired with a radar comparison and recommended stack trade-off matrix.`
6. **Live multi-store operations dashboard**: `Create a live chain coffee store operations dashboard showing daily revenue, total orders, peak fulfillment rate, and stock alerts, paired with hourly channel area curves, a store-by-hour order heatmap, and a searchable inventory warning table.`
7. **Zero-latency LLM inference and cache simulator**: `Build a zero-latency LLM inference and prompt-cache cost calculator where I can switch models (DeepSeek-V3 vs DeepSeek-R1), drag sliders for daily call volume, prompt cache hit rate, and average output tokens, and see monthly spend, net cache savings, budget utilization, and a cost breakdown bar chart update live.`
8. **GPU tier check-cards, precision steppers & follow-up prompts**: `Build a private LLM cluster capacity and GPU tier planner using visual check-cards to switch GPU instance tiers, precision number steppers for replica count and per-pod concurrency, multi-select tags for failover zones, a hierarchical tree-select for the target service, and clickable next-step prompt cards at the bottom.`
9. **Dedicated cluster SLA strip, bordered descriptions & expandable ProTable**: `Generate a quarterly dedicated inference cluster governance workbench with a cluster health header and 20-day SLA uptime strip on top, bordered specification descriptions in the middle, and an expandable, CSV/Markdown-exportable ProTable of idle GPU optimization targets with summary totals at the bottom.`
10. **Service health topology, APM trace waterfall & log triage**: `Diagnose a checkout API P99 latency spike by combining a live health-colored service dependency DAG (including fallback bypass and retry arcs), a distributed trace waterfall tree with latency share bars, and an error stack-trace log viewer linked to workspace source files.`
11. **High-risk DDL approval gate, runbook terminal & maintenance schedule**: `Prepare an online cold-partition archival workflow for our core billing table with a switch-gated high-risk approval card, pre-flight backup verification terminal runbook, and a maintenance window Gantt schedule bar.`
12. **Architecture trade-off comparison matrix & source citations**: `Compare PostgreSQL pgvector, Milvus, and Elasticsearch for production hybrid search with a workload tier segmented switcher on top, a multi-criteria trade-off matrix highlighting the recommended stack, and clickable benchmark citations at the bottom.`
13. **HTTP API contract workbench, preset date range & radial SLO gauges**: `Build an API rate-limit and health inspection panel combining three radial SLO gauges and a preset date-range picker on top with an interactive HTTP endpoint card supporting request/response JSON trees and shell-safe cURL copy.`
14. **Incident response Kanban, cross-zone heat matrix & execution receipt**: `Summarize a multi-AZ failover drill on one screen with a three-lane action Kanban board, an incident timeline, a quarterly cross-zone P99 latency heat matrix, and a structured drill verification receipt.`
15. **Code diff approval gate**: `Suppose you are updating our production gateway canary weight from 5% to 20% and adding a circuit-breaker timeout. Pause with a review card showing the split config diff, target cluster selector, and auto-rollback switch for my confirmation before proceeding.`
16. **Workspace architecture diagram and source explorer**: `Analyze the architecture of this workspace, render a layered Mermaid diagram alongside a clickable file tree and config JSON inspector so I can open any file directly in the right sidebar.`
17. **Persistent bottom task tracker**: `Pin a five-stage release verification tracker above the chat input showing step status and overall completion percentage across typecheck, bundle build, host API check, test suite, and tarball audit.`
18. **Market candlestick and volatility distribution**: `Create a 10-day market review dashboard combining a sentiment gauge with a daily OHLC candlestick chart and a sector return boxplot side by side.`
19. **Incident triage accordion and detail modal**: `Generate a layered API latency incident report using collapsible accordions for root-cause summary, key-value metrics, and mitigation steps, plus a modal button to inspect full slow-query details.`
20. **Next-gen charts gallery (range band, bullet, histogram, dumbbell, radialBar, chord & quadrant)**: `Build an engineering and observability insight deck featuring a 95% confidence range band with a shaded incident markArea, an OKR bullet chart, an auto-binned latency histogram with a P95 threshold, a before/after dumbbell chart, a Nightingale rose chart, a 270-degree radialBar chart, an ECharts 6 bi-directional chord diagram, a dual-axis quadrant scatter chart, a 100% normalized stacked bar chart, and a stepped log-scale replica line chart.`
21. **Zero-dependency interactive primitives (RangeSlider, Checklist, SortableList, KvEditor, ImageCompare & AnnotationText)**: `Build a release readiness and compliance review workbench combining a dual-thumb RangeSlider budget calculator, half-star and Likert Rating widgets, a required-item gated pre-flight Checklist, a drag-and-drop priority SortableList, a secret-masking KvEditor, a before/after ImageCompare wipe slider, and an AnnotationText contract risk highlighter with inline citation hover cards.`
22. **Semantic ProTable, 0ms conditional aggregates, offset Trace waterfall & multi-file PR diff**: `Create a production rollout review console with top KPIs dynamically recalculated in 0 ms via conditional count/sum/avg/max filters, a ProTable using declarative code/bar/delta/sparkline/badge cells with a sticky first column, a distributed Trace waterfall Tree with offsetPct timeline offsets, and a multi-file DiffView with inline review annotations.`

</details>

## See it in action

Every surface adapts natively to both dark mode and light mode (click any preview to inspect full resolution):

### Diagnose multi-stage conversion flows and health scores

Equal-height KPI cards with sparklines pair with a four-stage Sankey flow and a five-axis radar chart in one view. Switch tabs to inspect regional revenue bars or filter channel ROI rows.

| Dark mode | Light mode |
| :---: | :---: |
| ![Full-funnel conversion flow and radar diagnostic dashboard (Dark)](assets/screenshots/hero-executive-dashboard.png) | ![Full-funnel conversion flow and radar diagnostic dashboard (Light)](assets/screenshots/hero-executive-dashboard-light.png) |

### 26 ECharts 6 chart kinds & cross-chart enhancements (new in `v0.5.0`)

Render confidence `range` bands with shaded `markArea` windows, OKR/SLO `bullet` targets, auto-binned `histogram` distributions, before/after `dumbbell` deltas, Nightingale `rose` charts, collision-free 270° `radialBar` rings, ECharts 6 bi-directional `chord` diagrams, dual-reference `scatter` quadrants, 100% normalized stacked bars (`stackMode="percent"`), and stepped logarithmic lines (`step=true, yScale="log"`) — all verified crisp inside `276px` two-column cards.

| Dark mode | Light mode |
| :---: | :---: |
| ![v0.5.0 7 new chart kinds and 5 chart enhancements (Dark)](assets/screenshots/nextgen-charts-gallery.png) | ![v0.5.0 7 new chart kinds and 5 chart enhancements (Light)](assets/screenshots/nextgen-charts-gallery-light.png) |

### 7 new zero-dependency interactive primitives (new in `v0.5.0`)

Pair live dual-thumb `RangeSlider` calculators, half-star/Likert `Rating` controls, required-item gated `Checklist` panels, drag-and-drop + keyboard `SortableList` rankers, secret-masking `KvEditor` tables, interactive `ImageCompare` wipe comparators, and `AnnotationText` inline entity/citation highlighters — with zero bytes added to the cold-boot shell.

| Dark mode | Light mode |
| :---: | :---: |
| ![v0.5.0 7 zero-dependency interactive primitives (Dark)](assets/screenshots/nextgen-interactive-primitives.png) | ![v0.5.0 7 zero-dependency interactive primitives (Light)](assets/screenshots/nextgen-interactive-primitives-light.png) |

### Semantic ProTable, 0ms conditional aggregates, offset Trace waterfall & multi-file PR diff (upgraded in `v0.5.0`)

Recalculate top KPIs locally in 0 ms via conditional `count`/`sum`/`avg`/`max` filters, render declarative `code`/`bar`/`delta`/`sparkline`/`badge` columns with `stickyFirstColumn` in `ProTable`, inspect cascading `offsetPct` distributed APM trace waterfalls in `Tree`, and review multi-file PR tabs with inline annotations in `DiffView`.

| Dark mode | Light mode |
| :---: | :---: |
| ![Semantic ProTable, distributed Trace offset waterfall, and multi-file annotated PR DiffView (Dark)](assets/screenshots/protable-trace-pr-diff.png) | ![Semantic ProTable, distributed Trace offset waterfall, and multi-file annotated PR DiffView (Light)](assets/screenshots/protable-trace-pr-diff-light.png) |

### Cross-filter charts and ProTables locally in 0 ms with one-click export

Click any bar, donut slice, or `ProTable` row to highlight linked charts, filter table rows, and recalculate KPI totals locally in 0 ms with zero extra LLM turns. Dismiss the filter chip (`×`) to reset, or export any chart as a 2× PNG or UTF-8 CSV directly from its header.

| Dark mode | Light mode |
| :---: | :---: |
| ![0ms Chart and ProTable cross-filtering and 1-click export (Dark)](assets/screenshots/chart-table-crossfilter.png) | ![0ms Chart and ProTable cross-filtering and 1-click export (Light)](assets/screenshots/chart-table-crossfilter-light.png) |

### Attribute revenue bridges and drill into multi-level compute spend

Pair an entity header and sparkline KPIs with a variance bridge (`waterfall`) carrying a dynamic `referenceLine` target marker alongside a click-to-drill-down 3-level cost `sunburst` chart.

| Dark mode | Light mode |
| :---: | :---: |
| ![FinOps ARR variance waterfall and 3-level cost sunburst (Dark)](assets/screenshots/finops-waterfall-sunburst.png) | ![FinOps ARR variance waterfall and 3-level cost sunburst (Light)](assets/screenshots/finops-waterfall-sunburst-light.png) |

### Correlate dual-axis traffic, live SLO thresholds, and change calendars

Drag the slider to shift the right-axis SLO `referenceLine` across a stacked dual-axis `combo` chart locally in 0 ms, paired below with a 14-day SLA tracker strip and a GitHub-style daily `calendar` heatmap.

| Dark mode | Light mode |
| :---: | :---: |
| ![Dual-axis combo chart, live SLO slider, and calendar heatmap (Dark)](assets/screenshots/sre-combo-calendar-slo.png) | ![Dual-axis combo chart, live SLO slider, and calendar heatmap (Light)](assets/screenshots/sre-combo-calendar-slo-light.png) |

### Monitor live store operations and stock alerts

Track daily chain revenue, order volume, and peak-hour fulfillment in real time. Combine stacked channel area curves, store-by-hour order heatmaps, and searchable inventory warning tables on one screen.

| Dark mode | Light mode |
| :---: | :---: |
| ![Multi-store live operations and inventory dashboard (Dark)](assets/screenshots/store-operations-dashboard.png) | ![Multi-store live operations and inventory dashboard (Light)](assets/screenshots/store-operations-dashboard-light.png) |

### Plan GPU capacity with visual check-cards, precision steppers, and follow-up prompts

Switch GPU instance tiers via rich check-cards or adjust replica steppers to recalculate cluster RPS and monthly budgets locally in 0 ms. Pair multi-tag zone selectors and hierarchical service breadcrumbs with clickable next-step prompt cards at the bottom.

| Dark mode | Light mode |
| :---: | :---: |
| ![GPU tier check-cards, precision steppers, and follow-up prompt cards (Dark)](assets/screenshots/antd-capacity-checkcard-planner.png) | ![GPU tier check-cards, precision steppers, and follow-up prompt cards (Light)](assets/screenshots/antd-capacity-checkcard-planner-light.png) |

### Govern dedicated clusters with SLA strips, bordered descriptions, and expandable ProTables

Combine production cluster headers, hoverable SLA uptime strips, and bordered specification tables in one view. Below, the enterprise ProTable adds one-click Markdown/CSV export, automatic numeric summary footers, and inline expandable row drawers.

| Dark mode | Light mode |
| :---: | :---: |
| ![Dedicated cluster SLA strip, bordered descriptions, and expandable ProTable (Dark)](assets/screenshots/enterprise-governance-protable.png) | ![Dedicated cluster SLA strip, bordered descriptions, and expandable ProTable (Light)](assets/screenshots/enterprise-governance-protable-light.png) |

### Triage latency spikes across service health DAGs, APM trace waterfalls, and logs

Render zero-dependency health-colored service dependency DAGs alongside a distributed trace waterfall tree with proportional latency bars and an error log console linked directly to workspace source lines.

| Dark mode | Light mode |
| :---: | :---: |
| ![Service health topology, distributed trace waterfall tree, and log viewer (Dark)](assets/screenshots/sre-apm-topology-workbench.png) | ![Service health topology, distributed trace waterfall tree, and log viewer (Light)](assets/screenshots/sre-apm-topology-workbench-light.png) |

### Model costs and returns with live sliders

Drag sliders or switch tiers to test budget, rate, or traffic assumptions right in chat. Totals, margins, and charts recalculate locally in 0 ms without spending extra tokens.

| Dark mode | Light mode |
| :---: | :---: |
| ![Live parameter calculator with sliders and bar chart (Dark)](assets/screenshots/zero-latency-simulator.png) | ![Live parameter calculator with sliders and bar chart (Light)](assets/screenshots/zero-latency-simulator-light.png) |

### Review diffs before approving critical actions

Pause high-impact changes with a review card above the chat input. Inspect the split code diff, select a rollout scope, and confirm before execution continues.

| Dark mode | Light mode |
| :---: | :---: |
| ![Split code diff and approval gate (Dark)](assets/screenshots/human-in-the-loop-ask.png) | ![Split code diff and approval gate (Light)](assets/screenshots/human-in-the-loop-ask-light.png) |

### Map layered system architecture to live source files

Render multi-layer Mermaid architecture diagrams alongside a workspace file tree and JSON inspector. Click any file node to open that exact line inside the right sidebar.

| Dark mode | Light mode |
| :---: | :---: |
| ![Layered architecture diagram linked to right sidebar source view (Dark)](assets/screenshots/codebase-explorer-sidebar.png) | ![Layered architecture diagram linked to right sidebar source view (Light)](assets/screenshots/codebase-explorer-sidebar-light.png) |

### Pin live task progress above the chat input

Keep multi-stage pipelines anchored at the bottom of the window. Stages and completion rates update in place while you scroll through earlier messages.

| Dark mode | Light mode |
| :---: | :---: |
| ![Persistent multi-stage task progress dock (Dark)](assets/screenshots/persistent-dock-pipeline.png) | ![Persistent multi-stage task progress dock (Light)](assets/screenshots/persistent-dock-pipeline-light.png) |

## Why A2UI

- **Safe by design**: Built on Google's A2UI 1.0 specification, models output declarative JSON only and never execute untrusted HTML or scripts, with anti-jank streaming skeletons.
- **Scoped domain skills, fewer tokens, higher accuracy**: Partitions all 64 components across 4 lightweight on-demand skills (`a2ui`, `a2ui-analytics`, `a2ui-devops`, `a2ui-forms`) with compile-time depth lowering — cutting prompt tokens by **66%+** with **100%** compile pass across 31 benchmark cases.
- **Native look and feel**: Every surface renders with DeepSeek Harness UI primitives, adapting automatically to light mode, dark mode, and community themes.
- **Zero host patches, fast startup**: Built on official plugin APIs with a 19.2 KB gzipped cold-boot core; chart and diagram engines load only on demand.

## Component catalog

Includes 64 native UI components, 26 interactive chart types, and full Mermaid diagram support:

| Category | Components | Purpose |
| :--- | :--- | :--- |
| **Layout & entity headers** | `Card`, `Row`, `Column`, `Grid`, `Tabs`, `Accordion`, `List`, `Modal`, `Divider`, `EntityHeader` | Responsive multi-row CSS grids, multi-column dashboards, tabs, collapsible panels, modals, and B2B object headers |
| **Metrics, SLOs & outcomes** | `Stat`, `MetricRing`, `Tracker`, `KeyValue` (bordered Descriptions), `Steps`, `Timeline`, `Schedule`, `Progress`, `Result` | KPI cards, radial rings, Tremor SLA/category bars, bordered descriptions, timelines, Gantt schedules, and outcome receipts |
| **Charts, topology & ProTable** | `Chart`, `ServiceGraph`, `Mermaid`, `Comparison`, `Matrix`, `Table` (semantic-cell & sticky-col ProTable), `Tree` (trace offset waterfall), `Kanban`, `AnnotationText` | 26 chart kinds, live health DAGs, trade-off & heat matrices, semantic-column/expandable/exportable ProTables, distributed trace waterfall trees, Kanban boards, and inline entity/citation highlighting |
| **DevOps, APIs & risk gates** | `Code`, `Terminal`, `ApiEndpoint`, `ApprovalCard`, `Checklist`, `DiffView` (multi-file + review annotations), `LogViewer`, `FileTree`, `JsonTree`, `SourceList` | Code blocks, runbook terminals, HTTP API workbenches, risk approval gates, pre-flight checklists, multi-file annotated PR diffs, logs, file trees, and citations |
| **Forms & interactive controls** | `Button`, `NumberInput`, `RangeSlider`, `Rating`, `SortableList`, `KvEditor`, `MultiSelect`, `DateRange`, `TreeSelect`, `CheckCard`, `Segmented`, `Select`, `Switch`, `Slider`, `ChoicePicker`, `TextField`, `CheckBox`, `DateTimeInput` | Dual-thumb range sliders, star/Likert ratings, drag-and-drop ranking, auto-redacted key-value editors, precision steppers, multi-tag selects, date ranges, tree selects, visual check/prompt cards, and validated inputs |
| **Typography and alerts** | `Text`, `Callout`, `Badge`, `Icon` | Rich text, color-coded callouts, status badges, and semantic icons |
| **Media & visual compare** | `Image` (native lightbox), `ImageCompare`, `AudioPlayer`, `Video` | Lightbox image previews, before/after wipe comparator, audio players, and video playback |

- **26 interactive charts (`Chart`)**: Vertical/horizontal bars (`bar`), `line`, `area`, dual-axis `combo`, variance bridge (`waterfall`), confidence/forecast band (`range`), OKR/SLO `bullet`, auto-binned `histogram`, before/after `dumbbell`, Nightingale `rose`, polar `radialBar`, bi-directional `chord`, donut/pie (`pie`), bubble & quadrant `scatter`, `radar`, multi-axis `parallel`, `funnel`, `gauge`, `heatmap`, daily `calendar` heatmap, `treemap`, drill-down `sunburst`, `sankey`, `boxplot`, network (`graph`), and `candlestick` — with stepped lines (`step`), log axes (`yScale="log"`), 100% normalized stacks (`stackMode="percent"`), shaded bands (`markArea`), quadrant axes (`referenceLine` + `referenceX`), 0 ms `Chart ↔ Table` cross-filtering, and 1-click 2× PNG download & CSV copy.
- **Architecture and flow diagrams (`Mermaid`)**: Flowcharts, sequence diagrams, state machines, class diagrams, ER diagrams, Gantt charts, Git graphs, and mindmaps with `10%–2000%` lossless vector zoom, pointer-anchored wheel zoom, drag-to-pan, fit-to-viewport, fullscreen view, and source toggle.

## Documentation and license

- [Developer and architecture guide (English)](./docs/DEVELOPMENT.md) | [开发与架构文档（简体中文）](./docs/DEVELOPMENT.zh-CN.md)
- [Contributing guide](./CONTRIBUTING.md) | [Code of conduct](./CODE_OF_CONDUCT.md) | [Security policy](./SECURITY.md) | [Changelog](./CHANGELOG.md)
- Released under the [MIT License](./LICENSE). See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for third-party open-source notices.
