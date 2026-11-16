// C.468 proof (GDD v6.096 15-5): C.467 크기 축소 되돌림 — 방 혈쇄 이치고·아이젠·호로 4단계 + 전투 혈쇄 이치고. PC 844×390 1배
// 실행: node scripts/c468-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c468'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function skipTut(page) {
  for (let t = 0; t < 40 && (await page.locator('.bha-tut').count()); t++) {
    const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled])').filter({ visible: true });
    if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
    else await page.locator('.bha-lcd').first().click({ timeout: 2000 }).catch(() => {});
    await wait(400);
  }
}
async function newGame(page, url, card = 0) {
  const u = `${url}?test=1`;
  await page.goto(u); await page.evaluate(() => localStorage.clear()); await page.goto(u); await wait(1200);
  await page.getByRole('button', { name: '새로 시작' }).click(); await wait(300);
  await page.locator('.bha-slot').first().click();
  await page.getByRole('button', { name: '확인' }).click(); await wait(300);
  await page.locator('.bha-species__card').nth(card).click(); await wait(300);
  await page.getByRole('button', { name: '네', exact: true }).click(); await wait(400);
  const nm = page.locator('[data-ident="name"]');
  if (await nm.count()) {
    await nm.fill('권영'); await nm.press('Enter'); await wait(300);
    await page.locator('.bha-ident__gender[data-gender="male"]').click();
    await page.locator('.bha-ident .bha-btn--primary').last().click();
  }
  await wait(2500); await skipTut(page);
}
async function back(page) {
  await page.locator('.bha-dev__btn[aria-label="취소"]').first().click({ timeout: 2000 }).catch(() => {});
  await wait(700);
  const no = page.getByRole('button', { name: '아니요', exact: true }).filter({ visible: true });
  if (await no.count()) { await no.first().click({ timeout: 2000 }).catch(() => {}); await wait(400); }
}
async function openTest(page, tabName) {
  await page.getByRole('button', { name: /더보기/ }).first().click({ timeout: 3000 }); await wait(400);
  await page.getByRole('button', { name: '테스트', exact: true }).first().click({ timeout: 3000 }); await wait(700);
  await page.locator('.bha-test-page .bha-viewtitle, .bha-test-page [aria-haspopup]').first().click({ timeout: 2000 }).catch(() => {});
  await wait(300);
  await page.getByRole('option', { name: tabName }).or(page.getByRole('menuitemradio', { name: tabName })).or(page.getByRole('button', { name: tabName })).first().click({ timeout: 3000 });
  await wait(600);
}
async function toTranscendent(page, server, re) {
  await newGame(page, server.url, 0);
  await openTest(page, '붕옥·초월자');
  await page.getByRole('button', { name: re }).first().click({ timeout: 3000 });
  await wait(2500); await skipTut(page);
}
async function setMode(page, mode) {
  await page.locator('.bha-room__status').first().click({ timeout: 4000 }); await wait(1000);
  const seg = page.locator(`[data-sc="kit-mode-${mode}"]`).first();
  await seg.scrollIntoViewIfNeeded().catch(() => {});
  await seg.click({ timeout: 3000 }); await wait(1000);
}
const calm = (page) => page.evaluate(() => {
  const s = window.__bhaCombat;
  s.enemy.maxHp *= 50; s.enemy.hp = s.enemy.maxHp; s.player.maxHp *= 3; s.player.hp = s.player.maxHp;
  s.spawnTimer = 1e9; s.enemy.attackTimer = 1e9; s.enemy.actionTimer = 1e9; s.params.timeLimitSeconds = 1e6; s.player.attackTimer = 1e9; s.tray = [];
});
async function startBattle(page) {
  await openTest(page, '바로 전투');
  await page.getByRole('button', { name: '전투 들어가기' }).first().click({ timeout: 3000 }); await wait(800);
  const ok = page.getByRole('button', { name: '확인', exact: true }).filter({ visible: true });
  if (await ok.count()) await ok.last().click({ timeout: 3000 });
  await page.waitForFunction(() => !!window.__bhaCombat && window.__bhaCombat.tick > 5, null, { timeout: 15000 });
  await calm(page);
}
// 내 캐릭터 몸 높이(화면 px) = 그림 캔버스·이미지의 불투명 픽셀 세로 범위 × 표시 배율
const bodyHeight = (page, sel) => page.evaluate((sel) => {
  let best = null;
  for (const el of document.querySelectorAll(sel)) {
    if (el.closest('[hidden]')) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    let c = el;
    if (el.tagName === 'IMG') { c = document.createElement('canvas'); c.width = el.naturalWidth; c.height = el.naturalHeight; c.getContext('2d').drawImage(el, 0, 0); }
    let top = -1, bot = -1;
    try {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      for (let y = 0; y < c.height; y++) { for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 20) { if (top < 0) top = y; bot = y; break; } }
    } catch { /* */ }
    if (top < 0) continue;
    const h = Math.round((bot - top + 1) * r.height / c.height);
    if (!best || h > best.h) best = { h, box: [Math.round(r.width), Math.round(r.height)] };
  }
  return best;
}, sel);
const ROOM = '.bha-char canvas, .bha-char img';
const BATTLE = '.bha-unit--me canvas';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { errors: [], shots: [], heights: {} };
  const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  const step = async (name, fn) => { try { await fn(); } catch (e) { proof.errors.push(`${name}: ${String(e).slice(0, 300)}`); } };
  try {
    { // 혈쇄 이치고: 방 → 전투
      const ctx = await browser.newContext(PC); const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`ichigo: ${e.message.slice(0, 200)}`));
      await step('room-bloodchain', async () => {
        await toTranscendent(page, server, /^이치고/);
        await setMode(page, 'tybw'); await back(page); await wait(1500);
        proof.heights.roomBloodchain = await bodyHeight(page, ROOM);
        await shot(page, '01-room-bloodchain');
      });
      await step('battle-bloodchain', async () => {
        await startBattle(page); await wait(1500);
        proof.heights.battleBloodchain = await bodyHeight(page, BATTLE);
        await shot(page, '04-battle-bloodchain');
      });
      await ctx.close();
    }
    { // 아이젠 방
      const ctx = await browser.newContext(PC); const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`aizen: ${e.message.slice(0, 200)}`));
      await step('room-aizen', async () => {
        await toTranscendent(page, server, /^아이젠/); await wait(1000);
        proof.heights.roomAizen = await bodyHeight(page, ROOM);
        await shot(page, '02-room-aizen');
      });
      await ctx.close();
    }
    { // 호로 4단계 방 (세이브 직접 세팅)
      const ctx = await browser.newContext(PC); const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`hollow: ${e.message.slice(0, 200)}`));
      await step('room-hollow4', async () => {
        await page.goto(server.url); await wait(600);
        await page.evaluate(async () => {
          localStorage.clear();
          const g = await import('/src/game.ts');
          const s = g.newSaveData('hollow', Date.now());
          s.name = '권영'; s.help.tutorialSeen = true; s.lastSeenAt = Date.now();
          for (const id of ['first-run', 'first-run-room', 'birth', 'recover', 'home-intro', 'recover-cure', 'tile-intro', 'tile-plan', 'tile-draw', 'unlock-gear']) s.help.guides[id] = 'done';
          s.evolution.tierIndex = 3; s.evolution.formHistory = ['t2:base', 't3:fire', 't4:fire:physical']; s.evolution.formId = 't4:fire:physical';
          g.writeSave(localStorage, s);
        });
        await page.goto(server.url); await wait(1200);
        await page.getByRole('button', { name: /이어하기/ }).first().click({ timeout: 5000 }); await wait(2500);
        await skipTut(page);
        proof.heights.roomHollow4 = await bodyHeight(page, ROOM);
        await shot(page, '03-room-hollow4');
      });
      await ctx.close();
    }
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close(); server.stop?.();
    console.log(JSON.stringify(proof, null, 1));
    process.exit(0);
  }
})();
