export interface InvariantViolation {
  readonly rule: string
  readonly file: string
  readonly line: number
  readonly message: string
}

export interface InvariantReport {
  readonly ok: boolean
  readonly filesScanned: number
  readonly violations: readonly InvariantViolation[]
}

export function checkCssInvariants(source: string, relPath: string): InvariantViolation[]

export function checkCssModuleKeyExists(
  tsxSource: string,
  cssSource: string,
  relPath: string,
): InvariantViolation[]

export function checkTsInvariants(source: string, relPath: string): InvariantViolation[]

export function checkLocaleParity(rootDir: string): InvariantViolation[]

export function runAllInvariantChecks(rootDir: string): InvariantReport
