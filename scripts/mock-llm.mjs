#!/usr/bin/env node
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

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
  '  ChoicePicker(label="口味偏好", options=[{label: "少油少盐", value: "less_oil"}, {label: "微辣", value: "mild_spicy"}, {label: "不要香菜", value: "no_cilantro"}], value=$/form/taste, variant="multipleSelection", displayStyle="chips"),',
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
  '  { region: "华北专属集群", q2: 1180, q3: 1540 },',
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
  '  Chart("sankey", $/flow, xField="source", seriesField="target", yField="value", title="四阶全链路转化流向（获客 → 激活 → 协同 → 变现）", height=275, weight=16),',
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
      '    Validator["57 组件 Schema 校验"]',
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
  '  { path: "src/index.ts", status: "modified", line: 261, summary: "Host 插件入口、工具与系统提示词注册" },',
  '  { path: "src/shared/catalog-schema.ts", status: "modified", line: 585, summary: "57 组件与 25 函数同构 Schema 契约" },',
  '  { path: "src/client/chunk-loader.ts", status: "added", line: 1, summary: "window.__ModuleLoader__ 四分包懒加载" },',
  '  { path: "src/client/chunks/mermaid-chunk.ts", status: "added", line: 1, summary: "strict 沙盒与 SVG 净化架构图渲染" },',
  '  { path: "src/client/catalog/ExtendedWidgets.tsx", status: "modified", line: 196, summary: "工作区文件树与右侧边栏联动跳转" }',
  ']',
  '$/manifest = {',
  '  plugin: "dsh-genui-a2ui",',
  '  protocol: "A2UI 1.0",',
  '  zeroHostHacks: true,',
  '  chunks: {',
  '    "client.js (Cold Boot)": "69.7 KB (19.6 KB gzip)",',
  '    "client.runtime.js": "1.37 MB (on-demand)",',
  '    "client.echarts.js": "878 KB (19 chart kinds)",',
  '    "client.mermaid.js": "3.47 MB (diagram-only)"',
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
  '  { title: "不变量与类型检查", status: "done", description: "12 rules · 0 errors" },',
  '  { title: "五分片包体棘轮", status: "done", description: "69.7 kB < 85 kB" },',
  '  { title: "Host API 契约核验", status: "done", description: "93 Contracts OK" },',
  '  { title: "TLA+ & 182 项回归", status: "active", description: "执行中 (179/182)" },',
  '  { title: "npm 预打包产物审计", status: "pending", description: "等待前序完成" }',
  ']',
  'root = Column([',
  '  Steps($/stages, direction="horizontal"),',
  '  Row([',
  '    Stat("首屏 client.js", "69.7 kB", delta="19.6 kB gzip", trend="up", weight=1),',
  '    Stat("回归测试套件", "182 / 182", delta="33 Suites", trend="up", weight=1),',
  '    Stat("TLA+ 状态机检验", "8,215 状态", delta="0 errors", trend="up", weight=1)',
  '  ]),',
  '  Progress(92, label="v0.4.7 开源发布质量流水线总进度（跨轮次常驻监控）", tone="success")',
  '])',
].join('\n')

export const SHOWCASE_SRE_APM_UI = [
  'surface("sre_apm_workbench")',
  '$/nodes = [',
  '  { id: "gw", label: "API Gateway", status: "healthy", metric: "2.4k RPS" },',
  '  { id: "checkout", label: "Checkout API", status: "warning", metric: "P99 184ms" },',
  '  { id: "risk", label: "Fraud Scorer · TiKV", status: "error", metric: "P99 142ms" }',
  ']',
  '$/edges = [',
  '  { from: "gw", to: "checkout", label: "HTTP 200", status: "healthy" },',
  '  { from: "checkout", to: "risk", label: "region #19 慢读", status: "error" }',
  ']',
  '$/traceTree = [',
  '  { label: "POST /v1/checkout/confirm", sublabel: "api-gateway", metric: "184.0 ms", sharePct: 100, status: "warning", badge: "HTTP 200", children: [',
  '    { label: "AuthGrpc.VerifySession", sublabel: "auth-svc", metric: "11.2 ms", sharePct: 6, status: "healthy" },',
  '    { label: "RiskEngine.EvaluateOrderGraph", sublabel: "fraud-scorer", metric: "141.6 ms", sharePct: 77, status: "error", badge: "慢调用瓶颈", children: [',
  '      { label: "FeatureStore.BatchFetch90d", sublabel: "tikv-prod", metric: "126.8 ms", sharePct: 69, status: "error", badge: "热点分片 #19" },',
  '      { label: "OnnxRuntime.ScoreModelV3", sublabel: "gpu-l20", metric: "14.8 ms", sharePct: 8, status: "healthy" }',
  '    ] },',
  '    { label: "InventorySvc.LockSkuBatch", sublabel: "stock-svc", metric: "28.4 ms", sharePct: 15, status: "healthy" }',
  '  ] }',
  ']',
  '$/logs = [',
  '  { time: "22:14:08", level: "error", service: "fraud-scorer", message: "TiKV region #19 read_index timeout (126.8ms > 80ms SLA)", filePath: "src/host/generator.ts", line: 96 },',
  '  { time: "22:14:09", level: "warn", service: "checkout-api", message: "Fallback local risk cache engaged for 18% of requests" }',
  ']',
  'root = Card(Column([',
  '  ServiceGraph($/nodes, $/edges, title="核心支付与风控调用链实时健康拓扑", direction="LR"),',
  '  Tree($/traceTree, title="分布式 Trace 耗时瀑布树 (#tr_88412)", summary="总耗时 184.0 ms", expandedDepth=4),',
  '  LogViewer($/logs, title="关联异常堆栈与工作区源码定位", searchable=false, maxHeight=160)',
  ']))',
].join('\n')

export const SHOWCASE_ENTERPRISE_PROTABLE_UI = [
  'surface("enterprise_governance_protable")',
  '$/sla = [',
  '  { label: "11-01", status: "ok" }, { label: "11-02", status: "ok" }, { label: "11-03", status: "ok" }, { label: "11-04", status: "ok" }, { label: "11-05", status: "ok" },',
  '  { label: "11-06", status: "ok" }, { label: "11-07", status: "warning", note: "P99 抖动 420ms (4m)" }, { label: "11-08", status: "ok" }, { label: "11-09", status: "ok" }, { label: "11-10", status: "ok" },',
  '  { label: "11-11", status: "ok" }, { label: "11-12", status: "ok" }, { label: "11-13", status: "ok" }, { label: "11-14", status: "ok" }, { label: "11-15", status: "ok" },',
  '  { label: "11-16", status: "ok" }, { label: "11-17", status: "ok" }, { label: "11-18", status: "ok" }, { label: "11-19", status: "ok" }, { label: "11-20", status: "ok" }',
  ']',
  '$/specs = [',
  '  { label: "巡检工单号", value: "GOV-2026-Q4-019", mono: true, copyable: true },',
  '  { label: "安全隔离规格", value: "SOC2 Type II · VPC 专线隔离", tone: "success" },',
  '  { label: "跨列治理结论", value: "发现 3 台夜间低利用率 GPU 实例，启用自动弹性缩容后预计每月净节省 ¥33,700（span=2 跨双列对齐）。", span: 2 }',
  ']',
  '$/idleRows = [',
  '  { instance: "gpu-hz-a10-04", region: "华东杭州 AZ2", util: "3.2%", save: "¥12,400", status: "🟡 持续低载", detail: "7d_p95_gpu_util: 6.1%  |  recommended_action: night_autoscale_00_08" },',
  '  { instance: "gpu-bj-l20-12", region: "华北北京 AZ1", util: "0.4%", save: "¥16,400", status: "🔴 空载挂起", detail: "idle_since: 2026-11-12T03:00Z  |  owner: quant-research-team" },',
  '  { instance: "gpu-sh-t4-03", region: "华东上海 AZ1", util: "9.8%", save: "¥4,900", status: "🟡 波谷闲置", detail: "recommended_action: merge_into_shared_pool_sh01" }',
  ']',
  'root = Card(Column([',
  '  EntityHeader("NovaAI · 核心生产推理集群", subtitle="集群 ID: cls_hz_90812 · 值班 SRE: 林珊", avatarText="NV", status="healthy", statusLabel="SLA 达标", badge="Dedicated", tags=["VPC 专线", "ISO-27001"], metrics=[{ label: "月度算力预算", value: "¥200,000" }, { label: "并发水位", value: "420 / 500 RPM" }, { label: "近 20 日可用性", value: "99.96%" }]),',
  '  Tracker($/sla, title="核心推理网关 20 日 SLA 可用性时序条", summary="99.96% 正常", mode="uptime"),',
  '  KeyValue($/specs, title="季度治理工单规格书 (Descriptions · bordered=true)", columns=2, bordered=true, copyable=true),',
  '  Table($/idleRows, columns=[{ key: "instance", label: "实例标识" }, { key: "region", label: "可用区" }, { key: "util", label: "均值利用率" }, { key: "save", label: "月度可节省" }, { key: "status", label: "诊断状态" }], title="闲置算力治理清单 (ProTable · 行内展开详情 + 导出 + 汇总)", expandKey="detail", searchable=true, exportable=true, showSummary=true)',
  ']))',
].join('\n')

export const SHOWCASE_ANTD_CAPACITY_UI = [
  'surface("antd_capacity_planner")',
  '$/spec = "h20-tp4"',
  '$/replicas = 6',
  '$/qpsPerPod = 160',
  '$/regions = ["cn-hangzhou", "cn-shanghai"]',
  '$/targetSvc = "prod-cn-hz/llm-serving/deepseek-r1-svc"',
  '$/specOpts = [',
  '  { value: "l20-tp2", title: "L20 · TP2 标准推理型", badge: "¥18 / 小时", description: "48GB 显存 · 适合中小并发在线客服与轻量 Agent" },',
  '  { value: "h20-tp4", title: "H20 · TP4 旗舰吞吐型", badge: "¥46 / 小时", recommended: true, description: "384GB 显存 · 适合 128K 长上下文高并发生产负载" },',
  '  { value: "h800-tp8", title: "H800 · TP8 专属集群型", badge: "¥118 / 小时", description: "640GB NVLink · 适合满血 671B MoE 专线独占部署" }',
  ']',
  '$/k8sTree = [',
  '  { label: "prod-cn-hz", children: [',
  '    { label: "llm-serving", children: [',
  '      { label: "deepseek-r1-svc", value: "prod-cn-hz/llm-serving/deepseek-r1-svc", badge: "Online" }',
  '    ] }',
  '  ] }',
  ']',
  '$/prompts = [',
  '  { value: "stress_curve", title: "生成 H20 · TP4 并发吞吐与首字延迟压测曲线", badge: "推荐追问", description: "对比并发 32 / 64 / 128 下 TTFT P99 表现" },',
  '  { value: "spot_plan", title: "测算夜间波谷自动缩容与抢占式混合配比方案", badge: "FinOps", description: "基于近 30 天流量曲线规划弹性策略" }',
  ']',
  'unitPrice = cond(eq($/spec, "l20-tp2"), 18, cond(eq($/spec, "h20-tp4"), 46, 118))',
  'peakRps = calc("r * q", { r: $/replicas, q: $/qpsPerPod }, decimals=0)',
  'monthlyBudget = calc("r * p * 24 * 30", { r: $/replicas, p: unitPrice }, decimals=0)',
  'root = Card(Column([',
  '  Grid([',
  '    Stat("集群峰值承载吞吐", formatNumber(peakRps), delta="+28%", trend="up", caption="RPS · 0ms 实时联动"),',
  '    Stat("7×24 包月总预算", formatCurrency(monthlyBudget, "CNY", 0), caption="按实例数 × 机型单价折算"),',
  '    Stat("多活部署副本数", $/replicas, caption="Pods · 跨可用区均衡")',
  '  ], columns=3, gap="md"),',
  '  CheckCard("选择 GPU 推理机型档位 (CheckCard.Group)", $/specOpts, value=$/spec, columns=3),',
  '  Row([',
  '    NumberInput("目标副本数 (NumberInput)", $/replicas, min=1, max=32, step=1, unit="Pods", weight=1),',
  '    NumberInput("单副本并发上限", $/qpsPerPod, min=40, max=640, step=20, prefix="×", unit="RPS", weight=1)',
  '  ]),',
  '  Row([',
  '    MultiSelect("多活容灾可用区 (MultiSelect)", [{ value: "cn-hangzhou", label: "杭州金融云" }, { value: "cn-shanghai", label: "上海张江" }, { value: "cn-beijing", label: "北京乌兰察布" }], $/regions, allowCreate=true, weight=1),',
  '    TreeSelect("绑定目标微服务 (TreeSelect)", $/k8sTree, $/targetSvc, weight=1)',
  '  ]),',
  '  CheckCard("推荐下一步深度推演 (@ant-design/x Prompts)", $/prompts, columns=2, action=Event("next_step"))',
  ']))',
].join('\n')

export const SHOWCASE_RISK_RUNBOOK_UI = [
  'surface("risk_runbook_matrix")',
  '$/cmds = [',
  '  { comment: "校验只读备份快照完整性", cmd: "pg_verifybackup /backup/fin-2026-1119 --progress", output: "backup successfully verified (SHA-256 OK)", exitCode: 0 }',
  ']',
  '$/sched = [',
  '  { title: "1. 快照校验", start: "00:00", end: "01:30", progress: 100, status: "done" },',
  '  { title: "2. 冷分区解绑归档", start: "01:30", end: "03:30", progress: 60, status: "active", owner: "@DBA" },',
  '  { title: "3. 业务回归巡检", start: "03:30", end: "05:00", status: "pending", owner: "@SRE" }',
  ']',
  'root = Card(Column([',
  '  ApprovalCard("执行核心账单表历史冷分区在线归档", summary="预计释放主库 1.8 TB NVMe 空间，元数据锁 < 60ms", severity="high", scope="DDL-2026-1119", impacts=["涉及 2024 Q1–Q2 已结清分区 1,420 万行", "冷存桶双副本校验通过"], confirmLabel="已核验备份快照完整可用，确认放行", approveAction=Event("approve_ddl"), rejectAction=Event("reject_ddl")),',
  '  Terminal($/cmds, title="前置核验命令手册", cwd="~/dba-ops", shell="zsh"),',
  '  Schedule($/sched, title="凌晨变更窗口排期甘特条 (00:00 – 05:00)", range=["00:00", "05:00"], now="02:30")',
  ']))',
].join('\n')

export const SHOWCASE_COMPARISON_SOURCES_UI = [
  'surface("hybrid_search_comparison")',
  '$/scale = "medium"',
  '$/opts = [',
  '  { key: "pg", title: "PostgreSQL + pgvector", subtitle: "HNSW + BM25 同库融合", recommended: true, badge: "架构组推荐" },',
  '  { key: "milvus", title: "Milvus 2.5 分布式", subtitle: "十亿级专用向量底座" },',
  '  { key: "es", title: "Elasticsearch 8.x", subtitle: "倒排强项 + 稠密向量" }',
  ']',
  '$/rows = [',
  '  { label: "ACID 强一致事务", values: { pg: "ok:原生 MVCC 事务同提交", milvus: "no:最终一致", es: "no:近实时刷新 (1s)" } },',
  '  { label: "千万级 P99 检索延迟", values: { pg: "ok:14 ms (HNSW ef=64)", milvus: "ok:9 ms (GPU Knowhere)", es: "warn:26 ms" } },',
  '  { label: "运维复杂度与成本", values: { pg: "ok:复用现有 RDS 零新增组件", milvus: "warn:需独立维护 Etcd/MinIO", es: "warn:JVM 堆内存开销较高" } }',
  ']',
  '$/refs = [',
  '  { title: "pgvector 0.8 HNSW Iterative Scan Whitepaper", url: "https://github.com/pgvector/pgvector", score: 0.96, snippet: "Iterative index scans guarantee exact k-NN recall under selective WHERE filters." },',
  '  { title: "ANN-Benchmarks 2026 Production Report", url: "https://ann-benchmarks.com", score: 0.91, snippet: "At < 50M 1536-d vectors, co-located PostgreSQL HNSW eliminates cross-service network hops." }',
  ']',
  'root = Card(Column([',
  '  Segmented("目标数据规模档位", [{ value: "small", label: "百万级 (< 5M)" }, { value: "medium", label: "千万级 (5M–50M)" }, { value: "large", label: "亿级以上 (> 100M)" }], $/scale),',
  '  Comparison($/opts, $/rows, title="生产级混合检索存储引擎多维权衡矩阵", action=Event("select_engine")),',
  '  SourceList($/refs, title="权威基准与官方文档溯源")',
  ']))',
].join('\n')

export const SHOWCASE_API_RING_DATERANGE_UI = [
  'surface("api_slo_workbench")',
  '$/start = "2026-11-13"',
  '$/end = "2026-11-19"',
  '$/req = { cluster: "prod-cn-hz", maxRps: 24000, burstMultiplier: 1.5 }',
  '$/resp = { policyId: "rl_90412", status: "active", updatedPods: 18 }',
  'root = Card(Column([',
  '  Grid([',
  '    MetricRing("网关可用性 SLA", 99.95, unit="%", size=72, tone="success", sublabel="近 7 天达标"),',
  '    MetricRing("限流令牌桶水位", 76.4, unit="%", size=72, tone="auto", sublabel="晚高峰峰值"),',
  '    MetricRing("P99 尾延迟预算", 42, max=100, unit="ms", size=72, tone="brand", sublabel="阈值 <= 100ms")',
  '  ], columns=3, gap="md"),',
  '  DateRange("SLO 统计与回溯时间区间", start=$/start, end=$/end, presets=true),',
  '  ApiEndpoint("POST", "/v1/gateways/{gatewayId}/rate-limits", summary="动态热更新核心网关集群限流配额", status=200, latency="19 ms", params=[{ name: "gatewayId", in: "path", type: "string", required: true, description: "目标网关实例组 ID" }], requestBody=$/req, responseBody=$/resp)',
  ']))',
].join('\n')

export const SHOWCASE_KANBAN_TIMELINE_MATRIX_UI = [
  'surface("dr_drill_retro")',
  '$/lanes = [',
  '  { id: "todo", title: "待跟进改进", tone: "warning", cards: [{ id: "c1", title: "收敛 DNS 缓存 TTL 至 5s", priority: "medium", assignee: "@接入组" }] },',
  '  { id: "doing", title: "压测验证中", tone: "info", cards: [{ id: "c2", title: "异步账单补偿队列幂等校验", priority: "high", assignee: "@清结算" }] },',
  '  { id: "done", title: "演练已达标", tone: "success", cards: [{ id: "c3", title: "TiKV 跨可用区 Leader 秒级切流", priority: "low", assignee: "@SRE" }] }',
  ']',
  'root = Card(Column([',
  '  Kanban($/lanes, title="跨可用区容灾演练跟进看板"),',
  '  Row([',
  '    Timeline([',
  '      { time: "02:00:05", title: "注入杭州可用区网络隔离探针", status: "warning", actor: "ChaosMesh" },',
  '      { time: "02:00:09", title: "流量自动切换至上海双活集群", status: "success", actor: "Envoy GSLB", description: "RTO 实测 4.1 秒，零丢单" }',
  '    ], title="演练关键动作时间轴", weight=1),',
  '    Matrix(["杭州主可用区", "上海双活区", "北京灾备区"], ["Q1", "Q2", "Q3", "Q4"], [[14.2, 13.5, 11.8, 10.9], [16.8, 15.1, 13.4, 12.0], [31.0, 28.4, 26.2, 24.5]], title="跨可用区季度 P99 延迟热力矩阵", unit="ms", showTotals=true, weight=1)',
  '  ]),',
  '  Result("success", "2026 Q4 跨可用区容灾演练圆满达标", subtitle="全链路 RTO 4.1s（目标 < 15s），RPO = 0", meta=[{ label: "演练单号", value: "DR-20261120" }, { label: "核心服务数", value: "28 / 28" }])',
  ']))',
].join('\n')

export const SHOWCASE_MARKET_CANDLE_UI = [
  'surface("quant_market_review")',
  '$/ohlc = [',
  '  { date: "11-11", open: 3420, close: 3468, low: 3405, high: 3482 },',
  '  { date: "11-12", open: 3468, close: 3442, low: 3430, high: 3479 },',
  '  { date: "11-13", open: 3442, close: 3510, low: 3438, high: 3526 },',
  '  { date: "11-14", open: 3510, close: 3548, low: 3496, high: 3560 },',
  '  { date: "11-17", open: 3548, close: 3522, low: 3508, high: 3558 },',
  '  { date: "11-18", open: 3522, close: 3586, low: 3518, high: 3598 }',
  ']',
  '$/sectors = [',
  '  { sector: "AI 算力芯片", min: -1.2, q1: 1.4, median: 3.2, q3: 5.6, max: 8.4 },',
  '  { sector: "云原生软件", min: -2.0, q1: 0.5, median: 1.9, q3: 3.8, max: 6.1 },',
  '  { sector: "智能终端", min: -1.8, q1: -0.2, median: 1.1, q3: 2.7, max: 4.5 }',
  ']',
  'root = Card(Column([',
  '  Row([',
  '    Chart("gauge", [{ name: "情绪热度", value: 74 }], title="市场量能情绪水位", height=240, weight=8),',
  '    Chart("candlestick", $/ohlc, xField="date", title="科技指数日 K 线走势", height=240, weight=14)',
  '  ]),',
  '  Chart("boxplot", $/sectors, xField="sector", title="细分板块日涨跌幅分布箱线图 (%)", height=220)',
  ']))',
].join('\n')

export const SHOWCASE_ACCORDION_MODAL_UI = [
  'surface("incident_accordion_modal")',
  'root = Card(Column([',
  '  Accordion([',
  '    { title: "1. 根因定位摘要（Root Cause）", defaultOpen: true, child: Text("连接池等待队列在 22:14 触顶，系下游慢查询未命中复合索引导致锁等待放大。") },',
  '    { title: "2. 关键运行指标快照", defaultOpen: true, child: KeyValue([{ label: "峰值活跃连接", value: "200 / 200", tone: "danger" }, { label: "慢查询 P99", value: "1,420 ms", mono: true }], columns=2, bordered=true) },',
  '    { title: "3. 在线止血与回滚预案", child: Text("1. 在线并发创建 `idx_orders_tenant_created` 索引；\\n2. 临时开启只读副本读分流。") }',
  '  ]),',
  '  Modal(trigger=Button(Text("查看完整慢 SQL 执行计划"), variant="primary", action=Event("open_sql_plan")), content=Column([Text("### EXPLAIN ANALYZE 慢查询详情"), Code("Seq Scan on billing_orders  (cost=0.00..184920.40 rows=1420000 width=128)\\n  Filter: ((tenant_id = $1) AND (status = \x27SETTLED\x27))", language="sql", lineNumbers=true)]))',
  ']))',
].join('\n')

export const SHOWCASE_FINOPS_WATERFALL_SUNBURST_UI = [
  'surface("finops_waterfall_sunburst")',
  '$/arrBridge = [',
  '  { step: "Q2 基线", delta: 480, total: true },',
  '  { step: "新客签约", delta: 165 },',
  '  { step: "老客增购", delta: 110 },',
  '  { step: "缓存降本", delta: 65 },',
  '  { step: "席位缩减", delta: -52 },',
  '  { step: "客户流失", delta: -38 },',
  '  { step: "Q3 实绩", delta: 730, total: true }',
  ']',
  '$/costTree = [',
  '  { name: "AI 对话业务", children: [',
  '    { name: "R1 推理池", children: [{ name: "深度研究 36w", value: 36 }, { name: "代码审阅 18w", value: 18 }] },',
  '    { name: "V3 快回池", children: [{ name: "A2UI 渲染 16w", value: 16 }] }',
  '  ] },',
  '  { name: "混合检索", children: [{ name: "向量引擎", children: [{ name: "Milvus 集群 18w", value: 18 }] }] },',
  '  { name: "评测沙箱", children: [{ name: "基准回归", children: [{ name: "自动化压测 12w", value: 12 }] }] }',
  ']',
  '$/ledger = [',
  '  { domain: "AI 对话业务", cluster: "cn-hz-r1-pool", q2Spend: 46.0, q3Spend: 54.0, cacheSaved: "¥ 14.2w" },',
  '  { domain: "AI 对话业务", cluster: "cn-sh-v3-fast", q2Spend: 19.5, q3Spend: 16.0, cacheSaved: "¥ 6.8w" },',
  '  { domain: "混合检索", cluster: "cn-hz-milvus", q2Spend: 15.0, q3Spend: 18.0, cacheSaved: "¥ 2.1w" },',
  '  { domain: "评测沙箱", cluster: "cn-bj-eval", q2Spend: 11.0, q3Spend: 12.0, cacheSaved: "¥ 1.4w" }',
  ']',
  'root = Card(Column([',
  '  EntityHeader("2026 Q3 营收增减归因与算力多层成本分摊台", subtitle="财务归因 · 多级云账单钻取（示例数据）", avatarText="FO", status="healthy", statusLabel="预算受控", badge="FinOps Q3", tags=["A2UI 1.0", "Waterfall + Sunburst"], metrics=[{ label: "Q3 实绩 ARR", value: "¥ 730w" }, { label: "月均算力总支出", value: "¥ 100w" }]),',
  '  Row([',
  '    Stat("季度净增 ARR", "+¥ 250 万", delta="+52.1%", trend="up", spark=[480, 520, 595, 645, 702, 730], caption="超目标 ¥50w", weight=1),',
  '    Stat("Prompt 缓存净省", "¥ 24.5 万", delta="+31.0%", trend="up", spark=[11, 14, 16, 19, 22, 24.5], caption="命中率 76%", weight=1),',
  '    Stat("净收入留存 NRR", "121.5%", delta="+4.2%", trend="up", caption="老客扩购强劲", weight=1),',
  '    Stat("单会话推理成本", "¥ 0.14", delta="-28.0%", trend="up", caption="低于红线 ¥0.20", weight=1)',
  '  ]),',
  '  Row([',
  '    Chart("waterfall", $/arrBridge, xField="step", yField="delta", referenceLine=680, referenceLabel="目标 ¥680w", title="Q2 → Q3 ARR 增减归因瀑布图（万元）", height=265, weight=1),',
  '    Chart("sunburst", $/costTree, title="算力成本三级归因旭日图（点击扇区下钻）", height=265, weight=1)',
  '  ]),',
  '  Table($/ledger, title="各业务域算力账单与缓存节流明细", searchable=true, exportable=true, showSummary=true, columns=[{ key: "domain", label: "业务域" }, { key: "cluster", label: "物理集群" }, { key: "q2Spend", label: "Q2 支出(w)" }, { key: "q3Spend", label: "Q3 支出(w)" }, { key: "cacheSaved", label: "缓存净省" }])',
  ']))',
].join('\n')

export const SHOWCASE_SRE_COMBO_CALENDAR_UI = [
  'surface("sre_combo_calendar")',
  '$/slo = 200',
  '$/traffic = [',
  '  { hour: "08:00", "在线调用(万)": 95, "离线批处理(万)": 25, "P99延迟(ms)": 88, "未命中率(%)": 12 },',
  '  { hour: "10:00", "在线调用(万)": 220, "离线批处理(万)": 65, "P99延迟(ms)": 115, "未命中率(%)": 16 },',
  '  { hour: "12:00", "在线调用(万)": 275, "离线批处理(万)": 65, "P99延迟(ms)": 142, "未命中率(%)": 19 },',
  '  { hour: "14:00", "在线调用(万)": 330, "离线批处理(万)": 80, "P99延迟(ms)": 168, "未命中率(%)": 22 },',
  '  { hour: "16:00", "在线调用(万)": 410, "离线批处理(万)": 85, "P99延迟(ms)": 224, "未命中率(%)": 31 },',
  '  { hour: "18:00", "在线调用(万)": 385, "离线批处理(万)": 75, "P99延迟(ms)": 192, "未命中率(%)": 24 },',
  '  { hour: "20:00", "在线调用(万)": 320, "离线批处理(万)": 70, "P99延迟(ms)": 148, "未命中率(%)": 18 },',
  '  { hour: "22:00", "在线调用(万)": 165, "离线批处理(万)": 45, "P99延迟(ms)": 96, "未命中率(%)": 11 }',
  ']',
  '$/uptime = [',
  '  { label: "11-07", status: "ok", note: "99.99%" }, { label: "11-08", status: "ok", note: "99.99%" },',
  '  { label: "11-09", status: "ok", note: "99.98%" }, { label: "11-10", status: "warning", note: "99.82% 晚高峰抖动" },',
  '  { label: "11-11", status: "ok", note: "99.99%" }, { label: "11-12", status: "ok", note: "100%" },',
  '  { label: "11-13", status: "ok", note: "99.99%" }, { label: "11-14", status: "ok", note: "99.98%" },',
  '  { label: "11-15", status: "ok", note: "100%" }, { label: "11-16", status: "warning", note: "99.75% 缓存预热" },',
  '  { label: "11-17", status: "ok", note: "99.99%" }, { label: "11-18", status: "ok", note: "99.99%" },',
  '  { label: "11-19", status: "ok", note: "100%" }, { label: "11-20", status: "ok", note: "99.99%" }',
  ']',
  '$/cal = [',
  '  { date: "2026-07-03", count: 6 }, { date: "2026-07-14", count: 14 }, { date: "2026-07-22", count: 9 },',
  '  { date: "2026-08-05", count: 18 }, { date: "2026-08-12", count: 11 }, { date: "2026-08-26", count: 21 },',
  '  { date: "2026-09-02", count: 8 }, { date: "2026-09-16", count: 16 }, { date: "2026-09-28", count: 24 },',
  '  { date: "2026-10-09", count: 19 }, { date: "2026-10-18", count: 12 }, { date: "2026-10-29", count: 26 },',
  '  { date: "2026-11-04", count: 15 }, { date: "2026-11-12", count: 22 }, { date: "2026-11-19", count: 28 }, { date: "2026-11-20", count: 17 }',
  ']',
  'root = Card(Column([',
  '  Row([',
  '    MetricRing("今日可用性", 99.96, max=100, unit="%", sublabel="达标 >=99.9%", tone="success", weight=1),',
  '    MetricRing("晚高峰 P99", 224, max=300, unit="ms", sublabel="16:00 触顶", tone="warning", weight=1),',
  '    MetricRing("当前 SLO 红线", $/slo, max=300, unit="ms", sublabel="实时联动图表标线", tone="brand", weight=1)',
  '  ]),',
  '  Slider("拖动实时调节双轴图右轴 SLO 红线阈值 (ms)", 140, 260, $/slo, steps=24),',
  '  Chart("combo", $/traffic, xField="hour", yField=["在线调用(万)", "离线批处理(万)"], y2Field=["P99延迟(ms)", "未命中率(%)"], referenceLine=$/slo, referenceLabel="SLO 红线", stacked=true, zoom=true, title="全天分时段吞吐量（左轴堆叠柱）vs P99 延迟与未命中率（右轴折线）", height=275),',
  '  Tracker($/uptime, title="近 14 日核心网关 SLA 可用性分片", summary="14 日均值 99.96%"),',
  '  Chart("calendar", $/cal, xField="date", yField="count", title="2026 下半年生产变更与自动化巡检热力日历", height=205)',
  ']))',
].join('\n')

export const SHOWCASE_LLM_PARALLEL_BENCHMARK_UI = [
  'surface("llm_parallel_benchmark")',
  '$/models = [',
  '  { model: "DeepSeek-R1-0528", "GPQA推理得分": 86.4, "首字响应延迟(ms)": 620, "每秒吞吐(tok/s)": 52, "百万Token成本($)": 0.14, "A2UI一次合格率(%)": 98.5 },',
  '  { model: "DeepSeek-V3-0324", "GPQA推理得分": 76.2, "首字响应延迟(ms)": 220, "每秒吞吐(tok/s)": 118, "百万Token成本($)": 0.07, "A2UI一次合格率(%)": 96.8 },',
  '  { model: "Qwen3-235B-A22B", "GPQA推理得分": 79.5, "首字响应延迟(ms)": 340, "每秒吞吐(tok/s)": 84, "百万Token成本($)": 0.28, "A2UI一次合格率(%)": 94.6 },',
  '  { model: "Claude-4-Sonnet", "GPQA推理得分": 83.8, "首字响应延迟(ms)": 480, "每秒吞吐(tok/s)": 68, "百万Token成本($)": 3.00, "A2UI一次合格率(%)": 97.9 },',
  '  { model: "Llama-4-Maverick", "GPQA推理得分": 71.4, "首字响应延迟(ms)": 260, "每秒吞吐(tok/s)": 105, "百万Token成本($)": 0.19, "A2UI一次合格率(%)": 90.2 }',
  ']',
  '$/radarDims = [',
  '  { dim: "复杂推理深度", "DeepSeek-R1": 96, "DeepSeek-V3": 84 },',
  '  { dim: "首字响应速度", "DeepSeek-R1": 72, "DeepSeek-V3": 97 },',
  '  { dim: "高并发吞吐", "DeepSeek-R1": 76, "DeepSeek-V3": 95 },',
  '  { dim: "缓存成本优势", "DeepSeek-R1": 92, "DeepSeek-V3": 99 },',
  '  { dim: "结构化JSON稳定度", "DeepSeek-R1": 99, "DeepSeek-V3": 97 }',
  ']',
  '$/options = [',
  '  { key: "v3", name: "DeepSeek-V3 主力路由", badge: "高吞吐首选", recommended: true, score: "96 / 100" },',
  '  { key: "r1", name: "DeepSeek-R1 深度推演", badge: "复杂架构首选", score: "95 / 100" },',
  '  { key: "hybrid", name: "V3+R1 分级混部网关", badge: "均衡方案", score: "98 / 100" }',
  ']',
  '$/matrixRows = [',
  '  { dimension: "常规看板首屏延迟", values: { v3: "ok:220ms 极速上屏", r1: "warn:620ms 含思维链", hybrid: "ok:235ms 智能分流" } },',
  '  { dimension: "57组件复杂组合合格率", values: { v3: "ok:96.8% 一次通过", r1: "ok:98.5% 零自愈通过", hybrid: "ok:98.4% 双重保障" } },',
  '  { dimension: "百万调用算力月成本", values: { v3: "ok:$70 / 百万Token", r1: "ok:$140 / 百万Token", hybrid: "ok:$92 / 百万Token" } }',
  ']',
  'root = Card(Column([',
  '  Row([',
  '    Chart("parallel", $/models, xField="model", yField=["GPQA推理得分", "首字响应延迟(ms)", "每秒吞吐(tok/s)", "百万Token成本($)", "A2UI一次合格率(%)"], title="五大模型跨量纲真实物理刻度平行坐标（支持轴上拖拽框选）", height=275, weight=13),',
  '    Chart("radar", $/radarDims, xField="dim", yField=["DeepSeek-R1", "DeepSeek-V3"], title="主力双模五维能力对比", height=275, weight=9)',
  '  ]),',
  '  Comparison($/options, $/matrixRows, title="生产网关主力生成式 UI 路由策略权衡")',
  ']))',
].join('\n')

export const SHOWCASE_COMPOSITION_STRESS_UI = [
  'surface("composition_stress_qa")',
  '$/slo = 200',
  '$/traffic = [',
  '  { hour: "08:00", "在线调用(万)": 95, "离线批处理(万)": 25, "P99延迟(ms)": 88, "未命中率(%)": 12 },',
  '  { hour: "10:00", "在线调用(万)": 220, "离线批处理(万)": 65, "P99延迟(ms)": 115, "未命中率(%)": 16 },',
  '  { hour: "12:00", "在线调用(万)": 275, "离线批处理(万)": 65, "P99延迟(ms)": 142, "未命中率(%)": 19 },',
  '  { hour: "14:00", "在线调用(万)": 330, "离线批处理(万)": 80, "P99延迟(ms)": 168, "未命中率(%)": 22 },',
  '  { hour: "16:00", "在线调用(万)": 410, "离线批处理(万)": 85, "P99延迟(ms)": 224, "未命中率(%)": 31 },',
  '  { hour: "18:00", "在线调用(万)": 385, "离线批处理(万)": 75, "P99延迟(ms)": 192, "未命中率(%)": 24 },',
  '  { hour: "20:00", "在线调用(万)": 320, "离线批处理(万)": 70, "P99延迟(ms)": 148, "未命中率(%)": 18 },',
  '  { hour: "22:00", "在线调用(万)": 165, "离线批处理(万)": 45, "P99延迟(ms)": 215, "未命中率(%)": 26 }',
  ']',
  '$/yearCal = [',
  '  { date: "2026-01-12", count: 8 }, { date: "2026-02-19", count: 14 }, { date: "2026-03-08", count: 11 },',
  '  { date: "2026-04-21", count: 19 }, { date: "2026-05-15", count: 16 }, { date: "2026-06-27", count: 22 },',
  '  { date: "2026-07-14", count: 12 }, { date: "2026-08-26", count: 24 }, { date: "2026-09-18", count: 17 },',
  '  { date: "2026-10-29", count: 28 }, { date: "2026-11-19", count: 25 }, { date: "2026-12-10", count: 20 }',
  ']',
  '$/arrBridge = [',
  '  { step: "Q2 基线", delta: 480, total: true },',
  '  { step: "新客签约", delta: 165 },',
  '  { step: "老客增购", delta: 110 },',
  '  { step: "缓存降本", delta: 65 },',
  '  { step: "席位缩减", delta: -52 },',
  '  { step: "客户流失", delta: -38 },',
  '  { step: "Q3 实绩", delta: 730, total: true }',
  ']',
  '$/costTree = [',
  '  { name: "AI 对话业务", children: [{ name: "R1 推理池", children: [{ name: "深度研究 36w", value: 36 }, { name: "代码审阅 18w", value: 18 }] }, { name: "V3 快回池", children: [{ name: "A2UI 渲染 16w", value: 16 }] }] },',
  '  { name: "混合检索", children: [{ name: "向量引擎", children: [{ name: "Milvus 18w", value: 18 }] }] },',
  '  { name: "评测沙箱", children: [{ name: "基准回归", children: [{ name: "自动化压测 12w", value: 12 }] }] }',
  ']',
  '$/models = [',
  '  { model: "DeepSeek-R1", "GPQA推理": 86.4, "首字延迟(ms)": 620, "吞吐(tok/s)": 52, "成本($)": 0.14, "合格率(%)": 98.5 },',
  '  { model: "DeepSeek-V3", "GPQA推理": 76.2, "首字延迟(ms)": 220, "吞吐(tok/s)": 118, "成本($)": 0.07, "合格率(%)": 96.8 },',
  '  { model: "Qwen3-235B", "GPQA推理": 79.5, "首字延迟(ms)": 340, "吞吐(tok/s)": 84, "成本($)": 0.28, "合格率(%)": 94.6 }',
  ']',
  '$/radarDims = [',
  '  { dim: "复杂推理深度", "DeepSeek-R1": 96, "DeepSeek-V3": 84 },',
  '  { dim: "首字响应速度", "DeepSeek-R1": 72, "DeepSeek-V3": 97 },',
  '  { dim: "高并发吞吐", "DeepSeek-R1": 76, "DeepSeek-V3": 95 },',
  '  { dim: "缓存成本优势", "DeepSeek-R1": 92, "DeepSeek-V3": 99 },',
  '  { dim: "结构化JSON稳定度", "DeepSeek-R1": 99, "DeepSeek-V3": 97 }',
  ']',
  'root = Card(Column([',
  '  Row([',
  '    Chart("combo", $/traffic, xField="hour", yField=["在线调用(万)", "离线批处理(万)"], y2Field=["P99延迟(ms)", "未命中率(%)"], referenceLine=$/slo, referenceLabel="SLO 200", stacked=true, zoom=true, title="并排双轴图（含缩放条+尾峰避让）", height=255, weight=1),',
  '    Chart("calendar", $/yearCal, xField="date", yField="count", title="并排全年 12 个月活跃热力日历", height=255, weight=1)',
  '  ]),',
  '  Tabs([',
  '    { title: "Grid 双列（瀑布 + 旭日）", child: Grid([Chart("waterfall", $/arrBridge, xField="step", yField="delta", referenceLine=680, referenceLabel="目标 ¥680w", title="Grid 内瀑布图", height=245), Chart("sunburst", $/costTree, title="Grid 内旭日图", height=245)], columns=2, gap="md") },',
  '    { title: "Tab 切换（平行坐标）", child: Chart("parallel", $/models, xField="model", yField=["GPQA推理", "首字延迟(ms)", "吞吐(tok/s)", "成本($)", "合格率(%)"], title="Tab 切换后动态挂载平行坐标", height=245) },',
  '    { title: "Tab 切换（全年日历）", child: Chart("calendar", $/yearCal, xField="date", yField="count", title="Tab 切换后全宽 12 个月日历", height=200) }',
  '  ]),',
  '  Accordion([',
  '    { title: "折叠面板内嵌双图（点击展开验证 ResizeObserver）", child: Row([Chart("sunburst", $/costTree, title="折叠展开旭日图", height=235, weight=1), Chart("radar", $/radarDims, xField="dim", yField=["DeepSeek-R1", "DeepSeek-V3"], title="折叠展开五维雷达", height=235, weight=1)]) }',
  '  ]),',
  '  Modal(trigger=Button(Text("在 Modal 弹窗中查看瀑布图详情"), variant="primary", action=Event("open_chart_modal")), content=Column([Text("### 弹窗内嵌图表示例"), Chart("waterfall", $/arrBridge, xField="step", yField="delta", referenceLine=680, referenceLabel="目标 ¥680w", title="Modal 内瀑布图", height=260)]))',
  ']))',
].join('\n')

export const SHOWCASE_ALL_FORMS_MEDIA_UI = [
  'surface("all_forms_media_qa")',
  '$/serviceName = "a2ui-gateway-prod"',
  '$/ownerNotes = "支持多地域灰度、自动回滚与实时延迟监控"',
  '$/cluster = "prod-hz"',
  '$/deployAt = "2026-11-20T22:30"',
  '$/enableHpa = true',
  '$/enableCanary = false',
  '$/imgPreview = "data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 480 240%27%3E%3Cdefs%3E%3ClinearGradient id=%27g%27 x1=%270%27 y1=%270%27 x2=%271%27 y2=%271%27%3E%3Cstop offset=%270%25%27 stop-color=%27%231d4ed8%27/%3E%3Cstop offset=%27100%25%27 stop-color=%27%230f766e%27/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width=%27480%27 height=%27240%27 fill=%27url(%23g)%27/%3E%3Ctext x=%27240%27 y=%27112%27 text-anchor=%27middle%27 fill=%27%23fff%27 font-size=%2724%27 font-family=%27sans-serif%27 font-weight=%27700%27%3ECluster Topology Snapshot%3C/text%3E%3Ctext x=%27240%27 y=%27146%27 text-anchor=%27middle%27 fill=%27%23cbd5e1%27 font-size=%2714%27 font-family=%27sans-serif%27%3ECN-Hangzhou · 3 AZ Active-Active%3C/text%3E%3C/svg%3E"',
  'root = Card(Column([',
  '  Row([',
  '    Icon("settings"),',
  '    Text("全量表单与多媒体混排压测台（补齐 57/57 组件）", variant="h3", weight=1),',
  '    Badge("57/57 全覆盖", tone="success"),',
  '    Divider(axis="vertical"),',
  '    Button(Text("提交校验"), variant="primary", action=Event("submit_forms"))',
  '  ], align="center"),',
  '  Divider(),',
  '  Row([',
  '    TextField("服务标识（单行输入）", value=$/serviceName, weight=1),',
  '    Select("目标生产集群（可搜索下拉）", [{ value: "prod-hz", label: "华东1 · 杭州主集群", description: "3 AZ 多活" }, { value: "prod-sh", label: "华东2 · 上海容灾集群", description: "热备" }, { value: "stg-bj", label: "华北2 · 北京预发集群" }], $/cluster, searchable=true, weight=1),',
  '    DateTimeInput($/deployAt, label="计划发布时间窗口", enableDate=true, enableTime=true, weight=1)',
  '  ]),',
  '  Grid([',
  '    TextField("变更说明与回滚备注（多行文本域）", value=$/ownerNotes, variant="longText"),',
  '    Column([',
  '      Switch("启用弹性扩缩容 (HPA)", $/enableHpa, description="CPU > 75% 自动扩容至 12 Pods"),',
  '      Switch("开启 5% 金丝雀影子流量", $/enableCanary, description="同步对比新旧网关 P99 响应差异")',
  '    ])',
  '  ], columns=2, gap="md"),',
  '  Divider(),',
  '  List([Badge("Tag: Edge-Gateway", tone="info"), Badge("Zone: cn-hz-a", tone="neutral"), Badge("SLA: 99.99%", tone="success"), Badge("A2UI v1.0", tone="warning")], direction="horizontal"),',
  '  Row([',
  '    Image($/imgPreview, description="集群拓扑预览图（点击放大）", variant="mediumFeature", fit="cover", weight=1),',
  '    Column([',
  '      Video("http://127.0.0.1:18991/demo.mp4"),',
  '      AudioPlayer("http://127.0.0.1:18991/alert.mp3", description="告警播报语音回放样本（AudioPlayer）")',
  '    ], weight=1)',
  '  ])',
  ']))',
].join('\n')

export const SHOWCASE_NARROW_WIDGET_TORTURE_UI = [
  'surface("narrow_widget_torture_qa")',
  '$/tier = "h20"',
  '$/seg = "hybrid"',
  '$/regions = ["cn-hz", "cn-sh", "cn-bj", "cn-sz"]',
  '$/specOpts = [',
  '  { value: "l20", title: "L20 · TP2", description: "48GB 轻量推理", extra: "¥18/h" },',
  '  { value: "h20", title: "H20 · TP4", description: "384GB 高并发", extra: "¥46/h", badge: "推荐" },',
  '  { value: "h800", title: "H800 · TP8", description: "640GB 满血MoE", extra: "¥118/h" }',
  ']',
  '$/kvItems = [',
  '  { label: "工单编号", value: "CHG-2026-1120-008", copyable: true, mono: true },',
  '  { label: "合规等级", value: "SOC2 Type II · VPC 隔离", tone: "success", copyable: true },',
  '  { label: "回滚策略", value: "蓝绿切流自动回退 (<30s)", copyable: true },',
  '  { label: "值班审批人", value: "SRE-林珊 / DBA-陈明" }',
  ']',
  '$/schedItems = [',
  '  { id: "s1", title: "1. 快照校验", start: "00:00", end: "01:20", status: "done", progress: 100 },',
  '  { id: "s2", title: "2. 冷分区归档", owner: "@DBA", start: "01:20", end: "03:10", status: "active", progress: 60 },',
  '  { id: "s3", title: "3. 业务回归巡检", owner: "@SRE", start: "03:20", end: "05:00", status: "pending" }',
  ']',
  '$/logs = [',
  '  { timestamp: "22:14:08", level: "error", service: "fraud-scorer", message: "TiKV region #19 read_index timeout (126.8ms > 80ms SLA)" },',
  '  { timestamp: "22:14:09", level: "warn", service: "checkout-api", message: "Fallback local risk cache engaged for 18% of requests" }',
  ']',
  '$/cmds = [',
  '  { command: "kubectl -n prod-gateway rollout status deployment/a2ui-edge-router --timeout=120s", comment: "检查边缘网关灰度滚动状态", exitCode: 0, output: "deployment a2ui-edge-router successfully rolled out" }',
  ']',
  '$/spans = [',
  '  { key: "root", label: "POST /v1/checkout/confirm", meta: "api-gateway", badge: "HTTP 200", durationMs: 184, sharePct: 100, status: "warning", children: [',
  '    { key: "s1", label: "RiskEngine.EvaluateOrderGraph", meta: "fraud-scorer", badge: "慢调用瓶颈", durationMs: 141.6, sharePct: 77, status: "error" },',
  '    { key: "s2", label: "FeatureStore.BatchFetch90d", meta: "tikv-prod", badge: "热点分片 #19", durationMs: 126.8, sharePct: 69, status: "error" }',
  '  ] }',
  ']',
  '$/resp = { policyId: "rl_90412", status: "active", updatedPods: 18 }',
  'root = Card(Column([',
  '  Row([',
  '    CheckCard("半宽 3 列 CheckCard 挤压测试", $/specOpts, value=$/tier, columns=3, weight=1),',
  '    KeyValue($/kvItems, title="半宽 2 列 Bordered KeyValue", columns=2, bordered=true, weight=1)',
  '  ]),',
  '  Row([',
  '    Schedule($/schedItems, title="半宽甘特图挤压测试", range=["00:00", "05:00"], now="02:30", weight=1),',
  '    ApiEndpoint("POST", "/v1/gateways/{gatewayId}/rate-limits/bulk-sync", summary="半宽接口契约挤压测试", status=200, latency="19 ms", responseBody=$/resp, weight=1)',
  '  ]),',
  '  Row([',
  '    LogViewer($/logs, title="半宽日志查看器", searchable=true, weight=1),',
  '    Terminal($/cmds, title="半宽命令行手册", cwd="~/prod-ops", shell="zsh", weight=1)',
  '  ]),',
  '  Row([',
  '    Tree($/spans, title="半宽 Trace 瀑布树", summary="总耗时 184ms", weight=1),',
  '    Column([',
  '      Segmented("半宽 4 项长标题分段器", [{ value: "v3", label: "DeepSeek-V3 主力" }, { value: "r1", label: "DeepSeek-R1 深度" }, { value: "hybrid", label: "混合智能路由" }, { value: "fallback", label: "降级容灾模式" }], $/seg),',
  '      MultiSelect("半宽 4 标签多选器", [{ value: "cn-hz", label: "华东1（杭州主集群）" }, { value: "cn-sh", label: "华东2（上海双活）" }, { value: "cn-bj", label: "华北2（北京预发）" }, { value: "cn-sz", label: "华南1（深圳边缘）" }], $/regions, allowCreate=true),',
  '      EntityHeader("NovaAI · 核心生产集群极长标题防挤压测试", subtitle="集群 ID: cls_hz_90812 · SRE: 林珊", avatarText="NV", status="healthy", statusLabel="SLA 达标", badge="Dedicated", tags=["VPC 专线", "ISO-27001", "多活容灾"], metrics=[{ label: "月预算", value: "¥200k" }, { label: "并发", value: "420/500" }, { label: "可用性", value: "99.96%" }])',
  '    ], weight=1)',
  '  ])',
  ']))',
].join('\n')

export const SHOWCASE_ECHARTS_REMAINING8_TORTURE_UI = [
  'surface("echarts_remaining8_torture_qa")',
  '$/pieData = [',
  '  { name: "R1 深度推理集群", value: 38 }, { name: "V3 高并发对话", value: 27 },',
  '  { name: "向量混合检索", value: 14 }, { name: "代码审阅流水线", value: 11 },',
  '  { name: "多模态视觉解析", value: 6 }, { name: "基准压测沙箱", value: 4 }',
  ']',
  '$/funnelData = [',
  '  { stage: "自然流量触达", value: 100 }, { stage: "插件市场安装", value: 62 },',
  '  { stage: "首日成功渲染", value: 41 }, { stage: "团队协作留存", value: 23 }, { stage: "企业版年框签约", value: 9 }',
  ']',
  '$/bubbleData = [',
  '  { name: "DeepSeek-V3", latency: 220, score: 78, qps: 118 },',
  '  { name: "DeepSeek-R1", latency: 620, score: 88, qps: 52 },',
  '  { name: "Qwen3-235B", latency: 340, score: 81, qps: 84 },',
  '  { name: "Claude-4", latency: 480, score: 85, qps: 68 },',
  '  { name: "Llama-4", latency: 260, score: 73, qps: 105 }',
  ']',
  '$/boxData = [',
  '  { sector: "AI 算力芯片", min: -1.2, q1: 1.4, median: 3.2, q3: 5.6, max: 8.4 },',
  '  { sector: "云原生软件", min: -2.0, q1: 0.5, median: 1.9, q3: 3.8, max: 6.1 },',
  '  { sector: "智能终端硬件", min: -1.8, q1: -0.2, median: 1.1, q3: 2.7, max: 4.5 },',
  '  { sector: "企业级数据库", min: -0.8, q1: 1.0, median: 2.4, q3: 4.2, max: 6.8 }',
  ']',
  '$/ohlcData = [',
  '  { date: "11-11", open: 3420, close: 3468, low: 3405, high: 3482 },',
  '  { date: "11-12", open: 3468, close: 3442, low: 3430, high: 3479 },',
  '  { date: "11-13", open: 3442, close: 3510, low: 3438, high: 3526 },',
  '  { date: "11-14", open: 3510, close: 3548, low: 3496, high: 3560 },',
  '  { date: "11-17", open: 3548, close: 3522, low: 3508, high: 3558 },',
  '  { date: "11-18", open: 3522, close: 3586, low: 3518, high: 3598 }',
  ']',
  '$/treeMapData = [',
  '  { name: "R1 深度推理 36w", value: 36, parent: "AI 对话" },',
  '  { name: "代码审阅 18w", value: 18, parent: "AI 对话" },',
  '  { name: "Milvus 向量 18w", value: 18, parent: "混合检索" },',
  '  { name: "A2UI 渲染 16w", value: 16, parent: "AI 对话" },',
  '  { name: "压测沙箱 12w", value: 12, parent: "质量保障" }',
  ']',
  '$/graphData = {',
  '  nodes: [',
  '    { id: "gw", name: "Edge Gateway", size: 34, group: "入口" },',
  '    { id: "auth", name: "Auth Service", size: 28, group: "核心" },',
  '    { id: "llm", name: "LLM Router", size: 36, group: "核心" },',
  '    { id: "tikv", name: "TiKV Cluster", size: 30, group: "存储" },',
  '    { id: "redis", name: "Prompt Cache", size: 28, group: "存储" }',
  '  ],',
  '  links: [',
  '    { source: "gw", target: "auth", label: "2ms" },',
  '    { source: "gw", target: "llm", label: "48ms" },',
  '    { source: "llm", target: "redis", label: "hit 76%" },',
  '    { source: "llm", target: "tikv", label: "18ms" }',
  '  ]',
  '}',
  'root = Card(Column([',
  '  Row([',
  '    Chart("pie", $/pieData, xField="name", yField="value", title="276px 窄饼图（6 项长图例挤压）", height=245, weight=1),',
  '    Chart("funnel", $/funnelData, xField="stage", yField="value", title="276px 窄漏斗图（底部细窄层）", height=245, weight=1)',
  '  ]),',
  '  Row([',
  '    Chart("scatter", $/bubbleData, xField="latency", yField="score", sizeField="qps", referenceLine=85, referenceLabel="S 级基线 85", zoom=true, title="276px 窄气泡图 + 标线 + 缩放", height=255, weight=1),',
  '    Chart("boxplot", $/boxData, xField="sector", referenceLine=6.0, referenceLabel="高波动线 6%", zoom=true, title="276px 窄箱线图 + 标线 + 缩放", height=255, weight=1)',
  '  ]),',
  '  Row([',
  '    Chart("gauge", [{ name: "核心集群健康水位", value: 78.5 }], title="276px 窄仪表盘", height=225, weight=1),',
  '    Chart("candlestick", $/ohlcData, xField="date", referenceLine=3550, referenceLabel="压力位 3550", zoom=true, title="276px 窄 K 线 + 压力位 + 缩放", height=225, weight=1)',
  '  ]),',
  '  Row([',
  '    Chart("treemap", $/treeMapData, xField="name", yField="value", seriesField="parent", title="276px 窄矩形树图", height=240, weight=1),',
  '    Chart("graph", $/graphData, title="276px 窄力导向拓扑图", height=240, weight=1)',
  '  ])',
  ']))',
].join('\n')

export const SHOWCASE_EXTREME_EDGE_TORTURE_A_UI = [
  'surface("extreme_edge_torture_a")',
  '$/selCluster = "prod-cn-hangzhou-inference-gateway-canary-v2"',
  '$/treeTarget = "svc-r1"',
  '$/refs = [',
  '  { title: "DeepSeek-R1-0528-Multi-Region-Zero-Downtime-Inference-Architecture-Whitepaper.pdf", url: "https://docs.internal.example.com/architecture/deepseek-r1-multi-region-inference-routing-2026", domain: "docs.internal.example.com", score: 0.97, snippet: "Detailed benchmark for prod-cn-hangzhou-inference-gateway-canary-v2-deployment-7f8d9c8b4a with strict SLA guarantees." },',
  '  { title: "A2UI v1.0 Generative Surface Security & CSP Governance Specification", url: "https://spec.a2ui.dev/v1/security/content-security-policy-and-expression-ast", domain: "spec.a2ui.dev", score: 0.92, snippet: "Zero arbitrary eval, strict Zod catalog schemas, and container-query responsive hardening." }',
  ']',
  '$/cmpOpts = [',
  '  { key: "pg", name: "PostgreSQL+pgvector", badge: "Recommended", recommended: true },',
  '  { key: "milvus", name: "Milvus-Distributed", badge: "High-Scale" },',
  '  { key: "es", name: "Elasticsearch-8.x", badge: "Full-Text" }',
  ']',
  '$/cmpRows = [',
  '  { dimension: "P99 Query Latency", values: { pg: "ok:14ms HNSW", milvus: "ok:9ms GPU", es: "warn:28ms JVM" } },',
  '  { dimension: "ACID Transactions", values: { pg: "ok:Native MVCC", milvus: "no:Eventual", es: "warn:Near-RT" } }',
  ']',
  '$/tblRows = [',
  '  { instance: "gpu-cn-hangzhou-a100-node-019", az: "cn-hz-az2", util: "3.2%", save: "¥12,400", detail: "Idle > 14 days on cluster prod-cn-hangzhou-inference-gateway-canary-v2" },',
  '  { instance: "gpu-cn-beijing-l20-node-088", az: "cn-bj-az1", util: "0.4%", save: "¥16,400", detail: "Zero traffic since 2026-11-02; safe to scale down to 0 replicas" }',
  ']',
  '$/diffA = "export const MAX_COLD_BOOT_BUNDLE_BUDGET_KB = 500;\\nexport async function loadEChartsChunk() { return require(\\"./client.echarts.js\\"); }"',
  '$/diffB = "export const MAX_COLD_BOOT_BUNDLE_BUDGET_KB = 100;\\nexport async function loadEChartsChunk() { return require.async(\\"./client.echarts.js\\"); }"',
  '$/lanes = [',
  '  { id: "todo", title: "Backlog", tone: "warning", items: [{ id: "t1", title: "INFRA-20261120-CANARY-ROLLBACK-VERIFY", tag: "P0-Urgent", assignee: "@oncall-sre" }] },',
  '  { id: "doing", title: "In Progress", tone: "info", items: [{ id: "t2", title: "Optimize container-query breakpoints for 306px split cards", tag: "Frontend", assignee: "@ui-team" }] },',
  '  { id: "done", title: "Verified", tone: "success", items: [{ id: "t3", title: "Audit 57/57 A2UI components", tag: "QA-Pass", assignee: "@qa-bot" }] }',
  ']',
  '$/treeOpts = [',
  '  { value: "hz", label: "prod-cn-hangzhou-primary-cluster", children: [{ value: "svc-r1", label: "deepseek-r1-0528-inference-gateway-canary-v2" }, { value: "svc-v3", label: "deepseek-v3-0324-fast-router" }] }',
  ']',
  'root = Card(Column([',
  '  Row([',
  '    ApprovalCard("Execute Zero-Downtime Partition Archival on billing_orders_2024_q1_q2", summary="Cluster: prod-cn-hangzhou-inference-gateway-canary-v2-deployment-7f8d9c", severity="high", scope="DDL-20261120-PROD-009", impacts=["Affects 14,200,000 settled rows in billing_orders_2024_q1_q2", "Dual-replica SHA-256 snapshot verified"], confirmLabel="Confirmed snapshot integrity and rollback procedure", approveAction=Event("approve_a"), rejectAction=Event("reject_a"), weight=1),',
  '    Result("success", "Multi-Region Failover & Zero-Packet-Loss Verification Completed", subtitle="Verified prod-cn-hangzhou-inference-gateway-canary-v2 RTO=4.1s (SLO < 15s)", meta=[{ label: "Run ID", value: "DR-20261120-CN-HZ-SH-0042" }, { label: "Services", value: "28 / 28 Healthy" }], weight=1)',
  '  ]),',
  '  Row([',
  '    SourceList($/refs, title="Half-Width SourceList (Long EN URLs)", weight=1),',
  '    Comparison($/cmpOpts, $/cmpRows, title="Half-Width Comparison Matrix (3 EN Options)", action=Event("pick_cmp"), weight=1)',
  '  ]),',
  '  Row([',
  '    Table($/tblRows, title="Half-Width ProTable (Expand + Search + Export)", searchable=true, exportable=true, expandKey="detail", columns=[{ key: "instance", label: "Instance" }, { key: "az", label: "AZ" }, { key: "util", label: "Util" }, { key: "save", label: "Savings" }], weight=1),',
  '    DiffView($/diffA, $/diffB, title="src/client/chunk-loader-budget-guard.ts", language="typescript", mode="split", weight=1)',
  '  ]),',
  '  Row([',
  '    Kanban($/lanes, title="Half-Width 3-Lane Kanban", weight=1),',
  '    Column([',
  '      Select("Right-Edge Searchable Select (Click to Test Popover Clamp)", [{ value: "prod-cn-hangzhou-inference-gateway-canary-v2", label: "prod-cn-hangzhou-inference-gateway-canary-v2", description: "3-AZ Active-Active · Primary Inference Router" }, { value: "prod-cn-shanghai-disaster-recovery-standby", label: "prod-cn-shanghai-disaster-recovery-standby", description: "Warm Standby · Auto-Failover < 5s" }, { value: "staging-cn-beijing-regression-sandbox", label: "staging-cn-beijing-regression-sandbox", description: "Automated A2UI Visual QA Environment" }], $/selCluster, searchable=true),',
  '      TreeSelect("Right-Edge TreeSelect (Click to Test Popover)", $/treeOpts, $/treeTarget, searchable=true),',
  '      Callout("Long Unbroken URL Overflow Guard", "Alert webhook target: https://monitoring.internal.example.com/grafana/d/a2ui-p99-latency?orgId=1&var-cluster=prod-cn-hangzhou-inference-gateway-canary-v2", tone="warning")',
  '    ], weight=1)',
  '  ])',
  ']))',
].join('\n')

export const SHOWCASE_EXTREME_EDGE_TORTURE_B_UI = [
  'surface("extreme_edge_torture_b")',
  '$/hbarData = [',
  '  { name: "DeepSeek-R1-0528 深度推理集群", score: 94 },',
  '  { name: "PostgreSQL + pgvector 混合检索", score: 88 },',
  '  { name: "A2UI 1.0 零延迟本地公式引擎", score: 82 },',
  '  { name: "Milvus 分布式向量索引服务", score: 74 },',
  '  { name: "自动化视觉回归压测沙箱集群", score: 61 }',
  ']',
  '$/negBarData = [',
  '  { month: "2026-Jan", "Revenue": 42, "Refund": -12 },',
  '  { month: "2026-Feb", "Revenue": 56, "Refund": -18 },',
  '  { month: "2026-Mar", "Revenue": 48, "Refund": -9 },',
  '  { month: "2026-Apr", "Revenue": 65, "Refund": -21 },',
  '  { month: "2026-May", "Revenue": 72, "Refund": -14 },',
  '  { month: "2026-Jun", "Revenue": 81, "Refund": -16 }',
  ']',
  '$/lineData = [',
  '  { t: "00:00", "Gateway-P99": 82, "Router-P99": 64, "Cache-P99": 18, "Storage-P99": 44 },',
  '  { t: "03:00", "Gateway-P99": 76, "Router-P99": 58, "Cache-P99": 16, "Storage-P99": 39 },',
  '  { t: "06:00", "Gateway-P99": 94, "Router-P99": 71, "Cache-P99": 21, "Storage-P99": 52 },',
  '  { t: "09:00", "Gateway-P99": 148, "Router-P99": 112, "Cache-P99": 28, "Storage-P99": 79 },',
  '  { t: "12:00", "Gateway-P99": 186, "Router-P99": 134, "Cache-P99": 34, "Storage-P99": 95 },',
  '  { t: "15:00", "Gateway-P99": 214, "Router-P99": 158, "Cache-P99": 41, "Storage-P99": 118 },',
  '  { t: "18:00", "Gateway-P99": 192, "Router-P99": 142, "Cache-P99": 36, "Storage-P99": 102 },',
  '  { t: "21:00", "Gateway-P99": 135, "Router-P99": 98, "Cache-P99": 24, "Storage-P99": 68 }',
  ']',
  '$/denseTracker = [',
  '  { label: "D01", status: "ok" }, { label: "D02", status: "ok" }, { label: "D03", status: "ok" }, { label: "D04", status: "ok" }, { label: "D05", status: "warning" },',
  '  { label: "D06", status: "ok" }, { label: "D07", status: "ok" }, { label: "D08", status: "ok" }, { label: "D09", status: "ok" }, { label: "D10", status: "ok" },',
  '  { label: "D11", status: "ok" }, { label: "D12", status: "error" }, { label: "D13", status: "ok" }, { label: "D14", status: "ok" }, { label: "D15", status: "ok" },',
  '  { label: "D16", status: "ok" }, { label: "D17", status: "ok" }, { label: "D18", status: "ok" }, { label: "D19", status: "warning" }, { label: "D20", status: "ok" },',
  '  { label: "D21", status: "ok" }, { label: "D22", status: "ok" }, { label: "D23", status: "ok" }, { label: "D24", status: "ok" }, { label: "D25", status: "ok" },',
  '  { label: "D26", status: "ok" }, { label: "D27", status: "ok" }, { label: "D28", status: "ok" }, { label: "D29", status: "ok" }, { label: "D30", status: "ok" },',
  '  { label: "D31", status: "ok" }, { label: "D32", status: "ok" }, { label: "D33", status: "ok" }, { label: "D34", status: "warning" }, { label: "D35", status: "ok" },',
  '  { label: "D36", status: "ok" }, { label: "D37", status: "ok" }, { label: "D38", status: "ok" }, { label: "D39", status: "ok" }, { label: "D40", status: "ok" },',
  '  { label: "D41", status: "ok" }, { label: "D42", status: "ok" }, { label: "D43", status: "ok" }, { label: "D44", status: "ok" }, { label: "D45", status: "ok" },',
  '  { label: "D46", status: "ok" }, { label: "D47", status: "ok" }, { label: "D48", status: "ok" }, { label: "D49", status: "ok" }, { label: "D50", status: "ok" },',
  '  { label: "D51", status: "ok" }, { label: "D52", status: "ok" }, { label: "D53", status: "ok" }, { label: "D54", status: "ok" }, { label: "D55", status: "ok" },',
  '  { label: "D56", status: "ok" }, { label: "D57", status: "ok" }, { label: "D58", status: "ok" }, { label: "D59", status: "ok" }, { label: "D60", status: "ok" }',
  ']',
  '$/miniFlow = "flowchart LR\\n  A[Client] --> B[A2UI Compiler]\\n  B --> C[Zod Guard]\\n  C --> D[DSH React UI]"',
  'root = Card(Column([',
  '  Row([',
  '    Chart("bar", $/hbarData, xField="name", yField="score", horizontal=true, referenceLine=80, referenceLabel="Target 80%", zoom=true, title="276px 水平条形图（极长 Y 轴标签 + 竖标线 + 缩放）", height=250, weight=1),',
  '    Chart("bar", $/negBarData, xField="month", yField=["Revenue", "Refund"], stacked=true, referenceLine=0, referenceLabel="Zero Baseline", title="276px 正负堆叠柱状图 + 零线", height=250, weight=1)',
  '  ]),',
  '  Row([',
  '    Mermaid($/miniFlow, title="半宽 306px Mermaid 工具栏挤压测试", weight=1),',
  '    Column([',
  '      Tracker($/denseTracker, title="半宽 60 天高密度 SLA Tracker", summary="98.3% · 60d"),',
  '      Grid([',
  '        MetricRing("峰值并发吞吐", 12480, max=20000, unit="req/s", size=68, tone="brand", sublabel="5位数字+长单位"),',
  '        MetricRing("核心链路 SLA", 99.995, max=100, unit="%", size=68, tone="success", sublabel="高精度小数")',
  '      ], columns=2, gap="sm")',
  '    ], weight=1)',
  '  ]),',
  '  Row([',
  '    Chart("line", $/lineData, xField="t", yField=["Gateway-P99", "Router-P99", "Cache-P99", "Storage-P99"], referenceLine=200, referenceLabel="SLO 200ms", zoom=true, title="276px 4 系列折线 + 标线 + 缩放", height=245, weight=1),',
  '    Chart("area", $/lineData, xField="t", yField=["Gateway-P99", "Router-P99", "Cache-P99"], referenceLine=180, referenceLabel="Warn 180ms", title="276px 3 系列面积图 + 标线", height=245, weight=1)',
  '  ])',
  ']))',
].join('\n')

export const SHOWCASE_P2_CROSSFILTER_UI = [
  'surface("p2_crossfilter")',
  '$/activeRegion = ""',
  '$/regions = [',
  '  { region: "华东", gmv: 9860, orders: 420 },',
  '  { region: "华南", gmv: 7420, orders: 315 },',
  '  { region: "华北", gmv: 6180, orders: 268 }',
  ']',
  '$/orders = [',
  '  { id: "ORD-101", region: "华东", customer: "星海智算", amount: 5200, status: "🟢 已回款" },',
  '  { id: "ORD-102", region: "华东", customer: "云帆数据", amount: 4660, status: "🟢 已回款" },',
  '  { id: "ORD-103", region: "华南", customer: "岭南数科", amount: 4120, status: "🟢 已回款" },',
  '  { id: "ORD-104", region: "华南", customer: "深湾云网", amount: 3300, status: "🟡 审批中" },',
  '  { id: "ORD-105", region: "华北", customer: "燕京实验室", amount: 3480, status: "🟢 已回款" },',
  '  { id: "ORD-106", region: "华北", customer: "星河引擎", amount: 2700, status: "🟡 审批中" }',
  ']',
  'activeLabel = cond(eq($/activeRegion, ""), "全部区域", $/activeRegion)',
  'activeGmv = lookup($/activeRegion, { "华东": "¥9,860 万", "华南": "¥7,420 万", "华北": "¥6,180 万" }, "¥23,460 万")',
  'root = Card(Column([',
  '  Row([',
  '    Text("### P2 交叉筛选 + 一键导出验证台（示例数据）"),',
  '    Badge(activeLabel, tone="info")',
  '  ], justify="spaceBetween"),',
  '  Row([',
  '    Stat("当前视图区域", activeLabel, caption="点击下方图表柱/扇区 0ms 联动", weight=1),',
  '    Stat("视图 GMV 汇总", activeGmv, delta="0ms 本地重算", trend="up", caption="无需往返 LLM", weight=1)',
  '  ]),',
  '  Row([',
  '    Chart("bar", $/regions, title="区域 GMV 柱状图（点击联动）", xField="region", yField="gmv", selected=$/activeRegion, height=230, weight=1),',
  '    Chart("pie", $/regions, title="区域营收占比（双向高亮）", xField="region", yField="gmv", selected=$/activeRegion, height=230, weight=1)',
  '  ], align="stretch"),',
  '  Table($/orders, title="订单明细 ProTable（0ms 交叉筛选）", filterField="region", filterValue=$/activeRegion, searchable=true, exportable=true, showSummary=true, columns=[{ key: "id", label: "订单号", sortable: true }, { key: "region", label: "区域", sortable: true }, { key: "customer", label: "客户" }, { key: "amount", label: "金额（万）", align: "right", sortable: true }, { key: "status", label: "状态" }])',
  ']))',
].join('\n')

export const SHOWCASE_V042_QA_UI = [
  'surface("v042_visual_qa")',
  '$/v042Logs = [',
  '  { timestamp: "14:02:11", level: "error", service: "fraud-scorer", message: "TiKV region #19 read_index timeout (126.8ms > 80ms SLA)", detail: "rpc error: code = DeadlineExceeded desc = tikv_client::read_index region=19 peer=402\\n  at RiskEngine.EvaluateOrderGraph (src/risk/scorer.ts:142)" },',
  '  { timestamp: "14:02:12", level: "warn", service: "checkout-api", message: "Fallback local risk cache engaged for 18% of requests", detail: "cache_hit_ratio=0.82 degraded_routes=[/v1/checkout/confirm]" }',
  ']',
  '$/v042Sched = [',
  '  { id: "s1", title: "1. 快照预检", owner: "@DBA", start: "00:00", end: "01:15", status: "done", progress: 100 },',
  '  { id: "s2", title: "2. 灰度切流告警", owner: "@SRE", start: "01:15", end: "03:20", status: "warning", progress: 65 },',
  '  { id: "s3", title: "3. 全量回归", owner: "@QA", start: "03:20", end: "05:00", status: "pending" }',
  ']',
  '$/v042Resp = { policyId: "rl_90412", mode: "degraded", updatedPods: 18 }',
  '$/v042Dt = "2026-11-21T14:30"',
  'root = Card(Column([',
  '  Text("### v0.4.2 视觉与交互修复对照台（Matrix auto 红黄绿 · 306px LogViewer 详情按钮 · 琥珀对比度 · 暗色日期图标）"),',
  '  Row([',
  '    Matrix(["杭州主区", "上海双活", "北京灾备"], ["Q1", "Q2", "Q3", "Q4"], [[11.2, 14.5, 22.8, 36.0], [28.4, 48.2, 62.5, 74.0], [68.0, 82.4, 91.5, 98.2]], title="Matrix(colorScale=auto) 三档红黄绿热力验证", unit="ms", colorScale="auto", showTotals=true, weight=1),',
  '    LogViewer($/v042Logs, title="306px LogViewer（含 detail 展开按钮防撑满）", searchable=true, weight=1)',
  '  ]),',
  '  Row([',
  '    ApiEndpoint("PATCH", "/v1/gateways/{gatewayId}/rate-limits/canary-policy", summary="PATCH 琥珀徽章 WCAG 对比度验证", status=200, latency="19 ms", responseBody=$/v042Resp, weight=1),',
  '    Schedule($/v042Sched, title="Schedule warning 琥珀进度条对比度验证", range=["00:00", "05:00"], now="02:30", weight=1)',
  '  ]),',
  '  Row([',
  '    Result("warning", "灰度告警回执（Warning Emblem 对比度）", subtitle="检测到北京灾备区 P99 延迟突破阈值，已触发自动限流", meta=[{ label: "告警单号", value: "ALM-20261121" }], weight=1),',
  '    Card(Column([',
  '      DateTimeInput($/v042Dt, label="暗色模式原生日历图标清晰度验证", enableDate=true, enableTime=true),',
  '      Text("验证 306px 容器内 datetime-local 不溢出且暗色图标清晰可见。", variant="caption")',
  '    ]), weight=1)',
  '  ])',
  ']))',
].join('\n')

export const SHOWCASE_COMBO_LAYOUT_AUDIT_UI = [
  'surface("combo_layout_audit")',
  '$/budget = 42',
  '$/env = "prod-hz"',
  '$/tags = []',
  '$/ownerPath = "platform/gateway"',
  '$/rangeStart = "2026-11-18T09:00"',
  '$/rangeEnd = "2026-11-21T18:30"',
  '$/deployAt = "2026-11-21T14:30"',
  '$/replicas = 6',
  '$/promptOpts = [',
  '  { value: "canary", title: "启动 10% 金丝雀发布", description: "校验 P99 < 45ms 后自动扩量", badge: "推荐" },',
  '  { value: "rollback", title: "回滚至稳定版本 v2.4.1", description: "立即恢复全量基线流量" }',
  ']',
  '$/kvAudit = [',
  '  { label: "发布工单", value: "REL-20261121-094", mono: true, copyable: true },',
  '  { label: "目标集群", value: "cn-hz-prod-mesh-01", copyable: true },',
  '  { label: "灰度窗口", value: "02:00 - 04:00 UTC+8", tone: "warning" }',
  ']',
  '$/treeAudit = [',
  '  { key: "root", label: "prod-global-mesh", badge: "3 AZ", children: [',
  '    { key: "region", label: "cn-hangzhou-primary", badge: "Active", children: [',
  '      { key: "svc", label: "edge-gateway-ingress-controller", badge: "99.99%", children: [',
  '        { key: "pod", label: "pod-edge-router-7f9b8c-x92kq", meta: "128m / 512Mi", status: "healthy" }',
  '      ] }',
  '    ] }',
  '  ] }',
  ']',
  '$/tabRows = [',
  '  { id: "SVC-01", route: "API -> Auth", p99: 18, status: "Healthy" },',
  '  { id: "SVC-02", route: "API -> Billing", p99: 84, status: "Degraded" },',
  '  { id: "SVC-03", route: "Worker -> TiKV", p99: 142, status: "Critical" },',
  '  { id: "SVC-04", route: "Edge -> Cache", p99: 6, status: "Healthy" }',
  ']',
  '$/modalSelectOpts = [',
  '  { value: "prod-hz", label: "华东1 · 杭州主集群", description: "3 AZ 多活 · 120 节点" },',
  '  { value: "prod-sh", label: "华东2 · 上海容灾集群", description: "热备 · 80 节点" },',
  '  { value: "stg-bj", label: "华北2 · 北京预发集群", description: "预发验证" }',
  ']',
  '$/modalTreeOpts = [',
  '  { value: "platform", label: "基础架构部", children: [',
  '    { value: "platform/gateway", label: "边缘网关组" },',
  '    { value: "platform/storage", label: "分布式存储组" }',
  '  ] },',
  '  { value: "ai", label: "智能引擎部", children: [',
  '    { value: "ai/inference", label: "推理加速组" }',
  '  ] }',
  ']',
  'tagSummary = cond($/tags, "已选标签", "暂无标签")',
  'root = Card(Column([',
  '  Row([',
  '    Text("### 组合实测 A：无权重 Row 塌陷 · 3/5列 Grid · Diff Split · 窄 Tabs · Modal+Select · 表单联动"),',
  '    Badge(tagSummary, tone="info")',
  '  ], justify="spaceBetween"),',
  '  Row([',
  '    DiffView("const timeoutMs = 1200\\nconst retries = 2\\nconst endpoint = \\"https://api.internal.example.com/v1/checkout\\"", "const timeoutMs = 450\\nconst retries = 3\\nconst endpoint = \\"https://edge.internal.example.com/v2/checkout\\"", title="无权重 Row 内 DiffView", filePath="src/gateway/retry.ts", language="ts", mode="split"),',
  '    KeyValue($/kvAudit, title="无权重 Row 内 KeyValue", columns=2, bordered=true)',
  '  ]),',
  '  Row([',
  '    MetricRing("核心 SLA", 99.995, max=100, unit="%", sublabel="无权重 Row 挤压", size=88, tone="success"),',
  '    CheckCard("Prompt 模式后续动作（无 value 应显示 ↗ 箭头）", $/promptOpts, action=Event("next_step_prompt"))',
  '  ]),',
  '  Grid([',
  '    MetricRing("3列 Grid 圆环", 94.6, max=100, unit="req/s", sublabel="窄容器应自动纵排", size=110, tone="brand", weight=1),',
  '    DateRange("3列 Grid 日期时间范围", start=$/rangeStart, end=$/rangeEnd, enableTime=true, presets=true, weight=1),',
  '    Tree($/treeAudit, title="3列 Grid 深层 Tree", searchable=true, expandedDepth=4, weight=1)',
  '  ], columns=3, gap="sm"),',
  '  Grid([',
  '    Stat("QPS", "48.2k", delta="+12%", trend="up"),',
  '    Stat("P99", "34 ms", delta="-4ms", trend="up"),',
  '    Stat("错误率", "0.02%", delta="稳态", trend="neutral"),',
  '    Stat("活跃 Pod", "142", delta="+8", trend="up"),',
  '    Stat("CPU 水位", "61%", delta="+3%", trend="down")',
  '  ], columns=5, gap="sm"),',
  '  Grid([',
  '    Card(Tabs([',
  '      { title: "概览总控", child: Column([Text("切换至「表格状态」排序或分页后切回，验证状态是否丢失。"), KeyValue($/kvAudit, columns=3)]) },',
  '      { title: "表格状态", child: Table($/tabRows, title="Tab 内分页表格", searchable=true, pageSize=3, columns=[{ key: "id", label: "ID", sortable: true }, { key: "route", label: "链路", sortable: true }, { key: "p99", label: "P99(ms)", align: "right", sortable: true }, { key: "status", label: "状态" }]) },',
  '      { title: "数字表单", child: Column([',
  '        Row([',
  '          Stat("格式化数值", formatNumber($/budget, 1), weight=1),',
  '          Stat("格式化预算", formatCurrency($/budget, "USD", 2), weight=1)',
  '        ]),',
  '        Row([',
  '          TextField("配额(0-100)", value=$/budget, variant="number", weight=1, ?numeric(0, 100, "请输入 0 到 100 的数字")),',
  '          DateTimeInput($/deployAt, label="发布时间", enableDate=true, enableTime=true, weight=1),',
  '          Button(Text("提交"), variant="primary", action=Event("submit_quota", { budget: $/budget }))',
  '        ]),',
  '        Row([',
  '          NumberInput("副本数", $/replicas, min=1, max=32, prefix="#", unit="pods", weight=1),',
  '          MultiSelect("治理标签（空数组 cond 检测）", [{ value: "canary", label: "金丝雀" }, { value: "strict", label: "严格校验" }, { value: "audit", label: "合规审计" }], $/tags, weight=1)',
  '        ])',
  '      ]) },',
  '      { title: "差异审阅", child: DiffView("max_conn = 512\\nkeepalive = 30s", "max_conn = 2048\\nkeepalive = 65s", filePath="nginx.conf", mode="split") },',
  '      { title: "高级配置", child: Text("第 5 个 Tab：用于验证 306px 窄卡片中多标签头是否溢出裁切。") }',
  '    ])),',
  '    Card(Column([',
  '      Text("弹窗叠加交互测试（打开 Modal -> 打开 Select/TreeSelect -> 按 Esc）", variant="h4"),',
  '      Modal(',
  '        trigger=Button(Text("打开嵌套表单审批 Modal"), variant="primary", action=Event("open_combo_modal")),',
  '        content=Column([',
  '          Text("### 嵌套浮层与审批门禁组合测试"),',
  '          Select("目标集群（Modal 内可搜索 Select）", $/modalSelectOpts, $/env, searchable=true),',
  '          TreeSelect("归属团队（Modal 内 TreeSelect）", $/modalTreeOpts, $/ownerPath, searchable=true),',
  '          ApprovalCard("授权执行生产集群配置下发", summary="将在所选集群执行滚动更新，请先测试上方下拉按 Esc 不关闭外层 Modal。", severity="high", impacts=["触发 120 节点滚动重启", "短暂影响 0.5% 长连接"], approveLabel="批准下发", rejectLabel="取消变更", approveAction=Event("approve_modal_rollout", { env: $/env, owner: $/ownerPath }), rejectAction=Event("reject_modal_rollout"))',
  '        ])',
  '      ),',
  '      DiffView("export function calcRouteWeight(latencyMs: number, errorRate: number): number {\\n  return Math.max(1, 100 - latencyMs * 0.2 - errorRate * 50)\\n}", "export function calcRouteWeight(latencyMs: number, errorRate: number): number {\\n  const penalty = latencyMs * 0.35 + errorRate * 80\\n  return Math.max(5, Math.round(100 - penalty))\\n}", title="306px 卡片内 DiffView Split 宽度校验", filePath="src/router/weight.ts", language="ts", mode="split")',
  '    ]))',
  '  ], columns=2, gap="md")',
  ']))',
].join('\n')

export const SHOWCASE_COMBO_CHARTS_MERMAID_AUDIT_UI = [
  'surface("combo_charts_mermaid_audit")',
  '$/activeRoute = ""',
  '$/heatData = [',
  '  { day: "Mon", slot: "AM", val: 24 }, { day: "Mon", slot: "PM", val: 68 }, { day: "Mon", slot: "Eve", val: 42 },',
  '  { day: "Tue", slot: "AM", val: 31 }, { day: "Tue", slot: "PM", val: 85 }, { day: "Tue", slot: "Eve", val: 54 },',
  '  { day: "Wed", slot: "AM", val: 45 }, { day: "Wed", slot: "PM", val: 92 }, { day: "Wed", slot: "Eve", val: 63 },',
  '  { day: "Thu", slot: "AM", val: 28 }, { day: "Thu", slot: "PM", val: 76 }, { day: "Thu", slot: "Eve", val: 49 }',
  ']',
  '$/slaBars = [',
  '  { svc: "Edge-Gateway-Ingress", pct: 99.2 },',
  '  { svc: "Payment-Settlement-Core", pct: 96.4 },',
  '  { svc: "Fraud-Graph-Scorer", pct: 91.8 },',
  '  { svc: "Inventory-Lock-Engine", pct: 98.1 }',
  ']',
  '$/parallelBench = [',
  '  { model: "DeepSeek-R1", "推理正确率(%)": 94, "首字延迟(ms)": 310, "吞吐速率(tok/s)": 86, "百万Token成本($)": 2.2 },',
  '  { model: "DeepSeek-V3", "推理正确率(%)": 91, "首字延迟(ms)": 145, "吞吐速率(tok/s)": 142, "百万Token成本($)": 0.9 },',
  '  { model: "Claude-Sonnet", "推理正确率(%)": 92, "首字延迟(ms)": 240, "吞吐速率(tok/s)": 95, "百万Token成本($)": 3.0 }',
  ']',
  '$/treemapData = [',
  '  { name: "推理集群", value: 520, children: [{ name: "H800 主池", value: 340 }, { name: "L20 弹性池", value: 180 }] },',
  '  { name: "存储与网关", value: 260, children: [{ name: "TiKV 热存", value: 160 }, { name: "边缘路由", value: 100 }] }',
  ']',
  '$/routeChart = [',
  '  { route: "API -> DB", reqs: 420, p99: 118 },',
  '  { route: "API -> Cache", reqs: 890, p99: 14 },',
  '  { route: "Worker -> Queue", reqs: 310, p99: 52 }',
  ']',
  '$/routeTable = [',
  '  { id: "TR-101", route: "API -> DB", latency: 118, status: "慢查询", detail: "SELECT * FROM orders WHERE tenant_id = 42 ORDER BY created_at DESC" },',
  '  { id: "TR-102", route: "API -> DB", latency: 94, status: "告警", detail: "TiKV region #19 read_index wait 86ms" },',
  '  { id: "TR-103", route: "API -> Cache", latency: 14, status: "正常", detail: "Redis cluster slot hit 99.4%" },',
  '  { id: "TR-104", route: "Worker -> Queue", latency: 52, status: "正常", detail: "Kafka partition #4 lag 12" }',
  ']',
  '$/ganttCode = "gantt\\n  title 发布窗口排期 (暗色主题对比度)\\n  dateFormat YYYY-MM-DD\\n  section 预检阶段\\n  依赖安全扫描 :done, a1, 2026-11-18, 2d\\n  压测回放验证 :active, a2, after a1, 2d\\n  section 灰度上线\\n  10% 金丝雀 :a3, after a2, 1d\\n  全量发布 :a4, after a3, 1d"',
  '$/mindmapCode = "mindmap\\n  root((A2UI 组合治理))\\n    布局容器\\n      Container Queries\\n      Grid 3-6列自适应\\n    浮层栈\\n      LIFO Escape\\n      Portal 作用域\\n    图表与图谱\\n      暗色 Token\\n      交叉筛选"',
  '$/pieCode = "pie showData\\n  title 故障根因分布 (Mermaid Pie)\\n  \\"容器挤压\\" : 38\\n  \\"浮层冲突\\" : 27\\n  \\"暗色对比度\\" : 21\\n  \\"状态丢失\\" : 14"',
  'root = Card(Column([',
  '  Text("### 组合实测 B：ECharts 暗色 Token/热力条纹/Zoom/平行坐标/Treemap/->交叉筛选 · Mermaid 暗色 Gantt/Mindmap/Pie"),',
  '  Grid([',
  '    Chart("heatmap", $/heatData, title="Heatmap 暗色 splitArea 条纹检测", xField="day", yField="slot", sizeField="val", height=220),',
  '    Chart("bar", $/slaBars, title="水平 Bar + 94% ReferenceLine + Zoom", xField="svc", yField="pct", horizontal=true, zoom=true, referenceLine=94, referenceLabel="SLA 94% 达标线", height=220)',
  '  ], columns=2, gap="md"),',
  '  Grid([',
  '    Chart("parallel", $/parallelBench, title="Parallel 4维长标题防重叠检测", xField="model", yField=["推理正确率(%)", "首字延迟(ms)", "吞吐速率(tok/s)", "百万Token成本($)"], height=230),',
  '    Chart("treemap", $/treemapData, title="Treemap 点击防卡死检测（无 breadcrumb）", height=230)',
  '  ], columns=2, gap="md"),',
  '  Row([',
  '    Chart("bar", $/routeChart, title="点击 API -> DB 联动下方表格", xField="route", yField="reqs", selected=$/activeRoute, height=200, weight=1),',
  '    Chart("line", $/routeChart, title="双指标折线（联动高亮检测）", xField="route", yField=["reqs", "p99"], selected=$/activeRoute, height=200, weight=1)',
  '  ]),',
  '  Table($/routeTable, title="链路明细表（验证 -> 匹配、expandKey、chip 清除按钮）", filterField="route", filterValue=$/activeRoute, expandKey="detail", searchable=true, pageSize=3, columns=[{ key: "id", label: "追踪ID", sortable: true }, { key: "route", label: "调用链路", sortable: true }, { key: "latency", label: "耗时(ms)", align: "right", sortable: true }, { key: "status", label: "状态" }])',
  '  ,',
  '  Grid([',
  '    Mermaid($/ganttCode, title="Mermaid Gantt（暗色条纹与窄工具栏）"),',
  '    Mermaid($/mindmapCode, title="Mermaid Mindmap（暗色节点色板）")',
  '  ], columns=2, gap="md"),',
  '  Mermaid($/pieCode, title="Mermaid Pie（暗色多色扇区 + 全屏自适应）")',
  ']))',
].join('\n')

export const SHOWCASE_COMBO_DOCK_FORMS_AUDIT_UI = [
  'surface("combo_dock_forms_audit")',
  '$/sliderZero = 0',
  '$/sliderMax = 100',
  '$/dockRegion = "cn-hz"',
  '$/avatarImg = "data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 80 80%27%3E%3Crect width=%2780%27 height=%2780%27 rx=%2740%27 fill=%27%232563eb%27/%3E%3Ctext x=%2740%27 y=%2750%27 text-anchor=%27middle%27 fill=%27%23fff%27 font-size=%2728%27 font-family=%27sans-serif%27 font-weight=%27700%27%3EAG%3C/text%3E%3C/svg%3E"',
  '$/uptime60 = [',
  '  { label: "D01", status: "ok" }, { label: "D02", status: "ok" }, { label: "D03", status: "ok" }, { label: "D04", status: "ok" }, { label: "D05", status: "ok" },',
  '  { label: "D06", status: "ok" }, { label: "D07", status: "warning", note: "抖动" }, { label: "D08", status: "ok" }, { label: "D09", status: "ok" }, { label: "D10", status: "ok" },',
  '  { label: "D11", status: "ok" }, { label: "D12", status: "ok" }, { label: "D13", status: "ok" }, { label: "D14", status: "error", note: "超时" }, { label: "D15", status: "ok" },',
  '  { label: "D16", status: "ok" }, { label: "D17", status: "ok" }, { label: "D18", status: "ok" }, { label: "D19", status: "ok" }, { label: "D20", status: "ok" },',
  '  { label: "D21", status: "ok" }, { label: "D22", status: "ok" }, { label: "D23", status: "ok" }, { label: "D24", status: "ok" }, { label: "D25", status: "ok" },',
  '  { label: "D26", status: "ok" }, { label: "D27", status: "ok" }, { label: "D28", status: "ok" }, { label: "D29", status: "ok" }, { label: "D30", status: "ok" },',
  '  { label: "D31", status: "ok" }, { label: "D32", status: "ok" }, { label: "D33", status: "ok" }, { label: "D34", status: "ok" }, { label: "D35", status: "ok" },',
  '  { label: "D36", status: "ok" }, { label: "D37", status: "ok" }, { label: "D38", status: "ok" }, { label: "D39", status: "ok" }, { label: "D40", status: "ok" },',
  '  { label: "D41", status: "ok" }, { label: "D42", status: "ok" }, { label: "D43", status: "warning", note: "限流" }, { label: "D44", status: "ok" }, { label: "D45", status: "ok" },',
  '  { label: "D46", status: "ok" }, { label: "D47", status: "ok" }, { label: "D48", status: "ok" }, { label: "D49", status: "ok" }, { label: "D50", status: "ok" },',
  '  { label: "D51", status: "ok" }, { label: "D52", status: "ok" }, { label: "D53", status: "ok" }, { label: "D54", status: "ok" }, { label: "D55", status: "ok" },',
  '  { label: "D56", status: "ok" }, { label: "D57", status: "ok" }, { label: "D58", status: "ok" }, { label: "D59", status: "ok" }, { label: "D60", status: "ok" }',
  ']',
  'root = Column([',
  '  Row([',
  '    Slider(label="左边界 0% 滑块（验证 .bare 裁切）", value=$/sliderZero, min=0, max=100, weight=1),',
  '    Slider(label="右边界 100% 滑块（验证 .bare 裁切）", value=$/sliderMax, min=0, max=100, weight=1),',
  '    Select("底部 Dock 上弹下拉", [{ value: "cn-hz", label: "杭州主区" }, { value: "cn-sh", label: "上海双活" }, { value: "cn-bj", label: "北京灾备" }, { value: "cn-sz", label: "深圳边缘" }], $/dockRegion, weight=1)',
  '  ]),',
  '  Accordion([',
  '    { title: "默认展开检查（使用 defaultOpen=true）", subtitle: "验证 defaultOpen 兼容与收起保留状态", defaultOpen: true, child: Row([Image($/avatarImg, description="值班头像", variant="avatar"), Text("Avatar 在无权重 Row 中应保持正圆无按钮边框，且右侧 AudioPlayer 不撑破窄容器。"), AudioPlayer("http://127.0.0.1:18991/alert.mp3", description="告警播报")]) }',
  '  ]),',
  '  Grid([',
  '    Tracker($/uptime60, title="3列 Grid 内 60天 Tracker", summary="99.5%"),',
  '    Code("const a2ui = { layout: \\"narrow-safe-without-title-long-unbroken-token-check_1234567890_abcdefghij\\" }"),',
  '    Card(Text("3列 Grid 内 Card 容器查询校验：确保不溢出且视觉层级清晰。"))',
  '  ], columns=3, gap="sm")',
  '])',
].join('\n')

const LONG_DIFF_BEFORE = JSON.stringify(
  Array.from({ length: 104 }, (_, i) =>
    i === 99
      ? 'const timeoutMs = 1200'
      : i === 101
        ? 'const maxRetries = 2'
        : `const step_${i + 1} = "ok_${i + 1}"`,
  ).join('\n'),
)

const LONG_DIFF_AFTER = JSON.stringify(
  Array.from({ length: 104 }, (_, i) =>
    i === 99
      ? 'const timeoutMs = 450'
      : i === 101
        ? 'const maxRetries = 4'
        : `const step_${i + 1} = "ok_${i + 1}"`,
  ).join('\n'),
)

export const SHOWCASE_COMBO_AUDIT_V046_LAYOUT_UI = [
  'surface("combo_v046_layout")',
  '$/segVal = "p99"',
  '$/sliderUnweighted = 64',
  '$/checkCard3 = "pro"',
  '$/calloutRows = [',
  '  { svc: "gateway-edge", p99: "18 ms", status: "Healthy" },',
  '  { svc: "billing-core", p99: "84 ms", status: "Degraded" },',
  '  { svc: "tikv-shard-19", p99: "142 ms", status: "Critical" }',
  ']',
  '$/kv3 = [',
  '  { label: "集群编号", value: "cn-hz-prod-01", mono: true },',
  '  { label: "拓扑版本", value: "v4.12.8" },',
  '  { label: "路由模式", value: "Active-Active" },',
  '  { label: "尾行跨3列说明", value: "此项自动跨 3 列，容器缩至 2 列时不应产生隐式第 3 列空白" }',
  ']',
  '$/overnightSchedule = [',
  '  { title: "流量排空", owner: "SRE", start: "22:00", end: "01:00", status: "done", progress: 100, note: "22:00-01:00" },',
  '  { title: "分片热迁移", owner: "DBA", start: "00:30", end: "02:30", status: "running", progress: 62, note: "00:30-02:30" },',
  '  { title: "全量回切校验", owner: "QA", start: "02:15", end: "03:45", status: "pending", progress: 35, note: "02:15-03:45" }',
  ']',
  '$/colStartChart = [',
  '  { region: "华东", qps: 420 },',
  '  { region: "华北", qps: 310 },',
  '  { region: "华南", qps: 275 }',
  ']',
  'root = Card(Column([',
  '  Text("### 组合深度实测 30：Flex-Basis 塌陷 · 3列 Grid/CheckCard 断点 · 无权重 Segmented/Slider · 跨夜 Schedule · 高精度 Progress"),',
  '  EntityHeader("prod-inference-gateway-cn-east-01-superlongtoken", subtitle="cn-hz-mesh-cluster-01.internal.example.com", avatarText="GW", status="healthy", statusLabel="运行健康 · 99.995%", tags=["Multi-AZ", "Canary"], metrics=[{ label: "QPS", value: "48.2k" }, { label: "P99", value: "24 ms" }], action=Event("inspect_entity")),',
  '  Row([',
  '    Callout("Row 内 Callout 嵌套带 weight 的 Table（验证 --a2ui-flex-basis 不塌陷为 0px）", tone="info", child=Table($/calloutRows, title="Callout 内 Table(weight=1)", weight=1))',
  '  ]),',
  '  Row([',
  '    Segmented("无权重 Row 内 4项 Segmented", ["p50", "p95", "p99", "max"], $/segVal),',
  '    Slider(label="无权重 Row 内 Slider", value=$/sliderUnweighted, min=0, max=100),',
  '    Progress(value=99.95, max=100, label="高精度 SLA Progress (99.95%)", tone="success")',
  '  ]),',
  '  Column([',
  '    Text("Column(align=start) 内含 container-type 组件（Table + Chart 不应塌陷为 0px）", variant="caption"),',
  '    Table($/calloutRows, title="align=start 内 Table"),',
  '    Chart("bar", $/colStartChart, title="align=start 内 Chart", xField="region", yField="qps", height=170)',
  '  ], align="start"),',
  '  Grid([',
  '    Card(Column([',
  '      Text("306px 内嵌套 3列 Grid & 3列 CheckCard（应折叠为单列）", variant="h4"),',
  '      Grid([',
  '        Stat("延迟 P99", "24 ms", trend="up"),',
  '        Stat("吞吐", "48k", trend="up"),',
  '        Stat("错误率", "0.01%", trend="neutral")',
  '      ], columns=3, gap="sm"),',
  '      CheckCard("3列 CheckCard 窄容器折叠验证", [{ value: "std", title: "标准版", description: "单可用区" }, { value: "pro", title: "专业版", description: "双活容灾", recommended: true }, { value: "ent", title: "旗舰版", description: "三地五中心" }], $/checkCard3, columns=3),',
  '      Row([',
  '        Card(Text("权重卡 A"), weight=1),',
  '        Card(Text("权重卡 B"), weight=1),',
  '        Card(Text("权重卡 C"), weight=1)',
  '      ])',
  '    ])),',
  '    Card(Column([',
  '      Text("306px 内 104行 Split DiffView + 跨夜 Schedule + Result 无 actionLabel", variant="h4"),',
  `      DiffView(${LONG_DIFF_BEFORE}, ${LONG_DIFF_AFTER}, title="104行 3位数行号 Split", filePath="src/gateway/timeout.ts", mode="split"),`,
  '      Schedule($/overnightSchedule, title="跨夜维护窗口 (22:00 - 04:00)", range=["22:00", "04:00"], now="01:30"),',
  '      Result("success", "灰度验证已达标", subtitle="自动提供默认行动按钮文案", action=Event("view_report"))',
  '    ]))',
  '  ], columns=2, gap="md"),',
  '  Modal(',
  '    trigger=Button(Text("打开 Modal 检验 KeyValue 3列→2列 隐式列 Bug"), variant="default", action=Event("open_kv_modal")),',
  '    content=Column([',
  '      Text("### Modal (~460px) 内 3 列 KeyValue（4 项）"),',
  '      KeyValue($/kv3, title="3列 KeyValue 缩至 2列", columns=3, bordered=true)',
  '    ])',
  '  )',
  ']))',
].join('\n')

export const SHOWCASE_COMBO_AUDIT_V046_FORMS_OVERLAYS_UI = [
  'surface("combo_v046_forms")',
  '$/name = ""',
  '$/agreed = false',
  '$/rate = 42',
  '$/replicas = ""',
  '$/emptySeg = ""',
  '$/alarmTime = "09:30"',
  '$/startDate = ""',
  '$/endDate = ""',
  '$/plan = ["pro"]',
  '$/regions = ["us-east"]',
  '$/modalTags = ["canary"]',
  '$/modalTeam = "platform"',
  '$/plainEnv = "prod-hz"',
  '$/regionStats = [',
  '  { region: "us-east", qps: 520, latency: 22 },',
  '  { region: "eu-west", qps: 380, latency: 38 },',
  '  { region: "ap-sg", qps: 290, latency: 45 }',
  ']',
  '$/regionRows = [',
  '  { id: "N-01", region: "us-east", node: "us-east-a", qps: 280, p99: "19 ms" },',
  '  { id: "N-02", region: "us-east", node: "us-east-b", qps: 240, p99: "24 ms" },',
  '  { id: "N-03", region: "eu-west", node: "eu-west-a", qps: 380, p99: "38 ms" },',
  '  { id: "N-04", region: "ap-sg", node: "ap-sg-a", qps: 290, p99: "45 ms" }',
  ']',
  '$/treeNodes = [',
  '  { value: "platform", label: "基础架构部（可直选分支）", children: [',
  '    { value: "platform/gateway", label: "边缘网关组" },',
  '    { value: "platform/storage", label: "分布式存储组" }',
  '  ] },',
  '  { value: "ai", label: "智能引擎部", children: [',
  '    { value: "ai/inference", label: "推理加速组" }',
  '  ] }',
  ']',
  'nameStatus = cond(required($/name), "名称已就绪", "待填写名称")',
  'rateHigh = cond(gt($/rate, 50), "高阈值 (>50)", "常规阈值 (<=50)")',
  'root = Card(Column([',
  '  Row([',
  '    Text("### 组合深度实测 31：表单校验 · 控件默认值 · 弹窗联动 · 多选数组交叉筛选"),',
  '    Badge(nameStatus, tone="info"),',
  '    Badge(rateHigh, tone="warning")',
  '  ], justify="spaceBetween"),',
  '  Grid([',
  '    Card(Column([',
  '      TextField("服务名称（必填）", value=$/name, placeholder="输入非空白名称", ?required("服务名称不能为空")),',
  '      TextField("限流配额 (0-100, 支持小数 1.05)", value=$/rate, variant="number", ?numeric(0, 100, "请输入 0-100 有效数字")),',
  '      CheckBox("我已阅读并同意变更风险协议（必填）", value=$/agreed, ?required("必须勾选风险协议")),',
  '      DateRange("变更窗口（起止必填）", start=$/startDate, end=$/endDate, enableTime=true, ?required("请选择完整时间窗口")),',
  '      Row([',
  '        Button(Text("校验提交表单"), variant="primary", action=Event("submit_v046_form", { name: $/name, rate: $/rate, agreed: $/agreed }), ?required($/name, "请填写服务名称"), ?required($/agreed, "请勾选风险协议"), ?numeric($/rate, 0, 100, "配额需为 0-100")),',
  '        Modal(',
  '          trigger=Button(Text("需先填名称才可打开 Modal"), variant="default", action=Event("open_gated_modal"), ?required($/name, "请先填写服务名称")),',
  '          content=Column([',
  '            Text("### 弹窗内 MultiSelect 折行 + TreeSelect 分支选择 + CopyText 不关弹窗 + 普通 Select"),',
  '            MultiSelect("多选标签（选多项验证浮层不遮挡）", [{ value: "canary", label: "金丝雀发布" }, { value: "strict", label: "严格校验" }, { value: "audit", label: "合规审计" }, { value: "dr", label: "跨区容灾" }, { value: "zero-trust", label: "零信任鉴权" }, { value: "autoscaling", label: "自动弹性扩缩" }], $/modalTags),',
  '            TreeSelect("归属团队（支持选中父节点）", $/treeNodes, $/modalTeam),',
  '            Select("普通 Select（无搜索/无描述）", [{ value: "prod-hz", label: "杭州生产" }, { value: "prod-sh", label: "上海容灾" }, { value: "stg-bj", label: "北京预发" }], $/plainEnv),',
  '            Row([',
  '              Button(Text("复制凭证（不应关闭弹窗）"), variant="default", action=copyText("dsh_demo_token_2026")),',
  '              Button(Text("确认并关闭弹窗"), variant="primary", action=Event("confirm_modal_v046", { tags: $/modalTags, team: $/modalTeam }))',
  '            ])',
  '          ])',
  '        )',
  '      ])',
  '    ])),',
  '    Card(Column([',
  '      ChoicePicker("默认单选 ChoicePicker（省略 variant 应渲染单选 Radio）", options=[{ value: "std", label: "标准版" }, { value: "pro", label: "专业版" }, { value: "ent", label: "旗舰版" }], value=$/plan),',
  '      Segmented("空值 Segmented（不应伪造首项高亮）", ["dev", "staging", "prod"], $/emptySeg),',
  '      Row([',
  '        NumberInput("空初始值副本数 (min=1)", $/replicas, min=1, max=32, unit="pods", weight=1),',
  '        DateTimeInput($/alarmTime, label="纯时间选择 (enableTime=true)", enableTime=true, weight=1)',
  '      ])',
  '    ]))',
  '  ], columns=2, gap="md"),',
  '  Card(Column([',
  '    Text("多选数组交叉筛选联动（MultiSelect ↔ Chart ↔ ProTable 共享 $/regions 数组）", variant="h4"),',
  '    MultiSelect("筛选区域（支持多选 OR 联动）", [{ value: "us-east", label: "us-east" }, { value: "eu-west", label: "eu-west" }, { value: "ap-sg", label: "ap-sg" }], $/regions),',
  '    Grid([',
  '      Chart("bar", $/regionStats, title="区域 QPS（点击联动数组）", xField="region", yField="qps", selected=$/regions, height=190),',
  '      Table($/regionRows, title="节点明细（OR 匹配多选区域）", filterField="region", filterValue=$/regions, columns=[{ key: "id", label: "ID" }, { key: "region", label: "区域" }, { key: "node", label: "节点" }, { key: "qps", label: "QPS", align: "center", sortable: true }, { key: "p99", label: "P99", align: "right", sortable: true }], showSummary=true)',
  '    ], columns=2, gap="md")',
  '  ]))',
  ']))',
].join('\n')

export const SHOWCASE_COMBO_AUDIT_V046_CHARTS_MERMAID_UI = [
  'surface("combo_v046_charts")',
  '$/scSel = ""',
  '$/calSel = ""',
  '$/gaugeData = [{ value: 72, max: 100 }]',
  '$/heatNumericY = [',
  '  { day: "Mon", count: 42, hour: 9 }, { day: "Mon", count: 88, hour: 14 }, { day: "Mon", count: 31, hour: 20 },',
  '  { day: "Tue", count: 29, hour: 9 }, { day: "Tue", count: 95, hour: 14 }, { day: "Tue", count: 54, hour: 20 },',
  '  { day: "Wed", count: 61, hour: 9 }, { day: "Wed", count: 74, hour: 14 }, { day: "Wed", count: 48, hour: 20 }',
  ']',
  '$/scatterPts = [',
  '  { svc: "Auth", latency: 18, qps: 420 },',
  '  { svc: "Billing", latency: 84, qps: 210 },',
  '  { svc: "Search", latency: 46, qps: 680 },',
  '  { svc: "Gateway", latency: 12, qps: 940 }',
  ']',
  '$/calDays = [',
  '  { date: "2026-11-01", count: 4 }, { date: "2026-11-01", count: 6 },',
  '  { date: "2026-11-05", count: 14 }, { date: "2026-11-12", count: 22 },',
  '  { date: "2026-11-18", count: 9 }, { date: "2026-11-21", count: 18 }',
  ']',
  '$/radarLong = [',
  '  { dim: "吞吐", score: 92, model: "DeepSeek-V3" }, { dim: "延迟", score: 88, model: "DeepSeek-V3" }, { dim: "成本", score: 95, model: "DeepSeek-V3" }, { dim: "稳定", score: 91, model: "DeepSeek-V3" },',
  '  { dim: "吞吐", score: 78, model: "DeepSeek-R1" }, { dim: "延迟", score: 72, model: "DeepSeek-R1" }, { dim: "成本", score: 84, model: "DeepSeek-R1" }, { dim: "稳定", score: 96, model: "DeepSeek-R1" }',
  ']',
  '$/waterfallNeg = [',
  '  { item: "期初结余", delta: 40 },',
  '  { item: "硬件折旧", delta: -65 },',
  '  { item: "带宽支出", delta: -35 },',
  '  { item: "回款冲抵", delta: 20 },',
  '  { item: "净现金流", delta: -40, isTotal: true }',
  ']',
  '$/funnelWide = [',
  '  { stage: "企业试用注册入口", count: 1000 },',
  '  { stage: "完成 API Key 配置", count: 640 },',
  '  { stage: "首周调用达标", count: 360 },',
  '  { stage: "正式签约付费", count: 180 }',
  ']',
  '$/sankeyLong = [',
  '  { source: "Onboarding Enterprise Pipeline", target: "Solution Architect Review", value: 142 },',
  '  { source: "Solution Architect Review", target: "Production Cluster Rollout", value: 98 },',
  '  { source: "Onboarding Enterprise Pipeline", target: "Self-Serve Sandbox Tier", value: 210 }',
  ']',
  '$/portraitMermaid = "flowchart TD\\n  A[\\"1. 边缘接入网关\\"] --> B[\\"2. 身份鉴权中心\\"]\\n  B --> C[\\"3. 速率限流引擎\\"]\\n  C --> D[\\"4. 推理路由调度\\"]\\n  D --> E[\\"5. 显存 KV 缓存池\\"]\\n  E --> F[\\"6. 账单计量落盘\\"]\\n  F --> G[\\"7. 审计日志归档\\"]\\n  G --> H[\\"8. 监控告警推送\\"]"',
  '$/parenRepairMermaid = "flowchart LR\\n  A[用户 (管理员)] --> B[接口 (/v1/orders)]\\n  B --> C[风控 (高敏策略)]"',
  '$/ganttLightMermaid = "gantt\\n  title Light Mode WCAG 对比度检测\\n  dateFormat YYYY-MM-DD\\n  section 发版\\n  已完成基线 :done, g1, 2026-11-18, 2d\\n  进行中压测 :active, g2, after g1, 2d\\n  待上线灰度 :g3, after g2, 2d"',
  'root = Card(Column([',
  '  Text("### 组合深度实测 32：Gauge/Heatmap数值Y/Scatter+Calendar联动/Radar分组/负值Waterfall/长Tooltip/Mermaid竖图全屏与括号修复"),',
  '  Grid([',
  '    Chart("gauge", $/gaugeData, title="CPU 使用率 (应为 72 而非 100)", height=210),',
  '    Chart("heatmap", $/heatNumericY, title="Heatmap 数值 yField=hour (应显示 9/14/20)", xField="day", yField="hour", sizeField="count", height=210)',
  '  ], columns=2, gap="md"),',
  '  Grid([',
  '    Chart("scatter", $/scatterPts, title="Scatter 点击联动（不应全部变暗）", xField="svc", yField="latency", sizeField="qps", selected=$/scSel, height=210),',
  '    Chart("calendar", $/calDays, title="Calendar 重复日汇总与点击联动", xField="date", yField="count", selected=$/calSel, height=210)',
  '  ], columns=2, gap="md"),',
  '  Grid([',
  '    Chart("radar", $/radarLong, title="Radar 长表 seriesField=model", xField="dim", yField="score", seriesField="model", height=220),',
  '    Chart("waterfall", $/waterfallNeg, title="Waterfall 负合计标签不压轴", xField="item", yField="delta", height=220)',
  '  ], columns=2, gap="md"),',
  '  Grid([',
  '    Chart("funnel", $/funnelWide, title="Funnel 窄卡标签防越界", xField="stage", yField="count", height=210),',
  '    Chart("sankey", $/sankeyLong, title="Sankey 276px 长 Tooltip 防裁切", xField="source", seriesField="target", yField="value", height=210)',
  '  ], columns=2, gap="md"),',
  '  Grid([',
  '    Mermaid($/portraitMermaid, title="竖版 Mermaid（全屏 Fit 点击 - 号缩放验证）"),',
  '    Mermaid($/parenRepairMermaid, title="括号标签修复（用户 (管理员) 不应崩溃）")',
  '  ], columns=2, gap="md"),',
  '  Mermaid($/ganttLightMermaid, title="Mermaid Gantt（亮暗双主题任务对比度）")',
  ']))',
].join('\n')

export const SHOWCASE_COMBO_AUDIT_V048_LAYOUT_OVERLAYS_UI = [
  'surface("combo_v048_layout_overlays")',
  '$/plainSel = "hz"',
  '$/searchSel = "canary"',
  '$/multiSel = ["cn-hz", "cn-sh"]',
  '$/treeSel = "prod/gateway"',
  '$/dtStart = "2026-11-22T09:00"',
  '$/dtEnd = "2026-11-22T18:30"',
  '$/dashRows = [',
  '  { svc: "gateway-edge", qps: 1420, p99: "18.4 ms", errRate: "0.02%" },',
  '  { svc: "billing-core", qps: "-", p99: "—", errRate: "0.00%" },',
  '  { svc: "search-ranker", qps: 860, p99: "42.1 ms", errRate: "0.14%" },',
  '  { svc: "vector-index", qps: 2150, p99: "11.2 ms", errRate: "0.01%" }',
  ']',
  '$/hiddenBar = [',
  '  { region: "华东", qps: 620 },',
  '  { region: "华北", qps: 480 },',
  '  { region: "华南", qps: 390 }',
  ']',
  '$/modalMermaid = "flowchart LR\\n  A[\\"Modal 入口\\"] --> B[\\"Mermaid 全屏\\"]\\n  B --> C[\\"LIFO Esc 栈\\"]"',
  '$/tabMermaid = "flowchart LR\\n  T1[\\"隐藏 Tab 2\\"] --> T2[\\"折叠 Accordion\\"]\\n  T2 --> T3[\\"展开自测宽\\"]"',
  'root = Card(Column([',
  '  Text("### 组合实测 33：无权重 Column / 长 Token / Timeline 嵌套 / 隐藏 Tab+Accordion / Modal 嵌套全浮层与 Mermaid 全屏"),',
  '  Row([',
  '    Column([',
  '      EntityHeader(',
  '        title="prod-cn-hangzhou-inference-gateway-primary-cluster-v4",',
  '        subtitle="https://ops.internal.example.com/clusters/prod-cn-hangzhou-inference-gateway-v4/overview",',
  '        status="healthy",',
  '        statusLabel="运行中",',
  '        badge="Tier-0",',
  '        metrics=[',
  '          { label: "物理集群标识", value: "us-east-1-prod-gpu-cluster-01" },',
  '          { label: "实时吞吐", value: "12,480 req/s", tone: "success" }',
  '        ]',
  '      ),',
  '      ApprovalCard(',
  '        title="高危路由切换审批",',
  '        summary="长 URL 影响范围换行测试",',
  '        severity="high",',
  '        scope="prod-cn-hangzhou-inference-gateway-v4",',
  '        impacts=[',
  '          "影响连接串：postgres://prod-rds-cluster-primary-01.internal.example.com:5432/billing_ledger_v4_partitioned",',
  '          "影响节点：kube-system/ingress-nginx-controller-prod-canary-7f8d9c6b5d-xk92m"',
  '        ],',
  '        confirmLabel="我已核验长连接串不会溢出卡片边界",',
  '        approveAction=Event("approve_v048"),',
  '        rejectAction=Event("reject_v048")',
  '      )',
  '    ]),',
  '    Column([',
  '      Result(',
  '        status="warning",',
  '        title="CanaryRolloutVerificationThresholdExceeded_20261122_ClusterHZ01",',
  '        subtitle="追踪地址：https://trace.internal.example.com/spans/8f9a1b2c3d4e5f6a7b8c9d0e1f2a3b4c",',
  '        meta=[',
  '          { label: "TraceID", value: "tr_8f9a1b2c3d4e5f6a7b8c9d0e1f2a3b4c" },',
  '          { label: "Cluster", value: "prod-cn-hz-primary-01" }',
  '        ]',
  '      ),',
  '      KeyValue([',
  '        { label: "部署批次", value: "REL-20261122" },',
  '        { label: "发布区域", value: "cn-hz-az1" },',
  '        { label: "变更人", value: "sre-oncall" },',
  '        { label: "完整工单号", value: "CHG-20261122-INFRA-9981-PROD" }',
  '      ], title="3 列 4 项 KeyValue（防 2 列空洞）", columns=3, bordered=true)',
  '    ])',
  '  ]),',
  '  Timeline([',
  '    {',
  '      time: "10:00",',
  '      title: "Timeline 子容器嵌套 Grid(Stat + Schedule) 压测",',
  '      status: "info",',
  '      actor: "release-bot-automation-pipeline",',
  '      child: Grid([',
  '        Stat("灰度流量占比", "25%", delta="+15%", trend="up", caption="目标 100%"),',
  '        Schedule([',
  '          { title: "预检快照", start: "10:00", end: "10:45", status: "done", owner: "@DBA" },',
  '          { title: "流量放量", start: "10:45", end: "12:00", status: "active", progress: 60, owner: "@SRE" }',
  '        ], title="Timeline 内嵌排期", range=["10:00", "12:30"], now="11:20")',
  '      ], columns=2, gap="sm")',
  '    }',
  '  ], title="Timeline 嵌套容器查询校验", badge="v0.4.8"),',
  '  Tabs([',
  '    {',
  '      title: "默认 Tab（带占位符 ProTable）",',
  '      child: Table(',
  '        $/dashRows,',
  '        columns=[',
  '          { key: "svc", label: "服务" },',
  '          { key: "qps", label: "QPS", sortable: true },',
  '          { key: "p99", label: "P99 延迟", sortable: true },',
  '          { key: "errRate", label: "错误率", sortable: true }',
  '        ],',
  '        title="含 - / — 占位符数值列排序与汇总检验",',
  '        searchable=true,',
  '        selectable=true,',
  '        showSummary=true,',
  '        pageSize=3',
  '      )',
  '    },',
  '    {',
  '      title: "隐藏 Tab 2（嵌套折叠图谱）",',
  '      child: Accordion([',
  '        {',
  '          title: "点击展开隐藏 Mermaid + ECharts 组合",',
  '          subtitle: "验证双层隐藏容器展开后的自测宽与渲染",',
  '          child: Grid([',
  '            Mermaid($/tabMermaid, title="Tab2+Accordion 内 Mermaid"),',
  '            Chart("bar", $/hiddenBar, title="Tab2+Accordion 内 Bar", xField="region", yField="qps", height=200)',
  '          ], columns=2, gap="md")',
  '        }',
  '      ])',
  '    }',
  '  ]),',
  '  Modal(',
  '    Button(Text("打开全浮层叠加压测 Modal（Select/MultiSelect/TreeSelect/DateRange/Mermaid）"), action=Event("open_v048_modal"), variant="primary"),',
  '    Column([',
  '      Text("#### Modal 内嵌套浮层 Z-Index 与 Escape LIFO 实测"),',
  '      Row([',
  '        Select("普通 Select (DshMenu)", [{ value: "hz", label: "杭州主集群" }, { value: "sh", label: "上海双活" }, { value: "bj", label: "北京容灾" }], $/plainSel),',
  '        Select("可搜索 Select (Portal)", [{ value: "canary", label: "Canary 10%", description: "低风险灰度" }, { value: "full", label: "Full 100%", description: "全量切流" }], $/searchSel, searchable=true)',
  '      ]),',
  '      Row([',
  '        MultiSelect("多选区域 (Portal)", [{ value: "cn-hz", label: "华东1" }, { value: "cn-sh", label: "华东2" }, { value: "cn-bj", label: "华北2" }], $/multiSel),',
  '        TreeSelect("树选目标 (Portal)", [{ label: "生产集群", children: [{ label: "网关", value: "prod/gateway" }, { label: "计费", value: "prod/billing" }] }], $/treeSel)',
  '      ]),',
  '      DateRange("Modal 内带时间 DateRange (enableTime=true)", start=$/dtStart, end=$/dtEnd, enableTime=true),',
  '      Mermaid($/modalMermaid, title="Modal 内 Mermaid（点击全屏验证 Z-Index 与 Esc LIFO）")',
  '    ])',
  '  )',
  ']))',
].join('\n')

export const SHOWCASE_COMBO_AUDIT_V048_CHARTS_INTERACTIVE_UI = [
  'surface("combo_v048_charts_interactive")',
  '$/showDynChart = false',
  '$/dynRows = [',
  '  { name: "推理网关", latency: 24 },',
  '  { name: "风控评分", latency: 68 },',
  '  { name: "向量检索", latency: 41 }',
  ']',
  '$/emptyRows = []',
  '$/negBars = [',
  '  { name: "冷存迁移", delta: -100 },',
  '  { name: "日志压缩", delta: -85 },',
  '  { name: "闲置回收", delta: -80 }',
  ']',
  '$/parallelSix = [',
  '  { model: "V3-0324", throughput: 94, latency: 18, cost: 12, context: 128, accuracy: 91, stability: 99 },',
  '  { model: "R1-0528", throughput: 68, latency: 42, cost: 28, context: 128, accuracy: 96, stability: 98 },',
  '  { model: "Lite-Q", throughput: 140, latency: 9, cost: 5, context: 64, accuracy: 82, stability: 99 }',
  ']',
  '$/sunTree = [',
  '  { name: "计算层", children: [{ name: "R1 集群", value: 42 }, { name: "V3 集群", value: 35 }] },',
  '  { name: "存储层", children: [{ name: "TiKV", value: 15 }, { name: "Milvus", value: 18 }] }',
  ']',
  '$/sunSel = ""',
  '$/boxRows = [',
  '  { pool: "HZ-A", min: 10, q1: 18, median: 26, q3: 38, max: 54 },',
  '  { pool: "SH-B", min: 14, q1: 22, median: 32, q3: 45, max: 66 },',
  '  { pool: "BJ-C", min: 8, q1: 15, median: 21, q3: 30, max: 44 }',
  ']',
  '$/boxSel = ""',
  '$/graphNodes = [',
  '  { id: "gw", label: "API Gateway", group: "edge-proxy", metric: "2.4k RPS", status: "healthy" },',
  '  { id: "chk", label: "Checkout API", group: "core-order", metric: "P99 184ms", status: "warning" },',
  '  { id: "frd", label: "Fraud Scorer · TiKV", group: "risk-engine", metric: "P99 142ms", status: "error" }',
  ']',
  '$/graphEdges = [',
  '  { from: "gw", to: "chk", label: "HTTP 200", status: "healthy" },',
  '  { from: "chk", to: "frd", label: "region #19 慢读", status: "error" },',
  '  { from: "gw", to: "frd", label: "直连回退", status: "warning" }',
  ']',
  'root = Card(Column([',
  '  Text("### 组合实测 34：动态空→有图表挂载 / 全负值参考线 / 6维平行坐标 / 层次交叉筛选 / 高精度圆环 / 拓扑跳边"),',
  '  Switch("切换动态图表数据（验证 false→true→false→true 不白屏）", $/showDynChart, description="初始为空数组，打开后应立即渲染柱状图"),',
  '  Chart("bar", cond($/showDynChart, $/dynRows, $/emptyRows), title="动态数据柱状图（含 Light Tooltip 悬停检验）", xField="name", yField="latency", height=200),',
  '  Grid([',
  '    Chart("bar", $/negBars, title="全负值柱图 + 负参考线(-79)", xField="name", yField="delta", referenceLine=-79, referenceLabel="基线 -79", height=210),',
  '    Chart("parallel", $/parallelSix, title="276px 6 维平行坐标防重叠", height=210)',
  '  ], columns=2, gap="md"),',
  '  Grid([',
  '    Chart("treemap", $/sunTree, title="Treemap 父级联动测试", selected=$/sunSel, height=210),',
  '    Chart("boxplot", $/boxRows, title="Boxplot 交叉筛选高亮测试", xField="pool", selected=$/boxSel, height=210)',
  '  ], columns=2, gap="md"),',
  '  Grid([',
  '    MetricRing("极端 SLA 精度", 99.9997, max=100, unit="%", sublabel="不应舍入为 100%", size=64, tone="success"),',
  '    MetricRing("大数窄圆环", 1234567, max=2000000, unit="req/s", sublabel="64px 防文字碰圈", size=64, tone="brand")',
  '  ], columns=2, gap="md"),',
  '  ServiceGraph($/graphNodes, $/graphEdges, title="3 节点 + group 标签 + 跨层跳边拓扑（LR 防裁切）", direction="LR")',
  ']))',
].join('\n')

export const SHOWCASE_V050_CHARTS_UI = [
  'surface("v050_nextgen_charts")',
  '$/rangeData = [',
  '  { day: "周一", low: 140, forecast: 185, high: 230 },',
  '  { day: "周二", low: 155, forecast: 205, high: 260 },',
  '  { day: "周三", low: 180, forecast: 248, high: 320 },',
  '  { day: "周四", low: 165, forecast: 222, high: 285 },',
  '  { day: "周五", low: 150, forecast: 198, high: 255 }',
  ']',
  '$/bulletData = [',
  '  { label: "季度 ARR 达成", value: 92, target: 90, max: 110, ranges: [65, 85, 110] },',
  '  { label: "Prompt 缓存命中", value: 78, target: 85, max: 100, ranges: [55, 80, 100] },',
  '  { label: "首编一次通过率", value: 84, target: 80, max: 100, ranges: [60, 80, 100] }',
  ']',
  '$/histLatency = [14, 18, 19, 22, 24, 25, 28, 30, 31, 33, 35, 39, 44, 48, 55, 68, 79, 94, 112, 136]',
  '$/dumbbellData = [',
  '  { name: "支付结算 P99", before: 420, after: 118 },',
  '  { name: "订单检索 P99", before: 295, after: 86 },',
  '  { name: "账单聚合 P99", before: 510, after: 164 },',
  '  { name: "风控打分 P99", before: 190, after: 62 }',
  ']',
  '$/roseData = [',
  '  { name: "深度推理", value: 44 },',
  '  { name: "代码生成", value: 36 },',
  '  { name: "文档检索", value: 25 },',
  '  { name: "数据可视化", value: 29 },',
  '  { name: "运维排障", value: 19 }',
  ']',
  '$/radialData = [',
  '  { name: "GPU 算力", value: 86, max: 100 },',
  '  { name: "显存带宽", value: 74, max: 100 },',
  '  { name: "KV Cache", value: 91, max: 100 },',
  '  { name: "网络吞吐", value: 63, max: 100 }',
  ']',
  '$/chordData = {',
  '  nodes: [{ name: "Gateway" }, { name: "Order" }, { name: "Payment" }, { name: "Risk" }, { name: "Ledger" }],',
  '  links: [',
  '    { source: "Gateway", target: "Order", value: 64 },',
  '    { source: "Order", target: "Payment", value: 52 },',
  '    { source: "Payment", target: "Risk", value: 38 },',
  '    { source: "Risk", target: "Payment", value: 24 },',
  '    { source: "Payment", target: "Ledger", value: 48 },',
  '    { source: "Ledger", target: "Gateway", value: 18 }',
  '  ]',
  '}',
  '$/pctStack = [',
  '  { q: "Q1", ok: 910, warn: 65, err: 25 },',
  '  { q: "Q2", ok: 942, warn: 44, err: 14 },',
  '  { q: "Q3", ok: 968, warn: 24, err: 8 },',
  '  { q: "Q4", ok: 981, warn: 15, err: 4 }',
  ']',
  '$/stepReplicas = [',
  '  { t: "08:00", pods: 6 },',
  '  { t: "10:00", pods: 18 },',
  '  { t: "12:00", pods: 24 },',
  '  { t: "16:00", pods: 16 },',
  '  { t: "22:00", pods: 8 }',
  ']',
  '$/quadrantData = [',
  '  { name: "pgvector", cost: 28, score: 84 },',
  '  { name: "Milvus", cost: 62, score: 91 },',
  '  { name: "Qdrant", cost: 34, score: 88 },',
  '  { name: "ES-Dense", cost: 74, score: 79 }',
  ']',
  'root = Card(Column([',
  '  Text("### v0.5.0 新增 7 类图表与 5 项图表增强（276px 双栏实测）"),',
  '  Row([',
  '    Chart("range", $/rangeData, title="95% 置信预测区间带 + 故障窗口", xField="day", yField="forecast", referenceLine=260, referenceLabel="警戒 260", markArea=[{ start: "周二", end: "周四", label: "大促窗口", tone: "warning" }], height=230, weight=1),',
  '    Chart("bullet", $/bulletData, title="OKR 与 SLO 目标子弹图", xField="label", yField="value", height=230, weight=1)',
  '  ], align="stretch"),',
  '  Row([',
  '    Chart("histogram", $/histLatency, title="请求延迟自动分箱直方图", referenceLine=80, referenceLabel="P95 80ms", height=230, weight=1),',
  '    Chart("dumbbell", $/dumbbellData, title="性能优化前后哑铃图 (ms)", xField="name", height=230, weight=1)',
  '  ], align="stretch"),',
  '  Row([',
  '    Chart("rose", $/roseData, title="场景调用南丁格尔玫瑰图", xField="name", yField="value", height=230, weight=1),',
  '    Chart("radialBar", $/radialData, title="集群资源玉玦环形柱图", xField="name", yField="value", height=230, weight=1)',
  '  ], align="stretch"),',
  '  Row([',
  '    Chart("chord", $/chordData, title="微服务双向调用弦图 (ECharts 6)", height=240, weight=1),',
  '    Chart("scatter", $/quadrantData, title="检索方案成本-得分四象限", xField="cost", yField="score", referenceLine=85, referenceLabel="达标 85", referenceX=50, referenceXLabel="成本中位", height=240, weight=1)',
  '  ], align="stretch"),',
  '  Row([',
  '    Chart("bar", $/pctStack, title="100% 归一化堆叠占比", xField="q", yField=["ok", "warn", "err"], stackMode="percent", height=220, weight=1),',
  '    Chart("line", $/stepReplicas, title="HPA 副本阶梯折线 (对数轴)", xField="t", yField="pods", step=true, yScale="log", height=220, weight=1)',
  '  ], align="stretch")',
  ']))',
].join('\n')

const COMPARE_BEFORE_SVG =
  'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20400%20220%22%3E%3Crect%20width%3D%22400%22%20height%3D%22220%22%20fill%3D%22%231e293b%22%2F%3E%3Crect%20x%3D%2224%22%20y%3D%2228%22%20width%3D%22160%22%20height%3D%22164%22%20rx%3D%2210%22%20fill%3D%22%23334155%22%2F%3E%3Crect%20x%3D%22204%22%20y%3D%2228%22%20width%3D%22172%22%20height%3D%22164%22%20rx%3D%2210%22%20fill%3D%22%23ef4444%22%20fill-opacity%3D%220.45%22%2F%3E%3Ctext%20x%3D%2240%22%20y%3D%22118%22%20fill%3D%22%23f8fafc%22%20font-size%3D%2218%22%20font-family%3D%22sans-serif%22%3EBefore%20Layout%3C%2Ftext%3E%3C%2Fsvg%3E'

const COMPARE_AFTER_SVG =
  'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20400%20220%22%3E%3Crect%20width%3D%22400%22%20height%3D%22220%22%20fill%3D%22%230f172a%22%2F%3E%3Crect%20x%3D%2224%22%20y%3D%2228%22%20width%3D%22160%22%20height%3D%22164%22%20rx%3D%2210%22%20fill%3D%22%232563eb%22%20fill-opacity%3D%220.55%22%2F%3E%3Crect%20x%3D%22204%22%20y%3D%2228%22%20width%3D%22172%22%20height%3D%22164%22%20rx%3D%2210%22%20fill%3D%22%2310b981%22%20fill-opacity%3D%220.55%22%2F%3E%3Ctext%20x%3D%22220%22%20y%3D%22118%22%20fill%3D%22%23f8fafc%22%20font-size%3D%2218%22%20font-family%3D%22sans-serif%22%3EAfter%20Fixed%3C%2Ftext%3E%3C%2Fsvg%3E'

export const SHOWCASE_V050_WIDGETS_UI = [
  'surface("v050_nextgen_widgets")',
  '$/budgetMin = 120',
  '$/budgetMax = 480',
  '$/checkedItems = ["snap"]',
  '$/rankItems = [',
  '  { id: "p1", title: "补齐 0ms 区间过滤", subtitle: "RangeSlider + 条件聚合", badge: "P0", tone: "danger" },',
  '  { id: "p2", title: "分布式 Trace 偏移瀑布", subtitle: "Tree offsetPct 升级", badge: "P1", tone: "warning" },',
  '  { id: "p3", title: "多文件 PR 审阅批注", subtitle: "DiffView files + annotations", badge: "P1", tone: "info" }',
  ']',
  '$/envVars = [',
  '  { key: "NODE_ENV", value: "production" },',
  '  { key: "MAX_CONCURRENCY", value: "64" },',
  '  { key: "OPENAI_API_KEY", value: "sk-demo-masked" }',
  ']',
  '$/starScore = 4.5',
  '$/likertScore = 4',
  '$/checkList = [',
  '  { id: "snap", label: "已完成生产库逻辑快照", description: "Snapshot #20261122 校验通过", required: true, tag: "DBA", tone: "success" },',
  '  { id: "canary", label: "已配置 5% 灰度流量观察窗口", required: true, tag: "SRE", tone: "warning" },',
  '  { id: "notify", label: "同步变更公告至值班频道", required: false, tag: "Ops", tone: "info" }',
  ']',
  '$/clauseText = "乙方应在收到书面通知后 72 小时内完成漏洞修复；若因重大过失导致客户核心交易数据泄露，违约金上限为合同年费的 300%，且甲方保留单方即时解约权。"',
  '$/clauseAnns = [',
  '  { match: "72 小时内完成漏洞修复", label: "SLA 时限", tone: "info", note: "建议高危 P0 缩短至 24 小时响应", sourceId: "SEC-4.2" },',
  '  { match: "违约金上限为合同年费的 300%", label: "高赔付风险", tone: "danger", note: "高于行业常规 100% 封顶条款，需法务复核", sourceId: "LEGAL-9.1" },',
  '  { match: "单方即时解约权", label: "解约条款", tone: "warning", note: "建议补充 15 日整改宽限期", sourceId: "LEGAL-12.3" }',
  ']',
  'budgetSpan = calc("hi - lo", { lo: $/budgetMin, hi: $/budgetMax })',
  'root = Card(Column([',
  '  Text("### v0.5.0 新增 7 大零依赖交互原语（306px 双栏实测）"),',
  '  Row([',
  '    Card(Column([',
  '      RangeSlider("月度算力预算区间", 50, 800, $/budgetMin, $/budgetMax, step=10, prefix="¥", unit="k"),',
  '      Stat("当前预算跨度", concat(["¥", formatNumber(budgetSpan), "k"]), caption="0ms 联动计算")',
  '    ]), weight=1),',
  '    Card(Column([',
  '      Rating("方案综合评分 (半星)", $/starScore, max=5, allowHalf=true, labels=["差", "较差", "一般", "良好", "极佳"]),',
  '      Rating("上线信心度 (量表)", $/likertScore, max=5, variant="scale")',
  '    ]), weight=1)',
  '  ], align="stretch"),',
  '  Row([',
  '    Checklist($/checkList, value=$/checkedItems, title="生产发布 Pre-flight 核查清单", actionLabel="确认放行发布", action=Event("approve_checklist"), weight=1),',
  '    SortableList($/rankItems, title="迭代优先级拖拽排序", weight=1)',
  '  ], align="stretch"),',
  '  Row([',
  '    KvEditor($/envVars, title="动态环境变量编辑器 (自动脱敏)", keyLabel="变量名", valueLabel="配置值", weight=1),',
  '    ImageCompare(' +
    JSON.stringify(COMPARE_BEFORE_SVG) +
    ', ' +
    JSON.stringify(COMPARE_AFTER_SVG) +
    ', beforeLabel="修复前", afterLabel="修复后", title="视觉 QA 滑动对比器", height=200, weight=1)',
  '  ], align="stretch"),',
  '  AnnotationText($/clauseText, $/clauseAnns, title="合同风控条款实体高亮与句级溯源", action=Event("inspect_clause"))',
  ']))',
].join('\n')

export const SHOWCASE_V050_UPGRADES_UI = [
  'surface("v050_inplace_upgrades")',
  '$/selectedRegions = []',
  '$/orders = [',
  '  { id: "ORD-201", region: "华东", service: "gateway-hz", load: 86, delta: "+14.2%", trend: [18, 22, 25, 29, 34], status: "ok:正常", amount: 5200 },',
  '  { id: "ORD-202", region: "华东", service: "checkout-hz", load: 74, delta: "+8.5%", trend: [24, 23, 26, 28, 31], status: "ok:正常", amount: 4660 },',
  '  { id: "ORD-203", region: "华南", service: "fraud-sz", load: 93, delta: "-4.1%", trend: [40, 38, 35, 33, 30], status: "warn:预警", amount: 4120 },',
  '  { id: "ORD-204", region: "华北", service: "ledger-bj", load: 97, delta: "-9.8%", trend: [52, 48, 42, 39, 31], status: "no:熔断", amount: 2700 }',
  ']',
  '$/traceTree = [',
  '  { id: "root", label: "POST /v1/checkout", metric: "420ms", sharePct: 100, offsetPct: 0, status: "warning", children: [',
  '    { id: "auth", label: "jwt.verify", metric: "32ms", sharePct: 8, offsetPct: 0, status: "healthy" },',
  '    { id: "risk", label: "risk.score", metric: "198ms", sharePct: 47, offsetPct: 8, status: "error" },',
  '    { id: "ledger", label: "ledger.commit", metric: "152ms", sharePct: 36, offsetPct: 55, status: "warning" },',
  '    { id: "emit", label: "kafka.publish", metric: "38ms", sharePct: 9, offsetPct: 91, status: "healthy" }',
  '  ] }',
  ']',
  '$/prFiles = [',
  '  { path: "src/gateway/limiter.ts", title: "limiter.ts", language: "typescript", before: "export const LIMIT = 1000\\nexport const BURST = 200", after: "export const LIMIT = 2500\\nexport const BURST = 500\\nexport const FALLBACK = true", annotations: [{ line: 3, side: "after", author: "@reviewer", tone: "warning", message: "确认降级开关开启时已记录熔断指标" }] },',
  '  { path: "config/canary.yaml", title: "canary.yaml", language: "yaml", before: "weight: 5\\ntimeoutMs: 3000", after: "weight: 20\\ntimeoutMs: 1500" }',
  ']',
  'totalAmt = sum($/orders, "amount", "region", $/selectedRegions)',
  'avgAmt = avg($/orders, "amount", "region", $/selectedRegions)',
  'matchedCount = count($/orders, "region", $/selectedRegions)',
  'maxLoad = max($/orders, "load", "region", $/selectedRegions)',
  'root = Card(Column([',
  '  Text("### v0.5.0 原地升级：语义列 ProTable + 0ms 条件聚合 + 偏移 Trace 树 + 多文件批注 Diff"),',
  '  MultiSelect("按区域 0ms 动态重算聚合指标", [{ value: "华东", label: "华东" }, { value: "华南", label: "华南" }, { value: "华北", label: "华北" }], $/selectedRegions),',
  '  Row([',
  '    Stat("匹配订单数", matchedCount, weight=1),',
  '    Stat("动态总额", formatCurrency(totalAmt, "CNY", 0), trend="up", weight=1),',
  '    Stat("均单金额", formatCurrency(avgAmt, "CNY", 0), weight=1),',
  '    Stat("峰值负载", concat([formatNumber(maxLoad), "%"]), weight=1)',
  '  ]),',
  '  Table($/orders, title="语义格式化 ProTable (固定首列)", filterField="region", filterValue=$/selectedRegions, stickyFirstColumn=true, searchable=true, exportable=true, showSummary=true, columns=[{ key: "id", label: "单号", format: "code" }, { key: "region", label: "区域" }, { key: "load", label: "负载", format: "bar", max: 100 }, { key: "delta", label: "环比", format: "delta" }, { key: "trend", label: "近 5 轮", format: "sparkline" }, { key: "status", label: "状态", format: "badge" }, { key: "amount", label: "金额", align: "right" }]),',
  '  Row([',
  '    Tree($/traceTree, title="带 offsetPct 偏移的分布式 Trace 瀑布", summary="Total 420ms", weight=1),',
  '    DiffView(files=$/prFiles, title="多文件 PR 审阅与行内批注", weight=1)',
  '  ], align="stretch")',
  ']))',
].join('\n')

export const SHOWCASE_COMBO_AUDIT_V050_WIDGETS_UI = [
  'surface("v050_combo_audit_widgets")',
  '$/chkItems = [',
  '  { id: "snap", label: "生产库逻辑快照已校验", required: true, tag: "DBA", tone: "success" },',
  '  { id: "canary", label: "5% 灰度流量观察窗口已开启", required: true, tag: "SRE", tone: "warning" }',
  ']',
  '$/chkVal = ["snap"]',
  '$/srtItems = ["补齐 Row Flex 泛化契约", "修复 ProTable 固定首列配色", "统一 Modal Action 派发器"]',
  '$/envObj = { HOST: "api.prod.internal", PORT: "8080", API_TOKEN: "sk-demo-secret" }',
  '$/stickyRows = [',
  '  { svc: "gateway-hz", port: 8080, region: "华东杭州 AZ1", load: 86, owner: "林珊", cluster: "prod-cn-hz-r1-pool-01", cost: 5200, detail: "ingress-nginx -> envoy-v1.31\\nmaxConns=20000" },',
  '  { svc: "checkout-hz", port: 8443, region: "华东杭州 AZ2", load: 74, owner: "陈远", cluster: "prod-cn-hz-r1-pool-02", cost: 4660, detail: "grpc keepalive 30s\\nretryBudget=15%" },',
  '  { svc: "fraud-sz", port: 9090, region: "华南深圳 AZ1", load: 94, owner: "周明", cluster: "prod-cn-sz-risk-01", cost: 4120, detail: "tikv-region-#19 hot read" }',
  ']',
  '$/modalCluster = "hz"',
  '$/modalTree = [',
  '  { id: "root", label: "cn-hz-prod-mesh", metric: "184ms", sharePct: 100, status: "healthy", children: [',
  '    { id: "gw", label: "api-gateway", metric: "42ms", sharePct: 23, status: "healthy" },',
  '    { id: "risk", label: "fraud-scorer", metric: "142ms", sharePct: 77, status: "warning" }',
  '  ] }',
  ']',
  'root = Card(Column([',
  '  Text("### 组合实测 38：无权重 v0.5.0 卡片并排 / 长标签对比 / 对象 KV 编辑 / 多列 Sticky ProTable / 字面量交互 / Modal 动作"),',
  '  Row([',
  '    Checklist($/chkItems, value=$/chkVal, title="无 weight 核查清单"),',
  '    SortableList($/srtItems, title="无 weight 优先级排序")',
  '  ], align="stretch"),',
  '  Row([',
  '    KvEditor($/envObj, title="对象模式 KV 编辑 (防删行)"),',
  '    ImageCompare(' +
    JSON.stringify(COMPARE_BEFORE_SVG) +
    ', ' +
    JSON.stringify(COMPARE_AFTER_SVG) +
    ', beforeLabel="优化前布局 · 2026Q3 生产基线快照", afterLabel="泛化修复后 · 306px 双栏自适应对照", title="长标签滑动对比器", height=190)',
  '  ], align="stretch"),',
  '  Table($/stickyRows, title="Sticky 首列 + 展开 + 多选 + 数值 code 端口列", stickyFirstColumn=true, selectable=true, expandKey="detail", showSummary=true, columns=[{ key: "svc", label: "服务名" }, { key: "port", label: "端口", format: "code" }, { key: "region", label: "可用区" }, { key: "load", label: "负载", format: "bar", max: 100 }, { key: "owner", label: "负责人" }, { key: "cluster", label: "物理集群节点标识" }, { key: "cost", label: "月耗", align: "right" }]),',
  '  Row([',
  '    Card(RangeSlider("独立区间滑块 (字面量初值)", 0, 100, 20, 75, step=5, unit="%"), weight=1),',
  '    Card(Rating("独立星级评分 (字面量初值)", 3, max=5, labels=["差", "较差", "一般", "良好", "极佳"]), weight=1)',
  '  ], align="stretch"),',
  '  Modal(Button(Text("打开 Modal 组合压测 (Select Esc LIFO + Tree Action)"), variant="primary", action=Event("open_modal_combo")), Column([',
  '    Text("验证弹窗内 Select 按 Esc 仅关下拉，点击 Tree 节点派发 Action 后自动关闭弹窗。"),',
  '    Select("目标集群", [{ value: "hz", label: "杭州主群" }, { value: "sh", label: "上海双活" }], $/modalCluster, searchable=true),',
  '    Tree($/modalTree, title="点击节点派发并关闭 Modal", action=Event("inspect_modal_node"))',
  '  ]))',
  ']))',
].join('\n')

export const SHOWCASE_COMBO_AUDIT_V050_CHARTS_UI = [
  'surface("v050_combo_audit_charts")',
  '$/negRange = [',
  '  { day: "周一", low: -20, forecast: 30, high: 95 },',
  '  { day: "周二", low: -5, forecast: 120, high: 195 },',
  '  { day: "周三", low: 40, forecast: 210, high: 300 },',
  '  { day: "周四", low: 25, forecast: 175, high: 260 },',
  '  { day: "周五", low: 10, forecast: 140, high: 220 }',
  ']',
  '$/selRange = "周三"',
  '$/bulletData = [',
  '  { label: "季度 ARR 达成", value: 92, target: 90, max: 110, ranges: [65, 85, 110] },',
  '  { label: "Prompt 缓存命中", value: 78, target: 85, max: 100, ranges: [55, 80, 100] },',
  '  { label: "首编一次通过率", value: 84, target: 80, max: 100, ranges: [60, 80, 100] }',
  ']',
  '$/selBullet = "季度 ARR 达成"',
  '$/dumbbellData = [',
  '  { name: "支付结算 P99", before: 420, after: 118 },',
  '  { name: "订单检索 P99", before: 295, after: 86 },',
  '  { name: "账单聚合 P99", before: 510, after: 164 },',
  '  { name: "风控打分 P99", before: 190, after: 62 }',
  ']',
  '$/selDumbbell = "支付结算 P99"',
  '$/logQuad = [',
  '  { name: "pgvector", cost: 28, score: 84 },',
  '  { name: "Milvus", cost: 62, score: 91 },',
  '  { name: "Qdrant", cost: 34, score: 88 },',
  '  { name: "ColdStart", cost: 18, score: 0 },',
  '  { name: "ES-Dense", cost: 74, score: 79 }',
  ']',
  '$/radialFive = [',
  '  { name: "GPU 算力", value: 86, max: 100 },',
  '  { name: "显存带宽", value: 74, max: 100 },',
  '  { name: "KV Cache", value: 91, max: 100 },',
  '  { name: "网络吞吐", value: 63, max: 100 },',
  '  { name: "磁盘 IOPS", value: 52, max: 100 }',
  ']',
  '$/histLatency = [14, 18, 19, 22, 24, 25, 28, 30, 31, 33, 35, 39, 44, 48, 55, 68, 79, 94, 112, 136]',
  'root = Card(Column([',
  '  Text("### 组合实测 39：区间/子弹/哑铃交叉筛选隔离 + 负值偏移参考线 + 对数散点防零 + 5项玉玦图 + 直方图整洁分箱"),',
  '  Row([',
  '    Chart("range", $/negRange, title="负值区间带 + 高标线(360) + 交叉筛选", xField="day", yField="forecast", referenceLine=360, referenceLabel="上限 360", markArea=[{ axis: "y", start: -15, end: 5, label: "零下带", tone: "info" }], selected=$/selRange, height=230, weight=1),',
  '    Chart("bullet", $/bulletData, title="子弹图交叉筛选 + 垂直居中", xField="label", yField="value", selected=$/selBullet, height=230, weight=1)',
  '  ], align="stretch"),',
  '  Row([',
  '    Chart("dumbbell", $/dumbbellData, title="哑铃图交叉筛选 (连接线防污染)", xField="name", selected=$/selDumbbell, height=230, weight=1),',
  '    Chart("scatter", $/logQuad, title="对数散点(含0) + 越界参考X(95)", xField="cost", yField="score", yScale="log", referenceLine=85, referenceLabel="达标 85", referenceX=95, referenceXLabel="极限 95", height=230, weight=1)',
  '  ], align="stretch"),',
  '  Row([',
  '    Chart("radialBar", $/radialFive, title="5 项玉玦图标签留白校验", xField="name", yField="value", height=230, weight=1),',
  '    Chart("histogram", $/histLatency, title="整数延迟整洁分箱 + CSV 导出", referenceLine=80, referenceLabel="P95 80ms", height=230, weight=1)',
  '  ], align="stretch")',
  ']))',
].join('\n')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function extractText(content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === 'object' && part !== null && 'text' in part ? String(part.text) : '',
      )
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
          tool_calls: [
            { index: 0, id: callId, type: 'function', function: { name: toolName, arguments: '' } },
          ],
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
      let payload
      try {
        payload = JSON.parse(body || '{}')
      } catch (err) {
        res.writeHead(400, { 'content-type': 'application/json' })
        res.end(
          JSON.stringify({
            error: {
              message: `Invalid JSON request body: ${err instanceof Error ? err.message : String(err)}`,
              type: 'invalid_request_error',
            },
          }),
        )
        return
      }
      if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        res.writeHead(400, { 'content-type': 'application/json' })
        res.end(
          JSON.stringify({
            error: {
              message: 'Request body must be a JSON object',
              type: 'invalid_request_error',
            },
          }),
        )
        return
      }
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
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'A2UI 交互演示' },
                finish_reason: 'stop',
              },
            ],
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
          const autoTitle = /\bshowcase-16\b/i.test(allText)
            ? '2026 Q3 营收增减归因与算力成本多层分摊台'
            : /\bshowcase-17\b/i.test(allText)
              ? '推理网关吞吐量、SLO 延迟与变更热力日历'
              : /\bshowcase-25\b/i.test(allText)
                ? '图表与 ProTable 0ms 双向交叉筛选工作台'
                : /\bshowcase-1(?!\d)/i.test(allText)
                  ? '2026 Q3 业务增长与全链路转化诊断大盘'
                  : /\bshowcase-2(?!\d)/i.test(allText)
                    ? 'dsh-genui-a2ui 分层系统架构全景与源码导航'
                    : /\bshowcase-3(?!\d)/i.test(allText)
                      ? '大模型推理算力与缓存成本测算沙盘'
                      : /\bshowcase-4(?!\d)/i.test(allText)
                        ? '核心分包加载策略变更审批'
                        : /\bshowcase-5(?!\d)/i.test(allText)
                          ? 'v0.4.7 开源发布质量门禁流水线'
                          : /\bshowcase-6(?!\d)/i.test(allText)
                            ? '连锁门店今日实时经营仪表盘'
                            : /\bshowcase-7(?!\d)/i.test(allText)
                              ? '支付结算链路 P99 延迟突增拓扑与瀑布诊断'
                              : /\bshowcase-8(?!\d)/i.test(allText)
                                ? '专属推理集群季度巡检与 ProTable 治理台'
                                : /\bshowcase-9(?!\d)/i.test(allText)
                                  ? '私有化大模型集群规格选型与容量规划台'
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

      const isShowcase1 = /\bshowcase-1(?!\d)|全链路转化诊断|conversion diagnostic dashboard/i.test(
        userText,
      )
      const isShowcase2 =
        /\bshowcase-2(?!\d)|核心模块分层|Mermaid 架构图|layered Mermaid diagram/i.test(userText)
      const isShowcase3 = /\bshowcase-3(?!\d)|缓存成本实时测算|prompt-cache cost calculator/i.test(
        userText,
      )
      const isShowcase4 = /\bshowcase-4(?!\d)|双栏配置差异|split config diff/i.test(userText)
      const isShowcase5 = /\bshowcase-5(?!\d)|发布流水线进度条|release verification tracker/i.test(
        userText,
      )
      const isShowcase6 = /\bshowcase-6(?!\d)|连锁咖啡|coffee store operations/i.test(userText)
      const isShowcase7 = /\bshowcase-7(?!\d)|瀑布树|健康拓扑|latency spike/i.test(userText)
      const isShowcase8 = /\bshowcase-8(?!\d)|专属推理集群|季度巡检与治理|SLA uptime/i.test(
        userText,
      )
      const isShowcase9 = /\bshowcase-9(?!\d)|容量与规格选型|GPU tier|步进数字框/i.test(userText)
      const isShowcase10 = /\bshowcase-10\b|冷分区|审批门禁|approval gate/i.test(userText)
      const isShowcase11 =
        /\bshowcase-11\b|混合检索方案|权衡矩阵|trade-off comparison|pgvector/i.test(userText)
      const isShowcase12 =
        /\bshowcase-12\b|接口契约调试|圆环水位|HTTP endpoint card|rate-limit/i.test(userText)
      const isShowcase13 = /\bshowcase-13\b|容灾演练复盘|三泳道|failover drill|Kanban board/i.test(
        userText,
      )
      const isShowcase14 = /\bshowcase-14\b|量化复盘|日 K 线|candlestick chart/i.test(userText)
      const isShowcase15 = /\bshowcase-15\b|折叠手风琴|慢查询详情|collapsible accordions/i.test(
        userText,
      )
      const isShowcase16 = /\bshowcase-16\b|增减归因瀑布|waterfall.*sunburst/i.test(userText)
      const isShowcase17 = /\bshowcase-17\b|双轴混合与日历|combo.*calendar/i.test(userText)
      const isShowcase18 = /\bshowcase-18\b|平行坐标|parallel/i.test(userText)
      const isShowcase19 = /\bshowcase-19\b|组合压测|composition stress/i.test(userText)
      const isShowcase20 = /\bshowcase-20\b|全量表单|forms.*media/i.test(userText)
      const isShowcase21 = /\bshowcase-21\b|窄容器组件压测|narrow.*torture/i.test(userText)
      const isShowcase22 = /\bshowcase-22\b|剩余8类图表压测|remaining8/i.test(userText)
      const isShowcase23 = /\bshowcase-23\b|长词与浮层压测|extreme.*a/i.test(userText)
      const isShowcase24 = /\bshowcase-24\b|水平条与高密度压测|extreme.*b/i.test(userText)
      const isShowcase25 = /\bshowcase-25\b|交叉筛选|crossfilter/i.test(userText)
      const isShowcase26 = /\bshowcase-26\b|v042-qa/i.test(userText)
      const isShowcase27 = /\bshowcase-27\b|combo-layout-audit/i.test(userText)
      const isShowcase28 = /\bshowcase-28\b|combo-charts-audit/i.test(userText)
      const isShowcase29Dock = /\bshowcase-29-dock\b/i.test(userText)
      const isShowcase29 = !isShowcase29Dock && /\bshowcase-29\b|combo-dock-audit/i.test(userText)
      const isShowcase30 = /\bshowcase-30\b|combo-v046-layout/i.test(userText)
      const isShowcase31 = /\bshowcase-31\b|combo-v046-forms/i.test(userText)
      const isShowcase32 = /\bshowcase-32\b|combo-v046-charts/i.test(userText)
      const isShowcase33 = /\bshowcase-33\b|combo-v048-layout/i.test(userText)
      const isShowcase34 = /\bshowcase-34\b|combo-v048-charts/i.test(userText)
      const isShowcase35 = /\bshowcase-35\b|v050-charts/i.test(userText)
      const isShowcase36 = /\bshowcase-36\b|v050-widgets/i.test(userText)
      const isShowcase37 = /\bshowcase-37\b|v050-upgrades/i.test(userText)
      const isShowcase38 = /\bshowcase-38\b|combo-v050-widgets/i.test(userText)
      const isShowcase39 = /\bshowcase-39\b|combo-v050-charts/i.test(userText)
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
            title: 'v0.4.7 开源发布质量门禁流水线',
            placement: 'dock',
            ui: SHOWCASE_DOCK_PIPELINE_UI,
          })
          return
        }
        if (isShowcase7) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: '支付结算链路 P99 延迟突增拓扑与瀑布诊断',
            ui: SHOWCASE_SRE_APM_UI,
          })
          return
        }
        if (isShowcase8) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: '核心生产推理集群 SLA 巡检与算力治理台',
            ui: SHOWCASE_ENTERPRISE_PROTABLE_UI,
          })
          return
        }
        if (isShowcase9) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: '私有化大模型集群规格选型与容量规划台',
            ui: SHOWCASE_ANTD_CAPACITY_UI,
          })
          return
        }
        if (isShowcase10) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: '核心账单表冷分区归档风控审批与排期台',
            ui: SHOWCASE_RISK_RUNBOOK_UI,
          })
          return
        }
        if (isShowcase11) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: '生产级混合检索选型对比与溯源引用',
            ui: SHOWCASE_COMPARISON_SOURCES_UI,
          })
          return
        }
        if (isShowcase12) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: '核心网关限流接口契约与圆环水位面板',
            ui: SHOWCASE_API_RING_DATERANGE_UI,
          })
          return
        }
        if (isShowcase13) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: '跨可用区容灾演练看板、热力矩阵与回执',
            ui: SHOWCASE_KANBAN_TIMELINE_MATRIX_UI,
          })
          return
        }
        if (isShowcase14) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: '科技指数 10 日量化复盘与箱线分布看板',
            ui: SHOWCASE_MARKET_CANDLE_UI,
          })
          return
        }
        if (isShowcase15) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: '线上网关延迟突增分级排查手风琴与慢查询弹窗',
            ui: SHOWCASE_ACCORDION_MODAL_UI,
          })
          return
        }
        if (isShowcase16) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: '2026 Q3 营收增减归因与算力成本多层分摊台',
            ui: SHOWCASE_FINOPS_WATERFALL_SUNBURST_UI,
          })
          return
        }
        if (isShowcase17) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: '全天吞吐与延迟双轴监控及下半年发版热力日历',
            ui: SHOWCASE_SRE_COMBO_CALENDAR_UI,
          })
          return
        }
        if (isShowcase18) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: '五大模型跨量纲平行坐标评测与路由权衡台',
            ui: SHOWCASE_LLM_PARALLEL_BENCHMARK_UI,
          })
          return
        }
        if (isShowcase19) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: '极限组件组合样式压测台（并排双轴+全年日历+Tabs+Grid+Accordion+Modal）',
            ui: SHOWCASE_COMPOSITION_STRESS_UI,
          })
          return
        }
        if (isShowcase20) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: '全量表单与多媒体混排压测台（57/57 补全）',
            ui: SHOWCASE_ALL_FORMS_MEDIA_UI,
          })
          return
        }
        if (isShowcase21) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: '深挖压测 A：半宽 306px 非图表复杂组件极限挤压台',
            ui: SHOWCASE_NARROW_WIDGET_TORTURE_UI,
          })
          return
        }
        if (isShowcase22) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: '深挖压测 B：剩余 8 类 ECharts 图表 276px 极限挤压台',
            ui: SHOWCASE_ECHARTS_REMAINING8_TORTURE_UI,
          })
          return
        }
        if (isShowcase23) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: '深挖压测 C：半宽长英文/URL/浮层与剩余重组件极限压测台',
            ui: SHOWCASE_EXTREME_EDGE_TORTURE_A_UI,
          })
          return
        }
        if (isShowcase24) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: '深挖压测 D：水平条形图/正负柱/60天Tracker/半宽Mermaid/大数圆环压测台',
            ui: SHOWCASE_EXTREME_EDGE_TORTURE_B_UI,
          })
          return
        }
        if (isShowcase25) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: 'P2 实测：Chart ↔ ProTable 0ms 交叉筛选 + 一键 PNG/CSV 导出',
            ui: SHOWCASE_P2_CROSSFILTER_UI,
          })
          return
        }
        if (isShowcase26) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: 'v0.4.2 视觉与交互修复对照台',
            ui: SHOWCASE_V042_QA_UI,
          })
          return
        }
        if (isShowcase27) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: '全面组合实测 A：布局塌陷/3-5列Grid/Diff Split/Tabs/Modal/表单',
            ui: SHOWCASE_COMBO_LAYOUT_AUDIT_UI,
          })
          return
        }
        if (isShowcase28) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: '全面组合实测 B：ECharts 暗色与交叉筛选 + Mermaid 暗色图谱',
            ui: SHOWCASE_COMBO_CHARTS_MERMAID_AUDIT_UI,
          })
          return
        }
        if (isShowcase29Dock) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: '全面组合实测 C（Dock 常驻台）：.bare 滑块/上弹下拉/Accordion/媒体',
            placement: 'dock',
            ui: SHOWCASE_COMBO_DOCK_FORMS_AUDIT_UI,
          })
          return
        }
        if (isShowcase29) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: '全面组合实测 C：Accordion/3列Tracker/无标题Code/媒体混排',
            ui: SHOWCASE_COMBO_DOCK_FORMS_AUDIT_UI,
          })
          return
        }
        if (isShowcase30) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: '深度组合审计 30：Flex塌陷/3列Grid断点/跨夜Schedule/104行Diff',
            ui: SHOWCASE_COMBO_AUDIT_V046_LAYOUT_UI,
          })
          return
        }
        if (isShowcase31) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: '深度组合审计 31：表单校验/默认值/弹窗浮层/多选数组交叉筛选',
            ui: SHOWCASE_COMBO_AUDIT_V046_FORMS_OVERLAYS_UI,
          })
          return
        }
        if (isShowcase32) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: '深度组合审计 32：19类图表边界与联动 + Mermaid 全屏缩放与括号修复',
            ui: SHOWCASE_COMBO_AUDIT_V046_CHARTS_MERMAID_UI,
          })
          return
        }
        if (isShowcase33) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: '深度组合审计 33：无权重 Column / 隐藏嵌套 / Modal 全浮层与 LIFO Esc',
            ui: SHOWCASE_COMBO_AUDIT_V048_LAYOUT_OVERLAYS_UI,
          })
          return
        }
        if (isShowcase34) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: '深度组合审计 34：动态挂载 / 负值参考线 / 6维平行坐标 / 层次联动 / 拓扑跳边',
            ui: SHOWCASE_COMBO_AUDIT_V048_CHARTS_INTERACTIVE_UI,
          })
          return
        }
        if (isShowcase35) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: 'v0.5.0 新增 7 类图表与 5 项图表增强实测台',
            ui: SHOWCASE_V050_CHARTS_UI,
          })
          return
        }
        if (isShowcase36) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: 'v0.5.0 新增 7 个零依赖交互原语实测台',
            ui: SHOWCASE_V050_WIDGETS_UI,
          })
          return
        }
        if (isShowcase37) {
          await streamToolCall(res, model, 'a2ui_render', {
            title: 'v0.5.0 原地升级：语义列 ProTable / 条件聚合 / 偏移 Trace / 多文件批注 Diff',
            ui: SHOWCASE_V050_UPGRADES_UI,
          })
          return
        }
        if (isShowcase38) {
          await streamToolCall(res, model, 'a2ui_render', {
            title:
              '深度组合审计 38：无权重 v0.5.0 卡片 / 对象 KV / 多列 Sticky / 字面量交互 / Modal 动作',
            ui: SHOWCASE_COMBO_AUDIT_V050_WIDGETS_UI,
          })
          return
        }
        if (isShowcase39) {
          await streamToolCall(res, model, 'a2ui_render', {
            title:
              '深度组合审计 39：区间/子弹/哑铃交叉筛选隔离 + 负值参考线 + 对数散点 + 玉玦图 + 直方图',
            ui: SHOWCASE_COMBO_AUDIT_V050_CHARTS_UI,
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
          if (
            userText.includes('surface="pipeline"') ||
            userText.includes('action="advance_pipeline"')
          ) {
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

      if ((isAsk || isShowcase4) && lastToolText.trim().startsWith('{')) {
        let askRes = null
        try {
          askRes = JSON.parse(lastToolText)
        } catch (err) {
          console.warn('[mock-llm] Ignoring malformed a2ui_ask tool result JSON:', err)
        }
        if (askRes && typeof askRes === 'object') {
          if (askRes.status === 'skipped') {
            await streamTextReply(res, model, '您已跳过本次交互确认，未执行任何变更。')
            return
          }
          if (askRes.status === 'answered') {
            if (isShowcase4) {
              await streamTextReply(
                res,
                model,
                '已收到您的双栏 Diff 审核放行指令，正在将分包加载降级保护补丁写入工作区。',
              )
              return
            }
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
                  ? '已将 v0.4.7 发布前自动化质量流水线挂载至会话底部常驻工作台（Dock），后续各阶段核验状态将原地实时刷新。'
                  : isShowcase7
                    ? '已定位延迟突增根因：Fraud Scorer 访问 TiKV 热点分片 #19 耗时占全链路 77%，可点击下方日志直跳工作区源码。'
                    : isShowcase8
                      ? '已汇总核心生产推理集群近 20 日 SLA 时序、隔离规格书与 3 台低利用率 GPU 实例治理清单。'
                      : isShowcase9
                        ? '已就绪私有化推理集群容量选型工作台，切换 GPU 档位或点击步进器即可在本地 0ms 重算吞吐与包月预算。'
                        : isShowcase10
                          ? '已生成核心账单表冷分区归档风控审批卡、前置快照校验手册与凌晨维护窗口甘特排期。'
                          : isShowcase11
                            ? '已生成千万级混合检索引擎多维权衡对比矩阵与权威基准溯源列表。'
                            : isShowcase12
                              ? '已就绪核心网关限流接口契约调试面板、圆环水位指示与日期区间选择器。'
                              : isShowcase13
                                ? '已汇总跨可用区容灾演练三泳道看板、关键动作时间轴、延迟热力矩阵与演练达标回执。'
                                : isShowcase14
                                  ? '已绘制市场情绪仪表盘、科技指数 10 日 K 线走势与细分板块涨跌幅分布箱线图。'
                                  : isShowcase15
                                    ? '已整理线上延迟突增分级排查手风琴与完整慢 SQL 执行计划弹窗。'
                                    : isShowcase16
                                      ? '已生成 Q3 营收增减归因瀑布图与三级算力成本可下钻旭日图，点击任意业务域扇区即可下钻查看细分集群账单。'
                                      : isShowcase17
                                        ? '已就绪全天吞吐与 P99 延迟双轴监控及下半年发版日历，拖动上方滑块可 0ms 实时移动双轴图上的 SLO 红线阈值。'
                                        : isShowcase18
                                          ? '已生成五大模型跨量纲平行坐标与五维雷达同屏对比，可在平行坐标任意纵轴上按住拖拽框选满足延迟与成本约束的模型。'
                                          : isShowcase19
                                            ? '已渲染极限多组件组合压测台：包含并排双轴图、全年 12 个月热力日历、Tabs/Grid 切换、Accordion 折叠展开与 Modal 弹窗内嵌图表。'
                                            : isShowcase20
                                              ? '已渲染全量表单与多媒体混排压测台，补齐 Icon / Image / Video / AudioPlayer / List / Divider / TextField / DateTimeInput / Select / Switch 等全部 57 组件。'
                                              : isShowcase21
                                                ? '已渲染半宽 306px 非图表复杂组件极限挤压台（CheckCard / Bordered KeyValue / Schedule / ApiEndpoint / LogViewer / Terminal / Tree / Segmented / MultiSelect / EntityHeader）。'
                                                : isShowcase22
                                                  ? '已渲染剩余 8 类 ECharts 图表 276px 极限挤压台（Pie / Funnel / Scatter / Boxplot / Gauge / Candlestick / Treemap / Graph）。'
                                                  : isShowcase23
                                                    ? '已渲染半宽长英文/URL/浮层与剩余重组件压测台（ApprovalCard / Result / SourceList / Comparison / ProTable / Split DiffView / Kanban / Right-Edge Popovers / Callout）。'
                                                    : isShowcase24
                                                      ? '已渲染水平条形图、正负堆叠柱、半宽 Mermaid 工具栏、60 天高密度 Tracker 与 5 位数 MetricRing 压测台。'
                                                      : isShowcase25
                                                        ? '已渲染 P2 交叉筛选与一键导出验证台：点击任意柱状图/饼图扇区或表格行即可 0ms 本地双向联动筛选，并支持一键下载 PNG 与复制 CSV。'
                                                        : isShowcase26
                                                          ? '已渲染 v0.4.2 视觉与交互修复对照台（Matrix colorScale="auto"、306px LogViewer 详情按钮、琥珀对比度与暗色日期选择器）。'
                                                          : isShowcase27
                                                            ? '已渲染 v0.4.4 组合布局审计台（306px DiffView Split、无权重并排容器、长词换行与响应式网格）。'
                                                            : isShowcase28
                                                              ? '已渲染 v0.4.4 图表与 Mermaid 组合审计台（双主题 Gantt 刻度、Mindmap 与多色 Pie）。'
                                                              : isShowcase29 || isShowcase29Dock
                                                                ? '已渲染 v0.4.5 Dock 边界滑块与底部上弹浮层核验台（0%/100% 滑块防裁切与 Dock Popover 定位）。'
                                                                : isShowcase30
                                                                  ? '已渲染 v0.4.6 布局组合压测台（跨组件嵌套与窄容器响应式断点）。'
                                                                  : isShowcase31
                                                                    ? '已渲染 v0.4.6 表单与浮层组合压测台（DateRange / MultiSelect / TreeSelect / NumberInput）。'
                                                                    : isShowcase32
                                                                      ? '已渲染 v0.4.6 负值瀑布图、Funnel 窄卡标签与 Mermaid 双主题对比度压测台。'
                                                                      : isShowcase33
                                                                        ? '已渲染 v0.4.8 无权重 Column 并排、长 Token 防溢出、含占位符数值表格、隐藏 Tab+Accordion 懒渲染与 Modal 浮层栈真机实测台。'
                                                                        : isShowcase34
                                                                          ? '已渲染 v0.4.8 动态空->非空 ECharts 挂载、全负值柱图、276px 6 维平行坐标、64px 极端精度圆环与 3 节点 LR 拓扑真机实测台。'
                                                                          : isShowcase35
                                                                            ? '已渲染 v0.5.0 新增 7 类图表（range / bullet / histogram / dumbbell / rose / radialBar / chord）与 5 项图表增强实测台。'
                                                                            : isShowcase36
                                                                              ? '已渲染 v0.5.0 新增 7 个交互原语（RangeSlider / Checklist / SortableList / KvEditor / Rating / ImageCompare / AnnotationText）实测台。'
                                                                              : isShowcase37
                                                                                ? '已渲染 v0.5.0 原地升级实测台（ProTable 语义列 + 固定首列、0ms 条件聚合函数、offsetPct Trace 瀑布树与多文件批注 DiffView）。'
                                                                                : isShowcase38
                                                                                  ? '已渲染深度组合审计 38（无权重并排、长标签对比、对象 KV 编辑、多列 Sticky ProTable、字面量控件与 Modal 动作）。'
                                                                                  : isShowcase39
                                                                                    ? '已渲染深度组合审计 39（区间/子弹/哑铃交叉筛选隔离、负值偏移参考线、对数散点防零、5 项玉玦图与整洁直方图）。'
                                                                                    : userText.includes(
                                                                                          '[a2ui-action]',
                                                                                        )
                                                                                      ? '已根据您的操作实时增量刷新界面数据模型。'
                                                                                      : isDock
                                                                                        ? '已将 CI/CD 发布流水线监控面板固定在输入框上方的常驻工作台（Dock），后续轮次将继续实时原地刷新。'
                                                                                        : isInline
                                                                                          ? '已在工具步骤流内嵌渲染诊断摘要。'
                                                                                          : isDashboard
                                                                                            ? '已为您生成 2026 区域经营交互看板（示例数据），可切换图表、搜索排序明细表或一键调整预测情景。'
                                                                                            : userText.includes(
                                                                                                  'test-error',
                                                                                                )
                                                                                              ? '初稿校验触发编译器诊断自愈，已自动将非法组件修正为标准组件并完成渲染。'
                                                                                              : '已为您准备好餐厅预订交互卡片，您可直接在下方调整人数、口味或包间选项后点击确认。'
      await streamTextReply(res, model, reply)
      return
    }

    if (req.method === 'GET' && req.url === '/alert.mp3') {
      const dataLen = 40000
      const wavBytes = Buffer.alloc(44 + dataLen)
      wavBytes.write('RIFF', 0)
      wavBytes.writeUInt32LE(36 + dataLen, 4)
      wavBytes.write('WAVE', 8)
      wavBytes.write('fmt ', 12)
      wavBytes.writeUInt32LE(16, 16)
      wavBytes.writeUInt16LE(1, 20)
      wavBytes.writeUInt16LE(1, 22)
      wavBytes.writeUInt32LE(8000, 24)
      wavBytes.writeUInt32LE(8000, 28)
      wavBytes.writeUInt16LE(1, 32)
      wavBytes.writeUInt16LE(8, 34)
      wavBytes.write('data', 36)
      wavBytes.writeUInt32LE(dataLen, 40)
      wavBytes.fill(128, 44)
      res.writeHead(200, {
        'content-type': 'audio/wav',
        'content-length': String(wavBytes.length),
        'accept-ranges': 'bytes',
        'access-control-allow-origin': '*',
        'cross-origin-resource-policy': 'cross-origin',
      })
      res.end(wavBytes)
      return
    }

    if (req.method === 'GET' && req.url === '/demo.mp4') {
      const mp4Bytes = Buffer.from(
        'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAQkbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAB9AAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAA050cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAB9AAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAUAAAAC0AAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAfQAAAIAAABAAAAAALGbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAoAAAAUABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAACcW1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAjFzdGJsAAAAwXN0c2QAAAAAAAAAAQAAALFhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAUAAtABIAAAASAAAAAAAAAABFUxhdmM2Mi4yOC4xMDAgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAAN2F2Y0MBZAAM/+EAGmdkAAys2UFBn58BEAAAAwAQAAADAUDxQplgAQAGaOvjxMhM/fj4AAAAABBwYXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAABEUAAAAAAAAABhzdHRzAAAAAAAAAAEAAAAUAAAEAAAAABRzdHNzAAAAAAAAAAEAAAABAAAAqGN0dHMAAAAAAAAAEwAAAAEAAAgAAAAAAQAAFAAAAAABAAAIAAAAAAEAAAAAAAAAAQAABAAAAAABAAAUAAAAAAEAAAgAAAAAAQAAAAAAAAABAAAEAAAAAAEAABQAAAAAAQAACAAAAAABAAAAAAAAAAEAAAQAAAAAAQAAFAAAAAABAAAIAAAAAAEAAAAAAAAAAQAABAAAAAABAAAQAAAAAAIAAAQAAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAAUAAAAAQAAAGRzdHN6AAAAAAAAAAAAAAAUAAAC+QAAABIAAAAPAAAADwAAAA8AAAAYAAAAEQAAAA8AAAAPAAAAGAAAABEAAAAPAAAADwAAABgAAAARAAAADwAAAA8AAAAYAAAAEQAAAA8AAAAUc3RjbwAAAAAAAAABAAAEVAAAAGJ1ZHRhAAAAWm1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAALWlsc3QAAAAlqXRvbwAAAB1kYXRhAAAAAQAAAABMYXZmNjIuMTIuMTAwAAAACGZyZWUAAARNbWRhdAAAArAGBf//rNxF6b3m2Ui3lizYINkj7u94MjY0IC0gY29yZSAxNjUgcjMyMjIgYjM1NjA1YSAtIEguMjY0L01QRUctNCBBVkMgY29kZWMgLSBDb3B5bGVmdCAyMDAzLTIwMjUgLSBodHRwOi8vd3d3LnZpZGVvbGFuLm9yZy94MjY0Lmh0bWwgLSBvcHRpb25zOiBjYWJhYz0xIHJlZj0zIGRlYmxvY2s9MTotMzotMyBhbmFseXNlPTB4MzoweDExMyBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lfcmQ9Mi4wMDowLjcwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MSBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tNCB0aHJlYWRzPTYgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0zIGJfcHlyYW1pZD0yIGJfYWRhcHQ9MSBiX2JpYXM9MCBkaXJlY3Q9MSB3ZWlnaHRiPTEgb3Blbl9nb3A9MCB3ZWlnaHRwPTIga2V5aW50PTI1MCBrZXlpbnRfbWluPTEwIHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NDAgcmM9Y3JmIG1idHJlZT0xIGNyZj0yMy4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4yMACAAAAAQWWIhAAUzn/+7Np+BTbNtvnsge9xSS3K6mnpiZ2Lm+kpHAEHGeuz1gAR/we/nrQJMmWe1Aj4AABTgm1lgITKa8aXAAAADkGaJGxBTOf+1oywABEwAAAAC0GeQniCOc8AACyhAAAACwGeYXRBDOcAAFTAAAAACwGeY2pBDOcAAFTBAAAAFEGaaEmoQWiZTAgpnP/+1oywABExAAAADUGehkURLBHOfwAALKEAAAALAZ6ldEEM5wAAVMEAAAALAZ6nakEM5wAAVMAAAAAUQZqsSahBbJlMCCec//61KoAAQsAAAAANQZ7KRRUsEc5/AAAsoQAAAAsBnul0QQznAABUwAAAAAsBnutqQQznAABUwAAAABRBmvBJqEFsmUwIJZz//rUqgABCwQAAAA1Bnw5FFSwRzn8AACyhAAAACwGfLXRBDOcAAFTBAAAACwGfL2pBDOcAAFTAAAAAFEGbM0moQWyZTAghnP/+qlUAAIWAAAAADUGfUUUVLBDOfwAAVMEAAAALAZ9yakEM5wAAVMA=',
        'base64',
      )
      res.writeHead(200, {
        'content-type': 'video/mp4',
        'content-length': String(mp4Bytes.length),
        'accept-ranges': 'bytes',
        'access-control-allow-origin': '*',
        'cross-origin-resource-policy': 'cross-origin',
      })
      res.end(mp4Bytes)
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

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const server = await startMockLlmServer(PORT)
  console.log(
    `[mock-llm] listening on http://127.0.0.1:${PORT}/v1 (chunk=${CHUNK_SIZE} chars, delay=${CHUNK_DELAY_MS}ms)`,
  )
  process.on('SIGINT', () => server.close(() => process.exit(0)))
}
