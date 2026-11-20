// C.510 proof (특식 상점 판매 삭제 · 패배 무르기 막기): PC 844×390, 1배.
// 01 상점 먹이 탭(특식 없음) · 04 새로고침 없이 [결과 보기] = 결과 화면(정산 1번) · 02 원정 전투 패배 결과 화면([결과 보기] 전) · 03 그 화면에서 새로고침 → 이어하기 = 방(빈사), 전투 재시작 없음
// 실행: node scripts/c510-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c510'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** 세이브를 슬롯 1에 쓰고 이어하기. build 본문이 세이브 s 를 고친다 (브라우저 안, m = 모듈) */
async function seed(page, url, build) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async (build) => {
    const m = {
      g: await import('/src/game.ts'), tut: await import('/src/engine/tutorial.ts'), x: await import('/src/engine/expedition/index.ts'),
      cb: await import('/src/engine/combat/index.ts'),
    };
    const slots = await import('/src/saveSlots.ts');
    const now = Date.now();
    const s = m.g.newSaveData('hollow', now);
    s.name = '시험';
    s.gender = 'male';
    s.help.tutorialSeen = true;
    for (const id of m.tut.GUIDE_IDS) s.help.guides[id] = 'done';
    s.nest.hunger = 30;
    s.nest.condition = 90;
    // eslint-disable-next-line no-new-func
    new Function('s', 'm', 'now', build)(s, m, now);
    slots.writeSlotSave(localStorage, s, 1);
    slots.touchSlot(localStorage, 1, now);
  }, build);
  await page.goto(url);
  await wait(1500);
  const cont = page.getByRole('button', { name: '이어하기' });
  if (await cont.count()) await cont.click({ timeout: 5000 });
  await wait(2500);
}

/** 슬롯 1 세이브 요약 */
const saveState = (page) => page.evaluate(async () => {
  const g = await import('/src/game.ts');
  const raw = g.loadSave(localStorage);
  return raw && { activeExpedition: raw.activeExpedition ? raw.activeExpedition.exp?.phase ?? 'yes' : null, collapsed: raw.nest?.collapsed, dead: raw.nest?.dead, lastRun: raw.runLog?.runs?.at(-1)?.outcome, runs: raw.runLog?.runs?.length, restarts: raw.runLog?.battleRestarts?.length };
});

// 전투 직전 원정 중간 저장 (체력 거의 0 — 확실히 진다)
const AT_BATTLE = `
  const DECK = ['prey-nest-a', 'prey-nest-a', 'elite-den-a', 'env-fog', 'rest-a', 'prey-nest-b', 'env-ruin', 'elite-den-b'];
  const exp = m.x.createExpedition({ factionId: 'hollow', seed: 11, hunger: 10, condition: 100, deck: DECK });
  for (let g = 0; exp.phase !== 'battle' && g < 500; g++) { if (exp.phase === 'moving') { m.x.placeAll(exp); m.x.advance(exp); } else if (exp.phase === 'rest') m.x.finishRest(exp); else break; }
  exp.hpFraction = 0.02;
  s.activeExpedition = m.x.serializeExpedition(exp, 1, now);
  s.lastScreen = 'expedition';
`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const F = {};
  try {
    const page = await (await browser.newContext(PC)).newPage();
    const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`) });

    // ── 01 상점 먹이 탭 ──
    await seed(page, server.url, 's.shared.tradeCoins = 5000;');
    await page.locator('.bha-prop--outside').first().click(); await wait(900);
    await page.locator('.bha-worldmap [data-place="market"]').first().click(); await wait(2000);
    await page.locator('.bha-market [data-spot="shop"]').first().click(); await wait(900);
    const foodTab = page.locator('[role="tab"]', { hasText: '먹이' }).first();
    if (await foodTab.count()) { await foodTab.click(); await wait(500); }
    F.shopFood = await page.evaluate(() => [...document.querySelectorAll('.bha-itemcard')].map((c) => c.textContent.replace(/\s+/g, ' ').trim()));
    await shot('01-shop-food-no-special');

    // ── 02 패배 결과 화면 ([결과 보기] 누르기 전) ──
    await seed(page, server.url, AT_BATTLE);
    await page.locator('.bha-battle-ov--lose').first().waitFor({ timeout: 90_000 });
    await wait(600);
    F.atDefeat = await saveState(page);
    await shot('02-defeat-result-before-click');

    // ── 03 새로고침 → 이어하기 ──
    await page.reload(); await wait(1500);
    const cont = page.getByRole('button', { name: '이어하기' });
    if (await cont.count()) await cont.click({ timeout: 5000 });
    await wait(3000);
    F.afterReload = await saveState(page);
    F.inBattle = await page.locator('.bha-battle-ov, .bha-battle').count();
    await shot('03-reload-continue-room-collapsed');

    // ── 04 새로고침 없이 [결과 보기] → 원정 결과 화면 (정산은 판정 순간 한 번만) ──
    await seed(page, server.url, AT_BATTLE);
    await page.locator('.bha-battle-ov--lose').first().waitFor({ timeout: 90_000 });
    await wait(600);
    await page.getByRole('button', { name: '결과 보기' }).first().click();
    await wait(1500);
    F.afterClick = await saveState(page);
    await shot('04-defeat-click-result-screen');
  } finally {
    fs.writeFileSync(path.join(OUT, 'facts.json'), JSON.stringify(F, null, 1));
    console.log(JSON.stringify(F, null, 1));
    await browser.close();
    server.stop();
  }
})();
