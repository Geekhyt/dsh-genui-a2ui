# Upstream RFC: Keyed `markdown.code.block` Slot for DeepSeek Harness

## Summary

Proposes a small, backwards-compatible extension point in `@deepseek-ai/dsh-client-ui-primitives` / `@deepseek-ai/dsh-client-ui-chat`: a keyed slot `markdown.code.block` dispatched by fenced code block language (`lang`).

When no plugin registers a handler for `lang`, `MarkdownText` falls back to its existing built-in `<CodeBlock>` / KaTeX path with zero behavior or performance change.

## Motivation

Generative UI and domain-specific visualization plugins (`a2ui`, `mermaid`, `vega-lite`, `chem`, `abc` music notation) currently face two choices if they want inline rendering inside an assistant's Markdown prose:

1. **Official Tool + `turnTail` / `dock` slots** (used by `dsh-genui-a2ui` today): 100% clean, zero DOM hacks, full streaming via `tool.call.toolview`, and durable cards in `conversation.chat.turnTail` / `conversation.input.dock`. However, cards appear below the prose turn rather than interleaved between paragraphs.
2. **Unsanctioned workarounds** (used by legacy third-party GenUI plugins): either shadowing the entire `assistant-step` `conversation.chat.node` registration (breaking host upgrades and conflicting with other chat plugins) or running `MutationObserver` DOM surgery over `.md-code-block` nodes (fragile across React re-renders and class hashes).

Adding a keyed `markdown.code.block` slot lets plugins render fenced blocks inline through the exact same `slots.register` contract used by `tool.call.toolview` and `conversation.user.text.node`.

## Proposed Slot Contract

- **Slot Name**: `markdown.code.block`
- **Slot Kind**: `keyed` (`scope: "session-maybe"`)
- **Dispatch Key**: normalized fence info string language token (e.g. `a2ui`, `mermaid`), lowercase, trimmed.

### Owner Props Passed to Registered Components

```ts
export interface MarkdownCodeBlockSlotProps {
  /** Normalized fence language identifier (e.g. "a2ui"). */
  readonly language: string
  /** Raw code string accumulated so far (may be partial while streaming === true). */
  readonly code: string
  /** True while the enclosing assistant Markdown block has not yet closed the fence. */
  readonly streaming: boolean
  /** Fallback renderer producing the host's default highlighted <CodeBlock>. */
  readonly renderDefault: () => ReactNode
}
```

### Host Integration Sketch (`MarkdownText`)

```tsx
function renderCodeFence(node: CodeAstNode, streaming: boolean) {
  const lang = normalizeLang(node.lang)
  if (!streaming && lang === 'math') {
    return <KaTeXBlock value={node.value} />
  }
  const defaultBlock = () => <CodeBlock code={node.value} language={lang} />
  if (lang !== '' && renderSlot !== undefined) {
    return renderSlot(
      'markdown.code.block',
      {
        language: lang,
        code: node.value,
        streaming,
        renderDefault: defaultBlock,
      },
      {
        entryKey: lang,
        fallback: defaultBlock(),
      },
    )
  }
  return defaultBlock()
}
```

## Error Isolation & Streaming Guarantees

1. Each `markdown.code.block` slot seat wraps the plugin component in DSH's standard slot `ErrorBoundary`; if a plugin renderer throws, `fallback: defaultBlock()` renders the raw highlighted fence so user content is never lost.
2. During streaming, `streaming: true` lets `dsh-genui-a2ui` feed `code` directly into `StreamingExpressSession.advance(code, !streaming)` for progressive 60fps rendering without waiting for fence closure.
3. No host bundle size increase: `dsh-client-ui-slots` already implements keyed slot dispatch with fallback.
