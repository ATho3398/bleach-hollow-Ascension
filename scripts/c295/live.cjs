// 실제 배포 주소 재현: node live.cjs prime|reopen <label> [shotDir]
const { chromium } = require('playwright');
const path = require('path');
const MODE = process.argv[2], LABEL = process.argv[3] || 'x', SHOT = process.argv[4];
const URL0 = 'https://atho3398.github.io/bleach-hollow-Ascension/';
const PROFILE = __dirname + '/profile';
(async () => {
  const ctx = await chromium.launchPersistentContext(PROFILE, { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, serviceWorkers: 'allow' });
  const page = ctx.pages()[0] || (await ctx.newPage());
  const T0 = Date.now();
  const log = (...a) => console.log(`[${LABEL} +${((Date.now() - T0) / 1000).toFixed(2)}s]`, ...a);
  page.on('response', async (r) => {
    const u = r.url();
    if (/\/(version\.json|sw\.js)(\?|$)|\/bleach-hollow-Ascension\/(\?.*)?$|assets\/index-.*\.js/.test(u)) {
      const h = r.headers();
      let body = '';
      if (/version\.json/.test(u)) body = await r.text().catch(() => '');
      log('RES', r.status(), u.replace(URL0, '/'), 'sw=' + r.fromServiceWorker(), 'age=' + (h['age'] ?? '-'), 'xcache=' + (h['x-cache'] ?? '-'), body.trim());
    }
  });
  page.on('framenavigated', (f) => f === page.mainFrame() && log('NAV', f.url().replace(URL0, '/')));
  await page.goto(URL0);
  const script = () => page.evaluate(() => ([...document.scripts].map((s) => s.src).find((s) => /assets\/index-/.test(s)) || '').split('/').pop()).catch(() => '?');
  log('script', await script(), 'controller', await page.evaluate(() => !!navigator.serviceWorker.controller));
  if (MODE === 'prime') {
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForTimeout(8000);
    await page.goto(URL0);
    await page.waitForTimeout(3000);
    log('primed script', await script(), 'controller', await page.evaluate(() => !!navigator.serviceWorker.controller));
  } else {
    const r = await Promise.race([
      page.waitForSelector('.bha-update, .bha-start__update', { timeout: 20000 }).then(async (e) => ({ hit: await e.getAttribute('class') })),
      page.waitForTimeout(20000).then(() => ({ hit: null })),
    ]).catch((e) => ({ hit: 'err ' + e.message }));
    log('SIGNAL', JSON.stringify(r));
    if (SHOT && r.hit) await page.screenshot({ path: path.join(SHOT, `${LABEL}.png`) });
    await page.waitForTimeout(4000);
    log('final script', await script(), 'url', page.url().replace(URL0, '/'));
    const latest = await page.evaluate(async () => (await (await fetch('version.json?t=' + Date.now(), { cache: 'no-store' })).json()).build).catch(() => '?');
    log('latest(busted)', latest);
  }
  await ctx.close();
})().catch((e) => { console.error(e); process.exit(1); });
