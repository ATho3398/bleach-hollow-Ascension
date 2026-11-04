// 렉 측정 (GDD 186장 1, C.283): 빌드 결과(vite preview)를 844×390 · CPU 4배 느리게(CDP setCPUThrottlingRate 4) 돌려
// 화면마다 프레임(rAF 간격)·긴 작업(>50ms)·스타일/레이아웃/페인트·이미지 디코드 시간을 잰다.
// 사용: npm run build && node scripts/perf/perf.cjs [결과.json]   (PERF_URL=<이미 떠 있는 주소> 면 서버를 안 띄움, PERF_FACTION=0|1)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const PORT = 5197;
const OUT = process.argv[2] || null;
const SHOTS = process.env.PERF_SHOTS || null;

async function startServer() {
  if (process.env.PERF_URL) return { url: process.env.PERF_URL, stop() {} };
  const p = spawn(path.join(ROOT, 'node_modules/.bin/vite'), [ 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  const url = await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('preview 시작 안 됨')), 30000);
    p.stdout.on('data', (d) => { const m = String(d).replace(/\x1b\[[0-9;]*m/g, '').match(/http:\/\/localhost:\d+\/[^\s]*/); if (m) { clearTimeout(t); res(m[0].replace(/\x1b\[[0-9;]*m/g, '')); } });
  });
  return { url, stop: () => p.kill('SIGTERM') };
}

/** 페이지 안: rAF 간격·긴 작업 기록 시작 */
function recStart() {
  if (window.__perf) { window.__perf.run = false; window.__perf.obs?.disconnect(); }
  const r = (window.__perf = { frames: [], long: [], run: true });
  let last = performance.now();
  const tick = (t) => { if (!r.run) return; r.frames.push(t - last); last = t; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  try {
    r.obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) r.long.push(e.duration); });
    r.obs.observe({ type: 'longtask', buffered: false });
  } catch { /* 없음 */ }
}
function recStop() {
  const r = window.__perf; r.run = false; r.obs?.disconnect();
  const f = r.frames.slice(1);
  const total = f.reduce((a, b) => a + b, 0);
  const sorted = [...f].sort((a, b) => a - b);
  return {
    fps: f.length ? +(1000 * f.length / total).toFixed(1) : 0,
    p95FrameMs: sorted.length ? +sorted[Math.floor(sorted.length * 0.95)].toFixed(1) : 0,
    maxFrameMs: sorted.length ? +sorted[sorted.length - 1].toFixed(1) : 0,
    jank: f.filter((x) => x > 50).length,
    longTasks: r.long.length,
    longTaskMs: Math.round(r.long.reduce((a, b) => a + b, 0)),
    maxLongMs: Math.round(Math.max(0, ...r.long)),
  };
}

const PICK = {
  Layout: 'layout', UpdateLayoutTree: 'style', Paint: 'paint', PrePaint: 'paint', Layerize: 'paint', 'Commit': 'paint',
  'Decode Image': 'decode', ImageDecodeTask: 'decode', 'Decode LazyPixelRef': 'decode',
  RasterTask: 'raster', FunctionCall: 'script', TimerFire: 'script', FireAnimationFrame: 'script', EvaluateScript: 'script', 'v8.compile': 'script',
};
function traceSum(buf) {
  const ev = JSON.parse(buf.toString()).traceEvents || [];
  const thread = new Map();
  for (const e of ev) if (e.ph === 'M' && e.name === 'thread_name') thread.set(`${e.pid}:${e.tid}`, e.args.name);
  const out = { mainMs: {}, otherMs: {} };
  for (const e of ev) {
    if (e.ph !== 'X' || !e.dur) continue;
    const k = PICK[e.name]; if (!k) continue;
    const tn = thread.get(`${e.pid}:${e.tid}`) || '';
    const bucket = tn === 'CrRendererMain' ? out.mainMs : out.otherMs;
    bucket[k] = (bucket[k] || 0) + e.dur / 1000;
  }
  for (const b of [out.mainMs, out.otherMs]) for (const k in b) b[k] = Math.round(b[k]);
  return out;
}

function topSelf(profile, n = 25) {
  const self = new Map();
  const byId = new Map(profile.nodes.map((x) => [x.id, x]));
  const dt = profile.timeDeltas; const sm = profile.samples;
  for (let i = 0; i < sm.length; i++) {
    const nd = byId.get(sm[i]); const cf = nd.callFrame;
    const k = `${cf.functionName || '(anon)'} ${cf.url.split('/').pop()}:${cf.lineNumber}:${cf.columnNumber}`;
    self.set(k, (self.get(k) || 0) + (dt[i] || 0) / 1000);
  }
  return [...self].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${v.toFixed(0).padStart(6)}ms ${k}`);
}

async function measure(page, browser, name, fn, ms = 4000, boot = false, cdp = null) {
  if (!boot) await page.evaluate(recStart);
  const prof = cdp && process.env.PERF_PROFILE && name.includes(process.env.PERF_PROFILE);
  if (prof) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
  await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink', 'cc', 'gpu'] });
  const t0 = Date.now();
  if (fn) await fn();
  const left = ms - (Date.now() - t0);
  if (left > 0) await page.waitForTimeout(left);
  const buf = await browser.stopTracing();
  if (process.env.PERF_TRACE && name.includes(process.env.PERF_TRACE)) fs.writeFileSync(process.env.PERF_TRACE_OUT || 'trace.json', buf);
  if (prof) { const { profile } = await cdp.send('Profiler.stop'); console.log(topSelf(profile).join('\n')); }
  const r = await page.evaluate(recStop);
  const res = { name, ...r, ...traceSum(buf) };
  console.log(JSON.stringify(res));
  return res;
}

async function newGame(page, url, fi) {
  await page.goto(`${url}?test=1`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${url}?test=1`);
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: '새로 시작' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-slot').first().click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: '확인' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-species__card').nth(fi).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await page.waitForTimeout(2500);
}

async function closeLayers(page) {
  for (let i = 0; i < 4; i++) {
    const b = page.locator('.bha-tut button, .bha-dialog button').filter({ visible: true }).first();
    if (!(await b.count())) break;
    await b.click({ timeout: 1000 }).catch(() => {});
    await page.waitForTimeout(200);
  }
}

(async () => {
  const server = await startServer();
  const browser = await chromium.launch();
  const all = { when: new Date().toISOString(), cpuThrottle: 4, viewport: '844x390', dpr: Number(process.env.PERF_DPR || 2), runs: [] };
  try {
    for (const fi of [0, 1].filter((i) => !process.env.PERF_FACTION || String(i) === process.env.PERF_FACTION)) {
      const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: Number(process.env.PERF_DPR || 2) });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => console.log('pageerror', e.message));
      await ctx.addInitScript(recStart);
      if (process.env.PERF_CSS) await ctx.addInitScript((css) => { addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = css; document.head.append(st); }); }, process.env.PERF_CSS);
      const cdp = await ctx.newCDPSession(page);
      await newGame(page, server.url, fi);
      await closeLayers(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const faction = fi ? 'shinigami' : 'hollow';
      const runs = [];
      const m = async (n, fn, ms, boot) => { const r = await measure(page, browser, `${faction}/${n}`, fn, ms, boot, cdp); runs.push(r); };
      // 켤 때(서비스 워커 미리 받기 포함): 새로고침 → 이어하기
      await m('켜기(새로고침)', async () => {
        await page.reload();
        await page.getByRole('button', { name: '이어하기' }).click({ timeout: 20000 });
      }, 8000, true);
      await closeLayers(page);
      await m('방 가만히', null, 4000);
      await m('방→월드맵', () => page.locator('.bha-prop--outside').click({ timeout: 5000 }), 2500);
      await closeLayers(page);
      await m('월드맵 가만히', null, 4000);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${faction}-worldmap.png`) });
      await m('월드맵→시장(걷기·페이드)', () => page.locator('.bha-worldmap [data-place="market"]').click({ timeout: 5000 }), 4000);
      await closeLayers(page);
      await m('시장 가만히', null, 4000);
      // 방으로: 뒤로 여러 번
      for (let i = 0; i < 6 && !(await page.locator('.bha-room:not(.bha-market):not(.bha-worldmap)').count()); i++) {
        const b = page.locator('.bha-lcd [data-space-back]').first();
        if (await b.count()) await b.click({ timeout: 2000 }).catch(() => {}); else await page.keyboard.press('Escape');
        await page.waitForTimeout(1500);
      }
      await page.locator('.bha-prop--outside').click({ timeout: 5000 });
      await page.waitForTimeout(1500);
      if (await page.locator('.bha-worldmap [data-place="spa"]').count()) {
        await m('월드맵→온천', () => page.locator('.bha-worldmap [data-place="spa"]').click({ timeout: 5000 }), 6000);
        await closeLayers(page);
        await m('온천 가만히', null, 4000);
        for (let i = 0; i < 6 && !(await page.locator('.bha-worldmap, .bha-room:not(.bha-market)').count()); i++) {
          const b = page.locator('.bha-lcd [data-space-back]').first();
          if (await b.count()) await b.click({ timeout: 2000 }).catch(() => {}); else await page.keyboard.press('Escape');
          await page.waitForTimeout(1500);
        }
      }
      for (let i = 0; i < 6 && !(await page.locator('.bha-worldmap, .bha-room').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(1500); }
      if (!(await page.locator('.bha-worldmap').count())) { await page.locator('.bha-prop--outside').click({ timeout: 5000 }); await page.waitForTimeout(1500); }
      await page.locator('.bha-worldmap [data-place="adventure"]').click({ timeout: 5000 });
      await page.waitForTimeout(4000);
      await closeLayers(page);
      await page.getByRole('button', { name: '★1', exact: true }).click({ timeout: 5000 });
      await page.getByRole('button', { name: '출발', exact: true }).click({ timeout: 5000 });
      await page.locator('.bha-battle').waitFor({ timeout: 90000 });
      await page.waitForTimeout(2600);
      await m('전투', null, 6000);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${faction}-battle.png`) });
      all.runs.push(...runs);
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.stop();
  }
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(all, null, 1));
})();
