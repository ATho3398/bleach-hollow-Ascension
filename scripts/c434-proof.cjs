// C.434 proof (GDD 17절 '테스트 모드 보강' v6.036): 모델 고르기 목록(바스트로데/아란칼 표기·아란칼 기본) · 테스트 모드 방 붕옥 · 테스트 패널 초월자 버튼 · 초월자 스킨.
// PC 844×390 + 폰 796×384, 1배. 실행: node scripts/c434-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c434'));
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
async function newGame(page, url) {
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
  await page.locator('.bha-species__card').nth(0).click();
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
async function openTest(page) {
  await page.getByRole('button', { name: /더보기/ }).first().click({ timeout: 3000 });
  await wait(400);
  await page.getByRole('button', { name: '테스트', exact: true }).first().click({ timeout: 3000 });
  await wait(700);
}

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
      await newGame(page, server.url);
      // 1) 테스트 모드 방 — 붕옥 보임
      facts.hogyokuInRoom = await page.evaluate(() => [...document.querySelectorAll('[data-prop], [class*="hogyoku"]')].filter((e) => /hogyoku/.test(e.className + (e.dataset.prop ?? ''))).length);
      await shot('room-hogyoku');
      // 2) 상태 화면 모델 목록
      await page.locator('.bha-room__chips > .bha-room__status').click();
      await wait(900);
      facts.looks = await page.evaluate(() => [...document.querySelectorAll('[aria-label="스킨"] [data-skin]')].map((b) => `${b.dataset.lookGroup ?? '-'}:${b.textContent.trim()}`));
      const pick = page.locator('[aria-label="스킨"] [data-skin="tier:5:f"]');
      await pick.scrollIntoViewIfNeeded();
      await wait(300);
      if (dk === 'pc') await shot('status-model-list');
      await pick.click();
      await wait(600);
      await shot('status-arrancar-f-picked');
      // 3) 초월자 스킨(태초) 입힌 모습 — 목록에서 고르고 방으로
      if (dk === 'pc') {
        const tr = page.locator('[aria-label="스킨"] [data-skin="transcendent:zero-sage"]');
        await tr.scrollIntoViewIfNeeded();
        await tr.click();
        await wait(500);
        await back(page);
        await wait(1200);
        await shot('room-wearing-zero-sage');
        const mz = page.locator('[aria-label="스킨"] [data-skin="transcendent:rift-wanderer"]');
        await page.locator('.bha-room__chips > .bha-room__status').click();
        await wait(900);
        await mz.scrollIntoViewIfNeeded();
        await mz.click();
        await wait(500);
        await back(page);
        await wait(1500);
        await shot('room-wearing-rift-mosaic');
      } else {
        await back(page);
        await wait(800);
      }
      // 4) 테스트 패널 붕옥·초월자 탭
      await openTest(page);
      await page.locator('.bha-test-page .bha-viewtitle, .bha-test-page [aria-haspopup]').first().click({ timeout: 2000 }).catch(() => {});
      await wait(300);
      await page.getByRole('option', { name: '붕옥·초월자' }).or(page.getByRole('menuitemradio', { name: '붕옥·초월자' })).or(page.getByRole('button', { name: '붕옥·초월자' })).first().click({ timeout: 3000 }).catch((e) => proof.errors.push(`${dk} tab: ${String(e).slice(0, 120)}`));
      await wait(600);
      await shot('test-panel-transcend');
      if (dk === 'pc') {
        // 태초 얻기 → 초월자 방
        await page.getByRole('button', { name: /^태초/ }).first().click({ timeout: 3000 });
        await wait(2500);
        facts.afterGrant = await page.evaluate(() => document.querySelector('.bha-room__name')?.textContent ?? null);
        await shot('granted-zero-sage-room');
      }
      await ctx.close();
    }
  } catch (e) {
    proof.errors.push(String(e).slice(0, 400));
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close();
    server.stop?.();
    console.log(JSON.stringify(proof, null, 1));
    process.exit(0);
  }
})();
