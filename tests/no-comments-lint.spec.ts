import { describe, expect, it } from 'vitest'
import {
  buildRatchetConfig,
  evaluateRatchet,
  isAllowedDirective,
  scanCssComments,
  scanTsJsComments,
} from '../scripts/check-no-comments.mjs'

describe('no-comments ratcheted lint rule', () => {
  it('detects line, block, JSDoc, empty-catch, JSX, and @ts-expect-error comments while ignoring strings, regexes, and pure directives', () => {
    const sample = [
      'const url = "https://example.com/a//b/*c*/"',
      'const re = /\\/\\*foo\\*\\//',
      'const pure = /* @__PURE__ */ (() => 1)()',
      'const noSide = /* #__NO_SIDE_EFFECTS__ */ (() => 2)()',
      'function demo() {',
      '  try {',
      '    return pure + noSide',
      '  } catch {',
      '    // Ignore',
      '  }',
      '}',
      '/** JSDoc */',
      'export const x = () => <div>{/* jsx comment */}</div>',
      '// @ts-expect-error excuse',
      'export const y = demo()',
    ].join('\n')

    const found = scanTsJsComments(sample, 'sample.tsx')
    expect(found.map((c) => c.raw)).toEqual([
      '// Ignore',
      '/** JSDoc */',
      '/* jsx comment */',
      '// @ts-expect-error excuse',
    ])
    expect(isAllowedDirective('/* @__PURE__ */')).toBe(true)
    expect(isAllowedDirective('/* #__NO_SIDE_EFFECTS__ */')).toBe(true)
    expect(isAllowedDirective('// @ts-expect-error')).toBe(false)
    expect(isAllowedDirective('/* regular comment */')).toBe(false)
  })

  it('scans CSS block comments while ignoring comment-like sequences inside quoted strings', () => {
    const css = [
      '.a::before { content: "/* keep me */"; }',
      '/* real css comment */',
      ".b::after { content: '/* also keep \\'me\\' */'; }",
    ].join('\n')

    const found = scanCssComments(css, 'sample.css')
    expect(found).toHaveLength(1)
    expect(found[0]?.raw).toBe('/* real css comment */')
    expect(found[0]?.startLine).toBe(2)
  })

  it('enforces strict monotonic ratcheting across files', () => {
    const baseline = {
      version: 1,
      allowDirectives: ['/* @__PURE__ */'],
      totalLimit: 2,
      files: { 'tests/a.spec.ts': 2 },
    }

    const exact = evaluateRatchet(
      {
        files: ['src/app.ts', 'tests/a.spec.ts'],
        byFile: new Map([
          [
            'tests/a.spec.ts',
            [
              { file: 'tests/a.spec.ts', startLine: 1, raw: '// one' },
              { file: 'tests/a.spec.ts', startLine: 2, raw: '// two' },
            ],
          ],
        ]),
        total: 2,
      },
      baseline,
    )
    expect(exact.ok).toBe(true)

    const addedInUnratcheted = evaluateRatchet(
      {
        files: ['src/app.ts', 'tests/a.spec.ts'],
        byFile: new Map([
          ['src/app.ts', [{ file: 'src/app.ts', startLine: 5, raw: '// new' }]],
          [
            'tests/a.spec.ts',
            [
              { file: 'tests/a.spec.ts', startLine: 1, raw: '// one' },
              { file: 'tests/a.spec.ts', startLine: 2, raw: '// two' },
            ],
          ],
        ]),
        total: 3,
      },
      baseline,
    )
    expect(addedInUnratcheted.ok).toBe(false)
    expect(addedInUnratcheted.violations).toHaveLength(1)
    expect(addedInUnratcheted.violations[0]?.file).toBe('src/app.ts')

    const tightened = evaluateRatchet(
      {
        files: ['src/app.ts', 'tests/a.spec.ts'],
        byFile: new Map([
          ['tests/a.spec.ts', [{ file: 'tests/a.spec.ts', startLine: 1, raw: '// one' }]],
        ]),
        total: 1,
      },
      baseline,
    )
    expect(tightened.ok).toBe(false)
    expect(tightened.loosenings).toEqual([{ file: 'tests/a.spec.ts', actual: 1, limit: 2 }])

    const rebuilt = buildRatchetConfig({
      files: ['src/app.ts', 'tests/a.spec.ts'],
      byFile: new Map([
        ['tests/a.spec.ts', [{ file: 'tests/a.spec.ts', startLine: 1, raw: '// one' }]],
      ]),
      total: 1,
    })
    expect(rebuilt.totalLimit).toBe(1)
    expect(rebuilt.files).toEqual({ 'tests/a.spec.ts': 1 })
  })
})
