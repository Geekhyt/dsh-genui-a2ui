export const TLA2TOOLS_RELEASE_URL: string

export interface TlaSpecEntry {
  readonly name: string
  readonly tlaPath: string
  readonly cfgPath: string
}

export interface TlcRunResult {
  readonly spec: string
  readonly status: number
  readonly ok: boolean
  readonly statesGenerated: number
  readonly distinctStates: number
  readonly diameter: number
  readonly output: string
}

export function resolveJavaBinary(): string | null

export function resolveTlaJar(rootDir: string): string | null

export function discoverSpecs(rootDir: string): TlaSpecEntry[]

export function validateSpecStructure(spec: TlaSpecEntry): string[]

export function parseTlcOutput(stdout: string): {
  readonly ok: boolean
  readonly statesGenerated: number
  readonly distinctStates: number
  readonly diameter: number
}

export function runTlcForSpec(javaBin: string, jarPath: string, spec: TlaSpecEntry): TlcRunResult
