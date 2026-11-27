// C.563 proof (GDD 9-4 v6.243 '펫 자리 = 기본 정지 모습 기준 고정', 사용자 "펫 끼면 호로 움직임 맞춰서 프레임이 한 2~3번 왼쪽으로 움직임"):
// 방에서 펫(pet-gold)을 낀 몸 4개(호로 덩치·길리안·아쥬커스·사신)마다 0.1초 간격 3초 동안 펫 translate 를 잰다 + 대기 동작 서로 다른 두 프레임 캡처.
// 실행: node scripts/c563-proof.cjs [저장 폴더] [before|after]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c563'));
const TAG = process.argv[3] || 'after';
const CTX = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true };
const BODIES = [
  { name: 'hollow-t1', faction: 'hollow', form: null, shots: true },
  { name: 'hollow-gillian', faction: 'hollow', form: 't2:base' },
  { name: 'hollow-adjuchas', faction: 'hollow', form: 't3:normal' },
  { name: 'shinigami-t1', faction: 'shinigami', form: null },
];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function seed(page, url, b) {
  await page.goto(`${url}?test=1`);
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async (b) => {
    const g = await import('/src/game.ts'); const tut = await import('/src/engine/tutorial.ts'); const tm = await import('/src/engine/testMode.ts');
    const pet = await import('/src/engine/pet.ts'); const slots = await import('/src/saveSlots.ts');
    const store = tm.testStorage(localStorage); const now = Date.now();
    const s = g.newSaveData(b.faction, now);
    s.name = '시험'; s.gender = 'male'; s.help.tutorialSeen = true;
    for (const id of tut.GUIDE_IDS) s.help.guides[id] = 'done';
    tm.fillAllUnlocked(s);
    if (b.form) tm.setForm(s, b.form, now);
    pet.grantPet(s.shared.pets, 'pet-gold', now);
    s.shared.pets.active = 'pet-gold';
    slots.writeSlotSave(store, s, 1); slots.touchSlot(store, 1, now);
    localStorage.setItem('bha-fullscreen-start', '0');
  }, b);
  await page.goto(`${url}?test=1`);
  await wait(1200);
  const c = page.getByRole('button', { name: '이어하기' });
  if (await c.count()) await c.evaluate((e) => e.click());
}

if (require.main === module) (async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const out = [];
  try {
    for (const b of BODIES) {
      const page = await (await browser.newContext(CTX)).newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await seed(page, srv.url, b);
      await page.waitForSelector('.bha-pet--buddy', { timeout: 8000 }).catch(() => {});
      // 펫이 붙은 직후부터 0.1초마다 3초 + 6초 지점 (맞추기 타이머 0~5초가 다 지난 뒤)
      const samples = [];
      for (let i = 0; i <= 30; i++) {
        samples.push(await page.evaluate(() => document.querySelector('.bha-pet--buddy')?.style.translate ?? null));
        await wait(100);
      }
      await wait(3000);
      const late = await page.evaluate(() => document.querySelector('.bha-pet--buddy')?.style.translate ?? null);
      // 캡처: 알림이 사라진 뒤 대기 동작 서로 다른 두 프레임(0.35초 차이) — 펫 translate 도 같이 적는다
      const shotAt = [];
      if (b.shots) {
        await page.waitForFunction(() => !document.querySelector('.bha-toast'), null, { timeout: 12000 }).catch(() => {});
        for (const f of ['a', 'b']) {
          await page.screenshot({ path: path.join(OUT, `${TAG}-idle-frame-${f}.png`) });
          shotAt.push(await page.evaluate(() => document.querySelector('.bha-pet--buddy')?.style.translate ?? null));
          await wait(350);
        }
      }
      const settled = samples.filter((v) => v && v !== 'none');
      const changes = settled.filter((v, i) => i > 0 && v !== settled[i - 1]).length;
      const row = { body: b.name, distinct: [...new Set(settled)], changesAfterFirstFit: changes, late, shotAt, errors };
      out.push(row);
      console.log(JSON.stringify(row));
      await page.context().close();
    }
  } finally {
    await browser.close();
    srv.stop();
  }
  fs.writeFileSync(path.join(OUT, `facts-${TAG}.json`), JSON.stringify(out, null, 2));
})();
