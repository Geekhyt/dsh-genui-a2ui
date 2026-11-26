# Project Engineering & Visual Quality Rules (`dsh-genui-a2ui`)

These rules apply to all changes in this repository (components, ECharts kinds, styles, host compiler, and tests).

## 1. Architecture, Path Boundaries & Bundle Hard Gates

- **Zero `useEffect` / `useLayoutEffect` in `.tsx` components**: Derive state in render, subscribe with `useSyncExternalStore`, or isolate imperative DOM / ECharts / Mermaid bindings inside `src/client/dom-hooks.ts` (enforced by Biome, `scripts/check-invariants.mjs`, and `tests/react-best-practices.spec.ts`).
- **Context-encoded directory boundaries** (enforced by `biome.json` overrides & `scripts/check-invariants.mjs`):
  - `src/client/shell/` + `src/client/index.ts` = cold-boot shell (`lib/client.js`). Must NEVER value-import `src/client/runtime/`, `src/client/catalog/`, `src/client/chunks/`, `@a2ui/*`, `echarts`, `mermaid`, `@tanstack/react-table`, or `zod`. (`react-aria-components` is banned repo-wide via `no-react-aria-components`, ADR-0009.)
  - `src/client/runtime/` = lazy runtime (`lib/client.runtime.js`). Must not import streaming parser, ECharts, or Mermaid directly; load them dynamically via `src/client/chunk-loader.ts` (`lib/client.streaming.js`, `lib/client.echarts.js`, `lib/client.mermaid.js`).
  - `src/shared/` (except `locale.ts`) & `src/client/catalog/*-helpers.ts` = pure deterministic modules. Must NEVER import React/ECharts/Mermaid or read `window`/`document`/`localStorage`.
- **Protocol boundary narrowing**: Parse/narrow external `AgentToRendererMessage` and untrusted payloads once at boundaries via shared type guards (`src/shared/a2ui-message.ts`, Zod schemas) instead of repeating `as unknown as Record<string, unknown>` casts across modules.
- **6-chunk raw + gzip bundle budget ratchet**: `.bundle-budget.json` gates all 6 build outputs (`lib/index.js`, `lib/client.js`, `lib/client.runtime.js`, `lib/client.streaming.js`, `lib/client.echarts.js`, `lib/client.mermaid.js`) on both raw and gzip bytes during `npm run build` and `npm run check:bundle`. Cold-boot `lib/client.js` must stay `< 100 kB` raw (ratcheted tightly below 85 kB raw / 24 kB gzip).
- **Issue → Structural Enforcement flywheel**: Fix recurring mistakes at the highest effective level — Architecture → Type system → Lint/CI (`scripts/check-invariants.mjs`) → Behavior test → Docs last. Whenever adding a lint rule, prove it fails on a real bad case in `tests/invariants-lint.spec.ts`.
- **TLA+ formal verification for concurrent state machines**: Changes to `src/host/ask-tool.ts`, `src/client/chunk-loader.ts`, `src/client/shell/turn-surfaces.ts`, `src/client/runtime/SurfaceView.tsx`, `src/client/runtime/streaming.ts`, or `src/client/dom-hooks.ts` must keep `specs/*.tla` in sync and pass `npm run verify:tla:strict` (load `.agents/skills/formal-verify/SKILL.md`).
- **Host-native Light DOM only**: No Shadow DOM, no `iframe`, no undocumented Electron IPC or private DOM selectors. Use `--dsw-*` tokens and official DSH slots/primitives (`npm run check:host-api` must pass locally).

### Rule-to-Enforcement Table

| Rule / Invariant | Automated Enforcer | CI / Local |
| --- | --- | --- |
| Zero `useEffect`/`useLayoutEffect` in `.tsx` | `biome.json` + `check-invariants.mjs` (`no-useeffect-outside-dom-hooks`) + `tests/react-best-practices.spec.ts` | CI + Local |
| Shell / Runtime / Pure boundary isolation | `biome.json` + `check-invariants.mjs` (`shell-runtime-boundary`, `pure-module-isolation`) | CI + Local |
| Zero `react-aria-components` in client bundles | `check-invariants.mjs` (`no-react-aria-components`) + `build/preset.ts` | CI + Local |
| Zero code comments (`totalLimit: 0`) | `scripts/check-no-comments.mjs` + `.comment-ratchet.json` | CI + Local |
| CSS `@container`, contrast, sticky, cascade, module keys | `check-invariants.mjs` (14 CSS rules) + `tests/invariants-lint.spec.ts` | CI + Local |
| Security sinks, redaction, ECharts richText/formatters | `check-invariants.mjs` (16 TS/security rules) + `tests/audit-fixes-*.spec.ts` | CI + Local |
| Locale key parity (`en` / `zh-CN`) | `check-invariants.mjs` (`locale-key-parity`) | CI + Local |
| 6-chunk raw + gzip bundle budgets | `scripts/check-bundle-budget.mjs` + `.bundle-budget.json` + `tests/bundle.spec.ts` | CI + Local |
| 4 concurrent state machines (TLA+ / TLC) | `npm run verify:tla:strict` (`scripts/verify-tla.mjs`) + `tests/formal-specs.spec.ts` | CI + Local |
| LLM prompt routing & 64-component compile KPI | `npm run eval:check` (`scripts/eval-llm.mjs` + `.eval-baseline.json`) | CI + Local |
| Official DSH host slots, primitives & tokens | `npm run check:host-api` (`scripts/check-host-api.mjs`) | Local (requires DSH app) |
| Live 306px/276px Dark+Light DOM geometry & pixels | `npm run qa:visual` (`scripts/visual-qa-bot.mjs`) + `npm run qa:e2e` + screenshot inspection | Local |
| ECharts visual label collisions / SLA precision / dual-theme | `tests/tier1-echarts.spec.ts` + `tests/v3-components.spec.ts` + live screenshot review | CI (unit) + Local (visual) |

## 2. Debugging & Verification Discipline

- **Attack the Premise**: If two fixes sharing the same assumption fail the same gate (visual QA, TLC, or E2E), stop immediately, write down the shared premise, and test it directly before writing a third fix.
- **Prove Blast Radius with Runnable Evidence**: For high-risk cross-module changes (streaming, compiler, overlay focus, CSS cascade), state the single core safety fact the change relies on and push verification down the ladder: assertion → `file:line` → trace → runnable test/script → live DSH repro.
- **Subagent Scope Discipline**: Delegated subagents work strictly to the requested bar without adding extra gates or scope creep; block only on real failures at the current HEAD and report unrelated base issues in one line.

## 3. 306px-First Component Layout Contract

DeepSeek Harness desktop chat column is ~`691px` wide; two-column card grids give each widget `~306px` and each chart canvas `~276px`. Design and test **306px first**, not full-width first.

- **Use `@container`, never `@media` alone**: Every independent card/widget in `src/client/catalog/Catalog.module.css` that adapts layout must declare `container-type: inline-size` and use `@container (max-width: ...)` breakpoints (typically `440px` / `390px` / `340px`). Viewport `@media (max-width: 640px)` never triggers on desktop `1360px` screens.
- **No vertical single-char button wrapping**: Toolbars and action bars (`.diffActions`, Mermaid zoom/mode bars, copy/export strips) must set `flex-wrap: wrap`; every button, segmented tab, pill, and badge inside must set `white-space: nowrap; flex-shrink: 0`.
- **Flex overflow guards**:
  - Text/code/URL flex children must set `min-width: 0` and wrap long unbroken tokens (`overflow-wrap: anywhere` or `word-break: break-word`), or sit inside an explicit horizontal scroll wrapper (`overflow-x: auto`) for wide tables.
  - Do not hardcode `width: '100%'` on flex children when `weight !== undefined` (e.g. `Image` inside `Row`).
- **Split panes at narrow widths**: Split-view components (such as `DiffView` split mode) must keep both panes visible inside `306px` using compact gutters and `white-space: pre-wrap; word-break: break-word` under `@container`.
- **Floating popovers / dropdowns**: Portal overlays (`Select`, `TreeSelect`, `DateRange`, `HoverCard`) must clamp horizontally and vertically so right-column triggers never clip past the chat column edge.

## 4. ECharts `276px` Compact Contract (`src/client/chunks/echarts-chunk.ts`)

- **Always wire `containerWidth`**: Every chart kind must adapt cleanly when `isCompact` (`containerWidth < 360`).
- **Axis & data label anti-collision**:
  - Long category/axis labels must wrap by pixel width or truncate with ellipsis (`overflow: 'truncate'` + `maxHBarLabelW` on horizontal bars, `interval: 0` + `\n` wrap on compact boxplots/radar, `overflow: 'break'` on treemap, topological stage width clamping + `labelLayout: { hideOverlap: true }` on sankey).
  - Compact numeric axes should reduce tick density (`splitNumber: 3` + `hideOverlap: true`) to prevent digit merging (e.g. `020406080`).
- **Reference line (`markLine`) avoidance**:
  - Cartesian horizontal markLines must use `pickMarkLinePosition(...)` to pick the less-crowded side (`insideStartTop` / `insideEndTop`) and respect `computeRefAxisBounds(...)` headroom.
  - Horizontal bar vertical markLines (`xAxis: value`) have `yAxis.inverse: true`, so use `position: 'start', rotate: 0` with `grid.top >= 26` to float the badge above the top bar without covering bottom X-axis ticks.
- **Legends, graphs, & contrast**:
  - Multi-series charts (`>= 4` series or `isCompact`) must use `legend.type = 'scroll'`.
  - Compact `graph` (`<= 10` nodes) should use deterministic `layout: 'circular'` with outer label margins instead of random force tangles.
  - Labels drawn on colored fills (`sunburst`, `funnel`, `sankey`) must carry theme-aware stroke halos so both Dark and Light modes maintain legible contrast.

## 5. Custom SVG Geometry & Dual-Theme Rules

- **Pure testable geometry helpers**: Keep SVG/ring/graph layout math in pure helper functions (e.g. `src/client/catalog/v3-helpers.ts`) with Vitest unit assertions for bounding-box collision and precision.
- **Numeric precision & long units**: Never blindly round high-SLA values (`99.9 < v < 100` must preserve decimal precision, e.g. `99.995%`); stack multi-character units onto a second line (`stackUnit`) inside compact rings/gauges.
- **Dual-theme parity**: Native browser pickers (`<input type="date">`, `<input type="time">`, `<input type="datetime-local">`) must set `colorScheme: dark ? 'dark' : 'light'` so native icons stay visible in Dark Mode.

## 6. Mandatory Verification Before Shipping

1. **Automated unit, invariant, formal & build gates** (all must pass with 0 errors/warnings):
   ```bash
   npm run format && npm run lint && npm run typecheck && npm run build && npm run check:bundle && npm test && npm run eval:check && npm run check:host-api && npm run verify:tla:strict
   ```
2. **Add narrow-width & deterministic replay regression tests**: Any new chart kind or geometric helper must add `containerWidth = 276` / `240` assertions in `tests/tier1-echarts.spec.ts`, `tests/v3-components.spec.ts`, or `tests/deterministic-replay-fuzz.spec.ts`.
3. **Live DSH Visual QA (for any UI / CSS / chart change)**: Run `npm run qa:visual` (headless Chrome CDP geometry audit across Dark & Light modes at `1360×900`, or `npm run qa:visual -- --screenshots` to refresh `screenshots.json`) and `npm run qa:e2e`, and visually inspect key screenshots in real DeepSeek Harness Web (`node scripts/dev-env.mjs serve`). Load the `dsh-a2ui-visual-qa` skill for the exact runbook and DOM geometry audit checklist.
