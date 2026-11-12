// C.435 proof (GDD 12-4 v6.037): Unknown;03398 조각 모델 새 크기(6×8·2/3) 방·전투 · 합체 창(조합 표시·이미 가진 조합 막힘 이유) ·
// 초월자 상태 화면 전투 기반 3택 · 기반 바꾼 뒤 빌드(가방 슬롯) 화면. PC 844×390 + 폰 796×384, 1배. 실행: node scripts/c435-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c435'));
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
      await newGame(page, server.url);
      // 0) 두 캐릭터 블록을 서로 다르게 (테스트 패널 특성 탭) — 기반 바꾸면 빌드가 바뀌는 걸 보이려고
      const step = async (label, fn) => { try { await fn(); } catch (e) { proof.errors.push(`${dk} ${label}: ${String(e).slice(0, 160)}`); if (process.env.DBG) await page.screenshot({ path: path.join(process.env.DBG, `${dk}-${label}.png`) }); await back(page); } };
      await step('block-hollow', () => setBlock(page, 2));
      await step('to-shinigami', () => toTrack(page, /^사신 트랙/));
      await step('block-shinigami', () => setBlock(page, 12));
      await step('to-hollow', () => toTrack(page, /^호로 트랙/));
      // 1) 지금 두 캐릭터 조합의 초월자를 먼저 얻고(테스트) → 합체 창 '이미 있음' 막힘
      await page.locator('[data-prop="hogyoku"]').first().click({ timeout: 3000 }).catch((e) => proof.errors.push(`${dk} hogyoku0: ${String(e).slice(0, 120)}`));
      await wait(1000);
      await skipTut(page);
      await page.locator('[data-sc="hogyoku-fusion"]').first().click({ timeout: 3000 }).catch(() => {});
      await wait(800);
      const comboName = await page.evaluate(() => (document.querySelector('.bha-hgpreview b')?.textContent ?? '').replace(/[「」]/g, '').trim());
      facts.comboName = comboName;
      await back(page); await back(page);
      await step('grant-combo', async () => {
        await openTest(page, '붕옥·초월자');
        await page.getByRole('button', { name: new RegExp(`^${comboName.replace(/[;]/g, '.')}`) }).first().click({ timeout: 3000 });
        await wait(2000);
        await back(page);
      });
      await step('to-hollow2', () => toTrack(page, /^호로 트랙/));
      await page.locator('[data-prop="hogyoku"]').first().click({ timeout: 3000 }).catch((e) => proof.errors.push(`${dk} hogyoku: ${String(e).slice(0, 120)}`));
      await wait(1200);
      await skipTut(page);
      await page.locator('[data-sc="hogyoku-fusion"]').first().click({ timeout: 3000 }).catch((e) => proof.errors.push(`${dk} fusion: ${String(e).slice(0, 120)}`));
      await wait(1000);
      facts.fusion = await page.evaluate(() => ({
        preview: document.querySelector('.bha-hgpreview')?.textContent ?? null,
        owned: document.querySelector('.bha-hgpreview')?.getAttribute('data-owned'),
        cond: document.querySelector('[data-cond="owned"]')?.textContent ?? null,
      }));
      await shot('fusion-combo-owned');
      // 2) Unknown;03398 얻기 → 초월자 방(새 크기)
      await back(page); await back(page);
      await openTest(page, '붕옥·초월자');
      await page.getByRole('button', { name: /^Unknown/ }).first().click({ timeout: 3000 });
      await wait(3000);
      await skipTut(page);
      facts.mosaic = await page.evaluate(() => [...document.querySelectorAll('img.bha-mosaic')].map((i) => { const r = i.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), nat: [i.naturalWidth, i.naturalHeight], scale: i.style.getPropertyValue('--art-scale') }; }));
      await shot('unknown-room');
      // 3) 상태 화면 전투 기반 3택
      await page.locator('.bha-room__chips > .bha-room__status').click();
      await wait(900);
      facts.basis = await page.evaluate(() => [...document.querySelectorAll('[aria-label="전투 기반"] .bha-seg__item')].map((b) => `${b.textContent}:${b.getAttribute('aria-selected')}`));
      await shot('status-basis');
      // 4) 키웠던 사신으로 → 상태 · 빌드 화면
      await page.locator('[data-sc="basis-shinigami"]').click({ timeout: 3000 }).catch((e) => proof.errors.push(`${dk} basis: ${String(e).slice(0, 120)}`));
      await wait(800);
      facts.basisAfter = await page.evaluate(() => document.querySelector('[aria-label="전투 기반"]')?.textContent ?? null);
      if (dk === 'pc') await shot('status-basis-shinigami');
      await back(page);
      await page.locator('[data-prop="chest"]').first().click({ timeout: 3000 }).catch((e) => proof.errors.push(`${dk} chest: ${String(e).slice(0, 120)}`));
      await wait(900);
      await page.getByRole('tab', { name: /^슬롯/ }).or(page.getByRole('button', { name: /^슬롯/ })).first().click({ timeout: 3000 }).catch((e) => proof.errors.push(`${dk} slots: ${String(e).slice(0, 120)}`));
      await wait(800);
      await shot('build-after-basis');
      await back(page);
      // 5) 전투 (바로 전투) — 조각 모델 몸
      if (dk === 'pc') {
        await openTest(page, '바로 전투');
        await page.getByRole('button', { name: '전투 시작' }).first().click({ timeout: 3000 }).catch((e) => proof.errors.push(`${dk} battle: ${String(e).slice(0, 120)}`));
        await wait(3500);
        facts.battleMosaic = await page.evaluate(() => [...document.querySelectorAll('img.bha-mosaic, canvas.bha-mosaic')].map((i) => { const r = i.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
        await shot('unknown-battle');
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
