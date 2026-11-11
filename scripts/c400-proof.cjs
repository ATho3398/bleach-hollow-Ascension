// C.400 proof (GDD 241-D 5·7, c400-proof 기반): 가방 소모품 출정품 칸(잠김·열림)·출정품 창·상점 출정품 줄·가방 타일 [타일 배치하러 가기] → 배치만 하는 창. 1배 844×390, 두 종족.
// 실행: node scripts/c400-proof.cjs (C249_URL=<주소>) — 캡처 docs/captures/c400/
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.C249_OUT ?? path.join(ROOT, 'docs/captures/c400');
const PART = process.env.C249_PART ?? 'all';
const PORT = 5400;

async function startServer() {
  if (process.env.C249_URL) return { url: process.env.C249_URL, stop: () => {} };
  const p = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe', detached: true });
  const url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) return { url, stop: () => { try { process.kill(-p.pid); } catch { /* 이미 */ } } }; } catch { /* 아직 */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  try { process.kill(-p.pid); } catch { /* */ }
  throw new Error('vite 서버가 뜨지 않았다');
}

async function skipTut(page) {
  for (let t = 0; t < 40 && (await page.locator('.bha-tut').count()); t++) {
    const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled])').filter({ visible: true });
    if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
    else await page.locator('.bha-lcd').first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
}

/** 저장의 지금 트랙을 고친다 */
async function patchSave(page, fn) {
  await page.evaluate((src) => {
    const f = new Function('t', 'shared', src);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const raw = localStorage.getItem(k);
      if (!raw || !raw.includes('"runLog"')) continue;
      const data = JSON.parse(raw);
      const walk = (o) => {
        if (!o || typeof o !== 'object') return;
        if (o.nest && o.help && o.runLog) f(o, o.shared);
        for (const v of Object.values(o)) walk(v);
      };
      walk(data);
      localStorage.setItem(k, JSON.stringify(data));
    }
  }, fn);
}

async function reopen(page) {
  await page.reload();
  await page.waitForTimeout(1500);
  const cont = page.getByRole('button', { name: '이어하기' });
  if (await cont.count()) { await cont.first().click().catch(() => {}); await page.waitForTimeout(500); }
  const load = page.getByRole('button', { name: '불러오기' });
  if (!(await page.locator('.bha-slot').count()) && (await load.count())) { await load.first().click().catch(() => {}); await page.waitForTimeout(600); }
  const slot = page.locator('.bha-slot').first();
  if (await slot.count()) { await slot.click().catch(() => {}); await page.getByRole('button', { name: '확인' }).click().catch(() => {}); await page.waitForTimeout(1500); }
  await skipTut(page);
}


async function newGame(page, base, fi) {
  await page.goto(`${base}?test=1`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${base}?test=1`);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '새로 시작' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-slot').first().click();
  await page.getByRole('button', { name: '확인' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-species__card').nth(fi).click();
  await page.waitForTimeout(300);
  const yes = page.getByRole('button', { name: /^(시작|네)$/ });
  await yes.first().click();
  await page.waitForTimeout(400);
  const nameIn = page.locator('[data-ident="name"]');
  if (await nameIn.count()) {
    await nameIn.fill('시험');
    await page.locator('[data-ident="next"]').click().catch(() => {});
    await page.waitForTimeout(200);
    await page.locator('.bha-ident__gender').first().click().catch(() => {});
    await page.locator('[data-ident="done"]').click().catch(() => {});
  }
  await page.waitForTimeout(2000);
  await skipTut(page);
}

async function runFaction(browser, fi, proof) {
  const tag = ['hollow', 'shinigami'][fi];
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => proof.errors.push(`${tag}: ${e.message}`));
  const shot = async (name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  const openBag = async (tab) => {
    await page.getByRole('button', { name: '가방' }).first().click({ timeout: 4000 });
    await page.waitForTimeout(600);
    await page.locator(`.bha-chest-page .bha-lcdpage__aside [role="tab"][data-tab="${tab}"]`).first().click();
    await page.waitForTimeout(400);
  };
  try {
    await newGame(page, proof.url, fi);
    await patchSave(page, `
      t.help.guides = { ...t.help.guides, 'first-run': 'done', 'home-intro': 'done', 'first-run-room': 'done', 'birth': 'done', 'recover': 'done', 'tile-plan': 'done' };
      t.nest.hunger = 60; t.nest.condition = 80; t.nest.hpFraction = 1; t.nest.spa = null;
      shared.tradeCoins = 1234; shared.jade = 56;
    `);
    await reopen(page);
    // 1) 잠김 (첫 환생 전)
    await openBag('items');
    await page.locator('.bha-itembox [role="tab"][data-tab="sortie"]').click();
    await page.waitForTimeout(300);
    if (fi === 0) await shot(`${tag}-01-sortie-locked`);
    proof.trace.push({ tag, locked: await page.evaluate(() => document.querySelector('[data-sortie]')?.textContent ?? null) });
    // 2) 열림: 환생 1 + 출정품 보유 + 칸 1개 끼움 + 타일
    await patchSave(page, `
      t.rebirth.count = 1;
      shared.items['sortie-courage'] = 3; shared.items['sortie-ironskin'] = 1; shared.items['sortie-luck'] = 2;
      shared.sortie = ['sortie-courage', null];
      t.tiles.unlocked = true;
      t.tiles.collection = { ...(t.tiles.collection || {}), 'prey-nest-a': 3, 'elite-den-a': 1 };
    `);
    await reopen(page);
    await openBag('items');
    await page.locator('.bha-itembox [role="tab"][data-tab="sortie"]').click();
    await page.waitForTimeout(300);
    await shot(`${tag}-02-sortie-bag`);
    await page.locator('.bha-itemcard', { hasText: '철피 물약' }).first().click();
    await page.waitForTimeout(400);
    if (fi === 0) await shot(`${tag}-03-sortie-dialog`);
    proof.trace.push({ tag, dialog: await page.evaluate(() => [...document.querySelectorAll('.bha-itemdialog button')].map((b) => b.textContent.trim())) });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    // 3) 타일 탭 → 타일 배치하러 가기
    await page.locator('.bha-chest-page .bha-lcdpage__aside [role="tab"][data-tab="tiles"]').first().click();
    await page.waitForTimeout(400);
    if (fi === 0) await shot(`${tag}-04-tiles-tab`);
    await page.locator('[data-sc="tile-place"]').click({ timeout: 3000 });
    await page.waitForTimeout(900);
    await shot(`${tag}-05-tile-place`);
    proof.trace.push({ tag, placeScreen: await page.evaluate(() => ({ screen: document.querySelector('[data-screen]')?.dataset.screen, go: [...document.querySelectorAll('.bha-plan__go button')].map((b) => b.textContent.trim()), tabs: document.querySelectorAll('[data-plan-side]').length })) });
    await page.locator('.bha-plan__go button').first().click();
    await page.waitForTimeout(800);
    proof.trace.push({ tag, afterClose: await page.evaluate(() => document.querySelector('[data-screen]')?.dataset.screen ?? 'room') });
  } catch (e) {
    proof.errors.push(`${tag}: ${String(e.message).split('\n')[0]}`);
    await shot(`${tag}-fail`).catch(() => {});
  }
  await page.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { url: srv.url, shots: [], errors: [], trace: [] };
  try {
    for (const fi of (process.env.C400_F ?? '0,1').split(',').map(Number)) await runFaction(browser, fi, proof);
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close();
    srv.stop();
  }
  console.log(JSON.stringify(proof, null, 1));
  process.exit(0);
})();
