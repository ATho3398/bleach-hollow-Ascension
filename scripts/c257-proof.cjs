// C.257 proof (GDD 174장): 진급 시험 = 방 책장 아래. c252-proof 바탕. 캡처 docs/captures/c257/ (1배 844×390). 실행: node scripts/c257-proof.cjs
// 1 사신 대원실(4단계, 열림) · 2 호로 둥지(1단계, 잠김) · 3 수련장 토글(진급 시험 없음) · 4 진급 시험 화면(방에서 들어감)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c257');
const PORT = 5357;

async function startServer() {
  const p = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe', detached: true });
  const url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) return { url, stop: () => { try { process.kill(-p.pid); } catch { /* */ } } }; } catch { /* */ }
    await new Promise((r) => setTimeout(r, 500));
  }
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
async function patchSave(page, fn) {
  await page.evaluate((src) => {
    const f = new Function('t', 'shared', src);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const raw = localStorage.getItem(k);
      if (!raw || !raw.includes('"runLog"')) continue;
      const data = JSON.parse(raw);
      const walk = (o) => { if (!o || typeof o !== 'object') return; if (o.nest && o.help && o.runLog) f(o, o.shared); for (const v of Object.values(o)) walk(v); };
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

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const proof = { shots: [], errors, room: {} };
  const shot = async (name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  const newGame = async (fi, tier) => {
    await page.goto(`${srv.url}?test=1`);
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${srv.url}?test=1`);
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: '새로 시작' }).click();
    await page.waitForTimeout(300);
    await page.locator('.bha-slot').first().click();
    await page.getByRole('button', { name: '확인' }).click();
    await page.waitForTimeout(300);
    await page.locator('.bha-species__card').nth(fi).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '시작', exact: true }).click();
    await page.waitForTimeout(2000);
    await skipTut(page);
    await patchSave(page, `
      t.help.guides = { ...t.help.guides, 'first-run': 'done', 'home-intro': 'done', 'first-run-room': 'done', 'birth': 'done', 'recover': 'done' };
      t.evolution.tierIndex = ${tier};
      t.runLog.runs = t.runLog.runs ?? [];
    `);
    await reopen(page);
    await page.waitForTimeout(800);
  };
  const roomInfo = () => page.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), name: e.getAttribute('aria-label'), locked: e.classList.contains('is-locked'), title: e.title || null }; };
    return { book: r('.bha-prop--book'), rank: r('.bha-prop--rank'), chest: r('.bha-prop--chest'), outside: r('.bha-prop--outside') };
  });
  try {
    // 1 사신 대원실 — 4단계(열림)
    await newGame(1, 3);
    proof.room.shinigami = await roomInfo();
    await shot('01-shinigami-room-rank');
    // 4 진급 시험 화면 (방 물건에서)
    await page.locator('.bha-prop--rank').click({ timeout: 4000 });
    await page.waitForTimeout(1000);
    proof.rankTitle = await page.evaluate(() => document.querySelector('.bha-lcd .bha-lcdpage__head')?.textContent?.trim().slice(0, 80) ?? null);
    await shot('04-rank-screen');
    // 뒤로 = 방
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
    proof.backToRoom = await page.locator('.bha-lcd .bha-room').count() > 0;
    // 3 수련장 토글 (월드맵 → 수련장 → 머리 제목 열기)
    await page.locator('.bha-prop--outside').first().click({ timeout: 4000 });
    await page.waitForTimeout(1200);
    await page.locator('.bha-worldmap [data-place="training"]').click({ timeout: 4000 });
    await page.waitForTimeout(2000);
    await skipTut(page);
    const vt = page.locator('.bha-lcd .bha-viewtitle button').first();
    await vt.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(500);
    proof.toggle = await page.evaluate(() => [...document.querySelectorAll('.bha-lcd .bha-viewtitle__list [role="option"], .bha-lcd .bha-viewtitle__list button, .bha-lcd .bha-viewtitle__list li')].map((e) => e.textContent.trim()));
    await shot('03-training-toggle');
    // 2 호로 둥지 — 1단계(잠김)
    await newGame(0, 0);
    proof.room.hollow = await roomInfo();
    await page.locator('.bha-prop--rank').click({ timeout: 4000, force: true }).catch((e) => (proof.hollowClickError = String(e).slice(0, 200)));
    await page.waitForTimeout(300);
    proof.hollowToast = await page.evaluate(() => [...document.querySelectorAll('.bha-toast')].map((t) => t.textContent.trim()));
    proof.hollowStillRoom = await page.locator('.bha-lcd .bha-room').count() > 0;
    await shot('02-hollow-nest-rank-locked');
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close();
    srv.stop();
  }
  console.log(JSON.stringify(proof, null, 2));
})();
