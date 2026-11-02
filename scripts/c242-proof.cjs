// C.242 proof (GDD 165장): 방(수련장 없음)·월드맵(수련장 짚인형)·상태 화면 능력치 ⓘ 창. 사신(C242_FI=1) — C242_FI=0 이면 호로 방 한 장만. C.238 proof 바탕.
// 실행: node scripts/c242-proof.cjs (C242_URL=<주소>, C242_OUT=<폴더>) — 캡처 docs/captures/c242/ (1배 844×390)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.C242_OUT ?? path.join(ROOT, 'docs/captures/c242');
const PORT = 5342;

async function startServer() {
  if (process.env.C242_URL) return { url: process.env.C242_URL, stop: () => {} };
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
  const slot = page.locator('.bha-slot').first();
  if (await slot.count()) { await slot.click().catch(() => {}); await page.getByRole('button', { name: '확인' }).click().catch(() => {}); await page.waitForTimeout(1500); }
  await skipTut(page);
}

const screens = (page) => page.evaluate(() => [...document.querySelectorAll('.bha-lcd .bha-app')].map((e) => e.className.replace('bha-app ', '')).join('|'));


(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const FI = Number(process.env.C242_FI ?? 1);
  const srv = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const proof = { faction: FI, shots: [], errors, trace: [] };
  const shot = async (name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  try {
    await page.goto(`${srv.url}?test=1`);
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${srv.url}?test=1`);
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: '새로 시작' }).click();
    await page.waitForTimeout(300);
    await page.locator('.bha-slot').first().click();
    await page.getByRole('button', { name: '확인' }).click();
    await page.waitForTimeout(300);
    await page.locator('.bha-species__card').nth(FI).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '시작', exact: true }).click();
    await page.waitForTimeout(2000);
    await skipTut(page);
    await patchSave(page, `
      t.help.guides = { ...t.help.guides, 'first-run': 'done', 'home-intro': 'done', 'first-run-room': 'done', 'birth': 'done', 'recover': 'done' };
      t.evolution.ev = { hp: 12, atk: 30, int: 8, def: 5, spr: 0, spd: 4 };
    `);
    await reopen(page);
    proof.roomProps = await page.evaluate(() => [...document.querySelectorAll('.bha-room .bha-prop')].map((e) => e.className));
    proof.altarInRoom = await page.locator('.bha-room .bha-prop--altar').count();
    await page.keyboard.press('t');
    await page.waitForTimeout(800);
    proof.trace.push(['after-T', await screens(page)]);
    if (FI === 0) { await shot('04-hollow-room'); return; }
    await shot('01-room');
    await page.locator('.bha-room .bha-prop--outside').first().click({ timeout: 4000 });
    await page.waitForTimeout(1200);
    proof.worldImgs = await page.evaluate(() => [...document.querySelectorAll('.bha-worldmap [data-place]')].map((b) => [b.dataset.place, b.querySelector('img')?.getAttribute('src') ?? 'icon']));
    await shot('02-worldmap');
    await page.locator('.bha-worldmap [data-place="training"]').click({ timeout: 4000 });
    await page.waitForTimeout(2000);
    proof.trace.push(['training-from-map', await screens(page)]);
    await page.locator('.bha-dev__btn[aria-label="취소"]').first().click().catch(() => {});
    await page.waitForTimeout(1200);
    proof.trace.push(['training-back', await screens(page)]);
    await page.locator('.bha-worldmap [data-place="home"]').click({ timeout: 4000 });
    await page.waitForTimeout(2000);
    await page.keyboard.press('g');
    await page.waitForTimeout(1200);
    await page.locator('.bha-care-page [aria-label="능력치"] .bha-info').first().click({ timeout: 4000 });
    await page.waitForTimeout(600);
    proof.statInfo = await page.evaluate(() => [...document.querySelectorAll('.bha-pop li, .bha-pop p, .bha-pop b')].map((e) => e.textContent));
    await shot('03-status-info');
  } finally {
    fs.writeFileSync(path.join(OUT, FI === 0 ? 'proof-hollow.json' : 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close();
    srv.stop();
  }
  console.log(JSON.stringify(proof));
  process.exit(0);
})();
