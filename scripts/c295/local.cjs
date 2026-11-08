// 로컬 재현(GitHub Pages 처럼 max-age=600): node local.cjs o|n [shotDir]
const { spawn } = require('child_process'); const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const S = __dirname, V = process.argv[2], SHOT = process.argv[3], PORT = 5391, U = `http://localhost:${PORT}/app/`;
const serve = `${S}/serve-${V}`; fs.mkdirSync(serve, { recursive: true });
const link = (d) => { try { fs.unlinkSync(`${serve}/app`); } catch {} fs.symlinkSync(`${S}/${d}`, `${serve}/app`); };
const js = (d) => fs.readdirSync(`${S}/${d}/assets`).find((f) => /^index-.*\.js$/.test(f));
(async () => {
  link(V + 'a');
  const srv = spawn('python3', [`${S}/srv.py`, String(PORT), serve], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  let page = await ctx.newPage();
  await page.goto(U); await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForTimeout(1500);
  await page.goto(U); await page.waitForTimeout(1500);
  const running = (p) => p.evaluate(() => ([...document.scripts].map((s) => s.src).find((s) => /assets\/index-/.test(s)) || '').split('/').pop());
  console.log(V, 'primed', await running(page), 'ctrl', await page.evaluate(() => !!navigator.serviceWorker.controller), 'A=', js(V + 'a'), 'B=', js(V + 'b'));
  await page.close();
  link(V + 'b'); // 새 배포
  page = await ctx.newPage(); // 앱 다시 켜기(새로 열기)
  const t0 = Date.now();
  await page.goto(U);
  const first = await running(page);
  const sig = await page.waitForSelector('.bha-update, .bha-start__update', { timeout: 15000 }).then((e) => e.getAttribute('class')).catch(() => null);
  const tSig = (Date.now() - t0) / 1000;
  if (SHOT && sig) await page.screenshot({ path: path.join(SHOT, `local-${V}.png`) });
  const newOk = await page.waitForFunction((b) => [...document.scripts].some((s) => s.src.includes(b)), js(V + 'b'), { timeout: 15000 }).then(() => (Date.now() - t0) / 1000).catch(() => null);
  console.log(V, 'first screen', first, '| signal', sig, sig ? tSig.toFixed(2) + 's' : '-', '| new build running at', newOk, 's');
  await browser.close(); srv.kill();
})().catch((e) => { console.error(e); process.exit(1); });
