# Third-Party Notices

`dsh-genui-a2ui` distributes self-contained Host and Client bundles (`lib/*.js`) so end users can install the plugin with zero runtime npm dependency trees. Those bundles incorporate portions of the following permissive open-source packages:

| Package(s) | License | Role in `dsh-genui-a2ui` |
| :--- | :--- | :--- |
| `@a2ui/agent`, `@a2ui/react`, `@a2ui/web_core`, `@a2ui/markdown-it` | Apache-2.0 | Google A2UI 1.0 Express compiler, state processor, and React surface binding |
| `echarts` | Apache-2.0 | Lazy-loaded (`lib/client.echarts.js`) 14-kind canvas/SVG chart engine |
| `zrender` | BSD-3-Clause | 2D vector and canvas rendering engine underlying ECharts |
| `react-aria-components`, `react-aria`, `react-stately`, `@internationalized/*` | Apache-2.0 | Accessible headless UI primitives for interactive form controls |
| `@tanstack/react-table`, `@tanstack/table-core` | MIT | Headless sorting, filtering, and pagination state for `Table` |
| `mermaid`, `@mermaid-js/parser`, `dagre-d3-es`, `cytoscape*`, `roughjs`, `khroma` | MIT | Lazy-loaded (`lib/client.mermaid.js`) strict-sandbox diagram layout and rendering |
| `katex` | MIT | Math typesetting support inside Mermaid diagrams |
| `d3`, `d3-*` (`d3-array`, `d3-scale`, `d3-shape`, `d3-selection`, etc.) | ISC / BSD-3-Clause | Graph geometry, scales, and Sankey layout utilities used by Mermaid |
| `dompurify` | MPL-2.0 OR Apache-2.0 | HTML and SVG sanitization (used under Apache-2.0) |
| `lit`, `lit-html`, `lit-element`, `@lit/*`, `antlr4ng` | BSD-3-Clause | Reactive internals and grammar parser runtime used by `@a2ui/*` |
| `markdown-it`, `marked`, `dayjs`, `lodash-es`, `uuid`, `clsx`, `zod` | MIT | Markdown parsing, date utilities, UUID generation, and isomorphic schema validation |
| `zod-to-json-schema` | ISC | Tool parameter JSON Schema generation on the Host |
| `entities`, `regjsparser` | BSD-2-Clause | HTML entity decoding and regular expression AST checks |
| `tslib` | 0BSD | TypeScript runtime helpers |

All bundled runtime dependencies are distributed under permissive open-source licenses (`MIT`, `Apache-2.0`, `BSD-3-Clause`, `BSD-2-Clause`, `ISC`, `0BSD`, and dual-licensed `MPL-2.0 OR Apache-2.0` elected under `Apache-2.0`). Their respective copyright notices and license terms remain with their original authors.

## Required Apache-2.0 Attribution Notices

### Apache ECharts (`echarts`)

```text
Apache ECharts
Copyright 2017-2026 The Apache Software Foundation

This product includes software developed at
The Apache Software Foundation (https://www.apache.org/).
```

### Google A2UI (`@a2ui/agent`, `@a2ui/react`, `@a2ui/web_core`, `@a2ui/markdown-it`)

```text
Copyright 2024-2026 Google LLC
Licensed under the Apache License, Version 2.0 (https://www.apache.org/licenses/LICENSE-2.0).
```

### Adobe React Spectrum / React Aria (`react-aria-components`, `react-aria`, `react-stately`, `@internationalized/*`)

```text
Copyright 2020-2026 Adobe. All rights reserved.
Licensed under the Apache License, Version 2.0 (https://www.apache.org/licenses/LICENSE-2.0).
```
