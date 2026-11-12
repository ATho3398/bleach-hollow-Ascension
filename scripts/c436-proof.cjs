// C.436 proof (GDD 12-4 v6.039): 도감 상세 새 조합(유하바하 = 특수+혼합) · 상태 화면 초월 특성 칸 · 기반 바꾼 뒤에도 초월 특성 유지 ·
// 전투 화면 블록 이름 = 기반 종족. PC 844×390 + 폰 796×384, 1배. 실행: node scripts/c436-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c436'));
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
  // 방에서 누르면 '처음 화면으로' 창 — 닫는다
  const no = page.getByRole('button', { name: '아니요', exact: true }).filter({ visible: true });
  if (await no.count()) { await no.first().click({ timeout: 2000 }).catch(() => {}); await wait(400); }
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

async function pick(page, aria, name) {
  await page.locator(`button[aria-label="${aria}"]`).first().click({ timeout: 3000 });
  await wait(300);
  await page.getByRole('option', { name }).first().click({ timeout: 3000 });
  await wait(200);
}
async function setBlock(page, nth) {
  await openTest(page, '블록');
  await page.locator('button[aria-label="블록 칸 1"]').first().click({ timeout: 3000 });
  await wait(300);
  await page.getByRole('option').nth(nth).click({ timeout: 3000 });
  await wait(200);
  await page.locator('button[aria-label="블록 칸 2"]').first().click({ timeout: 3000 });
  await wait(300);
  await page.getByRole('option').nth(nth + 3).click({ timeout: 3000 });
  await wait(200);
  await page.getByRole('button', { name: '적용' }).first().click({ timeout: 3000 });
  await wait(500);
  await back(page);
}
async function toTrack(page, name) {
  await openTest(page, '붕옥·초월자');
  await pick(page, '트랙', name);
  await page.getByRole('button', { name: '이 트랙으로' }).first().click({ timeout: 3000 });
  await wait(2000);
  await back(page);
  await skipTut(page);
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
      const step = async (label, fn) => { try { await fn(); } catch (e) { proof.errors.push(`${dk} ${label}: ${String(e).slice(0, 160)}`); if (process.env.DBG) await page.screenshot({ path: path.join(process.env.DBG, `${dk}-${label}.png`) }); await back(page); } };
      await newGame(page, server.url);
      // 사신 트랙 블록을 다르게 (기반 바꾸면 블록 이름이 사신 계열로 보이게)
      await step('to-shinigami', () => toTrack(page, /^사신 트랙/));
      await step('block-shinigami', () => setBlock(page, 12));
      await step('to-hollow', () => toTrack(page, /^호로 트랙/));
      // 1) 도감 상세 — 유하바하(미발견) 얻는 조합 = 특수 + 혼합
      await step('dex', async () => {
        await page.locator('[data-prop="hogyoku"]').first().click({ timeout: 3000 });
        await wait(1000);
        await skipTut(page);
        await page.locator('[data-sc="hogyoku-dex"]').first().click({ timeout: 3000 });
        await wait(800);
        facts.dexCards = await page.evaluate(() => [...document.querySelectorAll('[data-transcendent]')].map((c) => c.getAttribute('data-transcendent')));
        await page.locator('[data-transcendent="yhwach"]').first().click({ timeout: 3000 });
        await wait(700);
        facts.dexDetail = await page.evaluate(() => document.querySelector('.bha-dexmodal')?.textContent ?? null);
        await shot('dex-yhwach-combo');
        await back(page); await back(page); await back(page);
      });
      // 2) 태초(혼합+혼합) 얻기 → 초월자 트랙 상태 화면 초월 특성 칸
      await step('grant', async () => {
        await openTest(page, '붕옥·초월자');
        await page.getByRole('button', { name: /^태초/ }).first().click({ timeout: 3000 });
        await wait(3000);
        await skipTut(page);
      });
      const traitFacts = () => page.evaluate(() => ({
        trait: document.querySelector('[data-transcendent-traits]')?.textContent ?? null,
        basis: document.querySelector('[aria-label="전투 기반"]')?.textContent ?? null,
        slots: document.querySelector('[data-ability-slots]')?.textContent ?? null,
      }));
      await step('status', async () => {
        await page.locator('.bha-room__chips > .bha-room__status').click({ timeout: 3000 });
        await wait(900);
        await page.locator('[data-transcendent-traits]').first().scrollIntoViewIfNeeded({ timeout: 3000 });
        await wait(300);
        facts.statusBefore = await traitFacts();
        await shot('status-transcendent-trait');
        // 3) 키웠던 사신으로 바꾼 뒤에도 초월 특성 그대로
        await page.locator('[data-sc="basis-shinigami"]').click({ timeout: 3000 });
        await wait(800);
        await page.locator('[data-transcendent-traits]').first().scrollIntoViewIfNeeded({ timeout: 3000 });
        await wait(300);
        facts.statusAfter = await traitFacts();
        await shot('status-after-basis-shinigami');
        await back(page);
      });
      // 4) 빌드 화면(가방 슬롯) 초월 특성 칸 — PC 만
      if (dk === 'pc') await step('build', async () => {
        await page.locator('[data-prop="chest"]').first().click({ timeout: 3000 });
        await wait(900);
        await page.getByRole('tab', { name: /^슬롯/ }).or(page.getByRole('button', { name: /^슬롯/ })).first().click({ timeout: 3000 });
        await wait(800);
        facts.build = await page.evaluate(() => document.querySelector('[data-transcendent-traits]')?.textContent ?? null);
        await shot('build-transcendent-trait');
        await back(page);
      });
      // 5) 전투 화면 블록 이름 = 기반(사신) 종족
      await step('battle', async () => {
        await openTest(page, '바로 전투');
        await page.getByRole('button', { name: '전투 시작' }).first().click({ timeout: 3000 });
        await wait(6000);
        facts.blocks = await page.evaluate(() => [...document.querySelectorAll('[class*="bha-block"], [class*="blockbar"] *')].map((b) => (b.textContent ?? '').trim()).filter((t) => t && t.length <= 6).slice(0, 16));
        await shot('battle-block-names');
      });
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
