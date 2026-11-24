import type { UiLocale } from './locale.ts'

export { resolveClientLocale, type UiLocale } from './locale.ts'

export interface ChartUiMessages {
  readonly chartOtherGroup: string
  readonly chartBoxplotDefault: string
  readonly chartCandlestickDefault: string
  readonly chartWaterfallTotal: string
  readonly chartWaterfallIncrease: string
  readonly chartWaterfallDecrease: string
  readonly chartRangeBand: string
  readonly chartRangeMid: string
  readonly chartBulletActual: string
  readonly chartBulletTarget: string
  readonly chartHistogramFreq: string
  readonly chartDumbbellBefore: string
  readonly chartDumbbellAfter: string
  readonly chartStatMin: string
  readonly chartStatQ1: string
  readonly chartStatMedian: string
  readonly chartStatQ3: string
  readonly chartStatMax: string
  readonly chartOhlcOpen: string
  readonly chartOhlcClose: string
  readonly chartOhlcLow: string
  readonly chartOhlcHigh: string
}

export const CHART_MESSAGES: Record<UiLocale, ChartUiMessages> = {
  zh: {
    chartOtherGroup: '其他',
    chartBoxplotDefault: '分布',
    chartCandlestickDefault: '行情',
    chartWaterfallTotal: '基准/汇总',
    chartWaterfallIncrease: '增长',
    chartWaterfallDecrease: '缩减',
    chartRangeBand: '区间范围',
    chartRangeMid: '主值',
    chartBulletActual: '实际值',
    chartBulletTarget: '目标值',
    chartHistogramFreq: '频次',
    chartDumbbellBefore: '优化前',
    chartDumbbellAfter: '优化后',
    chartStatMin: '最小',
    chartStatQ1: '下四分位',
    chartStatMedian: '中位数',
    chartStatQ3: '上四分位',
    chartStatMax: '最大',
    chartOhlcOpen: '开盘',
    chartOhlcClose: '收盘',
    chartOhlcLow: '最低',
    chartOhlcHigh: '最高',
  },
  en: {
    chartOtherGroup: 'Other',
    chartBoxplotDefault: 'Distribution',
    chartCandlestickDefault: 'OHLC',
    chartWaterfallTotal: 'Total',
    chartWaterfallIncrease: 'Increase',
    chartWaterfallDecrease: 'Decrease',
    chartRangeBand: 'Range band',
    chartRangeMid: 'Primary',
    chartBulletActual: 'Actual',
    chartBulletTarget: 'Target',
    chartHistogramFreq: 'Count',
    chartDumbbellBefore: 'Before',
    chartDumbbellAfter: 'After',
    chartStatMin: 'Min',
    chartStatQ1: 'Q1',
    chartStatMedian: 'Median',
    chartStatQ3: 'Q3',
    chartStatMax: 'Max',
    chartOhlcOpen: 'Open',
    chartOhlcClose: 'Close',
    chartOhlcLow: 'Low',
    chartOhlcHigh: 'High',
  },
}
