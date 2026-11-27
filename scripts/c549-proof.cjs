// C.549 proof (우라하라 = 모험 중 마주침, GDD 5-5 v6.223): 1배 5장.
// 01 PC 모험 중 확인 창 '우라하라와 마주쳤습니다!' [확인 (n)] / 02 PC 방 칩(얼굴 + 15:00 근처) / 03 PC 시장 우라하라 + 칩 / 04 PC 칩 누름 → 우라하라 창 / 05 폰 방 칩
// 실행: node scripts/c549-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c549'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** 세이브를 심는다. mode 'meet' = 1바퀴 1번 칸에서 마주치는 원정을 이어하기로, 'here' = 우라하라가 3초 전에 와 있음 */
async function seed(page, url, mode) {
  await page.goto(`${url}?test=1`);
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async (mode) => {
    const m = { g: await import('/src/game.ts'), tut: await import('/src/engine/tutorial.ts'), tm: await import('/src/engine/testMode.ts'), w: await import('/src/engine/wanderer.ts'), x: await import('/src/engine/expedition/index.ts') };
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
    if (mode === 'here') s.shared.wanderer.visit = { at: now - 3000, runId: 0, tier: 3, stock: m.w.rollWandererStock(3, Math.random) };
    if (mode === 'meet') {
      let seed = 1;
      while (!m.w.rollWandererMeet(seed, 1, 1)) seed++;
      const exp = m.x.createExpedition({ factionId: s.factionId, seed, hunger: 20, condition: 80, deck: [], build: s.build, evolution: s.evolution });
      s.activeExpedition = m.x.serializeExpedition(exp, 1, now);
    }
    slots.writeSlotSave(store, s, 1);
    slots.touchSlot(store, 1, now);
  }, mode);
  await page.goto(`${url}?test=1`);
  await wait(1500);
  const cont = page.getByRole('button', { name: '이어하기' });
  if (await cont.count()) await cont.click({ timeout: 5000 });
  await wait(2500);
  await page.waitForFunction(() => !document.querySelector('.bha-toast'), null, { timeout: 12000 }).catch(() => {});
}

const chipFacts = (page) => page.evaluate(() => {
  const c = document.querySelector('[data-wanderer-chip]');
  if (!c) return null;
  const r = c.getBoundingClientRect();
  return { tag: c.tagName, text: c.textContent, label: c.getAttribute('aria-label'), face: !!c.querySelector('img.bha-wchip__face')?.complete, box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] };
});

async function meetShot(browser, url, F) {
  const page = await (await browser.newContext(PC)).newPage();
  page.on('pageerror', (e) => F.errors.push(`meet: ${e.message}`));
  await seed(page, url, 'meet');
  await page.getByRole('button', { name: /모험 이어하기/ }).first().click({ timeout: 4000 });
  await page.waitForSelector('.bha-wmeet', { timeout: 15000 });
  await wait(700);
  F.meet = await page.evaluate(() => ({ title: document.querySelector('.bha-wmeet .bha-modal__title')?.textContent, button: document.querySelector('.bha-wmeet .bha-btn')?.textContent }));
  await page.screenshot({ path: path.join(OUT, '01-pc-meet-confirm.png') });
  // 5초 뒤 자동 확인 → 창이 닫히고 걷기 이어짐, 칩(표시만)
  await page.waitForSelector('.bha-wmeet', { state: 'detached', timeout: 7000 });
  await wait(1200);
  F.meetAfter = { closed: !(await page.locator('.bha-wmeet').count()), chip: await chipFacts(page), visit: await page.evaluate(() => !!JSON.stringify(localStorage).includes('arrive')) };
  await page.screenshot({ path: path.join(OUT, '..', 'c549-walk-check.png') }).catch(() => {});
  // 전투가 열리면(표시만 칩) 칩·버튼 줄 위치만 기록 (캡처는 저장하지 않음)
  const battle = await page.waitForSelector('.bha-v2bar', { timeout: 45000 }).catch(() => null);
  if (battle) {
    await wait(2500);
    F.battle = { chip: await chipFacts(page), bar: await page.evaluate(() => { const r = document.querySelector('.bha-v2bar').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; }) };
    await page.screenshot({ path: path.join(OUT, '..', 'c549-battle-check.png') }).catch(() => {});
  }
  await page.context().close();
}

async function hereShots(browser, url, ctx, F, phone) {
  const page = await (await browser.newContext(ctx)).newPage();
  page.on('pageerror', (e) => F.errors.push(`here: ${e.message}`));
  await seed(page, url, 'here');
  await wait(600);
  const key = phone ? 'phoneRoom' : 'room';
  F[key] = await chipFacts(page);
  await page.screenshot({ path: path.join(OUT, phone ? '05-phone-room-chip.png' : '02-pc-room-chip.png') });
  if (phone) return page.context().close();
  // 월드맵 → 시장
  await page.locator('.bha-prop--outside').first().click({ timeout: 4000 });
  await wait(1500);
  F.worldmap = await chipFacts(page);
  await page.locator('[data-place="market"]').first().click({ timeout: 4000 });
  await wait(3500);
  F.market = await chipFacts(page);
  await page.screenshot({ path: path.join(OUT, '03-pc-market-wanderer.png') });
  await page.locator('[data-wanderer-chip]').first().click({ timeout: 3000 });
  await wait(900);
  F.shop = { chip: await chipFacts(page), title: await page.evaluate(() => document.querySelector('.bha-viewtitle, h1')?.textContent ?? null) };
  await page.screenshot({ path: path.join(OUT, '04-pc-chip-to-wanderer.png') });
  await page.context().close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const F = { errors: [] };
  for (const job of [() => meetShot(browser, server.url, F), () => hereShots(browser, server.url, PC, F, false), () => hereShots(browser, server.url, PHONE, F, true)]) {
    try { await job(); } catch (e) { F.errors.push(String(e && e.stack ? e.stack : e).slice(0, 600)); }
  }
  fs.writeFileSync(path.join(OUT, 'facts.json'), JSON.stringify(F, null, 1));
  console.log(JSON.stringify(F, null, 1));
  await browser.close();
  server.stop();
})();
