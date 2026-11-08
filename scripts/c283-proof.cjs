// C.283 proof (GDD 184장, 코딩196): 빌드 두 벌(A·B)을 python http.server 로 /app/ 에 번갈아 걸고, 옛 빌드 화면에서 새 빌드 배포 → visible 뒤 띠·자동 다시 시작까지 걸린 초를 잰다.
// 실행: npx vite build --outDir <S>/a && npx vite build --outDir <S>/b && mkdir -p <S>/serve && node scripts/c283-proof.cjs <S> docs/captures/c283
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const S = process.argv[2], OUT = process.argv[3];
const PORT = 5390, URL0 = `http://localhost:${PORT}/app/`;
const link = (v) => { try { fs.unlinkSync(`${S}/serve/app`); } catch {} fs.symlinkSync(`${S}/${v}`, `${S}/serve/app`); };
const assetOf = (v) => fs.readdirSync(`${S}/${v}/assets`).find((f) => /^index-.*\.js$/.test(f));
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  link('a');
  const srv = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: `${S}/serve`, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 1000));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  const wait = (ms) => page.waitForTimeout(ms);
  const running = () => page.evaluate(() => [...document.scripts].map((s) => s.src).find((s) => /assets\/index-/.test(s)) || '');
  const instrumentSw = () => page.evaluate(() => { window.__sw = null; navigator.serviceWorker.getRegistration().then((reg) => reg && reg.addEventListener('updatefound', () => { const w = reg.installing; w.addEventListener('statechange', () => { if (w.state === 'installed' && window.__sw === null) window.__sw = performance.now(); }); })); });
  await page.goto(`${URL0}?test=1`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await wait(1500);
  await page.goto(`${URL0}?test=1`);
  console.log('controlled', await page.evaluate(() => !!navigator.serviceWorker.controller), 'A=', assetOf('a'), 'B=', assetOf('b'));
  // 방으로 (새 게임, 테스트 모드)
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${URL0}?test=1`); await wait(1200);
  await page.getByRole('button', { name: '새로 시작' }).click(); await wait(300);
  await page.locator('.bha-slot').first().click(); await wait(200);
  await page.getByRole('button', { name: '확인' }).click(); await wait(300);
  await page.locator('.bha-species__card').nth(0).click(); await wait(300);
  await page.getByRole('button', { name: '시작', exact: true }).click(); await wait(6500);
  console.log('room running', (await running()).split('/').pop());
  // 1) 방(게임 중): 새 빌드 배포 → 다시 꺼냄(visible)
  await instrumentSw();
  link('b');
  const t0 = await page.evaluate(() => { const t = performance.now(); document.dispatchEvent(new Event('visibilitychange')); return t; });
  await page.waitForSelector('.bha-update', { timeout: 120000 });
  const t1 = await page.evaluate(() => performance.now());
  console.log(`ROOM banner after ${((t1 - t0) / 1000).toFixed(2)}s`);
  await page.screenshot({ path: path.join(OUT, '2-room-banner.png') });
  await page.waitForFunction(() => window.__sw !== null, null, { timeout: 120000 }).catch(() => {});
  const tsw = await page.evaluate(() => window.__sw);
  console.log(`(old way: new SW installed after ${tsw ? ((tsw - t0) / 1000).toFixed(2) + 's' : 'n/a'} locally, 46MB)`);
  // 2) 처음 화면: 옛 빌드(A)로 처음 화면 → 새 빌드(B) 배포 → 다시 꺼냄 → 자동 다시 시작
  link('a');
  await page.goto(`${URL0}?test=1`); await wait(2500);
  console.log('title running', (await running()).split('/').pop(), 'top', await page.evaluate(() => !!document.querySelector('.bha-start--title')));
  await wait(5500);
  link('b');
  const s0 = await page.evaluate(() => { const t = performance.now(); window.__t0 = Date.now(); document.dispatchEvent(new Event('visibilitychange')); return t; });
  await page.waitForSelector('.bha-start__update', { timeout: 120000 });
  const s1 = await page.evaluate(() => performance.now());
  await page.screenshot({ path: path.join(OUT, '1-title-auto-restart.png') });
  console.log(`TITLE auto-restart notice after ${((s1 - s0) / 1000).toFixed(2)}s`);
  const tStart = Date.now();
  await page.waitForFunction((b) => [...document.scripts].some((s) => s.src.includes(b)), assetOf('b'), { timeout: 60000 });
  await page.waitForSelector('.bha-start--title', { timeout: 60000 });
  console.log(`TITLE new build running ${((Date.now() - tStart) / 1000).toFixed(2)}s after notice; url=${page.url()}`);
  await wait(7000);
  console.log('after restart: notice?', await page.evaluate(() => !!document.querySelector('.bha-start__update, .bha-update')), 'url', page.url());
  console.log('errors', errs);
  await browser.close(); srv.kill();
})().catch((e) => { console.error(e); process.exit(1); });
