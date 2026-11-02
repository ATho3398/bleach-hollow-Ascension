// C.229 proof (GDD 154장): ① 가방 '기타' 창(재료 몇 개) ② 0개일 때 ③ 재료 카드 설명 창.
// 새 게임(호로, ?test=1) → 저장을 고쳐 다시 연다. 캡처 docs/captures/c229/ (1배 844×390). 실행: node scripts/c229-proof.cjs (C229_URL=<주소>)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c229');
const PORT = 5329;

async function startServer() {
  if (process.env.C229_URL) return { url: process.env.C229_URL, stop: () => {} };
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
  const proof = { shots: [], errors, trace: [] };
  const shot = async (name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  const DEV = { up: '위', down: '아래', ok: '확정', back: '취소' };
  const devBtn = (k) => page.locator(`.bha-dev__btn[aria-label="${DEV[k]}"]`).first().click().catch(() => {});
  const openEtc = async () => {
    await page.locator('.bha-prop--chest').first().click({ timeout: 4000 });
    await page.waitForTimeout(800);
    await page.locator('.bha-chest-page .bha-lcdpage__aside [role="tab"][data-tab="material"]').click({ timeout: 4000 });
    await page.waitForTimeout(600);
  };
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
    await page.locator('.bha-species__card').nth(0).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '시작', exact: true }).click();
    await page.waitForTimeout(2000);
    await skipTut(page);
    await patchSave(page, `t.help.guides = { ...t.help.guides, 'first-run': 'done', 'home-intro': 'done', 'first-run-room': 'done', 'birth': 'done', 'recover': 'done' };`);
    await reopen(page);
    // ② 0개
    await openEtc();
    proof.empty = await page.evaluate(() => document.querySelector('[data-materials]')?.textContent);
    proof.tabs = await page.evaluate(() => [...document.querySelectorAll('.bha-chest-page .bha-lcdpage__aside [role="tab"]')].map((t) => t.textContent));
    await shot('02-etc-empty');
    // ① 재료 몇 개
    await page.goto(`${srv.url}?test=1`);
    await patchSave(page, `Object.assign(shared.items, { 'mat-leather-thick': 3, 'mat-steel': 12, 'mat-hollow-fang': 5, 'mat-mask-shard': 2, 'mat-gold-shard': 1, 'mat-gem-shiny': 1, 'mat-glue': 4, 'mat-amber': 2 });`);
    await reopen(page);
    await openEtc();
    proof.cards = await page.evaluate(() => [...document.querySelectorAll('[data-materials] .bha-itemcard')].map((c) => `${c.dataset.item}: ${c.textContent}`));
    await shot('01-etc-materials');
    // ③ 기기 버튼으로 카드 → ✓ = 설명 창
    await devBtn('down');
    await page.waitForTimeout(250);
    await devBtn('down');
    await page.waitForTimeout(250);
    proof.focus = await page.evaluate(() => document.activeElement?.closest('.bha-itemcard')?.dataset.item ?? document.querySelector('.bha-sel')?.textContent);
    await devBtn('ok');
    await page.waitForTimeout(600);
    if (!(await page.locator('.bha-itemdialog').count())) {
      await page.locator('[data-materials] .bha-itemcard[data-item="mat-amber"]').click();
      await page.waitForTimeout(600);
    }
    proof.dialog = await page.evaluate(() => document.querySelector('.bha-itemdialog')?.textContent);
    await shot('03-material-detail');
    await devBtn('back');
    await page.waitForTimeout(400);
    proof.closedByBack = await page.evaluate(() => !document.querySelector('.bha-itemdialog'));
  } catch (e) {
    proof.fatal = String(e && e.stack || e);
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close();
    srv.stop();
  }
})();
