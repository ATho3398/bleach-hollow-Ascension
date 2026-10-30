// C.219 (GDD 141장) proof: ① 도움말 '능력치'(힘 = 평타, 지능 = 블록 공격) ② 상태 화면 능력치 ⓘ ③ 성향 '괴력' 설명(평타 피해 ↑).
// 새 테스트 칸(?test=1). ③은 저장의 진화 상태를 4단계 불 + 성향 힘(괴력)으로 바꿔 다시 연다.
// 캡처 docs/captures/c219/ (1배 844×390). 실행: node scripts/c219-proof.cjs (C219_URL=<주소> 면 그 주소, C219_FACTION=0|1 기본 0)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c219');
const PORT = 5319;
const FI = Number(process.env.C219_FACTION ?? 0);

async function startServer() {
  if (process.env.C219_URL) return { url: process.env.C219_URL, stop: () => {} };
  const p = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe', detached: true });
  const url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) return { url, stop: () => { try { process.kill(-p.pid); } catch { /* 이미 */ } } }; } catch { /* 아직 */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  try { process.kill(-p.pid); } catch { /* */ }
  throw new Error('vite 서버가 뜨지 않았다');
}

async function newGame(page, url) {
  await page.goto(`${url}?test=1`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${url}?test=1`);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '새로 시작' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-slot').first().click();
  await page.getByRole('button', { name: '확인' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-species__card').nth(FI).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await page.waitForTimeout(1500);
  await skipTut(page);
}
async function skipTut(page) {
  for (let t = 0; t < 40 && (await page.locator('.bha-tut').count()); t++) {
    const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled])').filter({ visible: true });
    if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
    else await page.locator('.bha-lcd').first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
}
async function closeLayers(page) {
  for (let i = 0; i < 6 && (await page.locator('[role="dialog"][aria-label="도움말"]').count()); i++) { await page.locator('.bha-dev__btn--back').first().click(); await page.waitForTimeout(400); }
  for (let i = 0; i < 6 && (await page.locator('.bha-lcd [data-dev-layer]').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
}
const lcd = (page) => page.locator('.bha-lcd').first();

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  const fid = FI === 0 ? 'hollow' : 'shinigami';
  const proof = { faction: fid, shots: [] };
  try {
    await newGame(page, srv.url);
    // ① 도움말 → 용어 사전 '능력치'
    await lcd(page).getByRole('button', { name: '더보기' }).click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: '도움말' }).first().click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(700);
    await page.locator('.bha-mdrow').filter({ hasText: '능력치' }).first().click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(600);
    proof.glossary = await page.evaluate(() => document.querySelector('.bha-mddetail__body')?.textContent ?? null);
    await page.screenshot({ path: path.join(OUT, `01-help-stats-${fid}.png`) });
    proof.shots.push(`01-help-stats-${fid}.png`);
    await closeLayers(page);
    // ③ 준비: 진화 상태를 4단계 불 + 성향 힘(괴력)으로
    await page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const raw = localStorage.getItem(k);
        if (!raw || !raw.includes('"evolution"')) continue;
        const data = JSON.parse(raw);
        const walk = (o) => {
          if (!o || typeof o !== 'object') return;
          if (o.evolution && typeof o.evolution === 'object' && 'tierIndex' in o.evolution) Object.assign(o.evolution, { tierIndex: 3, formId: 't4:fire', ability: 'atk' });
          for (const v of Object.values(o)) walk(v);
        };
        walk(data);
        localStorage.setItem(k, JSON.stringify(data));
      }
    });
    await page.reload();
    await page.waitForTimeout(1500);
    const cont = page.getByRole('button', { name: '이어하기' });
    if (await cont.count()) { await cont.first().click().catch(() => {}); await page.waitForTimeout(500); }
    const slot = page.locator('.bha-slot').first();
    if (await slot.count()) { await slot.click().catch(() => {}); await page.getByRole('button', { name: '확인' }).click().catch(() => {}); await page.waitForTimeout(1200); }
    await skipTut(page);
    // ② 상태 화면 → 능력치 ⓘ
    await page.locator('.bha-room__status').first().click({ timeout: 4000 });
    await page.waitForTimeout(900);
    const tip = page.locator('section[aria-label="능력치"] .bha-info').first();
    await tip.scrollIntoViewIfNeeded().catch(() => {});
    await tip.click({ timeout: 4000 });
    await page.waitForTimeout(500);
    proof.statInfo = await page.evaluate(() => document.querySelector('.bha-pop')?.textContent ?? null);
    await page.screenshot({ path: path.join(OUT, `02-status-stats-info-${fid}.png`) });
    proof.shots.push(`02-status-stats-info-${fid}.png`);
    await tip.click().catch(() => {});
    await page.waitForTimeout(300);
    // ③ 성향 특성 줄(괴력)
    const abil = page.locator('section[aria-label="능력치"] p').filter({ hasText: '괴력' }).first();
    proof.ability = await abil.textContent().catch(() => null);
    await abil.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, `03-ability-atk-${fid}.png`) });
    proof.shots.push(`03-ability-atk-${fid}.png`);
  } catch (e) {
    proof.error = String(e);
    await page.screenshot({ path: path.join(OUT, `_error-${fid}.png`) });
  } finally {
    fs.writeFileSync(path.join(OUT, `proof-${fid}.json`), `${JSON.stringify(proof, null, 2)}\n`);
    await browser.close();
    srv.stop();
  }
})();
