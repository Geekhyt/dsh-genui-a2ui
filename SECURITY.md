# 安全策略 / Security Policy

## 支持版本 / Supported Versions

| Version | Supported |
| :--- | :--- |
| `0.1.x` | Yes |

## 安全边界设计 / Security Model

`dsh-genui-a2ui` 在协议层与实现层内置多层安全隔离，确保大模型输出不会导致任意代码执行或敏感数据泄漏：

1. **纯数据声明（Data, Not Code）**：遵循 Google A2UI 1.0 规范，前后端之间仅传输结构化 JSON 消息，不渲染模型生成的原始 HTML，不挂载外部 `iframe`，也不执行 `eval` 或 `new Function`。
2. **同构白名单校验（`dshSchemaCatalog`）**：仅允许实例化通过 Zod 严格校验的 32 种受控组件与 23 个客户端函数，未知组件名与非法参数会在编译期与渲染期双重拦截。
3. **资源上限与公式静态审计（`A2UI_LIMITS`）**：单次调用限制字符数（`64,000`）、Surface 数量（`8`）、单 Surface 节点数（`250`）与数据模型体积（`256 KB`）；`calc()` 采用自定义递归下降解析器并限制最大 AST 深度（`36`）与节点数（`128`）。
4. **URL 协议白名单与 Mermaid 严格沙箱**：`Image`、`AudioPlayer`、`Video` 与 `openUrl` 严格过滤 `javascript:`、`vbscript:`、`file:` 等危险协议；`DshMarkdown` 强制开启 `omitHtml` 拦截内联原始 HTML；`Mermaid` 强制运行于 `securityLevel: "strict"` 并通过 `DOMPurify` 与 `assertSafeSvg` 进行双重节点及属性净化。注：`Image`、`AudioPlayer` 与 `Video` 允许标准 `https://` 媒体资源（受宿主 Electron / Web CSP 策略约束），在处理不可信外部文本（间接提示词注入场景）时需注意模型引用外部 `https://` 媒体 URL 可能触发的出站图片/音视频请求边界。
5. **敏感字段过滤**：本地表单草稿缓存与回传快照会自动剔除匹配密码、密钥、Token 等敏感命名模式的字段。

## 已知上游依赖说明 / Upstream Advisory Notes

当前 Google 官方 `@a2ui/web_core@0.15.0` 与 `@a2ui/react@0.15.0` 仍绑定 `zod` v3 分支（`^3.25.76`），运行 `npm audit` 会显示针对 `zod < 4.6.6` 超大受限集合内存占用的上游通告（`GHSA-mrhx-c7xc-m3w5`）。`dsh-genui-a2ui` 已在进入 Schema 校验前通过 `A2UI_LIMITS` 强制拦截超长源码（上限 `64,000` 字符）、超多组件树（单 Surface 上限 `250` 节点）与超大初始数据模型（上限 `256 KB`），实际运行不受该上游问题影响；待 `@a2ui` 官方包迁移至 `zod` v4 后将第一时间同步升级。

## 报告安全漏洞 / Reporting a Vulnerability

请勿在公开 Issue 中披露未修复的安全漏洞。请直接通过 GitHub 私密安全通告提交报告：

https://github.com/Geekhyt/dsh-genui-a2ui/security/advisories/new

请在报告中附上复现最小 A2UI Express 片段、DeepSeek Harness 版本与操作系统信息。我们会在收到报告后尽快确认并推进修复。
