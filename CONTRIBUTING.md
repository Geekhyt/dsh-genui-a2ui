# Contributing to `dsh-genui-a2ui`

Thank you for helping improve `dsh-genui-a2ui`! For a deep dive into the three-stage pipeline, A2UI 1.0 protocol mapping, 4-chunk bundle architecture, and full 32-component Express DSL contracts, read [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) ([简体中文](./docs/DEVELOPMENT.zh-CN.md)) first.

To keep the plugin fast, safe, and 100% aligned with both **Google A2UI 1.0** and **DeepSeek Harness (DSH)** official plugin APIs, please follow the architectural guardrails below.

## Architectural Guardrails

1. **Strict A2UI 1.0 Compliance**:
   - Every component and function must be declared isomorphically in `src/shared/catalog-schema.ts` with strict Zod validation.
   - Never execute arbitrary HTML/JS strings from model output (`Data, Not Code`).
   - Keep container composition flat via `ChildSchema` ID references; avoid inventing non-standard implicit global props.
2. **Zero Host Hacks**:
   - Only consume documented DSH extension seams (`tools`, `skills`, `commands`, `systemPrompt`, official UI Slots, `@deepseek-ai/dsh-client-ui-primitives`, `sidebarRight`, and `window.__ModuleLoader__`).
   - Style exclusively with Light-DOM CSS Modules and `--dsw-*` design tokens so surfaces inherit light/dark themes and third-party DSH skins automatically.
3. **Cold-Boot Budget (`< 500 kB` Hard Gate, `< 60 kB` Target)**:
   - Keep heavy visualization libraries (`echarts`, `mermaid`, `@a2ui/react`, `@tanstack/react-table`) inside lazy chunks (`src/client/chunks/*`), never imported eagerly from `src/client/index.ts`.

## Local Development Workflow

```bash
# 1. Install dependencies from lockfile
npm ci

# 2. Typecheck, build all 5 targets, and run the 45-test suite
npm run typecheck
npm run build
npm test

# 3. Verify DSH Host API contract alignment (when DeepSeek Harness.app is installed)
npm run check:host-api

# 4. Run an isolated DSH web harness + scripted mock LLM on http://127.0.0.1:18992
node scripts/dev-env.mjs setup
node scripts/dev-env.mjs serve
```

## Pull Request Checklist

- [ ] `npm run typecheck` passes with 0 errors.
- [ ] `npm run build` succeeds and keeps `lib/client.js` well below the cold-boot budget.
- [ ] `npm test` passes (`tests/*.spec.ts`), including tests covering any new component, formula, or prompt rule.
- [ ] Both `README.md` (Chinese) and `README.en.md` (English) reflect user-visible catalog or command changes.
