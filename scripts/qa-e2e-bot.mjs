#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildDomGeometryAuditExpression,
  decodePngRgba,
  evaluateStickyTintParity,
  resolveChromeBinary,
  samplePngMedianRgb,
} from './visual-qa-bot.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outArg = process.argv.find((a) => a.startsWith('--out-dir='))
const OUT_DIR = outArg ? resolve(outArg.slice(10)) : ''
const WIDTH = 1360
const HEIGHT = 900

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

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitForHttpJson(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url)
      if (r.ok) return await r.json()
    } catch {}
    await delay(150)
  }
  throw new Error(`Timeout waiting for ${url}`)
}

class CdpSession {
  constructor(wsUrl) {
    this.wsUrl = wsUrl
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
        if (set) for (const fn of set) fn(msg.params ?? {})
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
  }
  send(method, params = {}) {
    const id = ++this.seq
    return new Promise((res, rej) => {
      this.pending.set(id, { resolve: res, reject: rej })
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
      throw new Error(
        res.exceptionDetails.exception?.description ??
          res.exceptionDetails.text ??
          'Eval exception',
      )
    }
    return res.result?.value
  }
  close() {
    try {
      this.ws?.close()
    } catch {}
  }
}

function startDevServer() {
  return new Promise((res, rej) => {
    const child = spawn(process.execPath, [resolve(ROOT, 'scripts/dev-env.mjs'), 'serve'], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })
    let buf = ''
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        child.kill('SIGTERM')
        rej(new Error(`Timeout waiting for DSH server:\n${buf}`))
      }
    }, 30000)
    const onChunk = (c) => {
      buf += c.toString('utf8')
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
        rej(new Error(`dev-env exited (${code}):\n${buf}`))
      }
    })
  })
}

async function launchChrome(w, h) {
  const bin = resolveChromeBinary()
  if (!bin) throw new Error('Chrome not found')
  const port = await getFreePort()
  const profileDir = mkdtempSync(join(tmpdir(), 'dsh-live-e2e-'))
  const child = spawn(
    bin,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--window-size=${w},${h}`,
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
  const cdp = new CdpSession(pageTarget.webSocketDebuggerUrl)
  await cdp.connect()
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: w,
    height: h,
    deviceScaleFactor: 2,
    mobile: false,
  })
  return {
    cdp,
    async stop() {
      cdp.close()
      if (child.exitCode === null) {
        child.kill('SIGTERM')
        await delay(600)
        if (child.exitCode === null) child.kill('SIGKILL')
      }
      try {
        rmSync(profileDir, { recursive: true, force: true })
      } catch {}
    },
  }
}

async function setTheme(cdp, theme) {
  const isDark = theme === 'dark'
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: theme }],
  })
  await cdp.evaluate(`(() => {
    const root = document.documentElement;
    root.dataset.theme = ${JSON.stringify(theme)};
    root.style.colorScheme = ${JSON.stringify(theme)};
    root.classList.toggle('dark', ${JSON.stringify(isDark)});
    if (document.body) {
      if (${JSON.stringify(isDark)}) document.body.setAttribute('data-ds-dark-theme', '');
      else document.body.removeAttribute('data-ds-dark-theme');
      document.body.classList.toggle('dark', ${JSON.stringify(isDark)});
      document.body.classList.toggle('light', ${JSON.stringify(!isDark)});
    }
  })()`)
  await delay(500)
}

async function freshChat(cdp) {
  await cdp.evaluate(`(async () => {
    const btns = [...document.querySelectorAll('button, [role="button"]')];
    const b = btns.find((x) => (x.textContent || '').trim().includes('新会话') || /^new\\s+chat$/i.test((x.textContent || '').trim()));
    if (b) { b.click(); await new Promise((r) => setTimeout(r, 450)); }
  })()`)
}

async function sendPrompt(cdp, text, waitForAsk = false) {
  await cdp.evaluate(`(async () => {
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
    el.focus();
    if (el.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter ? setter.call(el, ${JSON.stringify(text)}) : (el.value = ${JSON.stringify(text)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      el.textContent = ${JSON.stringify(text)};
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: ${JSON.stringify(text)} }));
    }
    await new Promise((r) => setTimeout(r, 150));
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
  })()`)

  const deadline = Date.now() + 25000
  let lastSig = ''
  let stable = 0
  while (Date.now() < deadline) {
    const st = await cdp.evaluate(`(() => {
      const els = document.querySelectorAll('[class*="a2ui_"]').length;
      const skeletons = document.querySelectorAll('[class*="skeleton"], [class*="shimmer"]').length;
      const surfaces = document.querySelectorAll('[class*="surfaceRoot"], [class*="surfaceCard"], [class*="chartCard"], [data-a2ui-ask-dock]').length;
      const canvases = document.querySelectorAll('[class*="a2ui_"] canvas').length;
      const askReady = !!document.querySelector('[data-a2ui-ask-dock][data-state="waiting"]');
      const bodyText = document.body ? document.body.innerText : '';
      const streaming = bodyText.includes('正在增量同步组件') || bodyText.includes('Syncing components');
      return { els, skeletons, surfaces, canvases, askReady, streaming };
    })()`)
    const sig = `${st.els}:${st.surfaces}:${st.canvases}:${st.skeletons}:${st.askReady}:${st.streaming}`
    const ready = waitForAsk
      ? st.askReady && st.els > 15 && st.skeletons === 0
      : st.els > 15 && st.surfaces > 0 && st.skeletons === 0 && !st.streaming
    if (ready && sig === lastSig) {
      stable += 1
      if (stable >= 4) break
    } else {
      stable = 0
      lastSig = sig
    }
    await delay(280)
  }
  await delay(500)
}

async function snap(cdp, name) {
  if (!OUT_DIR) return ''
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  const dest = join(OUT_DIR, `${name}.png`)
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, Buffer.from(shot.data, 'base64'))
  return dest
}

async function scrollChat(cdp, fraction) {
  await cdp.evaluate(`(() => {
    const root = document.querySelector('[class*="surfaceRoot"], [class*="surfaceStack"], [data-a2ui-chart]');
    let scroller = root?.parentElement;
    while (scroller && scroller !== document.body) {
      const cs = getComputedStyle(scroller);
      if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && scroller.scrollHeight > scroller.clientHeight + 20) break;
      scroller = scroller.parentElement;
    }
    if (scroller && scroller.scrollHeight > scroller.clientHeight) {
      scroller.scrollTop = Math.round((scroller.scrollHeight - scroller.clientHeight) * ${fraction});
    }
  })()`)
  await delay(300)
}

async function pressKey(cdp, key) {
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key })
  await delay(220)
}

async function run() {
  if (OUT_DIR) mkdirSync(OUT_DIR, { recursive: true })
  const server = await startDevServer()
  const browser = await launchChrome(WIDTH, HEIGHT)
  const { cdp } = browser
  const results = []
  const consoleErrors = []
  const pageErrors = []

  cdp.on('Runtime.consoleAPICalled', (p) => {
    if (p.type === 'error') {
      consoleErrors.push((p.args ?? []).map((a) => a.value ?? a.description ?? '').join(' '))
    }
  })
  cdp.on('Runtime.exceptionThrown', (p) => {
    pageErrors.push(p.exceptionDetails?.text ?? 'Uncaught page exception')
  })

  const check = (name, ok, detail = '') => {
    results.push({ name, ok: Boolean(ok), detail })
    console.log(`[live-e2e] ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  }

  try {
    await cdp.send('Page.navigate', { url: server.url })
    await delay(1400)
    await setTheme(cdp, 'dark')

    await freshChat(cdp)
    await sendPrompt(cdp, 'showcase-3')
    const simBefore = await cdp.evaluate(`(() => {
      const stats = [...document.querySelectorAll('[class*="statValue"]')].map((e) => e.textContent?.trim());
      return { stats };
    })()`)
    const simAfter = await cdp.evaluate(`(async () => {
      const slider = document.querySelector('input[type="range"]');
      if (!slider) return { ok: false, reason: 'no slider' };
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(slider, '80');
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      slider.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 200));
      const radios = [...document.querySelectorAll('[role="radio"]')];
      const r1 = radios.find((r) => (r.textContent || '').includes('R1'));
      if (r1) r1.click();
      await new Promise((r) => setTimeout(r, 250));
      const stats = [...document.querySelectorAll('[class*="statValue"]')].map((e) => e.textContent?.trim());
      return { ok: true, stats };
    })()`)
    check(
      '0ms simulator slider + model switch',
      simAfter.ok && JSON.stringify(simBefore.stats) !== JSON.stringify(simAfter.stats),
      `${JSON.stringify(simBefore.stats)} -> ${JSON.stringify(simAfter.stats)}`,
    )

    await freshChat(cdp)
    await sendPrompt(cdp, 'showcase-4', true)
    const askRes = await cdp.evaluate(`(async () => {
      const dock = document.querySelector('[data-a2ui-ask-dock]');
      if (!dock) return { ok: false, reason: 'no ask dock' };
      const submitBtn = [...dock.querySelectorAll('button')].find((b) => (b.textContent || '').includes('授权放行'));
      if (!submitBtn) return { ok: false, reason: 'no submit btn' };
      submitBtn.click();
      await new Promise((r) => setTimeout(r, 1500));
      const dockGone = !document.querySelector('[data-a2ui-ask-dock]');
      const settled = !!document.querySelector('[data-tool="a2ui_ask"][data-state="answered"]');
      return { ok: dockGone && settled, dockGone, settled };
    })()`)
    check('HITL a2ui_ask submit settlement', askRes.ok, JSON.stringify(askRes))

    await freshChat(cdp)
    await sendPrompt(cdp, 'showcase-4', true)
    const askSkip = await cdp.evaluate(`(async () => {
      const skipBtn = document.querySelector('[data-a2ui-ask-skip]');
      if (!skipBtn) return { ok: false, reason: 'no skip btn' };
      skipBtn.click();
      await new Promise((r) => setTimeout(r, 1500));
      const dockGone = !document.querySelector('[data-a2ui-ask-dock]');
      const settled = !!document.querySelector('[data-tool="a2ui_ask"][data-state="skipped"]');
      return { ok: dockGone && settled, dockGone, settled };
    })()`)
    check('HITL a2ui_ask skip settlement', askSkip.ok, JSON.stringify(askSkip))

    await freshChat(cdp)
    await sendPrompt(cdp, 'showcase-29-dock')
    const dockRes = await cdp.evaluate(`(async () => {
      const dock = document.querySelector('[data-a2ui-dock]');
      if (!dock) return { ok: false, reason: 'no dock' };
      const selTrigger = dock.querySelector('button[aria-haspopup="listbox"], [role="combobox"]');
      let popOk = false;
      let popRect = null;
      if (selTrigger) {
        selTrigger.click();
        await new Promise((r) => setTimeout(r, 250));
        const pop = document.querySelector('[data-a2ui-select-popover], [data-a2ui-portal-popover], [role="listbox"], [role="menu"]');
        if (pop) {
          const r = pop.getBoundingClientRect();
          popRect = { top: Math.round(r.top), bottom: Math.round(r.bottom), right: Math.round(r.right), vh: window.innerHeight, vw: window.innerWidth };
          popOk = r.top >= 0 && r.bottom <= window.innerHeight + 2 && r.right <= window.innerWidth + 2;
        }
      }
      return { ok: popOk, popRect };
    })()`)
    await snap(cdp, 'interactive-dock-popover-dark')
    await pressKey(cdp, 'Escape')
    const dockToggleRes = await cdp.evaluate(`(async () => {
      const toggle = document.querySelector('[data-a2ui-dock-toggle]');
      toggle?.click();
      await new Promise((r) => setTimeout(r, 180));
      const collapsed = document.querySelector('[data-a2ui-dock]')?.getAttribute('data-collapsed') === 'true';
      toggle?.click();
      await new Promise((r) => setTimeout(r, 180));
      const expanded = document.querySelector('[data-a2ui-dock]')?.getAttribute('data-collapsed') === null;
      document.querySelector('[data-a2ui-dock-dismiss]')?.click();
      await new Promise((r) => setTimeout(r, 180));
      const dismissed = !document.querySelector('[data-a2ui-dock]');
      return { ok: collapsed && expanded && dismissed, collapsed, expanded, dismissed };
    })()`)
    check('Dock upward popover bounds', dockRes.ok, JSON.stringify(dockRes))
    check('Dock collapse/expand/dismiss', dockToggleRes.ok, JSON.stringify(dockToggleRes))

    await freshChat(cdp)
    await sendPrompt(cdp, 'showcase-31')
    const xfRes = await cdp.evaluate(`(async () => {
      const rowsBefore = document.querySelectorAll('[class*="tableScroll"] tbody tr').length;
      const ms = document.querySelector('[data-a2ui-multiselect] [role="combobox"], [class*="multiSelectTrigger"]');
      if (!ms) return { ok: false, reason: 'no multiselect' };
      ms.click();
      await new Promise((r) => setTimeout(r, 250));
      const euOpt = [...document.querySelectorAll('[role="option"]')].find((o) => (o.textContent || '').includes('eu-west'));
      euOpt?.click();
      await new Promise((r) => setTimeout(r, 250));
      const rowsAfter = document.querySelectorAll('[class*="tableScroll"] tbody tr').length;
      const chipText = document.querySelector('[data-a2ui-chart-filter]')?.textContent?.trim() || '';
      return { ok: rowsAfter > rowsBefore && chipText.includes('eu-west'), rowsBefore, rowsAfter, chipText };
    })()`)
    check('MultiSelect <-> Chart <-> ProTable OR cross-filter', xfRes.ok, JSON.stringify(xfRes))

    await freshChat(cdp)
    await sendPrompt(cdp, 'showcase-38')
    const stickyParityPairs = []
    for (const theme of ['dark', 'light']) {
      await setTheme(cdp, theme)
      const geomInfo = await cdp.evaluate(`(async () => {
        const scrollBox = document.querySelector('[class*="tableScroll"]');
        if (!scrollBox) return null;
        scrollBox.scrollIntoView({ block: 'center' });
        scrollBox.scrollLeft = 0;
        await new Promise((r) => setTimeout(r, 150));
        const rows = [...scrollBox.querySelectorAll('tbody tr')];
        if (rows.length < 2) return null;
        const cb = rows[0].querySelector('input[type="checkbox"]');
        if (cb && !cb.checked) {
          cb.click();
          await new Promise((r) => setTimeout(r, 150));
        }
        const measureRow = (tr) => {
          const stickies = [...tr.querySelectorAll('td[class*="tableStickyCol"]')];
          const lastSticky = stickies[stickies.length - 1];
          const nextNormal = lastSticky?.nextElementSibling;
          if (!lastSticky || !nextNormal) return null;
          const sr = lastSticky.getBoundingClientRect();
          const nr = nextNormal.getBoundingClientRect();
          return {
            stickyBox: { x: sr.right - 14, y: sr.top + 3, w: 10, h: 6 },
            normalBox: { x: nr.left + 6, y: nr.top + 3, w: 10, h: 6 },
            hoverPt: { x: Math.round((nr.left + nr.right) / 2), y: Math.round((nr.top + nr.bottom) / 2) },
          };
        };
        const r1 = measureRow(rows[0]);
        const r2 = measureRow(rows[1]);
        if (!r1 || !r2) return null;
        return { vw: window.innerWidth, r1, r2 };
      })()`)
      if (geomInfo) {
        await cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: geomInfo.r2.hoverPt.x,
          y: geomInfo.r2.hoverPt.y,
        })
        await delay(200)
        const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
        const decoded = decodePngRgba(Buffer.from(shot.data, 'base64'))
        const scale = decoded.width / geomInfo.vw
        const scaleBox = (b) => ({
          x: b.x * scale,
          y: b.y * scale,
          w: b.w * scale,
          h: b.h * scale,
        })
        stickyParityPairs.push({
          label: `${theme}:selected`,
          stickyRgb: samplePngMedianRgb(decoded, scaleBox(geomInfo.r1.stickyBox)),
          normalRgb: samplePngMedianRgb(decoded, scaleBox(geomInfo.r1.normalBox)),
        })
        stickyParityPairs.push({
          label: `${theme}:hover`,
          stickyRgb: samplePngMedianRgb(decoded, scaleBox(geomInfo.r2.stickyBox)),
          normalRgb: samplePngMedianRgb(decoded, scaleBox(geomInfo.r2.normalBox)),
        })
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 })
      }
    }
    await setTheme(cdp, 'dark')
    const stickyParity = evaluateStickyTintParity(stickyParityPairs, 4)
    check(
      'Sticky ProTable selected & hover pixel color parity (Dark & Light)',
      stickyParityPairs.length === 4 && stickyParity.ok,
      JSON.stringify({ pairs: stickyParityPairs, failures: stickyParity.failures }),
    )
    const stickyScrollRes = await cdp.evaluate(`(async () => {
      const scrollBox = document.querySelector('[class*="tableScroll"]');
      if (!scrollBox) return { ok: false, reason: 'no tableScroll' };
      const maxScroll = scrollBox.scrollWidth - scrollBox.clientWidth;
      scrollBox.scrollLeft = Math.min(180, maxScroll);
      await new Promise((r) => setTimeout(r, 180));
      return { ok: maxScroll > 20, maxScroll, scrollLeft: scrollBox.scrollLeft };
    })()`)
    await snap(cdp, 'interactive-sticky-table-scrolled-dark')
    check('Sticky ProTable horizontal scroll', stickyScrollRes.ok, JSON.stringify(stickyScrollRes))

    await cdp.evaluate(`(async () => {
      const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes('打开 Modal 组合压测'));
      btn?.click();
      await new Promise((r) => setTimeout(r, 300));
      const dlg = document.querySelector('[role="dialog"]');
      const sel = dlg?.querySelector('button[aria-haspopup="listbox"], [role="combobox"]');
      sel?.click();
      await new Promise((r) => setTimeout(r, 250));
    })()`)
    await snap(cdp, 'interactive-modal-select-open-dark')
    await pressKey(cdp, 'Escape')
    const lifoStep1 = await cdp.evaluate(`(() => ({
      listboxOpen: !!document.querySelector('[role="listbox"]'),
      dialogOpen: !!document.querySelector('[role="dialog"]'),
    }))()`)
    await pressKey(cdp, 'Escape')
    const lifoStep2 = await cdp.evaluate(`(() => ({
      dialogOpen: !!document.querySelector('[role="dialog"]'),
    }))()`)
    check(
      'LIFO Escape stack (Modal + Select)',
      !lifoStep1.listboxOpen && lifoStep1.dialogOpen && !lifoStep2.dialogOpen,
      JSON.stringify({ lifoStep1, lifoStep2 }),
    )

    await freshChat(cdp)
    await sendPrompt(cdp, 'showcase-23')
    const popClamp = await cdp.evaluate(`(async () => {
      const triggers = [...document.querySelectorAll('button[aria-haspopup="listbox"], [role="combobox"]')];
      const rightMost = triggers.sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)[0];
      if (!rightMost) return { ok: false, reason: 'no select trigger' };
      rightMost.click();
      await new Promise((r) => setTimeout(r, 260));
      const pop = document.querySelector('[data-a2ui-select-popover], [data-a2ui-portal-popover], [role="listbox"]');
      if (!pop) return { ok: false, reason: 'popover did not open' };
      const r = pop.getBoundingClientRect();
      return {
        ok: r.left >= 0 && r.right <= window.innerWidth + 2 && r.bottom <= window.innerHeight + 2,
        left: Math.round(r.left),
        right: Math.round(r.right),
        bottom: Math.round(r.bottom),
        vw: window.innerWidth,
        vh: window.innerHeight,
      };
    })()`)
    await snap(cdp, 'interactive-right-edge-popover-dark')
    await pressKey(cdp, 'Escape')
    check(
      'Right-edge Select/TreeSelect popover viewport clamp',
      popClamp.ok,
      JSON.stringify(popClamp),
    )

    await freshChat(cdp)
    await sendPrompt(cdp, 'showcase-36')
    await scrollChat(cdp, 0)
    await snap(cdp, 'scroll-showcase-36-top-dark')
    const v6Res = await cdp.evaluate(`(async () => {
      const statBefore = document.querySelector('[class*="statValue"]')?.textContent?.trim();
      const ranges = [...document.querySelectorAll('[data-a2ui-rangeslider] input[type="range"]')];
      if (ranges.length >= 2) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(ranges[0], '200');
        ranges[0].dispatchEvent(new Event('input', { bubbles: true }));
        ranges[0].dispatchEvent(new Event('change', { bubbles: true }));
      }
      await new Promise((r) => setTimeout(r, 200));
      const statAfter = document.querySelector('[class*="statValue"]')?.textContent?.trim();

      const chkCta = [...document.querySelectorAll('[data-a2ui-checklist] button')].find((b) => (b.textContent || '').includes('确认放行发布'));
      const lockedBefore = Boolean(chkCta?.disabled);
      const unchecked = [...document.querySelectorAll('[data-a2ui-checklist] input[type="checkbox"]')].find((c) => !c.checked);
      unchecked?.click();
      await new Promise((r) => setTimeout(r, 200));
      const unlockedAfter = chkCta ? !chkCta.disabled : false;

      const sortTitlesBefore = [...document.querySelectorAll('[data-a2ui-sortable] [class*="sortableItemTitle"]')].map((e) => e.textContent?.trim());
      const downBtn = document.querySelector('[data-a2ui-sortable] button[aria-label*="下"], [data-a2ui-sortable] button[aria-label*="down" i]');
      downBtn?.click();
      await new Promise((r) => setTimeout(r, 200));
      const sortTitlesAfter = [...document.querySelectorAll('[data-a2ui-sortable] [class*="sortableItemTitle"]')].map((e) => e.textContent?.trim());

      const kvAdd = [...document.querySelectorAll('[data-a2ui-kveditor] button')].find((b) => (b.textContent || '').includes('+'));
      const kvRowsBefore = document.querySelectorAll('[data-a2ui-kveditor] [class*="kvEditorRow"]').length;
      kvAdd?.click();
      await new Promise((r) => setTimeout(r, 200));
      const kvRowsAfter = document.querySelectorAll('[data-a2ui-kveditor] [class*="kvEditorRow"]').length;
      const lastKeyInput = [...document.querySelectorAll('[data-a2ui-kveditor] [class*="kvEditorRow"]')].at(-1)?.querySelector('input');
      if (lastKeyInput) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(lastKeyInput, 'CUSTOM_SECRET_TOKEN');
        lastKeyInput.dispatchEvent(new Event('input', { bubbles: true }));
        lastKeyInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      await new Promise((r) => setTimeout(r, 200));
      const lastValInput = [...document.querySelectorAll('[data-a2ui-kveditor] [class*="kvEditorRow"]')].at(-1)?.querySelectorAll('input')[1];
      const autoMasked = lastValInput?.type === 'password';

      const imgRange = document.querySelector('[data-a2ui-imagecompare] input[type="range"]');
      if (imgRange) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(imgRange, '75');
        imgRange.dispatchEvent(new Event('input', { bubbles: true }));
        imgRange.dispatchEvent(new Event('change', { bubbles: true }));
      }
      await new Promise((r) => setTimeout(r, 150));
      const imgPct = document.querySelector('[data-a2ui-imagecompare] [class*="imageComparePct"]')?.textContent?.trim();

      return {
        rangeOk: statBefore !== statAfter,
        statBefore, statAfter,
        checklistOk: lockedBefore && unlockedAfter,
        sortableOk: sortTitlesBefore[0] !== sortTitlesAfter[0],
        kvOk: kvRowsAfter === kvRowsBefore + 1 && autoMasked,
        imgCompareOk: imgPct === '75%',
      };
    })()`)
    check(
      'NextGen RangeSlider 0ms calc reactivity',
      v6Res.rangeOk,
      `${v6Res.statBefore} -> ${v6Res.statAfter}`,
    )
    check('NextGen Checklist required gate unlock', v6Res.checklistOk, JSON.stringify(v6Res))
    check('NextGen SortableList reorder', v6Res.sortableOk, JSON.stringify(v6Res))
    check('NextGen KvEditor add + dynamic secret mask', v6Res.kvOk, JSON.stringify(v6Res))
    check('NextGen ImageCompare wipe slider', v6Res.imgCompareOk, JSON.stringify(v6Res))

    await freshChat(cdp)
    await sendPrompt(cdp, 'showcase-2')
    await scrollChat(cdp, 0)
    await snap(cdp, 'scroll-showcase-2-top-dark')
    const mermaidRes = await cdp.evaluate(`(async () => {
      const card = document.querySelector('[data-a2ui-mermaid]');
      if (!card) return { ok: false, reason: 'no mermaid card' };
      const fsBtn = [...card.querySelectorAll('button')].find((b) => (b.textContent || '').includes('全屏'));
      fsBtn?.click();
      await new Promise((r) => setTimeout(r, 300));
      const dlg = document.querySelector('[role="dialog"]');
      const svg = dlg?.querySelector('svg');
      const r = svg?.getBoundingClientRect();
      const fits = Boolean(r && r.width > 100 && r.height > 100 && r.right <= window.innerWidth + 2 && r.bottom <= window.innerHeight + 2);
      return { ok: fits, dlgOpen: !!dlg, svgRect: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null };
    })()`)
    await snap(cdp, 'interactive-mermaid-fullscreen-dark')
    await pressKey(cdp, 'Escape')
    const mermaidClosed = await cdp.evaluate(`!document.querySelector('[role="dialog"]')`)
    check(
      'Mermaid fullscreen fit + Esc close',
      mermaidRes.ok && mermaidClosed,
      JSON.stringify({ mermaidRes, mermaidClosed }),
    )

    await freshChat(cdp)
    await sendPrompt(cdp, 'showcase-41')
    await scrollChat(cdp, 0)
    await snap(cdp, 'scroll-showcase-41-top-dark')
    await setTheme(cdp, 'light')
    await snap(cdp, 'scroll-showcase-41-top-light')
    await setTheme(cdp, 'dark')
    await scrollChat(cdp, 1)
    const sortRes = await cdp.evaluate(`(async () => {
      const thBtn = [...document.querySelectorAll('[class*="tableScroll"] thead th button, [class*="tableScroll"] thead th')].find((b) => (b.textContent || '').trim().includes('QPS'));
      if (!thBtn) return { ok: false, reason: 'no QPS header' };
      thBtn.click();
      await new Promise((r) => setTimeout(r, 150));
      const first = [...document.querySelectorAll('[class*="tableScroll"] tbody tr')].map((tr) => tr.querySelectorAll('td')[0]?.textContent?.trim());
      thBtn.click();
      await new Promise((r) => setTimeout(r, 150));
      const second = [...document.querySelectorAll('[class*="tableScroll"] tbody tr')].map((tr) => tr.querySelectorAll('td')[0]?.textContent?.trim());
      const tailOk = (arr) => arr.length === 4 && arr[2] === 'billing-core' && arr[3] === 'audit-empty';
      const swapped = first[0] !== second[0] && first[1] !== second[1];
      return {
        ok: tailOk(first) && tailOk(second) && swapped,
        first, second,
      };
    })()`)
    check('ProTable null/dash-last asc & desc sort', sortRes.ok, JSON.stringify(sortRes))

    await freshChat(cdp)
    await sendPrompt(cdp, 'showcase-42')
    await setTheme(cdp, 'dark')
    const audit42 = await cdp.evaluate(`(async () => {
      const mermaidCard = document.querySelector('[data-a2ui-mermaid]');
      const mermaidTxt = mermaidCard?.textContent || '';
      const mermaidOk =
        mermaidTxt.includes("WHERE id='123'") &&
        mermaidTxt.includes("id='ord_42'") &&
        !mermaidTxt.includes('m_rfn_i_');
      const logBadges = [
        ...document.querySelectorAll('[data-a2ui-logviewer] [class*="logBadgeWrap"]'),
      ].map((el) => (el.textContent || '').trim());
      const logsOk = logBadges.length === 2 && logBadges[0] === 'ERROR' && logBadges[1] === 'WARN';

      const boolHeader = [...document.querySelectorAll('[class*="tableScroll"] thead th button, [class*="tableScroll"] thead th')].find(
        (b) => (b.textContent || '').trim().includes('启用'),
      );
      const readBoolCol = () =>
        [...document.querySelectorAll('[class*="tableScroll"] tbody tr')].map((tr) =>
          tr.querySelectorAll('td')[1]?.textContent?.trim(),
        );
      let boolClick1 = [];
      let boolClick2 = [];
      if (boolHeader) {
        boolHeader.click();
        await new Promise((r) => setTimeout(r, 150));
        boolClick1 = readBoolCol();
        boolHeader.click();
        await new Promise((r) => setTimeout(r, 150));
        boolClick2 = readBoolCol();
      }
      const tfoot = document.querySelector('[class*="tableScroll"] tfoot')?.textContent?.trim() || '';
      const boolSortedOk =
        (boolClick1.join(',') === '是,否,否' && boolClick2.join(',') === '否,否,是') ||
        (boolClick1.join(',') === '否,否,是' && boolClick2.join(',') === '是,否,否');
      const tableOk =
        boolSortedOk &&
        tfoot.includes('$1,200') &&
        tfoot.includes('99.9633%') &&
        !tfoot.includes('100.0%');
      return {
        ok: mermaidOk && logsOk && tableOk,
        mermaidOk,
        logBadges,
        boolClick1,
        boolClick2,
        tfoot,
      };
    })()`)
    const geom42 = await cdp.evaluate(buildDomGeometryAuditExpression())
    const svgClips42 = Array.isArray(geom42.svgTextClipViolations)
      ? geom42.svgTextClipViolations.length
      : 0
    check(
      'Showcase-42 live DOM semantics (Mermaid SQL + Log TZ + ProTable Bool/SLA + ServiceGraph)',
      audit42.ok && svgClips42 === 0 && geom42.overflowViolations.length === 0,
      JSON.stringify({ ...audit42, svgClips42, overflow42: geom42.overflowViolations.length }),
    )

    for (const sc of [
      'showcase-21',
      'showcase-22',
      'showcase-24',
      'showcase-35',
      'showcase-39',
      'showcase-40',
    ]) {
      await freshChat(cdp)
      await sendPrompt(cdp, sc)
      for (const theme of ['dark', 'light']) {
        await setTheme(cdp, theme)
        await scrollChat(cdp, 0)
        await snap(cdp, `scroll-${sc}-top-${theme}`)
        await scrollChat(cdp, 0.5)
        await snap(cdp, `scroll-${sc}-mid-${theme}`)
      }
    }

    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1024,
      height: 768,
      deviceScaleFactor: 2,
      mobile: false,
    })
    await delay(400)
    for (const sc of ['showcase-18', 'showcase-21', 'showcase-35', 'showcase-40', 'showcase-41']) {
      await freshChat(cdp)
      await sendPrompt(cdp, sc)
      await setTheme(cdp, 'dark')
      const geom = await cdp.evaluate(buildDomGeometryAuditExpression())
      const contrastLen = Array.isArray(geom.contrastViolations)
        ? geom.contrastViolations.length
        : 0
      const svgClipLen = Array.isArray(geom.svgTextClipViolations)
        ? geom.svgTextClipViolations.length
        : 0
      const ok =
        geom.overflowViolations.length === 0 &&
        geom.buttonWrapViolations.length === 0 &&
        geom.clippingViolations.length === 0 &&
        contrastLen === 0 &&
        svgClipLen === 0
      check(
        `1024px narrow desktop geometry (${sc})`,
        ok,
        JSON.stringify({
          overflow: geom.overflowViolations.length,
          wrap: geom.buttonWrapViolations.length,
          clip: geom.clippingViolations.length,
          contrast: contrastLen,
          svgClip: svgClipLen,
          sampleOverflow: geom.overflowViolations.slice(0, 3),
          sampleClip: geom.clippingViolations.slice(0, 3),
        }),
      )
      await snap(cdp, `narrow1024-${sc}-dark`)
    }

    check(
      'Zero console/page errors across entire live E2E session',
      consoleErrors.length === 0 && pageErrors.length === 0,
      JSON.stringify({ consoleErrors, pageErrors }),
    )

    if (OUT_DIR) {
      writeFileSync(
        join(OUT_DIR, 'report.json'),
        JSON.stringify({ results, consoleErrors, pageErrors }, null, 2),
      )
    }
    const failed = results.filter((r) => !r.ok)
    if (failed.length > 0) {
      console.error(`[qa-e2e] FAILED: ${failed.length}/${results.length} check(s) failed.`)
      process.exitCode = 1
    } else {
      console.log(`[qa-e2e] OK: ${results.length}/${results.length} live E2E checks passed.`)
    }
  } finally {
    await browser.stop()
    server.stop()
  }
}

run().catch((err) => {
  console.error('[live-e2e] Fatal:', err)
  process.exit(1)
})
