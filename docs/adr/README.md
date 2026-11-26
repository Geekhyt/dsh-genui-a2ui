# 架构决策记录（ADR）

本目录集中记录 `dsh-genui-a2ui` 项目中所有重要且非显而易见的架构、安全、打包、React 范式与窄容器布局决策。

本仓库通过 `npm run check:comments` 与 `.comment-ratchet.json` 实施单调收紧的禁注释 Lint 门禁。凡是无法直接从命名、类型或代码结构看出来的“为什么这样设计”的决策，一律沉淀为本目录下的 ADR，而不再散落于代码注释中。

## 索引

| 编号 | 标题 | 状态 |
| --- | --- | --- |
| [ADR-0001](./ADR-0001-four-chunk-bundle-and-private-zod.md) | 四分包按需加载隔离与私有 Zod v3 打包策略 | 已采纳 |
| [ADR-0002](./ADR-0002-zero-useeffect-react-architecture.md) | 零 `useEffect` React 架构与 `dom-hooks.ts` 命令式边界 | 已采纳 |
| [ADR-0003](./ADR-0003-host-native-light-dom-and-slots.md) | 宿主原生 Light DOM、官方 DSH 插槽、可逆样式生命周期与防御性原语适配 | 已采纳 |
| [ADR-0004](./ADR-0004-tool-channel-compiler-and-hydration.md) | 工具通道 A2UI Express 编译、事务回滚、跨重启水合与 KV-Cache 提示词落位 | 已采纳 |
| [ADR-0005](./ADR-0005-p0-skill-compaction-and-express-lowering.md) | P0 四域 Skill 压缩、引号安全 Express 降糖与同构 `calc()` 引擎 | 已采纳 |
| [ADR-0006](./ADR-0006-security-boundaries-and-sanitization.md) | 安全边界：Mermaid 严格净化、`openUrl` 手势门禁、凭据脱敏与 CSV 防注入 | 已采纳 |
| [ADR-0007](./ADR-0007-narrow-container-layout-and-echarts-collision.md) | 306px/276px 窄容器适配、ECharts 防碰撞与 0ms 跨组件联动匹配 | 已采纳 |
| [ADR-0008](./ADR-0008-formal-verification-and-invariants.md) | TLA+ 并发状态机形式化验证、路径语义分层、12 条静态不变量门禁与 5 分片包体棘轮 | 已采纳 |
| [ADR-0009](./ADR-0009-modular-chunks-streaming-perf-and-catalog-convergence.md) | 六分片流式编译器隔离、去 React Aria 化、Mermaid 死代码裁剪与单组件错误隔离 | 已采纳 |

## 关联追踪

- [借口注释整改 Issue 清单](./excuse-issues.md) — 审计过程中发现的静默吞错、类型规避与桥接绕过实现及其修复追踪。
