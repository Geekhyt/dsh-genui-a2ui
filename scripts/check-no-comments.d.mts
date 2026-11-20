export interface ScannedComment {
  file: string
  kind: 'line' | 'block'
  start: number
  end: number
  startLine: number
  endLine: number
  startCol: number
  raw: string
}

export interface ScanResult {
  files: string[]
  byFile: Map<string, Array<Pick<ScannedComment, 'file' | 'startLine' | 'raw'>>>
  total: number
}

export interface RatchetConfig {
  version: number
  allowDirectives: string[]
  totalLimit: number
  files: Record<string, number>
}

export interface RatchetEvaluation {
  ok: boolean
  violations: Array<{
    file: string
    actual: number
    limit: number
    comments: Array<Pick<ScannedComment, 'file' | 'startLine' | 'raw'>>
  }>
  loosenings: Array<{ file: string; actual: number; limit: number }>
  totalActual: number
  totalLimit: number
  totalExceeded: boolean
  totalCanTighten: boolean
}

export declare function isAllowedDirective(raw: string): boolean
export declare function scanTsJsComments(source: string, filePath: string): ScannedComment[]
export declare function scanCssComments(source: string, filePath: string): ScannedComment[]
export declare function scanFileComments(source: string, filePath: string): ScannedComment[]
export declare function collectTargetFiles(rootDir: string, roots?: string[]): string[]
export declare function scanRepositoryComments(rootDir: string, roots?: string[]): ScanResult
export declare function evaluateRatchet(
  scanResult: ScanResult,
  ratchet: RatchetConfig,
): RatchetEvaluation
export declare function buildRatchetConfig(scanResult: ScanResult): RatchetConfig
