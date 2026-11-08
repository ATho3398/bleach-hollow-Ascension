// R198: 흡수 화면 '노력치가 가득 찼다' 두 경우 캡처 — total(합계 36/36) · perstat(힘 18/18, 합계 33/36). 1배 844×390
const fs = require('node:fs'); const path = require('node:path'); const { chromium } = require('playwright');
const OUT = process.env.OUT; const URL0 = 'http://localhost:5398/';
async function skipTut(page) { for (let t = 0; t < 40 && (await page.locator('.bha-tut').count()); t++) { const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled])').filter({ visible: true }); if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {}); else await page.locator('.bha-lcd').first().click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(300); } }
async function patchSave(page, fn) { await page.evaluate((src) => { const f = new Function('t', src); for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); const raw = localStorage.getItem(k); if (!raw || !raw.includes('"runLog"')) continue; const data = JSON.parse(raw); const walk = (o) => { if (!o || typeof o !== 'object') return; if (o.nest && o.help && o.runLog) f(o); for (const v of Object.values(o)) walk(v); }; walk(data); localStorage.setItem(k, JSON.stringify(data)); } }, fn); }
async function reopen(page) { await page.reload(); await page.waitForTimeout(1500); const cont = page.getByRole('button', { name: '이어하기' }); if (await cont.count()) { await cont.first().click().catch(() => {}); await page.waitForTimeout(500); } const slot = page.locator('.bha-slot').first(); if (await slot.count()) { await slot.click().catch(() => {}); await page.getByRole('button', { name: '확인' }).click().catch(() => {}); await page.waitForTimeout(1500); } await skipTut(page); }
const vis = (loc) => loc.filter({ visible: true });
const EV = { total: 'Object.assign(t.evolution.ev, { hp: 3, atk: 13, int: 11, def: 3, spr: 3, spd: 3 });', perstat: 'Object.assign(t.evolution.ev, { hp: 3, atk: 18, int: 3, def: 3, spr: 3, spd: 3 });' };
async function toAbsorb(page) {
  await page.locator('.bha-prop--outside').first().click({ timeout: 4000 }); await page.waitForTimeout(1200);
  await page.locator('.bha-worldmap [data-place="adventure"]').click({ timeout: 4000 }); await page.waitForTimeout(1500);
  for (let i = 0; i < 6 && (await page.locator('.bha-lcd [data-dev-layer]').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
  await page.locator('.bha-lcd').getByRole('button', { name: '★1', exact: true }).click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(500);
  await page.locator('.bha-lcd').getByRole('button', { name: '출발' }).first().click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(1200);
  for (let t = 0; t < 240 && !(await page.locator('.bha-absorbpage').count()); t++) {
    const depart = vis(page.getByRole('button', { name: /출발$/ }));
    if (await depart.count()) { await depart.first().click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(800); continue; }
    const layerGo = vis(page.locator('.bha-lcd [data-dev-layer] button.bha-btn--primary')); const eat = vis(page.getByRole('button', { name: /하러 가기$/ }));
    if (await eat.count()) await eat.first().click({ timeout: 2000 }).catch(() => {}); else if (await layerGo.count()) await layerGo.first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(800);
  await page.locator('.bha-absorbpage [data-mode="stat"]').click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(400);
  return page.evaluate(() => ({ desc: [...document.querySelectorAll('.bha-absorbpage .bha-absorb__desc p')].map((p) => p.textContent), modes: [...document.querySelectorAll('.bha-absorbpage [data-mode]')].map((b) => `${b.textContent}${b.getAttribute('aria-disabled') ? '(흐림)' : ''}`), head: document.querySelector('.bha-absorbpage')?.innerText.split('\n').slice(0, 4).join(' / ') }));
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true }); const browser = await chromium.launch(); const proof = {};
  for (const FI of [0, 1]) for (const SC of ['total', 'perstat']) {
    const TAG = (FI === 0 ? 'hollow' : 'shinigami'); const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${URL0}?test=1`); await page.evaluate(() => localStorage.clear()); await page.goto(`${URL0}?test=1`); await page.waitForTimeout(1200);
    await page.getByRole('button', { name: '새로 시작' }).click(); await page.waitForTimeout(300);
    await page.locator('.bha-slot').first().click(); await page.getByRole('button', { name: '확인' }).click(); await page.waitForTimeout(300);
    await page.locator('.bha-species__card').nth(FI).click(); await page.waitForTimeout(300);
    await page.getByRole('button', { name: '시작', exact: true }).click(); await page.waitForTimeout(2000); await skipTut(page);
    const base = `t.help.guides = { ...t.help.guides, 'first-run': 'done', 'home-intro': 'done', 'first-run-room': 'done', 'birth': 'done', 'recover': 'done' }; t.evolution.tierIndex = 0; t.evolution.formId = null; t.evolution.formHistory = []; t.evolution.look = null; if (t.evolution.carry) for (const k of Object.keys(t.evolution.carry)) t.evolution.carry[k] = 0; t.activeExpedition = null; t.lastScreen = 'room';`;
    let info = null;
    for (let a = 0; a < 8; a++) {
      await patchSave(page, base + EV[SC]); await reopen(page);
      info = await toAbsorb(page);
      console.log(TAG, SC, a, JSON.stringify(info));
      if (info.desc.some((d) => d.includes('가득'))) break;
    }
    await page.screenshot({ path: path.join(OUT, `${TAG}-${SC}-absorb.png`) });
    // 상태 화면: 같은 노력치
    await patchSave(page, base + EV[SC]); await reopen(page); await page.keyboard.press('g'); await page.waitForTimeout(1200);
    const status = await page.evaluate(() => document.querySelector('[data-ev-total]')?.textContent ?? null);
    await page.locator('[data-ev-total]').first().scrollIntoViewIfNeeded().catch(() => {});
    await page.screenshot({ path: path.join(OUT, `${TAG}-${SC}-status.png`) });
    proof[`${TAG}-${SC}`] = { ...info, status, errors }; console.log(TAG, SC, 'status', status);
    await page.close();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2)); await browser.close();
})();
