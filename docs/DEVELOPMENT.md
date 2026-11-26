# Developer & Architecture Guide (`dsh-genui-a2ui`)

**English** | [简体中文](./DEVELOPMENT.zh-CN.md) | [Back to Product README](../README.en.md)

This document covers the technical architecture, **Google A2UI 1.0** protocol compliance, **DeepSeek Harness (DSH)** official extension seams, bundle code-splitting budgets, complete **A2UI Express DSL** contracts, and local verification workflows for `dsh-genui-a2ui`.

---

## 1. Architectural Overview

`dsh-genui-a2ui` operates as a three-stage pipeline strictly separated across the Host (Node.js / Cordis) and Client (Browser / React) boundary:

1. **Agent Emission (`A2UI Express`)** — When `a2ui` is enabled, the Host injects a compact system-prompt section (`tool:a2ui`, `order: 9200` to preserve built-in KV-cache prefixes) and registers the on-demand `a2ui` skill. Models invoke `a2ui_render` or `a2ui_ask` using concise A2UI Express syntax.
2. **Host Validation & Self-Repair (`@a2ui/agent` + Zod)** — `SurfaceSessions` compiles A2UI Express against the isomorphic `dshSchemaCatalog` (`src/shared/catalog-schema.ts`), enforces payload/depth/formula safety caps (`A2UI_LIMITS`), and returns pinpoint line diagnostics on invalid tags or props so the model can self-repair within the same turn (up to `2` retries).
3. **Client Streaming & Native Light-DOM Rendering (`@a2ui/react`)** — In the browser, `StreamingExpressSession` progressively parses partial tool-call arguments at 60fps while chunks arrive, then switches to authoritative Host-compiled A2UI JSON messages (`createSurface`, `updateComponents`, `updateDataModel`) once tool execution completes.

```mermaid
flowchart TB
  subgraph S1["Stage 1 · Agent Emission"]
    P["System Prompt Section tool:a2ui (order 9200)"]
    SK["On-Demand skill(a2ui) Full Grammar"]
    LLM["LLM Emits Declarative A2UI Express"]
    P --> LLM
    SK -.-> LLM
  end

  subgraph S2["Stage 2 · Host Compiler & Safety Gate (lib/index.js)"]
    COMP["SurfaceSessions Compiler (@a2ui/agent)"]
    ZOD["Isomorphic dshSchemaCatalog + A2UI_LIMITS + Static calc AST Check"]
    REPAIR["Line-Exact Diagnostic Self-Repair (up to 2 retries/turn)"]
    WIRE["Authoritative A2UI 1.0 JSON Messages (createSurface / updateComponents / updateDataModel)"]
    COMP --> ZOD
    ZOD -->|"Validation error"| REPAIR
    REPAIR -->|"In-turn self-heal"| LLM
    ZOD -->|"Valid"| WIRE
  end

  subgraph S3["Stage 3 · Client 5-Chunk Runtime & Native Light-DOM Slots"]
    SHELL["Cold-Boot Shell lib/client.js (77.0 kB)"]
    RT["Lazy Runtime client.runtime.js (64 Components, Zero Streaming Parser)"]
    ST["Lazy Stream Compiler client.streaming.js (60fps Incremental Express)"]
    EC["Lazy Chart Engine client.echarts.js (26 ECharts 6 Kinds)"]
    MM["Lazy Diagram Engine client.mermaid.js (Strict Sandbox Mermaid 11)"]
    SLOTS["Official DSH UI Slots (turnTail / toolview / input.dock / input.left)"]
    SIDE["Right Sidebar File Jump sidebarRight.openResource"]
    SHELL -->|"First surface mount"| RT
    SHELL -.->|"Active tool stream"| ST
    RT -.->|"On Chart"| EC
    RT -.->|"On Mermaid"| MM
    RT --> SLOTS
    SLOTS --> SIDE
  end

  LLM -->|"Streaming tool args (60fps progressive UI)"| ST
  LLM -->|"a2ui_render / a2ui_ask"| COMP
  WIRE -->|"Turn-indexed projection"| RT
  SLOTS -->|"[a2ui-action] or /a2ui-answer"| LLM
```

---

## 2. Six Pillars of Google A2UI 1.0 Compliance

`dsh-genui-a2ui` adheres strictly to the **A2UI (Agent-to-User Interface) 1.0** specification without private protocol forks:

1. **Data, Not Code (Security by Design)** — Agents never emit executable HTML, JavaScript, or `iframe` documents. Only pure declarative JSON messages cross the Host-Client boundary, eliminating XSS and arbitrary script execution by construction.
2. **Trusted Client Catalog** — Only the **64 components** and **28 functions** registered in `dshSchemaCatalog` can be instantiated. Unknown components or malformed arguments are rejected at compile time and render time.
3. **LLM-Friendly Flat Streaming Graph** — Container composition uses flat component maps with `ChildSchema` ID references rather than deeply nested JSX trees, enabling 60fps token-by-token streaming and surgical in-place updates via `surface("id", update=true)`.
4. **Structure · State · Render Separation** — UI topology (`components`), JSON Pointer reactive state (`$/paths`), and host React widgets are decoupled.
5. **Thin UI, Thick Agent** — Deterministic scalar math (`calc`), conditional formatting (`cond`), and input checks (`?checks`) execute locally in `0ms`; open-ended reasoning, multi-row schedule generation, live queries, and external side effects round-trip to the Agent via `[a2ui-action]` or `a2ui_ask`.
6. **Host-Native Experience** — Zero Shadow DOM and zero `iframe` isolation tax. Components render directly in Light DOM with DSH's shared primitives and `--dsw-*` CSS tokens, inheriting light/dark themes and community skins automatically.

---

## 3. Zero-Hack DeepSeek Harness Integration

`dsh-genui-a2ui` relies exclusively on documented DSH Host and Client extension APIs — zero undocumented DOM queries, zero private Electron IPC hooks, and zero monkey-patches:

| Layer | Official DSH Extension Seam | Usage in `dsh-genui-a2ui` |
| :--- | :--- | :--- |
| **Host Services** | Cordis `tools`, `skills`, `commands`, `systemPrompt` | Registers `a2ui_render`, `a2ui_ask`, 4 on-demand domain skills (`a2ui`, `a2ui-analytics`, `a2ui-devops`, `a2ui-forms`), `/a2ui`, `/a2ui-answer`, and `tool:a2ui` prompt guidance. |
| **Client UI Slots** | `tool.call.toolview`, `conversation.chat.turnTail`, `conversation.input.dock`, `conversation.input.left`, `conversation.user.text.node` | Renders inline streaming cards, turn-tail spotlight deliverables, persistent docks, blocking approval wizards, the composer toggle pill, and `[a2ui-action]` receipt chips. |
| **Conversation Projections** | `uiConversation.events.register`, `uiConversation.userText.register` | Projects settled `a2ui_render` surfaces into replay-safe, fork-safe turn metadata and formats `[a2ui-action]` user messages. |
| **Shared UI Primitives** | `@deepseek-ai/dsh-client-ui-primitives` | Reuses 27 native host exports (`Switch`, `SegmentedControl`, `HoverCard`, `StateDot`, `ImageLightbox`, `FileTypeIcon`, `PathLabel`, `LinkIconRegular`, `JsonTree`, etc.) and `--dsw-*` semantic design tokens. |
| **Workspace Sidebar** | `@deepseek-ai/dsh-client-ui-sidebar-right` | Calls `sidebarRight.openResource` from `FileTree`, `DiffView`, `Code`, `LogViewer`, and `SourceList` to jump directly to workspace files and 1-based line numbers. |
| **Client Code Splitting** | `window.__ModuleLoader__.load({ id: "dsh-genui-a2ui", entry })` | Loads heavy runtime, ECharts, and Mermaid chunks strictly on demand. |

### 6-Chunk On-Demand Bundle Architecture (Host + 5 Client Chunks)

| Bundle Target | Raw Size | Gzip Size | Role & Load Trigger |
| :--- | :--- | :--- | :--- |
| `lib/client.js` | **`77.0 kB`** | **`21.5 kB`** | Cold-boot shell: registers UI Slots, bilingual chrome, empty-session toast feedback, and composer pill (enforced by `< 100 kB` raw / `.bundle-budget.json` raw+gzip ratchet). |
| `lib/client.runtime.js` | `1.01 MB` | `264 kB` | Loaded on first A2UI surface mount (`@a2ui/react`, 64-component catalog, TanStack Table, 0ms cross-filtering & per-widget `ErrorBoundary`; excludes streaming parser and `react-aria-components`). |
| `lib/client.streaming.js` | `651 kB` | `171 kB` | Loaded strictly during live tool-call streaming (`StreamingExpressSession` incremental prefix cache & `@a2ui/agent` stream parser; never loaded for settled history). |
| `lib/client.echarts.js` | `923 kB` | `303 kB` | Loaded only when a surface renders `Chart` (ECharts 6 modular registration for 26 chart kinds, markLines/markAreas, cross-filter highlight, 2× PNG export & 276px compact adaptation). |
| `lib/client.mermaid.js` | `2.67 MB` | `702 kB` | Loaded only when a surface renders `Mermaid` (Mermaid 11 under `securityLevel: "strict"` with 16 disallowed diagram types & `katex` stripped at build time + per-rule CSS scoping + SVG sanitizer + LRU-64 cache). |
| `lib/index.js` | `768 kB` | `211 kB` | Self-contained Host ESM bundle (`@a2ui/agent`, domain skill compactor, linear Express lowering passes & Zod catalog) — ships with zero runtime `dependencies`. |

---

## 4. Surface Placement Modes & Safety Limits

### Placement Modes

| Placement | Invocation | DSH UI Slot | Lifecycle |
| :--- | :--- | :--- | :--- |
| **Spotlight** *(default)* | `a2ui_render({ ui, placement: "answer" })` | `conversation.chat.turnTail` | Rendered at turn tail; interactive on latest turn, snapshotted read-only when superseded in later turns. |
| **Inline** | `a2ui_render({ ui, placement: "inline" })` | `tool.call.toolview` | Compact summary embedded inside the tool call step row (streams progressively at 60fps while generating). |
| **Persistent Dock** | `a2ui_render({ ui, placement: "dock" })` | `conversation.input.dock` | Pinned above the chat input across turns; updated in place via `surface("id", update=true)`. |
| **Blocking Ask** | `a2ui_ask({ ui, title })` | `conversation.input.dock` + `tool.call.toolview` | Suspends the active tool call inside the current turn until settled via `/a2ui-answer` (`answered` or `skipped`). |

### Host Safety Caps (`A2UI_LIMITS`)

- `maxUiChars`: `64,000` characters per tool call
- `maxSurfacesPerCall`: `8` surfaces
- `maxComponentsPerSurface`: `250` flat component nodes
- `maxDataModelBytes`: `256,000` UTF-8 bytes
- `maxCompiledBytes`: `512,000` UTF-8 bytes per compiled payload
- `maxRepairsPerTurn`: `2` compiler diagnostic self-healing retries per turn

---

## 5. Complete A2UI Express DSL Reference (64 Components)

Every surface begins with `surface("snake_id")` (or `surface("snake_id", update=true)` for incremental updates) and assigns one root component to `root = ...`. Mutable state belongs in JSON Pointer paths (`$/foo = 42`); reactive expressions belong in local identifiers (`total = calc(...)`), never assigned to `$/paths`.

### Layout, Grids & Entity Headers (10)

| Component | Express DSL Signature | Technical Notes |
| :--- | :--- | :--- |
| `Card` | `Card(child)` | Surface container card using `--dsw-*` border & background tokens. |
| `Column` | `Column([c1, c2, ...], justify?, align?)` | Vertical flex stack; direct children accept numeric `weight`. |
| `Row` | `Row([c1, c2, ...], justify?, align?)` | Horizontal flex row (`justify`: `"spaceBetween" \| "start" \| "center" \| "end"`). |
| `Grid` | `Grid([c1, c2, ...], columns?=3, gap?="sm"\|"md"\|"lg")` | Responsive multi-row equal-width CSS Grid container (falls back to 1 column on mobile). |
| `Tabs` | `Tabs([{ title, child }, ...])` | Preserves surface `dataModel` bindings across tab switches. |
| `Accordion` | `Accordion([{ title, subtitle?, badge?, open?, child }, ...], multiple?)` | Collapsible disclosure container backed by flat `ChildSchema` IDs. |
| `List` | `List([c1, c2, ...], direction?, align?)` | Vertical or horizontal semantic list. |
| `Modal` | `Modal(trigger=Button(...), content=Column([...]))` | Accessible modal dialog overlay. |
| `Divider` | `Divider(axis?)` | Horizontal or vertical divider line. |
| `EntityHeader` | `EntityHeader(title, subtitle?, avatarText?, status?, statusLabel?, badge?, tags?, metrics?, actionLabel?, action?)` | B2B business object header (tenant/cluster/service/ticket) powered by host `StateDot`. |

### Typography & Advisories (4)

| Component | Express DSL Signature | Technical Notes |
| :--- | :--- | :--- |
| `Text` | `Text(text, variant?="body"\|"caption"\|"h1".."h5")` | Full GFM Markdown renderer bound to static strings or `$/paths`. |
| `Callout` | `Callout(title, message?, tone?="info"\|"success"\|"warning"\|"danger", collapsible?, child?)` | Semantic banner with optional collapsible body and nested `ChildSchema`. |
| `Badge` | `Badge(label, tone?="neutral"\|"info"\|"success"\|"warning"\|"danger"\|"outline"\|"solid")` | Semantic pill badge. |
| `Icon` | `Icon(name)` | Vector icon mapped to standard A2UI icon names. |

### Metrics, SLOs, Timelines & Outcomes (9)

| Component | Express DSL Signature | Technical Notes |
| :--- | :--- | :--- |
| `Stat` | `Stat(label, value, delta?, trend?="up"\|"down"\|"neutral", spark?, caption?)` | KPI card with unit split, trend badge, and inline SVG `spark` array (`[10, 14, 19]`). |
| `MetricRing` | `MetricRing(label, value, max?=100, unit?, sublabel?, tone?="auto", size?=88)` | Radial gauge ring with automatic threshold coloring (`tone="auto"`). |
| `Tracker` | `Tracker(data, title?, summary?, mode?="uptime"\|"category")` | Tremor SLA uptime strip (with host `HoverCard` tooltips) & multi-segment category bar. |
| `KeyValue` | `KeyValue(items, title?, columns?=1..3, bordered?=false, copyable?)` | AntD `<Descriptions>` with `bordered=true` table mode and item-level `span: 1..3`. |
| `Steps` | `Steps(items, current?, direction?="vertical"\|"horizontal", title?)` | Items: `{ title, description?, status?: "done"\|"active"\|"pending"\|"error", meta? }`. |
| `Timeline` | `Timeline(items, title?, badge?)` | Chronological stream supporting collapsible `detail` and nested `child` components. |
| `Schedule` | `Schedule(items, title?, range?, now?, action?)` | Maintenance window & Gantt timeline bar with current-time marker. |
| `Progress` | `Progress(value, max?=100, label?, tone?="brand"\|"success"\|"warning"\|"danger")` | Accessible reactive progress bar. |
| `Result` | `Result(status="success"\|"info"\|"warning"\|"error"\|"empty", title, subtitle?, meta?, actionLabel?, action?, child?)` | Structured operation receipt & empty state card. |

### Charts, Topologies, Matrices, Trees & ProTables (9)

| Component | Express DSL Signature | Technical Notes |
| :--- | :--- | :--- |
| `Chart` | `Chart(kind, data, title?, xField?, yField?, y2Field?, seriesField?, sizeField?, referenceLine?, referenceLabel?, referenceX?, referenceXLabel?, stacked?, stackMode?, step?, yScale?, bins?, markArea?, horizontal?, zoom?, height?, selected?, exportable?, action?)` | 26 kinds: `"bar" \| "line" \| "area" \| "combo" \| "waterfall" \| "range" \| "bullet" \| "histogram" \| "dumbbell" \| "rose" \| "radialBar" \| "chord" \| "pie" \| "scatter" \| "radar" \| "parallel" \| "funnel" \| "gauge" \| "heatmap" \| "calendar" \| "treemap" \| "sunburst" \| "sankey" \| "boxplot" \| "graph" \| "candlestick"`. |
| `ServiceGraph` | `ServiceGraph(nodes, edges?, title?, direction?="LR"\|"TB", action?)` | Zero-dependency health-colored DAG with upstream/downstream highlighting. |
| `Mermaid` | `Mermaid(code, title?, caption?)` | 15 allowed diagram kinds (`flowchart`/`graph`, `sequenceDiagram`, `classDiagram`, `stateDiagram`/`-v2`, `erDiagram`, `gantt`, `pie`, `journey`, `gitGraph`, `mindmap`, `timeline`, `quadrantChart`, `xychart-beta`) with `10%–2000%` vector zoom, drag-to-pan, and fullscreen view. |
| `Comparison` | `Comparison(options, rows, title?, action?)` | Multi-option trade-off matrix (`ok:` / `warn:` / `no:` cell prefixes & recommendation column). |
| `Matrix` | `Matrix(rows, columns, values, title?, cornerLabel?, unit?, colorScale?, showTotals?)` | Conditional-formatting heat cross-tabulation & RBAC permission matrix. |
| `Table` | `Table(rows, columns?, title?, searchable?, pageSize?, exportable?, selectable?, batchLabel?, showSummary?, stickyFirstColumn?, expandKey?, filterField?, filterValue?, action?)` | Enterprise `ProTable` with semantic cell formats (`badge`/`bar`/`delta`/`sparkline`/`code`), sticky first column, numeric sort, search, pagination, density toggle, sorted CSV/MD export, batch action, summary footer, 0ms cross-filter, and `expandKey` inline detail drawer. |
| `Tree` | `Tree(nodes, title?, summary?, searchable?, expandedDepth?=3, action?)` | Hierarchy & APM trace waterfall tree with `sharePct` + `offsetPct` cascading timeline bars and host `StateDot`. |
| `Kanban` | `Kanban(columns, title?, action?)` | Multi-lane sprint & incident triage board. |
| `AnnotationText` | `AnnotationText(text, annotations, title?, action?)` | Inline text entity highlighting, risk/compliance callouts, and source hover cards (powered by host `HoverCard`). |

### DevOps, APIs & Risk Gates (10)

| Component | Express DSL Signature | Technical Notes |
| :--- | :--- | :--- |
| `Code` | `Code(code, language?, lineNumbers?, title?, filePath?, line?)` | Syntax-highlighted snippet; `filePath` + `line` opens DSH's right sidebar. |
| `Terminal` | `Terminal(commands, title?, cwd?, shell?="zsh", maxHeight?)` | Runbook terminal separating `$ cmd`, `stdout`, `stderr`, and `exitCode` (copies clean command only). |
| `ApiEndpoint` | `ApiEndpoint(method, path, summary?, status?, latency?, baseUrl?, params?, headers?, requestBody?, responseBody?, action?)` | HTTP API contract workbench reusing host `JsonTree` and shell-safe `cURL` copy. |
| `ApprovalCard` | `ApprovalCard(title, summary?, severity?="high", scope?, impacts?, confirmLabel?, approveLabel?, rejectLabel?, approveAction?, rejectAction?)` | High-risk production approval gate gated by host `Switch` acknowledgement. |
| `Checklist` | `Checklist(items, value?=$/checkedIds, title?, description?, actionLabel?, action?)` | Pre-flight and compliance checklist that locks its proceed action until all `required` items are checked. |
| `DiffView` | `DiffView(before?, after?, files?, annotations?, title?, filePath?, line?, language?, mode?="unified"\|"split")` | Line diff engine with multi-file PR tabs, inline review annotations, `+added/-removed` counts, Unified/Split toggle, and `filePath` jump. |
| `LogViewer` | `LogViewer(entries, title?, searchable?, defaultLevel?, maxHeight?, action?)` | Structured log & stack trace console with level pills and sidebar file links. |
| `FileTree` | `FileTree(items, title?, expandedDepth?, action?)` | Workspace file tree powered by host `FileTypeIcon` and `PathLabel`. |
| `JsonTree` | `JsonTree(data, title?, expandedDepth?, copyable?)` | Powered by `@deepseek-ai/dsh-client-ui-primitives` `JsonTree`. |
| `SourceList` | `SourceList(items, title?, action?)` | Citations & code evidence list powered by host `LinkIconRegular` and `FileTypeIcon`. |

### Form Controls, Prompt Cards & Media (22)

| Component | Express DSL Signature | Technical Notes |
| :--- | :--- | :--- |
| `Button` | `Button(child, variant?="primary"\|"default"\|"borderless", action=Event(name, context?, userMessage?))` | Sends `[a2ui-action]` or runs local `copyText`/`openUrl`; respects attached `?checks`. |
| `NumberInput` | `NumberInput(label, $/num, min?, max?, step?=1, unit?, prefix?)` | AntD `InputNumber` precision stepper bound directly to numeric `$/path`. |
| `RangeSlider` | `RangeSlider(label, min, max, $/low, $/high, step?, prefix?, unit?)` | Dual-thumb numeric range selector bound to two `$/paths` for 0ms budget/filter calculators. |
| `Rating` | `Rating(label, $/score, max?=5, allowHalf?=false, variant?="stars"\|"scale", labels?, readOnly?)` | Half-star and 1..N Likert scale ratings bound to numeric `$/path`. |
| `SortableList` | `SortableList($/items, title?, description?, disabled?)` | HTML5 drag-and-drop plus accessible ↑/↓ priority ranker writing ordered arrays back to `$/items`. |
| `KvEditor` | `KvEditor($/pairs, title?, keyLabel?, valueLabel?, keyPlaceholder?, valuePlaceholder?, addLabel?, maxItems?, maskSecrets?=true)` | Dynamic environment/header key-value editor with automatic secret masking for sensitive keys. |
| `MultiSelect` | `MultiSelect(label, options, value=$/strList, placeholder?, searchable?=true, allowCreate?=false, maxTagCount?=5)` | AntD `Select(mode="multiple"\|"tags")` with removable chips and Enter-to-create tags. |
| `DateRange` | `DateRange(label, start=$/start, end=$/end, presets?=true, enableTime?=false)` | AntD `RangePicker` with `Today / 7d / 30d / 90d` presets and span day badge. |
| `TreeSelect` | `TreeSelect(label, nodes, value=$/str, placeholder?, searchable?=true)` | AntD `TreeSelect / Cascader` displaying full hierarchical breadcrumb on trigger. |
| `CheckCard` | `CheckCard(label, options, value?=$/val, multiple?=false, columns?=3, action?)` | Dual-mode: AntD Pro `<CheckCard.Group>` when `value` is bound, or `@ant-design/x` `<Prompts>` follow-up cards when `action` is set. |
| `Segmented` | `Segmented(label, options, value=$/str)` | Delegates to host `SegmentedControl`, bound directly to scalar `$/str`. |
| `Select` | `Select(label, options, value=$/str, placeholder?, searchable?)` | Single-select dropdown (host `Menu` when ≤8 unsearchable items, searchable glass popover otherwise). |
| `Switch` | `Switch(label, $/bool, description?)` | Boolean toggle row backed by host `Switch`. |
| `Slider` | `Slider(label, min, max, $/value, steps?)` | `steps = (max - min) / stepSize`; static numeric bounds. |
| `ChoicePicker` | `ChoicePicker(label?, variant?="mutuallyExclusive"\|"multipleSelection", options, value=$/list, displayStyle?="chips"\|"checkbox", filterable?)` | Bound value is always an array of selected option values (`["opt_a"]`). |
| `TextField` | `TextField(label, value?=$/text, placeholder?, variant?="shortText"\|"longText"\|"number"\|"obscured")` | Supports live validation `?checks` and automatic redaction for `variant="obscured"`. |
| `CheckBox` | `CheckBox(label, value=$/flag)` | Boolean data-model binding. |
| `DateTimeInput` | `DateTimeInput(value=$/iso, enableDate?, enableTime?, min?, max?, label?)` | ISO 8601 string binding. |
| `Image` | `Image(url, description?, fit?, variant?)` | Click-to-zoom preview powered by host `ImageLightbox`. |
| `ImageCompare` | `ImageCompare(beforeUrl, afterUrl, beforeLabel?, afterLabel?, title?, initialPosition?=50, height?=220)` | Interactive before/after wipe comparator for visual QA and design reviews. |
| `AudioPlayer` | `AudioPlayer(url, description?)` | Native audio playback control. |
| `Video` | `Video(url, posterUrl?)` | Native HTML5 video element. |

---

## 6. Client-Side Functions Reference (28 Functions)

- **Algebraic, Lookup & Conditional Aggregate Math (8)**:
  - `calc(expr, vars, decimals?)`: Safe recursive-descent formula evaluator supporting `+ - * / ^ % ( ) ? : == != < <= > >= && ||` and `pow, sqrt, exp, log, ln, log10, abs, min, max, clamp, round, floor, ceil, pmt(ratePerPeriod, nper, pv), sin, cos, tan`. Validated statically at compile time (max true nesting depth `36`, max AST nodes `128`).
  - `lookup(key, table, fallback?)`: Depth-1 map lookup (auto-unwraps single-select `ChoicePicker` arrays) replacing deeply nested `cond(eq(...))` chains.
  - `cond(condition, truthy, falsy)`
  - `sum(items, field?, filterField?, filterValue?)`, `avg(...)`, `count(...)`, `min(...)`, `max(...)` (all support scalar/array cross-filter live 0ms recalculation)
- **Comparators & Boolean Logic (7)**:
  - `eq(a, b)` (auto-unwraps single-element `ChoicePicker` arrays), `gt(a, b)`, `lt(a, b)`, `includes(items, value)`, `and([...])`, `or([...])`, `not(x)`
- **Formatting & Concatenation (6)**:
  - `formatNumber(value, decimals?, grouping?)`, `formatCurrency(value, currency, decimals?, grouping?)`, `formatDate(value, format)`, `formatString(template)`, `concat(items)`, `pluralize(...)`
- **Validation (`?checks`) & Local Actions (7)**:
  - `required(value)`, `regex(value, pattern)`, `length(value, min?, max?)`, `numeric(value, min?, max?)`, `email(value)`, `copyText(text)`, `openUrl(url)`

---

## 7. Local Development, Testing & Packaging

```bash
# Install dependencies from lockfile
npm ci

# Format & lint check (includes zero-comment ratchet gate)
npm run lint

# TypeScript strict check
npm run typecheck

# Build Host ESM + 5 Client CJS chunks & verify 6-chunk raw/gzip budget ratchet
npm run build && npm run check:bundle

# Run strict TLA+ formal model checking across all 4 state-machine specs
npm run verify:tla:strict

# Run all unit, React best-practice, security, contract, deterministic replay, and bundle tests
npm test

# Run 31-case LLM generation & self-repair eval benchmark (--mode=mock or --mode=live --model=deepseek-chat)
npm run eval:llm -- --mode=mock --strategy=both

# Verify compatibility against installed DeepSeek Harness.app (12 platform modules, 7 injected modules, 30 primitives, 5 slots, 40 CSS tokens)
npm run check:host-api

# Inspect npm publish tarball contents (exact 18 files)
npm pack --dry-run --ignore-scripts

# Launch isolated DSH Web profile (.dsh-dev) on http://127.0.0.1:18992 + scripted Mock LLM (18991)
node scripts/dev-env.mjs setup
node scripts/dev-env.mjs serve
```

### Key Repository Layout

- `src/index.ts` — Host Cordis plugin entry (`tools`, 4-domain `skills`, `commands`, `systemPrompt`)
- `src/host/` — `a2ui_render`, `a2ui_ask`, `SurfaceSessions` compiler (with transactional rollback), domain skill compactor (`prompt-compact.ts`), and 31-case eval suite (`eval-suite.ts`)
- `src/shared/` — Isomorphic `dshSchemaCatalog` (64 components / 28 functions), Express lowering passes (`express-preprocess.ts`), Host/Client `wire-types.ts`, `calc` parser/evaluator, secret/prototype sanitizers, temporal helpers, and shared cross-chunk i18n
- `src/client/index.ts` — `68.1 kB` cold-boot UI slot shell & composer toggle pill
- `src/client/dom-hooks.ts` — Sole low-level DOM / ECharts PNG export / streaming height stabilizer / Mermaid lifecycle boundary (`0` `useEffect` in `.tsx` files)
- `src/client/chunks/` — On-demand entrypoints (`runtime-chunk.ts`, `streaming-chunk.ts`, `echarts-chunk.ts`, `mermaid-chunk.ts`)
- `src/client/catalog/` — Light-DOM React implementations of all 64 components & 28 functions
- `build/` — `tsdown` 6-target build preset & DSH web platform externalizer
- `scripts/` — Host API contract verifier (`check-host-api.mjs`), LLM benchmark runner (`eval-llm.mjs`), and isolated mock dev server (`dev-env.mjs`, `mock-llm.mjs`)
- `AGENTS.md` — `306px`-first `@container` layout rules, ECharts `276px` compact anti-collision contract, and pre-ship visual QA checklist
