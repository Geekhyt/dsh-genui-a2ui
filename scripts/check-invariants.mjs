#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const IGNORED_DIRS = new Set(['node_modules', 'lib', 'dist', '.git', '.dsh-dev'])

const SHELL_FORBIDDEN_PACKAGES = new Set([
  '@a2ui/agent',
  '@a2ui/react',
  '@a2ui/web_core',
  'echarts',
  'mermaid',
  '@tanstack/react-table',
  'react-aria-components',
  'zod',
])

const PURE_FORBIDDEN_PACKAGES = new Set(['react', 'react-dom', 'echarts', 'mermaid'])
const PURE_FORBIDDEN_GLOBALS = new Set(['window', 'document', 'localStorage', 'sessionStorage'])
const HTML_IN_RICHTEXT_RE = /<\s*(?:br|strong|div|span|table|tr|td|th|b|i|p|ul|li)\b/i
const RAW_DATE_TYPES = new Set(['date', 'time', 'datetime-local'])

function getScriptKind(filePath) {
  const ext = extname(filePath)
  if (ext === '.tsx') return ts.ScriptKind.TSX
  if (ext === '.ts' || ext === '.mts' || ext === '.cts') return ts.ScriptKind.TS
  return ts.ScriptKind.JS
}

function collectFiles(rootDir, subDir, filterFn) {
  const start = join(rootDir, subDir)
  if (!existsSync(start)) return []
  const out = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (IGNORED_DIRS.has(entry.name)) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (filterFn(full)) {
        out.push(full)
      }
    }
  }
  walk(start)
  return out.sort()
}

function lineOf(sf, pos) {
  return sf.getLineAndCharacterOfPosition(pos).line + 1
}

function normalizeRel(rootDir, absPath) {
  return relative(rootDir, absPath).replace(/\\/g, '/')
}

function isFreeIdentifierRead(node) {
  const parent = node.parent
  if (!parent) return false
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) {
    return false
  }
  if (
    (ts.isPropertyAssignment(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isGetAccessorDeclaration(parent) ||
      ts.isSetAccessorDeclaration(parent)) &&
    parent.name === node
  ) {
    return false
  }
  if (
    (ts.isImportSpecifier(parent) ||
      ts.isExportSpecifier(parent) ||
      ts.isImportClause(parent) ||
      ts.isNamespaceImport(parent) ||
      ts.isBindingElement(parent) ||
      ts.isParameter(parent) ||
      ts.isVariableDeclaration(parent) ||
      ts.isFunctionDeclaration(parent) ||
      ts.isInterfaceDeclaration(parent) ||
      ts.isTypeAliasDeclaration(parent) ||
      ts.isTypeParameterDeclaration(parent) ||
      ts.isEnumDeclaration(parent) ||
      ts.isEnumMember(parent) ||
      ts.isTypeReferenceNode(parent) ||
      ts.isTypeQueryNode(parent) ||
      ts.isQualifiedName(parent) ||
      ts.isLabeledStatement(parent) ||
      ts.isJsxAttribute(parent)) &&
    parent.name === node
  ) {
    return false
  }
  if (ts.isTypeReferenceNode(parent) || ts.isTypeQueryNode(parent)) {
    return false
  }
  let cur = parent
  while (cur) {
    if (ts.isTypeNode(cur) || ts.isInterfaceDeclaration(cur) || ts.isTypeAliasDeclaration(cur)) {
      return false
    }
    cur = cur.parent
  }
  return true
}

function hasValueImportBinding(importDecl) {
  const clause = importDecl.importClause
  if (!clause) return true
  if (clause.isTypeOnly) return false
  if (clause.name) return true
  const bindings = clause.namedBindings
  if (!bindings) return false
  if (ts.isNamespaceImport(bindings)) return true
  return bindings.elements.some((el) => !el.isTypeOnly)
}

function isPackageMatch(specifier, blockedSet) {
  if (blockedSet.has(specifier)) return true
  for (const pkg of blockedSet) {
    if (specifier.startsWith(`${pkg}/`)) return true
  }
  return false
}

function extractCssBlocks(cssText) {
  const containerHosts = new Set()
  const containerQueriedClasses = new Set()
  const containerSelfQueries = []
  const mediaWidthRules = []

  const lineAt = (idx) => cssText.slice(0, idx).split('\n').length

  let i = 0
  const len = cssText.length
  const skipString = (quote) => {
    i += 1
    while (i < len) {
      if (cssText[i] === '\\') {
        i += 2
        continue
      }
      if (cssText[i] === quote) {
        i += 1
        break
      }
      i += 1
    }
  }

  const readBalancedBlock = (openIdx) => {
    i = openIdx + 1
    let depth = 1
    const bodyStart = i
    while (i < len && depth > 0) {
      const ch = cssText[i]
      if (ch === '"' || ch === "'") {
        skipString(ch)
        continue
      }
      if (ch === '{') depth += 1
      else if (ch === '}') depth -= 1
      i += 1
    }
    return { body: cssText.slice(bodyStart, i - 1), endIdx: i }
  }

  const topRules = []
  let cursor = 0
  while (cursor < len) {
    const braceIdx = cssText.indexOf('{', cursor)
    if (braceIdx === -1) break
    const header = cssText.slice(cursor, braceIdx).trim()
    const startLine = lineAt(braceIdx)
    const { body, endIdx } = readBalancedBlock(braceIdx)
    topRules.push({ header, body, startLine })
    cursor = endIdx
  }

  const extractSelectorClasses = (selectorText) => {
    const classes = []
    for (const part of selectorText.split(',')) {
      const trimmed = part.trim()
      if (!trimmed) continue
      const subject = trimmed.split(/[\s>+~]+/).pop() ?? ''
      const m = /^\.([A-Za-z0-9_-]+)/.exec(subject)
      if (m) classes.push({ selector: trimmed, cls: m[1] })
    }
    return classes
  }

  for (const rule of topRules) {
    if (!rule.header.startsWith('@')) {
      if (/\bcontainer-type\s*:\s*(?:inline-size|size)\b/.test(rule.body)) {
        for (const sel of rule.header.split(',')) {
          const m = /^\.([A-Za-z0-9_-]+)$/.exec(sel.trim())
          if (m) containerHosts.add(m[1])
        }
      }
    }
  }

  for (const rule of topRules) {
    if (rule.header.startsWith('@container')) {
      for (const m of rule.body.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
        for (const item of extractSelectorClasses(m[1])) {
          containerQueriedClasses.add(item.cls)
          if (containerHosts.has(item.cls)) {
            containerSelfQueries.push({
              line: rule.startLine,
              selector: item.selector,
              cls: item.cls,
            })
          }
        }
      }
    } else if (rule.header.startsWith('@media') && /\b(?:max|min)-width\b/.test(rule.header)) {
      const classes = []
      for (const m of rule.body.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
        for (const item of extractSelectorClasses(m[1])) {
          classes.push(item)
        }
      }
      mediaWidthRules.push({ line: rule.startLine, header: rule.header, classes })
    }
  }

  return { containerQueriedClasses, containerSelfQueries, mediaWidthRules }
}

export function checkCssInvariants(source, relPath) {
  const violations = []
  const { containerQueriedClasses, containerSelfQueries, mediaWidthRules } =
    extractCssBlocks(source)

  for (const sq of containerSelfQueries) {
    violations.push({
      rule: 'css-no-container-self-query',
      file: relPath,
      line: sq.line,
      message: `@container targets ".${sq.cls}" ("${sq.selector}"), which itself declares container-type; wrap children in an inner element instead.`,
    })
  }

  for (const mr of mediaWidthRules) {
    if (mr.classes.length === 0) {
      violations.push({
        rule: 'css-media-requires-container',
        file: relPath,
        line: mr.line,
        message: `${mr.header} uses viewport width without matching @container selectors.`,
      })
      continue
    }
    for (const item of mr.classes) {
      if (!containerQueriedClasses.has(item.cls)) {
        violations.push({
          rule: 'css-media-requires-container',
          file: relPath,
          line: mr.line,
          message: `${mr.header} styles ".${item.cls}" without a sibling @container breakpoint in ${relPath}.`,
        })
      }
    }
  }

  return violations
}

export function checkTsInvariants(source, relPath) {
  const violations = []
  const sf = ts.createSourceFile(
    relPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(relPath),
  )

  const isShell = relPath.startsWith('src/client/shell/') || relPath === 'src/client/index.ts'
  const isPure =
    (relPath.startsWith('src/shared/') && relPath !== 'src/shared/locale.ts') ||
    /^src\/client\/catalog\/.*-helpers\.ts$/.test(relPath)
  const isCatalogTsx = relPath.startsWith('src/client/catalog/') && relPath.endsWith('.tsx')
  const isCatalogHelper = /^src\/client\/catalog\/.*-helpers\.ts$/.test(relPath)
  const isClientFile = relPath.startsWith('src/client/')
  const isEchartsChunk = relPath === 'src/client/chunks/echarts-chunk.ts'

  const report = (rule, node, message) => {
    violations.push({
      rule,
      file: relPath,
      line: lineOf(sf, node.getStart(sf)),
      message,
    })
  }

  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text
      const hasVal = hasValueImportBinding(node)

      if (
        relPath !== 'src/client/dom-hooks.ts' &&
        spec === 'react' &&
        node.importClause?.namedBindings
      ) {
        if (ts.isNamedImports(node.importClause.namedBindings)) {
          for (const el of node.importClause.namedBindings.elements) {
            const orig = el.propertyName?.text ?? el.name.text
            if (orig === 'useEffect' || orig === 'useLayoutEffect') {
              report(
                'no-useeffect-outside-dom-hooks',
                el,
                `Importing "${orig}" is restricted strictly to src/client/dom-hooks.ts.`,
              )
            }
          }
        }
      }

      if (isShell && hasVal) {
        if (
          isPackageMatch(spec, SHELL_FORBIDDEN_PACKAGES) ||
          /(?:^|\/)(?:runtime|catalog|chunks|host)\//.test(spec)
        ) {
          report(
            'shell-runtime-boundary',
            node,
            `Cold-boot shell "${relPath}" must not value-import "${spec}"; use lazy chunk-loader or "import type".`,
          )
        }
      }

      if (isPure && hasVal) {
        if (isPackageMatch(spec, PURE_FORBIDDEN_PACKAGES) || /(?:^|\/)host\//.test(spec)) {
          report(
            'pure-module-isolation',
            node,
            `Pure module "${relPath}" must not import "${spec}".`,
          )
        }
      }
    }

    if (
      relPath !== 'src/client/dom-hooks.ts' &&
      ts.isCallExpression(node) &&
      ((ts.isIdentifier(node.expression) &&
        (node.expression.text === 'useEffect' || node.expression.text === 'useLayoutEffect')) ||
        (ts.isPropertyAccessExpression(node.expression) &&
          (node.expression.name.text === 'useEffect' ||
            node.expression.name.text === 'useLayoutEffect')))
    ) {
      report(
        'no-useeffect-outside-dom-hooks',
        node,
        'Calling useEffect/useLayoutEffect is restricted strictly to src/client/dom-hooks.ts.',
      )
    }

    if (relPath !== 'src/client/persistence.ts') {
      if (ts.isIdentifier(node) && node.text === 'localStorage' && isFreeIdentifierRead(node)) {
        report(
          'no-direct-localstorage',
          node,
          'Direct localStorage access is forbidden outside src/client/persistence.ts.',
        )
      } else if (
        ts.isPropertyAccessExpression(node) &&
        node.name.text === 'localStorage' &&
        ts.isIdentifier(node.expression) &&
        (node.expression.text === 'window' || node.expression.text === 'globalThis')
      ) {
        report(
          'no-direct-localstorage',
          node,
          'Direct window/globalThis.localStorage access is forbidden outside src/client/persistence.ts.',
        )
      }
    }

    if (
      isClientFile &&
      relPath !== 'src/client/dom-hooks.ts' &&
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'addEventListener' &&
      ts.isIdentifier(node.expression.expression) &&
      (node.expression.expression.text === 'window' ||
        node.expression.expression.text === 'document') &&
      node.arguments.length >= 1 &&
      ts.isStringLiteral(node.arguments[0]) &&
      node.arguments[0].text === 'keydown'
    ) {
      report(
        'no-direct-window-keydown',
        node,
        'Register global keydown/Escape handlers through src/client/dom-hooks.ts (LIFO escapeHandlerStack).',
      )
    }

    if (
      isClientFile &&
      relPath !== 'src/client/catalog/NativeDateField.tsx' &&
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      ts.isIdentifier(node.tagName) &&
      node.tagName.text === 'input'
    ) {
      for (const attr of node.attributes.properties) {
        if (
          ts.isJsxAttribute(attr) &&
          ts.isIdentifier(attr.name) &&
          attr.name.text === 'type' &&
          attr.initializer
        ) {
          const val = ts.isStringLiteral(attr.initializer)
            ? attr.initializer.text
            : ts.isJsxExpression(attr.initializer) &&
                attr.initializer.expression &&
                ts.isStringLiteral(attr.initializer.expression)
              ? attr.initializer.expression.text
              : null
          if (val !== null && RAW_DATE_TYPES.has(val)) {
            report(
              'no-raw-native-date-input',
              attr,
              `Raw <input type="${val}"> is forbidden; use NativeDateField for dual-theme colorScheme parity.`,
            )
          }
        }
      }
    }

    if (isEchartsChunk) {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        if (HTML_IN_RICHTEXT_RE.test(node.text)) {
          report(
            'no-html-in-echarts-richtext',
            node,
            `ECharts richText mode must not embed raw HTML tags (${JSON.stringify(node.text.slice(0, 48))}); use plain "\\n" formatting.`,
          )
        }
      } else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
        if (HTML_IN_RICHTEXT_RE.test(node.text)) {
          report(
            'no-html-in-echarts-richtext',
            node,
            `ECharts richText template must not embed raw HTML tags (${JSON.stringify(node.text.slice(0, 48))}).`,
          )
        }
      } else if (ts.isObjectLiteralExpression(node)) {
        let usesTooltipBg = false
        let badTextColorNode = null
        for (const prop of node.properties) {
          if (!ts.isPropertyAssignment(prop)) continue
          const propName = ts.isIdentifier(prop.name)
            ? prop.name.text
            : ts.isStringLiteral(prop.name)
              ? prop.name.text
              : ''
          if (
            propName === 'backgroundColor' &&
            ts.isPropertyAccessExpression(prop.initializer) &&
            prop.initializer.name.text === 'tooltipBg'
          ) {
            usesTooltipBg = true
          }
          if (propName === 'textStyle' && ts.isObjectLiteralExpression(prop.initializer)) {
            for (const sub of prop.initializer.properties) {
              if (!ts.isPropertyAssignment(sub)) continue
              const subName = ts.isIdentifier(sub.name)
                ? sub.name.text
                : ts.isStringLiteral(sub.name)
                  ? sub.name.text
                  : ''
              if (
                subName === 'color' &&
                ts.isPropertyAccessExpression(sub.initializer) &&
                (sub.initializer.name.text === 'textPrimary' ||
                  sub.initializer.name.text === 'textSecondary')
              ) {
                badTextColorNode = sub
              }
            }
          }
        }
        if (usesTooltipBg && badTextColorNode !== null) {
          report(
            'echarts-tooltip-contrast-token',
            badTextColorNode,
            'ECharts tooltip with theme.tooltipBg must use contrast-verified theme.tooltipText, never theme.textPrimary/textSecondary.',
          )
        }
      }
    }

    if (
      isCatalogHelper &&
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'JSON' &&
      node.expression.name.text === 'stringify'
    ) {
      report(
        'no-raw-json-stringify-in-helpers',
        node,
        'Use safeStringifyJson from src/shared/constants.ts instead of raw JSON.stringify in catalog helpers.',
      )
    }

    if (isPure && ts.isIdentifier(node) && PURE_FORBIDDEN_GLOBALS.has(node.text)) {
      if (isFreeIdentifierRead(node)) {
        report(
          'pure-module-isolation',
          node,
          `Pure module "${relPath}" must not reference browser global "${node.text}".`,
        )
      }
    }

    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'eval'
    ) {
      report('security-no-dangerous-sinks', node, 'Direct eval() is forbidden.')
    }

    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'Function'
    ) {
      report('security-no-dangerous-sinks', node, 'Dynamic new Function() is forbidden.')
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      (node.left.name.text === 'innerHTML' || node.left.name.text === 'outerHTML')
    ) {
      report(
        'security-no-dangerous-sinks',
        node,
        `Direct assignment to .${node.left.name.text} is forbidden.`,
      )
    }

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'document' &&
      node.expression.name.text === 'write'
    ) {
      report('security-no-dangerous-sinks', node, 'document.write() is forbidden.')
    }

    if (
      relPath !== 'src/client/catalog/ExtendedWidgets.tsx' &&
      ts.isJsxAttribute(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'dangerouslySetInnerHTML'
    ) {
      report(
        'security-no-dangerous-sinks',
        node,
        'dangerouslySetInnerHTML is restricted exclusively to sanitized SVG rendering in ExtendedWidgets.tsx.',
      )
    }

    if (isCatalogTsx && ts.isObjectLiteralExpression(node)) {
      let hasWeightSpread = false
      let widthFullNode = null
      for (const prop of node.properties) {
        if (
          ts.isSpreadAssignment(prop) &&
          ts.isCallExpression(prop.expression) &&
          ts.isIdentifier(prop.expression.expression) &&
          prop.expression.expression.text === 'weightStyle'
        ) {
          hasWeightSpread = true
        }
        if (
          ts.isPropertyAssignment(prop) &&
          ((ts.isIdentifier(prop.name) && prop.name.text === 'width') ||
            (ts.isStringLiteral(prop.name) && prop.name.text === 'width')) &&
          ts.isStringLiteral(prop.initializer) &&
          prop.initializer.text === '100%'
        ) {
          widthFullNode = prop
        }
      }
      if (hasWeightSpread && widthFullNode !== null) {
        report(
          'no-weight-full-width-override',
          widthFullNode,
          'Do not hardcode width: "100%" alongside ...weightStyle(...) on weighted flex items.',
        )
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sf)
  return violations
}

function collectJsonKeyPaths(obj, prefix = '') {
  const out = []
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return out
  }
  for (const [k, v] of Object.entries(obj)) {
    const next = prefix === '' ? k : `${prefix}.${k}`
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      out.push(...collectJsonKeyPaths(v, next))
    } else {
      out.push({ key: next, value: v })
    }
  }
  return out
}

function extractLocaleMapKeys(source, relPath, exportNames) {
  const sf = ts.createSourceFile(relPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const found = new Map()
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      exportNames.has(node.name.text) &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      const langs = new Map()
      for (const prop of node.initializer.properties) {
        if (
          ts.isPropertyAssignment(prop) &&
          (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) &&
          ts.isObjectLiteralExpression(prop.initializer)
        ) {
          const lang = prop.name.text
          const keys = new Set()
          for (const entry of prop.initializer.properties) {
            if (
              (ts.isPropertyAssignment(entry) || ts.isMethodDeclaration(entry)) &&
              (ts.isIdentifier(entry.name) || ts.isStringLiteral(entry.name))
            ) {
              keys.add(entry.name.text)
            }
          }
          langs.set(lang, { keys, line: lineOf(sf, prop.getStart(sf)) })
        }
      }
      found.set(node.name.text, langs)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return found
}

export function checkLocaleParity(rootDir) {
  const violations = []
  const localeDir = join(rootDir, 'locale')
  if (existsSync(localeDir)) {
    const files = readdirSync(localeDir)
      .filter((f) => f.endsWith('.json'))
      .sort()
    const parsed = files.map((f) => {
      const rel = `locale/${f}`
      const json = JSON.parse(readFileSync(join(localeDir, f), 'utf8'))
      const entries = collectJsonKeyPaths(json)
      return { rel, entries, keySet: new Set(entries.map((e) => e.key)) }
    })
    if (parsed.length >= 2) {
      const baseline = parsed[0]
      for (const item of parsed) {
        for (const e of item.entries) {
          if (typeof e.value === 'string' && e.value.trim() === '') {
            violations.push({
              rule: 'locale-key-parity',
              file: item.rel,
              line: 1,
              message: `Empty locale string at "${e.key}".`,
            })
          }
        }
        for (const k of baseline.keySet) {
          if (!item.keySet.has(k)) {
            violations.push({
              rule: 'locale-key-parity',
              file: item.rel,
              line: 1,
              message: `Missing key "${k}" present in ${baseline.rel}.`,
            })
          }
        }
        for (const k of item.keySet) {
          if (!baseline.keySet.has(k)) {
            violations.push({
              rule: 'locale-key-parity',
              file: item.rel,
              line: 1,
              message: `Extra key "${k}" missing from ${baseline.rel}.`,
            })
          }
        }
      }
    }
  }

  const tsLocaleChecks = [
    {
      rel: 'src/shared/i18n.ts',
      exports: new Set(['HOST_MESSAGES', 'SHELL_MESSAGES', 'RUNTIME_MESSAGES']),
    },
    {
      rel: 'src/shared/chart-i18n.ts',
      exports: new Set(['CHART_MESSAGES']),
    },
  ]
  for (const spec of tsLocaleChecks) {
    const full = join(rootDir, spec.rel)
    if (!existsSync(full)) continue
    const maps = extractLocaleMapKeys(readFileSync(full, 'utf8'), spec.rel, spec.exports)
    for (const [exportName, langs] of maps) {
      const en = langs.get('en')
      const zh = langs.get('zh')
      if (!en || !zh) {
        violations.push({
          rule: 'locale-key-parity',
          file: spec.rel,
          line: 1,
          message: `${exportName} must define both "en" and "zh" message maps.`,
        })
        continue
      }
      for (const k of en.keys) {
        if (!zh.keys.has(k)) {
          violations.push({
            rule: 'locale-key-parity',
            file: spec.rel,
            line: zh.line,
            message: `${exportName}.zh is missing key "${k}" present in ${exportName}.en.`,
          })
        }
      }
      for (const k of zh.keys) {
        if (!en.keys.has(k)) {
          violations.push({
            rule: 'locale-key-parity',
            file: spec.rel,
            line: en.line,
            message: `${exportName}.en is missing key "${k}" present in ${exportName}.zh.`,
          })
        }
      }
    }
  }

  return violations
}

export function runAllInvariantChecks(rootDir) {
  const violations = []
  const tsFiles = collectFiles(rootDir, 'src', (f) => /\.(?:ts|tsx)$/.test(f))
  const cssFiles = collectFiles(rootDir, 'src/client', (f) => f.endsWith('.css'))

  for (const abs of tsFiles) {
    const rel = normalizeRel(rootDir, abs)
    violations.push(...checkTsInvariants(readFileSync(abs, 'utf8'), rel))
  }
  for (const abs of cssFiles) {
    const rel = normalizeRel(rootDir, abs)
    violations.push(...checkCssInvariants(readFileSync(abs, 'utf8'), rel))
  }
  violations.push(...checkLocaleParity(rootDir))

  return {
    ok: violations.length === 0,
    filesScanned: tsFiles.length + cssFiles.length,
    violations,
  }
}

function runCli() {
  const rootDir = resolve(import.meta.dirname, '..')
  const report = runAllInvariantChecks(rootDir)
  if (!report.ok) {
    console.error(
      `[check-invariants] FAILED: ${report.violations.length} violation(s) across ${report.filesScanned} file(s):`,
    )
    for (const v of report.violations) {
      console.error(`  - [${v.rule}] ${v.file}:${v.line} — ${v.message}`)
    }
    process.exit(1)
  }
  console.log(
    `[check-invariants] OK: 14 architectural invariant rules verified across ${report.filesScanned} source/CSS file(s) and locale tables.`,
  )
}

const isEntry =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isEntry) {
  runCli()
}
