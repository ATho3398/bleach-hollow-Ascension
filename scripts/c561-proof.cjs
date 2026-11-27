// C.561 proof (GDD 8-9 · 14-4 v6.242, 사용자 2026-11-27 "수련장 들어오면, 카드형식으로 본능 수련, 아란칼화 수련, 훈련인형 띄우고 … 수련장 외에도 오른쪽 위에 골드랑 영옥 갯수 항상"):
// 01 PC 호로 수련장 카드 3장(수련권 칩) · 02 PC 본능 수련 목록(탄막 피하기 고름) · 03 PC 방 오른쪽 위 우라하라·골드·영옥 · 04 PC 시장 · 05 폰 사신 2단계 카드(잠긴 카드 2장).
// 1배. 실행: node scripts/c561-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c561'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PH = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadSave(page, url, o) {
  await page.goto(url);
  await wait(600);
  await page.evaluate(async (o) => {
    localStorage.clear();
    const g = await import('/src/game.ts');
    const F = await import('/src/data/factions/index.ts');
    const T = await import('/src/engine/tutorial.ts');
    const s = g.newSaveData(F.FACTIONS[o.fi].id, Date.now());
    s.name = '권영'; s.help.tutorialSeen = true;
    for (const id of [...T.GUIDE_IDS, 'first-absorb']) s.help.guides[id] = 'done';
    s.evolution.tierIndex = o.tier;
    s.training.tickets = 4; s.training.points = 18;
    s.shared.tradeCoins = 1234; s.shared.jade = 56;
    if (o.wanderer) g.meetWanderer(s, { seed: 1, runId: 1 }, { lap: 1, cell: 1, at: Date.now() });
    g.writeSave(localStorage, s);
  }, o);
  await page.goto(url);
  await wait(1200);
  await page.getByRole('button', { name: /이어하기/ }).first().click({ timeout: 5000 }).catch(() => {});
  await wait(1500);
}

const state = (page) => page.evaluate(() => ({
  screen: document.querySelector('[data-screen]')?.getAttribute('data-screen') ?? null,
  corner: (() => { const c = document.querySelector('.bha-corner'); return c ? { kind: c.dataset.kind, float: c.classList.contains('is-float'), inHead: c.parentElement?.tagName === 'HEADER', chips: [...c.children].map((x) => x.getAttribute('aria-label')) } : null; })(),
  cards: [...document.querySelectorAll('[data-hall]')].map((b) => ({ id: b.dataset.hall, name: b.querySelector('.bha-thall__name')?.textContent, locked: b.classList.contains('is-locked'), lock: b.querySelector('[data-hall-lock]')?.textContent ?? null, sub: b.querySelector('.bha-thall__sub')?.textContent })),
  games: [...document.querySelectorAll('[data-train-list] [data-game]')].map((b) => ({ id: b.dataset.game, text: b.textContent.trim(), selected: b.classList.contains('is-selected') })),
  stage: document.querySelector('[data-train-stage] .bha-sdg__info')?.innerText ?? null,
  actfx: !!document.querySelector('[data-actfx]'),
}));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const facts = { errors: [], shots: [], steps: [] };
  try {
    // PC 호로 4단계 (수련 열림) + 우라하라 와 있음
    {
      const ctx = await browser.newContext(PC);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => facts.errors.push(`pc: ${e.message}`));
      await loadSave(page, server.url, { fi: 0, tier: 3, wanderer: true });
      const shot = async (f) => { await page.mouse.move(1, 1); await wait(150); await page.screenshot({ path: path.join(OUT, f) }); facts.shots.push(f); };
      await page.locator('[data-prop="altar"]').first().click();
      await wait(900);
      facts.steps.push({ step: 'pc-hall', ...(await state(page)) });
      await shot('01-pc-hall-cards.png');
      await page.locator('[data-hall="train"]').click();
      await wait(800);
      await page.locator('[data-game="dodge"]').click();
      await wait(400);
      facts.steps.push({ step: 'pc-train-list', ...(await state(page)) });
      await shot('02-pc-train-list.png');
      await page.keyboard.press('Escape');
      await wait(600);
      await page.keyboard.press('Escape');
      await wait(900);
      facts.steps.push({ step: 'pc-room', ...(await state(page)) });
      await shot('03-pc-room-corner.png');
      await page.locator('[data-prop="outside"]').first().click();
      await wait(900);
      await page.locator('[data-prop="market"]').first().click();
      await wait(1000);
      facts.steps.push({ step: 'pc-market', ...(await state(page)) });
      await shot('04-pc-market.png');
      await ctx.close();
    }
    // 폰 사신 2단계 (본능·구상화 잠김)
    {
      const ctx = await browser.newContext(PH);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => facts.errors.push(`phone: ${e.message}`));
      await loadSave(page, server.url, { fi: 1, tier: 1, wanderer: false });
      await page.locator('[data-prop="altar"]').first().click();
      await wait(900);
      facts.steps.push({ step: 'phone-hall-locked', ...(await state(page)) });
      await page.screenshot({ path: path.join(OUT, '05-phone-hall-locked.png') });
      facts.shots.push('05-phone-hall-locked.png');
      await ctx.close();
    }
  } catch (e) {
    facts.errors.push(String((e && e.stack) || e));
  } finally {
    await browser.close();
    server.stop();
    fs.writeFileSync(path.join(OUT, 'facts.json'), JSON.stringify(facts, null, 2));
    console.log(JSON.stringify(facts, null, 2));
    process.exit(0);
  }
})();
