# Changelog

All notable changes to `dsh-genui-a2ui` are documented in this file.

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
