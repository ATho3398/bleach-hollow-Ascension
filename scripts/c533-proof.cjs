// C.533 proof (혈·독 블록 = 계열 없는 1종 — GDD 8-2 v6.161): PC 844×390(호로) + 폰 796×384(사신), 1배, 4장.
// 01·03 전투 바의 혈 블록 3체인 묶음 + 독 블록 2개 · 02·04 가방 슬롯 탭의 혈 블록·독 블록
// 실행: node scripts/c533-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c533'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** 세이브를 슬롯 1에 쓰고 이어하기 (test = 테스트 모드 저장소). build = 세이브를 고치는 코드(브라우저 안, s·m·now) */
async function seed(page, url, test, factionId, build) {
  const q = test ? '?test=1' : '';
  await page.goto(`${url}${q}`);
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async ({ test, factionId, build }) => {
    const m = { g: await import('/src/game.ts'), tut: await import('/src/engine/tutorial.ts'), tm: await import('/src/engine/testMode.ts') };
    const slots = await import('/src/saveSlots.ts');
    const store = test ? m.tm.testStorage(localStorage) : localStorage;
    const now = Date.now();
    const s = m.g.newSaveData(factionId, now);
    s.name = '시험';
    s.gender = 'male';
    s.help.tutorialSeen = true;
    for (const id of m.tut.GUIDE_IDS) s.help.guides[id] = 'done';
    s.nest.hunger = 30;
    s.nest.condition = 90;
    // eslint-disable-next-line no-new-func
    new Function('s', 'm', 'now', build)(s, m, now);
    slots.writeSlotSave(store, s, 1);
    slots.touchSlot(store, 1, now);
  }, { test, factionId, build });
  await page.goto(`${url}${q}`);
  await wait(1500);
  const cont = page.getByRole('button', { name: '이어하기' });
  if (await cont.count()) await cont.click({ timeout: 5000 });
  await wait(2500);
}

/** 3단계 몸 + 혈 블록·독 블록·물 블록 장착 */
const BUILD = `
  m.tm.fillAllUnlocked(s);
  m.tm.setForm(s, 't3:water');
  while (s.build.slots.length < 4) s.build.slots.push(null);
  s.build.slots = ['t-blood', 't-poison', 't-water-a', null];
  s.build.owned = ['t-blood', 't-poison', 't-water-a', 't-fire-c'];
  s.build.equipOrder = ['t-blood', 't-poison', 't-water-a'];
  s.build.enhance = { blood: 6, poison: 3, water: 2 };
`;

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

/** 테스트 패널 '바로 전투'로 허무 적과 전투에 들어간다 */
async function enterKyoBattle(page, F, factionId) {
  await openTest(page, '바로 전투');
  // 같은 이름 적이 속성마다 있어(짐승형 호로 …) 이름만으로는 못 고른다 — 같은 이름·같은 등급 안에서 허무 적의 순번으로 고른다
  const pick = await page.evaluate(async (factionId) => {
    const tm = await import('/src/engine/testMode.ts');
    const sc = await import('/src/data/schema.ts');
    const nameOf = (f) => sc.pickFaction(f.def.name, factionId);
    const foes = tm.testFoes().filter((f) => f.kind === 'enemy' && f.def.class === 'normal');
    const me = foes.find((f) => f.id === 'kyo-basic');
    const same = foes.filter((f) => nameOf(f) === nameOf(me));
    return { name: nameOf(me), nth: same.indexOf(me) };
  }, factionId);
  await page.locator('[aria-label="상대"]').first().click({ timeout: 3000 });
  await wait(400);
  await page.locator('.bha-pick__list [role="option"]').filter({ hasText: new RegExp(`^${pick.name}$`) }).nth(pick.nth).click({ timeout: 3000 });
  await wait(400);
  await page.getByRole('button', { name: '전투 들어가기' }).first().click({ timeout: 3000 });
  await wait(800);
  const ok = page.getByRole('button', { name: '확인', exact: true }).filter({ visible: true });
  if (await ok.count()) await ok.last().click({ timeout: 3000 });
  await page.waitForFunction(() => !!window.__bhaCombat && window.__bhaCombat.tick > 5, null, { timeout: 15000 });
  F.foe = await page.evaluate(() => ({ id: window.__bhaCombat.enemy.def.id, element: window.__bhaCombat.enemy.def.element }));
}

/** 전투를 멈춰 세우고 바에 혈 블록 3개 + 물 블록 + 독 블록 2개 */
const setBar = (page) => page.evaluate(() => {
  const s = window.__bhaCombat;
  s.enemy.maxHp *= 50; s.enemy.hp = s.enemy.maxHp; s.player.maxHp *= 3; s.player.hp = s.player.maxHp;
  s.spawnTimer = 1e9; s.enemy.attackTimer = 1e9; s.enemy.actionTimer = 1e9; s.params.timeLimitSeconds = 1e6; s.player.attackTimer = 1e9;
  const b = (traitId, element, family) => ({ uid: s.nextUid++, kind: 'skill', traitId, family, element });
  s.tray = [b('t-blood', 'blood', null), b('t-blood', 'blood', null), b('t-blood', 'blood', null), b('t-water-a', 'water', 'family-a'), b('t-poison', 'poison', null), b('t-poison', 'poison', null)];
});

const barFacts = (page) => page.evaluate(() => ({
  glyphs: [...document.querySelectorAll('.bha-block .bha-block__glyph')].map((g) => g.textContent),
  tray: window.__bhaCombat.tray.map((b) => b.traitId),
}));

async function battleShot(browser, url, ctxOpt, factionId, name, F, key) {
  const page = await (await browser.newContext(ctxOpt)).newPage();
  page.on('pageerror', (e) => F.errors.push(`${key}: ${e.message}`));
  await seed(page, url, true, factionId, BUILD);
  await enterKyoBattle(page, F, factionId);
  await setBar(page);
  await wait(700);
  F[`${key}Bar`] = await barFacts(page);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  await page.context().close();
}

async function bagShot(browser, url, ctxOpt, factionId, name, F, key) {
  const page = await (await browser.newContext(ctxOpt)).newPage();
  page.on('pageerror', (e) => F.errors.push(`${key}: ${e.message}`));
  await seed(page, url, false, factionId, BUILD);
  await wait(2500);
  await page.locator('button[aria-label="가방"]').first().click({ timeout: 4000 });
  await wait(1000);
  await page.getByRole('tab', { name: '슬롯' }).or(page.getByRole('button', { name: '슬롯', exact: true })).first().click({ timeout: 4000 });
  await wait(800);
  F[`${key}Bag`] = await page.evaluate(() => ({ cells: [...document.querySelectorAll('.bha-sgcell__name')].map((x) => x.textContent) }));
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  await page.context().close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const F = { errors: [] };
  try {
    await battleShot(browser, server.url, PC, 'hollow', '01-pc-hollow-blood-poison-blocks-in-bar', F, 'pc');
    await bagShot(browser, server.url, PC, 'hollow', '02-pc-hollow-bag-blood-poison-block', F, 'pc');
    await battleShot(browser, server.url, PHONE, 'shinigami', '03-phone-shinigami-blood-poison-blocks-in-bar', F, 'phone');
    await bagShot(browser, server.url, PHONE, 'shinigami', '04-phone-shinigami-bag-blood-poison-block', F, 'phone');
  } catch (e) {
    F.errors.push(String(e && e.stack ? e.stack : e));
  } finally {
    fs.writeFileSync(path.join(OUT, 'facts.json'), JSON.stringify(F, null, 1));
    console.log(JSON.stringify(F, null, 1));
    await browser.close();
    server.stop();
  }
})();
