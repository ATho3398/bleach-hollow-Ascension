// C.251 proof (GDD 170장 1): 재우기·쓰다듬기(종족 이름) 응답 한 번마다 배부름 −1 — 결과 말풍선 · 배부름 ⓘ.
// 캡처 docs/captures/c251/ (1배 844×390). 실행: node scripts/c251-proof.cjs
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c251');
const PORT = 5351;

async function startServer() {
  if (process.env.C251_URL) return { url: process.env.C250_URL, stop: () => {} };
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

async function reopen(page, skip = true) {
  await page.reload();
  await page.waitForTimeout(1500);
  const cont = page.getByRole('button', { name: '이어하기' });
  if (await cont.count()) { await cont.first().click().catch(() => {}); await page.waitForTimeout(500); }
  const slot = page.locator('.bha-slot').first();
  if (await slot.count()) { await slot.click().catch(() => {}); await page.getByRole('button', { name: '확인' }).click().catch(() => {}); await page.waitForTimeout(1500); }
  if (skip) await skipTut(page);
}


async function run(browser, srv, FI, action, file, info) {
  const TAG = FI === 0 ? 'hollow' : 'shinigami';
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
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
    t.nest.hunger = 30; t.nest.condition = 50; t.nest.weakened = false; t.nest.tired = false;
    t.nest.careRequest = { action: '${action}', until: Date.now() + 3600000 }; t.nest.nextCareAt = Date.now() + 3600000;
  `);
  await reopen(page);
  const before = await page.evaluate(() => document.querySelector('.bha-room')?.textContent?.match(/\d+/g)?.slice(0, 3));
  await page.locator(`.bha-homedock__carebtn--${action}`).first().click({ timeout: 4000 });
  await page.waitForTimeout(1500);
  const bubble = await page.evaluate(() => [...document.querySelectorAll('[class*="bubble"]')].map((e) => e.textContent.trim()).filter(Boolean));
  await page.screenshot({ path: path.join(OUT, file) });
  const out = { faction: TAG, action, file, bubble, errors };
  if (info) {
    await page.keyboard.press('g');
    await page.waitForTimeout(1200);
    const btns = page.locator('.bha-care-page button.bha-info');
    const n = await btns.count();
    for (let i = 0; i < n; i++) {
      const label = await btns.nth(i).getAttribute('data-info');
      if (!/배부름/.test(label ?? '')) continue;
      await btns.nth(i).click();
      await page.waitForTimeout(500);
      out.info = await page.evaluate(() => [...document.querySelectorAll('.bha-pop li, .bha-pop p')].map((e) => e.textContent));
      await page.screenshot({ path: path.join(OUT, info) });
      break;
    }
  }
  await page.close();
  return out;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = [];
  try {
    proof.push(await run(browser, srv, 1, 'sleep', '1-shinigami-sleep.png', '3-shinigami-fullness-info.png'));
    proof.push(await run(browser, srv, 0, 'pet', '2-hollow-pet.png', null));
  } finally {
    await browser.close();
    srv.stop();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 1));
  console.log(JSON.stringify(proof, null, 1));
})();
