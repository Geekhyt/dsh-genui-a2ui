# Developer & Architecture Guide (`dsh-genui-a2ui`)

**English** | [简体中文](./DEVELOPMENT.zh-CN.md) | [Back to Product README](../README.en.md)

This document covers the technical architecture, **Google A2UI 1.0** protocol compliance, **DeepSeek Harness (DSH)** official extension seams, bundle code-splitting budgets, complete **A2UI Express DSL** contracts, and local verification workflows for `dsh-genui-a2ui`.

---

## 1. Architectural Overview

`dsh-genui-a2ui` operates as a three-stage pipeline strictly separated across the Host (Node.js / Cordis) and Client (Browser / React) boundary:

1. **Agent Emission (`A2UI Express`)** — When `a2ui` is enabled, the Host injects a compact system-prompt section (`tool:a2ui`, `order: 9200` to preserve built-in KV-cache prefixes) and registers the on-demand `a2ui` skill. Models invoke `a2ui_render` or `a2ui_ask` using concise A2UI Express syntax.
2. **Host Validation & Self-Repair (`@a2ui/agent` + Zod)** — `SurfaceSessions` compiles A2UI Express against the isomorphic `dshSchemaCatalog` (`src/shared/catalog-schema.ts`), enforces payload/depth/formula safety caps (`A2UI_LIMITS`), and returns pinpoint line diagnostics on invalid tags or props so the model can self-repair within the same turn (up to `2` retries).
3. **Client Streaming & Native Light-DOM Rendering (`@a2ui/react`)** — In the browser, `StreamingExpressSession` progressively parses partial tool-call arguments at 60fps while chunks arrive, then switches to authoritative Host-compiled A2UI JSON messages (`createSurface`, `updateComponents`, `updateDataModel`) once tool execution completes.

---

## 2. Six Pillars of Google A2UI 1.0 Compliance

`dsh-genui-a2ui` adheres strictly to the **A2UI (Agent-to-User Interface) 1.0** specification without private protocol forks:

1. **Data, Not Code (Security by Design)** — Agents never emit executable HTML, JavaScript, or `iframe` documents. Only pure declarative JSON messages cross the Host-Client boundary, eliminating XSS and arbitrary script execution by construction.
2. **Trusted Client Catalog** — Only the **32 components** and **23 functions** registered in `dshSchemaCatalog` can be instantiated. Unknown components or malformed arguments are rejected at compile time and render time.
3. **LLM-Friendly Flat Streaming Graph** — Container composition uses flat component maps with `ChildSchema` ID references rather than deeply nested JSX trees, enabling 60fps token-by-token streaming and surgical in-place updates via `surface("id", update=true)`.
4. **Structure · State · Render Separation** — UI topology (`components`), JSON Pointer reactive state (`$/paths`), and host React widgets are decoupled.
5. **Thin UI, Thick Agent** — Deterministic scalar math (`calc`), conditional formatting (`cond`), and input checks (`?checks`) execute locally in `0ms`; open-ended reasoning, multi-row schedule generation, live queries, and external side effects round-trip to the Agent via `[a2ui-action]` or `a2ui_ask`.
6. **Host-Native Experience** — Zero Shadow DOM and zero `iframe` isolation tax. Components render directly in Light DOM with DSH's shared primitives and `--dsw-*` CSS tokens, inheriting light/dark themes and community skins automatically.

---

## 3. Zero-Hack DeepSeek Harness Integration

`dsh-genui-a2ui` relies exclusively on documented DSH Host and Client extension APIs — zero undocumented DOM queries, zero private Electron IPC hooks, and zero monkey-patches:

| Layer | Official DSH Extension Seam | Usage in `dsh-genui-a2ui` |
| :--- | :--- | :--- |
| **Host Services** | Cordis `tools`, `skills`, `commands`, `systemPrompt` | Registers `a2ui_render`, `a2ui_ask`, `skill("a2ui")`, `/a2ui`, `/a2ui-answer`, and `tool:a2ui` prompt guidance. |
| **Client UI Slots** | `tool.call.toolview`, `conversation.chat.turnTail`, `conversation.input.dock`, `conversation.input.left`, `conversation.user.text.node` | Renders inline streaming cards, turn-tail spotlight deliverables, persistent docks, blocking approval wizards, the composer toggle pill, and `[a2ui-action]` receipt chips. |
| **Conversation Projections** | `uiConversation.events.register`, `uiConversation.userText.register` | Projects settled `a2ui_render` surfaces into replay-safe, fork-safe turn metadata and formats `[a2ui-action]` user messages. |
| **Shared UI Primitives** | `@deepseek-ai/dsh-client-ui-primitives` | Reuses host `JsonTree`, button primitives, and `--dsw-*` semantic design tokens. |
| **Workspace Sidebar** | `@deepseek-ai/dsh-client-ui-sidebar-right` | Calls `sidebarRight.openResource` from `FileTree`, `DiffView`, and `Code` to jump directly to workspace files and 1-based line numbers. |
| **Client Code Splitting** | `window.__ModuleLoader__.load({ id: "dsh-genui-a2ui", entry })` | Loads heavy runtime, ECharts, and Mermaid chunks strictly on demand. |

### 4-Chunk On-Demand Bundle Architecture

| Bundle Target | Raw Size | Gzip Size | Role & Load Trigger |
| :--- | :--- | :--- | :--- |
| `lib/client.js` | **`45.9 kB`** | **`12.6 kB`** | Cold-boot shell: registers UI Slots and composer pill (enforced by `< 500 kB` build & test gate). |
| `lib/client.runtime.js` | `1.03 MB` | ~`310 kB` | Loaded on first A2UI surface mount (`@a2ui/react`, 32-component catalog, TanStack Table, React Aria). |
| `lib/client.echarts.js` | `777.6 kB` | `256.5 kB` | Loaded only when a surface renders `Chart` (ECharts 6 modular registration for 14 chart kinds). |
| `lib/client.mermaid.js` | `3.12 MB` | ~`940 kB` | Loaded only when a surface renders `Mermaid` (Mermaid 11 under `securityLevel: "strict"` + SVG sanitizer). |
| `lib/index.js` | `688.8 kB` | `187.4 kB` | Self-contained Host ESM bundle (`@a2ui/agent` + Zod catalog) — ships with zero runtime `dependencies`. |

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
- `maxRepairsPerTurn`: `2` compiler diagnostic self-healing retries per turn

---

## 5. Complete A2UI Express DSL Reference (32 Components)

Every surface begins with `surface("snake_id")` (or `surface("snake_id", update=true)` for incremental updates) and assigns one root component to `root = ...`. Mutable state belongs in JSON Pointer paths (`$/foo = 42`); reactive expressions belong in local identifiers (`total = calc(...)`), never assigned to `$/paths`.

### Layout & Containers (8)

| Component | Express DSL Signature | Technical Notes |
| :--- | :--- | :--- |
| `Card` | `Card(child)` | Surface container card using `--dsw-*` border & background tokens. |
| `Column` | `Column([c1, c2, ...], align?, justify?)` | Vertical flex stack; direct children accept numeric `weight`. |
| `Row` | `Row([c1, c2, ...], justify?, align?)` | Horizontal flex row (`justify`: `"spaceBetween" \| "start" \| "center" \| "end"`). |
| `Tabs` | `Tabs([{ title, child }, ...])` | Preserves surface `dataModel` bindings across tab switches. |
| `Accordion` | `Accordion([{ title, subtitle?, badge?, open?, child }, ...], multiple?)` | Collapsible disclosure container backed by flat `ChildSchema` IDs. |
| `List` | `List([c1, c2, ...], direction?, align?)` | Vertical or horizontal semantic list. |
| `Modal` | `Modal(trigger=Button(...), content=Column([...]))` | Accessible modal dialog overlay. |
| `Divider` | `Divider(axis?)` | Horizontal or vertical divider line. |

### Typography & Advisories (4)

| Component | Express DSL Signature | Technical Notes |
| :--- | :--- | :--- |
| `Text` | `Text(text, variant?="body"\|"caption"\|"h1".."h5")` | Full GFM Markdown renderer bound to static strings or `$/paths`. |
| `Callout` | `Callout(title, message?, tone?="info"\|"success"\|"warning"\|"danger", collapsible?, child?)` | Semantic banner with optional collapsible body and nested `ChildSchema`. |
| `Badge` | `Badge(label, tone?="neutral"\|"info"\|"success"\|"warning"\|"danger"\|"outline"\|"solid")` | Semantic pill badge. |
| `Icon` | `Icon(name)` | Vector icon mapped to standard A2UI icon names. |

### Metrics & Status (4)

| Component | Express DSL Signature | Technical Notes |
| :--- | :--- | :--- |
| `Stat` | `Stat(label, value, delta?, trend?="up"\|"down"\|"neutral", caption?, spark?)` | KPI card with unit split, trend badge, and inline SVG `spark` array (`[10, 14, 19]`). |
| `KeyValue` | `KeyValue(items, title?, columns?=1..3, copyable?)` | Accepts `{ key: val }` object maps or `[{ label, value, tone?, mono?, copyable? }]` arrays. |
| `Steps` | `Steps(items, current?, direction?="vertical"\|"horizontal", title?)` | Items: `{ title, description?, status?: "done"\|"active"\|"pending"\|"error", meta? }`. |
| `Progress` | `Progress(value, max?=100, label?, tone?="brand"\|"success"\|"warning"\|"danger")` | Accessible reactive progress bar. |

### Charts, Diagrams & Data Tables (3)

| Component | Express DSL Signature | Technical Notes |
| :--- | :--- | :--- |
| `Chart` | `Chart(kind, data, title?, xField?, yField?, seriesField?, sizeField?, stacked?, horizontal?, zoom?, height?, action?)` | `kind`: `"bar" \| "line" \| "area" \| "pie" \| "scatter" \| "radar" \| "funnel" \| "gauge" \| "heatmap" \| "treemap" \| "sankey" \| "boxplot" \| "graph" \| "candlestick"`. |
| `Mermaid` | `Mermaid(code, title?, caption?)` | Supports `flowchart`, `sequenceDiagram`, `stateDiagram-v2`, `classDiagram`, `erDiagram`, `gantt`, `gitGraph`, `journey`, `mindmap`, `timeline`, `pie`. |
| `Table` | `Table(rows, columns?, title?, searchable?, pageSize?, action?)` | TanStack Table with local search, column sort, pagination, and row click `Event(...)`. |

### Developer & Workspace Tools (4)

| Component | Express DSL Signature | Technical Notes |
| :--- | :--- | :--- |
| `Code` | `Code(code, language?, lineNumbers?, title?, filePath?, line?)` | Syntax-highlighted snippet; `filePath` + `line` opens DSH's right sidebar. |
| `DiffView` | `DiffView(before, after, title?, language?, mode?="unified"\|"split", filePath?, line?)` | Line diff engine with `+added/-removed` counts, Unified/Split toggle, and `filePath` jump. |
| `FileTree` | `FileTree(items, title?, expandedDepth?, action?)` | Items: `{ path, kind?, status?: "added"\|"modified"\|"deleted"\|"renamed", line?, summary? }`. |
| `JsonTree` | `JsonTree(data, title?, expandedDepth?, copyable?)` | Powered by `@deepseek-ai/dsh-client-ui-primitives` `JsonTree`. |

### Interactive Controls & Media (9)

| Component | Express DSL Signature | Technical Notes |
| :--- | :--- | :--- |
| `Button` | `Button(child, variant?="primary"\|"default"\|"borderless", action=Event(name, context?, userMessage?))` | Sends `[a2ui-action]` or runs local `copyText`/`openUrl`; respects attached `?checks`. |
| `Slider` | `Slider(label, min, max, $/value, steps?)` | `steps = (max - min) / stepSize`; static numeric bounds. |
| `ChoicePicker` | `ChoicePicker(label, options, value=$/list, variant?="mutuallyExclusive"\|"multipleSelection", displayStyle?="chips"\|"checkbox")` | Bound value is always an array of selected option values (`["opt_a"]`). |
| `TextField` | `TextField(label, value=$/text, variant?="shortText"\|"longText"\|"number", placeholder?)` | Supports live validation `?checks`. |
| `CheckBox` | `CheckBox(label, value=$/flag)` | Boolean data-model binding. |
| `DateTimeInput` | `DateTimeInput(label, value=$/iso, enableDate?, enableTime?, min?, max?)` | ISO 8601 string binding. |
| `Image` | `Image(url, alt?, fit?)` | Safe URL scheme allowlist (`https:`, `http:`, `data:image/*`). |
| `AudioPlayer` | `AudioPlayer(url, description?)` | Native audio playback control. |
| `Video` | `Video(url)` | Native HTML5 video element. |

---

## 6. Client-Side Functions Reference (23 Functions)

- **Algebraic & Aggregate Math (4)**:
  - `calc(expr, vars, decimals?)`: Safe recursive-descent formula evaluator supporting `+ - * / ^ % ( ) ? : == != < <= > >= && ||` and `pow, sqrt, exp, log, ln, log10, abs, min, max, clamp, round, floor, ceil, pmt(ratePerPeriod, nper, pv)`. Validated statically at compile time (max AST depth `36`, max AST nodes `128`).
  - `cond(condition, truthy, falsy)`, `sum(items, field?)`, `avg(items, field?)`
- **Comparators & Boolean Logic (7)**:
  - `eq(a, b)` (auto-unwraps single-element `ChoicePicker` arrays), `gt(a, b)`, `lt(a, b)`, `includes(items, value)`, `and([...])`, `or([...])`, `not(x)`
- **Formatting (5)**:
  - `formatNumber(value, decimals?, grouping?)`, `formatCurrency(value, currency, decimals?, grouping?)`, `formatDate(value, format)`, `formatString(template)`, `pluralize(...)`
- **Validation (`?checks`) & Local Actions (7)**:
  - `required(value)`, `regex(value, pattern)`, `length(value, min?, max?)`, `numeric(value, min?, max?)`, `email(value)`, `copyText(text)`, `openUrl(url)`

---

## 7. Local Development, Testing & Packaging

```bash
# Install dependencies
npm install

# TypeScript strict check
npm run typecheck

# Build Host ESM + 4 Client CJS chunks (enforces cold-boot size gate)
npm run build

# Run all 45 Vitest unit, governance, prompt, and bundle tests
npm test

# Verify compatibility against installed DeepSeek Harness.app platform exports & slots
npm run check:host-api

# Inspect npm publish tarball contents
npm pack --dry-run

# Launch isolated DSH Web profile (.dsh-dev) + scripted Mock LLM on http://127.0.0.1:18992
node scripts/dev-env.mjs setup
node scripts/dev-env.mjs serve
```

### Key Repository Layout

- `src/index.ts` — Host Cordis plugin entry (`tools`, `skills`, `commands`, `systemPrompt`)
- `src/host/` — `a2ui_render`, `a2ui_ask`, `SurfaceSessions` compiler & self-repair engine
- `src/shared/` — Isomorphic `dshSchemaCatalog`, Host/Client `wire-types.ts`, `calc` parser/evaluator, and shared constants
- `src/client/index.ts` — `45.9 kB` cold-boot UI slot shell & composer toggle pill
- `src/client/chunks/` — On-demand entrypoints (`runtime-chunk.ts`, `echarts-chunk.ts`, `mermaid-chunk.ts`)
- `src/client/catalog/` — Light-DOM React implementations of all 32 components & 23 functions
- `build/` — `tsdown` 5-target build preset & DSH web platform externalizer
- `scripts/` — Host API contract verifier (`check-host-api.mjs`) and isolated mock dev server (`dev-env.mjs`, `mock-llm.mjs`)
