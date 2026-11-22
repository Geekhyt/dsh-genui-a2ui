import { type AgentToRendererMessage, ExpressParser } from '@a2ui/agent'
import { dshSchemaCatalog } from '../../shared/catalog-schema.ts'
import {
  extractUpdateSurfaceIds,
  preprocessExpressProgram,
} from '../../shared/express-preprocess.ts'

const LEADING_WRAP_RE = /^\s*(?:<a2ui>\s*|```[\w-]*[ \t]*\r?\n)/i
const TRAILING_WRAP_RE = /(?:\s*<\/a2ui>|\r?\n?[ \t]*```)\s*$/i

export function normalizeStreamingProgram(raw: string): string {
  let out = raw
  for (let pass = 0; pass < 3; pass++) {
    const next = out.replace(LEADING_WRAP_RE, '').replace(TRAILING_WRAP_RE, '')
    if (next === out) break
    out = next
  }
  return out
}

export interface StreamingCompileSnapshot {
  readonly messages: readonly AgentToRendererMessage[]
  readonly surfaceIds: readonly string[]
  readonly error: string | null
  readonly seedWarnings?: readonly string[]
}

function collectSurfaceIds(messages: readonly AgentToRendererMessage[], target: Set<string>): void {
  for (const msg of messages) {
    for (const val of Object.values(msg as unknown as Record<string, unknown>)) {
      if (typeof val === 'object' && val !== null && 'surfaceId' in val) {
        const id = (val as { surfaceId: unknown }).surfaceId
        if (typeof id === 'string') target.add(id)
      }
    }
  }
}

export class StreamingExpressSession {
  private readonly parser = new ExpressParser([dshSchemaCatalog])
  private stream = this.parser.openStream({ wrapped: false })
  private fed = ''
  private messages: AgentToRendererMessage[] = []
  private readonly surfaceIdSet = new Set<string>()
  private readonly seededUpdateIds = new Set<string>()
  private seedWarnings: string[] = []
  private lastError: string | null = null
  private lastSnapshot: StreamingCompileSnapshot | null = null
  private lastSnapshotMessages: readonly AgentToRendererMessage[] | null = null
  private lastSnapshotError: string | null = null
  private lastSnapshotWarningsCount = 0

  private closed = false
  private streamRejected = false

  getSeedWarnings(): readonly string[] {
    return this.seedWarnings
  }

  private buildSnapshot(): StreamingCompileSnapshot {
    if (
      this.lastSnapshot !== null &&
      this.lastSnapshotMessages === this.messages &&
      this.lastSnapshotError === this.lastError &&
      this.lastSnapshotWarningsCount === this.seedWarnings.length
    ) {
      return this.lastSnapshot
    }
    this.lastSnapshotMessages = this.messages
    this.lastSnapshotError = this.lastError
    this.lastSnapshotWarningsCount = this.seedWarnings.length
    this.lastSnapshot = {
      messages: this.messages,
      surfaceIds: [...this.surfaceIdSet],
      error: this.lastError,
      ...(this.seedWarnings.length > 0 ? { seedWarnings: [...this.seedWarnings] } : {}),
    }
    return this.lastSnapshot
  }

  reset(preserveSeeds = false): void {
    this.stream = this.parser.openStream({ wrapped: false })
    this.seedWarnings = []
    if (preserveSeeds && this.seededUpdateIds.size > 0) {
      for (const id of this.seededUpdateIds) {
        if (typeof id !== 'string' || id.trim() === '') {
          this.seedWarnings.push(`Skipped invalid surface seed id: ${JSON.stringify(id)}`)
          continue
        }
        try {
          this.stream.feed(`surface(${JSON.stringify(id)})\nroot = Text("")\n`)
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err)
          this.seedWarnings.push(`Failed to seed surface "${id}": ${reason}`)
          console.warn(`[dsh-genui-a2ui] Streaming seed failed for surface "${id}":`, err)
        }
      }
    } else if (!preserveSeeds) {
      this.seededUpdateIds.clear()
    }
    this.fed = ''
    this.messages = []
    this.surfaceIdSet.clear()
    this.lastError = null
    this.lastSnapshot = null
    this.closed = false
    this.streamRejected = false
  }

  advance(rawUi: string, final = false): StreamingCompileSnapshot {
    const rawClean = normalizeStreamingProgram(rawUi)
    if (rawClean === '') {
      if (this.fed !== '' || this.messages.length > 0 || this.lastError !== null) {
        this.reset(false)
      }
      return this.buildSnapshot()
    }
    let clean: string
    if (final) {
      clean = preprocessExpressProgram(rawClean)
    } else {
      const lastNl = rawClean.lastIndexOf('\n')
      if (lastNl >= 0) {
        clean = `${preprocessExpressProgram(rawClean.slice(0, lastNl))}\n${rawClean.slice(lastNl + 1)}`
      } else {
        clean = rawClean
      }
    }
    if (this.streamRejected || !clean.startsWith(this.fed) || (this.closed && clean !== this.fed)) {
      const sameUpdateTargets = extractUpdateSurfaceIds(clean).some((id) =>
        this.seededUpdateIds.has(id),
      )
      this.reset(sameUpdateTargets)
    }
    const delta = clean.slice(this.fed.length)
    if (delta.length > 0 && !this.closed) {
      this.fed = clean
      try {
        const parts = this.stream.feed(delta)
        for (const part of parts) {
          if (part.type === 'a2ui' && part.a2ui.length > 0) {
            this.messages = [...this.messages, ...part.a2ui]
            collectSurfaceIds(part.a2ui, this.surfaceIdSet)
          }
        }
        this.lastError = null
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        const unseeded = extractUpdateSurfaceIds(clean).filter(
          (id) => !this.seededUpdateIds.has(id),
        )
        if (unseeded.length > 0 && /not exist|not found|unknown surface|createSurface/i.test(msg)) {
          for (const id of unseeded) this.seededUpdateIds.add(id)
          this.reset(true)
          this.fed = clean
          try {
            const retryParts = this.stream.feed(clean)
            for (const part of retryParts) {
              if (part.type === 'a2ui' && part.a2ui.length > 0) {
                this.messages = [...this.messages, ...part.a2ui]
                collectSurfaceIds(part.a2ui, this.surfaceIdSet)
              }
            }
            this.lastError = null
          } catch (retryErr) {
            this.streamRejected = true
            this.lastError = retryErr instanceof Error ? retryErr.message : String(retryErr)
          }
        } else {
          this.streamRejected = true
          this.lastError = msg
        }
      }
    }
    if (final && !this.closed) {
      this.closed = true
      try {
        for (const part of this.stream.close()) {
          if (part.type === 'a2ui' && part.a2ui.length > 0) {
            this.messages = [...this.messages, ...part.a2ui]
            collectSurfaceIds(part.a2ui, this.surfaceIdSet)
          }
        }
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : String(err)
      }
    }
    return this.buildSnapshot()
  }
}
