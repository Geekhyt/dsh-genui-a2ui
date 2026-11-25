#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
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
const CATASTROPHIC_TRAILING_QUANT_RE = /(?:\[[^\]]+\]|\\[sdw/]|[^\\])[+*]\$\/[a-z]*$/

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
  const shadowedResponsiveRules = []

  const extractDeclaredProps = (declBody) => {
    const props = new Set()
    for (const part of declBody.split(';')) {
      const colonIdx = part.indexOf(':')
      if (colonIdx <= 0) continue
      const prop = part.slice(0, colonIdx).trim().toLowerCase()
      if (/^[a-z-]+$/.test(prop)) props.add(prop)
    }
    return props
  }

  const findOverlappingProp = (responsiveProps, baseProps) => {
    for (const rp of responsiveProps) {
      if (baseProps.has(rp)) return rp
      for (const bp of baseProps) {
        if (rp.startsWith(`${bp}-`) || bp.startsWith(`${rp}-`)) return `${rp}/${bp}`
      }
    }
    return null
  }

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

  const stickyTransparentBgRules = []
  const stickyShorthandOverrideRules = []
  const opaqueControlBgRules = []
  const fixedTablePreCellRules = []
  const rawWhiteOnStatePrimaryRules = []
  const fixedTablePrefixes = new Set()
  const STATE_PRIMARY_BG_RE =
    /\bbackground(?:-color)?\s*:\s*var\(\s*--(?:dsw-alias-state-(?:business|error|warn|success)-primary|a2ui-(?:accent|danger|warn|success))\b/
  const RAW_WHITE_COLOR_RE = /(?:^|[;{\s])color\s*:\s*(?:#fff(?:fff)?\b|white\b)/i
  const TRANSLUCENT_LAYER_BG_RE =
    /background(?:-color)?\s*:\s*var\(\s*--(?:dsw-alias-bg-layer-1|a2ui-bg-1)\b/
  const RAW_PRE_RE = /\bwhite-space\s*:\s*pre\s*(?:;|$)/
  const TABLE_STATE_CELL_RE =
    /(?:(?:^|[\s>+~])(?:\.thSortable\b[^,]*:|(?:\.table\b|\.proSummaryRow\b)[^,]*(?:[\s>+~])(?:\.td\b|td\b|\.th\b|th\b)))/
  const BG_SHORTHAND_RE = /(?:^|[;{\s])background\s*:/
  for (const rule of topRules) {
    if (!rule.header.startsWith('@') && /\btable-layout\s*:\s*fixed\b/.test(rule.body)) {
      for (const sel of rule.header.split(',')) {
        const m = /^\.([A-Za-z0-9_-]+)Table$/.exec(sel.trim())
        if (m?.[1]) fixedTablePrefixes.add(m[1])
      }
    }
  }
  for (const rule of topRules) {
    if (!rule.header.startsWith('@')) {
      if (/\bposition\s*:\s*sticky\b/.test(rule.body)) {
        if (TRANSLUCENT_LAYER_BG_RE.test(rule.body)) {
          stickyTransparentBgRules.push({ line: rule.startLine, header: rule.header })
        }
      }
      if (
        /::-(?:webkit-slider|moz-range)-thumb\b/.test(rule.header) &&
        TRANSLUCENT_LAYER_BG_RE.test(rule.body)
      ) {
        opaqueControlBgRules.push({ line: rule.startLine, header: rule.header })
      }
      if (RAW_PRE_RE.test(rule.body)) {
        let isFixedCell = false
        for (const item of extractSelectorClasses(rule.header)) {
          if (/(?:Split|Fixed)Cell$/.test(item.cls)) {
            isFixedCell = true
            break
          }
          for (const prefix of fixedTablePrefixes) {
            if (item.cls.startsWith(prefix) && item.cls.endsWith('Cell')) {
              isFixedCell = true
              break
            }
          }
          if (isFixedCell) break
        }
        if (isFixedCell) {
          fixedTablePreCellRules.push({ line: rule.startLine, header: rule.header })
        }
      }
      if (STATE_PRIMARY_BG_RE.test(rule.body) && RAW_WHITE_COLOR_RE.test(rule.body)) {
        rawWhiteOnStatePrimaryRules.push({ line: rule.startLine, header: rule.header })
      }
      if (BG_SHORTHAND_RE.test(rule.body)) {
        for (const sel of rule.header.split(',')) {
          const trimmedSel = sel.trim()
          if (
            TABLE_STATE_CELL_RE.test(trimmedSel) &&
            !trimmedSel.includes(':not(.tableStickyCol)') &&
            !trimmedSel.includes('.tableStickyCol')
          ) {
            stickyShorthandOverrideRules.push({ line: rule.startLine, header: trimmedSel })
          }
        }
      }
    }
  }

  const responsiveDeclByClass = new Map()
  for (const rule of topRules) {
    if (rule.header.startsWith('@container')) {
      for (const m of rule.body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const declProps = extractDeclaredProps(m[2] ?? '')
        for (const item of extractSelectorClasses(m[1])) {
          containerQueriedClasses.add(item.cls)
          if (containerHosts.has(item.cls)) {
            containerSelfQueries.push({
              line: rule.startLine,
              selector: item.selector,
              cls: item.cls,
            })
          }
          if (/^\.[A-Za-z0-9_-]+$/.test(item.selector) && declProps.size > 0) {
            const list = responsiveDeclByClass.get(item.cls) ?? []
            list.push({ line: rule.startLine, header: rule.header, props: declProps })
            responsiveDeclByClass.set(item.cls, list)
          }
        }
      }
    } else if (rule.header.startsWith('@media') && /\b(?:max|min)-width\b/.test(rule.header)) {
      const classes = []
      for (const m of rule.body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const declProps = extractDeclaredProps(m[2] ?? '')
        for (const item of extractSelectorClasses(m[1])) {
          classes.push(item)
          if (/^\.[A-Za-z0-9_-]+$/.test(item.selector) && declProps.size > 0) {
            const list = responsiveDeclByClass.get(item.cls) ?? []
            list.push({ line: rule.startLine, header: rule.header, props: declProps })
            responsiveDeclByClass.set(item.cls, list)
          }
        }
      }
      mediaWidthRules.push({ line: rule.startLine, header: rule.header, classes })
    } else if (!rule.header.startsWith('@')) {
      const baseProps = extractDeclaredProps(rule.body)
      if (baseProps.size > 0) {
        for (const sel of rule.header.split(',')) {
          const m = /^\.([A-Za-z0-9_-]+)$/.exec(sel.trim())
          if (!m) continue
          const priorList = responsiveDeclByClass.get(m[1])
          if (!priorList) continue
          for (const prior of priorList) {
            const overlap = findOverlappingProp(prior.props, baseProps)
            if (overlap) {
              shadowedResponsiveRules.push({
                line: prior.line,
                laterLine: rule.startLine,
                cls: m[1],
                header: prior.header,
                prop: overlap,
              })
            }
          }
        }
      }
    }
  }

  return {
    containerQueriedClasses,
    containerSelfQueries,
    mediaWidthRules,
    shadowedResponsiveRules,
    stickyTransparentBgRules,
    stickyShorthandOverrideRules,
    opaqueControlBgRules,
    fixedTablePreCellRules,
    rawWhiteOnStatePrimaryRules,
  }
}

export function checkCssInvariants(source, relPath) {
  const violations = []
  const {
    containerQueriedClasses,
    containerSelfQueries,
    mediaWidthRules,
    shadowedResponsiveRules,
    stickyTransparentBgRules,
    stickyShorthandOverrideRules,
    opaqueControlBgRules,
    fixedTablePreCellRules,
    rawWhiteOnStatePrimaryRules,
  } = extractCssBlocks(source)

  if (/\blight-dark\s*\(/.test(source)) {
    const hasDarkScheme = /\bcolor-scheme\s*:\s*dark\b/.test(source)
    const hasLightScheme = /\bcolor-scheme\s*:\s*light\b/.test(source)
    if (!hasDarkScheme || !hasLightScheme) {
      violations.push({
        rule: 'css-light-dark-requires-color-scheme',
        file: relPath,
        line: 1,
        message: `${relPath} uses light-dark(...) without declaring both color-scheme: dark and color-scheme: light rules.`,
      })
    }
  }

  for (const st of stickyTransparentBgRules) {
    violations.push({
      rule: 'css-sticky-bg-opaque-layer',
      file: relPath,
      line: st.line,
      message: `Sticky rule "${st.header}" uses translucent --dsw-alias-bg-layer-1 as primary background-color; use opaque --dsw-alias-bg-base with optional linear-gradient tint.`,
    })
  }

  for (const so of stickyShorthandOverrideRules) {
    violations.push({
      rule: 'css-sticky-no-shorthand-override',
      file: relPath,
      line: so.line,
      message: `Table state cell selector "${so.header}" sets background shorthand without :not(.tableStickyCol), which wipes opaque sticky backing and causes scroll bleed-through.`,
    })
  }

  for (const oc of opaqueControlBgRules) {
    violations.push({
      rule: 'css-opaque-control-bg',
      file: relPath,
      line: oc.line,
      message: `Slider thumb rule "${oc.header}" uses translucent --dsw-alias-bg-layer-1; use opaque --dsw-alias-switch-thumb / --a2ui-bg-opaque so tracks cannot bleed through.`,
    })
  }

  for (const fp of fixedTablePreCellRules) {
    violations.push({
      rule: 'css-fixed-table-no-overflow-pre',
      file: relPath,
      line: fp.line,
      message: `Fixed-layout table cell "${fp.header}" sets white-space: pre; use white-space: pre-wrap with word-break/overflow-wrap so adjacent cells cannot collide.`,
    })
  }

  const REDUNDANT_ROOT_TOKEN_FALLBACK_RE =
    /\bvar\(\s*(--a2ui-(?:mono|fg|fg-2|fg-3|accent|accent-fg|brand|success|success-fg|warn|warn-fg|danger|danger-fg|bg-1|bg-2|bg-3|bg-hover|bg-opaque|border-1|border-2|r-sm|r-md|r-lg|on-accent))\s*,/g
  for (const m of source.matchAll(REDUNDANT_ROOT_TOKEN_FALLBACK_RE)) {
    const line = source.slice(0, m.index ?? 0).split('\n').length
    violations.push({
      rule: 'css-no-redundant-a2ui-token-fallback',
      file: relPath,
      line,
      message: `Redundant fallback on root-defined token "${m[1]}"; use var(${m[1]}) directly.`,
    })
  }

  for (const rw of rawWhiteOnStatePrimaryRules) {
    violations.push({
      rule: 'css-no-raw-white-on-state-primary',
      file: relPath,
      line: rw.line,
      message: `Rule "${rw.header}" pairs hardcoded white text with a state primary background (breaks WCAG contrast in Dark Mode); use var(--a2ui-on-accent) or light-dark(#ffffff, #0b1220).`,
    })
  }

  for (const sr of shadowedResponsiveRules) {
    violations.push({
      rule: 'css-no-shadowed-container-query',
      file: relPath,
      line: sr.line,
      message: `${sr.header} overrides ".${sr.cls}" (${sr.prop}) before its base rule at line ${sr.laterLine}; move the responsive block after the base rule.`,
    })
  }

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

  if (source.includes(':where(') && source.includes(':is(.row, .listHorizontal)')) {
    const whereBlockRe = /:where\(([\s\S]*?)\)\s*\{([\s\S]*?)\}/g
    const fullWidthClasses = new Map()
    let wm = whereBlockRe.exec(source)
    while (wm !== null) {
      const body = wm[2] ?? ''
      if (/\bwidth\s*:\s*100%\s*;/.test(body)) {
        const selectorList = wm[1] ?? ''
        const clsRe = /\.([A-Za-z_][A-Za-z0-9_-]*)/g
        let cm = clsRe.exec(selectorList)
        while (cm !== null) {
          const cls = cm[1]
          if (cls && !fullWidthClasses.has(cls)) {
            const absIdx = wm.index + 7 + cm.index
            fullWidthClasses.set(cls, source.slice(0, Math.max(0, absIdx)).split('\n').length)
          }
          cm = clsRe.exec(selectorList)
        }
      }
      wm = whereBlockRe.exec(source)
    }

    if (fullWidthClasses.size > 0) {
      const directCovered = new Set()
      const wrappedCovered = new Set()
      const directRuleRe =
        /:is\(\.row,\s*\.listHorizontal\)\s*>\s*(?::is\(([\s\S]*?)\)|\.([A-Za-z_][A-Za-z0-9_-]*))/g
      let dm = directRuleRe.exec(source)
      while (dm !== null) {
        if (dm[2]) {
          directCovered.add(dm[2])
        } else if (dm[1]) {
          const clsRe = /\.([A-Za-z_][A-Za-z0-9_-]*)/g
          let cm = clsRe.exec(dm[1])
          while (cm !== null) {
            if (cm[1]) directCovered.add(cm[1])
            cm = clsRe.exec(dm[1])
          }
        }
        dm = directRuleRe.exec(source)
      }

      const wrappedRuleRe =
        /:is\(\.row,\s*\.listHorizontal\)\s*>\s*\*\s*>\s*(?::is\(([\s\S]*?)\)|\.([A-Za-z_][A-Za-z0-9_-]*))/g
      let wrm = wrappedRuleRe.exec(source)
      while (wrm !== null) {
        if (wrm[2]) {
          wrappedCovered.add(wrm[2])
        } else if (wrm[1]) {
          const clsRe = /\.([A-Za-z_][A-Za-z0-9_-]*)/g
          let cm = clsRe.exec(wrm[1])
          while (cm !== null) {
            if (cm[1]) wrappedCovered.add(cm[1])
            cm = clsRe.exec(wrm[1])
          }
        }
        wrm = wrappedRuleRe.exec(source)
      }

      for (const [cls, line] of fullWidthClasses) {
        if (!directCovered.has(cls) || !wrappedCovered.has(cls)) {
          violations.push({
            rule: 'css-row-flex-parity',
            file: relPath,
            line,
            message: `".${cls}" declares width: 100% in :where(...) but is missing from :is(.row, .listHorizontal) direct/wrapped flex-basis rules.`,
          })
        }
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
  const isEchartsChunk =
    relPath === 'src/client/chunks/echarts-chunk.ts' ||
    relPath.startsWith('src/client/chunks/echarts/')
  const isMermaidChunk = relPath === 'src/client/chunks/mermaid-chunk.ts'

  const report = (rule, node, message) => {
    violations.push({
      rule,
      file: relPath,
      line: lineOf(sf, node.getStart(sf)),
      message,
    })
  }

  const checkRawEchartsFormatterSubtree = (root) => {
    const walk = (n) => {
      if (ts.isPropertyAssignment(n)) {
        const pname = ts.isIdentifier(n.name)
          ? n.name.text
          : ts.isStringLiteral(n.name)
            ? n.name.text
            : ''
        if (
          pname === 'formatter' &&
          !ts.isArrowFunction(n.initializer) &&
          !ts.isFunctionExpression(n.initializer)
        ) {
          report(
            'echarts-no-raw-string-formatter',
            n,
            'ECharts markLine/edgeLabel formatters must be functions (() => text) so literal {a}/{b}/{c} tokens in data cannot be interpolated.',
          )
        }
      }
      ts.forEachChild(n, walk)
    }
    walk(root)
  }

  const checkCurlSubtree = (root) => {
    const walk = (n) => {
      if (
        (ts.isStringLiteral(n) ||
          ts.isNoSubstitutionTemplateLiteral(n) ||
          ts.isTemplateHead(n) ||
          ts.isTemplateMiddle(n) ||
          ts.isTemplateTail(n)) &&
        /(?:^|\s)-d(?:\s|$)/.test(n.text)
      ) {
        report(
          'no-raw-curl-data-flag',
          n,
          'Use --data-raw instead of -d when generating curl commands so payloads starting with "@" cannot read local files.',
        )
      }
      ts.forEachChild(n, walk)
    }
    walk(root)
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
      if (
        ts.isFunctionDeclaration(node) &&
        node.name?.text === 'buildReferenceMarkLine' &&
        node.body
      ) {
        checkRawEchartsFormatterSubtree(node.body)
      } else if (ts.isPropertyAssignment(node)) {
        const propName = ts.isIdentifier(node.name)
          ? node.name.text
          : ts.isStringLiteral(node.name)
            ? node.name.text
            : ''
        if (propName === 'markLine' || propName === 'edgeLabel') {
          checkRawEchartsFormatterSubtree(node.initializer)
        } else if (propName === 'tooltip' && ts.isObjectLiteralExpression(node.initializer)) {
          for (const tp of node.initializer.properties) {
            if (!ts.isPropertyAssignment(tp)) continue
            const tpName = ts.isIdentifier(tp.name)
              ? tp.name.text
              : ts.isStringLiteral(tp.name)
                ? tp.name.text
                : ''
            if (
              tpName === 'formatter' &&
              (ts.isStringLiteral(tp.initializer) ||
                ts.isNoSubstitutionTemplateLiteral(tp.initializer)) &&
              /\{[a-d]\}/.test(tp.initializer.text)
            ) {
              report(
                'echarts-no-pie-string-template-tooltip',
                tp,
                'ECharts tooltip formatters must be functions instead of "{b}/{c}/{d}" template strings so special characters and long labels do not HTML-escape or clip in richText mode.',
              )
            }
          }
        }
      }
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
      isCatalogTsx &&
      relPath !== 'src/client/catalog/widget-helpers.tsx' &&
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'props' &&
      (node.expression.name.text === 'action' ||
        node.expression.name.text === 'approveAction' ||
        node.expression.name.text === 'rejectAction')
    ) {
      report(
        'catalog-unified-action-runner',
        node,
        `Invoke props.${node.expression.name.text} through useSurfaceActionRunner or runSurfaceAction instead of calling it directly.`,
      )
    }

    if (
      (isCatalogHelper ||
        relPath === 'src/client/action-protocol.ts' ||
        relPath === 'src/client/index.ts') &&
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'JSON' &&
      node.expression.name.text === 'stringify'
    ) {
      report(
        isCatalogHelper
          ? 'no-raw-json-stringify-in-helpers'
          : 'no-raw-json-stringify-action-bridge',
        node,
        'Use safeStringifyJson from src/shared/constants.ts instead of raw JSON.stringify.',
      )
    }

    if (
      relPath !== 'src/client/catalog/widget-helpers.tsx' &&
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      (node.expression.text === 'createComponentImplementation' ||
        node.expression.text === 'createBinderlessComponentImplementation')
    ) {
      report(
        'catalog-define-component-only',
        node,
        'Use defineComponent from src/client/catalog/widget-helpers.tsx instead of calling createComponentImplementation directly so custom elements use reload-safe dsh-a2ui-* tags.',
      )
    }

    if (
      isCatalogTsx &&
      relPath !== 'src/client/catalog/widget-helpers.tsx' &&
      ((ts.isFunctionDeclaration(node) && node.name?.text === 'copyToClipboardSafe') ||
        (ts.isPropertyAccessExpression(node) &&
          node.name.text === 'writeText' &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === 'clipboard'))
    ) {
      report(
        'no-duplicate-clipboard-wrapper',
        node,
        'Use copyTextToClipboard from src/client/catalog/widget-helpers.tsx instead of duplicating clipboard access.',
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
      relPath !== 'src/client/catalog/widgets/MermaidWidget.tsx' &&
      ts.isJsxAttribute(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'dangerouslySetInnerHTML'
    ) {
      report(
        'security-no-dangerous-sinks',
        node,
        'dangerouslySetInnerHTML is restricted exclusively to sanitized SVG rendering in widgets/MermaidWidget.tsx.',
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

    if (
      isMermaidChunk &&
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'initialize' &&
      node.arguments.length >= 1 &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      const hasDomPurifyCfg = node.arguments[0].properties.some(
        (prop) =>
          (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) &&
          ((ts.isIdentifier(prop.name) && prop.name.text === 'dompurifyConfig') ||
            (ts.isStringLiteral(prop.name) && prop.name.text === 'dompurifyConfig')),
      )
      if (!hasDomPurifyCfg) {
        report(
          'mermaid-init-dompurify-config',
          node,
          'mermaid.initialize(...) must pass an explicit dompurifyConfig forbidding unsafe SVG tags/attributes.',
        )
      }
    }

    if (
      isClientFile &&
      ts.isFunctionDeclaration(node) &&
      node.name &&
      /curl/i.test(node.name.text) &&
      node.body
    ) {
      checkCurlSubtree(node.body)
    }

    if (
      isClientFile &&
      relPath.endsWith('.tsx') &&
      ts.isCallExpression(node) &&
      ((ts.isIdentifier(node.expression) && node.expression.text === 'createPortal') ||
        (ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === 'createPortal')) &&
      node.arguments.length >= 2 &&
      node.arguments[1].getText(sf).includes('document.body')
    ) {
      const firstArgText = node.arguments[0].getText(sf)
      if (
        !(
          (firstArgText.includes('a2ui-dark') && firstArgText.includes('a2ui-light')) ||
          /\bthemeCls\b/.test(firstArgText)
        )
      ) {
        report(
          'tsx-portal-theme-class',
          node,
          'document.body portals must apply both a2ui-dark / a2ui-light theme classes so light-dark() tokens resolve outside surface containers.',
        )
      }
    }

    if (isClientFile && ts.isBlock(node)) {
      const stmts = node.statements
      for (let i = 0; i + 1 < stmts.length; i += 1) {
        const cur = stmts[i]
        const next = stmts[i + 1]
        if (!ts.isExpressionStatement(cur) || !ts.isExpressionStatement(next)) continue
        const curExpr = ts.isVoidExpression(cur.expression)
          ? cur.expression.expression
          : cur.expression
        const nextExpr = ts.isVoidExpression(next.expression)
          ? next.expression.expression
          : next.expression
        if (
          ts.isCallExpression(curExpr) &&
          ts.isIdentifier(curExpr.expression) &&
          curExpr.expression.text === 'copyTextToClipboard' &&
          curExpr.arguments.length < 2 &&
          ts.isCallExpression(nextExpr) &&
          ts.isIdentifier(nextExpr.expression) &&
          /^markCopied/i.test(nextExpr.expression.text)
        ) {
          report(
            'no-blind-clipboard-success',
            curExpr,
            'Pass the copied-state callback as the second argument to copyTextToClipboard(text, markCopied) instead of calling it unconditionally on the next line.',
          )
        }
      }
    }

    if (ts.isRegularExpressionLiteral(node)) {
      const rawRe = node.text
      if (!rawRe.startsWith('/^') && CATASTROPHIC_TRAILING_QUANT_RE.test(rawRe)) {
        report(
          'no-catastrophic-trailing-ws-regex',
          node,
          `Unanchored trailing quantifier regex ${rawRe} can exhibit O(N^2) backtracking; use trimEnd() or a linear backward scan.`,
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

export function checkCssModuleKeyExists(tsxSource, cssSource, relPath) {
  const violations = []
  const imp = /import\s+([A-Za-z_$][A-Za-z0-9_$]*)\s+from\s+['"][^'"]+\.module\.css['"]/.exec(
    tsxSource,
  )
  if (!imp) return violations
  const cssVar = imp[1]
  const defined = new Set()
  for (const m of cssSource.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)) {
    if (m[1]) defined.add(m[1])
  }
  const refRe = new RegExp(`(?<![.\\w$])${cssVar}\\.([A-Za-z_][A-Za-z0-9_-]*)`, 'g')
  let rm = refRe.exec(tsxSource)
  while (rm !== null) {
    const key = rm[1]
    if (key && !defined.has(key)) {
      const line = tsxSource.slice(0, rm.index).split('\n').length
      violations.push({
        rule: 'css-module-key-exists',
        file: relPath,
        line,
        message: `${cssVar}.${key} does not match any class defined in the imported CSS module.`,
      })
    }
    rm = refRe.exec(tsxSource)
  }
  return violations
}

const LOCAL_CSS_IMPORT_RE = /^@import\s+['"](\.[^'"]+\.css)['"]\s*;\s*$/

export function readExpandedCss(filePath, seen = new Set()) {
  const abs = resolve(filePath)
  if (seen.has(abs) || !existsSync(abs)) return ''
  seen.add(abs)
  const raw = readFileSync(abs, 'utf8')
  const parts = []
  for (const line of raw.split('\n')) {
    const match = LOCAL_CSS_IMPORT_RE.exec(line.trim())
    if (match?.[1]) {
      parts.push(readExpandedCss(resolve(dirname(abs), match[1]), seen))
    } else {
      parts.push(line)
    }
  }
  return parts.join('\n')
}

const MODULE_LINE_LIMITS = [
  { match: (rel) => /^src\/client\/catalog\/widgets\/[^/]+\.tsx$/.test(rel), max: 900 },
  { match: (rel) => /^src\/client\/catalog\/[^/]+\.tsx$/.test(rel), max: 1000 },
  { match: (rel) => /^src\/client\/chunks\/.+\.ts$/.test(rel), max: 950 },
  { match: (rel) => /^src\/client\/.+\.css$/.test(rel), max: 950 },
]

export function checkModuleMaxLines(source, relPath) {
  const rule = MODULE_LINE_LIMITS.find((entry) => entry.match(relPath))
  if (!rule) return []
  const lines = source === '' ? 0 : source.split('\n').length
  if (lines <= rule.max) return []
  return [
    {
      rule: 'module-max-lines',
      file: relPath,
      line: rule.max + 1,
      message: `${relPath} has ${lines} lines (limit ${rule.max}); split cohesive sub-modules instead of growing a monolith.`,
    },
  ]
}

export function runAllInvariantChecks(rootDir) {
  const violations = []
  const tsFiles = collectFiles(rootDir, 'src', (f) => /\.(?:ts|tsx)$/.test(f))
  const cssFiles = collectFiles(rootDir, 'src/client', (f) => f.endsWith('.css'))
  const cssCache = new Map()

  for (const abs of tsFiles) {
    const rel = normalizeRel(rootDir, abs)
    const src = readFileSync(abs, 'utf8')
    violations.push(...checkTsInvariants(src, rel))
    violations.push(...checkModuleMaxLines(src, rel))
    if (rel.endsWith('.tsx')) {
      const imp = /import\s+[A-Za-z_$][A-Za-z0-9_$]*\s+from\s+['"]([^'"]+\.module\.css)['"]/.exec(
        src,
      )
      if (imp?.[1]) {
        const cssAbs = resolve(dirname(abs), imp[1])
        if (existsSync(cssAbs)) {
          let cssSrc = cssCache.get(cssAbs)
          if (cssSrc === undefined) {
            cssSrc = readExpandedCss(cssAbs)
            cssCache.set(cssAbs, cssSrc)
          }
          violations.push(...checkCssModuleKeyExists(src, cssSrc, rel))
        }
      }
    }
  }
  for (const abs of cssFiles) {
    const rel = normalizeRel(rootDir, abs)
    violations.push(...checkModuleMaxLines(readFileSync(abs, 'utf8'), rel))
    if (rel.includes('/styles/')) continue
    violations.push(...checkCssInvariants(readExpandedCss(abs), rel))
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
    `[check-invariants] OK: 36 architectural invariant rules verified across ${report.filesScanned} source/CSS file(s) and locale tables.`,
  )
}

const isEntry =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isEntry) {
  runCli()
}
