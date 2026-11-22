export const HARD_MAX_CLIENT_RAW_BYTES: number

export interface ChunkBudgetLimit {
  readonly maxRawBytes: number
  readonly maxGzipBytes: number
}

export interface BundleBudgetConfig {
  readonly version: number
  readonly gzipLevel: number
  readonly chunks: Readonly<Record<string, ChunkBudgetLimit>>
}

export interface ChunkMeasurementResult {
  readonly file: string
  readonly rawBytes: number
  readonly maxRawBytes: number
  readonly rawPct: number
  readonly gzipBytes: number
  readonly maxGzipBytes: number
  readonly gzipPct: number
}

export interface BudgetViolation {
  readonly file: string
  readonly kind: 'missing' | 'hard-raw' | 'raw' | 'gzip'
  readonly actual?: number
  readonly limit?: number
  readonly message: string
}

export interface BundleBudgetReport {
  readonly ok: boolean
  readonly results: readonly ChunkMeasurementResult[]
  readonly violations: readonly BudgetViolation[]
}

export function measureBufferBytes(
  content: Buffer | string,
  gzipLevel?: number,
): { readonly rawBytes: number; readonly gzipBytes: number }

export function loadBundleBudget(budgetPath: string): BundleBudgetConfig

export function evaluateBundleBudgets(
  rootDir: string,
  budget: BundleBudgetConfig,
): BundleBudgetReport

export function ratchetBundleBudgets(
  budget: BundleBudgetConfig,
  results: readonly ChunkMeasurementResult[],
  headroomRatio?: number,
): BundleBudgetConfig
