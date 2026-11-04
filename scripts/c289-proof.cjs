// C.289 리디자인 v2 화면 B (GDD 183장, 코딩200) proof: 모험 준비 [준비]·[타일 배치]·걷기·바퀴 끝 창 × 두 종족. 1배 844×390
// 실행: node scripts/c289-proof.cjs  (CB_OUT=<폴더> 캡처 위치, CB_FACTIONS=0,1, CB_URL=<주소>)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, process.env.CB_OUT ?? 'docs/captures/c289');
const PORT = 5393;
const FACTIONS = (process.env.CB_FACTIONS ?? '0,1').split(',').map(Number);

async function startServer() {
  if (process.env.CB_URL) return { url: process.env.CB_URL, stop: () => {} };
  const p = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe', detached: true });
  const url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) return { url, stop: () => { try { process.kill(-p.pid); } catch { /* */ } } }; } catch { /* */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite 서버가 뜨지 않았다');
}

async function patchSave(page, src) {
  await page.evaluate((src) => {
    const f = new Function('t', src);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const raw = localStorage.getItem(k);
      if (!raw || !raw.includes('"runLog"')) continue;
      const data = JSON.parse(raw);
      const walk = (o) => { if (!o || typeof o !== 'object') return; if (o.nest && o.help && o.runLog) f(o); for (const v of Object.values(o)) walk(v); };
      walk(data);
      localStorage.setItem(k, JSON.stringify(data));
    }
  }, src);
}

/** 화면 점검: 잘린 글자 · 12px 미만 글자 · 44(36) 미만 버튼 · 버튼 자리 */
const audit = () => {
  const lcd = document.querySelector('.bha-lcd');
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1 && getComputedStyle(e).visibility !== 'hidden'; };
  const small = [...lcd.querySelectorAll('*')].filter((e) => vis(e) && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12).map((e) => `${String(e.className).split(' ')[0]} '${e.textContent.trim().slice(0, 10)}' ${getComputedStyle(e).fontSize}`);
  const tiny = [...lcd.querySelectorAll('button')].filter((b) => vis(b) && !b.closest('[hidden]')).filter((b) => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height) < 36; }).map((b) => `${String(b.className).split(' ')[0]} '${(b.getAttribute('aria-label') || b.textContent).trim().slice(0, 10)}' ${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}`);
  const cut = [...lcd.querySelectorAll('button, .bha-chip, .bha-num')].filter((e) => vis(e) && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'visible' && getComputedStyle(e).textOverflow !== 'ellipsis').map((e) => `${String(e.className).split(' ')[0]} '${e.textContent.trim().slice(0, 12)}'`);
  const go = document.querySelector('[data-sc="go"]')?.getBoundingClientRect();
  return { small: small.slice(0, 12), tiny: tiny.slice(0, 12), cut: cut.slice(0, 12), go: go ? [Math.round(go.left), Math.round(go.top), Math.round(go.width), Math.round(go.height)] : null };
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { shots: [], audit: {}, checks: {}, errors: [] };
  try {
    for (const fi of FACTIONS) {
      const fname = fi === 0 ? 'hollow' : 'shinigami';
      const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
      page.on('pageerror', (e) => proof.errors.push(`${fname}: ${e.message}`));
      const wait = (ms) => page.waitForTimeout(ms);
      const press = async (lab, ms = 150) => { await page.locator(`.bha-dev__btn[aria-label="${lab}"]`).first().click(); await wait(ms); };
      const shot = async (name) => {
        await wait(400);
        const file = `${fname}-${name}.png`;
        await page.screenshot({ path: path.join(OUT, file) });
        proof.shots.push(file);
        proof.audit[file] = await page.evaluate(audit);
        console.log(file, JSON.stringify(proof.audit[file]));
      };
      const step = async (label, fn) => { try { await fn(); } catch (e) { proof.errors.push(`${fname} ${label}: ${String(e.message).split('\n')[0]}`); } };
      const reopen = async () => {
        await page.goto(`${srv.url}?test=1`);
        await wait(1200);
        await page.getByRole('button', { name: '이어하기' }).first().click();
        await wait(2500);
      };
      await page.goto(`${srv.url}?test=1`);
      await page.evaluate(() => localStorage.clear());
      await page.goto(`${srv.url}?test=1`);
      await wait(1200);
      await page.getByRole('button', { name: '새로 시작' }).click();
      await wait(300);
      await page.locator('.bha-slot').first().click();
      await wait(200);
      await page.getByRole('button', { name: '확인' }).click();
      await wait(300);
      await page.locator('.bha-species__card').nth(fi).click();
      await wait(300);
      await page.getByRole('button', { name: '시작', exact: true }).click();
      await wait(2500);
      const goPlan = async () => {
        await page.locator('.bha-prop--outside').first().click();
        await wait(1500);
        await page.locator('.bha-worldmap [data-place="adventure"]').first().click();
        await wait(1500);
      };
      // ① 첫 진화 전(타일 잠김) 준비 화면 — 탭 없음
      await patchSave(page, `
        const g = t.help.guides; for (const k of Object.keys(g)) g[k] = 'done'; t.tiles.unlocked = false; t.tiles.collection = {};
        Object.assign(g, { 'first-run': 'done', 'home-intro': 'done', 'first-run-room': 'done', 'birth': 'done', 'tile-intro': 'done', 'tile-plan': 'done', 'worldmap': 'done' });
        t.runLog.runs = t.runLog.runs.length ? t.runLog.runs : [{ at: Date.now(), result: 'return' }];
      `);
      await reopen();
      await step('준비(잠김)', async () => { await goPlan(); await shot('1-prep-locked'); });
      // ② 첫 진화 뒤: 타일 여러 장 + 프리셋
      await patchSave(page, `
        t.tiles.unlocked = true;
        t.tiles.collection = { 'prey-nest-a': 3, 'prey-nest-b': 2, 'elite-den-a': 2, 'elite-den-b': 1, 'env-fog': 1, 'env-ruin': 1, 'rest-a': 2, 'rest-spring': 1, 'hunter-den': 1, 'env-training': 1 };
        t.evolution.tierIndex = Math.max(t.evolution.tierIndex, 2);
        t.difficulty.unlocked = 3;
      `);
      await reopen();
      await step('준비', async () => {
        await goPlan();
        await shot('2-prep');
      });
      await step('타일 배치', async () => {
        await page.locator('[data-plan-side="place"]').first().click();
        await wait(300);
        await page.locator('.bha-tilecard').first().click();
        await wait(200);
        await page.locator('.bha-road__cell.is-can').first().click();
        await wait(200);
        await page.locator('.bha-tilecard').nth(2).click();
        await wait(200);
        await page.locator('.bha-road__cell.is-can').first().click();
        await wait(200);
        await page.locator('.bha-tilecard').nth(1).click();
        await wait(200);
        const focus = await page.evaluate(() => document.querySelector('.bha-sel')?.className ?? null);
        proof.checks[`${fname}-focus-after-card`] = focus;
        await shot('3-place');
        // 카드 → 첫 빈 칸 → 다음 카드 초점 (176장 14)
        await press('확정', 250);
        const after = await page.evaluate(() => document.querySelector('.bha-sel')?.className ?? null);
        proof.checks[`${fname}-focus-after-place`] = after;
      });
      await step('준비 (길 놓음)', async () => {
        await page.locator('[data-plan-side="prep"]').first().click();
        await wait(300);
        await shot('4-prep-placed');
      });
      await step('걷기', async () => {
        await page.locator('[data-sc="go"]').first().click();
        await wait(1200);
        await shot('5-walk');
      });
      await step('바퀴 끝', async () => {
        // 걷기 빠르게: 테스트 속도 대신 엔진 시간을 기다린다 — 12칸 × 5초. 전투가 나오면 테스트 모드 전투를 이겨야 하므로 세이브로 바퀴 끝 직전을 만든다
        await page.goto('about:blank');
        await page.goto(`${srv.url}?test=1&nosw=1`);
        await page.evaluate(() => { window.onbeforeunload = null; });
        await patchSave(page, `
          const e = t.activeExpedition; window.__cbHad = !!e; if (e) { const s = e.exp; s.phase = 'moving'; s.pos = 11; s.pending = null; t.lastScreen = 'expedition'; }
        `);
        proof.checks[`${fname}-hadExp`] = await page.evaluate(() => window.__cbHad);
        await reopen();
        await wait(500);
        const cont = page.getByRole('button', { name: /모험 이어하기/ });
        if (await cont.count()) { await cont.first().click(); await wait(1500); }
        for (let i = 0; i < 20 && !(await page.locator('.bha-sheet').count()); i++) await wait(1000);
        await shot('6-lapend');
        const pick = page.locator('.bha-draft__card:not([disabled])').first();
        if (await pick.count()) { await pick.click(); await wait(300); await shot('7-lapend-picked'); }
      });
      await page.close();
    }
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close();
    srv.stop();
  }
  console.log('errors', proof.errors);
})();
