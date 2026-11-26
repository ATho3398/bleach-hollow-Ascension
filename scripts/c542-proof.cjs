// C.542 proof (도움말 '콤보 블록' 방향 문구, GDD 7절 v6.209): 1배 1장.
// 01 PC 도움말 → 용어 사전 '콤보 블록' — "블록 바에서 새 블록이 들어오는 쪽 끝에 …"
// 실행: node scripts/c542-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c542'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function seed(page, url, flip) {
  await page.goto(`${url}?test=1`);
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async (flip) => {
    const m = { g: await import('/src/game.ts'), tut: await import('/src/engine/tutorial.ts'), tm: await import('/src/engine/testMode.ts') };
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
    m.tm.setForm(s, 't4:fire:physical');
    slots.writeSlotSave(store, s, 1);
    slots.touchSlot(store, 1, now);
    if (flip) localStorage.setItem('bha-tray-flip', '1');
  }, flip);
  await page.goto(`${url}?test=1`);
  await wait(1500);
  const cont = page.getByRole('button', { name: '이어하기' });
  if (await cont.count()) await cont.click({ timeout: 5000 });
  await wait(2500);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const F = { errors: [] };
  try {
    const page = await (await browser.newContext(PC)).newPage();
    page.on('pageerror', (e) => F.errors.push(e.message));
    await seed(page, server.url, false);
    await page.getByRole('button', { name: /더보기/ }).first().click({ timeout: 4000 }).catch(() => {});
    await wait(500);
    await page.getByRole('button', { name: '도움말' }).first().click({ timeout: 4000 });
    await wait(700);
    const row = page.locator('.bha-mdrow').filter({ hasText: '콤보 블록' }).first();
    await row.scrollIntoViewIfNeeded();
    await row.click({ timeout: 4000 });
    await wait(600);
    F.body = await page.evaluate(() => document.querySelector('.bha-mddetail__body')?.textContent ?? null);
    F.title = await page.evaluate(() => document.querySelector('.bha-mddetail__title')?.textContent ?? null);
    await page.screenshot({ path: path.join(OUT, '01-pc-help-combo.png') });
  } catch (e) {
    F.errors.push(String(e && e.stack ? e.stack : e));
  } finally {
    fs.writeFileSync(path.join(OUT, 'facts.json'), JSON.stringify(F, null, 1));
    console.log(JSON.stringify(F, null, 1));
    await browser.close();
    server.stop();
  }
})();
