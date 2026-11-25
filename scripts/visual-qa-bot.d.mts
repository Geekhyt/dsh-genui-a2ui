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
  readonly svgTextClipViolations?: readonly unknown[] | undefined
  readonly consoleErrors: readonly string[]
  readonly pageErrors: readonly string[]
}

export interface DecodedPngImage {
  readonly width: number
  readonly height: number
  readonly data: Uint8Array
}

export function decodePngRgba(buffer: Buffer): DecodedPngImage

export function samplePngMedianRgb(
  decoded: DecodedPngImage,
  rect: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
): readonly [number, number, number]

export function computeRgbMaxChannelDelta(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number

export function evaluateStickyTintParity(
  pairs: readonly {
    readonly label: string
    readonly stickyRgb: readonly [number, number, number]
    readonly normalRgb: readonly [number, number, number]
  }[],
  maxDelta?: number,
): {
  readonly ok: boolean
  readonly failures: readonly {
    readonly label: string
    readonly stickyRgb: readonly [number, number, number]
    readonly normalRgb: readonly [number, number, number]
    readonly delta: number
  }[]
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
