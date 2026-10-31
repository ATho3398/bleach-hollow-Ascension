// C.241 proof (GDD 164장): 평소 온천 약 20초에 체력 가득 — 들어간 직후 · 약 10초 뒤 · 가득 차 방으로 나온 뒤. C.238 proof 바탕. 사신(C241_FI=1 기본).
// 실행: node scripts/c241-proof.cjs (C241_URL=<주소>, C241_OUT=<폴더>) — 캡처 docs/captures/c241/ (1배 844×390)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.C241_OUT ?? path.join(ROOT, 'docs/captures/c241');
const PORT = 5341;

async function startServer() {
  if (process.env.C241_URL) return { url: process.env.C241_URL, stop: () => {} };
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
  const srv = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const proof = { shots: [], errors, trace: [], samples: [] };
  const shot = async (name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  const spaText = () => page.evaluate(() => (document.querySelector('.bha-spa')?.textContent ?? '').replace(/\s+/g, ' ').slice(0, 300));
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
    await page.locator('.bha-species__card').nth(Number(process.env.C241_FI ?? 1)).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '시작', exact: true }).click();
    await page.waitForTimeout(2000);
    await skipTut(page);
    // 체력 5%·컨디션 0·배부름 가득(허기 0) 저장 — 튜토리얼 끝(평소 온천)
    await patchSave(page, `
      t.help.guides = { ...t.help.guides, 'first-run': 'done', 'home-intro': 'done', 'first-run-room': 'done', 'birth': 'done', 'recover': 'done' };
      t.nest.hunger = 0; t.nest.condition = 0; t.nest.hpFraction = 0.05; t.nest.spa = null;
    `);
    await reopen(page);
    proof.trace.push(['room', await screens(page)]);
    await page.locator('.bha-room .bha-prop--outside').first().click({ timeout: 4000 });
    await page.waitForTimeout(1200);
    proof.trace.push(['worldmap', await screens(page)]);
    const t0 = Date.now();
    await page.locator('.bha-worldmap [data-place="spa"]').click({ timeout: 4000 });
    await page.waitForTimeout(1500);
    proof.trace.push(['spa', await screens(page)]);
    proof.samples.push([Math.round((Date.now() - t0) / 100) / 10, await spaText()]);
    await shot('01-spa-enter');
    await page.waitForTimeout(Math.max(0, 10_500 - (Date.now() - t0)));
    proof.samples.push([Math.round((Date.now() - t0) / 100) / 10, await spaText()]);
    await shot('02-spa-10s');
    for (let i = 0; i < 40 && !(await screens(page)).includes('bha-room') ; i++) await page.waitForTimeout(500);
    proof.leftAt = Math.round((Date.now() - t0) / 100) / 10;
    await page.waitForTimeout(1500);
    proof.trace.push(['after', await screens(page)]);
    proof.roomStatus = await page.evaluate(() => (document.querySelector('.bha-room__status')?.textContent ?? '').replace(/\s+/g, ' ').slice(0, 200));
    await shot('03-room-after');
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close();
    srv.stop();
  }
  console.log(JSON.stringify(proof));
  process.exit(0);
})();
