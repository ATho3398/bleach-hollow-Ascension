const fs = require('node:fs'); const path = require('node:path');
const { chromium } = require('playwright');
const C = require('/home/user/bleach-hollow-Ascension/scripts/c276-proof.cjs');
const L = require('./lib.cjs');
const OUT = process.env.OUT; fs.mkdirSync(OUT, { recursive: true });
const FIS = (process.env.FI ?? '0,1').split(',').map(Number);
const proof = {};
const vis = (loc) => loc.filter({ visible: true });
async function tutorial(page, log) {
  for (let t = 0; t < 80 && !(await C.snap(page))?.tut; t++) await page.waitForTimeout(250);
  let roomIdle = 0;
  for (let i = 0; i < 900; i++) {
    const s = await C.snap(page);
    if (!s) { await page.waitForTimeout(200); continue; }
    if (i % 15 === 0) { console.log('tut', i, JSON.stringify(s).slice(0, 160)); await page.screenshot({ path: process.env.OUT + '/_dbg.png' }); }
    if (s.tut) { roomIdle = 0; await page.waitForTimeout(200); await C.press(page, 'ok', 400); continue; }
    if (s.screen.includes('room')) {
      if (s.screen.includes('worldmap')) { await C.press(page, 'back', 800); continue; }
      if (++roomIdle > 40) break; await page.waitForTimeout(250); continue;
    }
    if (s.screen.includes('absorb')) { log.push('tutorial absorb: ' + (await page.locator('.bha-lcd').innerText()).replace(/\s+/g, ' ').slice(0, 200)); }
    if (s.dialogs > 0 && !s.screen.includes('battle')) await C.press(page, 'back', 300);
    else if (s.screen.includes('bha-exp')) await page.waitForTimeout(400);
    else await C.press(page, 'ok', 300);
  }
}
async function depart(page) {
  await page.locator('.bha-prop--outside').first().click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.locator('.bha-worldmap [data-place="adventure"]').click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(1500);
  for (let i = 0; i < 6 && (await page.locator('.bha-lcd [data-dev-layer]').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
  await page.locator('.bha-lcd').getByRole('button', { name: '★1', exact: true }).click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.locator('.bha-lcd').getByRole('button', { name: '출발' }).first().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(1200);
}
async function absorbInfo(page) {
  return page.evaluate(() => ({
    desc: [...document.querySelectorAll('.bha-absorbv2 .bha-absorb__desc p')].map((p) => p.textContent),
    foe: document.querySelector('.bha-absorbv2')?.innerText.replace(/\s+/g,' ').slice(0,160), modes: [...document.querySelectorAll('.bha-absorbv2 [data-mode]')].map((b) => `${b.dataset.mode}:${b.textContent}${b.getAttribute('aria-disabled') ? '(흐림)' : ''}`),
  }));
}
(async () => {
  const browser = await chromium.launch();
  for (const FI of FIS) {
    const TAG = FI === 0 ? 'hollow' : 'shinigami';
    const R = proof[TAG] = { log: [], absorbs: [], errors: [] };
    const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => R.errors.push(e.message));
    await C.newGame(page, L.URL0, FI);
    await tutorial(page, R.log);
    let s = await L.readSave(page); R.afterTutorial = s.ev; console.log(TAG, 'after tutorial', JSON.stringify(s.ev), s.screen);
    let n = 0, shotFull = false;
    for (let run = 0; run < 8 && !shotFull; run++) {
      await L.reopen(page); await L.skipTut(page, 10);
      await depart(page);
      for (let t = 0; t < 400; t++) {
        if (await page.locator('.bha-absorbv2--choose, .bha-absorbv2').count()) {
          await page.waitForTimeout(500);
          await page.screenshot({ path: path.join(OUT, `${TAG}-absorb-default.png`) });
          // 노력치 갈래 = '능력치 흡수/포식'(stat)
          await page.locator('.bha-absorbv2 [data-mode="stat"]').click({ timeout: 2000 }).catch(() => {});
          await page.waitForTimeout(300);
          const info = await absorbInfo(page); const sv = await L.readSave(page);
          const tot = Object.values(sv.exp?.ev ?? sv.ev).reduce((a, b) => a + b, 0);
          n++; R.absorbs.push({ n, run, enemy: sv.exp?.enemy, offer: sv.exp?.offer, evBefore: sv.exp?.ev, total: tot, ...info });
          console.log(new Date().toISOString().slice(11,19), TAG, n, sv.exp?.enemy, JSON.stringify(sv.exp?.offer), 'total', tot, info.desc.join(' / '), info.modes.join(','));
          await page.screenshot({ path: path.join(OUT, `${TAG}-absorb-${n}.png`) }); if (n >= 1) { shotFull = true; break; }
          await page.locator('.bha-absorbv2 [data-absorb-go]').click({ timeout: 2000 }).catch(() => {});
          await page.waitForTimeout(800);
          continue;
        }
        const s2 = await C.snap(page);
        if (s2?.screen.includes('room') && !(await page.locator('.bha-exp').count())) { console.log(TAG, 'back to room t=', t, new Date().toISOString()); break; }
        if (t % 40 === 0) { console.log(TAG, 'loop', t, JSON.stringify(s2).slice(0, 120)); await page.screenshot({ path: OUT + '/_dbg2.png' }); }
        const ret = vis(page.locator('.bha-lcd button').filter({ hasText: /^\s*귀환\s*$/ }));
        if (await ret.count()) { await ret.first().click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(1500); continue; }
        const dep = vis(page.getByRole('button', { name: /출발$/ }));
        if (await dep.count()) { await dep.first().click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(800); continue; }
        const layerGo = vis(page.locator('.bha-lcd [data-dev-layer] button.bha-btn--primary'));
        const eat = vis(page.getByRole('button', { name: /하러 가기$/ }));
        if (await eat.count()) await eat.first().click({ timeout: 2000 }).catch(() => {});
        else if (await layerGo.count()) await layerGo.first().click({ timeout: 2000 }).catch(() => {});
        else if (await page.locator('.bha-tut').count()) await L.skipTut(page, 5);
        await page.waitForTimeout(500);
      }
    }
    // 상태 화면 (가득 뒤)
    s = await L.readSave(page); R.atFull = { ev: s.exp?.ev ?? s.ev };
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await page.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
})();
