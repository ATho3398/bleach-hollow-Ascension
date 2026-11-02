// C.217 (GDD 139장 1) proof: ① 월드맵 장소 4개(홈 → 시장 → 모험 → 탑)·탑 초점 ② 탑 화면(제목, 탭 없음)·뒤로 = 월드맵 ③ 모험 시작 화면 머리 탭 = 자유 원정·스토리.
// 새 테스트 칸(?test=1, 전체 해금이라 탑 열림).
// 캡처 docs/captures/c217/ (1배 844×390). 실행: node scripts/c217-proof.cjs (C217_URL=<주소> 면 그 주소, C217_FACTION=0|1 기본 0)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c217');
const PORT = 5317;
const FI = Number(process.env.C217_FACTION ?? 0);

async function startServer() {
  if (process.env.C217_URL) return { url: process.env.C217_URL, stop: () => {} };
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
const shot = (page, name) => page.locator('.bha-lcd').first().screenshot({ path: path.join(OUT, name) });
const screenId = (page) => page.evaluate(() => [...document.querySelectorAll('.bha-lcd .bha-app')].map((e) => e.className.replace('bha-app ', '')).join('|'));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  const fid = FI === 0 ? 'hollow' : 'shinigami';
  const proof = { faction: fid };
  try {
    await newGame(page, srv.url);
    await page.locator('.bha-prop--outside').click();
    await page.waitForTimeout(700);
    // 기기 ▼ 로 탑까지 (홈 → 시장 → 모험 → 탑): 초점을 탑 단추로
    for (let i = 0; i < 6 && !(await page.evaluate(() => !!document.querySelector('.bha-worldmap [data-place="tower"].bha-sel, .bha-worldmap .bha-sel[data-place="tower"]'))); i++) {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(150);
    }
    proof.selOrder = await page.evaluate(() => document.querySelector('.bha-worldmap .bha-sel')?.getAttribute('data-place') ?? null);
    proof.places = await page.evaluate(() => [...document.querySelectorAll('.bha-worldmap [data-place]')].map((b) => ({ place: b.dataset.place, name: b.getAttribute('aria-label'), locked: b.getAttribute('aria-disabled'), why: b.getAttribute('aria-description'), box: (() => { const r = b.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; })() })));
    await shot(page, `01-worldmap-tower-focus-${fid}.png`);
    await page.locator('.bha-worldmap [data-place="tower"]').click();
    await page.waitForTimeout(2200);
    proof.towerScreen = await screenId(page);
    proof.towerTitle = await page.evaluate(() => document.querySelector('.bha-lcd .bha-plan__title')?.textContent ?? null);
    await shot(page, `02-tower-${fid}.png`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(700);
    proof.afterBack = await screenId(page);
    await page.locator('.bha-worldmap [data-place="adventure"]').click();
    await page.waitForTimeout(2200);
    await page.locator('.bha-lcd .bha-depart-tabs .bha-viewtitle__btn').click();
    await page.waitForTimeout(300);
    proof.departTabs = await page.evaluate(() => [...document.querySelectorAll('.bha-lcd .bha-depart-tabs [role="option"]')].map((o) => o.textContent.trim()));
    await shot(page, `03-depart-tabs-${fid}.png`);
  } catch (e) {
    proof.error = String(e && e.stack || e);
    await shot(page, '99-error.png').catch(() => {});
  } finally {
    fs.writeFileSync(path.join(OUT, `proof-${fid}.json`), JSON.stringify(proof, null, 1));
    await browser.close();
    srv.stop();
  }
})();
