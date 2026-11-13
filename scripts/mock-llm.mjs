#!/usr/bin/env node
/**
 * Scripted OpenAI-compatible SSE mock LLM server for M0, M1, & M2 verification.
 *
 * - Answers title-generation calls (or when A2UI tier is `off` so `a2ui_render`
 *   is omitted from `tools`) with pure text.
 * - Streams tool-call argument JSON in configurable small chunks so progressive
 *   60fps rendering in `tool.call.toolview` can be observed.
 * - Scenarios:
 *   1. Default (`"预订"` / normal message): `BOOKING_UI` + `[a2ui-action]` -> `UPDATE_UI`
 *      (verifies `[a2ui-action]` user bubble chip + Turn 1 `superseded` read-only card).
 *   2. `"dashboard"` / `"看板"`: `DASHBOARD_UI` + `[a2ui-action]` -> `ANALYTICS_UPDATE_UI`.
 *   3. `"ask"` / `"向导"` / `"部署"`: `a2ui_ask` (`DEPLOY_ASK_UI`) blocking inside the
 *      same turn -> resolves with `{ status, action, context }` -> replies in-turn!
 *   4. `"dock"` / `"工作台"` / `"监控"`: `a2ui_render` (`placement: "dock"`, `DOCK_MONITOR_UI`)
 *      pinned above the composer + `[a2ui-action]` (`surface="pipeline"`) -> `DOCK_MONITOR_UPDATE_UI`.
 *   5. `"inline"` / `"内嵌"`: `a2ui_render` (`placement: "inline"`, `INLINE_SUMMARY_UI`).
 *   6. `"test-error"`: `BROKEN_UI` -> compiler rejection -> `HEALED_UI`.
 */
import { createServer } from 'node:http'

const PORT = Number(process.env.MOCK_LLM_PORT ?? 18991)
const CHUNK_SIZE = Number(process.env.MOCK_CHUNK_SIZE ?? 18)
const CHUNK_DELAY_MS = Number(process.env.MOCK_CHUNK_DELAY_MS ?? 16)

export const BOOKING_UI = [
  'surface("booking")',
  '$/form/name = "张伟"',
  '$/form/guests = 4',
  '$/form/vip = false',
  '$/form/taste = ["less_oil"]',
  '$/status = "待确认"',
  'root = Card(Column([',
  '  Text("### 餐厅预订确认\\n请核对预订信息并提交（示例数据）："),',
  '  TextField(label="预订人姓名", value=$/form/name),',
  '  Slider(label="用餐人数", value=$/form/guests, min=1, max=12),',
  '  ChoicePicker(label="口味偏好", options=[{label: "少油少盐", value: "less_oil"}, {label: "微辣", value: "mild_spicy"}, {label: "不要香菜", value: "no_cilantro"}], value=$/form/taste, displayStyle="chips"),',
  '  CheckBox(label="需要包间（VIP）", value=$/form/vip),',
  '  Text($/status, variant="caption"),',
  '  Button(Text("确认预订"), variant="primary", action=Event("confirm_booking", {name: $/form/name, guests: $/form/guests, vip: $/form/vip, taste: $/form/taste}, userMessage="确认餐厅预订"))',
  ']))',
].join('\n')

export const UPDATE_UI = [
  'surface("booking", update=true)',
  '$/status = "✅ 已确认预订！包间与座位已锁定（示例状态）"',
].join('\n')

export const DASHBOARD_UI = [
  'surface("analytics")',
  '$/sales = [',
  '  { region: "华东大区", owner: "陈默", q1: 1280, q2: 1520, growth: "+18.8%" },',
  '  { region: "华北大区", owner: "林岚", q1: 960, q2: 1140, growth: "+18.7%" },',
  '  { region: "华南大区", owner: "周航", q1: 1110, q2: 1360, growth: "+22.5%" },',
  '  { region: "西南大区", owner: "苏瑾", q1: 620, q2: 740, growth: "+19.4%" },',
  '  { region: "海外业务", owner: "Alex", q1: 480, q2: 690, growth: "+43.8%" }',
  ']',
  '$/pct = 78',
  '$/progressLabel = "年度营收目标达成进度（示例数据）"',
  '$/q2Total = "¥ 5,450 万"',
  'root = Card(Column([',
  '  Row([',
  '    Text("### 2026 区域经营看板"),',
  '    Badge("示例数据", tone="info")',
  '  ], justify="spaceBetween"),',
  '  Row([',
  '    Stat("Q1 实收总计", "¥ 4,450 万", delta="+16.4%", trend="up", caption="已完成归档", weight=1),',
  '    Stat("Q2 预测营收", $/q2Total, delta="+22.5%", trend="up", caption="漏斗加权预测", weight=1),',
  '    Stat("续费流失率", "2.1%", delta="-0.4%", trend="neutral", caption="优于安全线", weight=1)',
  '  ]),',
  '  Progress($/pct, label=$/progressLabel, tone="success"),',
  '  Tabs([',
  '    { title: "趋势图表", child: Chart("bar", $/sales, xField="region", yField=["q1", "q2"], title="各区域 Q1 实收 vs Q2 预测（万元）", height=250) },',
  '    { title: "明细表格", child: Table($/sales, searchable=true, pageSize=4, title="区域销售明细", columns=[{key: "region", label: "区域"}, {key: "owner", label: "负责人"}, {key: "q1", label: "Q1 实收"}, {key: "q2", label: "Q2 预测"}, {key: "growth", label: "环比增长"}]) },',
  '    { title: "查询 SQL", child: Code("SELECT region, owner, q1, q2\\nFROM regional_sales_2026\\nORDER BY q2 DESC;", language="sql", lineNumbers=true) }',
  '  ]),',
  '  Divider(),',
  '  Row([',
  '    Modal(trigger=Button(Text("查看统计口径"), variant="borderless", action=Event("open_spec")), content=Column([Text("### 统计口径说明（示例）\\n- **Q1 实收**：财务已确认回款金额\\n- **Q2 预测**：签约概率 >= 60% 的商机加权汇总"), Badge("口径版本 v2.1", tone="success")])),',
  '    Button(Text("上调 Q2 预测 (+10%)"), variant="primary", action=Event("boost_q2", { pct: $/pct }, userMessage="上调 Q2 预测 (+10%)"))',
  '  ], justify="spaceBetween")',
  ']))',
].join('\n')

export const ANALYTICS_UPDATE_UI = [
  'surface("analytics", update=true)',
  '$/pct = 89',
  '$/progressLabel = "✅ 年度目标达成进度（已应用 +10% 乐观情景）"',
  '$/q2Total = "¥ 5,995 万"',
  '$/sales = [',
  '  { region: "华东大区", owner: "陈默", q1: 1280, q2: 1672, growth: "+30.6%" },',
  '  { region: "华北大区", owner: "林岚", q1: 960, q2: 1254, growth: "+30.6%" },',
  '  { region: "华南大区", owner: "周航", q1: 1110, q2: 1496, growth: "+34.8%" },',
  '  { region: "西南大区", owner: "苏瑾", q1: 620, q2: 814, growth: "+31.3%" },',
  '  { region: "海外业务", owner: "Alex", q1: 480, q2: 759, growth: "+58.1%" }',
  ']',
].join('\n')

export const DEPLOY_ASK_UI = [
  'surface("deploy_wizard")',
  '$/cfg/env = ["canary"]',
  '$/cfg/replicas = 4',
  '$/cfg/autoRollback = true',
  '$/cfg/note = "v2.4.0 灰度发布（示例）"',
  'root = Card(Column([',
  '  Text("### 发布环境与实例规格确认\\n请在当前回合直接确认发布参数（示例数据）："),',
  '  ChoicePicker(label="目标环境", options=[{label: "预发 Staging", value: "staging"}, {label: "生产灰度 Canary", value: "canary"}, {label: "全量生产 Prod", value: "prod"}], value=$/cfg/env, variant="mutuallyExclusive", displayStyle="chips"),',
  '  Slider(label="并发实例数（Pods）", value=$/cfg/replicas, min=1, max=10),',
  '  TextField(label="变更备注", value=$/cfg/note),',
  '  CheckBox(label="异常时自动回滚（Auto Rollback）", value=$/cfg/autoRollback),',
  '  Button(Text("确认并生成发布计划"), variant="primary", action=Event("confirm_deploy", { env: $/cfg/env, replicas: $/cfg/replicas, autoRollback: $/cfg/autoRollback, note: $/cfg/note }, userMessage="确认发布参数"))',
  ']))',
].join('\n')

export const DOCK_MONITOR_UI = [
  'surface("pipeline")',
  '$/stage = "灰度验证中 (Canary 25%)"',
  '$/pct = 45',
  '$/qps = "12,480 req/s"',
  'root = Column([',
  '  Row([',
  '    Stat("当前阶段", $/stage, caption="示例流水线", weight=1),',
  '    Stat("实时吞吐", $/qps, delta="+8.2%", trend="up", weight=1),',
  '    Stat("错误率", "0.01%", trend="neutral", caption="SLA 正常", weight=1)',
  '  ]),',
  '  Progress($/pct, label="发布推进总进度（示例）", tone="brand"),',
  '  Row([',
  '    Badge("流水线在线", tone="success"),',
  '    Button(Text("推进至全量 (100%)"), variant="primary", action=Event("advance_pipeline", { stage: $/stage }, userMessage="推进流水线至全量"))',
  '  ], justify="spaceBetween")',
  '])',
].join('\n')

export const DOCK_MONITOR_UPDATE_UI = [
  'surface("pipeline", update=true)',
  '$/stage = "✅ 全量运行中 (Prod 100%)"',
  '$/pct = 100',
  '$/qps = "48,920 req/s"',
].join('\n')

export const INLINE_SUMMARY_UI = [
  'surface("step_diag")',
  'root = Row([',
  '  Stat("扫描文件数", "42", caption="示例诊断", weight=1),',
  '  Stat("发现风险项", "0", trend="up", caption="全部通过", weight=1)',
  '])',
].join('\n')

const BROKEN_UI = 'surface("err_demo")\nroot = Card(UnknownFancyChart(data=[1, 2, 3]))'

const HEALED_UI = [
  'surface("err_demo")',
  '$/note = "✅ 编译器诊断自愈成功：已将未知组件 UnknownFancyChart 修正为标准组件"',
  'root = Card(Column([',
  '  Text("### 自愈恢复卡片"),',
  '  Text($/note, variant="caption")',
  ']))',
].join('\n')

export const SHOWCASE_EXECUTIVE_UI = [
  'surface("q3_exec_cockpit")',
  '$/flow = [',
  '  { source: "开源社区口碑", target: "安装并完成首聊", value: 34 },',
  '  { source: "开源社区口碑", target: "运行交互模板", value: 18 },',
  '  { source: "插件市场精选", target: "安装并完成首聊", value: 28 },',
  '  { source: "插件市场精选", target: "运行交互模板", value: 18 },',
  '  { source: "深度评测内容", target: "运行交互模板", value: 20 },',
  '  { source: "深度评测内容", target: "接入团队空间", value: 12 },',
  '  { source: "企业客户内推", target: "接入团队空间", value: 24 },',
  '  { source: "安装并完成首聊", target: "高频深度工作流", value: 36 },',
  '  { source: "安装并完成首聊", target: "轻度日常问答", value: 26 },',
  '  { source: "运行交互模板", target: "高频深度工作流", value: 34 },',
  '  { source: "运行交互模板", target: "多成员协同评审", value: 22 },',
  '  { source: "接入团队空间", target: "多成员协同评审", value: 30 },',
  '  { source: "接入团队空间", target: "高频深度工作流", value: 6 },',
  '  { source: "高频深度工作流", target: "专业版长期订阅", value: 44 },',
  '  { source: "高频深度工作流", target: "企业年度增购", value: 22 },',
  '  { source: "高频深度工作流", target: "免费活跃留存", value: 10 },',
  '  { source: "多成员协同评审", target: "企业年度增购", value: 38 },',
  '  { source: "多成员协同评审", target: "专业版长期订阅", value: 14 },',
  '  { source: "轻度日常问答", target: "免费活跃留存", value: 20 },',
  '  { source: "轻度日常问答", target: "专业版长期订阅", value: 6 }',
  ']',
  '$/health = [',
  '  { metric: "获客效率", "Q3 实绩": 91, "Q2 基准": 72 },',
  '  { metric: "首周激活", "Q3 实绩": 86, "Q2 基准": 68 },',
  '  { metric: "交互深度", "Q3 实绩": 94, "Q2 基准": 64 },',
  '  { metric: "席位扩展", "Q3 实绩": 88, "Q2 基准": 74 },',
  '  { metric: "推理毛利", "Q3 实绩": 89, "Q2 基准": 70 }',
  ']',
  '$/regions = [',
  '  { region: "华东研发集群", q2: 1420, q3: 1860 },',
  '  { region: "华北政企集群", q2: 1180, q3: 1540 },',
  '  { region: "华南出海集群", q2: 1090, q3: 1620 },',
  '  { region: "海外 SaaS 区", q2: 760, q3: 1820 }',
  ']',
  '$/channels = [',
  '  { channel: "GitHub 开源生态", cac: "¥ 38", conv: "11.2%", nrr: "126%", status: "核心引擎" },',
  '  { channel: "DSH 插件市场精选", cac: "¥ 24", conv: "14.8%", nrr: "121%", status: "高速放量" },',
  '  { channel: "技术博客深度评测", cac: "¥ 65", conv: "8.6%", nrr: "115%", status: "稳健增长" },',
  '  { channel: "传统搜索展示投放", cac: "¥ 310", conv: "2.1%", nrr: "94%", status: "建议缩减" }',
  ']',
  'kpis = Row([',
  '  Stat("季度 ARR 净增", "¥ 6,840 万", delta="+24.6%", trend="up", spark=[410, 445, 438, 512, 560, 618, 684], caption="连续 6 周环比正增长", weight=1),',
  '  Stat("全链路激活转化", "11.8%", delta="+2.4%", trend="up", spark=[7.8, 8.2, 8.9, 9.5, 10.4, 11.1, 11.8], caption="自助交互引导生效", weight=1),',
  '  Stat("企业客户 NRR", "121.5%", delta="+4.2%", trend="up", spark=[112, 114, 115, 117, 118, 120, 121.5], caption="团队席位扩展强劲", weight=1),',
  '  Stat("单次会话推理成本", "¥ 0.14", delta="-31.0%", trend="up", spark=[0.24, 0.22, 0.20, 0.18, 0.16, 0.15, 0.14], caption="Prompt 缓存命中 76%", weight=1)',
  '], align="stretch")',
  'overviewPane = Row([',
  '  Chart("sankey", $/flow, xField="source", seriesField="target", yField="value", title="四阶全链路转化流向（获客 -> 激活 -> 协同 -> 变现）", height=275, weight=16),',
  '  Chart("radar", $/health, xField="metric", yField=["Q3 实绩", "Q2 基准"], title="增长质量五维健康度对比", height=275, weight=10)',
  '], align="stretch")',
  'mainTabs = Tabs([',
  '  { title: "全链路流向与健康度", child: overviewPane },',
  '  { title: "区域增长对比 (Bar)", child: Chart("bar", $/regions, xField="region", yField=["q2", "q3"], title="各业务集群 Q2 vs Q3 实收对比（万元·示例）", height=260) },',
  '  { title: "获客渠道 ROI 表", child: Table($/channels, searchable=true, pageSize=4, title="各渠道获客成本与留存明细") }',
  '])',
  'root = Card(Column([',
  '  Row([Text("### 2026 Q3 业务增长与全链路转化诊断大盘"), Badge("A2UI 1.0 · 示例数据", tone="info")], justify="spaceBetween", align="center"),',
  '  kpis,',
  '  mainTabs,',
  '  Callout("核心诊断结论", "插件市场与开源社区贡献了 78% 的高留存转化，多成员协同评审路径的企业增购率达 73%，建议缩减低效展示广告。", tone="success")',
  ']))',
].join('\n')

export const SHOWCASE_STORE_OPS_UI = [
  'surface("store_ops")',
  '$/hourly = [',
  '  { hour: "08:00", "堂食": 6.2, "小程序自提": 9.8, "外卖配送": 5.4 },',
  '  { hour: "10:00", "堂食": 8.5, "小程序自提": 11.2, "外卖配送": 7.6 },',
  '  { hour: "12:00", "堂食": 16.4, "小程序自提": 18.6, "外卖配送": 14.8 },',
  '  { hour: "14:00", "堂食": 13.8, "小程序自提": 12.4, "外卖配送": 11.2 },',
  '  { hour: "16:00", "堂食": 14.6, "小程序自提": 13.9, "外卖配送": 12.5 },',
  '  { hour: "18:00", "堂食": 12.1, "小程序自提": 9.4, "外卖配送": 10.6 }',
  ']',
  '$/rush = [',
  '  { hour: "08:00", store: "国贸旗舰店", orders: 142 }, { hour: "10:00", store: "国贸旗舰店", orders: 168 }, { hour: "12:00", store: "国贸旗舰店", orders: 264 }, { hour: "14:00", store: "国贸旗舰店", orders: 186 }, { hour: "16:00", store: "国贸旗舰店", orders: 195 }, { hour: "18:00", store: "国贸旗舰店", orders: 152 },',
  '  { hour: "08:00", store: "静安寺店", orders: 128 }, { hour: "10:00", store: "静安寺店", orders: 145 }, { hour: "12:00", store: "静安寺店", orders: 228 }, { hour: "14:00", store: "静安寺店", orders: 174 }, { hour: "16:00", store: "静安寺店", orders: 182 }, { hour: "18:00", store: "静安寺店", orders: 160 },',
  '  { hour: "08:00", store: "科技园店", orders: 156 }, { hour: "10:00", store: "科技园店", orders: 172 }, { hour: "12:00", store: "科技园店", orders: 248 }, { hour: "14:00", store: "科技园店", orders: 162 }, { hour: "16:00", store: "科技园店", orders: 178 }, { hour: "18:00", store: "科技园店", orders: 138 },',
  '  { hour: "08:00", store: "太古里店", orders: 76 }, { hour: "10:00", store: "太古里店", orders: 118 }, { hour: "12:00", store: "太古里店", orders: 196 }, { hour: "14:00", store: "太古里店", orders: 214 }, { hour: "16:00", store: "太古里店", orders: 226 }, { hour: "18:00", store: "太古里店", orders: 205 }',
  ']',
  '$/stores = [',
  '  { store: "北京国贸旗舰店", rev: "¥ 28,460", orders: "648 单", wait: "4.8 分钟", stock: "鲜奶余量 18%（需补货）" },',
  '  { store: "上海静安寺店", rev: "¥ 24,920", orders: "572 单", wait: "3.1 分钟", stock: "库存充足" },',
  '  { store: "深圳科技园店", rev: "¥ 23,680", orders: "558 单", wait: "3.4 分钟", stock: "冷萃原液余量 22%" },',
  '  { store: "成都太古里店", rev: "¥ 22,150", orders: "496 单", wait: "2.9 分钟", stock: "库存充足" }',
  ']',
  'root = Card(Column([',
  '  Row([Text("### 连锁门店今日实时经营仪表盘（12 家直营店）"), Badge("实时汇总 · 18:30", tone="success")], justify="spaceBetween", align="center"),',
  '  Row([',
  '    Stat("今日累计营业额", "¥ 18.6 万", delta="+14.2%", trend="up", spark=[1.8, 3.6, 6.9, 10.4, 13.8, 16.5, 18.6], caption="日目标已达成 93%", weight=1),',
  '    Stat("全渠道成交单量", "4,280 单", delta="+9.6%", trend="up", spark=[420, 980, 1850, 2540, 3190, 3820, 4280], caption="平均客单价 ¥43.5", weight=1),',
  '    Stat("高峰出杯准时率", "96.4%", delta="-1.8%", trend="down", spark=[99.1, 98.6, 95.2, 94.8, 96.0, 96.1, 96.4], caption="国贸店午高峰积压", weight=1),',
  '    Stat("会员复购占比", "64.2%", delta="+5.1%", trend="up", spark=[58, 59.5, 60.2, 61.8, 62.4, 63.6, 64.2], caption="储值卡核销活跃", weight=1)',
  '  ], align="stretch"),',
  '  Row([',
  '    Chart("area", $/hourly, xField="hour", yField=["堂食", "小程序自提", "外卖配送"], stacked=true, title="分时段全渠道营收趋势（千元）", height=195, weight=11),',
  '    Chart("heatmap", $/rush, xField="hour", yField="store", sizeField="orders", title="核心门店 × 时段单量热力分布（单/小时）", height=195, weight=13)',
  '  ], align="stretch"),',
  '  Table($/stores, searchable=true, pageSize=3, title="重点门店实时实收、出餐效率与原料预警", columns=[{ key: "store", label: "门店名称" }, { key: "rev", label: "今日实收" }, { key: "orders", label: "成交单量" }, { key: "wait", label: "平均出杯" }, { key: "stock", label: "库存与履约状态" }])',
  ']))',
].join('\n')

export const SHOWCASE_ARCHITECTURE_UI = [
  'surface("arch_explorer")',
  `$/diagram = ${JSON.stringify(
    [
      'flowchart TB',
      '  subgraph L1["Agent 推理与工具层"]',
      '    Prompt["动态语法契约"] ',
      '    Render["a2ui_render 流式工具"]',
      '    Ask["a2ui_ask 审批门禁"]',
      '  end',
      '  subgraph L2["Host 安全编译与状态层"]',
      '    Validator["32 组件 Schema 校验"]',
      '    AstGuard["公式 AST 安全门禁"]',
      '    Store[("跨轮次状态快照")]',
      '  end',
      '  subgraph L3["DSH 原生视图与联动层"]',
      '    Slots["原生主题交互卡片"]',
      '    Chunks["图表与流程图懒加载"]',
      '    Editor["右侧边栏源码定位"]',
      '  end',
      '  Prompt --> Validator',
      '  Render --> Validator',
      '  Render --> AstGuard',
      '  Ask --> Validator',
      '  Ask --> Store',
      '  Validator --> Slots',
      '  AstGuard --> Chunks',
      '  Store --> Editor',
    ].join('\n'),
  )}`,
  '$/files = [',
  '  { path: "src/index.ts", status: "modified", line: 239, summary: "Host 插件入口、工具与系统提示词注册" },',
  '  { path: "src/shared/catalog-schema.ts", status: "modified", line: 585, summary: "32 组件与 23 函数同构 Schema 契约" },',
  '  { path: "src/client/chunk-loader.ts", status: "added", line: 1, summary: "window.__ModuleLoader__ 四分包懒加载" },',
  '  { path: "src/client/chunks/mermaid-chunk.ts", status: "added", line: 1, summary: "strict 沙盒与 SVG 净化架构图渲染" },',
  '  { path: "src/client/catalog/ExtendedWidgets.tsx", status: "modified", line: 196, summary: "工作区文件树与右侧边栏联动跳转" }',
  ']',
  '$/manifest = {',
  '  plugin: "dsh-genui-a2ui",',
  '  protocol: "A2UI 1.0",',
  '  zeroHostHacks: true,',
  '  chunks: {',
  '    "client.js (Cold Boot)": "45.9 KB (12.6 KB gzip)",',
  '    "client.runtime.js": "1.03 MB (on-demand)",',
  '    "client.echarts.js": "778 KB (14 chart kinds)",',
  '    "client.mermaid.js": "3.12 MB (diagram-only)"',
  '  }',
  '}',
  'root = Card(Column([',
  '  Row([Text("### dsh-genui-a2ui 分层系统架构全景与源码导航"), Badge("点击左侧文件直达右侧边栏", tone="success")], justify="spaceBetween", align="center"),',
  '  Mermaid($/diagram, title="分层安全渲染链路与工作区联动架构图"),',
  '  Row([',
  '    FileTree($/files, title="核心模块树（点击节点定位源码行）", expandedDepth=3, weight=1),',
  '    JsonTree($/manifest, title="构建产物分包清单 (Bundle Manifest)", expandedDepth=2, weight=1)',
  '  ], align="stretch")',
  ']))',
].join('\n')

export const SHOWCASE_SIMULATOR_UI = [
  'surface("finops_sim")',
  '$/tier = ["v3"]',
  '$/dailyWan = 35',
  '$/cacheHit = 75',
  '$/outTok = 600',
  'inPrice = cond(eq($/tier, "v3"), 2.0, 4.0)',
  'cachePrice = cond(eq($/tier, "v3"), 0.5, 1.0)',
  'outPrice = cond(eq($/tier, "v3"), 8.0, 16.0)',
  'v = { d: $/dailyWan, h: $/cacheHit, o: $/outTok, ip: inPrice, cp: cachePrice, op: outPrice }',
  'rawMonthly = calc("0.3 * d * (1200 * ip + o * op)", v, decimals=0)',
  'optMonthly = calc("0.3 * d * (12 * (100 - h) * ip + 12 * h * cp + o * op)", v, decimals=0)',
  'savedMonthly = calc("r - m", { r: rawMonthly, m: optMonthly }, decimals=0)',
  'perCallFen = calc("m / (3000 * d)", { m: optMonthly, d: $/dailyWan }, decimals=2)',
  'budgetPct = calc("clamp(m / 800, 0, 100)", { m: optMonthly }, decimals=0)',
  'compareRows = [{ plan: "未开启缓存基准", cny: rawMonthly }, { plan: "当前缓存策略实付", cny: optMonthly }, { plan: "月度净节省额", cny: savedMonthly }]',
  'root = Card(Column([',
  '  Row([Text("### 大模型推理算力与缓存成本 0ms 实时测算沙盘"), Badge("0ms 本地公式引擎", tone="info")], justify="spaceBetween", align="center"),',
  '  ChoicePicker(label="主力推理模型", options=[{ value: "v3", label: "DeepSeek-V3 (高吞吐主力)" }, { value: "r1", label: "DeepSeek-R1 (深度思维链)" }], value=$/tier, variant="mutuallyExclusive", displayStyle="chips"),',
  '  Row([',
  '    Slider("日均调用量（万次/天）", 10, 200, $/dailyWan, steps=38, weight=1),',
  '    Slider("Prompt 缓存命中率（%）", 0, 95, $/cacheHit, steps=19, weight=1),',
  '    Slider("平均输出长度（Tokens）", 200, 1600, $/outTok, steps=14, weight=1)',
  '  ]),',
  '  Row([',
  '    Stat("优化后月度总成本", formatCurrency(optMonthly, "CNY", 0), trend="up", caption="30 天滚动预估", weight=1),',
  '    Stat("缓存每月净节省", formatCurrency(savedMonthly, "CNY", 0), delta="即时生效", trend="up", caption="对比零缓存基准", weight=1),',
  '    Stat("单次请求均摊（分）", perCallFen, trend="neutral", caption="含输入与输出 Token", weight=1)',
  '  ]),',
  '  Progress(budgetPct, label="月度算力预算水位（上限 ¥80,000 参考线）", tone="brand"),',
  '  Chart("bar", compareRows, title="月度推理费用结构实时对比（元·拖动滑块即时重算）", xField="plan", yField="cny", height=175)',
  ']))',
].join('\n')

export const SHOWCASE_ASK_DIFF_UI = [
  'surface("review_gate")',
  '$/before = "const SHELL_BUDGET_KB = 500;\\nexport async function loadMermaid() {\\n  return loadChunk(\\"./client.mermaid.js\\");\\n}"',
  '$/after = "const SHELL_BUDGET_KB = 100;\\nexport async function loadMermaid() {\\n  const mod = await loadChunk(\\"./client.mermaid.js\\");\\n  return mod ?? fallbackMermaidView();\\n}"',
  '$/rollout = ["canary_10"]',
  '$/approved = true',
  'root = Card(Column([',
  '  Callout("人工审批门禁：即将收紧首屏包体积阈值并写入分包异常降级保护，请核对代码变更", tone="warning"),',
  '  DiffView($/before, $/after, title="src/client/chunk-loader.ts", language="typescript", mode="split", filePath="src/client/chunk-loader.ts", line=1),',
  '  ChoicePicker(label="生效范围选择", options=[{ value: "canary_10", label: "灰度 10% 工作区" }, { value: "staging", label: "仅本地开发环境" }, { value: "full", label: "立即全量应用" }], value=$/rollout, variant="mutuallyExclusive", displayStyle="chips"),',
  '  CheckBox("我已核对双栏 Diff 差异与右侧源码上下文，授权 Agent 应用此补丁", $/approved),',
  '  Row([',
  '    Button(Text("授权放行并继续执行"), variant="primary", action=Event("approve_patch", { rollout: $/rollout, approved: $/approved }, userMessage="确认放行代码变更"))',
  '  ], justify="end")',
  ']))',
].join('\n')

export const SHOWCASE_DOCK_PIPELINE_UI = [
  'surface("release_dock")',
  '$/stages = [',
  '  { title: "TypeScript 类型检查", status: "done", description: "0 errors" },',
  '  { title: "四分包构建与体积门禁", status: "done", description: "45.9 kB < 500 kB" },',
  '  { title: "Host API 契约核验", status: "done", description: "Slots & Primitives OK" },',
  '  { title: "Vitest 45 项回归测试", status: "active", description: "执行中 (41/45)" },',
  '  { title: "npm 预打包产物审计", status: "pending", description: "等待前序完成" }',
  ']',
  'root = Column([',
  '  Steps($/stages, direction="horizontal"),',
  '  Row([',
  '    Stat("首屏 client.js", "45.9 kB", delta="12.6 kB gzip", trend="up", weight=1),',
  '    Stat("回归测试套件", "41 / 45", delta="运行中", trend="up", weight=1),',
  '    Stat("零宿主 Hack 检查", "100% 通过", trend="up", weight=1)',
  '  ]),',
  '  Progress(84, label="v0.1.0 开源发布质量流水线总进度（跨轮次常驻监控）", tone="success")',
  '])',
].join('\n')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function extractText(content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'object' && part !== null && 'text' in part ? String(part.text) : ''))
      .join('\n')
  }
  return ''
}

function isSyntheticUserContext(text) {
  const t = text.trimStart()
  return (
    t.startsWith('Current runtime context.') ||
    t.startsWith('<system-reminder>') ||
    t.startsWith('<environment') ||
    t.startsWith('<context') ||
    t.startsWith('Current local time:')
  )
}

function writeSse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

async function streamTextReply(res, model, text) {
  const id = `chatcmpl-${Date.now()}`
  writeSse(res, {
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }],
  })
  for (let i = 0; i < text.length; i += 8) {
    await sleep(10)
    writeSse(res, {
      id,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{ index: 0, delta: { content: text.slice(i, i + 8) }, finish_reason: null }],
    })
  }
  writeSse(res, {
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    usage: { prompt_tokens: 120, completion_tokens: 32, total_tokens: 152 },
  })
  res.write('data: [DONE]\n\n')
  res.end()
}

async function streamToolCall(res, model, toolName, argsObj) {
  const id = `chatcmpl-${Date.now()}`
  const callId = `call_a2ui_${Date.now()}`
  const rawArgs = JSON.stringify(argsObj)

  writeSse(res, {
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta: {
          role: 'assistant',
          tool_calls: [{ index: 0, id: callId, type: 'function', function: { name: toolName, arguments: '' } }],
        },
        finish_reason: null,
      },
    ],
  })

  for (let i = 0; i < rawArgs.length; i += CHUNK_SIZE) {
    await sleep(CHUNK_DELAY_MS)
    const piece = rawArgs.slice(i, i + CHUNK_SIZE)
    writeSse(res, {
      id,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [{ index: 0, function: { arguments: piece } }],
          },
          finish_reason: null,
        },
      ],
    })
  }

  writeSse(res, {
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
    usage: { prompt_tokens: 180, completion_tokens: 96, total_tokens: 276 },
  })
  res.write('data: [DONE]\n\n')
  res.end()
}

export function startMockLlmServer(port = PORT) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`)

    if (req.method === 'GET' && url.pathname.endsWith('/models')) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ object: 'list', data: [{ id: 'mock-a2ui-1', object: 'model' }] }))
      return
    }

    if (req.method === 'POST' && url.pathname.endsWith('/chat/completions')) {
      let body = ''
      for await (const chunk of req) body += chunk
      const payload = JSON.parse(body || '{}')
      const model = payload.model ?? 'mock-a2ui-1'
      const messages = Array.isArray(payload.messages) ? payload.messages : []
      const tools = Array.isArray(payload.tools) ? payload.tools : []
      const hasRenderTool = tools.some((t) => (t?.function?.name ?? t?.name) === 'a2ui_render')
      const hasAskTool = tools.some((t) => (t?.function?.name ?? t?.name) === 'a2ui_ask')

      if (payload.stream === false) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(
          JSON.stringify({
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [{ index: 0, message: { role: 'assistant', content: 'A2UI 交互演示' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 30, completion_tokens: 8, total_tokens: 38 },
          }),
        )
        return
      }

      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      })

      if (!hasRenderTool) {
        const allText = messages.map((m) => extractText(m?.content)).join('\n')
        if (tools.length === 0) {
          const autoTitle = /showcase-1/i.test(allText)
            ? '2026 Q3 业务增长与全链路转化诊断大盘'
            : /showcase-2/i.test(allText)
              ? 'dsh-genui-a2ui 分层系统架构全景与源码导航'
              : /showcase-3/i.test(allText)
                ? '大模型推理算力与缓存成本测算沙盘'
                : /showcase-4/i.test(allText)
                  ? '核心分包加载策略变更审批'
                  : /showcase-5/i.test(allText)
                    ? 'v0.1.0 开源发布质量门禁流水线'
                    : /showcase-6/i.test(allText)
                      ? '连锁门店今日实时经营仪表盘'
                      : 'A2UI 生成式交互工作台'
          await streamTextReply(res, model, autoTitle)
          return
        }
        await streamTextReply(
          res,
          model,
          '当前已关闭 A2UI 生成式界面（纯文本回复模式），已使用普通 Markdown 为您响应。',
        )
        return
      }

      let lastAnyUserIdx = -1
      const latestTurnUserParts = []
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i]?.role === 'user') {
          if (lastAnyUserIdx < 0) lastAnyUserIdx = i
          const candidate = extractText(messages[i].content)
          if (!isSyntheticUserContext(candidate)) {
            latestTurnUserParts.unshift(candidate)
          }
        } else if (lastAnyUserIdx >= 0) {
          // Stop once we step before the contiguous block of user messages for this turn
          break
        }
      }
      const userText =
        latestTurnUserParts.length > 0
          ? latestTurnUserParts.join('\n')
          : lastAnyUserIdx >= 0
            ? extractText(messages[lastAnyUserIdx].content)
            : ''
      const turnTailMsgs = lastAnyUserIdx >= 0 ? messages.slice(lastAnyUserIdx + 1) : []
      const toolResults = turnTailMsgs.filter((m) => m?.role === 'tool')

      const isShowcase1 = /showcase-1/i.test(userText)
      const isShowcase2 = /showcase-2/i.test(userText)
      const isShowcase3 = /showcase-3/i.test(userText)
      const isShowcase4 = /showcase-4/i.test(userText)
      const isShowcase5 = /showcase-5/i.test(userText)
      const isShowcase6 = /showcase-6/i.test(userText)
      const isDashboard = /dashboard|看板/i.test(userText)
      const isAsk = /ask|向导|部署/i.test(userText)
      const isDock = /dock|工作台|监控/i.test(userText)
      const isInline = /inline|内嵌/i.test(userText)

      if (toolResults.length === 0) {
        if (isShowcase1) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: '2026 Q3 业务增长与全链路转化诊断大盘',
            ui: SHOWCASE_EXECUTIVE_UI,
          })
          return
        }
        if (isShowcase6) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: '连锁门店今日实时经营仪表盘',
            ui: SHOWCASE_STORE_OPS_UI,
          })
          return
        }
        if (isShowcase2) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: 'dsh-genui-a2ui 分层系统架构全景与源码导航',
            ui: SHOWCASE_ARCHITECTURE_UI,
          })
          return
        }
        if (isShowcase3) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: '大模型推理算力与缓存成本实时测算沙盘',
            ui: SHOWCASE_SIMULATOR_UI,
          })
          return
        }
        if (isShowcase4 && hasAskTool) {
          await streamToolCall(res, model, 'a2ui_ask', {
            title: '核心分包加载策略变更审批',
            ui: SHOWCASE_ASK_DIFF_UI,
          })
          return
        }
        if (isShowcase5) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: 'v0.1.0 开源发布质量门禁流水线',
            placement: 'dock',
            ui: SHOWCASE_DOCK_PIPELINE_UI,
          })
          return
        }
        if (userText.includes('[a2ui-action]')) {
          if (userText.includes('surface="analytics"') || userText.includes('action="boost_q2"')) {
            await streamToolCall(res, model, 'a2ui_render', {
              title: '区域经营看板（已上调预测）',
              ui: ANALYTICS_UPDATE_UI,
            })
            return
          }
          if (userText.includes('surface="pipeline"') || userText.includes('action="advance_pipeline"')) {
            await streamToolCall(res, model, 'a2ui_render', {
              title: 'CI/CD 发布流水线监控（已全量）',
              placement: 'dock',
              ui: DOCK_MONITOR_UPDATE_UI,
            })
            return
          }
          await streamToolCall(res, model, 'a2ui_render', {
            title: '预订状态已更新',
            ui: UPDATE_UI,
          })
          return
        }
        if (userText.includes('test-error')) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: '错误自愈测试（初稿）',
            ui: BROKEN_UI,
          })
          return
        }
        if (isAsk && hasAskTool) {
          await streamToolCall(res, model, 'a2ui_ask', {
            title: '发布环境与规格确认',
            ui: DEPLOY_ASK_UI,
          })
          return
        }
        if (isDock) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: 'CI/CD 发布流水线监控',
            placement: 'dock',
            ui: DOCK_MONITOR_UI,
          })
          return
        }
        if (isInline) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: '步骤内嵌诊断摘要',
            placement: 'inline',
            ui: INLINE_SUMMARY_UI,
          })
          return
        }
        if (isDashboard) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: '2026 区域经营看板',
            ui: DASHBOARD_UI,
          })
          return
        }
        await streamToolCall(res, model, 'a2ui_render', {
          title: '餐厅预订确认',
          ui: BOOKING_UI,
        })
        return
      }

      const lastToolText = extractText(toolResults.at(-1)?.content)
      if (toolResults.length === 1 && lastToolText.includes('rejected')) {
        await streamToolCall(res, model, 'a2ui_render', {
          title: '自愈恢复卡片（已修复）',
          ui: userText.includes('test-error') ? HEALED_UI : BOOKING_UI,
        })
        return
      }

      if (isAsk) {
        try {
          const askRes = JSON.parse(lastToolText)
          if (askRes.status === 'skipped') {
            await streamTextReply(res, model, '您已跳过本次交互确认，未执行任何发布变更。')
            return
          }
          if (askRes.status === 'answered') {
            const ctx = askRes.context ?? {}
            const envStr = Array.isArray(ctx.env) ? ctx.env.join(', ') : String(ctx.env ?? 'canary')
            const pods = ctx.replicas ?? 4
            const rollback = ctx.autoRollback ? '开启' : '关闭'
            await streamTextReply(
              res,
              model,
              `已在同一回合收到您的发布配置确认（环境：**${envStr}**，并发实例：**${pods} Pods**，自动回滚：**${rollback}**），已生成对应发布清单（示例）。`,
            )
            return
          }
        } catch {
          // Fall through
        }
      }

      const reply = isShowcase1
        ? '已生成 Q3 全链路转化流向与五维健康度诊断大盘，您可切换标签页查看区域实收对比或检索各渠道 ROI 明细。'
        : isShowcase6
          ? '已汇总 12 家直营门店实时营收、高峰单量热力与原料库存预警，北京国贸旗舰店鲜奶余量低于 20%，建议安排即时调拨。'
          : isShowcase2
            ? '已绘制分层系统架构全景图与核心模块目录，点击左侧任意文件节点即可在右侧边栏打开对应源码并定位行号。'
          : isShowcase3
            ? '已就绪 0ms 推理算力成本测算沙盘，拖动任意滑块或切换主力模型即可在本地零延迟重算月度账单与节省额度。'
            : isShowcase4
              ? '已收到您的双栏 Diff 审核放行指令，正在将分包加载降级保护补丁写入工作区。'
              : isShowcase5
                ? '已将 v0.1.0 发布前自动化质量流水线挂载至会话底部常驻工作台（Dock），后续各阶段核验状态将原地实时刷新。'
                : userText.includes('[a2ui-action]')
                  ? '已根据您的操作实时增量刷新界面数据模型。'
                  : isDock
                    ? '已将 CI/CD 发布流水线监控面板固定在输入框上方的常驻工作台（Dock），后续轮次将继续实时原地刷新。'
                    : isInline
                      ? '已在工具步骤流内嵌渲染诊断摘要。'
                      : isDashboard
                        ? '已为您生成 2026 区域经营交互看板（示例数据），可切换图表、搜索排序明细表或一键调整预测情景。'
                        : '已为您准备好餐厅预订交互卡片，您可直接在下方调整人数、口味或包间选项后点击确认。'
      await streamTextReply(res, model, reply)
      return
    }

    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'not found' }))
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = await startMockLlmServer(PORT)
  console.log(`[mock-llm] listening on http://127.0.0.1:${PORT}/v1 (chunk=${CHUNK_SIZE} chars, delay=${CHUNK_DELAY_MS}ms)`)
  process.on('SIGINT', () => server.close(() => process.exit(0)))
}
