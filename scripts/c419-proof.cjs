// C.419 proof (사용자 "최신버전으로 업데이트"): 최신 게임(C.417) 위에서 ?layout 도구 — 6장면 물건 목록 = 그려진 물건(붕옥 포함), 새 버전 알림 버튼.
// 캡처 docs/captures/c419/ (1배). 실행: node scripts/c419-proof.cjs (C419_URL=<주소> 로 이미 뜬 dev 서버 사용 — 새 버전 흉내는 dev 모듈 import 라 dev 서버여야 함)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c419');
const PORT = 5419;
async function startServer() {
  if (process.env.C419_URL) return { url: process.env.C419_URL, stop: () => {} };
  const p = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe', detached: true });
  const url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) return { url, stop: () => { try { process.kill(-p.pid); } catch { /* 이미 */ } } }; } catch { /* 아직 */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  try { process.kill(-p.pid); } catch { /* */ }
  throw new Error('vite 서버가 뜨지 않았다');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const proof = { shots: [], errors, scenes: {} };
  try {
    await page.goto(srv.url);
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${srv.url}?layout`);
    await page.waitForTimeout(1500);
    const ids = await page.evaluate(() => [...document.querySelectorAll('.bha-ltool__select option')].map((o) => o.value));
    for (const id of ids) {
      await page.locator('.bha-ltool__select').selectOption(id);
      await page.waitForTimeout(900);
      proof.scenes[id] = await page.evaluate(() => ({
        list: [...document.querySelectorAll('.bha-ltool__items button')].length,
        drawn: [...document.querySelectorAll('.bha-room__scene .bha-prop')].filter((e) => !e.hidden).map((e) => e.dataset.prop),
      }));
    }
    await page.locator('.bha-ltool__select').selectOption('room.hollow');
    await page.waitForTimeout(900);
    await page.locator('.bha-room__scene .bha-prop[data-prop="hogyoku"]').dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true });
    await page.waitForTimeout(300);
    await page.locator('.bha-ltool__frame').screenshot({ path: path.join(OUT, '1-room-hollow-hogyoku.png') });
    proof.shots.push('1-room-hollow-hogyoku.png');
    await page.evaluate(async () => { const m = await import('/src/pwa.ts'); m.markUpdateReadyForTest(); });
    await page.waitForTimeout(300);
    proof.update = { button: await page.locator('[data-ltool-update]').count(), status: await page.locator('.bha-ltool__status').textContent() };
    await page.screenshot({ path: path.join(OUT, '2-update-button.png'), clip: { x: 0, y: 0, width: 900, height: 700 } });
    proof.shots.push('2-update-button.png');
  } catch (e) {
    proof.errors.push(e.message);
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    console.log(JSON.stringify(proof, null, 2));
    await browser.close();
    srv.stop();
  }
})();
