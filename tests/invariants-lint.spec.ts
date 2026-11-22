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
  checkLocaleParity,
  checkTsInvariants,
  runAllInvariantChecks,
} from '../scripts/check-invariants.mjs'

const ROOT_DIR = resolve(import.meta.dirname, '..')

describe('Architectural invariant linter (14 rules)', () => {
  it('passes all 14 rules on the live repository with zero violations', () => {
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
