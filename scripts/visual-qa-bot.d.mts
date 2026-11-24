export const ALL_SHOWCASES: readonly string[]
export const DEFAULT_AUDIT_SHOWCASES: readonly string[]
export const SCREENSHOT_SHOWCASE_MAP: Readonly<Record<string, string>>

export function resolveChromeBinary(): string | null

export function buildDomGeometryAuditExpression(): string

export interface VisualQaRunResult {
  readonly showcase: string
  readonly theme: string
  readonly a2uiElementCount: number
  readonly canvasCount: number
  readonly svgCount: number
  readonly overflowViolations: readonly unknown[]
  readonly buttonWrapViolations: readonly unknown[]
  readonly clippingViolations: readonly unknown[]
  readonly popoverViolations: readonly unknown[]
  readonly contrastViolations?: readonly unknown[] | undefined
  readonly consoleErrors: readonly string[]
  readonly pageErrors: readonly string[]
}

export function evaluateVisualQaReport(runs: readonly VisualQaRunResult[]): {
  readonly ok: boolean
  readonly totalRuns: number
  readonly passedRuns: number
  readonly failures: readonly {
    readonly showcase: string
    readonly theme: string
    readonly issues: readonly string[]
  }[]
}
