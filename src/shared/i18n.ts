/**
 * Zero-dependency bilingual (`zh` / `en`) UI chrome dictionary & locale resolver.
 *
 * Design notes:
 * - Split into `HOST_MESSAGES`, `SHELL_MESSAGES`, and `RUNTIME_MESSAGES` so tsdown / Rollup
 *   tree-shakes unused dictionaries out of `lib/client.js` (keeping cold-boot `< 50 kB`).
 * - In DeepSeek Harness, `LocaleRuntime` syncs the active UI language directly onto
 *   `document.documentElement.lang` (`"zh-CN"` vs `"en"`), which `src/client/i18n.ts`
 *   observes reactively via `MutationObserver`.
 * - In headless Vitest runs without an explicit override or `<html lang="...">`, defaults
 *   deterministically to `'zh'` across macOS, Linux, and Windows CI runners.
 */

export type UiLocale = 'zh' | 'en'

let localeOverride: UiLocale | null = null
const overrideListeners = new Set<() => void>()

export function setUiLocaleOverride(next: UiLocale | null): void {
  if (localeOverride === next) return
  localeOverride = next
  for (const listener of overrideListeners) {
    listener()
  }
}

export function getUiLocaleOverride(): UiLocale | null {
  return localeOverride
}

export function subscribeUiLocaleOverride(listener: () => void): () => void {
  overrideListeners.add(listener)
  return () => {
    overrideListeners.delete(listener)
  }
}

function parseLocaleTag(raw: unknown): UiLocale | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim().toLowerCase()
  if (trimmed === '') return null
  if (trimmed.startsWith('zh')) return 'zh'
  if (trimmed.startsWith('en')) return 'en'
  return null
}

function isVitestEnv(): boolean {
  return (
    typeof process !== 'undefined' &&
    typeof process.env === 'object' &&
    process.env !== null &&
    Boolean(process.env.VITEST)
  )
}

/** Resolve active UI language in browser / client renderers. */
export function resolveClientLocale(): UiLocale {
  if (localeOverride !== null) return localeOverride

  const globalTag = parseLocaleTag(
    (globalThis as { readonly __DSH_A2UI_LOCALE__?: unknown }).__DSH_A2UI_LOCALE__,
  )
  if (globalTag !== null) return globalTag

  if (typeof document !== 'undefined') {
    const htmlLang = document.documentElement?.getAttribute?.('lang') ?? document.documentElement?.lang
    if (typeof htmlLang === 'string' && htmlLang.trim() !== '') {
      return htmlLang.trim().toLowerCase().startsWith('zh') ? 'zh' : 'en'
    }
  }

  if (!isVitestEnv()) {
    if (typeof process !== 'undefined' && process.env?.DSH_A2UI_LOCALE) {
      const envTag = parseLocaleTag(process.env.DSH_A2UI_LOCALE)
      if (envTag !== null) return envTag
    }
    if (typeof navigator !== 'undefined' && typeof navigator.language === 'string') {
      const navTag = parseLocaleTag(navigator.language)
      if (navTag !== null) return navTag
    }
  }

  return 'zh'
}

/** Resolve active UI language on the Node host (`/a2ui` & `/a2ui-answer` slash commands). */
export function resolveHostLocale(): UiLocale {
  if (localeOverride !== null) return localeOverride
  if (typeof process !== 'undefined' && process.env) {
    const explicit = parseLocaleTag(process.env.DSH_A2UI_LOCALE)
    if (explicit !== null) return explicit
    if (process.env.VITEST) return 'zh'
    const sys = parseLocaleTag(process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG)
    if (sys !== null) return sys
  }
  return 'zh'
}

/* ─────────────────────────── 1. Host Messages ─────────────────────────── */

export interface HostUiMessages {
  readonly tierCommandDesc: string
  readonly enabledStatus: string
  readonly disabledStatus: string
  readonly invalidTierArg: (arg: string) => string
  readonly answerCommandDesc: string
  readonly missingPayload: string
  readonly invalidPayloadJson: string
  readonly noPendingAsk: string
  readonly askDefaultTitle: string
}

export const HOST_MESSAGES: Record<UiLocale, HostUiMessages> = {
  zh: {
    tierCommandDesc: '开关 A2UI 生成式界面（on / off，不传参直接切换）',
    enabledStatus: 'A2UI 生成式界面已开启',
    disabledStatus: 'A2UI 生成式界面已关闭',
    invalidTierArg: (arg) => `无效参数 "${arg}"，可选值：on | off | status（或不传参直接切换）`,
    answerCommandDesc: '提交正在等待输入的 A2UI 交互表单（内部桥接命令）',
    missingPayload: '缺少回传数据',
    invalidPayloadJson: '回传 JSON 解析失败',
    noPendingAsk: '当前会话没有待处理的 a2ui_ask 请求',
    askDefaultTitle: 'A2UI 交互提问',
  },
  en: {
    tierCommandDesc: 'Toggle A2UI generative UI (on / off, or omit args to toggle)',
    enabledStatus: 'A2UI generative UI enabled',
    disabledStatus: 'A2UI generative UI disabled',
    invalidTierArg: (arg) => `Invalid argument "${arg}". Expected: on | off | status (or omit to toggle)`,
    answerCommandDesc: 'Submit a pending A2UI interactive prompt (internal bridge command)',
    missingPayload: 'Missing response payload',
    invalidPayloadJson: 'Failed to parse response JSON',
    noPendingAsk: 'No pending a2ui_ask request in the current session',
    askDefaultTitle: 'A2UI interactive prompt',
  },
}

/* ─────────────────────────── 2. Client Shell Messages ─────────────────────────── */

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

/* ─────────────────────────── 3. Runtime & Catalog Messages ─────────────────────────── */

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
  readonly chartOtherGroup: string
  readonly chartBoxplotDefault: string
  readonly chartCandlestickDefault: string
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
  readonly mermaidZoomGroup: string
  readonly mermaidZoomOutAria: string
  readonly mermaidZoomOutTitle: string
  readonly mermaidZoomResetAria: string
  readonly mermaidZoomResetTitle: string
  readonly mermaidZoomInAria: string
  readonly mermaidZoomInTitle: string
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
    chartOtherGroup: '其他',
    chartBoxplotDefault: '分布',
    chartCandlestickDefault: '行情',
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
    mermaidZoomGroup: '流程图缩放控制',
    mermaidZoomOutAria: '缩小流程图',
    mermaidZoomOutTitle: '缩小',
    mermaidZoomResetAria: '重置缩放比例',
    mermaidZoomResetTitle: '重置为 100%',
    mermaidZoomInAria: '放大流程图',
    mermaidZoomInTitle: '放大',
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
    chartOtherGroup: 'Other',
    chartBoxplotDefault: 'Distribution',
    chartCandlestickDefault: 'OHLC',
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
    mermaidZoomGroup: 'Diagram zoom controls',
    mermaidZoomOutAria: 'Zoom out diagram',
    mermaidZoomOutTitle: 'Zoom out',
    mermaidZoomResetAria: 'Reset zoom',
    mermaidZoomResetTitle: 'Reset to 100%',
    mermaidZoomInAria: 'Zoom in diagram',
    mermaidZoomInTitle: 'Zoom in',
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
  },
}
