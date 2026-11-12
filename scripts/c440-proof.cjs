// C.440 proof (GDD 5절 '캐릭터 스킨 분류' v6.044): 상태 화면 스킨 목록 없음 · 가방 > 스킨 > 캐릭터 대분류(진화체·특수·한정)·중분류(호로/사신)·상세 창 색 고르기.
// PC 844×390 + 폰 796×384, 1배. 실행: node scripts/c440-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c440'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PH = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function skipTut(page) {
  for (let t = 0; t < 40 && (await page.locator('.bha-tut').count()); t++) {
    const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled])').filter({ visible: true });
    if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
    else await page.locator('.bha-lcd').first().click({ timeout: 2000 }).catch(() => {});
    await wait(400);
  }
}
async function newGame(page, url, species) {
  const u = `${url}?test=1`;
  await page.goto(u);
  await page.evaluate(() => localStorage.clear());
  await page.goto(u);
  await wait(1200);
  await page.getByRole('button', { name: '새로 시작' }).click();
  await wait(300);
  await page.locator('.bha-slot').first().click();
  await page.getByRole('button', { name: '확인' }).click();
  await wait(300);
  await page.locator('.bha-species__card').nth(species).click();
  await wait(300);
  await page.getByRole('button', { name: '네', exact: true }).click();
  await wait(400);
  const nm = page.locator('[data-ident="name"]');
  if (await nm.count()) {
    await nm.fill('권영');
    await nm.press('Enter');
    await wait(300);
    await page.locator('.bha-ident__gender[data-gender="male"]').click();
    await page.locator('.bha-ident .bha-btn--primary').last().click();
  }
  await wait(2500);
  await skipTut(page);
}
async function back(page) {
  await page.locator('.bha-dev__btn[aria-label="취소"]').first().click({ timeout: 2000 }).catch(() => {});
  await wait(700);
}
async function openSkinChar(page) {
  await page.locator('.bha-prop--chest').first().click();
  await wait(1000);
  await skipTut(page);
  await page.locator('.bha-chest-page .bha-lcdpage__aside [role="tab"][data-tab="skin"]').first().click();
  await wait(500);
  await page.locator('[aria-label="스킨 종류"] [data-tab="character"]').first().click();
  await wait(500);
}
const tab = async (page, label, id) => { await page.locator(`[aria-label="${label}"] [data-tab="${id}"]`).first().click(); await wait(500); };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { errors: [], shots: [], facts: {} };
  let n = 1;
  try {
    for (const [dk, opts] of [['pc', PC], ['phone', PH]]) {
      const ctx = await browser.newContext(opts);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`${dk}: ${e.message.slice(0, 200)}`));
      const shot = async (name) => { const f = `${String(n++).padStart(2, '0')}-${dk}-${name}.png`; await page.screenshot({ path: path.join(OUT, f) }); proof.shots.push(f); };
      const facts = (proof.facts[dk] = {});
      const cards = () => page.evaluate(() => [...document.querySelectorAll('.bha-skinpick .bha-itemcard')].map((c) => c.textContent.replace(/\s+/g, ' ').trim()));
      const tabs = (label) => page.evaluate((l) => [...document.querySelectorAll(`[aria-label="${l}"] [data-tab]`)].map((b) => b.textContent.trim()), label);
      // 호로
      await newGame(page, server.url, 0);
      if (dk === 'pc') {
        await page.locator('.bha-room__chips > .bha-room__status').click();
        await wait(900);
        facts.statusSkinPanel = await page.locator('[aria-label="스킨"]').count();
        await shot('status-no-skin');
        await back(page);
      }
      await openSkinChar(page);
      facts.hollowCls = await tabs('스킨 분류');
      facts.hollowSub = await tabs('스킨 중분류');
      const subs = {};
      for (const id of ['tier1', 'tier2', 'tier3', 'tier4', 'tier5', 'transcendent']) { await tab(page, '스킨 중분류', id); subs[id] = await cards(); }
      facts.hollowCards = subs;
      await tab(page, '스킨 중분류', 'tier3');
      await shot('bag-form-ajuchas');
      await page.locator('.bha-skinpick .bha-itemcard').first().click();
      await wait(600);
      await page.locator('.bha-skinpick__chip').nth(2).click();
      await wait(500);
      facts.chips = await page.evaluate(() => [...document.querySelectorAll('.bha-skinpick__chip')].map((b) => `${b.dataset.look}${b.classList.contains('is-on') ? '*' : ''}`));
      await shot('detail-color-pick');
      await page.locator('[data-act="skin-equip"]').click();
      await wait(800);
      facts.wornAfterEquip = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => /slot|save/.test(k) && localStorage.getItem(k).includes('"skin"')) ?? '') || 'null')?.skin ?? null).catch(() => null);
      if (dk === 'pc') {
        await tab(page, '스킨 중분류', 'tier5');
        await shot('bag-form-arrancar');
      }
      await tab(page, '스킨 분류', 'special');
      facts.special = await cards();
      if (dk === 'pc') await shot('bag-special');
      await tab(page, '스킨 분류', 'limited');
      facts.limitedSub = await tabs('스킨 중분류');
      await shot('bag-limited-empty');
      await tab(page, '스킨 분류', 'form');
      // 사신
      if (dk === 'pc') {
        await newGame(page, server.url, 1);
        await openSkinChar(page);
        facts.shinigamiSub = await tabs('스킨 중분류');
        facts.shinigamiCards = await cards();
        await shot('bag-form-shinigami');
      }
      await ctx.close();
    }
  } catch (e) {
    proof.errors.push(String(e).slice(0, 300));
  } finally {
    await browser.close();
    server.stop?.();
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    console.log(JSON.stringify(proof, null, 2));
    process.exit(0);
  }
})();
