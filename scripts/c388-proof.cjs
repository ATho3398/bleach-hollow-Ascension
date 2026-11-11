// C.388 proof (GDD 236장, 코딩266): 소모품 상점 [팔기] 탭에서 장비 팔기(장비 상점 아닌 곳) — PC 844×390 · 폰 796×384, 1배.
// 쓰기: node scripts/c388-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs/captures/c388'));
const VIEW = { pc: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 }, ph: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true } };
let BASE = '';

async function skipTut(page) {
  for (let t = 0; t < 40 && (await page.locator('.bha-tut').count()); t++) {
    const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled])').filter({ visible: true });
    if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
    else await page.locator('.bha-lcd').first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
}
async function patch(page, src) {
  await page.goto(`${BASE}manifest.webmanifest`); await page.waitForTimeout(300);
  return page.evaluate((code) => {
    const f = new Function('t', code);
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const raw = localStorage.getItem(k);
      if (!raw || !raw.includes('"runLog"')) continue;
      const data = JSON.parse(raw);
      const walk = (o) => { if (!o || typeof o !== 'object') return; if (o.nest && o.help && o.runLog) out.push(f(o)); for (const v of Object.values(o)) walk(v); };
      walk(data);
      localStorage.setItem(k, JSON.stringify(data));
    }
    return out;
  }, src);
}
async function testGame(page) {
  const u = `${BASE}?test=1`;
  await page.goto(u); await page.evaluate(() => localStorage.clear()); await page.goto(u); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '새로 시작' }).click(); await page.waitForTimeout(300);
  await page.locator('.bha-slot').first().click(); await page.waitForTimeout(200);
  await page.getByRole('button', { name: '확인' }).click(); await page.waitForTimeout(300);
  await page.locator('.bha-species__card').nth(0).click(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: '시작', exact: true }).click(); await page.waitForTimeout(400);
  const nm = page.locator('[data-ident="name"]');
  if (await nm.count()) {
    await nm.fill('권영'); await page.locator('[data-ident="next"]').click(); await page.waitForTimeout(200);
    await page.locator('.bha-ident__gender').first().click(); await page.locator('[data-ident="done"]').click();
  }
  await page.waitForTimeout(1500);
  await skipTut(page);
}
const texts = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].map((t) => t.textContent.replace(/\s+/g, ' ').trim()), sel);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  BASE = server.url;
  const browser = await chromium.launch();
  const facts = {};
  const errors = [];
  try {
    for (const mode of ['pc', 'ph']) {
      const page = await browser.newPage(VIEW[mode]);
      page.on('pageerror', (e) => errors.push(`${mode}: ${e.message.slice(0, 160)}`));
      const F = (facts[mode] = {});
      await testGame(page);
      F.patch = await patch(page, `for (const k of Object.keys(t.help.guides)) t.help.guides[k] = 'done'; t.idlePending = null; if (t.runLog.runs.length === 0) t.runLog.runs.push({ runId: 1, laps: 1, outcome: 'returned', gained: [], lost: [], endReason: 'tutorial-clear', seed: 1, factionId: t.factionId, gainedTraits: [], lostTraits: [], riskPeak: 0, breakthrough: false, tutorial: true }); t.lastSeenAt = Date.now(); t.activeExpedition = null;
        if (t.shared) { Object.assign(t.shared.food, { basic: 4, relic: 1, feast: 2 }); t.shared.tradeCoins = 50; const g = t.shared.gear; for (const [i, grade] of ['rare', 'normal', 'epic'].entries()) g.items.push({ uid: 'g9' + i, kind: g.items[0]?.kind ?? 'weapon', grade, star: 1, stats: {}, special: null, plus: 0, gotAt: Date.now() }); }
        return 1;`);
      await page.goto(`${BASE}?test=1`); await page.waitForTimeout(1500);
      await page.getByRole('button', { name: '이어하기' }).click().catch(() => {}); await page.waitForTimeout(1800);
      await skipTut(page);
      for (let i = 0; i < 3 && (await page.locator('.bha-confirm').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
      await page.locator('.bha-prop--outside').first().click(); await page.waitForTimeout(900);
      await page.locator('.bha-worldmap [data-place="market"]').first().click(); await page.waitForTimeout(2000);
      await page.locator('.bha-market [data-spot="shop"]').first().click(); await page.waitForTimeout(900);
      await page.locator('[role="tab"]', { hasText: '팔기' }).first().click(); await page.waitForTimeout(500);
      await page.locator('[role="tab"]', { hasText: '장비' }).first().click(); await page.waitForTimeout(500);
      F.gold0 = await page.locator('.bha-shop__wallet').getAttribute('data-gold');
      F.cards0 = await texts(page, '.bha-itemcard');
      await page.screenshot({ path: path.join(OUT, `${mode}-sell-gear-in-consumable-shop.png`) });
      // 노말 장비 하나 판다 (확인 창 없음)
      await page.locator('.bha-itemcard.is-grade-normal').first().click(); await page.waitForTimeout(500);
      F.dialog = await texts(page, '.bha-itemdialog button');
      await page.locator('.bha-itemdialog').getByRole('button', { name: /골드 \+/ }).first().click(); await page.waitForTimeout(600);
      F.gold1 = await page.locator('.bha-shop__wallet').getAttribute('data-gold');
      F.cards1 = await texts(page, '.bha-itemcard');
      F.toasts = await texts(page, '.bha-toast');
      await page.close();
    }
  } finally {
    await browser.close();
    server.stop();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify({ facts, errors }, null, 1));
  console.log(JSON.stringify({ facts, errors }, null, 1));
})();
