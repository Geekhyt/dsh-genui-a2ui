/**
 * Progressive A2UI Express compiler for live `preparing` tool-call previews.
 *
 * While the model streams `a2ui_render({ ui: "..." })`, DSH's `PartialArguments`
 * exposes the growing decoded prefix via `block.args.text('ui')`. This session
 * feeds only the newly appended suffix into `@a2ui/agent`'s `ExpressResponseStream`
 * (`openStream({ wrapped: false })`), emitting progressive `createSurface`,
 * `updateComponents`, and `updateDataModel` messages in real time.
 */
import { ExpressParser, type AgentToRendererMessage } from '@a2ui/agent'
import { dshSchemaCatalog } from '../shared/catalog-schema.ts'

const LEADING_WRAP_RE = /^\s*(?:<a2ui>\s*|```[\w-]*[ \t]*\r?\n)/i
const TRAILING_WRAP_RE = /(?:\s*<\/a2ui>|\r?\n?[ \t]*```)\s*$/i

/** Strip optional `<a2ui>` sentinel or markdown fence prefix/suffix during streaming. */
export function normalizeStreamingProgram(raw: string): string {
  return raw.replace(LEADING_WRAP_RE, '').replace(TRAILING_WRAP_RE, '')
}

export interface StreamingCompileSnapshot {
  readonly messages: readonly AgentToRendererMessage[]
  readonly surfaceIds: readonly string[]
  readonly error: string | null
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

function extractUpdateIds(program: string): string[] {
  const ids: string[] = []
  const re = /\bsurface\(\s*"([^"]+)"[^)]*\bupdate\s*=\s*true/g
  let m: RegExpExecArray | null
  while ((m = re.exec(program)) !== null) {
    if (m[1]) ids.push(m[1])
  }
  return ids
}

/** Stateful incremental compiler for one streaming `ui` argument. */
export class StreamingExpressSession {
  private readonly parser = new ExpressParser([dshSchemaCatalog])
  private stream = this.parser.openStream({ wrapped: false })
  private fed = ''
  private messages: AgentToRendererMessage[] = []
  private readonly surfaceIdSet = new Set<string>()
  private readonly seededUpdateIds = new Set<string>()
  private lastError: string | null = null

  private closed = false

  /** Reset stream state (used when an unwrapped prefix changes non-monotonically). */
  reset(preserveSeeds = false): void {
    this.stream = this.parser.openStream({ wrapped: false })
    if (preserveSeeds && this.seededUpdateIds.size > 0) {
      for (const id of this.seededUpdateIds) {
        try {
          this.stream.feed(`surface(${JSON.stringify(id)})\nroot = Text("")\n`)
        } catch {
          // Ignore seed failure
        }
      }
    } else if (!preserveSeeds) {
      this.seededUpdateIds.clear()
    }
    this.fed = ''
    this.messages = []
    this.surfaceIdSet.clear()
    this.lastError = null
    this.closed = false
  }

  /** Advance to the latest `ui` string prefix and return all progressive messages so far. */
  advance(rawUi: string, final = false): StreamingCompileSnapshot {
    const clean = normalizeStreamingProgram(rawUi)
    if (clean === '') {
      return { messages: this.messages, surfaceIds: [...this.surfaceIdSet], error: null }
    }
    if (!clean.startsWith(this.fed) || (this.closed && clean !== this.fed)) {
      this.reset(true)
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
        const unseeded = extractUpdateIds(clean).filter((id) => !this.seededUpdateIds.has(id))
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
            this.lastError = retryErr instanceof Error ? retryErr.message : String(retryErr)
          }
        } else {
          // Incomplete or mid-token invalid syntax during streaming retains the last good messages.
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
    return {
      messages: this.messages,
      surfaceIds: [...this.surfaceIdSet],
      error: this.lastError,
    }
  }
}
