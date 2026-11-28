// C.570 proof (GDD 14-8 v6.256 책장 [일러스트] [애니메이션] 다시 보기 탭): 1배 844×390.
// 01 일러스트 탭(빈 목록 안내 한 줄) · 02 호로 애니메이션 탭(탄생·진화 2번 본 것 + 못 간 단계 ??? · 각성·환생 ???, 사신 탄생 ???)
// 03 진화 다시 보기 재생 중(글줄·버튼 없음) · 04 사신 테스트 모드 애니메이션 탭(전부 열림 + 진화 쌍 고르기)
// 실행: node scripts/c570-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c570'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** 진화 2번(1→2→3단계)을 지나온 세이브를 슬롯 1에 쓰고 이어하기 */
async function seed(page, url, factionId, test) {
  const q = test ? '?test=1' : '';
  await page.goto(`${url}${q}`);
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async ({ factionId, test }) => {
    const g = await import('/src/game.ts');
    const ev = await import('/src/engine/evolution/evolution.ts');
    const tut = await import('/src/engine/tutorial.ts');
    const slots = await import('/src/saveSlots.ts');
    const tm = await import('/src/engine/testMode.ts');
    const b = await import('/src/engine/absorb/build.ts');
    const store = test ? tm.testStorage(localStorage) : localStorage;
    const now = Date.now();
    const s = g.newSaveData(factionId, now);
    s.name = '시험';
    s.gender = 'male';
    s.help.tutorialSeen = true;
    for (const id of tut.GUIDE_IDS) s.help.guides[id] = 'done';
    s.nest.hunger = 30;
    s.nest.condition = 90;
    while (s.build.slots.length < 4) s.build.slots.push(null);
    b.gainTrait(s.build, 't-water-a');
    for (let i = 0; i < 2; i++) {
      s.evolution.steps = ev.stepsNeeded(s.evolution);
      g.performEvolution(s, now + i);
    }
    slots.writeSlotSave(store, s, 1);
    slots.touchSlot(store, 1, now);
  }, { factionId, test });
  await page.goto(`${url}${q}`);
  await wait(1500);
  const cont = page.getByRole('button', { name: '이어하기' });
  if (await cont.count()) await cont.click({ timeout: 5000 });
  await wait(2500);
}

async function openBookTab(page, label) {
  await page.getByRole('button', { name: '책장' }).first().click({ timeout: 4000 });
  await wait(700);
  await page.locator('.bha-viewtitle__btn').first().click({ timeout: 3000 });
  await wait(300);
  await page.getByRole('option', { name: label }).click({ timeout: 3000 });
  await wait(700);
}

const cards = (page) => page.evaluate(() => [...document.querySelectorAll('.bha-dexgrid > *')].map((c) => (c.getAttribute('aria-label') || c.textContent || '').trim()).slice(0, 30));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { shots: [], errors: [], checks: {} };
  const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  try {
    {
      const page = await browser.newPage(PC);
      page.on('pageerror', (e) => proof.errors.push(e.message));
      await seed(page, srv.url, 'hollow', false);
      await openBookTab(page, '일러스트');
      proof.checks.illust = await cards(page);
      await shot(page, '01-illust-tab-empty');
      await page.locator('.bha-viewtitle__btn').first().click();
      await wait(300);
      await page.getByRole('option', { name: '애니메이션' }).click();
      await wait(900);
      proof.checks.animHollow = await cards(page);
      await shot(page, '02-hollow-anim-tab');
      const before = await page.evaluate(() => localStorage.length && JSON.stringify(Object.keys(localStorage)).length);
      await page.locator('.bha-gallery__anim--evolve:not(.is-unknown)').last().click();
      await wait(1300);
      proof.checks.replayUi = await page.evaluate(() => ({ cut: !!document.querySelector('[data-evolve-cut]'), buttons: [...document.querySelectorAll('[data-evolve-cut] button')].length, text: document.querySelector('[data-evolve-cut]')?.textContent?.trim() ?? null }));
      await shot(page, '03-evolve-replay-playing');
      await page.mouse.click(422, 195);
      await wait(800);
      proof.checks.afterTapBackToAnimTab = await page.evaluate(() => !!document.querySelector('.bha-gallery') && !document.querySelector('[data-evolve-cut]'));
      proof.checks.saveUntouched = before === (await page.evaluate(() => localStorage.length && JSON.stringify(Object.keys(localStorage)).length));
      await page.close();
    }
    {
      const page = await browser.newPage(PC);
      page.on('pageerror', (e) => proof.errors.push(e.message));
      await seed(page, srv.url, 'shinigami', true);
      await openBookTab(page, '애니메이션');
      proof.checks.animTestShinigami = (await cards(page)).length;
      await shot(page, '04-shinigami-test-mode-anim-all');
      await page.close();
    }
  } catch (e) {
    proof.errors.push(String(e && e.stack || e));
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    console.log(JSON.stringify(proof, null, 2));
    await browser.close();
    srv.stop();
  }
})();
