// C.243 proof (GDD 166장): 설정 '전체 화면' 줄 ① 홈 화면 앱 standalone 흉내 ② display-mode fullscreen 흉내 ③ 일반 탭.
// 캡처 docs/captures/c243/ (1배 844×390). 실행: node scripts/c243-proof.cjs (C243_URL=<주소>)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c243');
const PORT = 5343;

async function startServer() {
  if (process.env.C243_URL) return { url: process.env.C243_URL, stop: () => {} };
  const p = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe', detached: true });
  const url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) return { url, stop: () => { try { process.kill(-p.pid); } catch { /* 이미 */ } } }; } catch { /* 아직 */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  try { process.kill(-p.pid); } catch { /* */ }
  throw new Error('vite 서버가 뜨지 않았다');
}

async function shot(browser, url, mode, file) {
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  if (mode) {
    // 크롬 CDP 는 display-mode 에뮬레이션을 안 받아서 matchMedia 를 감싸 (display-mode: <mode>) 만 참으로 돌려준다
    await page.addInitScript((m) => {
      const orig = window.matchMedia.bind(window);
      window.matchMedia = (q) => (q.replace(/\s/g, '') === `(display-mode:${m})` ? { ...orig(q), matches: true, media: q } : orig(q));
    }, mode);
  }
  await page.goto(url);
  await page.waitForTimeout(1500);
  const fsMode = await page.evaluate(() => matchMedia('(display-mode: fullscreen)').matches);
  await page.getByRole('button', { name: '설정' }).first().click();
  await page.waitForTimeout(600);
  const p = page.locator('[data-panel="fullscreen"]');
  await p.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(300);
  console.log(file, 'mode =', mode, 'display-mode fullscreen =', fsMode, '|', (await p.innerText()).replace(/\n/g, ' / '));
  await page.screenshot({ path: path.join(OUT, file) });
  await page.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  try {
    await shot(browser, srv.url, 'standalone', '1-settings-standalone.png');
    await shot(browser, srv.url, 'fullscreen', '2-settings-display-fullscreen.png');
    await shot(browser, srv.url, null, '3-settings-browser-tab.png');
  } finally {
    await browser.close();
    srv.stop();
  }
})();
