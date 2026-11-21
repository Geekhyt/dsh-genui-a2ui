import type { UiLocale } from './locale.ts'

export { resolveClientLocale, type UiLocale } from './locale.ts'

export interface ChartUiMessages {
  readonly chartOtherGroup: string
  readonly chartBoxplotDefault: string
  readonly chartCandlestickDefault: string
  readonly chartWaterfallTotal: string
  readonly chartWaterfallIncrease: string
  readonly chartWaterfallDecrease: string
}

export const CHART_MESSAGES: Record<UiLocale, ChartUiMessages> = {
  zh: {
    chartOtherGroup: '其他',
    chartBoxplotDefault: '分布',
    chartCandlestickDefault: '行情',
    chartWaterfallTotal: '基准/汇总',
    chartWaterfallIncrease: '增长',
    chartWaterfallDecrease: '缩减',
  },
  en: {
    chartOtherGroup: 'Other',
    chartBoxplotDefault: 'Distribution',
    chartCandlestickDefault: 'OHLC',
    chartWaterfallTotal: 'Total',
    chartWaterfallIncrease: 'Increase',
    chartWaterfallDecrease: 'Decrease',
  },
}
