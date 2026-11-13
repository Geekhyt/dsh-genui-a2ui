# Changelog

All notable changes to `dsh-genui-a2ui` are documented in this file.

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
  - 4-chunk client code-splitting via `window.__ModuleLoader__`: `45.9 kB` (`12.6 kB` gzip) cold-boot `lib/client.js`, loading `client.runtime.js`, `client.echarts.js`, and `client.mermaid.js` strictly on demand.
- **23 Client-Side Reactive & Validation Functions**:
  - `0ms` statically validated `calc(expr, vars, decimals)` algebraic evaluator, `cond`, `eq`, `gt`, `lt`, `includes`, `sum`, `avg`, `copyText`, and 14 A2UI 1.0 standard formatting & validation functions.
