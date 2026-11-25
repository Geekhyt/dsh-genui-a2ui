#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'

export const ALL_SHOWCASES = [
  'showcase-1',
  'showcase-2',
  'showcase-3',
  'showcase-4',
  'showcase-5',
  'showcase-6',
  'showcase-7',
  'showcase-8',
  'showcase-9',
  'showcase-10',
  'showcase-11',
  'showcase-12',
  'showcase-13',
  'showcase-14',
  'showcase-15',
  'showcase-16',
  'showcase-17',
  'showcase-18',
  'showcase-19',
  'showcase-20',
  'showcase-21',
  'showcase-22',
  'showcase-23',
  'showcase-24',
  'showcase-25',
  'showcase-26',
  'showcase-27',
  'showcase-28',
  'showcase-29',
  'showcase-29-dock',
  'showcase-30',
  'showcase-31',
  'showcase-32',
  'showcase-33',
  'showcase-34',
  'showcase-35',
  'showcase-36',
  'showcase-37',
  'showcase-38',
  'showcase-39',
  'showcase-40',
  'showcase-41',
  'showcase-42',
]

export const DEFAULT_AUDIT_SHOWCASES = [
  'showcase-2',
  'showcase-5',
  'showcase-16',
  'showcase-17',
  'showcase-20',
  'showcase-21',
  'showcase-22',
  'showcase-23',
  'showcase-24',
  'showcase-29',
  'showcase-30',
  'showcase-31',
  'showcase-32',
  'showcase-33',
  'showcase-34',
  'showcase-35',
  'showcase-36',
  'showcase-37',
  'showcase-38',
  'showcase-39',
  'showcase-40',
  'showcase-41',
  'showcase-42',
]

export const SCREENSHOT_SHOWCASE_MAP = {
  'assets/screenshots/hero-executive-dashboard.png': 'showcase-1',
  'assets/screenshots/chart-table-crossfilter.png': 'showcase-25',
  'assets/screenshots/finops-waterfall-sunburst.png': 'showcase-16',
  'assets/screenshots/sre-combo-calendar-slo.png': 'showcase-17',
  'assets/screenshots/store-operations-dashboard.png': 'showcase-6',
  'assets/screenshots/antd-capacity-checkcard-planner.png': 'showcase-9',
  'assets/screenshots/enterprise-governance-protable.png': 'showcase-8',
  'assets/screenshots/sre-apm-topology-workbench.png': 'showcase-7',
  'assets/screenshots/zero-latency-simulator.png': 'showcase-3',
  'assets/screenshots/human-in-the-loop-ask.png': 'showcase-4',
  'assets/screenshots/codebase-explorer-sidebar.png': 'showcase-2',
  'assets/screenshots/persistent-dock-pipeline.png': 'showcase-5',
  'assets/screenshots/nextgen-charts-gallery.png': 'showcase-35',
  'assets/screenshots/nextgen-interactive-primitives.png': 'showcase-36',
  'assets/screenshots/protable-trace-pr-diff.png': 'showcase-37',
}

export function resolveChromeBinary() {
  const candidates = [
    process.env.CHROME_BIN ?? '',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean)

  for (const bin of candidates) {
    if (existsSync(bin)) return bin
  }
  return null
}

export function buildDomGeometryAuditExpression() {
  return `(() => {
    const a2uiNodes = [...document.querySelectorAll('[class*="a2ui_"]')];
    const overflowViolations = [];
    const buttonWrapViolations = [];
    const clippingViolations = [];
    const popoverViolations = [];
    const contrastViolations = [];
    const svgTextClipViolations = [];
    let canvasCount = 0;
    let svgCount = 0;

    const parseRgba = (raw) => {
      if (!raw || raw === 'transparent') return [0, 0, 0, 0];
      const m = raw.match(/rgba?\\(\\s*([\\d.]+)[,\\s]+([\\d.]+)[,\\s]+([\\d.]+)(?:[,\\s/]+([\\d.]+))?\\s*\\)/i);
      if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
      const srgb = raw.match(/color\\(\\s*srgb\\s+([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)(?:\\s*\\/\\s*([\\d.]+))?\\s*\\)/i);
      if (srgb) return [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255, srgb[4] === undefined ? 1 : Number(srgb[4])];
      return null;
    };
    const compositeOver = (fg, bg) => {
      const a = fg[3];
      return [
        fg[0] * a + bg[0] * (1 - a),
        fg[1] * a + bg[1] * (1 - a),
        fg[2] * a + bg[2] * (1 - a),
        1,
      ];
    };
    const relLum = (rgb) => {
      const lin = (c) => {
        const s = Math.max(0, Math.min(1, c / 255));
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
    };
    const contrastOf = (a, b) => {
      const la = relLum(a);
      const lb = relLum(b);
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    };
    const resolveEffectiveBg = (node) => {
      const layers = [];
      let cur = node;
      while (cur && cur.nodeType === 1) {
        const c = parseRgba(getComputedStyle(cur).backgroundColor);
        if (c && c[3] > 0.01) {
          layers.push(c);
          if (c[3] >= 0.99) break;
        }
        cur = cur.parentElement;
      }
      const isDarkRoot =
        document.documentElement.classList.contains('dark') ||
        document.documentElement.dataset.theme === 'dark' ||
        Boolean(node.closest('.a2ui-dark'));
      let acc = isDarkRoot ? [24, 25, 30, 1] : [255, 255, 255, 1];
      for (let i = layers.length - 1; i >= 0; i -= 1) {
        acc = compositeOver(layers[i], acc);
      }
      return acc;
    };
    const hasDirectText = (node) => {
      for (const ch of node.childNodes) {
        if (ch.nodeType === 3 && (ch.textContent || '').trim().length > 0) return true;
      }
      return false;
    };

    for (const el of a2uiNodes) {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;

      const isScrollableX = style.overflowX === 'auto' || style.overflowX === 'scroll';
      const isClippedX = style.overflowX === 'hidden' || style.overflowX === 'clip';
      if (!isScrollableX && !isClippedX && el.scrollWidth > el.clientWidth + 4 && el.clientWidth >= 120) {
        const cls = typeof el.className === 'string' ? el.className.slice(0, 80) : '';
        if (!cls.includes('tableScroll') && !cls.includes('codeBlock') && !cls.includes('mermaidViewport')) {
          overflowViolations.push({
            cls,
            scrollWidth: Math.round(el.scrollWidth),
            clientWidth: Math.round(el.clientWidth),
          });
        }
      }

      if (el.tagName === 'BUTTON') {
        const text = (el.textContent || '').trim();
        if (text.length >= 2 && text.length <= 16 && rect.height > 38 && rect.width < 46) {
          buttonWrapViolations.push({
            text: text.slice(0, 24),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          });
        }
      }

      const role = el.getAttribute('role');
      if (role === 'listbox' || role === 'menu' || role === 'dialog') {
        if (rect.right > window.innerWidth + 2 || rect.left < -2) {
          popoverViolations.push({
            role,
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            viewportWidth: window.innerWidth,
          });
        }
      }

      const clsName = typeof el.className === 'string' ? el.className : '';
      const isContrastTarget =
        (el.tagName === 'BUTTON' ||
          /(?:Badge|Bar|Pill|Tag|Chip|RatingScaleBtn|CheckCardIndicator|ResultEmblem)/.test(clsName)) &&
        hasDirectText(el) &&
        !el.hasAttribute('disabled') &&
        el.getAttribute('aria-disabled') !== 'true' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity || 1) >= 0.7;
      if (isContrastTarget) {
        const ownBg = parseRgba(style.backgroundColor);
        const fg = parseRgba(style.color);
        if (ownBg && ownBg[3] >= 0.4 && fg && fg[3] >= 0.5) {
          const effBg = resolveEffectiveBg(el);
          const effFg = fg[3] < 0.99 ? compositeOver(fg, effBg) : fg;
          const ratio = contrastOf(effFg, effBg);
          if (ratio < 3.0) {
            contrastViolations.push({
              cls: clsName.slice(0, 60),
              text: (el.textContent || '').trim().slice(0, 24),
              ratio: Number(ratio.toFixed(2)),
            });
          }
        }
      }
    }

    const surfaces = [
      ...document.querySelectorAll(
        '[class*="surfaceStack"], [class*="chartCard"], [class*="mermaidCard"], [class*="metricRingCard"], [class*="serviceGraphCard"], [data-a2ui-chart], [data-a2ui-mermaid]',
      ),
    ];
    const seenViz = new Set();
    for (const host of surfaces) {
      const hostRect = host.getBoundingClientRect();
      if (hostRect.width <= 0 || hostRect.height <= 0) continue;
      for (const viz of host.querySelectorAll('canvas, svg')) {
        if (seenViz.has(viz)) continue;
        seenViz.add(viz);
        const vRect = viz.getBoundingClientRect();
        if (viz.tagName === 'CANVAS') canvasCount += 1;
        else if (vRect.width >= 32 || vRect.height >= 32) svgCount += 1;
        if (vRect.width <= 0 || vRect.height <= 0) continue;
        const clipHost =
          viz.closest('[class*="chartCard"], [class*="mermaidCard"], [class*="metricRingCard"], [class*="serviceGraphCard"], [class*="surfaceStack"]') ||
          host;
        let insideScrollX = false;
        let cur = viz.parentElement;
        while (cur && cur !== clipHost) {
          const cs = getComputedStyle(cur);
          if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') {
            insideScrollX = true;
            break;
          }
          cur = cur.parentElement;
        }
        if (insideScrollX) continue;
        const cRect = clipHost.getBoundingClientRect();
        if (vRect.right > cRect.right + 4) {
          clippingViolations.push({
            tag: viz.tagName,
            vizRight: Math.round(vRect.right),
            hostRight: Math.round(cRect.right),
          });
        }
        if (viz.tagName === 'SVG' || viz.tagName === 'svg') {
          for (const t of viz.querySelectorAll('text')) {
            const tStyle = getComputedStyle(t);
            if (tStyle.visibility === 'hidden' || Number(tStyle.opacity || 1) < 0.05) continue;
            const txt = (t.textContent || '').trim();
            if (!txt) continue;
            const tRect = t.getBoundingClientRect();
            if (tRect.width <= 0 || tRect.height <= 0) continue;
            if (tRect.right > vRect.right + 4 || tRect.left < vRect.left - 4) {
              svgTextClipViolations.push({
                kind: 'svg-viewport',
                text: txt.slice(0, 28),
                textRight: Math.round(tRect.right),
                boxRight: Math.round(vRect.right),
              });
              continue;
            }
            const gParent = t.parentElement;
            if (gParent && gParent.tagName.toLowerCase() === 'g') {
              const directRects = [...gParent.children].filter((ch) => ch.tagName.toLowerCase() === 'rect');
              if (directRects.length === 1) {
                const rRect = directRects[0].getBoundingClientRect();
                if (rRect.width >= 28 && rRect.height >= 14 && (tRect.right > rRect.right + 4 || tRect.left < rRect.left - 4)) {
                  svgTextClipViolations.push({
                    kind: 'svg-rect',
                    text: txt.slice(0, 28),
                    textRight: Math.round(tRect.right),
                    boxRight: Math.round(rRect.right),
                  });
                }
              }
            }
          }
        }
      }
    }

    for (const nodeBox of document.querySelectorAll('[class*="serviceNodeBox"]')) {
      const boxRect = nodeBox.getBoundingClientRect();
      if (boxRect.width <= 0 || boxRect.height <= 0) continue;
      const boxCs = getComputedStyle(nodeBox);
      const boxClipsX = boxCs.overflowX === 'hidden' || boxCs.overflowX === 'clip';
      for (const child of nodeBox.querySelectorAll('span, div')) {
        if (!hasDirectText(child)) continue;
        const cCs = getComputedStyle(child);
        const childClipsX = cCs.overflowX === 'hidden' || cCs.overflowX === 'clip';
        const cRect = child.getBoundingClientRect();
        if (cRect.width <= 0 || cRect.height <= 0) continue;
        if ((!boxClipsX && cRect.right > boxRect.right + 2) || (!boxClipsX && !childClipsX && child.scrollWidth > boxRect.width + 2)) {
          svgTextClipViolations.push({
            kind: 'node-box',
            text: (child.textContent || '').trim().slice(0, 28),
            textRight: Math.round(cRect.right),
            boxRight: Math.round(boxRect.right),
          });
        }
      }
    }

    return {
      a2uiElementCount: a2uiNodes.length,
      canvasCount,
      svgCount,
      overflowViolations: overflowViolations.slice(0, 12),
      buttonWrapViolations: buttonWrapViolations.slice(0, 12),
      clippingViolations: clippingViolations.slice(0, 12),
      popoverViolations: popoverViolations.slice(0, 12),
      contrastViolations: contrastViolations.slice(0, 12),
      svgTextClipViolations: svgTextClipViolations.slice(0, 12),
    };
  })()`
}

export function evaluateVisualQaReport(runs) {
  const failures = []
  for (const r of runs) {
    const issues = []
    if (r.a2uiElementCount === 0) issues.push('no A2UI elements rendered')
    if (r.overflowViolations.length > 0) issues.push(`${r.overflowViolations.length} overflow(s)`)
    if (r.buttonWrapViolations.length > 0)
      issues.push(`${r.buttonWrapViolations.length} vertical button wrap(s)`)
    if (r.clippingViolations.length > 0) issues.push(`${r.clippingViolations.length} viz clip(s)`)
    if (r.popoverViolations.length > 0) issues.push(`${r.popoverViolations.length} popover clip(s)`)
    const contrastList = Array.isArray(r.contrastViolations) ? r.contrastViolations : []
    if (contrastList.length > 0) issues.push(`${contrastList.length} contrast violation(s)`)
    const svgClipList = Array.isArray(r.svgTextClipViolations) ? r.svgTextClipViolations : []
    if (svgClipList.length > 0) issues.push(`${svgClipList.length} svg/node text clip(s)`)
    if (r.consoleErrors.length > 0) issues.push(`${r.consoleErrors.length} console error(s)`)
    if (r.pageErrors.length > 0) issues.push(`${r.pageErrors.length} page error(s)`)
    if (issues.length > 0) {
      failures.push({ showcase: r.showcase, theme: r.theme, issues })
    }
  }
  return {
    ok: failures.length === 0,
    totalRuns: runs.length,
    passedRuns: runs.length - failures.length,
    failures,
  }
}

function paethPredictor(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

export function decodePngRgba(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 33) {
    throw new Error('Invalid PNG buffer')
  }
  const sig = buffer.subarray(0, 8)
  if (!sig.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error('Not a PNG image')
  }
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const idatParts = []
  let offset = 8
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    if (dataEnd + 4 > buffer.length) break
    if (type === 'IHDR') {
      width = buffer.readUInt32BE(dataStart)
      height = buffer.readUInt32BE(dataStart + 4)
      bitDepth = buffer[dataStart + 8]
      colorType = buffer[dataStart + 9]
    } else if (type === 'IDAT') {
      idatParts.push(buffer.subarray(dataStart, dataEnd))
    } else if (type === 'IEND') {
      break
    }
    offset = dataEnd + 4
  }
  if (width <= 0 || height <= 0 || bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(
      `Unsupported PNG format: ${width}x${height} depth=${bitDepth} type=${colorType}`,
    )
  }
  const bpp = colorType === 6 ? 4 : 3
  const stride = width * bpp
  const inflated = inflateSync(Buffer.concat(idatParts))
  const raw = new Uint8Array(height * stride)
  let inPos = 0
  for (let y = 0; y < height; y += 1) {
    const filterType = inflated[inPos++]
    const rowStart = y * stride
    for (let x = 0; x < stride; x += 1) {
      const byte = inflated[inPos++]
      const left = x >= bpp ? raw[rowStart + x - bpp] : 0
      const up = y > 0 ? raw[rowStart - stride + x] : 0
      const upLeft = y > 0 && x >= bpp ? raw[rowStart - stride + x - bpp] : 0
      let recon = byte
      if (filterType === 1) recon = (byte + left) & 0xff
      else if (filterType === 2) recon = (byte + up) & 0xff
      else if (filterType === 3) recon = (byte + ((left + up) >> 1)) & 0xff
      else if (filterType === 4) recon = (byte + paethPredictor(left, up, upLeft)) & 0xff
      raw[rowStart + x] = recon
    }
  }
  const rgba = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const src = y * stride + x * bpp
      const dst = (y * width + x) * 4
      rgba[dst] = raw[src]
      rgba[dst + 1] = raw[src + 1]
      rgba[dst + 2] = raw[src + 2]
      rgba[dst + 3] = bpp === 4 ? raw[src + 3] : 255
    }
  }
  return { width, height, data: rgba }
}

export function samplePngMedianRgb(decoded, rect) {
  const x0 = Math.max(0, Math.min(decoded.width - 1, Math.floor(rect.x)))
  const y0 = Math.max(0, Math.min(decoded.height - 1, Math.floor(rect.y)))
  const x1 = Math.max(x0 + 1, Math.min(decoded.width, Math.ceil(rect.x + rect.w)))
  const y1 = Math.max(y0 + 1, Math.min(decoded.height, Math.ceil(rect.y + rect.h)))
  const rs = []
  const gs = []
  const bs = []
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * decoded.width + x) * 4
      rs.push(decoded.data[i])
      gs.push(decoded.data[i + 1])
      bs.push(decoded.data[i + 2])
    }
  }
  const median = (arr) => {
    const sorted = [...arr].sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)] ?? 0
  }
  return [median(rs), median(gs), median(bs)]
}

export function computeRgbMaxChannelDelta(a, b) {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]))
}

export function evaluateStickyTintParity(pairs, maxDelta = 4) {
  const failures = []
  for (const p of pairs) {
    const delta = computeRgbMaxChannelDelta(p.stickyRgb, p.normalRgb)
    if (delta > maxDelta) {
      failures.push({ label: p.label, stickyRgb: p.stickyRgb, normalRgb: p.normalRgb, delta })
    }
  }
  return { ok: failures.length === 0, failures }
}

function getFreePort() {
  return new Promise((res, rej) => {
    const srv = createServer()
    srv.unref()
    srv.on('error', rej)
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      srv.close(() => res(port))
    })
  })
}

function delay(ms) {
  return new Promise((res) => setTimeout(res, ms))
}

async function waitForHttpJson(url, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url)
      if (r.ok) return await r.json()
    } catch {}
    await delay(150)
  }
  throw new Error(`Timed out waiting for Chrome CDP endpoint at ${url}`)
}

class CdpSession {
  constructor(wsUrl) {
    this.wsUrl = wsUrl
    this.ws = null
    this.seq = 0
    this.pending = new Map()
    this.listeners = new Map()
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl)
    await new Promise((res, rej) => {
      this.ws.addEventListener('open', res, { once: true })
      this.ws.addEventListener('error', rej, { once: true })
    })
    this.ws.addEventListener('message', (evt) => {
      const msg = JSON.parse(String(evt.data))
      if (msg.id !== undefined) {
        const entry = this.pending.get(msg.id)
        if (entry) {
          this.pending.delete(msg.id)
          if (msg.error) entry.reject(new Error(msg.error.message ?? JSON.stringify(msg.error)))
          else entry.resolve(msg.result ?? {})
        }
      } else if (msg.method) {
        const set = this.listeners.get(msg.method)
        if (set) {
          for (const fn of set) fn(msg.params ?? {})
        }
      }
    })
  }

  on(method, fn) {
    let set = this.listeners.get(method)
    if (!set) {
      set = new Set()
      this.listeners.set(method, set)
    }
    set.add(fn)
    return () => set.delete(fn)
  }

  send(method, params = {}) {
    const id = ++this.seq
    return new Promise((resolvePromise, rejectPromise) => {
      this.pending.set(id, { resolve: resolvePromise, reject: rejectPromise })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.text ?? 'Runtime.evaluate exception')
    }
    return res.result?.value
  }

  close() {
    try {
      this.ws?.close()
    } catch {}
  }
}

function startDevServer(rootDir) {
  return new Promise((res, rej) => {
    const child = spawn(process.execPath, [resolve(rootDir, 'scripts/dev-env.mjs'), 'serve'], {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })
    let buf = ''
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        child.kill('SIGTERM')
        rej(new Error(`Timed out waiting for DSH server URL. Output:\n${buf}`))
      }
    }, 30_000)

    const onChunk = (chunk) => {
      buf += chunk.toString('utf8')
      const m = /http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+/.exec(buf)
      if (m && !settled) {
        settled = true
        clearTimeout(timer)
        res({ url: m[0], stop: () => child.kill('SIGTERM') })
      }
    }
    child.stdout.on('data', onChunk)
    child.stderr.on('data', onChunk)
    child.on('exit', (code) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        rej(new Error(`dev-env serve exited prematurely (${code}). Output:\n${buf}`))
      }
    })
  })
}

async function launchHeadlessChrome(chromeBin, width, height) {
  const port = await getFreePort()
  const profileDir = mkdtempSync(join(tmpdir(), 'dsh-vqa-chrome-'))
  const child = spawn(
    chromeBin,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--window-size=${width},${height}`,
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-extensions',
      '--mute-audio',
      'about:blank',
    ],
    { stdio: 'ignore' },
  )
  const targets = await waitForHttpJson(`http://127.0.0.1:${port}/json`)
  const pageTarget = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
  if (!pageTarget) {
    child.kill('SIGTERM')
    rmSync(profileDir, { recursive: true, force: true })
    throw new Error('Could not find CDP page target in headless Chrome.')
  }
  const cdp = new CdpSession(pageTarget.webSocketDebuggerUrl)
  await cdp.connect()
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 2,
    mobile: false,
  })
  return {
    cdp,
    async stop() {
      cdp.close()
      if (child.exitCode === null) {
        const exited = new Promise((res) => child.once('exit', res))
        child.kill('SIGTERM')
        await Promise.race([
          exited,
          delay(2500).then(() => {
            if (child.exitCode === null) child.kill('SIGKILL')
          }),
        ])
      }
      try {
        rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
      } catch {}
    },
  }
}

async function setPageTheme(cdp, theme) {
  const isDark = theme === 'dark'
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: theme }],
  })
  await cdp.evaluate(`(() => {
    const root = document.documentElement;
    root.dataset.theme = ${JSON.stringify(theme)};
    root.style.colorScheme = ${JSON.stringify(theme)};
    root.classList.toggle('dark', ${JSON.stringify(isDark)});
    const body = document.body;
    if (body) {
      if (${JSON.stringify(isDark)}) {
        body.setAttribute('data-ds-dark-theme', '');
      } else {
        body.removeAttribute('data-ds-dark-theme');
      }
      body.classList.toggle('dark', ${JSON.stringify(isDark)});
      body.classList.toggle('light', ${JSON.stringify(!isDark)});
    }
  })()`)
  await delay(500)
}

async function startFreshChat(cdp) {
  await cdp.evaluate(`(async () => {
    const btns = [...document.querySelectorAll('button, [role="button"]')];
    const newChatBtn = btns.find((b) => {
      const txt = (b.textContent || '').trim();
      return txt.includes('新会话') || /^new\\s+chat$/i.test(txt);
    });
    if (newChatBtn) {
      newChatBtn.click();
      await new Promise((r) => setTimeout(r, 450));
    }
  })()`)
}

async function submitPromptAndWait(cdp, promptText, timeoutMs = 25_000) {
  const submitted = await cdp.evaluate(`(async () => {
    const findComposer = () =>
      document.querySelector('textarea') ||
      document.querySelector('[contenteditable="true"][role="textbox"]') ||
      document.querySelector('[contenteditable="true"]');

    let el = null;
    for (let i = 0; i < 40; i++) {
      el = findComposer();
      if (el) break;
      await new Promise((r) => setTimeout(r, 150));
    }
    if (!el) return false;
    el.focus();
    if (el.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) setter.call(el, ${JSON.stringify(promptText)});
      else el.value = ${JSON.stringify(promptText)};
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      el.textContent = ${JSON.stringify(promptText)};
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: ${JSON.stringify(promptText)} }));
    }
    await new Promise((r) => setTimeout(r, 150));
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
    return true;
  })()`)

  if (!submitted) {
    throw new Error('Could not locate DeepSeek Harness chat composer input.')
  }

  const deadline = Date.now() + timeoutMs
  let lastSig = ''
  let stableTicks = 0
  while (Date.now() < deadline) {
    const state = await cdp.evaluate(`(() => {
      const els = document.querySelectorAll('[class*="a2ui_"]').length;
      const skeletons = document.querySelectorAll('[class*="skeleton"], [class*="shimmer"]').length;
      const surfaces = document.querySelectorAll('[class*="surfaceRoot"], [class*="surfaceCard"], [class*="chartCard"]').length;
      const canvases = document.querySelectorAll('[class*="a2ui_"] canvas').length;
      const bodyText = document.body ? document.body.innerText : '';
      const streaming =
        bodyText.includes('正在增量同步组件') ||
        bodyText.includes('深度求索中') ||
        bodyText.includes('Syncing components');
      return { els, skeletons, surfaces, canvases, streaming };
    })()`)
    const sig = `${state.els}:${state.surfaces}:${state.canvases}:${state.skeletons}:${state.streaming ? 1 : 0}`
    if (
      state.els > 20 &&
      state.surfaces > 0 &&
      state.skeletons === 0 &&
      !state.streaming &&
      sig === lastSig
    ) {
      stableTicks += 1
      if (stableTicks >= 5) break
    } else {
      stableTicks = 0
      lastSig = sig
    }
    await delay(300)
  }
  await delay(600)
}

function parseCliArgs(argv, rootDir) {
  const opts = {
    url: '',
    cases: DEFAULT_AUDIT_SHOWCASES,
    themes: ['dark', 'light'],
    width: 1360,
    height: 900,
    jsonOut: '',
    outDir: '',
    screenshots: false,
    dryRun: false,
  }
  for (const arg of argv) {
    if (arg === '--dry-run') opts.dryRun = true
    else if (arg === '--all') opts.cases = ALL_SHOWCASES
    else if (arg === '--narrow') {
      opts.width = 1024
      opts.height = 768
    } else if (arg === '--screenshots') opts.screenshots = true
    else if (arg.startsWith('--url=')) opts.url = arg.slice(6)
    else if (arg.startsWith('--cases=')) {
      opts.cases = arg
        .slice(8)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    } else if (arg.startsWith('--themes=')) {
      opts.themes = arg
        .slice(9)
        .split(',')
        .map((s) => s.trim())
        .filter((t) => t === 'dark' || t === 'light')
    } else if (arg.startsWith('--width=')) opts.width = Math.max(320, Number(arg.slice(8)) || 1360)
    else if (arg.startsWith('--height=')) opts.height = Math.max(480, Number(arg.slice(9)) || 900)
    else if (arg.startsWith('--json=')) opts.jsonOut = resolve(arg.slice(7))
    else if (arg.startsWith('--out-dir=')) opts.outDir = resolve(arg.slice(10))
  }
  if (opts.screenshots) {
    const manifestPath = resolve(rootDir, 'screenshots.json')
    const list = existsSync(manifestPath)
      ? JSON.parse(readFileSync(manifestPath, 'utf8'))
      : Object.keys(SCREENSHOT_SHOWCASE_MAP)
    opts.screenshotTargets = list
      .filter((rel) => Boolean(SCREENSHOT_SHOWCASE_MAP[rel]))
      .map((rel) => ({ rel, showcase: SCREENSHOT_SHOWCASE_MAP[rel] }))
  }
  return opts
}

async function runCli() {
  const rootDir = resolve(import.meta.dirname, '..')
  const opts = parseCliArgs(process.argv.slice(2), rootDir)
  const chromeBin = resolveChromeBinary()

  if (opts.dryRun) {
    const plan = opts.screenshots
      ? {
          mode: 'screenshots',
          chromeBin,
          viewport: `${opts.width}x${opts.height}`,
          targets: opts.screenshotTargets,
        }
      : {
          mode: 'geometry-audit',
          chromeBin,
          viewport: `${opts.width}x${opts.height}`,
          themes: opts.themes,
          cases: opts.cases,
        }
    console.log(JSON.stringify(plan, null, 2))
    return
  }

  if (chromeBin === null) {
    console.error('[visual-qa-bot] Chrome/Chromium binary not found. Set CHROME_BIN to proceed.')
    process.exit(1)
  }

  const server = opts.url ? { url: opts.url, stop: () => {} } : await startDevServer(rootDir)
  const browser = await launchHeadlessChrome(chromeBin, opts.width, opts.height)

  const consoleErrors = []
  const pageErrors = []
  browser.cdp.on('Runtime.consoleAPICalled', (p) => {
    if (p.type === 'error') {
      consoleErrors.push((p.args ?? []).map((a) => a.value ?? a.description ?? '').join(' '))
    }
  })
  browser.cdp.on('Runtime.exceptionThrown', (p) => {
    pageErrors.push(p.exceptionDetails?.text ?? 'Uncaught page exception')
  })

  try {
    if (opts.screenshots) {
      await browser.cdp.send('Page.navigate', { url: server.url })
      await delay(1400)
      for (const target of opts.screenshotTargets) {
        await startFreshChat(browser.cdp)
        await setPageTheme(browser.cdp, 'dark')
        await submitPromptAndWait(browser.cdp, target.showcase)
        const shot = await browser.cdp.send('Page.captureScreenshot', { format: 'png' })
        const dest = opts.outDir ? join(opts.outDir, target.rel) : resolve(rootDir, target.rel)
        mkdirSync(dirname(dest), { recursive: true })
        writeFileSync(dest, Buffer.from(shot.data, 'base64'))
        console.log(`[visual-qa-bot] Captured ${target.showcase} -> ${dest}`)
      }
      return
    }

    const runs = []
    await browser.cdp.send('Page.navigate', { url: server.url })
    await delay(1400)
    for (const showcase of opts.cases) {
      await startFreshChat(browser.cdp)
      consoleErrors.length = 0
      pageErrors.length = 0
      await submitPromptAndWait(browser.cdp, showcase)

      for (const theme of opts.themes) {
        await setPageTheme(browser.cdp, theme)
        const metrics = await browser.cdp.evaluate(buildDomGeometryAuditExpression())
        const runRecord = {
          showcase,
          theme,
          ...metrics,
          consoleErrors: [...consoleErrors],
          pageErrors: [...pageErrors],
        }
        runs.push(runRecord)
        if (opts.outDir) {
          const shot = await browser.cdp.send('Page.captureScreenshot', { format: 'png' })
          const dest = join(opts.outDir, `${showcase}-${theme}.png`)
          mkdirSync(dirname(dest), { recursive: true })
          writeFileSync(dest, Buffer.from(shot.data, 'base64'))
        }
        const contrastCount = Array.isArray(metrics.contrastViolations)
          ? metrics.contrastViolations.length
          : 0
        const svgClipCount = Array.isArray(metrics.svgTextClipViolations)
          ? metrics.svgTextClipViolations.length
          : 0
        const okTag =
          metrics.a2uiElementCount > 0 &&
          metrics.overflowViolations.length === 0 &&
          metrics.buttonWrapViolations.length === 0 &&
          metrics.clippingViolations.length === 0 &&
          metrics.popoverViolations.length === 0 &&
          contrastCount === 0 &&
          svgClipCount === 0 &&
          consoleErrors.length === 0 &&
          pageErrors.length === 0
            ? 'PASS'
            : 'FAIL'
        console.log(
          `[visual-qa-bot] ${okTag} ${showcase.padEnd(16)} (${theme.padEnd(5)}) els=${metrics.a2uiElementCount} canvas=${metrics.canvasCount} svg=${metrics.svgCount} overflow=${metrics.overflowViolations.length} wrap=${metrics.buttonWrapViolations.length} clip=${metrics.clippingViolations.length} contrast=${contrastCount} svgclip=${svgClipCount} errs=${consoleErrors.length + pageErrors.length}`,
        )
      }
    }

    const summary = evaluateVisualQaReport(runs)
    if (opts.jsonOut) {
      mkdirSync(dirname(opts.jsonOut), { recursive: true })
      writeFileSync(opts.jsonOut, JSON.stringify({ summary, runs }, null, 2), 'utf8')
    }
    if (!summary.ok) {
      console.error(
        `[visual-qa-bot] FAILED: ${summary.failures.length}/${summary.totalRuns} run(s) had geometry or runtime issues.`,
      )
      for (const f of summary.failures) {
        console.error(`  - ${f.showcase} (${f.theme}): ${f.issues.join(', ')}`)
      }
      process.exit(1)
    }
    console.log(
      `[visual-qa-bot] OK: ${summary.passedRuns}/${summary.totalRuns} showcase/theme runs passed 5-point DOM geometry & contrast audit.`,
    )
  } finally {
    await browser.stop()
    server.stop()
  }
}

const isEntry =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isEntry) {
  runCli().catch((err) => {
    console.error('[visual-qa-bot] Fatal:', err)
    process.exit(1)
  })
}
