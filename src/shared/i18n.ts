import type { UiLocale } from './locale.ts'

export {
  getUiLocaleOverride,
  resolveClientLocale,
  resolveHostLocale,
  setUiLocaleOverride,
  subscribeUiLocaleOverride,
  type UiLocale,
} from './locale.ts'

export interface HostUiMessages {
  readonly tierCommandDesc: string
  readonly enabledStatus: string
  readonly disabledStatus: string
  readonly invalidTierArg: (arg: string) => string
  readonly answerCommandDesc: string
  readonly missingPayload: string
  readonly payloadTooLarge: string
  readonly invalidPayloadJson: string
  readonly noPendingAsk: string
  readonly askDefaultTitle: string
}

export const HOST_MESSAGES: Record<UiLocale, HostUiMessages> = {
  zh: {
    tierCommandDesc: '开关或查看 A2UI 生成式界面状态（on / off / status，不传参直接切换）',
    enabledStatus: 'A2UI 生成式界面已开启',
    disabledStatus: 'A2UI 生成式界面已关闭',
    invalidTierArg: (arg) => `无效参数 "${arg}"，可选值：on | off | status（或不传参直接切换）`,
    answerCommandDesc: '提交正在等待输入的 A2UI 交互表单（内部桥接命令）',
    missingPayload: '缺少回传数据',
    payloadTooLarge: '回传数据体积超过限制',
    invalidPayloadJson: '回传 JSON 解析失败',
    noPendingAsk: '当前会话没有待处理的 a2ui_ask 请求',
    askDefaultTitle: 'A2UI 交互提问',
  },
  en: {
    tierCommandDesc:
      'Toggle or check A2UI generative UI status (on / off / status, or omit args to toggle)',
    enabledStatus: 'A2UI generative UI enabled',
    disabledStatus: 'A2UI generative UI disabled',
    invalidTierArg: (arg) =>
      `Invalid argument "${arg}". Expected: on | off | status (or omit to toggle)`,
    answerCommandDesc: 'Submit a pending A2UI interactive prompt (internal bridge command)',
    missingPayload: 'Missing response payload',
    payloadTooLarge: 'Response payload exceeds size limit',
    invalidPayloadJson: 'Failed to parse response JSON',
    noPendingAsk: 'No pending a2ui_ask request in the current session',
    askDefaultTitle: 'A2UI interactive prompt',
  },
}

export interface ShellUiMessages {
  readonly toggleOnTooltip: string
  readonly toggleOffTooltip: string
  readonly interrupted: string
  readonly validationRetry: string
  readonly inspectCall: string
  readonly pinnedToDock: string
  readonly inlineCardTitle: string
  readonly inlineSurface: string
  readonly rendered: string
  readonly readOnlySnapshot: string
  readonly loadingRuntime: string
  readonly loadingRuntimeFailed: string
  readonly retryLoad: string
  readonly askDefaultTitle: string
  readonly askRowTitle: string
  readonly askGenerating: string
  readonly askSubmitting: string
  readonly askWaitingInput: string
  readonly askSkip: string
  readonly askSubmitRetry: string
  readonly askSubmitFailed: string
  readonly askSkipRetry: string
  readonly askSkipFailed: string
  readonly askWaitingDock: string
  readonly askGeneratingForm: string
  readonly askSkipped: string
  readonly askTimedOut: string
  readonly askSubmittedWith: (label: string) => string
  readonly askDefaultAction: string
  readonly dockDefaultTitle: string
  readonly dockTag: string
  readonly dockExpand: string
  readonly dockCollapse: string
  readonly dockClose: string
  readonly dockCloseHint: string
  readonly chipSubmitted: (label: string) => string
  readonly chipHidePayload: string
  readonly chipShowPayload: string
  readonly chipParamsHeading: string
  readonly chipStateHeading: string
  readonly actionViewFile: (target: string) => string
  readonly actionDrillDown: (head: string, val?: string) => string
  readonly actionUserNotePrefix: string
  readonly actionParamsPrefix: string
  readonly actionDataModelPrefix: string
  readonly actionTrailingPrompt: string
  readonly copy: string
  readonly copied: string
  readonly copyFailed: string
  readonly copyValue: string
  readonly copyJson: string
  readonly copyPath: string
  readonly copyPrettyJson: string
  readonly copyCompactJson: string
  readonly collapseNode: string
  readonly expandNode: string
  readonly moreCopyOptions: (action: string) => string
  readonly codeLabel: string
  readonly wrapLabel: string
  readonly unwrapLabel: string
  readonly footnotes: string
}

export const SHELL_MESSAGES: Record<UiLocale, ShellUiMessages> = {
  zh: {
    toggleOnTooltip: 'A2UI 生成式界面：已开启（点击关闭）',
    toggleOffTooltip: 'A2UI 生成式界面：已关闭（点击开启）',
    interrupted: '已中断',
    validationRetry: '校验未通过（重试中）',
    inspectCall: '查看调用详情',
    pinnedToDock: '已固定至底部工作台',
    inlineCardTitle: 'A2UI 内嵌卡片',
    inlineSurface: '内嵌界面',
    rendered: '已渲染',
    readOnlySnapshot: '历史快照（只读）',
    loadingRuntime: '正在加载界面引擎…',
    loadingRuntimeFailed: '界面引擎加载失败',
    retryLoad: '重试',
    askDefaultTitle: 'A2UI 交互提问',
    askRowTitle: 'A2UI 提问',
    askGenerating: '正在生成提问…',
    askSubmitting: '正在提交…',
    askWaitingInput: '等待您的输入',
    askSkip: '跳过',
    askSubmitRetry: '提交未成功，请重试',
    askSubmitFailed: '提交失败',
    askSkipRetry: '跳过失败，请重试',
    askSkipFailed: '跳过失败',
    askWaitingDock: '等待底部交互栏提交',
    askGeneratingForm: '正在生成提问表单',
    askSkipped: '已跳过',
    askTimedOut: '等待超时',
    askSubmittedWith: (label) => `已提交 · ${label}`,
    askDefaultAction: '确认',
    dockDefaultTitle: 'A2UI 常驻工作台',
    dockTag: '常驻工作台',
    dockExpand: '展开工作台',
    dockCollapse: '收起工作台',
    dockClose: '关闭常驻工作台',
    dockCloseHint: '关闭常驻工作台（后续更新时将重新显示）',
    chipSubmitted: (label) => `已提交交互：${label}`,
    chipHidePayload: '收起数据',
    chipShowPayload: '查看提交数据',
    chipParamsHeading: '动作参数：',
    chipStateHeading: '界面状态：',
    actionViewFile: (target) => `查看文件：${target}`,
    actionDrillDown: (head, val) => (val ? `下钻查看：${head} (${val})` : `下钻查看：${head}`),
    actionUserNotePrefix: '用户说明：',
    actionParamsPrefix: '动作参数：',
    actionDataModelPrefix: '当前数据模型：',
    actionTrailingPrompt:
      '请根据上述交互结果继续处理；如需更新界面，请调用 a2ui_render（对已有 surface 可使用 update=true）。',
    copy: '复制',
    copied: '已复制',
    copyFailed: '复制失败',
    copyValue: '复制值',
    copyJson: '复制 JSON',
    copyPath: '复制路径',
    copyPrettyJson: '复制格式化 JSON',
    copyCompactJson: '复制紧凑 JSON',
    collapseNode: '折叠节点',
    expandNode: '展开节点',
    moreCopyOptions: (action) => `${action}（更多选项）`,
    codeLabel: '代码',
    wrapLabel: '自动换行',
    unwrapLabel: '取消换行',
    footnotes: '脚注',
  },
  en: {
    toggleOnTooltip: 'A2UI Generative UI: On (click to turn off)',
    toggleOffTooltip: 'A2UI Generative UI: Off (click to turn on)',
    interrupted: 'Interrupted',
    validationRetry: 'Validation failed (retrying)',
    inspectCall: 'View call details',
    pinnedToDock: 'Pinned to bottom dock',
    inlineCardTitle: 'A2UI inline card',
    inlineSurface: 'Inline surface',
    rendered: 'Rendered',
    readOnlySnapshot: 'Historical snapshot (read-only)',
    loadingRuntime: 'Loading UI runtime…',
    loadingRuntimeFailed: 'Failed to load UI runtime',
    retryLoad: 'Retry',
    askDefaultTitle: 'A2UI interactive prompt',
    askRowTitle: 'A2UI prompt',
    askGenerating: 'Generating prompt…',
    askSubmitting: 'Submitting…',
    askWaitingInput: 'Waiting for your input',
    askSkip: 'Skip',
    askSubmitRetry: 'Submission did not complete, please retry',
    askSubmitFailed: 'Submission failed',
    askSkipRetry: 'Could not skip, please retry',
    askSkipFailed: 'Skip failed',
    askWaitingDock: 'Waiting for submission in bottom dock',
    askGeneratingForm: 'Generating prompt form',
    askSkipped: 'Skipped',
    askTimedOut: 'Timed out',
    askSubmittedWith: (label) => `Submitted · ${label}`,
    askDefaultAction: 'Confirmed',
    dockDefaultTitle: 'A2UI workspace dock',
    dockTag: 'Workspace dock',
    dockExpand: 'Expand dock',
    dockCollapse: 'Collapse dock',
    dockClose: 'Close workspace dock',
    dockCloseHint: 'Close workspace dock (reappears on next update)',
    chipSubmitted: (label) => `Submitted: ${label}`,
    chipHidePayload: 'Hide payload',
    chipShowPayload: 'View payload',
    chipParamsHeading: 'Action params:',
    chipStateHeading: 'Surface state:',
    actionViewFile: (target) => `View file: ${target}`,
    actionDrillDown: (head, val) => (val ? `Drill down: ${head} (${val})` : `Drill down: ${head}`),
    actionUserNotePrefix: 'User note: ',
    actionParamsPrefix: 'Action params: ',
    actionDataModelPrefix: 'Current data model: ',
    actionTrailingPrompt:
      'Please continue based on the interaction above; to update the UI, call a2ui_render (use update=true for an existing surface).',
    copy: 'Copy',
    copied: 'Copied',
    copyFailed: 'Copy failed',
    copyValue: 'Copy value',
    copyJson: 'Copy JSON',
    copyPath: 'Copy path',
    copyPrettyJson: 'Copy formatted JSON',
    copyCompactJson: 'Copy compact JSON',
    collapseNode: 'Collapse node',
    expandNode: 'Expand node',
    moreCopyOptions: (action) => `${action} (more options)`,
    codeLabel: 'Code',
    wrapLabel: 'Wrap lines',
    unwrapLabel: 'Unwrap lines',
    footnotes: 'Footnotes',
  },
}

export interface RuntimeUiMessages {
  readonly generating: string
  readonly readOnlySnapshot: string
  readonly buildingSurface: string
  readonly emptySurface: string
  readonly surfaceRenderFailed: (id: string) => string
  readonly renderErrorDefault: string
  readonly openInSidebar: (label: string) => string
  readonly chartLoadFailed: string
  readonly chartLoading: string
  readonly chartExportPng: string
  readonly chartExportedCheck: string
  readonly chartCopyCsv: string
  readonly chartFilterActive: (val: string) => string
  readonly chartClearFilter: string
  readonly tableFilterActive: (val: string) => string
  readonly tableClearFilter: string
  readonly streamingSyncing: string
  readonly retryLoad: string
  readonly accordionFallbackTitle: (index: number) => string
  readonly jsonTreeDefaultTitle: string
  readonly jsonTreeAriaLabel: string
  readonly copiedCheck: string
  readonly copyJson: string
  readonly copy: string
  readonly copied: string
  readonly fileTreeDefaultTitle: string
  readonly fileTreeCount: (count: number) => string
  readonly fileTreeEmpty: string
  readonly fileTreeAriaLabel: string
  readonly mermaidDefaultTitle: string
  readonly mermaidParseIncomplete: string
  readonly mermaidRenderFailed: string
  readonly mermaidZoomGroup: string
  readonly mermaidZoomOutAria: string
  readonly mermaidZoomOutTitle: string
  readonly mermaidZoomResetAria: string
  readonly mermaidZoomResetTitle: string
  readonly mermaidZoomInAria: string
  readonly mermaidZoomInTitle: string
  readonly mermaidZoomFit: string
  readonly mermaidZoomFitAria: string
  readonly mermaidZoomFitTitle: string
  readonly mermaidViewGroup: string
  readonly mermaidDiagramTab: string
  readonly mermaidSourceTab: string
  readonly mermaidFullscreenEnterAria: string
  readonly mermaidFullscreenExitAria: string
  readonly mermaidFullscreenEnter: string
  readonly mermaidFullscreenExit: string
  readonly mermaidEmpty: string
  readonly mermaidRendering: string
  readonly diffDefaultTitle: string
  readonly diffModeGroup: string
  readonly diffUnified: string
  readonly diffSplit: string
  readonly diffCopyAfter: string
  readonly diffEmpty: string
  readonly kvCopyItemTitle: string
  readonly filterPlaceholder: string
  readonly filterAriaLabel: string
  readonly radioGroupAria: string
  readonly sliderAria: string
  readonly tabFallbackTitle: (index: number) => string
  readonly tabsAriaLabel: string
  readonly modalTitle: string
  readonly modalClose: string
  readonly progressAria: string
  readonly boolYes: string
  readonly boolNo: string
  readonly tableSearchPlaceholder: string
  readonly tableSearchAria: string
  readonly tableEmpty: string
  readonly tableRowFallback: (index: number) => string
  readonly tablePaginationSummary: (total: number, page: number, pages: number) => string
  readonly tablePrevPage: string
  readonly tableNextPage: string
  readonly stepFallbackTitle: (index: number) => string
  readonly selectPlaceholder: string
  readonly selectSearchPlaceholder: string
  readonly selectNoResults: string
  readonly segmentedAria: string
  readonly comparisonDimension: string
  readonly comparisonRecommended: string
  readonly comparisonChooseRecommended: string
  readonly comparisonChoosePlan: string
  readonly comparisonSelectedOption: string
  readonly logDefaultTitle: string
  readonly logSearchPlaceholder: string
  readonly logEmpty: string
  readonly logExpandDetail: string
  readonly logCollapseDetail: string
  readonly logEntryCount: (count: number) => string
  readonly logCopyAll: string
  readonly logAllLevels: string
  readonly timelineExpandDetail: string
  readonly timelineCollapseDetail: string
  readonly kanbanEmptyColumn: string
  readonly kanbanPriorityHigh: string
  readonly kanbanPriorityMedium: string
  readonly kanbanPriorityLow: string
  readonly sourceListDefaultTitle: string
  readonly sourceRelevanceLabel: string
  readonly serviceGraphDefaultTitle: string
  readonly serviceGraphHealthy: string
  readonly serviceGraphWarning: string
  readonly serviceGraphError: string
  readonly serviceGraphUnknown: string
  readonly serviceGraphUpstream: string
  readonly serviceGraphDownstream: string
  readonly serviceGraphNone: string
  readonly serviceGraphInspect: string
  readonly serviceGraphZoomFit: string
  readonly serviceGraphZoomActual: string
  readonly imageLightboxDialog: string
  readonly imageLightboxClose: string
  readonly imageZoomHint: string
  readonly tableExportCsv: string
  readonly tableCopyMarkdown: string
  readonly tableDensityStandard: string
  readonly tableDensityCompact: string
  readonly tableSelectedCount: (count: number) => string
  readonly tableSelectAllAria: string
  readonly tableSelectRowAria: (index: number) => string
  readonly tableBatchDefault: string
  readonly tableSummaryLabel: (count: number) => string
  readonly tableAvgLabel: (value: string) => string
  readonly trackerHoverHint: string
  readonly trackerHealthy: string
  readonly trackerDegraded: string
  readonly trackerDown: string
  readonly trackerUnknown: string
  readonly terminalDefaultTitle: string
  readonly terminalCopyCmd: string
  readonly terminalStepsCount: (count: number) => string
  readonly approvalSeverityLow: string
  readonly approvalSeverityMedium: string
  readonly approvalSeverityHigh: string
  readonly approvalSeverityCritical: string
  readonly approvalImpactHeader: string
  readonly approvalDefaultApprove: string
  readonly approvalDefaultReject: string
  readonly approvalApprovedDone: string
  readonly approvalRejectedDone: string
  readonly apiCopyCurl: string
  readonly apiTabResponse: string
  readonly apiTabRequest: string
  readonly apiTabParams: string
  readonly apiExecuteBtn: string
  readonly apiEmptyBody: string
  readonly scheduleDefaultTitle: string
  readonly scheduleNowPrefix: string
  readonly resultEmptyDefault: string
  readonly matrixDefaultCorner: string
  readonly matrixTotalLabel: string
  readonly numberDecrementAria: string
  readonly numberIncrementAria: string
  readonly multiSelectPlaceholder: string
  readonly multiSelectSearchCreate: string
  readonly multiSelectSearchOnly: string
  readonly multiSelectCreateOption: (val: string) => string
  readonly multiSelectSelectedCount: (count: number) => string
  readonly multiSelectClearAll: string
  readonly dateRangePresetToday: string
  readonly dateRangePreset7d: string
  readonly dateRangePreset30d: string
  readonly dateRangePreset90d: string
  readonly dateRangeSpanDays: (days: number) => string
  readonly treeSelectPlaceholder: string
  readonly treeSearchPlaceholder: string
  readonly treeExpandAll: string
  readonly treeCollapseAll: string
  readonly treeEmpty: string
  readonly tableExpandRowAria: string
  readonly multiSelectRemoveTagAria: (label: string) => string
  readonly dateRangeStartAria: string
  readonly dateRangeEndAria: string
  readonly treeToggleBranchAria: string
  readonly defaultActionCta: string
  readonly diffFilesSummary: (count: number) => string
  readonly rangeSliderStartAria: string
  readonly rangeSliderEndAria: string
  readonly checklistDefaultTitle: string
  readonly checklistProgress: (done: number, total: number) => string
  readonly checklistRequiredMissing: (count: number) => string
  readonly checklistRequiredTag: string
  readonly checklistEmpty: string
  readonly sortableDefaultTitle: string
  readonly sortableMoveUpAria: string
  readonly sortableMoveDownAria: string
  readonly sortableEmpty: string
  readonly kvEditorDefaultTitle: string
  readonly kvEditorKeyLabel: string
  readonly kvEditorValueLabel: string
  readonly kvEditorKeyPlaceholder: string
  readonly kvEditorValuePlaceholder: string
  readonly kvEditorAddItem: string
  readonly kvEditorRemoveAria: string
  readonly kvEditorRevealAria: string
  readonly kvEditorHideAria: string
  readonly kvEditorDuplicateKeyHint: string
  readonly kvEditorEmpty: string
  readonly ratingAria: string
  readonly ratingScoreOf: (val: number, max: number) => string
  readonly imageCompareDefaultBefore: string
  readonly imageCompareDefaultAfter: string
  readonly imageCompareSliderAria: string
  readonly annotationDefaultTitle: string
  readonly annotationEmpty: string
  readonly annotationCloseDetail: string
}

export const RUNTIME_MESSAGES: Record<UiLocale, RuntimeUiMessages> = {
  zh: {
    generating: '生成中…',
    readOnlySnapshot: '历史快照（只读）',
    buildingSurface: '正在构建交互界面…',
    emptySurface: '暂无可显示界面',
    surfaceRenderFailed: (id) => `Surface "${id}" 渲染失败`,
    renderErrorDefault: 'A2UI 渲染异常',
    openInSidebar: (label) => `在右侧栏打开 ${label}`,
    chartLoadFailed: '图表引擎加载失败',
    chartLoading: '正在加载图表引擎…',
    chartExportPng: 'PNG',
    chartExportedCheck: '已导出 ✓',
    chartCopyCsv: 'CSV',
    chartFilterActive: (val) => `筛选: ${val}`,
    chartClearFilter: '清除联动筛选',
    tableFilterActive: (val) => `联动筛选: ${val}`,
    tableClearFilter: '清除筛选',
    streamingSyncing: '正在增量同步组件…',
    retryLoad: '重试',
    accordionFallbackTitle: (n) => `分组 ${n}`,
    jsonTreeDefaultTitle: 'JSON 结构',
    jsonTreeAriaLabel: 'JSON 数据树',
    copiedCheck: '已复制 ✓',
    copyJson: '复制 JSON',
    copy: '复制',
    copied: '已复制',
    fileTreeDefaultTitle: '工作区文件',
    fileTreeCount: (count) => `${count} 个文件`,
    fileTreeEmpty: '（暂无文件条目）',
    fileTreeAriaLabel: '文件目录树',
    mermaidDefaultTitle: '架构与流程图',
    mermaidParseIncomplete: '流程图解析未完成',
    mermaidRenderFailed: '流程图渲染失败',
    mermaidZoomGroup: '流程图缩放控制',
    mermaidZoomOutAria: '缩小流程图',
    mermaidZoomOutTitle: '缩小',
    mermaidZoomResetAria: '重置为 100% 原始尺寸',
    mermaidZoomResetTitle: '重置为 100% 原始尺寸',
    mermaidZoomInAria: '放大流程图',
    mermaidZoomInTitle: '放大',
    mermaidZoomFit: '自适应',
    mermaidZoomFitAria: '自适应窗口大小',
    mermaidZoomFitTitle: '自适应窗口大小（双击画布可快速缩放，按住拖拽可平移）',
    mermaidViewGroup: '流程图显示切换',
    mermaidDiagramTab: '图形',
    mermaidSourceTab: '源码',
    mermaidFullscreenEnterAria: '全屏查看流程图',
    mermaidFullscreenExitAria: '退出全屏查看',
    mermaidFullscreenEnter: '全屏',
    mermaidFullscreenExit: '退出全屏',
    mermaidEmpty: '（空流程图）',
    mermaidRendering: '正在渲染流程图…',
    diffDefaultTitle: '变更对比',
    diffModeGroup: '对比视图模式',
    diffUnified: '行内',
    diffSplit: '双栏',
    diffCopyAfter: '复制新内容',
    diffEmpty: '（空内容）',
    kvCopyItemTitle: '复制此项',
    filterPlaceholder: '筛选选项…',
    filterAriaLabel: '筛选选项',
    radioGroupAria: '单选列表',
    sliderAria: '数值滑块',
    tabFallbackTitle: (n) => `标签 ${n}`,
    tabsAriaLabel: '视图切换',
    modalTitle: '详情',
    modalClose: '关闭',
    progressAria: '进度',
    boolYes: '是',
    boolNo: '否',
    tableSearchPlaceholder: '搜索表格内容…',
    tableSearchAria: '搜索表格内容',
    tableEmpty: '暂无匹配数据',
    tableRowFallback: (n) => `第 ${n} 行`,
    tablePaginationSummary: (total, page, pages) => `共 ${total} 条 · 第 ${page} / ${pages} 页`,
    tablePrevPage: '上一页',
    tableNextPage: '下一页',
    stepFallbackTitle: (n) => `步骤 ${n}`,
    selectPlaceholder: '请选择…',
    selectSearchPlaceholder: '搜索选项…',
    selectNoResults: '无匹配选项',
    segmentedAria: '分段选择',
    comparisonDimension: '评估维度',
    comparisonRecommended: '★ 推荐',
    comparisonChooseRecommended: '采纳推荐方案',
    comparisonChoosePlan: '选用此方案',
    comparisonSelectedOption: '已选用 ✓',
    logDefaultTitle: '结构化日志追踪',
    logSearchPlaceholder: '过滤日志或模块…',
    logEmpty: '无匹配日志条目',
    logExpandDetail: '展开堆栈详情',
    logCollapseDetail: '收起堆栈详情',
    logEntryCount: (count) => `${count} 条`,
    logCopyAll: '复制日志',
    logAllLevels: '全部',
    timelineExpandDetail: '展开详情',
    timelineCollapseDetail: '收起详情',
    kanbanEmptyColumn: '暂无卡片',
    kanbanPriorityHigh: '高优',
    kanbanPriorityMedium: '中优',
    kanbanPriorityLow: '常规',
    sourceListDefaultTitle: '溯源引用列表',
    sourceRelevanceLabel: '相关度',
    serviceGraphDefaultTitle: '服务健康拓扑',
    serviceGraphHealthy: '健康',
    serviceGraphWarning: '预警',
    serviceGraphError: '异常',
    serviceGraphUnknown: '未知',
    serviceGraphUpstream: '上游',
    serviceGraphDownstream: '下游',
    serviceGraphNone: '无',
    serviceGraphInspect: '下钻排查',
    serviceGraphZoomFit: '适应宽度',
    serviceGraphZoomActual: '100%',
    imageLightboxDialog: '图片大图预览',
    imageLightboxClose: '关闭预览',
    imageZoomHint: '点击放大预览',
    tableExportCsv: '导出 CSV',
    tableCopyMarkdown: '复制 MD',
    tableDensityStandard: '标准',
    tableDensityCompact: '紧凑',
    tableSelectedCount: (count) => `已选 ${count} 项`,
    tableSelectAllAria: '全选当前页行',
    tableSelectRowAria: (index) => `选择第 ${index} 行`,
    tableBatchDefault: '批量处理选中项',
    tableSummaryLabel: (count) => `合计 (${count} 行)`,
    tableAvgLabel: (value) => `均值 ${value}`,
    trackerHoverHint: '悬停或点击分片查看详情',
    trackerHealthy: '正常',
    trackerDegraded: '波动',
    trackerDown: '中断',
    trackerUnknown: '未知',
    terminalDefaultTitle: '命令与执行回执',
    terminalCopyCmd: '复制命令',
    terminalStepsCount: (count) => `${count} 步命令`,
    approvalSeverityLow: '常规变更',
    approvalSeverityMedium: '中风险变更',
    approvalSeverityHigh: '高风险生产变更',
    approvalSeverityCritical: 'P0 极高危操作',
    approvalImpactHeader: '变更影响面 (Blast Radius)',
    approvalDefaultApprove: '确认放行',
    approvalDefaultReject: '驳回中止',
    approvalApprovedDone: '已放行 ✓',
    approvalRejectedDone: '已驳回 ✕',
    apiCopyCurl: '复制 cURL',
    apiTabResponse: '响应体 (Response)',
    apiTabRequest: '请求体 (Request)',
    apiTabParams: '参数与请求头',
    apiExecuteBtn: '触发调试',
    apiEmptyBody: '（无载荷）',
    scheduleDefaultTitle: '排期与变更时间窗',
    scheduleNowPrefix: '当前',
    resultEmptyDefault: '暂无匹配记录',
    matrixDefaultCorner: '维度 \\ 指标',
    matrixTotalLabel: '合计 / 均值',
    numberDecrementAria: '减少数值',
    numberIncrementAria: '增加数值',
    multiSelectPlaceholder: '请选择多项…',
    multiSelectSearchCreate: '搜索选项，或输入新标签按 Enter 创建…',
    multiSelectSearchOnly: '搜索多选条目…',
    multiSelectCreateOption: (val) => `创建 "${val}"`,
    multiSelectSelectedCount: (count) => `已选 ${count} 项`,
    multiSelectClearAll: '清空',
    dateRangePresetToday: '今日',
    dateRangePreset7d: '近 7 天',
    dateRangePreset30d: '近 30 天',
    dateRangePreset90d: '近 90 天',
    dateRangeSpanDays: (days) => `跨度 ${days} 天`,
    treeSelectPlaceholder: '请选择层级节点…',
    treeSearchPlaceholder: '搜索树节点…',
    treeExpandAll: '全部展开',
    treeCollapseAll: '全部收起',
    treeEmpty: '无匹配节点',
    tableExpandRowAria: '展开或收起行详情',
    multiSelectRemoveTagAria: (label) => `移除 ${label}`,
    dateRangeStartAria: '开始日期',
    dateRangeEndAria: '结束日期',
    treeToggleBranchAria: '展开或收起节点',
    defaultActionCta: '执行操作',
    diffFilesSummary: (count) => `${count} 个文件`,
    rangeSliderStartAria: '区间下限',
    rangeSliderEndAria: '区间上限',
    checklistDefaultTitle: '核查清单',
    checklistProgress: (done, total) => `${done} / ${total}`,
    checklistRequiredMissing: (count) => `还有 ${count} 项必选项未确认`,
    checklistRequiredTag: '必选',
    checklistEmpty: '暂无核查项',
    sortableDefaultTitle: '优先级排序',
    sortableMoveUpAria: '上移一项',
    sortableMoveDownAria: '下移一项',
    sortableEmpty: '暂无排序项',
    kvEditorDefaultTitle: '键值配置',
    kvEditorKeyLabel: '键名',
    kvEditorValueLabel: '值',
    kvEditorKeyPlaceholder: '输入键名…',
    kvEditorValuePlaceholder: '输入值…',
    kvEditorAddItem: '新增一项',
    kvEditorRemoveAria: '删除此项',
    kvEditorRevealAria: '显示敏感值',
    kvEditorHideAria: '隐藏敏感值',
    kvEditorDuplicateKeyHint: '存在重复键名',
    kvEditorEmpty: '点击右上角按钮新增配置项',
    ratingAria: '评分',
    ratingScoreOf: (val, max) => `${val} / ${max}`,
    imageCompareDefaultBefore: '对比前',
    imageCompareDefaultAfter: '对比后',
    imageCompareSliderAria: '拖动对比前后图像',
    annotationDefaultTitle: '标注与溯源',
    annotationEmpty: '暂无标注文本',
    annotationCloseDetail: '收起说明',
  },
  en: {
    generating: 'Generating…',
    readOnlySnapshot: 'Historical snapshot (read-only)',
    buildingSurface: 'Building interactive surface…',
    emptySurface: 'No surface to display',
    surfaceRenderFailed: (id) => `Surface "${id}" failed to render`,
    renderErrorDefault: 'A2UI render error',
    openInSidebar: (label) => `Open ${label} in right sidebar`,
    chartLoadFailed: 'Failed to load chart runtime',
    chartLoading: 'Loading chart runtime…',
    chartExportPng: 'PNG',
    chartExportedCheck: 'Saved ✓',
    chartCopyCsv: 'CSV',
    chartFilterActive: (val) => `Filter: ${val}`,
    chartClearFilter: 'Clear cross-filter',
    tableFilterActive: (val) => `Filtered: ${val}`,
    tableClearFilter: 'Clear filter',
    streamingSyncing: 'Syncing live updates…',
    retryLoad: 'Retry',
    accordionFallbackTitle: (n) => `Section ${n}`,
    jsonTreeDefaultTitle: 'JSON structure',
    jsonTreeAriaLabel: 'JSON tree',
    copiedCheck: 'Copied ✓',
    copyJson: 'Copy JSON',
    copy: 'Copy',
    copied: 'Copied',
    fileTreeDefaultTitle: 'Workspace files',
    fileTreeCount: (count) => `${count} ${count === 1 ? 'file' : 'files'}`,
    fileTreeEmpty: '(No files)',
    fileTreeAriaLabel: 'Workspace file tree',
    mermaidDefaultTitle: 'Diagram',
    mermaidParseIncomplete: 'Diagram failed to parse',
    mermaidRenderFailed: 'Failed to render diagram',
    mermaidZoomGroup: 'Diagram zoom controls',
    mermaidZoomOutAria: 'Zoom out diagram',
    mermaidZoomOutTitle: 'Zoom out',
    mermaidZoomResetAria: 'Reset to 100% actual size',
    mermaidZoomResetTitle: 'Reset to 100% actual size',
    mermaidZoomInAria: 'Zoom in diagram',
    mermaidZoomInTitle: 'Zoom in',
    mermaidZoomFit: 'Fit',
    mermaidZoomFitAria: 'Fit diagram to viewport',
    mermaidZoomFitTitle: 'Fit to viewport (double-click canvas to toggle zoom, drag to pan)',
    mermaidViewGroup: 'Diagram view mode',
    mermaidDiagramTab: 'Diagram',
    mermaidSourceTab: 'Source',
    mermaidFullscreenEnterAria: 'View diagram in fullscreen',
    mermaidFullscreenExitAria: 'Exit fullscreen',
    mermaidFullscreenEnter: 'Fullscreen',
    mermaidFullscreenExit: 'Exit fullscreen',
    mermaidEmpty: '(Empty diagram)',
    mermaidRendering: 'Rendering diagram…',
    diffDefaultTitle: 'Changes',
    diffModeGroup: 'Diff view mode',
    diffUnified: 'Unified',
    diffSplit: 'Split',
    diffCopyAfter: 'Copy new',
    diffEmpty: '(Empty)',
    kvCopyItemTitle: 'Copy value',
    filterPlaceholder: 'Filter options…',
    filterAriaLabel: 'Filter options',
    radioGroupAria: 'Radio group',
    sliderAria: 'Slider',
    tabFallbackTitle: (n) => `Tab ${n}`,
    tabsAriaLabel: 'View tabs',
    modalTitle: 'Details',
    modalClose: 'Close',
    progressAria: 'Progress',
    boolYes: 'Yes',
    boolNo: 'No',
    tableSearchPlaceholder: 'Search table…',
    tableSearchAria: 'Search table',
    tableEmpty: 'No matching rows',
    tableRowFallback: (n) => `Row ${n}`,
    tablePaginationSummary: (total, page, pages) => `${total} rows · Page ${page} of ${pages}`,
    tablePrevPage: 'Previous',
    tableNextPage: 'Next',
    stepFallbackTitle: (n) => `Step ${n}`,
    selectPlaceholder: 'Select…',
    selectSearchPlaceholder: 'Search options…',
    selectNoResults: 'No matching options',
    segmentedAria: 'Segmented control',
    comparisonDimension: 'Dimension',
    comparisonRecommended: '★ Recommended',
    comparisonChooseRecommended: 'Adopt recommended',
    comparisonChoosePlan: 'Choose option',
    comparisonSelectedOption: 'Selected ✓',
    logDefaultTitle: 'Structured logs',
    logSearchPlaceholder: 'Filter logs or module…',
    logEmpty: 'No matching log entries',
    logExpandDetail: 'Show stack detail',
    logCollapseDetail: 'Hide stack detail',
    logEntryCount: (count) => `${count} entries`,
    logCopyAll: 'Copy logs',
    logAllLevels: 'All',
    timelineExpandDetail: 'Show details',
    timelineCollapseDetail: 'Hide details',
    kanbanEmptyColumn: 'No items',
    kanbanPriorityHigh: 'High',
    kanbanPriorityMedium: 'Medium',
    kanbanPriorityLow: 'Low',
    sourceListDefaultTitle: 'Sources & citations',
    sourceRelevanceLabel: 'Relevance',
    serviceGraphDefaultTitle: 'Service topology',
    serviceGraphHealthy: 'Healthy',
    serviceGraphWarning: 'Degraded',
    serviceGraphError: 'Error',
    serviceGraphUnknown: 'Unknown',
    serviceGraphUpstream: 'Upstream',
    serviceGraphDownstream: 'Downstream',
    serviceGraphNone: 'None',
    serviceGraphInspect: 'Inspect',
    serviceGraphZoomFit: 'Fit',
    serviceGraphZoomActual: '100%',
    imageLightboxDialog: 'Image preview',
    imageLightboxClose: 'Close preview',
    imageZoomHint: 'Click to enlarge',
    tableExportCsv: 'Export CSV',
    tableCopyMarkdown: 'Copy MD',
    tableDensityStandard: 'Standard',
    tableDensityCompact: 'Compact',
    tableSelectedCount: (count) => `${count} selected`,
    tableSelectAllAria: 'Select all visible rows',
    tableSelectRowAria: (index) => `Select row ${index}`,
    tableBatchDefault: 'Apply to selected',
    tableSummaryLabel: (count) => `Summary (${count} rows)`,
    tableAvgLabel: (value) => `Avg ${value}`,
    trackerHoverHint: 'Hover or click any slice for details',
    trackerHealthy: 'Healthy',
    trackerDegraded: 'Degraded',
    trackerDown: 'Outage',
    trackerUnknown: 'No data',
    terminalDefaultTitle: 'Terminal Runbook',
    terminalCopyCmd: 'Copy cmd',
    terminalStepsCount: (count) => `${count} ${count === 1 ? 'command' : 'commands'}`,
    approvalSeverityLow: 'Low Risk',
    approvalSeverityMedium: 'Medium Risk',
    approvalSeverityHigh: 'High-Risk Change',
    approvalSeverityCritical: 'P0 Critical Gate',
    approvalImpactHeader: 'Blast Radius & Impact',
    approvalDefaultApprove: 'Approve & Execute',
    approvalDefaultReject: 'Reject',
    approvalApprovedDone: 'Approved ✓',
    approvalRejectedDone: 'Rejected ✕',
    apiCopyCurl: 'Copy cURL',
    apiTabResponse: 'Response',
    apiTabRequest: 'Request Body',
    apiTabParams: 'Params & Headers',
    apiExecuteBtn: 'Inspect / Call',
    apiEmptyBody: '(Empty payload)',
    scheduleDefaultTitle: 'Schedule & Timeline Window',
    scheduleNowPrefix: 'Now',
    resultEmptyDefault: 'No records found',
    matrixDefaultCorner: 'Row \\ Col',
    matrixTotalLabel: 'Total / Avg',
    numberDecrementAria: 'Decrease value',
    numberIncrementAria: 'Increase value',
    multiSelectPlaceholder: 'Select options…',
    multiSelectSearchCreate: 'Search or press Enter to create tag…',
    multiSelectSearchOnly: 'Search options…',
    multiSelectCreateOption: (val) => `Create "${val}"`,
    multiSelectSelectedCount: (count) => `${count} selected`,
    multiSelectClearAll: 'Clear',
    dateRangePresetToday: 'Today',
    dateRangePreset7d: 'Last 7d',
    dateRangePreset30d: 'Last 30d',
    dateRangePreset90d: 'Last 90d',
    dateRangeSpanDays: (days) => `${days}d span`,
    treeSelectPlaceholder: 'Select tree node…',
    treeSearchPlaceholder: 'Search tree…',
    treeExpandAll: 'Expand all',
    treeCollapseAll: 'Collapse all',
    treeEmpty: 'No matching nodes',
    tableExpandRowAria: 'Toggle row details',
    multiSelectRemoveTagAria: (label) => `Remove ${label}`,
    dateRangeStartAria: 'Start date',
    dateRangeEndAria: 'End date',
    treeToggleBranchAria: 'Toggle branch',
    defaultActionCta: 'Continue',
    diffFilesSummary: (count) => `${count} ${count === 1 ? 'file' : 'files'}`,
    rangeSliderStartAria: 'Range minimum',
    rangeSliderEndAria: 'Range maximum',
    checklistDefaultTitle: 'Checklist',
    checklistProgress: (done, total) => `${done} / ${total}`,
    checklistRequiredMissing: (count) => `${count} required item(s) remaining`,
    checklistRequiredTag: 'Required',
    checklistEmpty: 'No checklist items',
    sortableDefaultTitle: 'Priority order',
    sortableMoveUpAria: 'Move item up',
    sortableMoveDownAria: 'Move item down',
    sortableEmpty: 'No items to order',
    kvEditorDefaultTitle: 'Key-Value Editor',
    kvEditorKeyLabel: 'Key',
    kvEditorValueLabel: 'Value',
    kvEditorKeyPlaceholder: 'Enter key…',
    kvEditorValuePlaceholder: 'Enter value…',
    kvEditorAddItem: 'Add row',
    kvEditorRemoveAria: 'Remove row',
    kvEditorRevealAria: 'Show secret value',
    kvEditorHideAria: 'Hide secret value',
    kvEditorDuplicateKeyHint: 'Duplicate key detected',
    kvEditorEmpty: 'Click the button above to add a key-value entry',
    ratingAria: 'Rating',
    ratingScoreOf: (val, max) => `${val} / ${max}`,
    imageCompareDefaultBefore: 'Before',
    imageCompareDefaultAfter: 'After',
    imageCompareSliderAria: 'Drag to compare before and after images',
    annotationDefaultTitle: 'Annotations',
    annotationEmpty: 'No annotated text',
    annotationCloseDetail: 'Close detail',
  },
}
