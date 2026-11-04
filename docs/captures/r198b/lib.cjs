const URL0 = 'http://localhost:5398/';
async function skipTut(page, n = 40) {
  for (let t = 0; t < n && (await page.locator('.bha-tut').count()); t++) {
    const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled])').filter({ visible: true });
    if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
    else await page.locator('.bha-lcd').first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(300);
  }
}
async function readSave(page) {
  return page.evaluate(() => {
    let found = null;
    for (let i = 0; i < localStorage.length; i++) {
      const raw = localStorage.getItem(localStorage.key(i));
      if (!raw || !raw.includes('"runLog"')) continue;
      const walk = (o) => { if (!o || typeof o !== 'object' || found) return; if (o.nest && o.help && o.runLog) { found = o; return; } for (const v of Object.values(o)) walk(v); };
      walk(JSON.parse(raw));
    }
    if (!found) return null;
    const ax = found.activeExpedition;
    return { ev: found.evolution.ev, tier: found.evolution.tierIndex, guides: found.help.guides, exp: ax ? { phase: ax.phase, offer: ax.absorbOffer?.ev, enemy: ax.absorbOffer?.enemyId, ev: ax.evolution?.ev } : null, screen: found.lastScreen };
  });
}
async function patchSave(page, src) {
  await page.evaluate((src) => {
    const f = new Function('t', src);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i); const raw = localStorage.getItem(k);
      if (!raw || !raw.includes('"runLog"')) continue;
      const data = JSON.parse(raw);
      const walk = (o) => { if (!o || typeof o !== 'object') return; if (o.nest && o.help && o.runLog) f(o); for (const v of Object.values(o)) walk(v); };
      walk(data); localStorage.setItem(k, JSON.stringify(data));
    }
  }, src);
}
async function reopen(page) {
  await page.reload(); await page.waitForTimeout(1500);
  const cont = page.getByRole('button', { name: '이어하기' });
  if (await cont.count()) { await cont.first().click().catch(() => {}); await page.waitForTimeout(500); }
  const slot = page.locator('.bha-slot').first();
  if (await slot.count()) { await slot.click().catch(() => {}); await page.getByRole('button', { name: '확인' }).click().catch(() => {}); await page.waitForTimeout(1500); }
}
async function newGame(page, FI) {
  await page.goto(`${URL0}`); await page.evaluate(() => localStorage.clear());
  await page.goto(`${URL0}`); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '새로 시작' }).click(); await page.waitForTimeout(300);
  await page.locator('.bha-slot').first().click(); await page.getByRole('button', { name: '확인' }).click(); await page.waitForTimeout(300);
  await page.locator('.bha-species__card').nth(FI).click(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: '시작', exact: true }).click(); await page.waitForTimeout(2000);
}
const apps = (page) => page.evaluate(() => [...document.querySelectorAll('.bha-lcd .bha-app')].map((e) => e.className.replace('bha-app ', '')).join('|'));
module.exports = { URL0, skipTut, readSave, patchSave, reopen, newGame, apps };
