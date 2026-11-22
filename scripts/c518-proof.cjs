// C.518 proof (사용자 2026-11-22 "-튜토리얼에 가면의 틈에서 어쩌구 이런거 빼 / -2번은 그게 맞지. 전투소모품은 2단겨 ㄱㄱ"): PC 844×390, 1배.
// 01 2단계(길리안) 모험 전투 [소모품] 버튼 · 02 2단계 장비 화면 소모품 칸 열림(옛 2단계 세이브 → 불러오면 해금 안내 한 번 뒤) · 03 1단계 가방 소모품 탭 전투 소모품 잠김(장비 탭엔 소모품 칸 없음) · 04 튜토리얼 치명상 카드 1장
// 실행: node scripts/c518-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c518'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** 세이브(src = s·g·x·tut·now 를 받는 함수 몸통)를 슬롯 1에 쓰고 이어하기 */
async function boot(page, url, src) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async (body) => {
    const g = await import('/src/game.ts');
    const x = await import('/src/engine/expedition/index.ts');
    const tut = await import('/src/engine/tutorial.ts');
    const slots = await import('/src/saveSlots.ts');
    const now = Date.now();
    const s = g.newSaveData('hollow', now);
    s.name = '시험';
    s.gender = 'male';
    s.help.tutorialSeen = true;
    for (const id of tut.GUIDE_IDS) s.help.guides[id] = 'done';
    s.nest.hunger = 80;
    s.nest.condition = 90;
    // eslint-disable-next-line no-new-func
    new Function('s', 'g', 'x', 'tut', 'now', body)(s, g, x, tut, now);
    slots.writeSlotSave(localStorage, s, 1);
    slots.touchSlot(localStorage, 1, now);
  }, src);
  await page.goto(url);
  await wait(1500);
  await page.getByRole('button', { name: '이어하기' }).first().click({ timeout: 5000 });
  await wait(2500);
}

const tier1 = (unlockNow) => `
  s.evolution.tierIndex = 1;
  s.tiles.unlocked = true;
  s.shared.unlocks.tiles = 0;
  ${unlockNow ? 's.shared.unlocks.battleItem = 0;' : "s.help.guides['unlock-battle-item'] = undefined; delete s.help.guides['unlock-battle-item'];"}
  s.shared.items['battle-haste'] = 3;
  s.shared.battleItem = 'battle-haste';
`;

async function openGear(page) {
  await page.locator('.bha-prop--chest').first().click({ timeout: 3000 });
  await wait(900);
  const tab = page.locator('[role="tab"][data-tab="gear"]').first();
  if (await tab.count()) { await tab.click(); await wait(500); }
}

const slotInfo = (page) => page.evaluate(() => {
  const b = document.querySelector('.bha-eqslot--battle');
  return b ? { cls: b.className, label: b.getAttribute('aria-label') } : null;
});

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const F = { errors: [] };
  try {
    const page = await (await browser.newContext(PC)).newPage();
    page.on('pageerror', (e) => F.errors.push(e.message.slice(0, 200)));
    const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`) });

    // 01 2단계 모험 전투: 바로 야생 전투 칸 앞에서 시작
    await boot(page, server.url, `${tier1(true)}
      const DECK = ['prey-nest-a', 'prey-nest-a', 'elite-den-a', 'env-fog', 'rest-a', 'prey-nest-b', 'env-ruin', 'elite-den-b'];
      const exp = x.createExpedition({ factionId: 'hollow', seed: 11, hunger: 80, condition: 90, risk: 10, deck: DECK, tierIndex: 1 });
      exp.wildCells = [1];
      s.activeExpedition = x.serializeExpedition(exp, 1, now);
      s.lastScreen = 'expedition';`);
    await page.waitForSelector('.bha-battle', { timeout: 30000 }).catch(() => F.errors.push('전투 화면 안 뜸'));
    await wait(1500);
    F.battleItemBtn = await page.evaluate(() => {
      const b = [...document.querySelectorAll('.bha-battle button')].find((e) => /소모품/.test(e.textContent ?? '') || e.dataset.act === 'item');
      return b ? { text: b.textContent.replace(/\s+/g, ' ').trim(), disabled: b.getAttribute('aria-disabled'), title: b.getAttribute('title') } : null;
    });
    await shot('01-tier2-battle-item-button');

    // 02 옛 2단계 세이브(소모품 칸 잠김) → 불러오면 열림 + 해금 안내 한 번 → 장비 화면 소모품 칸 열림
    await boot(page, server.url, tier1(false));
    F.unlockCards = [];
    for (let i = 0; i < 8; i++) {
      const c = await page.evaluate(() => { const l = [...document.querySelectorAll('.bha-tut')].pop(); return l ? { title: l.querySelector('.bha-tut__title, h2, h3')?.textContent ?? '', body: l.querySelector('.bha-tut__body')?.textContent ?? '' } : null; });
      if (!c) break;
      F.unlockCards.push(c);
      const go = page.locator('[data-dev-layer] button.bha-btn--primary:not([disabled])').filter({ visible: true });
      if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
      else await page.keyboard.press('Escape');
      await wait(700);
    }
    F.saveAfterLoad = await page.evaluate(() => { for (let i = 0; i < localStorage.length; i++) { const raw = localStorage.getItem(localStorage.key(i)); if (raw && raw.includes('"runLog"')) { const m = raw.match(/"unlock-battle-item":"[a-z]+"/); const u = raw.match(/"unlocks":\{[^}]*\}/); return { guide: m ? m[0] : null, unlocks: u ? u[0] : null }; } } return null; });
    await openGear(page);
    F.slotTier2 = await slotInfo(page);
    await shot('02-tier2-gear-slot-open');

    // 03 1단계: 가방 소모품 탭 '전투 소모품' 잠김 줄 그대로 (장비 탭은 장비 잠김 안내만 — 소모품 칸 없음)
    await boot(page, server.url, '');
    await openGear(page);
    F.slotTier1 = await slotInfo(page);
    F.gearTabTier1 = await page.evaluate(() => document.querySelector('.bha-chest-page .bha-lcdpage__col, .bha-chest-page')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 160));
    await page.locator('[role="tab"][data-tab="items"]').first().click(); await wait(400);
    await page.locator('[role="tab"][data-tab="battle"]').first().click(); await wait(400);
    F.bagBattleTier1 = await page.evaluate(() => document.querySelector('.bha-itemgrid')?.textContent.trim());
    await shot('03-tier1-bag-battle-locked');

    // 04 튜토리얼 치명상 장면 (게임과 같은 화면 함수 tutorialWoundView — 새 게임 튜토리얼 전체를 돌리지 않고 장면만)
    await page.goto(server.url);
    await wait(1500);
    await page.evaluate(async () => {
      const V = await import('/src/ui/guideView.ts');
      const B = await import('/src/ui/bha/battle.ts');
      const FA = await import('/src/data/factions/index.ts');
      const EF = await import('/src/engine/faction.ts');
      const faction = FA.getFaction('hollow');
      const root = document.querySelector('.bha-lcd .bha-stage').parentElement;
      window.__woundDone = false;
      V.tutorialWoundView(root, faction, B.heroArtOf(EF.roomOf(faction), 'hollow', 0), 0.6, 0.12, () => { window.__woundDone = true; });
    });
    await wait(1800);
    F.wound = await page.evaluate(() => { const l = [...document.querySelectorAll('.bha-tut')].pop(); return l ? l.textContent.replace(/\s+/g, ' ').trim() : null; });
    await shot('04-tutorial-wound-one-card');
    const go = page.locator('.bha-tut button.bha-btn--primary').filter({ visible: true });
    if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
    await wait(700);
    F.woundDoneAfterOneCard = await page.evaluate(() => window.__woundDone === true && !document.querySelector('.bha-tut'));
  } finally {
    fs.writeFileSync(path.join(OUT, 'facts.json'), JSON.stringify(F, null, 1));
    console.log(JSON.stringify(F, null, 1));
    await browser.close();
    server.stop();
  }
})();
