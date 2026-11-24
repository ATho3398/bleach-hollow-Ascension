// C.532 proof (혈·독 일반 진화 조건 — GDD 8-5 v6.164·v6.165 · 허무형 몸의 가방 블록 이름): PC 844×390 + 폰 796×384, 1배, 6장.
// PC = 호로: 01 도감 혈 4단계 진화 조건 · 02 도감 독 4단계 진화 조건 · 03 가방 슬롯 탭(호로 허무·물리 나다 = 적막 블록)
// 폰 = 사신: 04 도감 혈 · 05 도감 독 · 06 가방 슬롯 탭(사신 허무·특수 공화 = 낙화 블록)
// 실행: node scripts/c532-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c532'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** 세이브를 슬롯 1에 쓰고 이어하기. build = 세이브를 고치는 코드(브라우저 안, s·m·now) */
async function seed(page, url, factionId, build) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async ({ factionId, build }) => {
    const m = { g: await import('/src/game.ts'), tut: await import('/src/engine/tutorial.ts'), tm: await import('/src/engine/testMode.ts') };
    const slots = await import('/src/saveSlots.ts');
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
    slots.writeSlotSave(localStorage, s, 1);
    slots.touchSlot(localStorage, 1, now);
  }, { factionId, build });
  await page.goto(url);
  await wait(1500);
  const cont = page.getByRole('button', { name: '이어하기' });
  if (await cont.count()) await cont.click({ timeout: 5000 });
  await wait(4500);
}

/** 도감에서 진화체 카드를 열고 조건 문구를 읽는다 */
async function dexShot(page, formId, factionId, name, F, key) {
  await page.locator('button[aria-label="책장"]').first().click({ timeout: 4000 });
  await wait(1200);
  const formName = await page.evaluate(async ({ formId, factionId }) => {
    const fd = await import('/src/data/evolution/index.ts');
    return fd.formName(fd.getForm(formId), factionId);
  }, { formId, factionId });
  await page.evaluate((n) => {
    const card = [...document.querySelectorAll('.bha-dexcard')].find((c) => c.querySelector('.bha-dexcard__name')?.textContent === n);
    card?.scrollIntoView({ block: 'center' });
  }, formName);
  await wait(400);
  await page.locator('.bha-dexcard', { hasText: formName }).first().click({ timeout: 4000 });
  await wait(900);
  F[key] = { formId, name: formName, body: await page.locator('.bha-mddetail__body').first().innerText().catch(() => null) };
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

/** 가방 슬롯 탭: 장착 칸·가진 블록 이름 */
async function bagShot(page, name, F, key) {
  await page.locator('button[aria-label="가방"]').first().click({ timeout: 4000 });
  await wait(1000);
  await page.getByRole('tab', { name: '슬롯' }).or(page.getByRole('button', { name: '슬롯', exact: true })).first().click({ timeout: 4000 });
  await wait(800);
  F[key] = await page.evaluate(() => ({
    cells: [...document.querySelectorAll('.bha-sgcell__name')].map((x) => x.textContent),
    owned: [...document.querySelectorAll('.bha-sgown .bha-itemcard__name, .bha-sgown [class*="name"]')].map((x) => x.textContent),
  }));
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

const DEX = `
  m.tm.fillAllUnlocked(s);
  m.tm.setForm(s, 't4:blood:physical');
  s.formDex = ['t2:base', 't3:water', 't4:blood:physical', 't4:poison:special'];
`;
/** 허무형 몸 + 허무 블록 장착·물 블록 보유 */
const VOID_BODY = `
  m.tm.fillAllUnlocked(s);
  m.tm.setForm(s, 'h4:void');
  while (s.build.slots.length < 4) s.build.slots.push(null);
  s.build.slots = ['t-kyo', 't-water-a', null, null];
  s.build.owned = ['t-kyo', 't-water-a', 't-fire-a'];
  s.build.equipOrder = ['t-kyo', 't-water-a'];
  s.build.enhance = { kyo: 10, water: 2, fire: 1 };
`;

async function run(browser, url, ctxOpt, factionId, names, F, key) {
  const ctx = await browser.newContext(ctxOpt);
  let page = await ctx.newPage();
  page.on('pageerror', (e) => F.errors.push(`${key}: ${e.message}`));
  await seed(page, url, factionId, DEX);
  await dexShot(page, 't4:blood:physical', factionId, names[0], F, `${key}DexBlood`);
  await page.close();
  page = await ctx.newPage();
  page.on('pageerror', (e) => F.errors.push(`${key}: ${e.message}`));
  await seed(page, url, factionId, DEX);
  await dexShot(page, 't4:poison:special', factionId, names[1], F, `${key}DexPoison`);
  await page.close();
  page = await ctx.newPage();
  page.on('pageerror', (e) => F.errors.push(`${key}: ${e.message}`));
  await seed(page, url, factionId, VOID_BODY);
  await bagShot(page, names[2], F, `${key}Bag`);
  await ctx.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const F = { errors: [] };
  try {
    await run(browser, server.url, PC, 'hollow', ['01-pc-hollow-dex-blood-condition', '02-pc-hollow-dex-poison-condition', '03-pc-hollow-bag-void-body-block-name'], F, 'pc');
    await run(browser, server.url, PHONE, 'shinigami', ['04-phone-shinigami-dex-blood-condition', '05-phone-shinigami-dex-poison-condition', '06-phone-shinigami-bag-void-body-block-name'], F, 'phone');
  } catch (e) {
    F.errors.push(String(e && e.stack ? e.stack : e));
  } finally {
    fs.writeFileSync(path.join(OUT, 'facts.json'), JSON.stringify(F, null, 1));
    console.log(JSON.stringify(F, null, 1));
    await browser.close();
    server.stop();
  }
})();
