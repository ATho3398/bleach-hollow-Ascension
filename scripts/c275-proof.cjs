// C.275 proof (사용자 "배경 확대 축소 위치이동 가능하게 수정"): ?layout 도구 [배경 맞추기] — 확대 슬라이더 ×1.8 → 장면 빈 곳 끌어 배경 이동 → 저장값(floor.view) 확인.
// 그 다음 같은 브라우저 게임 미리보기 대신 도구 화면(실제 roomView)으로 확인. 캡처 docs/captures/c275/ (1배). 실행: node scripts/c275-proof.cjs (C275_URL=<주소>)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c275');
const PORT = 5375;
async function startServer() {
  if (process.env.C275_URL) return { url: process.env.C275_URL, stop: () => {} };
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
  const page = await browser.newPage({ viewport: { width: 900, height: 720 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const proof = { shots: [], errors };
  const shot = async (name, full) => {
    if (full) await page.screenshot({ path: path.join(OUT, name), clip: { x: 0, y: 0, width: 900, height: 720 } });
    else await page.locator('.bha-ltool__frame').screenshot({ path: path.join(OUT, name) });
    proof.shots.push(name);
  };
  try {
    await page.goto(srv.url);
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${srv.url}?layout`);
    await page.waitForTimeout(1200);
    await page.locator('.bha-ltool__select').selectOption('room.shinigami');
    await page.waitForTimeout(600);
    await shot('1-before.png');
    await page.getByRole('button', { name: '배경 맞추기' }).click();
    await page.waitForTimeout(300);
    const z = page.locator('input[data-bg-view="zoom"]');
    await z.fill('1.8');
    await z.dispatchEvent('change');
    await page.waitForTimeout(800);
    const sc = await page.locator('.bha-room__scene').boundingBox();
    await page.mouse.move(sc.x + 30, sc.y + 30);
    await page.mouse.down();
    await page.mouse.move(sc.x + 130, sc.y + 60, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(800);
    proof.status = await page.locator('.bha-ltool__status').textContent();
    proof.bgView = await page.evaluate(() => JSON.parse(localStorage.getItem('bha.layoutTool.v1')).scenes['room.shinigami'].bgView);
    proof.style = await page.evaluate(() => { const s = document.querySelector('.bha-room__scene'); return [s.style.backgroundSize, s.style.backgroundPosition]; });
    await shot('2-tool-bg-panel.png', true);
    await shot('3-after-zoom-pan.png');
  } catch (e) {
    proof.errors.push(e.message);
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    console.log(JSON.stringify(proof, null, 2));
    await browser.close();
    srv.stop();
  }
})();
