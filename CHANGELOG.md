# Changelog

All notable changes to `dsh-genui-a2ui` are documented in this file.

## [0.4.1] - 2026-11-21

### Fixed
- **Core Runtime Stability, State Rollback & Security Hardening**:
  - **Transactional `RendererState` Rollback (`src/host/generator.ts`)**: Replaced failing `structuredClone(prevState)` with `@a2ui/agent`'s native synchronous `RendererState.transaction()` frame so post-parse validation errors roll back cleanly instead of stranding surfaces and breaking multi-turn self-repair retries (`Surface ... already exists.`).
  - **Rules of Hooks Fix in `Segmented` (`src/client/catalog/InputWidgets.tsx`)**: Moved `useMemo` above the empty-options early return to prevent React Hooks mismatch crashes during progressive streaming or `update=true` transitions.
  - **Scoped `a2ui_ask` Data Model Serialization (`src/client/AskToolView.tsx`, `src/client/SurfaceView.tsx`)**: Filtered `priorMessages` and `readSanitizedDataModels(...)` by `visibleSurfaceIds` so submitting a small approval card no longer serializes unrelated historical dashboard/table datasets into `/a2ui-answer`.
  - **`/a2ui-answer` & `PendingAskRegistry` Lifecycle Hardening (`src/index.ts`, `src/host/ask-tool.ts`)**: Validated `/a2ui-answer` JSON payloads as non-null plain objects, rejected superseded duplicate `callId` promises instead of leaving them dangling, and wired `asks.disposeAll()` into plugin disposal cleanup.
  - **Prototype Pollution, Secret Redaction & CSV/Mermaid Security (`src/shared/constants.ts`, `src/client/persistence.ts`, `src/client/mermaid-safe.ts`, `src/client/catalog/v4-helpers.ts`, `src/client/file-opener.tsx`, `src/shared/calc-engine.ts`)**:
    - Blocked `__proto__`, `constructor`, and `prototype` via `Object.defineProperty` across both host and client sanitizers, and upgraded secret-key redaction to catch compound camelCase/snake_case credentials (`userPassword`, `db_password`, `auth_token`, `clientSecret`, `bearerToken`, `openaiApiKey`) while preserving metric keys (`promptTokens`).
    - Scoped Mermaid `assertSafeSvg` event-handler checks strictly to opening tag headers (`TAG_EVENT_HANDLER_RE`) so diagrams containing technical text like `online = true` or `once = 1` render cleanly.
    - Hardened CSV export (`escapeCsvCell`) against formula/DDE injection (`=`, `@`, `\t`, `\r`, non-numeric `+/-`) while preserving signed percentages (`+14.2%`, `-4.2%`), blocked `file:` URIs in `parseFileTarget`, added `Object.hasOwn` lookups in `icons.tsx` and `calc-engine.ts`, and validated built-in function arity in `calc()`.
- **ECharts & Narrow-Container Visual QA Fixes (Verified Dark & Light)**:
  - **ECharts `richText` Tooltips (`src/client/chunks/echarts-chunk.ts`)**: Replaced raw HTML `<br/>` in `waterfall` and `<strong>` in `calendar` tooltip formatters with plain `\n` / text formatting compatible with `renderMode: 'richText'`.
  - **Waterfall `markLine` Avoidance, Compact `Graph` Labels, `Treemap` Wrapping & Duplicate `xField` Alignment (`src/client/chunks/echarts-chunk.ts`, `src/client/catalog/Catalog.module.css`)**: Added CJK-aware pill width estimation and bar-midpoint collision checks so `waterfall` bar labels (`+110`) clear reference pills (`目标 ¥680w`); disabled node-level `labelLayout.hideOverlap` on compact circular `graph` charts so all node/edge labels (`Prompt Cache`, `2ms`) stay visible in Dark Mode; added word-preserving compact `treemap` wrapping (`A2UI / 渲染 / 16w`), compact `pie`/`funnel` legend truncation, `text-wrap: balance` chart headers, and category-deduplicated aggregation for duplicate `xField` rows.
  - **306px Widget Layout & Ergonomics (`InputWidgets.tsx`, `Catalog.module.css`, `AntdParityWidgets.tsx`, `v3-helpers.ts`, `v4-helpers.ts`, `v5-helpers.ts`, `P0Widgets.tsx`, `EnterpriseWidgets.tsx`, `TableWidget.tsx`, `EChartsWidget.tsx`, `DockView.module.css`, `primitives.tsx`)**:
    - Upgraded wide/4-item `Segmented` controls to a `@container (max-width: 440px)` 2×2 pill grid, eliminating 3-row sliding-pill overlap at `306px`.
    - Fixed `NumberInput` focused draft editing (allowing backspacing to empty and typing leading `-`), UTC-negative timezone anchor drift in `DateRange` presets, `sum`/`avg` treating `null`/`""`/booleans as `0`/`1`, `KeyValue` `columns`/`span=4`, `ApiEndpoint` array-shaped `headers` in copied `cURL`, `Matrix` `colorScale="auto"` semantic coloring, and `EChartsWidget` vertical `Column` flex basis.
    - Tightened half-width `Matrix` cells (`showcase-13`), expanded 3-rank `ServiceGraph` node caps (`showcase-7`), increased `a2ui_ask` dock bottom clearance (`showcase-4`), rendered `HostPrimitives.SegmentedTabs` & `Modal` via JSX, added LRU-200 eviction to `dock`/`tier` `localStorage` maps, evicted transient Mermaid chunk-load errors on unmount, localized remaining `aria-label`/fallback strings, removed redundant `role="button"` on `Table` `<tr>` rows, and upgraded `scripts/mock-llm.mjs` media fixtures to a valid 2s H.264 MP4 + 5s WAV.
- **Isomorphic Express Preprocessing & Offline Eval Report (`src/shared/express-preprocess.ts`, `src/client/streaming.ts`, `scripts/eval-llm.mjs`)**:
  - Moved `express-preprocess.ts` to `src/shared/` (re-exported from `src/host/express-preprocess.ts`) so `StreamingExpressSession` shares the same `+` concat, `lookup`, and chained `calc()` lowering passes as the Host compiler, while sharing `ALLOWED_CALC_FUNCTIONS` (`sin`/`cos`/`tan`), bounding multi-occurrence `calc()` expansion, and deduplicating repeated `cond` keys.
  - Inlined standalone CSS into `scripts/eval-llm.mjs` HTML reports for 100% offline viewing and cleaned up all 43 `biome check` import-ordering diagnostics.

### Changed
- Added `tests/audit-fixes-v041.spec.ts` (+12 regression tests), expanding Vitest coverage to **23 suites / 106 tests** (`lib/client.js = 59.5 kB / 16.7 kB gzip`, `0` Biome/Lint/TS diagnostics).

## [0.4.0] - 2026-11-20

### Added
- **P0: Lossless Prompt Compaction & 4-Domain Scoped Skill Partitioning (`src/host/prompt-compact.ts`)**:
  - Partitioned all 57 registered components cleanly with zero overlap into 4 on-demand skills (`a2ui` core 24, `a2ui-analytics` 11, `a2ui-devops` 13, `a2ui-forms` 9) via `skills.registerProvider`, cutting average prompt token consumption by **-44.2%** (`29,916 → 16,695` tokens in live 28-case `deepseek-chat` benchmarks) while preserving a full-catalog compacted fallback for legacy hosts.
- **P1: Real LLM 28-Case Generation & Self-Repair Eval Suite + Deterministic Depth Lowering (`src/host/eval-suite.ts`, `scripts/eval-llm.mjs`, `src/host/express-preprocess.ts`)**:
  - Added `npm run eval:llm` supporting `--mode=mock|live`, `--strategy=scoped|monolithic|both`, 8-bucket error taxonomy, and HTML report output across 23 positive UI tasks + 5 Markdown-only negative controls.
  - Added 2 new A2UI 1.0 custom catalog functions (`23 → 25`): `concat(items)` and `lookup(key, table, fallback?)` (auto-unwrapping single-select `ChoicePicker` arrays).
  - Added quote-safe compile-time Express lowering passes (`desugarExpressConcat`, `foldNestedCondToLookup`, `flattenChainedCalc` for both top-level and inline `calc()`) to stay 100% compliant with upstream `MAX_FUNC_CALL_DEPTH = 5` — lifting live `deepseek-chat` 28-case scores from `78.3%` final / `52.2%` 0-repair / `96.4%` routing to **100.0% final (23/23)**, **78.3% 0-repair**, **100.0% routing (0 FP)**, and **100.0% self-repair recovery**.
- **P2: Chart ↔ ProTable 0ms Local Cross-Filtering, 1-Click Chart Export & Anti-Jank Streaming (`EChartsWidget.tsx`, `TableWidget.tsx`, `SurfaceView.tsx`, `dom-hooks.ts`)**:
  - Added two-way `Chart(selected=$/path)` + `Table(filterField="...", filterValue=$/path)` bindings for instant 0ms bidirectional cross-filtering with in-canvas highlight/dimming (`bar`, `line`, `pie`, `funnel`, `treemap`, `sunburst`, `sankey`, `graph`), dismissible filter chips, and automatic pagination/selection reset on filter change.
  - Added 1-click high-DPI 2× `PNG` download (theme-aware dark/light background) and UTF-8 BOM `CSV` copy actions in the `Chart` header (`exportable` defaults to `true`, 306px-safe compact layout).
  - Added `requestAnimationFrame`-guarded high-water-mark height stabilization (`useStreamingHeightStabilizer`), gradient shimmer skeletons with `prefers-reduced-motion` support, and an inline syncing footer indicator during active streaming.

### Fixed
- **Algebraic Formula Depth Accounting (`src/shared/calc-engine.ts`)**: Fixed recursive-descent parser precedence fall-through incrementing `depth` by 10 per parenthesis group (which falsely rejected 4-level arithmetic formulas), while strictly keeping the 36-level anti-DoS recursion guard on real nesting.
- **Sankey `{ nodes, links }` Compatibility (`src/client/chunks/echarts-chunk.ts`)**: Accepted ECharts-native `{ nodes, links }` datasets in `Chart("sankey", ...)` in addition to tabular edge arrays.
- **Narrow-Column `Comparison` CTA Wrapping (`src/client/catalog/Catalog.module.css`)**: Added `white-space: nowrap; flex-shrink: 0` on `.comparisonFooterTd button` and compact `@container (max-width: 420px)` padding.

### Changed
- Added Dark & Light `chart-table-crossfilter` showcase screenshots, expanded copy-pasteable prompt examples (`18 → 19`), added `showcase-25` to `scripts/mock-llm.mjs`, and expanded Vitest coverage to **22 suites / 94 tests** (`lib/client.js = 59.3 kB / 16.7 kB gzip`).

## [0.3.0] - 2026-11-20

### Added
- **5 New Tier-1 ECharts 6 Chart Kinds (`14 → 19` Total)**:
  - `combo`: Dual-axis bar + line charts via `y2Field` and `y2Label` (supports stacked primary bars, secondary line/rate series, zoom slider, and dynamic SLO reference lines).
  - `waterfall`: Financial & variance attribution bridge charts with automatic cumulative base stacking, increase/decrease/total coloring, and collision-free bar value labels.
  - `calendar`: GitHub-style daily activity & change-frequency calendar heatmaps with adaptive 3-tier month labels, sparse weekday labels, and square aspect clamping for 12-month views.
  - `sunburst`: Multi-level hierarchical drill-down radial charts with tangential labels and theme-aware contrast halos.
  - `parallel`: Multi-dimensional model/plan comparison parallel-coordinate charts with anti-truncation axis titles.
- **Dynamic Threshold Reference Lines (`referenceLine` & `referenceLabel`)**:
  - Supported across Cartesian charts (`bar`, `line`, `area`, `combo`, `waterfall`, `scatter`, `boxplot`, `candlestick`) with reactive `$/path` binding (e.g., dragging a `Slider` updates chart SLO lines in `0ms`).
- **Repository Engineering & Visual Quality Rules (`AGENTS.md`)**:
  - Codified the `306px`-first `@container` layout contract, `276px` ECharts compact anti-collision contract, pure-function SVG geometry testing, and dual-theme verification checklist.

### Fixed
- **30 Multi-Component Squeezing, Clipping & Text-Overlap Fixes Across All 57 Components & 19 Charts**:
  - **`@container` Responsive Migration (`Catalog.module.css`)**: Added `container-type: inline-size` and `@container` narrow breakpoints across `ResponsiveGrid`, `KeyValue` (fixing `640px` tall single-char vertical collapse in 306px cards), `CheckCard`, `Schedule` (vertical stack below `440px`), `Segmented` (eliminating `+219px` right overflow), `Matrix`, `Comparison`, `ProTable`, `DiffView` split mode (keeping both `-` and `+` panes visible inside `306px` with `pre-wrap`), `LogViewer`, `Terminal`, `FileTree`, `Tree`, and `Mermaid`/`JsonTree` action toolbars (`flex-wrap: wrap` + `white-space: nowrap` buttons).
  - **ECharts `276px` Compact Width Adaptation (`EChartsWidget.tsx`, `echarts-chunk.ts`)**: Wired live `containerWidth` into `buildChartOption` to eliminate label collisions across `horizontal bar` (`maxHBarLabelW` truncation, `splitNumber: 3`, top-floating `position: 'start'` vertical markLines), `waterfall` (smart `pickMarkLinePosition` + per-bar `inside`/`top` avoidance), `sunburst` (tangential labels + stroke halo), `parallel`, `radar`, `calendar`, `sankey` (stage-depth clamping + `hideOverlap`), `heatmap` (`grid.bottom: 58` visualMap clearance), `funnel`, `scatter`, `boxplot` (`interval: 0` wrapping), `candlestick` (proportional headroom), `treemap` (`overflow: 'break'`), and `graph` (deterministic `circular` layout when compact).
  - **Custom SVG Geometry & Dual-Theme Parity**: Added `stackUnit` multi-line unit stacking (e.g. `12480 / req/s` in `68px` rings) and 3-decimal high-SLA precision (`99.995%`) on `MetricRing`, tightened `ServiceGraph` node widths (`114–156px`) with preserved edge-label spacing, relaxed `Schedule` `now`-line avoidance, allowed comma-delimited SVG data URIs in `Image`, omitted forced `width: '100%'` on weighted `Image` items, and added `colorScheme` dark/light parity to native `DateTimeInput` & `DateRange` inputs.

### Changed
- **Updated Bilingual Docs & Pixel-Identical Dark/Light Screenshots**:
  - Added new `finops-waterfall-sunburst` and `sre-combo-calendar-slo` Dark & Light showcase screenshots, refreshed `store-operations-dashboard` screenshots, and expanded copy-pasteable prompt examples (`15 → 18`) across `README.md`, `README.en.md`, `docs/DETAIL.zh.md`, and `docs/DETAIL.md`.
  - Expanded automated Vitest coverage to 19 suites / 81 tests (`tests/tier1-echarts.spec.ts`) and 24 scripted mock showcases (`showcase-1`–`showcase-24`).

## [0.2.1] - 2026-11-20

### Fixed
- **`ServiceGraph` Multi-Edge & Wide-Label Geometry Hardening**:
  - Added per-rank adaptive node widths (`148px–194px`) and dynamic `LR` / `TB` inter-rank gaps sized to CJK/ASCII edge label pixel widths so long labels never collide with adjacent node boxes.
  - Added automatic obstacle-avoidance bowing for multi-rank skip edges (`span > 1`), staggered Bezier placement (`t = 0.34 / 0.66`) for X-crossing edge labels, top/right-arc routing for cyclic back-edges, positive SVG bounding-box normalization (preventing negative `viewBox` clipping), and a foreground SVG label layer (`z-index: 2`).
- **Narrow-Viewport & Dense-Data Layout Resilience Across v3/v4/v5 Widgets**:
  - **`Schedule`**: Automatically places labels outside ultra-narrow Gantt bars (`data-narrow="true"`) on the side with more lane room instead of clipping text inside short-duration bars.
  - **`Tree` & `TreeSelect`**: Isolated left label/badge content (`overflow: hidden`) from right-aligned `sharePct` waterfall bars, prioritized subtitle shrink (`flex-shrink: 999`) before primary node labels, and capped deep-tree indentation.
  - **`Segmented` & `Switch`**: Computed character-aware minimum flex basis on `Segmented` so side-by-side `Segmented` + `Switch` rows wrap cleanly onto full-width lines in narrow containers without pill truncation or overlap.
  - **Portal Popovers (`Select`, `MultiSelect`, `TreeSelect`)**: Unified viewport-clamped positioning (`computeClampedPopoverBox`) so right-aligned narrow triggers and short viewports never clip dropdowns off-screen.
  - **`MetricRing`, `Tracker`, `DateRange`, `ApiEndpoint`, `Terminal` & `KeyValue(bordered)`**: Preserved 2-decimal SLA precision (e.g. `99.95%`) with inner-diameter-aware font scaling on `MetricRing`, adaptive `1px` slice gaps on 60–90 slice `Tracker` strips, narrow-column wrapping on `datetime-local` `DateRange`, single-line tab pills on `ApiEndpoint`, and `< 640px` single-column fallback on bordered `KeyValue`.

### Changed
- **Expanded Ready-to-Run README & Mock Showcase Examples (`12 → 15`)**:
  - Added copy-pasteable bilingual prompt examples in `README.md`, `README.en.md`, `docs/DETAIL.zh.md`, `docs/DETAIL.md`, and `scripts/mock-llm.mjs` covering `Comparison` + `SourceList`, `ApiEndpoint` + `DateRange` + `MetricRing`, and `Kanban` + `Timeline` + `Matrix` + `Result`.

## [0.2.0] - 2026-11-19

### Added
- **25 New A2UI 1.0 Native Components (`32 → 57` Total)**:
  - **Ant Design 5.x / AntD Pro / AntD X Parity (`+7`)**:
    - `NumberInput`: Precision numeric stepper (`−`/`+`, `min`, `max`, `step`, `prefix`, `unit`, `?checks`) bound directly to numeric `$/path` for `0ms` `calc()` integration.
    - `MultiSelect`: Multi-value tag-pill dropdown selector (`DynamicStringListSchema`) with instant search, tag overflow counter, and `allowCreate=true` Enter-to-create custom tags.
    - `DateRange`: Dual `start`/`end` range picker with `Today / 7d / 30d / 90d` quick preset pills, span day badge, and automatic chronological ordering.
    - `TreeSelect`: Searchable hierarchical cascade dropdown displaying the full `Cluster / Namespace / Service` breadcrumb on the trigger.
    - `CheckCard`: Dual-mode component acting as an AntD Pro `<CheckCard.Group>` rich option selector when `value` is bound, and as `@ant-design/x` `<Prompts>` clickable next-step suggestion cards when `action` is set.
    - `Tree`: General-purpose hierarchy & APM distributed trace waterfall tree with proportional `sharePct` latency micro-bars, `StateDot` health indicators, and deterministic 60fps streaming expansion.
    - `Grid`: Responsive multi-row equal-width CSS Grid container (`columns=1..6`, `gap="sm"|"md"|"lg"`).
  - **Enterprise B2B & Vercel/Tremor Observability (`+8`)**:
    - `EntityHeader` (cluster/service/account header with KPI strip), `Tracker` (`uptime` SLA slice strip with native `HoverCard` tooltips + `category` stacked ratio bar), `Terminal` (runbook commands with clean command-only copy), `ApiEndpoint` (HTTP contract workbench with `JsonTree` & shell-safe `cURL` copy), `ApprovalCard` (high-risk approval gate armed by native `Switch`), `Schedule` (maintenance window Gantt bar with live time marker), `Result` (structured execution receipt & empty state), and `Matrix` (conditional-formatting heat cross-tabulation & RBAC grid).
  - **Scalar Controls, Service Topology & Triage (`+10`)**:
    - `Select` (searchable dropdown), `Segmented`, `Switch`, `MetricRing` (threshold-colored radial gauge), `Comparison` (option trade-off matrix), `ServiceGraph` (zero-dependency health-colored DAG), `LogViewer` (level-filtered stack-trace console with sidebar file jump), `Timeline`, `Kanban`, and `SourceList` (citations & code evidence).
- **In-Place Enterprise Upgrades & Deep DSH Host Primitive Integration (`27` Exports)**:
  - Upgraded `Table` into an enterprise `ProTable` supporting `exportable` (UTF-8 BOM CSV & aligned GFM Markdown), `selectable` multi-row batch `[a2ui-action]` dispatch, `showSummary` numeric footers, density toggle, and `expandKey` inline row-detail drawers.
  - Upgraded `KeyValue` with `bordered=true` table mode (aligned with AntD `<Descriptions bordered>`) and item-level `span: 1..3`.
  - Integrated native `@deepseek-ai/dsh-client-ui-primitives` exports including `Switch`, `SegmentedControl`, `HoverCard`, `HoverCardGroup`, `StateDot`, `ImageLightbox` (click-to-zoom on `Image`), `FileTypeIcon`, `PathLabel`, `LinkIconRegular`, and `TextShimmer`, verified by `npm run check:host-api`.

### Changed
- **Zero-`useEffect` React Architecture Refactor (Vercel React Best Practices)**:
  - Eliminated all 21 `useEffect` / `useLayoutEffect` calls across `.tsx` UI components, isolating low-level DOM/engine lifecycles strictly inside `src/client/dom-hooks.ts` and external `useSyncExternalStore` stores (`SurfaceSessionStore` + LRU-64 Mermaid SVG cache).
  - Enforced permanently via `biome.json` `noRestrictedImports` and `tests/react-best-practices.spec.ts`, while keeping cold-boot `lib/client.js` at `58.32 kB` (`16.48 kB` gzip).

## [0.1.1] - 2026-11-16

### Added
- **Lossless Vector Zoom (`10%–2000%`) & Panning for `Mermaid`**:
  - Replaced CSS `zoom` (`50%–250%` ceiling) with explicit SVG `viewBox` vector dimensions (`--mermaid-zoom-w` / `--mermaid-zoom-h`) via `prepareMermaidSvg()`, stripping Mermaid's inline `max-width` lock for razor-sharp rendering up to `20x` magnification.
  - Added `Fit` (`自适应`) mode with real-time scale readout, pointer-anchored wheel/pinch zoom (`Zoom-to-Cursor`), click-and-drag panning (`Grab-to-Pan`), double-click zoom toggle, and an expanded `96vw × 94vh` fullscreen viewer with isolated inline/fullscreen zoom states.
- **Empty-Session `/a2ui` Command Feedback**:
  - Subscribed to official `command/executed` events on the client and integrated `HostPrimitives.Toast` so `/a2ui status`, `/a2ui off`, and `/a2ui on` display native feedback on blank Hero sessions before `ChatView` mounts, while synchronizing the composer toggle pill.
- **Explicit `?check` Validation Reference & `Table` Scalar Contract**:
  - Documented all 5 client validation rules (`?required`, `?email`, `?regex`, `?length`, `?numeric`), `Button` `$path` gating syntax, a golden validated form example, and plain-text `Table` cell rules in `skill("a2ui")` and `TableApi`.

### Fixed
- **Zero Skill Catalog Residue on `/a2ui off`**:
  - Migrated skill registration to `skills.registerProvider` + `control.invalidate()` (with `skills.register` disposer fallback) so `/a2ui off` removes `a2ui` from `<available_skills>` immediately, preventing models from loading the skill and entering shell investigation loops.
- **Historical Snapshot `Modal` Leak & Read-Only Control Isolation**:
  - Auto-closed open `Modal` and `Mermaid` fullscreen portals upon action dispatch or `readOnly` transition (`ModalCloseContext` + `SurfaceReadOnlyContext`), and disabled interactive controls across superseded historical snapshots.
- **Deferred Form Validation UX**:
  - Deferred `TextField` validation error display until first `onBlur` or submit button click (`SurfaceValidationContext`), eliminating premature red error text on initial surface render.
- **`Callout` & `CheckBox` Flex Layout Collision**:
  - Scoped `--a2ui-flex-basis` (`0px` in `Row`, `auto` in `Column`), enforced `CheckBox` minimum width (`140px`) with `align-items: flex-start`, and hardened `Callout` overflow clipping so physical coordinate clicks never hit adjacent `Callout` elements.

## [0.1.0] - 2026-11-13

### Added
- **A2UI 1.0 Full-Stack Runtime for DeepSeek Harness**:
  - Host-side A2UI Express compiler & validator (`@a2ui/agent` + isomorphic `dshSchemaCatalog`) with up to 2 in-turn diagnostic self-repair retries.
  - Four rendering placements via official DSH UI Slots: turn-tail spotlight (`placement="answer"`), step-stream inline (`placement="inline"`), persistent bottom workbench (`placement="dock"`), and blocking in-turn human-in-the-loop wizard (`a2ui_ask`).
- **32 Host-Native Light-DOM Components**:
  - 18 official A2UI 1.0 Basic Catalog components (`Text`, `Image`, `Icon`, `Video`, `AudioPlayer`, `Row`, `Column`, `List`, `Card`, `Tabs`, `Modal`, `Divider`, `Button`, `TextField`, `CheckBox`, `ChoicePicker`, `Slider`, `DateTimeInput`).
  - 14 DSH-native extended components (`Chart`, `Table`, `Stat` with inline SVG `spark` trendlines, `Progress`, `Badge`, `Code`, `DiffView` with Unified/Split modes, `Steps`, `Callout`, `KeyValue`, `Accordion`, `JsonTree`, `FileTree`, `Mermaid`).
- **14 ECharts Visualization Types + Mermaid 11**:
  - `bar`, `line`, `area`, `pie`, `scatter`, `radar`, `funnel`, `gauge`, `heatmap`, `treemap`, `sankey`, `boxplot`, `graph`, and `candlestick`, plus click drill-down actions.
  - Strict-sandbox `Mermaid` renderer with SVG sanitization, zoom/fullscreen toolbar, and Diagram/Source toggle.
- **Zero-Hack Workspace Integration & 4-Chunk Lazy Architecture**:
  - One-click workspace source jump into DSH's native right sidebar (`sidebarRight.openResource`) from `FileTree`, `DiffView`, and `Code`.
  - 4-chunk client code-splitting via `window.__ModuleLoader__`: `53.3 kB` (`15.0 kB` gzip) cold-boot `lib/client.js`, loading `client.runtime.js`, `client.echarts.js`, and `client.mermaid.js` strictly on demand.
  - Native bilingual (`zh`/`en`) UI chrome following DSH host `html[lang]` and reversible plugin stylesheet lifecycle on hot disable/re-enable.
- **23 Client-Side Reactive & Validation Functions**:
  - `0ms` statically validated `calc(expr, vars, decimals)` algebraic evaluator, `cond`, `eq`, `gt`, `lt`, `includes`, `sum`, `avg`, `copyText`, and 14 A2UI 1.0 standard formatting & validation functions.
