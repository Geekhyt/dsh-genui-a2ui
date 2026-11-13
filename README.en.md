# dsh-genui-a2ui

[简体中文](./README.md) | **English** | [Offline component handbook](./docs/dsh-genui-a2ui-component-library.html) | [Developer and architecture guide](./docs/DEVELOPMENT.md)

[![CI](https://github.com/Geekhyt/dsh-genui-a2ui/actions/workflows/ci.yml/badge.svg)](https://github.com/Geekhyt/dsh-genui-a2ui/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE) [![Protocol: A2UI 1.0](https://img.shields.io/badge/Protocol-A2UI%201.0-10b981.svg)](https://github.com/google/A2UI) [![DSH: >= 0.2.0](https://img.shields.io/badge/DeepSeek%20Harness-%3E%3D%200.2.0-4f46e5.svg)](./package.json)

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
<summary><strong>Click to expand 6 ready-to-run example prompts</strong></summary>

1. **Executive conversion and health dashboard**: `Build a quarterly growth and conversion diagnostic dashboard with four KPI cards with sparklines on top, a four-stage Sankey flow paired with a five-axis health radar chart side by side, plus tabs for regional growth bars and a searchable channel ROI table.`
2. **Live multi-store operations dashboard**: `Create a live chain coffee store operations dashboard showing daily revenue, total orders, peak fulfillment rate, and stock alerts, paired with hourly channel area curves, a store-by-hour order heatmap, and a searchable inventory warning table.`
3. **Zero-latency cost and margin simulator**: `Build an interactive AI inference cost and margin calculator where I can drag sliders for daily active users, cost per call, and cache hit rate, switch pricing tiers, and see monthly spend, gross margin, and a cost breakdown bar chart update live.`
4. **Code diff approval gate**: `Suppose you are updating our production gateway canary weight from 5% to 20% and adding a circuit-breaker timeout. Pause with a review card showing the split config diff, target cluster selector, and auto-rollback checkbox for my confirmation before proceeding.`
5. **Workspace architecture diagram and source explorer**: `Analyze the architecture of this workspace, render a layered Mermaid diagram alongside a clickable file tree and config JSON inspector so I can open any file directly in the right sidebar.`
6. **Persistent bottom task tracker**: `Pin a five-stage release verification tracker above the chat input showing step status and overall completion percentage across typecheck, bundle build, host API check, test suite, and tarball audit.`

</details>

## See it in action

### Diagnose multi-stage conversion flows and health scores

Equal-height KPI cards with sparklines pair with a four-stage Sankey flow and a five-axis radar chart in one view. Switch tabs to inspect regional revenue bars or filter channel ROI rows.

![Full-funnel conversion flow and radar diagnostic dashboard](assets/screenshots/hero-executive-dashboard.png)

### Monitor live store operations and stock alerts

Track daily chain revenue, order volume, and peak-hour fulfillment in real time. Combine stacked channel area curves, store-by-hour order heatmaps, and searchable inventory warning tables on one screen.

![Multi-store live operations and inventory dashboard](assets/screenshots/store-operations-dashboard.png)

### Model costs and returns with live sliders

Drag sliders or switch tiers to test budget, rate, or traffic assumptions right in chat. Totals, margins, and charts recalculate locally in 0 ms without spending extra tokens.

![Live parameter calculator with sliders and bar chart](assets/screenshots/zero-latency-simulator.png)

### Review diffs before approving critical actions

Pause high-impact changes with a review card above the chat input. Inspect the split code diff, select a rollout scope, and confirm before execution continues.

![Split code diff and approval gate](assets/screenshots/human-in-the-loop-ask.png)

### Map layered system architecture to live source files

Render multi-layer Mermaid architecture diagrams alongside a workspace file tree and JSON inspector. Click any file node to open that exact line inside the right sidebar.

![Layered architecture diagram linked to right sidebar source view](assets/screenshots/codebase-explorer-sidebar.png)

### Pin live task progress above the chat input

Keep multi-stage pipelines anchored at the bottom of the window. Stages and completion rates update in place while you scroll through earlier messages.

![Persistent multi-stage task progress dock](assets/screenshots/persistent-dock-pipeline.png)

## Why A2UI

- **Safe by design**: Built on Google's A2UI 1.0 specification, models output declarative JSON only and never execute untrusted HTML or scripts.
- **Native look and feel**: Every surface renders with DeepSeek Harness UI primitives, adapting automatically to light mode, dark mode, and community themes.
- **Zero host patches, fast startup**: Built on official plugin APIs with a 12.6 KB gzipped core; chart and diagram engines load only on demand.

## Component catalog

Includes 32 native UI components, 14 interactive chart types, and full Mermaid diagram support:

| Category | Components | Purpose |
| :--- | :--- | :--- |
| **Layout containers** | `Card`, `Row`, `Column`, `Tabs`, `Accordion`, `List`, `Modal`, `Divider` | Multi-column dashboards, tabbed views, collapsible panels, and modal details |
| **Metrics and status** | `Stat`, `KeyValue`, `Steps`, `Progress` | KPI cards with deltas and sparklines, spec grids, step timelines, and progress bars |
| **Charts and tables** | `Chart`, `Mermaid`, `Table` | 14 interactive chart types, architecture diagrams, and searchable, sortable, paginated tables |
| **Code and workspace** | `Code`, `DiffView`, `FileTree`, `JsonTree` | Highlighted code, unified or split diffs, clickable workspace file trees, and JSON inspectors |
| **Form controls** | `Button`, `Slider`, `ChoicePicker`, `TextField`, `CheckBox`, `DateTimeInput` | Sliders, single or multi-select chips, validated inputs, date pickers, and action buttons |
| **Typography and alerts** | `Text`, `Callout`, `Badge`, `Icon` | Rich text, color-coded callouts, status badges, and semantic icons |
| **Media** | `Image`, `AudioPlayer`, `Video` | Inline image previews, audio players, and video playback |

- **14 interactive charts (`Chart`)**: Vertical and horizontal ranking bars (`bar`), `line`, `area`, donut and pie (`pie`), bubble and `scatter`, `radar`, `funnel`, `gauge`, `heatmap`, `treemap`, `sankey`, `boxplot`, network (`graph`), and `candlestick`.
- **Architecture and flow diagrams (`Mermaid`)**: Flowcharts, sequence diagrams, state machines, class diagrams, ER diagrams, Gantt charts, Git graphs, and mindmaps with zoom, fullscreen view, and source toggle.

## Documentation and license

- [Developer and architecture guide (English)](./docs/DEVELOPMENT.md) | [开发与架构文档（简体中文）](./docs/DEVELOPMENT.zh-CN.md)
- [Interactive component handbook (offline single-file HTML, download and open in browser)](./docs/dsh-genui-a2ui-component-library.html)
- [Contributing guide](./CONTRIBUTING.md) | [Code of conduct](./CODE_OF_CONDUCT.md) | [Security policy](./SECURITY.md) | [Changelog](./CHANGELOG.md)
- Released under the [MIT License](./LICENSE). See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for third-party open-source notices.
