// C.387 proof (GDD 234장 1·3 · 235장, 코딩266): ① 가방 약으로 상태이상이 풀리면 알림 '쇠약이 풀렸다' ② 같은 먹이 3번째 거절 말풍선 ③ 방 먹이 카드 새 값(3유형). PC 844×390 1배.
// 쓰기: node scripts/c387-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs/captures/c387'));
const VIEW = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
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
    const page = await browser.newPage(VIEW);
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
    await testGame(page);
    // 튜토리얼 끝 · 먹이 여러 종 · 쇠약 + 링거 · 고기(basic) 방금 2개 먹임(같은 먹이 한도)
    facts.patch = await patch(page, `for (const k of Object.keys(t.help.guides)) t.help.guides[k] = 'done'; t.idlePending = null; if (t.runLog.runs.length === 0) t.runLog.runs.push({ runId: 1, laps: 1, outcome: 'returned', gained: [], lost: [], endReason: 'tutorial-clear', seed: 1, factionId: t.factionId, gainedTraits: [], lostTraits: [], riskPeak: 0, breakthrough: false, tutorial: true }); t.lastSeenAt = Date.now(); t.activeExpedition = null;
      if (t.shared) Object.assign(t.shared.food, { basic: 3, sushi: 2, roast: 1, hearty: 1, fizz: 1, mushroom: 1, feast: 1, tonic: 1, elixir: 1, relic: 1, snack: 2, scrap: 1 });
      if (t.shared) t.shared.items['med-iv'] = 1;
      Object.assign(t.nest, { hunger: 60, condition: 50, weakened: true, collapsed: false, hpFraction: 0.5, careRequest: null, feedCount: 0, lastFedAt: 0, foodStreak: { basic: { count: 2, at: Date.now() } } });
      return 1;`);
    await page.goto(`${BASE}?test=1`); await page.waitForTimeout(1500);
    await page.getByRole('button', { name: '이어하기' }).click().catch(() => {}); await page.waitForTimeout(1800);
    await skipTut(page);
    for (let i = 0; i < 3 && (await page.locator('.bha-confirm').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
    // ③ 먹이 카드 새 값
    await page.locator('.bha-homedock__carebtn--feed').first().click();
    await page.waitForTimeout(600);
    facts.cards = await texts(page, '.bha-homedock__food');
    await page.screenshot({ path: path.join(OUT, '03-food-cards.png') });
    // ② 고기 3번째 → 거절 말풍선
    await page.locator('.bha-homedock__food[data-food="basic"]').first().click();
    await page.waitForTimeout(500);
    facts.refuseBubble = await texts(page, '.bha-room__bubble, .bha-bubble, [class*="bubble"]');
    await page.screenshot({ path: path.join(OUT, '02-same-food-refused.png') });
    // ① 가방 → 소모품 → 링거 사용 → '쇠약이 풀렸다'
    await page.waitForTimeout(2500);
    await page.locator('.bha-prop--chest').first().click();
    await page.waitForTimeout(900);
    const lcd = page.locator('.bha-lcd');
    await lcd.locator('.bha-lcdpage__aside [role="tab"]', { hasText: '소모품' }).first().click();
    await page.waitForTimeout(500);
    await lcd.locator('[role="tab"]', { hasText: /^약/ }).first().click();
    await page.waitForTimeout(500);
    await lcd.locator('.bha-itemcard', { hasText: '링거' }).first().click();
    await page.waitForTimeout(500);
    await page.locator('.bha-itemdialog').getByRole('button', { name: '사용' }).first().click();
    await page.waitForTimeout(500);
    facts.cureToast = await texts(page, '.bha-toast');
    await page.screenshot({ path: path.join(OUT, '01-status-cured-toast.png') });
    await page.close();
  } finally {
    await browser.close();
    server.stop();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify({ facts, errors }, null, 1));
  console.log(JSON.stringify({ facts, errors }, null, 1));
})();
