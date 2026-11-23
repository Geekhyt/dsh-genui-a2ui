#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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
]

export const DEFAULT_AUDIT_SHOWCASES = [
  'showcase-16',
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
    let canvasCount = 0;
    let svgCount = 0;

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
    }

    const surfaces = [...document.querySelectorAll('[class*="surfaceRoot"], [class*="surfaceCard"], [class*="chartCard"]')];
    for (const host of surfaces) {
      const hostRect = host.getBoundingClientRect();
      if (hostRect.width <= 0 || hostRect.height <= 0) continue;
      for (const viz of host.querySelectorAll('canvas, svg')) {
        const vRect = viz.getBoundingClientRect();
        if (viz.tagName === 'CANVAS') canvasCount += 1;
        else svgCount += 1;
        if (vRect.width <= 0 || vRect.height <= 0) continue;
        if (vRect.right > hostRect.right + 4) {
          clippingViolations.push({
            tag: viz.tagName,
            vizRight: Math.round(vRect.right),
            hostRight: Math.round(hostRect.right),
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
    else if (arg === '--screenshots') opts.screenshots = true
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
        const okTag =
          metrics.a2uiElementCount > 0 &&
          metrics.overflowViolations.length === 0 &&
          metrics.buttonWrapViolations.length === 0 &&
          metrics.clippingViolations.length === 0 &&
          metrics.popoverViolations.length === 0 &&
          consoleErrors.length === 0 &&
          pageErrors.length === 0
            ? 'PASS'
            : 'FAIL'
        console.log(
          `[visual-qa-bot] ${okTag} ${showcase.padEnd(16)} (${theme.padEnd(5)}) els=${metrics.a2uiElementCount} canvas=${metrics.canvasCount} svg=${metrics.svgCount} overflow=${metrics.overflowViolations.length} wrap=${metrics.buttonWrapViolations.length} clip=${metrics.clippingViolations.length} errs=${consoleErrors.length + pageErrors.length}`,
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
      `[visual-qa-bot] OK: ${summary.passedRuns}/${summary.totalRuns} showcase/theme runs passed 4-point DOM geometry audit.`,
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
