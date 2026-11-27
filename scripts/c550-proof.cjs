// C.550 proof (모험 먹이 = 바퀴당 0~1개, GDD 4-5 v6.225): 1배 2장.
// 01 PC 1바퀴 끝 창 — 먹이가 나온 바퀴(바퀴 굴림 낮은 시드): '이번 바퀴: … 먹이 1' / 02 PC 1바퀴 끝 창 — 안 나온 바퀴: 먹이 없음
// 원정은 엔진으로 1바퀴를 끝까지 돌려(전투는 이긴 것으로) 둥지 칸 선택에서 이어하기로 심는다.
// 실행: node scripts/c550-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c550'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** low = 먹이가 나오는 바퀴(바퀴 굴림 < 0.2), high = 안 나오는 바퀴(≥ 0.95) */
async function seed(page, url, kind) {
  await page.goto(`${url}?test=1`);
  await page.evaluate(() => localStorage.clear());
  const facts = await page.evaluate(async (kind) => {
    const m = { g: await import('/src/game.ts'), tut: await import('/src/engine/tutorial.ts'), tm: await import('/src/engine/testMode.ts'), f: await import('/src/engine/food.ts'), x: await import('/src/engine/expedition/index.ts') };
    const slots = await import('/src/saveSlots.ts');
    const store = m.tm.testStorage(localStorage);
    const now = Date.now();
    const s = m.g.newSaveData('hollow', now);
    s.name = '시험';
    s.gender = 'male';
    s.help.tutorialSeen = true;
    for (const id of m.tut.GUIDE_IDS) s.help.guides[id] = 'done';
    s.nest.hunger = 30;
    s.nest.condition = 90;
    m.tm.fillAllUnlocked(s);
    let seed = 1;
    while (kind === 'low' ? m.f.lapFoodRoll(seed, 1) >= 0.2 : m.f.lapFoodRoll(seed, 1) < 0.95) seed++;
    const exp = m.x.createExpedition({ factionId: s.factionId, seed, hunger: 20, condition: 80, deck: [], build: s.build, evolution: s.evolution });
    let wins = 0;
    for (let g = 0; g < 500 && exp.phase !== 'nest-choice' && exp.phase !== 'ended'; g++) {
      if (exp.phase === 'moving') m.x.advance(exp);
      else if (exp.phase === 'battle') {
        const b = m.x.startBattle(exp);
        b.enemy.hp = 0;
        b.status = 'won';
        b.finisher = { kind: 'basic-attack', traitId: null, element: null };
        m.x.finishBattle(exp, b);
        wins++;
      } else if (exp.phase === 'absorb') m.x.chooseRelease(exp);
      else if (exp.phase === 'rest') m.x.finishRest(exp);
      else if (exp.phase === 'event') m.x.resolveEvent(exp, null);
      else break;
      exp.hunger = 20;
      exp.hpFraction = 1;
    }
    m.x.drainEvents(exp);
    s.activeExpedition = m.x.serializeExpedition(exp, 1, now);
    slots.writeSlotSave(store, s, 1);
    slots.touchSlot(store, 1, now);
    return { seed, roll: m.f.lapFoodRoll(seed, 1), phase: exp.phase, wins, food: exp.foodLoot.map((a) => `${a.food}@${a.lap}`) };
  }, kind);
  await page.goto(`${url}?test=1`);
  await wait(1500);
  const cont = page.getByRole('button', { name: '이어하기' });
  if (await cont.count()) await cont.click({ timeout: 5000 });
  await wait(2500);
  await page.waitForFunction(() => !document.querySelector('.bha-toast'), null, { timeout: 12000 }).catch(() => {});
  return facts;
}

async function lapEndShot(browser, url, kind, file, F) {
  const page = await (await browser.newContext(PC)).newPage();
  page.on('pageerror', (e) => F.errors.push(`${kind}: ${e.message}`));
  const facts = await seed(page, url, kind);
  await page.getByRole('button', { name: /모험 이어하기/ }).first().click({ timeout: 4000 });
  await page.waitForSelector('.bha-lapend__gain', { timeout: 15000 });
  await wait(800);
  facts.gain = await page.evaluate(() => document.querySelector('.bha-lapend__gain')?.textContent ?? null);
  F[kind] = facts;
  await page.screenshot({ path: path.join(OUT, file) });
  await page.context().close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const F = { errors: [] };
  for (const job of [() => lapEndShot(browser, server.url, 'low', '01-pc-lapend-food1.png', F), () => lapEndShot(browser, server.url, 'high', '02-pc-lapend-food0.png', F)]) {
    try { await job(); } catch (e) { F.errors.push(String(e && e.stack ? e.stack : e).slice(0, 600)); }
  }
  fs.writeFileSync(path.join(OUT, 'facts.json'), JSON.stringify(F, null, 1));
  console.log(JSON.stringify(F, null, 1));
  await browser.close();
  server.stop();
})();
