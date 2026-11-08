// C.315 재현·점검 (GDD 195장, 코딩226): 옛 빌드 → 새 빌드로 정적 서버의 뿌리를 바꿔 끼우며(GitHub Pages 처럼 max-age=600)
// 서비스 워커를 실제로 등록한 채 네 장면을 본다. PC 844×390 마우스 · 폰 796×384 터치.
//   S1 완전 종료 → 재실행(옛 워커, 처음 화면): 자동 다시 시작 → 새 빌드까지 몇 초
//   S3 게임 중 백그라운드 → 복귀(옛 빌드 그대로 살아 있음): 새 버전 창까지 몇 초
//   S4 [나중에] → 백그라운드 → 복귀: 창이 다시 뜨나
//   S5 [나중에] → 더 새 빌드 배포(폰만): 1분 확인에 창이 다시 뜨나
//   S6 켤 때 망이 늦게 붙음(버전 파일 7초 지연 2회, 옛 index 캐시): 창/다시 시작까지 몇 초
//   S7 다시 시작 때 index 가 3초 넘게 걸림(옛 캐시 셸로 떨어짐): 결국 새 빌드로 가나
// 실행: node scripts/c315/repro.cjs <buildsDir> [shotDir] [devices=pc,phone]  — buildsDir/A, B, C = dist 복사본(C 는 version.json 만 달라도 됨)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const BUILDS = path.resolve(process.argv[2] || '.');
const SHOT = process.argv[3] ? path.resolve(process.argv[3]) : null;
const DEVS = (process.argv[4] || 'pc,phone').split(',');
const PORT = Number(process.env.C315_PORT || 5415);
const URL0 = `http://localhost:${PORT}/app/`;
const DEVICES = {
  pc: { id: 'pc', viewport: { width: 844, height: 390 }, touch: false },
  phone: { id: 'phone', viewport: { width: 796, height: 384 }, touch: true },
};
const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', webp: 'image/webp', webmanifest: 'application/manifest+json', mp3: 'audio/mpeg', ogg: 'audio/ogg', svg: 'image/svg+xml', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', ico: 'image/x-icon' };

/** 정적 서버: 뿌리(A/B/C) 바꾸기 · 버전 파일/화면 지연 (`/__ctl?root=B&delayVersion=7000&delayVersionCount=2&delayNav=4000`) */
function serve() {
  const state = { root: 'A', delayVersion: 0, delayVersionCount: 0, delayNav: 0, hits: [] };
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/__ctl') {
      for (const [k, v] of u.searchParams) state[k] = k === 'root' ? v : Number(v);
      res.end('ok');
      return;
    }
    if (!u.pathname.startsWith('/app/')) { res.statusCode = 404; res.end(); return; }
    let rel = decodeURIComponent(u.pathname.slice(5));
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    const isVersion = rel.endsWith('version.json');
    let delay = 0;
    if (isVersion && state.delayVersionCount > 0) { delay = state.delayVersion; state.delayVersionCount--; }
    if (rel === 'index.html') delay = state.delayNav;
    state.hits.push({ t: Date.now(), rel, root: state.root, delay, q: u.search });
    const file = path.join(BUILDS, state.root, rel);
    setTimeout(() => {
      fs.readFile(file, (e, buf) => {
        if (e) { res.statusCode = 404; res.end(); return; }
        res.setHeader('Cache-Control', 'max-age=600');
        res.setHeader('Content-Type', TYPES[path.extname(rel).slice(1)] || 'application/octet-stream');
        res.end(buf);
      });
    }, delay);
  });
  return new Promise((r) => srv.listen(PORT, () => r({ srv, state })));
}
const ctl = (q) => fetch(`http://localhost:${PORT}/__ctl?${q}`).then((r) => r.text());

const buildOf = (dir) => JSON.parse(fs.readFileSync(path.join(BUILDS, dir, 'version.json'), 'utf8')).build;
const indexJs = (dir) => fs.readdirSync(path.join(BUILDS, dir, 'assets')).find((f) => /^index-.*\.js$/.test(f));
const JS = { A: indexJs('A'), B: indexJs('B'), C: indexJs('C') };
/** 각 빌드 워커의 캐시 버전 (sw.js 의 VERSION) — 심기 단계에서 '그 워커가 활성화돼 옛 캐시를 지웠는가' 를 본다 */
const swVersion = (dir) => (fs.readFileSync(path.join(BUILDS, dir, 'sw.js'), 'utf8').match(/const VERSION = '([^']+)'/) || [])[1];
const VER = { A: swVersion('A'), B: swVersion('B') };
/** 화면 열기: 문서가 잡히면(commit) 돌아오고 load 는 8초까지만 기다린다 — 새 워커가 로딩 중 화면을 다시 여는 순간과 겹치면 load 를 영영 기다릴 수 있다 */
const go = async (page) => {
  await page.goto(URL0, { waitUntil: 'commit' });
  await page.waitForLoadState('load', { timeout: 8000 }).catch(() => undefined);
};
/** 지금 화면이 어느 빌드의 스크립트로 도는가 */
const running = (page) => page.evaluate(() => ([...document.scripts].map((s) => s.src).find((s) => /assets\/index-/.test(s)) || '').split('/').pop()).then((f) => Object.keys(JS).find((k) => JS[k] === f) ?? f).catch(() => '?');

/** 자리 비움/복귀 (visibilityState·hidden 둘 다 덮어쓴다 — pwa.ts 는 visibilityState 를 본다) */
const setAway = (page, away) => page.evaluate((away) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => away });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (away ? 'hidden' : 'visible') });
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event(away ? 'blur' : 'focus'));
}, away);

/** 새 버전 창 상태 */
const dialogLook = (page) => page.evaluate(() => {
  const layer = document.querySelector('.bha-update');
  if (!layer) return { open: false };
  const lcd = document.querySelector('.bha-lcd');
  const card = layer.querySelector('.bha-update__card')?.getBoundingClientRect();
  const btn = (re) => {
    const b = [...layer.querySelectorAll('button')].find((x) => re.test(x.textContent));
    if (!b) return null;
    const r = b.getBoundingClientRect();
    const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: !!t && b.contains(t) };
  };
  const lr = lcd?.getBoundingClientRect();
  return {
    open: true,
    inLcd: !!lcd && lcd.contains(layer),
    inLcdBox: !!card && !!lr && card.left >= lr.left - 0.5 && card.right <= lr.right + 0.5 && card.top >= lr.top - 0.5 && card.bottom <= lr.bottom + 0.5,
    parent: layer.parentElement?.className?.split(' ')[0] ?? layer.parentElement?.tagName,
    restart: btn(/다시 시작/),
    later: btn(/나중에/),
    tutCards: [...document.querySelectorAll('.bha-tut .bha-tut__card')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 2 && getComputedStyle(e).visibility !== 'hidden'; }).length,
  };
}).catch(() => ({ open: false, err: true }));

/** 신호를 기다린다: 새 버전 창 · 처음 화면 자동 다시 시작 안내 · 새 빌드로 바뀜 */
async function waitSignal(page, ms, t0 = Date.now()) {
  const end = t0 + ms;
  let first = null;
  while (Date.now() < end) {
    const run = await running(page);
    if (first === null && run !== '?' && run !== '') first = run;
    const sig = await page.evaluate(() => (document.querySelector('.bha-update') ? 'dialog' : document.querySelector('.bha-start__update') ? 'auto' : null)).catch(() => null);
    if (sig) return { first, sig, at: (Date.now() - t0) / 1000, run };
    if (first && run !== first && run !== '?') return { first, sig: 'switched', at: (Date.now() - t0) / 1000, run };
    await page.waitForTimeout(100);
  }
  return { first, sig: null, at: null, run: await running(page) };
}
/** 새 빌드(B)가 돌 때까지 */
async function waitRun(page, want, ms, t0 = Date.now()) {
  const end = Math.max(Date.now(), t0) + ms;
  while (Date.now() < end) {
    const r = await running(page);
    if (r === want) return (Date.now() - t0) / 1000;
    await page.waitForTimeout(100);
  }
  return null;
}

async function newGame(page, fi) {
  await go(page);
  await page.evaluate(() => localStorage.clear());
  await go(page);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '새로 시작' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-slot').first().click();
  await page.getByRole('button', { name: '확인' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-species__card').nth(fi).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await page.waitForTimeout(2500);
}

/** 옛 빌드 A 로 워커를 심는다(등록 → 다시 열어 제어 중) */
/** 워커 상태 (캐시 목록은 무거운 쓰기 중 멈출 수 있어 1초 제한) */
const swState = (page) => page.evaluate(async () => {
  const keys = await Promise.race([caches.keys(), new Promise((r) => setTimeout(() => r(null), 1000))]);
  const r = await navigator.serviceWorker.getRegistration();
  return { keys, installing: !!r?.installing, waiting: !!r?.waiting, active: !!r?.active };
}).catch(() => null);

/** 옛 빌드 A 로 워커를 심는다. 돌려주는 값 = 새로 연 화면(A 가 제어).
 *  크롬 현상(C.315 재현, dbg9): 대기(waiting) 워커가 있을 때 화면을 열면 요청이 옛 워커로 가고 1초 뒤 새 워커로 바뀌며 그 요청이 버려져 이동이 영영 끝나지 않는다.
 *  그래서 A 의 워커가 설치를 마칠 때까지 기다린 뒤 화면을 닫고(마지막 창이 닫히면 대기 워커가 바로 활성화) 새 창으로 연다 */
async function prime(ctx, page, R) {
  await ctl('root=A&delayVersion=0&delayVersionCount=0&delayNav=0');
  await go(page);
  await page.evaluate(() => navigator.serviceWorker.ready).catch(() => undefined);
  const hasA = (s) => Array.isArray(s?.keys) && s.keys.includes('bha-' + VER.A);
  // ① A 의 워커 설치가 시작(installing/waiting)되거나 이미 A 캐시가 있을 때까지 ② 설치(installing)가 끝날 때까지
  for (let i = 0; i < 60; i++) {
    const s = await swState(page);
    if (s && (s.installing || s.waiting || hasA(s))) break;
    await page.waitForTimeout(500);
  }
  for (let i = 0; i < 120; i++) {
    const s = await swState(page);
    if (s && !s.installing) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(500);
  await page.close();
  const next = await ctx.newPage();
  if (R) next.on('pageerror', (e) => R.errors.push(String(e)));
  await go(next);
  await next.waitForTimeout(1500);
  return next;
}

(async () => {
  const { srv, state } = await serve();
  if (SHOT) fs.mkdirSync(SHOT, { recursive: true });
  const browser = await chromium.launch();
  const out = { builds: { A: buildOf('A'), B: buildOf('B'), C: buildOf('C') }, js: JS, devices: {} };
  console.log('builds', out.builds, JS);
  try {
    for (const id of DEVS) {
      const dev = DEVICES[id];
      const fi = id === 'pc' ? 0 : 1; // 호로 · 사신 하나씩
      const R = (out.devices[id] = { errors: [] });
      const ctx = await browser.newContext({ viewport: dev.viewport, deviceScaleFactor: 1, hasTouch: dev.touch, isMobile: dev.touch });
      const shot = async (page, name) => { if (SHOT) await page.screenshot({ path: path.join(SHOT, `${id}-${name}.png`) }); };
      const tapAt = (page, p) => (dev.touch ? page.touchscreen.tap(p.x, p.y) : page.mouse.click(p.x, p.y));
      let page = await ctx.newPage();
      page.on('pageerror', (e) => R.errors.push(String(e)));
      // ---------- 심기: 옛 빌드 A + 새 게임(방까지) ----------
      page = await prime(ctx, page, R);
      await newGame(page, fi);
      R.prime = { run: await running(page), ctrl: await page.evaluate(() => !!navigator.serviceWorker.controller) };
      console.log(id, 'prime', R.prime);

      // ---------- S3 게임 중 백그라운드 → 복귀 ----------
      await ctl('root=B');
      await setAway(page, true);
      await page.waitForTimeout(800);
      let t0 = Date.now();
      await setAway(page, false);
      let s = await waitSignal(page, 10000, t0);
      let look = await dialogLook(page);
      R.s3_resume = { ...s, look };
      console.log(id, 'S3 resume', JSON.stringify(R.s3_resume));
      if (look.open) await shot(page, '1-resume-dialog');

      // ---------- S4 [나중에] → 백그라운드 → 복귀 ----------
      if (look.open && look.later) {
        await tapAt(page, look.later);
        await page.waitForTimeout(600);
        const closed = !(await dialogLook(page)).open;
        await setAway(page, true);
        await page.waitForTimeout(800);
        t0 = Date.now();
        await setAway(page, false);
        s = await waitSignal(page, 10000, t0);
        look = await dialogLook(page);
        R.s4_later_resume = { closed, ...s, look };
        console.log(id, 'S4 later→resume', JSON.stringify(R.s4_later_resume));
        if (look.open) await shot(page, '2-later-resume-dialog');
      } else R.s4_later_resume = { skipped: true };

      // ---------- S5 [나중에] → 더 새 빌드(C) → 1분 확인 (폰만) ----------
      if (id === 'phone' && look.open && look.later) {
        await tapAt(page, look.later);
        await page.waitForTimeout(600);
        await ctl('root=C');
        t0 = Date.now();
        s = await waitSignal(page, 75000, t0);
        look = await dialogLook(page);
        R.s5_later_newer = { ...s, look };
        console.log(id, 'S5 later→newer build', JSON.stringify(R.s5_later_newer));
        if (look.open) await shot(page, '3-later-newer-dialog');
        if (look.open && look.later) await tapAt(page, look.later);
      }
      await page.close();

      // ---------- S1 완전 종료 → 재실행 (처음 화면, 옛 워커) ----------
      await ctl('root=B&delayVersion=0&delayVersionCount=0&delayNav=0');
      page = await ctx.newPage();
      page.on('pageerror', (e) => R.errors.push(String(e)));
      t0 = Date.now();
      await go(page);
      s = await waitSignal(page, 15000, t0);
      if (s.sig === 'auto') await shot(page, '4-cold-auto-restart');
      const toB = await waitRun(page, 'B', 15000, t0);
      R.s1_cold = { ...s, newBuildAt: toB, final: await running(page) };
      console.log(id, 'S1 cold start', JSON.stringify(R.s1_cold));
      await page.close();

      // 다시 옛 빌드로 심는다(S6·S7 은 '옛 워커·옛 캐시' 에서 시작)
      page = await prime(ctx, await ctx.newPage(), R);
      await page.close();

      // ---------- S6 켤 때 망이 늦게 붙음 (버전 파일 7초 지연 2회) ----------
      await ctl('root=B&delayVersion=7000&delayVersionCount=2&delayNav=4000');
      page = await ctx.newPage();
      page.on('pageerror', (e) => R.errors.push(String(e)));
      t0 = Date.now();
      await go(page);
      s = await waitSignal(page, 40000, t0);
      if (s.sig === 'auto') await shot(page, '5-slow-net-auto-restart');
      const toB6 = await waitRun(page, 'B', 30000, t0);
      R.s6_slow_net = { ...s, newBuildAt: toB6, final: await running(page), versionHits: state.hits.filter((h) => h.t >= t0 && h.rel.endsWith('version.json')).map((h) => ((h.t - t0) / 1000).toFixed(1) + (h.delay ? 'd' : '')) };
      console.log(id, 'S6 slow net', JSON.stringify(R.s6_slow_net));
      await page.close();

      page = await prime(ctx, await ctx.newPage(), R);
      await page.close();

      // ---------- S7 다시 시작 때 index 가 3초 넘게 (옛 캐시 셸로 떨어짐) ----------
      await ctl('root=B&delayVersion=0&delayVersionCount=0&delayNav=4000');
      page = await ctx.newPage();
      page.on('pageerror', (e) => R.errors.push(String(e)));
      t0 = Date.now();
      await go(page);
      s = await waitSignal(page, 15000, t0);
      if (s.sig === 'auto') await shot(page, '6-slow-nav-auto-restart');
      const toB7 = await waitRun(page, 'B', 30000, t0);
      look = await dialogLook(page);
      R.s7_slow_nav = { ...s, newBuildAt: toB7, final: await running(page), dialog: look.open, navHits: state.hits.filter((h) => h.t >= t0 && h.rel === 'index.html').map((h) => ((h.t - t0) / 1000).toFixed(1) + h.q) };
      console.log(id, 'S7 slow nav', JSON.stringify(R.s7_slow_nav));
      await page.close();
      await ctx.close();
    }
  } finally {
    await browser.close();
    srv.close();
  }
  if (SHOT) fs.writeFileSync(path.join(SHOT, 'proof.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
