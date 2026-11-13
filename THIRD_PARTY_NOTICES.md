# Third-Party Notices

`dsh-genui-a2ui` distributes self-contained Host and Client bundles (`lib/*.js`) so end users can install the plugin with zero runtime npm dependency trees. Those bundles incorporate portions of the following permissive open-source packages:

| Package | License | Role in `dsh-genui-a2ui` |
| :--- | :--- | :--- |
| `@a2ui/agent`, `@a2ui/react`, `@a2ui/web_core` | Apache-2.0 | Google A2UI 1.0 Express compiler, state processor, and React surface binding |
| `echarts` | Apache-2.0 | Lazy-loaded (`lib/client.echarts.js`) 14-kind canvas/SVG chart engine |
| `mermaid` | MIT | Lazy-loaded (`lib/client.mermaid.js`) strict-sandbox diagram renderer |
| `@tanstack/react-table` | MIT | Headless sorting, filtering, and pagination state for `Table` |
| `react-aria-components` | Apache-2.0 | Accessible headless UI primitives for interactive controls |
| `zod` | MIT | Isomorphic schema validation across Host and Client catalogs |

All listed packages are licensed under MIT or Apache License 2.0. Their respective copyright notices and license terms remain with their authors.
