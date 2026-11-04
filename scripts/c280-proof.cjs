// GDD 182장 3 proof: 튜토리얼 노력치(+1×6) + 흡수 2번 뒤 흡수 화면 노력치 · 상태 화면 노력치 합계/상한. 호로·사신. 1배 844×390
// 실행: EVCAP_OUT=docs/captures/c280 node scripts/c280-proof.cjs
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, process.env.EVCAP_OUT ?? 'docs/captures/c280');
const PORT = 5394;

async function startServer() {
  if (process.env.EVCAP_URL) return { url: process.env.EVCAP_URL, stop: () => {} };
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

const screens = (page) => page.evaluate(() => [...document.querySelectorAll('.bha-lcd .bha-app')].map((e) => e.className.replace('bha-app ', '')).join('|'));




(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = {};
  try {
    for (const FI of [0, 1]) {
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
      // 튜토리얼 보상(모든 능력치 +3) + 흡수 2번(힘 +2·속도 +4)을 받은 상태
      await patchSave(page, `
        t.help.guides = { ...t.help.guides, 'first-run': 'done', 'home-intro': 'done', 'first-run-room': 'done', 'birth': 'done', 'recover': 'done' };
        t.evolution.tierIndex = 0; t.evolution.formId = null; t.evolution.formHistory = []; t.evolution.look = null;
        for (const k of Object.keys(t.evolution.ev)) { t.evolution.ev[k] = 3; if (t.evolution.carry) t.evolution.carry[k] = 0; }
        t.evolution.ev.atk += 2; t.evolution.ev.spd += 4;
      `);
      await reopen(page);
      await page.keyboard.press('g');
      await page.waitForTimeout(1200);
      const status = await page.evaluate(() => document.querySelector('[data-ev-total]')?.textContent ?? null);
      await page.locator('[data-ev-total]').first().scrollIntoViewIfNeeded().catch(() => {});
      await page.screenshot({ path: path.join(OUT, `${TAG}-2-status-ev.jpg`), type: 'jpeg', quality: 80 });
      await reopen(page);
      await page.locator('.bha-prop--outside').first().click({ timeout: 4000 });
      await page.waitForTimeout(1200);
      await page.locator('.bha-worldmap [data-place="adventure"]').click({ timeout: 4000 });
      await page.waitForTimeout(1500);
      for (let i = 0; i < 6 && (await page.locator('.bha-lcd [data-dev-layer]').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
      await page.locator('.bha-lcd').getByRole('button', { name: '★1', exact: true }).click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(500);
      await page.locator('.bha-lcd').getByRole('button', { name: '출발' }).first().click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(1200);
      const vis = (loc) => loc.filter({ visible: true });
      for (let t = 0; t < 240 && !(await page.locator('.bha-absorbpage').count()); t++) {
        const depart = vis(page.getByRole('button', { name: /출발$/ }));
        if (await depart.count()) { await depart.first().click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(800); continue; }
        const layerGo = vis(page.locator('.bha-lcd [data-dev-layer] button.bha-btn--primary'));
        const eat = vis(page.getByRole('button', { name: /하러 가기$/ }));
        if (await eat.count()) await eat.first().click({ timeout: 2000 }).catch(() => {});
        else if (await layerGo.count()) await layerGo.first().click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(500);
      }
      await page.waitForTimeout(800);
      const desc = await page.evaluate(() => [...document.querySelectorAll('.bha-absorbpage .bha-absorb__desc p')].map((p) => p.textContent));
      await page.screenshot({ path: path.join(OUT, `${TAG}-1-absorb-ev.jpg`), type: 'jpeg', quality: 80 });
      proof[TAG] = { status, desc, errors };
      await page.close();
    }
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close();
    srv.stop();
  }
  console.log(JSON.stringify(proof, null, 1));
  process.exit(0);
})();
