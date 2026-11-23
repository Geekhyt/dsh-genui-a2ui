# Changelog

All notable changes to `dsh-genui-a2ui` are documented in this file.

## [0.5.3] - 2026-11-23

### Added
- **2 New Architectural Invariant Rules (`scripts/check-invariants.mjs`, `tests/invariants-lint.spec.ts`)**:
  - Added Rule #18 (`css-no-shadowed-container-query`, statically rejecting `@container` blocks placed earlier in the stylesheet than matching base rules) and Rule #19 (`no-catastrophic-trailing-ws-regex`, blocking O(N²) trailing-whitespace regex patterns in `src/`), expanding the static invariant gate from **17 → 19 rules**.
- **Comprehensive Audit Showcases & Regression Suite (`scripts/mock-llm.mjs`, `scripts/mock-llm.d.mts`, `scripts/visual-qa-bot.mjs`, `tests/comprehensive-audit-v053.spec.ts`)**:
  - Added `showcase-40` (sub-100 `bullet` & 5-point `radialBar`, 7-item `276px` `radialBar`, right-tail `histogram` markLine, auto-numeric `scatter` without `xField`, signed negative `stackMode="percent"`, multi-year `calendar`, first-row-null `parallel`, 3-level `sunburst`, and high-offset `dumbbell`) and `showcase-41` (16 restored standard A2UI icons, decimal `Slider`, literal `CheckCard`, `warning` dots on `EntityHeader`/`Tree`/`Tracker`, `306px` `ApiEndpoint`, clickable inline `AnnotationText`, overnight-past-noon `Schedule`, `SourceList` URL+action, and `ProTable` null-last descending sort).
  - Fixed `visual-qa-bot.mjs` SVG selector blind spot and horizontal scroll-container awareness, and expanded `DEFAULT_AUDIT_SHOWCASES` to cover **64/64 components and 26/26 chart kinds** by default (**84/84** Dark & Light passes across all 42 showcases).

### Fixed
- **Security Redaction, Host Compiler Isolation & ReDoS Protection (`src/shared/{constants,redaction,temporal,express-preprocess}.ts`, `src/host/{ask-tool,generator,eval-suite}.ts`, `src/index.ts`)**:
  - Extended `isSecretKey` to match plural `*_tokens` and algorithm/format/version-qualified `*_key` names; added balanced-brace recursive `${...}` interpolation extraction and wildcard template path matching (e.g. `/tokens/*/token`) so template secrets redact accurately without over-redacting sibling fields.
  - Replaced flat `sessionId::callId` keys in `PendingAskRegistry` with nested `Map<sessionId, Map<callId, PendingEntry>>`, tracked cumulative per-session redaction across `update=true` turns, eliminated O(N²) trailing-whitespace regexes in `express-preprocess.ts` and `streaming.ts`, rejected non-plain `calc` var containers, and added strict calendar round-trip validation (rejecting `2026-02-31`) plus 2-digit timezone offset support (`+08`) in `temporal.ts`.
- **Client Runtime Lifecycle, Mermaid Sandbox & Overlay Hardening (`src/client/{mermaid-safe,persistence,chunk-loader,dom-hooks,index}.ts`, `mermaid-chunk.ts`, `runtime/{SurfaceView,streaming}.ts`, `shell/*`, `ui/primitives.tsx`)**:
  - Hardened Mermaid SVG/CSS sanitization against namespace-prefixed SVG tags (`<svg:script>`), comment-obfuscated `url()`, nested CSS `{}`/`@keyframes`, and quote-sensitive inline styles; enforced workspace boundary checks on absolute `openFile` targets in `ToolView.tsx`.
  - Added message referential identity checks to `turnTailMemo`/`dockMemo`, `storeGeneration`-keyed `ErrorBoundary` auto-reset, zombie draft timer/delete guards, `actionInFlight` serialization, `DshMenu` viewport clamping & keyboard navigation, and native amber `'warning'` status dot support in `DshStateDot`.
- **64 Catalog Widgets & Deterministic Helpers (`src/client/catalog/{icons,InputWidgets,TableWidget,AntdParityWidgets,NextGenWidgets,EnterpriseWidgets,OpsAndInsightWidgets,P0Widgets,ExtendedWidgets,LayoutWidgets}.tsx`, `v3~v6-helpers.ts`)**:
  - Restored all **16** missing standard A2UI icons in `icons.tsx` (achieving **59/59** schema icon parity), added decimal auto-step & endpoint snapping on `Slider`, wired `CheckCard` to `useWritablePropState` with `role="group"`/`aria-pressed`, normalized missing values (`null`/`undefined`/`NaN`/`""`/`"-"`/`"—"`) to `undefined` in `TableWidget` `accessorFn` so `sortUndefined: 'last'` pins empty rows to the bottom in both asc and desc sorts, rendered clickable `AnnotationText` with inline `<mark role="button">`, preserved action buttons alongside URL links in `SourceList`, fixed overnight-past-noon `Schedule` wrapping and `placeOutside` heuristics, and unified duplicate-ID deduplication via `makeUniqueIdFactory()` across 6 catalog helpers.
- **26-Kind ECharts 6 `276px` Compact Contract (`src/client/chunks/echarts-chunk.ts`, `src/client/catalog/EChartsWidget.tsx`)**:
  - Generalized `niceUpperBound` (`norm <= 1`), sub-100 explicit `bullet`/`radialBar` scales, `pickVerticalMarkLineAlign()` edge-clamping (`histogram`, `scatter` `referenceX`, horizontal `bar`), 7-item compact `radialBar` spacing, auto-numeric `scatter` inference, signed negative `stackMode="percent"`, 16-row union `parallel` dim inference with right-axis inset & single-dim fallback, multi-year `calendar` top margin & diverging negative ramp, contiguous 3-level `sunburst` rings, unified `dumbbell` brand dots & high-offset dynamic baseline, outward circular `graph` label placement, custom `heatmap` Y-axis tooltips & `(x, y)` dedup, and `rawValue` unwrapping on negative-baseline click events.
- **CSS Cascade Integrity, `306px` Container Queries & Contrast (`Catalog.module.css`, `SurfaceView.module.css`, `TierControl.module.css`)**:
  - Reordered all 4 shadowed `@container` blocks strictly after their base rules (restoring single-row compact Mermaid toolbars at `306px`), added `container-type: inline-size` with `<= 390px` stacked param cards on `.apiCard`, enforced `box-sizing: border-box; min-width: 0` on `.fileOpenBtn`, boosted dark-on-green contrast (`#052e16`) on completed `Schedule` bars and success emblems, and added `white-space: nowrap; flex-shrink: 0` to badges and toolbar triggers.

### Changed
- Verified full automated & live release gate: **37 suites / 226 tests**, **19/19** architectural invariants, **0** comments, **4/4** TLA+ formal specs, **5/5** bundle budgets (`lib/client.js = 70.57 kB / 19.95 kB gzip`), `eval:check` (`31/31`, `64/64` components), `check:host-api`, **17/17** live DeepSeek Harness interactive E2E assertions (`0` console/page errors), and **84/84** full-showcase Dark & Light DOM geometry passes (`overflow=0 wrap=0 clip=0 errs=0`).

## [0.5.2] - 2026-11-23

### Fixed
- **Dual-Column Stretch Layout for `ImageCompare` & `Checklist` (`Catalog.module.css`, `NextGenWidgets.tsx`)**:
  - Converted `.imageCompareCard` to a flex column and `.imageCompareStage` to `flex: 1 1 auto` with `minHeight: height` and neutral `--dsw-alias-bg-layer-3` studio backdrop, eliminating the empty dead void at the bottom of `ImageCompare` cards stretched beside taller peers inside `Row(..., align="stretch")`.
  - Switched `.imageCompareImg` to `object-fit: contain` (with compact `10.5px` badges) under `@container (max-width: 360px)` so 306px dual-column comparison images stay centered and 100% uncropped with badges floating cleanly above the imagery.
  - Added flex-column stretching and `margin-top: auto` to `.checklistCard` / `.checklistInner` / `.checklistFooter` so stretched `Checklist` action bars stay anchored cleanly to the card bottom.
- **276px ECharts Scroll-Legend Peeking Icon Guard (`echarts-chunk.ts`, `tests/composition-audit-v050.spec.ts`)**:
  - Split scroll-legend pagination gap bounds in `buildLegendOption` into upper/lower viewport estimates (`clipWMax = availW - 44` for `gapMin`, `clipWMin = availW - 68` for `gapMax`, cap `64px`), eliminating the peeking 3rd-item swatch beside `◀ 1/N ▶` on compact `rose` charts at `276px`.

### Changed
- Verified full automated & live visual gate: **36 suites / 212 tests**, **17/17** architectural invariants, **0** comments, **4/4** TLA+ specs, **5/5** bundle budgets, `eval:check`, `check:host-api`, **19/19** live interactive E2E assertions, and **32/32** Dark/Light `qa:visual` passes.

## [0.5.1] - 2026-11-23

### Added
- **Shared Security Redaction Engine (`src/shared/redaction.ts`)**:
  - Consolidated JSON Pointer normalization, nested `@call`/`${/path}` obscured-pointer reference detection, `KvEditor` secret discovery, benign-sentinel filtering (`none`, `enabled`, `auto`, etc.), and string/numeric secret scrubbing into a single pure shared module used across host settlement (`ask-tool.ts`), client runtime (`SurfaceView.tsx`), and draft persistence (`persistence.ts`).
- **3 New Architectural Invariant Rules (`scripts/check-invariants.mjs`, `scripts/check-invariants.d.mts`, `tests/invariants-lint.spec.ts`)**:
  - Added Rule #15 (`css-row-flex-parity`, verifying every `width: 100%` class in `:where(...)` is covered by `:is(.row, .listHorizontal)` direct/wrapped flex rules), Rule #16 (`catalog-unified-action-runner`, preventing direct `props.action`/`approveAction`/`rejectAction` invocation in catalog widgets), and Rule #17 (`css-module-key-exists`, catching undefined `css.<key>` references statically), expanding the invariant gate from **14 → 17 rules**.
- **Composition Audit Showcases & Regression Suite (`scripts/mock-llm.mjs`, `scripts/visual-qa-bot.mjs`, `tests/composition-audit-v050.spec.ts`)**:
  - Added `showcase-38` (unweighted v0.5.0 `Row` cards, long-label `ImageCompare`, object-backed `KvEditor`, 3-column sticky `ProTable` with `code` port column, literal-value `RangeSlider`/`Rating`, and `Modal` + `Select` LIFO Esc + `Tree(action)`) and `showcase-39` (negative `range` + high `referenceLine` + `markArea`, `bullet` centering & cross-filter, `scatter` log + `referenceX`, 5-item `radialBar`, and auto-snapped `histogram` with CSV export), expanding full live Visual QA coverage to **80/80 PASS** (40 showcases × Dark/Light).

### Fixed
- **Generalized Interactive Input & Action Hooks (`widget-helpers.tsx`, `InputWidgets.tsx`, `AntdParityWidgets.tsx`, `NextGenWidgets.tsx`, `EnterpriseWidgets.tsx`, `ExtendedWidgets.tsx`, `MediaAndDataWidgets.tsx`, `OpsAndInsightWidgets.tsx`)**:
  - Introduced `useWritablePropState` (with shallow array equality `areExternalValuesEqual` and memoized `commit`) across all 14 input widgets so literal/unwritable inputs stay interactive without losing state on parent re-renders; unified all action-dispatching widgets onto memoized `useSurfaceActionRunner` (preserving `React.memo` on `TableWidget`/`EChartsWidget` and closing ancestor `Modal` dialogs consistently on non-local event actions); stabilized `normalizeBoundSelectionProp` array references via `useMemo`.
  - Stabilized `KvEditor` object-backed editing via persistent draft row IDs and snapshot echo reconciliation (preventing rows from disappearing while clearing/renaming keys) with `data-readonly` layout parity; fixed literal `Checklist` `value` initialization and structural snapshot syncing on `SortableList`.
- **Security Redaction Precision & Single-Pass Traversal (`src/shared/redaction.ts`, `ask-tool.ts`, `SurfaceView.tsx`, `persistence.ts`)**:
  - Closed nested `@call` / `${/path}` interpolation leaks and `KvEditor` secret leaks across both host `a2ui_ask` settlement (`userMessage`, `context`, `dataModels`) and client action payloads, compacted sanitized arrays, and eliminated `dataModel`-vs-`action.context` pointer namespace collisions and false-positive scrubbing on unrelated short numbers (`< 6` digits) or benign config sentinel values; consolidated `sanitizeActionPayloadForSurface` to a single-pass `componentsModel`/`dataModel` scan.
- **Host Compiler Validation, Shorthand Preprocessing & Conditional Aggregates (`generator.ts`, `express-preprocess.ts`, `functions.ts`, `v4-helpers.ts`, `v6-helpers.ts`, `p0-helpers.ts`, `index.ts`)**:
  - Generalized `validateCheckRulesInComponents` to recursively validate `required`/`numeric`/`length`/`regex`/`email` inside `and`/`or`/`not`, generalized `?required` shorthand expansion to `DateRange`, `RangeSlider`, and `KvEditor`, rejected empty `{}` objects in `evaluateRequiredValue`, and synced `KvEditor`/`?check` docs in `A2UI_SYSTEM_GUIDANCE`.
  - Tightened conditional aggregates (`sum`/`avg`/`count`/`min`/`max`) to exact-match precedence via `exactOnly`, added token-boundary fuzzy matching and boolean token support in `filterTableRowsByField`/`normalizeCrossFilterTokens`, excluded `code`/`badge`/`sparkline` columns from numeric summaries, averaged bounded `bar(max=100)` summaries, enabled scalar-array CSV export for `histogram`, stabilized index-independent `SortableList` keys, and replaced raw `Number(...)` coercions (`""`/`null`/`true`) with strict numeric parsers across `v6-helpers.ts` and `p0-helpers.ts`.
- **306px Layout, Sticky ProTable, Unified DiffView, Trace Tree & ImageCompare (`Catalog.module.css`, `TableWidget.tsx`, `P0Widgets.tsx`, `NextGenWidgets.tsx`)**:
  - Added the 5 v0.5.0 card classes (`.checklistCard`, `.sortableCard`, `.kvEditorCard`, `.imageCompareCard`, `.annotationCard`) to `:is(.row, .listHorizontal)` flex rules, fixed undefined `css.sliderVal` → `css.sliderOutput` and `9px` rail alignment on `RangeSlider`, layered opaque+tint backgrounds and 3-column `--sticky-left` offsets on sticky `ProTable`, unified `DiffView` `<colgroup>` gutters (`66px`) while decoupling `filePath` from `title`, expanded narrow Trace `Tree` waterfall bars (`180px`), and clamped `ImageCompare` badges with ellipsis.
- **ECharts `276px` Compact Contract & Cross-Filtering (`echarts-chunk.ts`)**:
  - Guarded `applyCrossFilterSelection` against mutating `silent: true` helper series; vertically centered `bullet` actual bars via twin `yAxis` + `computeEvenAxisInterval` (`toPrecision(6)`); shifted `range` `markArea` by `-baseline` with `roundRect` band legends and `yRange`-aware lower-band `'top'` vs upper-band `'insideTop'` label placement across all 4 `buildMarkAreaOption` call sites; aligned `dumbbell` negative baselines to `-niceUpperBound(...)`; added `scatter` `referenceX` bounds (`allNonNegX` guard) and `<= 0` log sanitization; guarded `combo` log axis when `stacked`; widened `radialBar` label breathing room and `rose` scroll-legend controls; and snapped auto `histogram` bins with IEEE-754 `1e-9` boundary tolerance and `toPrecision(10)`.

### Changed
- Verified full automated & live release gate: **36 suites / 212 tests**, **17/17** architectural invariants, **0** comments, **4/4** TLA+ formal specs, **5/5** bundle budgets (`lib/client.js = 68.05 kB / 19.16 kB gzip`), `eval:check` (`31/31`, `64/64` components), `check:host-api`, **19/19** live interactive E2E assertions (`0` runtime errors), and **80/80** full-showcase Dark & Light DOM geometry passes (`overflow=0 wrap=0 clip=0 errs=0`).

## [0.5.0] - 2026-11-22

### Added
- **7 New ECharts 6 Chart Kinds (`19 → 26`) & 5 Horizontal Chart Capabilities (`echarts-chunk.ts`, `EChartsWidget.tsx`, `constants.ts`, `chart-i18n.ts`, `catalog-schema.ts`)**:
  - Added `range` (confidence/forecast interval band with negative-safe baseline shifting), `bullet` (OKR/SLO qualitative bands + actual bar + target marker), `histogram` (auto-binned Sturges/Freedman-Diaconis frequency distribution with `bins` and vertical percentile markLine), `dumbbell` (before/after delta connector & dual-color scatter dots), `rose` (Nightingale area-scaled polar wedges), `radialBar` (270° open-quadrant polar progress bars), and `chord` (ECharts 6.1 native `ChordChart` bi-directional service/flow ribbons with cross-filtering).
  - Added 5 cross-chart options across Cartesian/scatter/combo views: `step` (stepped line series), `yScale: 'linear' | 'log'` (safe positive-domain logarithmic Y-axis), `stackMode: 'value' | 'percent'` (100% normalized stacked bars/areas), `markArea` (semantic shaded highlight windows via `MarkAreaComponent`), and `referenceX` / `referenceXLabel` (scatter quadrant dual-axis reference lines).
- **7 New Zero-Dependency Native Interactive Components (`57 → 64`) (`NextGenWidgets.tsx`, `v6-helpers.ts`, `BasicWidgets.tsx`, `Catalog.module.css`, `i18n.ts`, `prompt-compact.ts`)**:
  - Added `RangeSlider` (dual-thumb numeric interval selector wired to two `$/paths`), `Checklist` (pre-flight & compliance gate locking its action button until all `required` items are checked), `SortableList` (HTML5 drag-and-drop + accessible ↑/↓ priority ranking), `KvEditor` (dynamic env/header key-value editor with automatic secret masking for sensitive keys), `Rating` (half-star & 1..N Likert scale inputs), `ImageCompare` (before/after wipe slider comparator), and `AnnotationText` (inline entity/clause highlighting with host `HoverCard` source inspection and category count legend).
- **In-Place Core Widget Upgrades & 0ms Conditional Aggregates (`25 → 28` functions) (`TableWidget.tsx`, `AntdParityWidgets.tsx`, `P0Widgets.tsx`, `v5-helpers.ts`, `p0-helpers.ts`, `functions.ts`)**:
  - Upgraded `Table` (`ProTable`) with declarative semantic cell renderers (`format: 'text' | 'badge' | 'bar' | 'delta' | 'sparkline' | 'code'`, `max`) and `stickyFirstColumn`.
  - Upgraded `Tree` with `offsetPct` paired with `sharePct` for cascading distributed APM trace waterfall bars.
  - Upgraded `DiffView` with multi-file PR tab switching (`files`, aggregating global `+added/-removed` stats) and inline review `annotations` rendered in both Unified and Split views.
  - Extended `sum` / `avg` with optional conditional cross-filter parameters `(items, field?, filterField?, filterValue?)` supporting scalar & array OR-matching, and added `count`, `min`, and `max` client functions.
- **Showcases, Eval Benchmark, Screenshots & Regression Suite (`scripts/mock-llm.mjs`, `scripts/visual-qa-bot.mjs`, `src/host/eval-suite.ts`, `.eval-baseline.json`, `tests/v6-nextgen-charts-and-widgets.spec.ts`)**:
  - Added `showcase-35`, `showcase-36`, and `showcase-37` (plus 3 Dark/Light README screenshot pairs and 31-case eval coverage ratcheted to **`64/64`** unique components) and comprehensive `276px` / `240px` ECharts SSR, helper, security, and deterministic random-chunk streaming replay tests.

### Fixed
- **Visual QA Polish & Pre-Release Security / Edge-Case Audit (`echarts-chunk.ts`, `Catalog.module.css`, `ask-tool.ts`, `persistence.ts`, `NextGenWidgets.tsx`, `P0Widgets.tsx`)**:
  - Positioned vertical `scatter` `referenceX` and `histogram` markLine labels at `position: 'end'` (`rotate: 0`) above the plot headroom instead of colliding with bottom X-axis ticks, disabled markLine/markArea entrance animations (`animation: false`) to prevent half-drawn lines on fast theme toggles, preserved true `referenceLine` labels on negative-baseline `range` charts, and kept stacked `range` bands on linear Y-axis geometry.
  - Opened the top-left quadrant on `radialBar` (`angleAxis: { startAngle: 90, endAngle: -180 }`, `radiusAxis.axisLabel.align: 'right'`) so labels never collide with 75–100% arcs; assigned explicit series-level `itemStyle.color` to `dumbbell` after-series so before/after legend dots stay visually distinct; and explicitly placed `KvEditor` `@container (max-width: 380px)` grid children onto 2 compact rows (`[key | ×]` + `[value]`).
  - Redacted `value` inside array-backed `KvEditor` `{ key/name, value }` entries matching `isSecretKey` across both `ask-tool.ts` settlement and `persistence.ts` draft storage, guarded object-backed `KvEditor` against dangerous prototype keys (`__proto__`/`constructor`/`prototype`) and blank-key row drops on Add, synced streaming `defaultChecked` items on uncontrolled `Checklist`, rendered `AnnotationText` hover `sourceId` without requiring `label`, and unified `before:N` / multi-file annotation scoping in `DiffView`.

### Changed
- **Documentation, Domain Skills, Social Preview & Full Release Gate**:
  - Partitioned all 64 components cleanly across the 4 on-demand domain skills (`core` 24, `analytics` 12, `devops` 14, `forms` 14) within existing prompt char budgets (`avgPromptTok = 6948` vs `20660` monolithic, **-66.4%**).
  - Updated `README.md`, `README.en.md`, `docs/DETAIL*.md`, `docs/DEVELOPMENT*.md`, `docs/social-preview.png`, `locale/*.json`, and `screenshots.json` with 3 new Dark/Light visual preview pairs.
  - Verified full release gate: **35 suites / 198 tests**, **14/14** architectural invariants, **0** comments, **4/4** TLA+ specs, **5/5** bundle budgets unchanged (`lib/client.js = 68.05 kB / 19.16 kB gzip`, +0 B cold-boot overhead), `eval:check` (`31/31`, `64/64` components), `check:host-api`, and **6/6** live DeepSeek Harness Dark & Light visual QA passes (`overflow=0 wrap=0 clip=0 errs=0`).

## [0.4.8] - 2026-11-22

### Added
- **2 New Architectural Invariant Rules (`scripts/check-invariants.mjs`, `tests/invariants-lint.spec.ts`)**:
  - Added Rule #13 (`echarts-tooltip-contrast-token`) requiring WCAG luminance-aware tooltip contrast resolution and `--dsw-alias-tooltip-label` wiring in `echarts-chunk.ts`, and Rule #14 (`no-raw-json-stringify-in-helpers`) banning raw `JSON.stringify` inside deterministic helper modules (bringing total static invariant checks to **14 rules**).
- **Multi-Component Composition Torture Showcases & Regression Suite (`scripts/mock-llm.mjs`, `scripts/visual-qa-bot.mjs`, `tests/composition-audit-v048.spec.ts`)**:
  - Added `showcase-33` (unweighted `Row([Column, Column])`, 306px long-token stress, Timeline nested `Grid(Stat + Schedule)`, ProTable `"-"` placeholder summary, hidden `Tabs` + collapsed `Accordion` lazy mount, Modal nested `Select`/`DateRange(enableTime)`/`Mermaid` fullscreen LIFO Esc) and `showcase-34` (dynamic empty→data ECharts mount, all-negative bar + negative ref line, 276px 6-dim parallel, 64px high-precision `MetricRing`, 3-node LR `ServiceGraph` with group labels & skip edge), expanding live Visual QA coverage to **70/70 PASS** (35 showcases × Dark/Light).

### Fixed
- **Layout, CSS Container Queries, Slider Geometry & Overlay Focus (`Catalog.module.css`, `InputWidgets.tsx`, `P0Widgets.tsx`, `AntdParityWidgets.tsx`, `OpsAndInsightWidgets.tsx`, `dom-hooks.ts`)**:
  - Eliminated 8px `Slider` 100% thumb overflow (`showcase-29` / `29-dock` Dark & Light: 4 FAIL → 4 PASS) by switching `.sliderTrack` to full-width with 11px inset rail/fill and `calc(pct% + (11 - 0.22 * pct)px)` thumb positioning.
  - Extended unweighted `Row` / `List` flex split rules and `container-type: inline-size` to `.column`, `.listVertical`, `[data-a2ui-modal-root]`, and `.timelineChildSlot`; added universal `min-width: 0; overflow-wrap: anywhere` guards across composite cards; fixed `KeyValue` 3→2 column grid orphan holes (`--kv-span-2`), `DateRange[data-enable-time="true"]` narrow stacking, and `DiffView` split-mode top-aligned line gutters + `.diffStatsGroup` atomic `+N/-M` grouping.
  - Fixed `useEChartsMount` permanent blank canvas when transitioning from empty data (`暂无匹配数据`) to populated data by wiring explicit `mounted` mount/dispose dependency; added LIFO `dialogFocusStack` to `useDialogFocus` for nested dialogs; added generalized ResizeObserver `fitScale` (`>= 0.72`) auto-fit scaling to `ServiceGraph` so 3-node LR graphs render without right clipping or horizontal scrollbars.
- **19-Kind ECharts Dual-Theme Contrast, Scroll Legend & Compact Geometry (`echarts-chunk.ts`, `EChartsWidget.tsx`)**:
  - Added WCAG luminance-aware `resolveTooltipTextAndBorder()` reading `--dsw-alias-tooltip-label` with `>= 4.5` contrast fallback, fixing unreadable dark-on-dark Light Mode tooltips across all 19 chart kinds.
  - Implemented closed-form dual-bound scroll-legend pagination gap calculation in `buildLegendOption`, eliminating mid-word slicing and peeking icons beside `◀ 1/N ▶` at `276px` while keeping `<= 3` short legends uncut; replaced fixed-width stretching on `buildReferenceMarkLine` with visual-width text truncation.
  - Hardened all-negative bar 0-baseline & bottom radii `[0,0,4,4]`, negative reference-line avoidance, 6-dim `parallel` asymmetric `276px` margins, `gauge` compact pointer length (`48%`/`54%`), `graph` Light/Dark edge contrast, `waterfall` seamless zero-crossing radii & bottom negative labels, `combo` single Y-axis without line series, `calendar` negative `visualMap.min`, `sunburst` `nodeClick` guard, `isOpaqueCssColor` PNG export check, and cross-filter hierarchy propagation, `'-'` sentinel skip, exact-match precedence, and `boxplot`/`candlestick`/`parallel` support.
- **Deterministic Helpers Precision & Edge Cases (`v3-helpers.ts`, `v4-helpers.ts`, `v5-helpers.ts`, `p0-helpers.ts`, `stat-file-helpers.ts`)**:
  - Preserved `< 100` high-SLA precision (`99.9997%`) and calibrated `64px` `MetricRing` inner-hole clearances; accounted for `n.group` and mono metric widths in `ServiceGraph` layout; tolerated `"-"`/`"—"` placeholders in `ProTable` numeric detection with 2-decimal summaries for `< 0.1%` rates; hardened `Schedule` `HH:MM` validation/wrap, `Matrix` numeric/warn normalization, `ApiEndpoint` absolute URL cURL generation, tree-flattening CSV export, `NumberInput` empty-string handling, `HierarchyTree` zero-value preservation, `CheckCard` `price: 0` & dedup, `Steps`/`KeyValue` sanitization, `Sparkline` finite-span guards, and `FileTree` path normalization.
- **Security Redaction, Streaming Replay, Express Compiler & Chunk Loader (`action-protocol.ts`, `ask-tool.ts`, `render-tool.ts`, `streaming.ts`, `express-preprocess.ts`, `chunk-loader.ts`)**:
  - Prevented double-enrichment secret re-injection in `action-protocol.ts` while preserving `token_*` surface root IDs; tightened parent-path secret pointer detection and explicit `isSurfaceRootLevel` redaction in `ask-tool.ts`; guarded empty `parentId`/`parentSession` in `render-tool.ts` and counted empty-message repairs; unified `feed()`/`close()` replay with `streamRejected` guard in `streaming.ts`; fixed multi-line/leading comments, `refConstants` propagation, inline `calc`, and bare `?required` in `express-preprocess.ts`; added disconnected-target checks and error-cache sibling notifications in `chunk-loader.ts`.

### Changed
- Verified full automated release gate: **34 suites / 188 tests** passing, **14/14** architectural invariants, **0** comments, **4/4** TLA+ formal specs, **5/5** bundle budgets (`lib/client.js = 69.69 kB / 19.67 kB gzip`), `eval:check` (`100%` / `57/57`), `check:host-api`, and **70/70** live DeepSeek Harness Dark & Light visual QA passes.

## [0.4.7] - 2026-11-22

### Added
- **TLA+ Formal Verification for 4 Concurrent State Machines (`specs/*.tla`, `scripts/verify-tla.mjs`, `docs/adr/ADR-0008-formal-verification-and-invariants.md`, `tests/formal-specs.spec.ts`)**:
  - Added formal specifications and TLC configurations for `AskLifecycle`, `ChunkAndMermaidCache`, `SurfaceTurnLifecycle`, and `OverlayEscapeStack`, verified exhaustively via TLC (`8,215` distinct states / `43,102` transitions, `0` errors) and exposed via `npm run verify:tla`.
- **12-Rule AST & CSS Architectural Invariant Gate (`scripts/check-invariants.mjs`, `tests/invariants-lint.spec.ts`)**:
  - Wired 12 static invariants into `npm run lint` and CI (`css-no-container-self-query`, `css-media-requires-container`, `no-weight-full-width-override`, `shell-runtime-boundary`, `pure-module-isolation`, `no-useeffect-outside-dom-hooks`, `no-direct-localstorage`, `no-direct-window-keydown`, `no-raw-native-date-input`, `no-html-in-echarts-richtext`, `security-no-dangerous-sinks`, and `locale-key-parity`).
- **5-Chunk Raw + Gzip Bundle Budget Ratchet (`.bundle-budget.json`, `scripts/check-bundle-budget.mjs`, `build/preset.ts`)**:
  - Enforced both raw and gzip (level 9) size limits across all 5 build outputs (`lib/index.js`, `lib/client.js`, `lib/client.runtime.js`, `lib/client.echarts.js`, `lib/client.mermaid.js`) during `npm run build` and `npm run check:bundle`, with `--ratchet` monotonic tightening.
- **Deterministic Streaming Replay, Linear Fuzzing, `240px` Regression & Eval KPI Gate (`tests/deterministic-replay-fuzz.spec.ts`, `.eval-baseline.json`, `scripts/eval-llm.mjs`)**:
  - Added seeded random token-chunk streaming equivalence tests across all exported showcases, deterministic multi-turn `update`/`deleteSurface`/partial-supersede replay, 200+ adversarial linear-time compiler/security fuzz cases, `240px` ultra-narrow ECharts/MetricRing assertions, and `npm run eval:check` threshold gating.
- **Zero-Dependency Headless Chrome CDP Visual QA & Screenshot Bot (`scripts/visual-qa-bot.mjs`)**:
  - Added `npm run qa:visual` (and `--screenshots` for `screenshots.json`) using Node 24 native WebSocket + Chrome Headless CDP to run isolated Dark & Light 4-point DOM geometry audits automatically.

### Fixed
- **Mermaid Unmount Oversized-Cache Leak Caught by TLC (`src/client/chunk-loader.ts`)**:
  - Extracted shared `trimIdleMermaidCache()` and invoked it on zero-subscriber unmount when `mermaidDiagramCache.size > MAX_MERMAID_CACHE_ENTRIES`, resolving the 8-step `BoundedIdleCache` counterexample found by TLC when `> 64` diagrams mount simultaneously and subsequently unmount.
- **Node 26 Native Strip-Only TypeScript Compatibility (`src/host/generator.ts`, `tsconfig.json`, `package.json`)**:
  - Replaced the lone constructor parameter property in `SurfaceSessions`, enabled `erasableSyntaxOnly: true` in `tsconfig.json`, and removed the Node 26-deprecated `--experimental-transform-types` flag from `eval:llm` / `eval:check`.

### Changed
- **Context-Encoded Shell vs Runtime Directory Split (`src/client/shell/`, `src/client/runtime/`, `biome.json`, `AGENTS.md`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`)**:
  - Separated cold-boot shell modules into `src/client/shell/` and lazy runtime modules into `src/client/runtime/` with path-scoped Biome `noRestrictedImports` overrides and expanded CI/release verification gates (**33 suites / 182 tests** passing, `lib/client.js = 69.69 kB / 19.62 kB gzip`, `0` Biome/Lint/Comments/TS diagnostics, `check:host-api` green).

## [0.4.6] - 2026-11-22

### Fixed
- **G1: CSS Layout & Anti-Collapse Composition Contract (`Catalog.module.css`, `SurfaceView.module.css`, `ActionUserChip.module.css`, `LayoutWidgets.tsx`, `OpsAndInsightWidgets.tsx`)**:
  - Established global `:where(...)` width and `box-sizing: border-box` anti-collapse guards so `container-type: inline-size` widgets (`Table`, `Chart`, `DiffView`, `Schedule`, etc.) no longer collapse to `2px` inside `Column(align="start")` or `Callout` nested under a `Row` ancestor, isolating `--a2ui-flex-basis` strictly by direct-child axis (`.row > *` vs vertical containers `> *`).
  - Added equal-specificity narrow `@container` breakpoints for `.responsiveGrid[data-columns="3"]` and `.checkCardGrid[data-columns="3"]` (`<= 340px` single-column collapse), tuned `DshCardImpl` `minWidth` to `190px` (preserving desktop 3-up weighted cards while stacking cleanly at `306px`) and separated `.statCard` in unweighted rows to `flex: 1 1 min(100%, 140px)`, and tightened 3-digit `DiffView` split-mode line-number gutters (`30px`) with `pre-wrap` wrapping.
- **G2: Portal Popovers, Modal Semantics & Wrapper-Free Triggers (`dom-hooks.ts`, `primitives.tsx`, `LayoutWidgets.tsx`, `P0Widgets.tsx`, `functions.ts`)**:
  - Attached `ResizeObserver` on `triggerRef` inside `usePortalPopover` so `MultiSelect` popovers inside `Modal` dynamically shift downward when selected tags wrap to multiple rows (`+4.3px` zero-overlap verified).
  - Kept local function actions (`copyText`, `openUrl`) from closing ancestor `Modal` dialogs via `isLocalFunctionAction()`, delegated `CopyText` user-activation enforcement directly to `@a2ui/web_core` (`requiresUserActivation = true`), added capture-phase invalid-form blocking on Modal triggers, restored dialog focus on close, and guarded `DshTooltip`/`DshHoverCard` `cloneElement` against `Fragment` children.
- **G3: Validation, Expressions, Express Preprocessor & Form Defaults (`functions.ts`, `InputWidgets.tsx`, `AntdParityWidgets.tsx`, `express-preprocess.ts`, `generator.ts`, `prompt-compact.ts`, `v5-helpers.ts`)**:
  - Overrode `SafeRequiredImplementation` / `SafeNumericImplementation` and updated `computeCond` to unwrap `{ valid }` validation results (fixing `cond(required(...))` false-positive truthiness), hardened `formatNumber` against blank/non-numeric inputs, and expanded `DateRange(?required)` validation plus server-side static-string misuse rejection and 5 Express preprocessor boundary fixes.
  - Corrected default states across 4 input widgets: `ChoicePicker` defaults to `singleSelection` native radios (and added explicit `variant="multipleSelection"` to `BOOKING_UI` flavor preferences), `Segmented` avoids fake first-item selection on empty string, `NumberInput` renders empty instead of `min` when unset, and `DateTimeInput(enableTime=true)` defaults to pure time mode (`09:30`); `buildDatePresetRange(1, true)` produces full `00:00–23:59` windows.
- **G4: End-to-End Array Cross-Filtering & ProTable Aggregation (`v4-helpers.ts`, `EChartsWidget.tsx`, `echarts-chunk.ts`, `TableWidget.tsx`, `catalog-schema.ts`, `stat-file-helpers.ts`, `MediaAndDataWidgets.tsx`)**:
  - Extended `filterPath` cross-filtering across `MultiSelect`, `Chart`, and `ProTable` to support `string | string[]` OR-matching (rendering `us-east · eu-west` chips, multi-bar highlighting, and 3-row OR filtering) while preserving existing scalar string cross-filtering (`showcase-25`).
  - Decoupled `detectNumericColumnKeys` from column `align` by sampling non-empty cell values (fixing missing summaries on centered numeric columns), added high-SLA decimal precision formatting (`99.95%`) on `Progress`/`Matrix`, and normalized leading slashes in `FileTree`.
- **G5: 19-Kind ECharts `276px` Contract & Chart State Isolation (`echarts-chunk.ts`, `EChartsWidget.tsx`, `dom-hooks.ts`)**:
  - Fixed `Gauge` `value`/`max` field precedence (`72` instead of `100`), numeric `yField` sorting in `Heatmap`, `seriesField` long-table pivoting in `Radar`, negative-total bottom positioning & negative-axis headroom in `Waterfall`, dark-mode leaf-label visibility + wrapped long link tooltips in `Sankey`, and cross-filter dimming in `Scatter`/`Calendar`/`Graph`.
  - Widened `hasChartData` for single-object `gauge`/`sunburst`/`treemap`, `{ edges }` in `sankey`/`graph`, and tuple arrays; tracked `chartKind` in `useEChartsMount` to reset stale zoom/legend state via `notMerge` when chart kinds switch.
- **G6: Mermaid Quote-Safe Repair, Fullscreen Dual-Axis Fit & Light Gantt Contrast (`mermaid-safe.ts`, `mermaid-chunk.ts`, `ExtendedWidgets.tsx`, `Catalog.module.css`)**:
  - Reordered `repairMermaidSource` outer-to-inner (`[]` → `{}` → `()`) with quoted-string masking so labels such as `A[用户 (管理员)]` never double-quote into parse errors.
  - Changed Mermaid fullscreen Fit scaling to `Math.min(stageW / natW, stageH / natH)` (`410%` clipped → `93%` full 8-node view) with drawn-box wheel zoom anchoring; upgraded Light Mode Gantt saturated bar fills with pure `#ffffff` task text and `@container (max-width: 720px)` tick thinning.
- **G7 & G8: Enterprise Ops Widgets & Runtime Lifecycle / Redaction Isolation (`EnterpriseWidgets.tsx`, `OpsAndInsightWidgets.tsx`, `AskToolView.tsx`, `DockView.tsx`, `SurfaceView.tsx`, `ToolView.tsx`, `TurnTailView.tsx`, `turn-surfaces.ts`, `persistence.ts`, `ask-tool.ts`, `src/index.ts`, `i18n.ts`)**:
  - Added overnight `Schedule` (`22:00–04:00`) minute normalization & dual-theme `currentColor` progress overlays, `EntityHeader`/`Result` default CTA fallback (`msg.defaultActionCta`), `ApiEndpoint` cURL deduplication, `ApprovalCard` failure rollback, and `LogViewer`/`ServiceGraph` state syncing.
  - Hardened per-`surfaceId` bounded `seq` replay, partial multi-surface read-only superseding, `a2ui_ask` draft scoping (`sessionId::ask::callId`) & post-submit cleanup, renamed sensitive `context` key redaction on server settle, RFC 6901 pointer escaping, and `DockView` local-state fallback.

### Changed
- Added 3 comprehensive composition QA showcases (`showcase-30`, `showcase-31`, `showcase-32`) to `scripts/mock-llm.mjs` and added `tests/composition-audit-v046.spec.ts`, expanding Vitest coverage to **30 suites / 163 tests** (`lib/client.js = 69.69 kB / 19.66 kB gzip`, `0` Biome/Lint/Comments/TS diagnostics, `check:host-api` green, live Dark & Light DeepSeek Harness visual QA verified across all 3 audit showcases + 5 existing regression showcases with 0 application errors).

## [0.4.5] - 2026-11-22

### Fixed
- **Flex & Container-Query Composition Hardening (`Catalog.module.css`, `SurfaceView.module.css`, `widget-helpers.tsx`, `OpsAndInsightWidgets.tsx`, `EnterpriseWidgets.tsx`, `P0Widgets.tsx`, `MediaAndDataWidgets.tsx`)**:
  - Introduced container-isolated `--a2ui-flex-basis` scoping (`0px` inside `.row`/`.listHorizontal`, `auto` inside `.surfaceStack`/`.column`/`.listVertical`/`.card`/`.tabPanel`/`.accordionPanel`) plus unweighted flex-item guards (`flex: 1 1 min(100%, 220px)`), eliminating 2px vertical-slit collapse when placing `Card`/`DiffView`/`KeyValue`/`MetricRing`/`CheckCard` inside unweighted `Row` containers.
  - Clamped `weightStyle` `minWidth` with `min(100%, ${minWidth}px)`, fixed the `@container (max-width: 260px)` self-query trap on `.metricRingCard` by wrapping its figure and metadata in `.metricRingInner` (clean vertical stacking inside `199px` 3-col grids), added `<= 720px` 3-column progressive collapse on 4–6 column `.responsiveGrid`, added narrow `@container` breakpoints for `KeyValue` (`<= 520px` / `<= 340px`) and `DateRange` (`<= 340px`), migrated `Tree` indentation to `--tree-depth` CSS variables, and added `min-width: 0; max-width: 100%; box-sizing: border-box` guards on narrow `.treeSearchHeader`/`.tableSearch`/`.selectSearchRow` inputs.
  - Added `<colgroup>` with `.diffSplitGutterCol` on `DiffView` split tables so both panes stay readable inside `248px–306px` cards; switched `Tracker` to `minmax(0, 1fr)` with `1px` compact gaps (`> 48` segments) eliminating `60`-segment right-border bleed; removed default button chrome on `Image(avatar)`, gave `AudioPlayer` dedicated `.audioPlayerField` width protection, added `.codeWrap` to untitled `Code` blocks, and sanitized React 19 `useId()` SVG `url(#...)` identifiers in `Stat` and `ServiceGraph`.
- **Unified LIFO Overlay Escape Stack & Disclosure State Preservation (`dom-hooks.ts`, `primitives.tsx`, `LayoutWidgets.tsx`, `ExtendedWidgets.tsx`, `P0Widgets.tsx`, `DockView.tsx`, `DockView.module.css`)**:
  - Replaced scattered `window` `Escape` listeners with a centralized capture-phase LIFO `escapeHandlerStack` (`stopImmediatePropagation()`), ensuring nested `Select`/`MultiSelect`/`TreeSelect` popovers inside `Modal` or Mermaid fullscreen dismiss top-most layer first without destroying the parent dialog; added `rAF`-throttled popover repositioning and auto-close when triggers scroll out of clipping ancestors.
  - Preserved widget and `SurfaceSessionStore` state across panel switches/collapses in `Tabs`, `Accordion`, `Callout`, and `DockView` via lazy `visitedSet` mounting + `hidden` + explicit `display: none` (preventing host CSS from exposing hidden panels); added `defaultOpen` alias on `Accordion` items; switched `.bare` to `overflow: visible` with `8px` `.sliderTrack` inset so `0%`/`100%` Slider thumbs in the bottom Dock are never clipped.
- **Cross-Widget Data Contracts, `isWritableProp` & Cross-Filter Accuracy (`widget-helpers.tsx`, `InputWidgets.tsx`, `AntdParityWidgets.tsx`, `TableWidget.tsx`, `v4-helpers.ts`, `functions.ts`, `catalog-schema.ts`)**:
  - Added `isWritableProp(context, propName, setter)` to distinguish real writable bindings from `@a2ui/react` synthesized no-op setters, fixing `CheckCard` prompt mode (`↗` arrows instead of dead checkboxes) and `Chart`/`Table` read-only detection.
  - Coerced valid numeric input strings in `TextField(variant="number")` to JS numbers so `?numeric` validation and live `formatNumber`/`formatCurrency` updates work seamlessly; updated `computeCond` and `CondApi.condition` so empty arrays `[]` and `NaN` evaluate falsy; added `Checkable` support and accurate `"Today"` range preset to `DateRange`, external `props.value` sync + scientific notation to `NumberInput`, and `ModalTriggerContext` / `ModalCloseContext` wiring across `Button`, `CheckCard`, and `ApprovalCard`.
  - Updated `TableWidget` to derive column schemas from `normalizedData`, reset/clamp pagination on `filterField` change, scope `selectedRowsList` to `filteredRows`, normalize `->`/`→` in `filterTableRowsByField`, and tighten 2-char fuzzy matching.
- **ECharts Chromatic Palette Guard & 19-Kind Dual-Theme Hardening (`echarts-chunk.ts`, `EChartsWidget.tsx`, `dom-hooks.ts`)**:
  - Switched ECharts primary series token from monochrome `--dsw-alias-brand-primary` to official chromatic `--dsw-alias-state-business-primary` with `isChromaticCanvasColor` chroma validation (`max - min >= 24`), preventing white-on-dark / black-on-light bar, heatmap, and treemap regressions across Dark and Light modes.
  - Emitted raw datum keys for cross-filtering (fixing `API -> DB` vs `API → DB` 0-row mismatches), expanded cross-filter dimming across `line`, `sankey`, `graph`, `scatter`, and `heatmap`, added dark-safe `heatmap` `splitArea` & `dataZoom`/`legend`/`gauge` styling, gated wheel zoom with `zoomOnMouseWheel: 'ctrl'`, disabled trap drill-down on `treemap` (`nodeClick: false`), fixed `parallel` axis title overlap, and deferred `initChartInstance` on `0×0` containers.
- **Mermaid Dual-Theme Palettes, Compact Gantt Ticks & Fullscreen Fit (`mermaid-chunk.ts`, `mermaid-safe.ts`, `chunk-loader.ts`, `Catalog.module.css`)**:
  - Configured complete Dark and Light `themeVariables` palettes (`pie1..12`, `cScale0..7`, `git0..7`, semantic Gantt task colors, `%m-%d` axis format) plus `@container (max-width: 360px)` alternating tick-label thinning for compact Gantt cards.
  - Recovered degenerate `viewBox="0 0 0 0"`, added `preserveAspectRatio="xMidYMid meet"` and fullscreen SVG fit rules (`890×738px` verified), protected `style`/`classDef`/`linkStyle` in `repairMermaidSource`, and fixed the lazy chunk-loader permanent-skeleton race.
- **Express Preprocessor, Streaming Recovery & Multi-Turn Surface Lifecycle (`express-preprocess.ts`, `streaming.ts`, `turn-surfaces.ts`, `ToolView.tsx`, `constants.ts`)**:
  - Hardened `scanStringOrComment` for `#`/`--` comments containing apostrophes, skipped `@`-prefixed keys during `cond`-to-lookup folding, and expanded `flattenChainedCalc` for trailing commas and nested inline `calc`.
  - Added `deleteSurface` cleanup in `resolveDockBatch`, partial multi-surface supersede detection in `resolveTurnTailBatch`, prior-message hydration for inline `update=true`, multi-pass `normalizeStreamingProgram` fence/tag stripping, mid-stream `streamRejected` recovery, and benign metric exemptions (`tokenPerSec`, `tokenSpeed`, `tokenBudget`) in `isSecretKey`.

### Changed
- Added 3 end-to-end multi-component composition QA showcases (`showcase-27`, `showcase-28`, `showcase-29-dock`) to `scripts/mock-llm.mjs` and added `tests/composition-audit-fixes.spec.ts`, expanding Vitest coverage to **29 suites / 156 tests** (`lib/client.js = 66.41 kB / 18.72 kB gzip`, `0` Biome/Lint/Comments/TS diagnostics, `check:host-api` verifying 93 host contracts, live Dark & Light DeepSeek Harness QA 11/11 PASS with 0 console/page errors).

## [0.4.4] - 2026-11-21

### Fixed
- **CLS-1: Security, SVG/CSS Isolation & Protocol Boundaries (`mermaid-safe.ts`, `mermaid-chunk.ts`, `file-opener.tsx`, `widget-helpers.tsx`, `action-protocol.ts`, `v4-helpers.ts`)**:
  - Looped Mermaid `stripUnsafeDirectives` for nested `%%{init}%%` / YAML frontmatter and re-applied after `repairMermaidSource` backtick cleanup; upgraded `scopeMermaidStyleRules` to filter CSS rules individually (rejecting unscoped selectors, `@import`, external `url()`, and unsafe inline styles like `position`/`z-index`/`inset` while preserving valid scoped `@media` rules); blocked `<animateTransform>`/`<animateMotion>`/`<image>`/`<feImage>` in `assertSafeSvg` and `DOMPurify`.
  - Added strict static SVG validation (`isSafeStaticSvgImage`) for `data:image/svg+xml` image URIs (including `;utf8,` shorthand) while rejecting all `data:` URIs for `AudioPlayer` and `Video`.
  - Hardened `parseFileTarget` and `isPathWithinWorkspace` against UNC prefixes (`\/`, `/\`), percent-encoded traversal (`%2e`, `%00`), and sibling-prefix workspace escapes; sanitized `ApiEndpoint` `baseUrl` / headers against non-HTTP schemes and CR/LF injection; anchored `action-protocol` header parsing to prevent spoofed user-text blocks.
- **CLS-2: End-to-End Credential & Obscured Pointer Redaction (`constants.ts`, `ask-tool.ts`, `persistence.ts`, `SurfaceView.tsx`)**:
  - Extended `isSecretKey` to cover camelCase/snake_case suffixes and plural variants (`cardPin`, `card_pin`, `api_keys`, `access_tokens`, `masterKey`, etc.) without false-positiving benign metrics (`promptTokens`, `totalTokens`).
  - Added server-side `collectObscuredPointersFromMessages` so `PendingAskRegistry.settle()` re-sanitizes both `context` and `dataModels` against `TextField(..., variant="obscured")` pointers before returning to the model.
- **CLS-3: Linear `O(N)` Express Compiler & Data Integrity (`express-preprocess.ts`, `calc-engine.ts`, `constants.ts`, `generator.ts`, `render-tool.ts`)**:
  - Rewrote Express preprocessing around a single-pass `Int32Array` bracket map and unified string/comment scanner (handling triple-quoted/raw strings and comments in strictly linear time); preserved outer `round()` and collision-safe variable aliasing in chained `calc()`; fixed symmetric half-away-from-zero rounding (`round(-2.5, 0) === -3`, `round(35.855, 2) === 35.86`); switched `safeStringifyJson` to ancestor-stack cycle detection so shared DAG references are preserved; tightened `isSubagentCall` against empty/null `parentCallId` and enforced `maxCompiledBytes` (`512 KB`).
- **CLS-4: 19-Kind ECharts `276px` Compact QA & Crisp Filled-Shape Halos (`echarts-chunk.ts`, `EChartsWidget.tsx`, `src/shared/chart-i18n.ts`)**:
  - Replaced thick black text strokes on `sunburst` (including level 4+), `treemap`, `funnel`, `waterfall` inside labels, and high-intensity `heatmap` cells with a shared crisp thin halo (`FILLED_SHAPE_LABEL`: `textBorderWidth: 0.8`, `textShadowBlur: 3`) verified across Dark and Light modes.
  - Added smart legend collision disambiguation in `buildLegendOption` (rendering full names for colliding 2-series legends `<= 14` units such as `DeepSeek-R1` / `DeepSeek-V3`, and middle-ellipsis for 3+ collisions such as `DeepS…528` / `DeepS…324`).
  - Added narrow-bar width checking (`fitsInsideBar`) in `waterfall` so `276px` bars place `+165` cleanly at `position: 'bottom'` while wide `520px` bars retain `'inside'`; tracked `stepDeltas[]` and `isTotalFlags[]` to fix negative-region `--20` and zero-crossing tooltips.
  - Hardened `boxplot` quantiles for `> 5` samples, `scatter` `seriesField` grouping + legends, `sankey` duplicate-edge aggregation, `calendar` Unix timestamps & invalid-date rejection, `heatmap` axis field exclusion, `combo` dual-axis colors/labels, `gauge`/`candlestick` compact sizing, and decoupled ECharts strings into `src/shared/chart-i18n.ts` (`-22.6 kB` bundle reduction).
- **CLS-5: Shared Zero-Effect Hooks, Portal Ergonomics, Temporal & ProTable Accuracy (`dom-hooks.ts`, `src/shared/temporal.ts`, `TableWidget.tsx`, `AntdParityWidgets.tsx`, `InputWidgets.tsx`, `ExtendedWidgets.tsx`, `v4-helpers.ts`, `v5-helpers.ts`, `functions.ts`)**:
  - Consolidated `usePortalPopover` (with upward `bottom`-anchored clamping and `Escape` focus restoration), `useTransientFlag`, `useTransientKey`, and `useEscapeKey` in `src/client/dom-hooks.ts`; guarded `useEChartsMount` against zero-size hidden containers and hardened `useMermaidViewportDom` `blur`/fullscreen drag cleanup.
  - Fixed `Tree` `allOpen` accuracy via `collectBranchDepths` (`showcase-21` now accurately shows `"全部收起"` when expanded and toggles cleanly), `Select`/`MultiSelect`/`TreeSelect` popover keyboard navigation & `readOnly` guards, `Button` accessible disabled check triggers, `Schedule` overnight ranges, `DateRange`/`DateTimeInput` local date formatting (`src/shared/temporal.ts`), and per-instance Mermaid SVG ID namespacing (`namespaceSvgIds`).
  - Upgraded `ProTable` with formatted numeric sorting (`¥1,200`, `-¥500`, `99.95%`), sorted CSV/Markdown export, date/blank-safe numeric summaries, and tightened prefix-boundary cross-filtering (`filterTableRowsByField`).
- **CLS-6 & CLS-7: Build Purity, Cross-Chunk Locale, Lifecycle & CSS Invariants (`build/preset.ts`, `src/shared/locale.ts`, `chunk-loader.ts`, `style-lifecycle.ts`, `TierControl.tsx`, `turn-surfaces.ts`, `ErrorBoundary.tsx`, `Catalog.module.css`)**:
  - Enabled browser-platform production bundling in `build/preset.ts` (eliminating `litServerRoot` and all build warnings) and tightened the cold-boot gate to `100 kB` (`lib/client.js = 65.80 kB / 18.58 kB gzip`).
  - Shared client locale overrides across all CJS chunks via `src/shared/locale.ts` (`globalThis.__dshA2uiI18n__`), cleaned up `document.adoptedStyleSheets`, added chunk load failure retry UI + active Mermaid LRU protection, added `TierControl` failed-sync rollback, bounded `turn-surfaces` caches with true LRU + `WeakMap`, and handled non-Error throws in `ErrorBoundary`.
  - Fixed `@container` cascade ordering for `.chartActions` / `.kvCell`, separated `.chartCard > .chartInner` and `.containerHost` to avoid self-queries, added `.selectSearchRow > * { width: 100% }` (`showcase-23` full-width popover search), added `contain: layout paint` on Mermaid containers, standardized 4-tier z-index tokens, and replaced hardcoded theme fallbacks with `light-dark(...)`.

### Changed
- **CLS-8: Regression Coverage, Host API Contract Gate, CI & Docs Sync**:
  - Added `tests/review-v044-hardening.spec.ts` covering `CLS-1..CLS-8`, all 19 ECharts kinds at `276px`, all 57 catalog components, and all 7 Slot Views (**28 suites / 147 tests**).
  - Scoped `noDangerouslySetInnerHtml` exception in `biome.json` strictly to `src/client/catalog/ExtendedWidgets.tsx`; expanded `scripts/check-host-api.mjs` to verify **93 host contracts** (`12` platform modules, `7` injected client modules, `30` primitives, `5` slots, `39` CSS tokens); upgraded `.github/workflows/ci.yml` with `concurrency`, `macos-latest`, and `biome format` check; fixed `scripts/eval-llm.mjs` `--max-repairs=0` handling.
  - Synchronized `docs/DEVELOPMENT.md`, `docs/DEVELOPMENT.zh-CN.md`, `docs/adr/ADR-0002/0004/0006/0007`, `CONTRIBUTING.md`, `SECURITY.md`, `THIRD_PARTY_NOTICES.md`, and `.github/ISSUE_TEMPLATE/bug_report.yml`, and removed orphaned `docs/dsh-genui-a2ui-component-library.html`.

## [0.4.3] - 2026-11-21

### Fixed
- **Security & DoS Hardening (`mermaid-safe.ts`, `mermaid-chunk.ts`, `file-opener.tsx`, `v4-helpers.ts`, `constants.ts`, `generator.ts`, `express-preprocess.ts`)**:
  - **Mermaid Fail-Closed SVG Sanitization & Light DOM Isolation**: Hardened `assertSafeSvg` against HTML named entity URI bypasses (`javascript&colon;`), `data:image/svg+xml`, SMIL `<animate>`/`<set>` href/event mutations, and unscoped `<style>` blocks; updated `stripUnsafeDirectives` to strip repeated leading YAML frontmatter blocks, and failed closed if DOMPurify cannot load.
  - **Workspace File Opener & cURL Sanitization**: Blocked path traversal (`..`), UNC/network shares (`\\...`, `//...`), control characters, and arbitrary URI schemes in `parseFileTarget`; whitelisted HTTP methods in `buildEndpointCurl` to prevent command injection.
  - **Acronym Secret Redaction & Linear ReDoS/Amplification Guards**: Upgraded `isSecretKey` to split uppercase acronyms (`SSHKey`, `MFAToken`, `HTTPAuthorization`, `APISECRET`) without false-positiving benign metrics (`tokenBudget`, `pinToDock`); rewrote `stripWrapping` to run in linear time while unwrapping fences around `<a2ui>`; bounded recursion depth in `express-preprocess.ts` and added total compiled byte-budget enforcement in `validateCompiledLimits` against variable-expansion payload amplification.
- **Runtime Correctness, React 18 Purity & Prompt Parity (`SurfaceView.tsx`, `dom-hooks.ts`, `AskToolView.tsx`, `EnterpriseWidgets.tsx`, `persistence.ts`, `calc-engine.ts`, `prompt-compact.ts`, `src/index.ts`)**:
  - Moved `SurfaceSessionStore.reconcile` out of render into `useSurfaceStoreSync` (`src/client/dom-hooks.ts`) to keep React 18 concurrent rendering pure while honoring the zero-`useEffect`-in-`.tsx` contract.
  - Fixed `a2ui_ask` and `ApprovalCard` submission deadlock recovery on dispatch failure, `localStorage` quota fallback consistency + `Object.hasOwn` guards against `Object.prototype` keys, `calc-engine` user `E`/`PI` bindings + `-0`/high-`nper` `pmt()` stability, and 5 prompt/skill positional signature mismatches (`pluralize`, `Stat`, `KeyValue`, `DiffView`).
  - Added non-array defensive guards across `LayoutWidgets`, `InputWidgets`, `ExtendedWidgets`, `OpsAndInsightWidgets`, and `TableWidget`.
- **ECharts Data Integrity & 306px/276px Dual-Theme Visual QA (`echarts-chunk.ts`, `EChartsWidget.tsx`, `NativeDateField.tsx`, `Catalog.module.css`, `primitives.tsx`, `scripts/check-host-api.mjs`)**:
  - Fixed `waterfall` zero-crossing bar stacking, `radar` small-value indicator scaling, `graph` node ID deduplication, `seriesField` duplicate-key summation, and exact cross-filter matching (including nested `sunburst`/`treemap` branch highlighting).
  - Unified `buildLegendOption` + CJK/ASCII visual-width truncation (`truncateByVisualWidth`) across all 7 ECharts legend builders and `buildReferenceMarkLine(..., isCompact)` across all 6 call sites, eliminating `276px` funnel legend clipping; normalized `' -> '` to `' → '` in `EChartsWidget.sanitizeInlineText`.
  - Extracted shared pure-React `NativeDateField` (`src/client/catalog/NativeDateField.tsx`) with theme-aware SVG calendar/clock trigger buttons (`showPicker?.()`) for both `DateTimeInput` and `DateRange`.
  - Fixed `DiffView` split-mode right-column truncation via `.diffSplitTable { table-layout: fixed }` + `@container (max-width: 720px)` wrapping and expanded `AskToolView` scroll clearance (`min(480px, 56vh)` + `scroll-padding-bottom: 16px`).
  - Replaced all 18 non-existent `--dsw-alias-status-*` and 23 non-existent `--dsw-alias-state-info-primary` CSS tokens with verified DeepSeek Harness alias tokens (`--dsw-alias-state-{success,warn,error,business}-primary`, fixing Dark Mode white-on-white `POST` badge / `CheckCard` contrast regression); extended `scripts/check-host-api.mjs` to validate all 26 `--dsw-alias-*` tokens against the installed `app.asar` and added an automated CSS Dark Mode contrast guard.
- **Cross-Module Generalization Consolidation (G1–G5)**:
  - **G1**: Extracted shared `unwrapLegacyToolArgs` from `src/host/render-tool.ts` and upgraded `readAskArgs` in `src/host/ask-tool.ts` to share Zod validation, `{ arguments }` / stringified JSON unwrapping, and once-per-process legacy warnings.
  - **G2**: Unified `normalizePointerPath` (stripping trailing `/`), `isPointerObscured`, and `isPointerObscuredOrParent` in `src/client/persistence.ts` and reused them in `src/client/SurfaceView.tsx`, extending `sanitizeActionContextForSurface` to inspect `approveAction` and `rejectAction` on `ApprovalCard`.
  - **G3**: Added shared `notifySubscribers` (`src/client/notify.ts`) replacing duplicate subscriber notification loops across `theme.ts`, `i18n.ts`, `persistence.ts`, `chunk-loader.ts`, and `SurfaceView.tsx`.
  - **G4**: Promoted circular/BigInt-safe `safeStringifyJson` into `src/shared/constants.ts`, fixing `[object Object]` output in `ProTable` CSV and Markdown exports.
  - **G5**: Unified `sanitizeInlineUrlText` (stripping `javascript:`/`data:` as well as `http(s)/image://`) across `EChartsWidget.tsx` and `echarts-chunk.ts`, and hardened `session/disposed` cleanup in `src/index.ts` against null/header-only session payloads.

### Changed
- Added `tests/review-v043-hardening.spec.ts` and expanded `tests/review-v042-fixes.spec.ts`, bringing Vitest coverage to **27 suites / 140 tests** (`lib/client.js = 61.05 kB / 17.26 kB gzip`, `0` Biome/Lint/Comments/TS diagnostics, `check:host-api` verifying 12 modules, 27 primitives, 5 slots, and 26 CSS alias tokens).

## [0.4.2] - 2026-11-21

### Fixed
- **HITL Integrity, Tool Argument Parsing & Security Hardening**:
  - **Strict `a2ui_ask` `callId` Matching (`src/host/ask-tool.ts`)**: `PendingAskRegistry.settle` now only falls back to the sole pending ask in a session when `callId` is omitted or empty; explicit mismatched, stale, whitespace-only, or non-string `callId` values are rejected (`false`) so stale callbacks cannot settle an unrelated active approval prompt.
  - **`readArgs` `title: null` & Multi-Layer Unwrap Fix (`src/host/render-tool.ts`)**: Allowed `title: null` in `RenderArgsSchema` (matching LLM tool payloads that serialize omitted optional fields as `null`) and unified `{ arguments }` / stringified JSON unwrapping into a 3-pass loop aligned with `readAskArgs`.
  - **Obscured Field Redaction in `action.context` & Expanded Secret Keys (`src/client/SurfaceView.tsx`, `src/shared/constants.ts`)**: Added `sanitizeActionContextForSurface` (single-pass fail-closed inspection of `componentsModel.entries`, normalized JSON pointer matching for exact/parent bindings regardless of value length, plus `>= 4`-char value matching fallback) so `TextField(..., variant="obscured")` values can no longer leak via `action.context` into `[a2ui-action]` or `/a2ui-answer`; expanded `isSecretKey` to cover `token`, `pin`, `otp`, `passcode`, `cvv`, `passphrase`, `credential(s)`, `authorization`, `cookie`, and `access`/`ssh`/`signing`/`encryption`/`master`/`client` key prefixes while preserving `tokens`/`promptTokens`/`totalTokens`.
  - **CSV Formula Injection Hardening (`src/client/catalog/v4-helpers.ts`)**: Narrowed `escapeCsvCell` exemption strictly to pure signed numeric literals (`/^[+-]?\d+(?:\.\d+)?$/`) while neutralizing leading whitespace/newline and signed formula payloads (`+1+cmd|...`, `-2+3+HYPERLINK(...)`, `\n=1+1`).
- **Runtime Recovery, Mermaid Cache & 306px/276px Visual QA Fixes (Verified Dark & Light)**:
  - **`Matrix(colorScale="auto")` Three-Tier Red/Amber/Green Fix (`src/client/catalog/v4-helpers.ts`, `src/client/catalog/EnterpriseWidgets.tsx`)**: Added normalized `ratio` (`0..1`) on `NormalizedMatrixCell` (decoupled from CSS `color-mix` `intensityPct` `[8, 42]`) so `colorScale="auto"` properly triggers error red (`>= 0.67`), warning amber (`>= 0.34`), and success green (`< 0.34`) instead of leaving the red band unreachable.
  - **`ErrorBoundary` Auto-Recovery via `resetKey` (`src/client/ErrorBoundary.tsx`, `src/client/SurfaceView.tsx`)**: Added `resetKey` (`generation:streaming:messages.length`) via `getDerivedStateFromProps` so transient streaming errors recover automatically once valid messages arrive.
  - **Mermaid Cache Error-Poisoning & Stale Target Fix (`src/client/chunk-loader.ts`)**: Tracked live `getTarget` callbacks per diagram key, skipped caching rejected renders when zero subscribers remain mounted, and automatically evicted/retried stale error snapshots on remount.
  - **306px `LogViewer` Layout & Accessibility (`src/client/catalog/Catalog.module.css`, `src/client/catalog/OpsAndInsightWidgets.tsx`)**: Replaced `.logRowMain > :last-child` with properly ordered `@container (max-width: 390px)` rules targeting `.logMessage { flex: 1 0 100%; order: 10; }` and `.logDetailToggle { margin-left: auto; }` (preventing the detail toggle button from stretching to 100% width) and added `aria-expanded`.
  - **WCAG AAA Amber Contrast, `DateTimeInput` & Compact ECharts Polish (`src/client/catalog/Catalog.module.css`, `src/client/chunks/echarts-chunk.ts`)**: Switched foreground text on amber `#f59e0b` `ApiEndpoint` `PUT`/`PATCH` badges, `Schedule` warning bars, and `Result` warning emblems to `#18181b` (`2.15:1 → 8.08:1` AAA); added `max-width: 100%; min-width: 0; box-sizing: border-box` and picker-indicator visibility on `.dateInput`; refined compact `276px` `waterfall` markLine pill spacing (`distance: 6`, `fontSize: 9.5`) and `treemap` label sizing (`fontSize: 9.5`, `padding: [2, 3]`).
- **Excuse-Comment Remediation & Zero-Comment Architecture (`docs/adr/`, `scripts/check-no-comments.mjs`, `tests/excuse-issues-fixes.spec.ts`)**:
  - Eliminated all code comments across the repository, migrated architectural decisions to 7 ADRs (`docs/adr/ADR-0001`–`ADR-0007`), added the ratcheted `check:comments` lint gate, and remediated all 9 recorded workaround issues (fail-closed obscured inspection, corrupt `localStorage` eviction + `removeSurfaceDraft`, circular/BigInt-safe JSON stringify, subscriber error isolation, minimal DOM stub style guards, streaming `seedWarnings`, Zod-validated `readArgs`, state-file write error reporting, and HTTP 400 malformed-JSON handling in `mock-llm`).

### Changed
- Added `showcase-26` (`SHOWCASE_V042_QA_UI`) to `scripts/mock-llm.mjs` and added `tests/review-v042-fixes.spec.ts`, `tests/excuse-issues-fixes.spec.ts`, and `tests/no-comments-lint.spec.ts`, expanding Vitest coverage to **26 suites / 126 tests** (`lib/client.js = 60.49 kB / 17.08 kB gzip`, `0` Biome/Lint/Comments/TS diagnostics, Host API check passing).
- Updated `SECURITY.md`, `THIRD_PARTY_NOTICES.md`, `docs/DEVELOPMENT*.md`, and `docs/adr/` to stay synchronized with 57 components, 19 chart kinds, 25 functions, and `v0.4.2` security & layout contracts.

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
