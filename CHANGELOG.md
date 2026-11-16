# Changelog

All notable changes to `dsh-genui-a2ui` are documented in this file.

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
