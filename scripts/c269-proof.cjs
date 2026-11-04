// C.269 proof: 가방 그림 교체(사용자 업로드) + 가방 ×0.86 두 종족 반영 (bha-layout-20261104-0113.json) — 방 기기 화면 캡처 (1배)
// 편집 없는 ?layout 도구 = 실제 게임 화면 코드 + 게임 데이터 그대로 → 방 두 종족 기기 화면만 캡처 (1배, 기기 844×390)
// 실행: node scripts/c269-proof.cjs (C269_URL=<주소> 로 이미 뜬 서버 사용)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c269');
const PORT = 5369;
async function startServer() {
  if (process.env.C269_URL) return { url: process.env.C269_URL, stop: () => {} };
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
  const proof = { shots: [], errors, overlaps: {} };
  try {
    await page.goto(srv.url);
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${srv.url}?layout`);
    await page.waitForTimeout(1200);
    const ids = ['room.hollow', 'room.shinigami'];
    for (const [n, id] of ids.entries()) {
      await page.locator('.bha-ltool__select').selectOption(id);
      await page.waitForTimeout(1500);
      const name = `${n + 1}-${id.replace('.', '-')}.png`;
      await page.locator('.bha-ltool__frame').screenshot({ path: path.join(OUT, name) });
      proof.shots.push(name);
      // 물건 그림·이름표 상자끼리 겹침 (px)
      proof.overlaps[id] = await page.evaluate(() => {
        const boxes = [...document.querySelectorAll('.bha-room__scene .bha-prop')].filter((e) => !e.hidden).map((e) => [e.dataset.prop, e.querySelector('.bha-prop__shape').getBoundingClientRect(), e.querySelector('.bha-prop__tag').getBoundingClientRect()]);
        const out = [];
        const ov = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
          const [ka, sa, ta] = boxes[i];
          const [kb, sb, tb] = boxes[j];
          const area = Math.round(ov(sa, sb) + ov(sa, tb) + ov(ta, sb) + ov(ta, tb));
          if (area > 0) out.push(`${ka}×${kb} ${area}px²`);
        }
        return out;
      });
    }
  } catch (e) {
    proof.errors.push(e.message);
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    console.log(JSON.stringify(proof, null, 2));
    await browser.close();
    srv.stop();
  }
})();
