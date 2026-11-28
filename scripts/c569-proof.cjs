// C.569 proof (GDD 9-4 v6.256 모델 없는 펫 삭제): 가방 장비 탭 → 펫 목록, 1배 844×390.
// 01 호로 펫 목록(뼈 까마귀·그림자 박쥐 + 효과 미정 7종 — 모래 벌레·껍질 게 없음) · 02 사신 펫 목록(지옥나비 + 7종 — 슬롯 공유로 가진 그림자 박쥐도 안 보임)
// 실행: node scripts/c569-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c569'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function seed(page, url, factionId) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async (factionId) => {
    const g = await import('/src/game.ts');
    const tut = await import('/src/engine/tutorial.ts');
    const slots = await import('/src/saveSlots.ts');
    const fa = await import('/src/data/factions/index.ts');
    const now = Date.now();
    const s = g.newSaveData(factionId, now);
    s.name = '시험';
    s.gender = 'male';
    s.help.tutorialSeen = true;
    for (const id of tut.GUIDE_IDS) s.help.guides[id] = 'done';
    s.nest.hunger = 30;
    s.nest.condition = 90;
    s.shared.unlocks = { ...(s.shared.unlocks ?? {}), pet: now, gear: now };
    s.shared.pets.owned = {};
    for (const id of [...fa.getFaction(factionId).pets, 'pet-seek']) s.shared.pets.owned[id] = { laps: 12, gotAt: 1 };
    s.shared.pets.active = 'pet-gold';
    slots.writeSlotSave(localStorage, s, 1);
    slots.touchSlot(localStorage, 1, now);
  }, factionId);
  await page.goto(url);
  await wait(1500);
  const cont = page.getByRole('button', { name: '이어하기' });
  if (await cont.count()) await cont.click({ timeout: 5000 });
  await wait(2500);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { shots: [], errors: [], checks: {} };
  try {
    for (const [i, factionId] of [['01', 'hollow'], ['02', 'shinigami']]) {
      const page = await browser.newPage(PC);
      page.on('pageerror', (e) => proof.errors.push(e.message));
      await seed(page, srv.url, factionId);
      await page.getByRole('button', { name: '가방' }).first().click({ timeout: 4000 });
      await wait(700);
      await page.locator('.bha-chest-page [role="tab"][data-tab="gear"]').first().click().catch(() => {});
      await wait(500);
      await page.locator('.bha-eqright [role="tab"][data-tab="pet"]').click({ timeout: 3000 });
      await wait(500);
      proof.checks[factionId] = await page.evaluate(() => [...document.querySelectorAll('.bha-eqright [role="tabpanel"], .bha-eqright')].map((e) => e.textContent).join(' ').replace(/\s+/g, ' ').slice(0, 400));
      const name = `${i}-${factionId}-pet-list`;
      await page.screenshot({ path: path.join(OUT, `${name}.png`) });
      proof.shots.push(`${name}.png`);
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
