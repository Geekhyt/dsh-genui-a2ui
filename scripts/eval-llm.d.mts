export interface EvalThresholdSummaryInput {
  readonly strategy: string
  readonly routingAccuracyPct?: number
  readonly firstPassCompileRatePct?: number
  readonly finalCompileRatePct?: number
  readonly selfRepairRecoveryPct?: number
  readonly avgPromptTokens: number
  readonly uniqueComponentsUsed?: number
}

export function evaluateEvalThresholds(
  summaries: readonly EvalThresholdSummaryInput[],
  baseline: Record<string, unknown>,
  mode?: 'mock' | 'live',
): { readonly ok: boolean; readonly violations: readonly string[] }
