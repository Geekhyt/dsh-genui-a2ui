const CURRENCY_PREFIX_RE = /(?:^|[^A-Za-z0-9_])(?:US|CA|AU|HK|NT|SG|NZ|MX|[RCAS])$/

function isAsciiDigit(code: number): boolean {
  return code >= 48 && code <= 57
}

function isAsciiAlpha(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122)
}

function isWsCode(code: number): boolean {
  return code === 32 || code === 9 || code === 10 || code === 13
}

function isCurrencyMagnitudeSuffix(text: string, idx: number): boolean {
  const ch = text[idx]
  if (
    ch !== 'k' &&
    ch !== 'K' &&
    ch !== 'm' &&
    ch !== 'M' &&
    ch !== 'b' &&
    ch !== 'B' &&
    ch !== 't' &&
    ch !== 'T' &&
    ch !== 'w' &&
    ch !== 'W'
  ) {
    return false
  }
  const next = text.charCodeAt(idx + 1)
  return Number.isNaN(next) || !isAsciiAlpha(next)
}

function hasCjk(text: string, start: number, end: number): boolean {
  for (let i = start; i < end; i += 1) {
    const c = text.charCodeAt(i)
    if (c >= 0x3400 && c <= 0x9fff) return true
  }
  return false
}

function findInlineClosingDollar(text: string, start: number): number {
  let i = start
  while (i < text.length) {
    const ch = text[i]
    if (ch === '\n') return -1
    if (ch === '\\') {
      i += 2
      continue
    }
    if (ch === '`') {
      let ticks = 1
      while (text[i + ticks] === '`') ticks += 1
      const close = text.indexOf('`'.repeat(ticks), i + ticks)
      if (close === -1) return -1
      i = close + ticks
      continue
    }
    if (ch === '$') {
      if (text[i + 1] === '$') return -1
      return i
    }
    i += 1
  }
  return -1
}

function looksLikeInlineMathFromDigit(text: string, dollarIdx: number): boolean {
  const prefixSlice = text.slice(Math.max(0, dollarIdx - 4), dollarIdx)
  if (CURRENCY_PREFIX_RE.test(prefixSlice)) return false

  const closeIdx = findInlineClosingDollar(text, dollarIdx + 1)
  if (closeIdx === -1) return false
  if (closeIdx > dollarIdx + 1 && isWsCode(text.charCodeAt(closeIdx - 1))) return false
  if (closeIdx + 1 < text.length && isAsciiDigit(text.charCodeAt(closeIdx + 1))) return false
  if (hasCjk(text, dollarIdx + 1, closeIdx)) return false

  let j = dollarIdx + 1
  while (j < closeIdx && (isAsciiDigit(text.charCodeAt(j)) || text[j] === ',' || text[j] === '.')) {
    j += 1
  }
  if (j >= closeIdx) return false

  const afterNum = text[j]!
  if (afterNum === '^' || afterNum === '_' || afterNum === '\\') return true
  if (isAsciiAlpha(text.charCodeAt(j))) {
    if (isCurrencyMagnitudeSuffix(text, j)) {
      const rest = text.slice(j + 1, closeIdx).trim()
      if (rest === '') return false
    }
    return true
  }
  const tail = text.slice(j, closeIdx)
  return /[=<>^_\\]/.test(tail) || /^\s*[+\-*/]\s*[A-Za-z0-9(\\]/.test(tail)
}

export function escapeCurrencyDollarsForMarkdown(text: string): string {
  if (!text.includes('$')) return text

  let out = ''
  let i = 0
  const len = text.length

  while (i < len) {
    const ch = text[i]!

    if (
      (ch === '`' || ch === '~') &&
      (i === 0 || text[i - 1] === '\n') &&
      text[i + 1] === ch &&
      text[i + 2] === ch
    ) {
      let fenceLen = 3
      while (i + fenceLen < len && text[i + fenceLen] === ch) fenceLen += 1
      const fence = ch.repeat(fenceLen)
      const firstNl = text.indexOf('\n', i + fenceLen)
      if (firstNl === -1) {
        out += text.slice(i)
        break
      }
      let search = firstNl + 1
      let closeEnd = len
      while (search < len) {
        const nl = text.indexOf('\n', search)
        const lineEnd = nl === -1 ? len : nl
        const trimmed = text.slice(search, lineEnd).trim()
        if (trimmed.startsWith(fence) && trimmed.replaceAll(ch, '') === '') {
          closeEnd = nl === -1 ? len : nl + 1
          break
        }
        if (nl === -1) break
        search = nl + 1
      }
      out += text.slice(i, closeEnd)
      i = closeEnd
      continue
    }

    if (ch === '`') {
      let ticks = 1
      while (i + ticks < len && text[i + ticks] === '`') ticks += 1
      const marker = '`'.repeat(ticks)
      const close = text.indexOf(marker, i + ticks)
      if (close !== -1) {
        out += text.slice(i, close + ticks)
        i = close + ticks
        continue
      }
      out += marker
      i += ticks
      continue
    }

    if (ch === '\\' && i + 1 < len) {
      out += text.slice(i, i + 2)
      i += 2
      continue
    }

    if (ch === '$' && text[i + 1] === '$') {
      const close = text.indexOf('$$', i + 2)
      if (close !== -1) {
        out += text.slice(i, close + 2)
        i = close + 2
        continue
      }
      out += '$$'
      i += 2
      continue
    }

    if (ch === '$' && i + 1 < len && isAsciiDigit(text.charCodeAt(i + 1))) {
      if (!looksLikeInlineMathFromDigit(text, i)) {
        out += '\\$'
        i += 1
        continue
      }
      const closeIdx = findInlineClosingDollar(text, i + 1)
      if (closeIdx !== -1) {
        out += text.slice(i, closeIdx + 1)
        i = closeIdx + 1
        continue
      }
    }

    out += ch
    i += 1
  }

  return out
}
