// C.548 proof (마른 몸 폐기 — 속공 적도 덩치 종이인형·이름 호로, GDD 15-5 v6.218): 1배 3장.
// 01 PC 전투 — 물 속공 적 = 덩치(파랑) '호로' / 02 PC 적 도감 — 속성마다 호로 3장(모두 덩치) / 03 폰 적 도감
// 실행: node scripts/c548-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c548'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ab = () => ({ both: 1, trait: 0, stat: 0, none: 0 });
const DEX = {};
for (const el of ['normal', 'water', 'fire', 'kyo']) for (const p of ['basic', 'swift', 'sturdy']) DEX[`${el}-${p}`] = { seen: 2, kills: 1, absorbs: ab(), where: 'ground:outskirts', firstAt: 1 };

async function seed(page, url) {
  await page.goto(`${url}?test=1`);
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async (dex) => {
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
    s.enemyDex = dex;
    slots.writeSlotSave(store, s, 1);
    slots.touchSlot(store, 1, now);
  }, DEX);
  await page.goto(`${url}?test=1`);
  await wait(1500);
  const cont = page.getByRole('button', { name: '이어하기' });
  if (await cont.count()) await cont.click({ timeout: 5000 });
  await wait(2500);
}

async function openTest(page, tabName) {
  await page.getByRole('button', { name: /더보기/ }).first().click({ timeout: 3000 });
  await wait(400);
  await page.getByRole('button', { name: '테스트', exact: true }).first().click({ timeout: 3000 });
  await wait(700);
  await page.locator('.bha-test-page .bha-viewtitle, .bha-test-page [aria-haspopup]').first().click({ timeout: 2000 }).catch(() => {});
  await wait(300);
  await page.getByRole('option', { name: tabName }).or(page.getByRole('menuitemradio', { name: tabName })).or(page.getByRole('button', { name: tabName })).first().click({ timeout: 3000 });
  await wait(600);
}

async function battleShot(browser, url, F) {
  const page = await (await browser.newContext(PC)).newPage();
  page.on('pageerror', (e) => F.errors.push(`battle: ${e.message}`));
  await seed(page, url);
  await openTest(page, '바로 전투');
  await page.getByRole('button', { name: '전투 들어가기' }).first().click({ timeout: 3000 });
  await wait(800);
  await page.locator('[aria-label="적 종류"]').filter({ visible: true }).first().click({ timeout: 3000 });
  await wait(300);
  F.arenaOptions = await page.evaluate(() => [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent.trim()).slice(0, 12));
  await page.getByRole('option', { name: '호로(물 속성)', exact: true }).nth(1).click({ timeout: 3000 });
  await wait(300);
  const ok = page.getByRole('button', { name: '확인', exact: true }).filter({ visible: true });
  if (await ok.count()) await ok.last().click({ timeout: 3000 });
  await page.waitForFunction(() => !!window.__bhaCombat && window.__bhaCombat.tick > 5, null, { timeout: 15000 });
  await wait(2500);
  F.battle = await page.evaluate(() => ({ foeId: window.__bhaCombat.enemy?.def?.id ?? null, foeName: document.querySelector('.bha-v2foename__text')?.textContent ?? null, rigCanvas: !!document.querySelector('.bha-foe canvas.bha-rigcanvas') }));
  await page.screenshot({ path: path.join(OUT, '01-pc-battle-foe-name.png') });
  await page.context().close();
}

async function dexShot(browser, url, ctx, name, F, key) {
  const page = await (await browser.newContext(ctx)).newPage();
  page.on('pageerror', (e) => F.errors.push(`${key}: ${e.message}`));
  await seed(page, url);
  await page.locator('.bha-prop--book').first().click({ timeout: 4000 });
  await wait(800);
  await page.waitForFunction(() => !document.querySelector('.bha-toast'), null, { timeout: 12000 }).catch(() => {});
  await page.locator('.bha-viewtitle__btn').first().click();
  await wait(300);
  await page.locator('.bha-viewtitle__item', { hasText: '적 도감' }).click();
  await wait(800);
  F[key] = await page.evaluate(() => [...document.querySelectorAll('.bha-dexcard')].slice(0, 14).map((c) => c.textContent.replace(/\s+/g, ' ').trim()));
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  await page.context().close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const F = { errors: [] };
  try {
    await battleShot(browser, server.url, F);
  } catch (e) {
    F.errors.push(String(e && e.stack ? e.stack : e));
  }
  try {
    await dexShot(browser, server.url, PC, '02-pc-enemy-dex', F, 'pcDex');
    await dexShot(browser, server.url, PHONE, '03-phone-enemy-dex', F, 'phoneDex');
  } catch (e) {
    F.errors.push(String(e && e.stack ? e.stack : e));
  } finally {
    fs.writeFileSync(path.join(OUT, 'facts.json'), JSON.stringify(F, null, 1));
    console.log(JSON.stringify(F, null, 1));
    await browser.close();
    server.stop();
  }
})();
