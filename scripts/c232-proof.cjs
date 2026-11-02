// C.232 proof (GDD 156장): 설정 '전체 화면' 줄 ① 브라우저 탭 ② 앱 모드 흉내(display-mode fullscreen 에뮬레이션).
// 캡처 docs/captures/c232/ (1배 844×390). 실행: node scripts/c232-proof.cjs (C232_URL=<주소>)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c232');
const PORT = 5332;

async function startServer() {
  if (process.env.C232_URL) return { url: process.env.C232_URL, stop: () => {} };
  const p = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe', detached: true });
  const url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) return { url, stop: () => { try { process.kill(-p.pid); } catch { /* 이미 */ } } }; } catch { /* 아직 */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  try { process.kill(-p.pid); } catch { /* */ }
  throw new Error('vite 서버가 뜨지 않았다');
}

async function shot(browser, url, appMode, file) {
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  if (appMode) {
    // 크롬 CDP 는 display-mode 에뮬레이션을 안 받아서 matchMedia 를 감싸 (display-mode: fullscreen) 만 참으로 돌려준다
    await page.addInitScript(() => {
      const orig = window.matchMedia.bind(window);
      window.matchMedia = (q) => (q.replace(/\s/g, '') === '(display-mode:fullscreen)' ? { ...orig(q), matches: true, media: q } : orig(q));
    });
  }
  await page.goto(url);
  await page.waitForTimeout(1500);
  const mode = await page.evaluate(() => matchMedia('(display-mode: fullscreen)').matches);
  await page.getByRole('button', { name: '설정' }).first().click();
  await page.waitForTimeout(600);
  const p = page.locator('[data-panel="fullscreen"]');
  await p.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(300);
  console.log(file, 'display-mode fullscreen =', mode, '|', (await p.innerText()).replace(/\n/g, ' / '));
  await page.screenshot({ path: path.join(OUT, file) });
  await page.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  try {
    await shot(browser, srv.url, false, '1-settings-browser-tab.png');
    await shot(browser, srv.url, true, '2-settings-app-mode.png');
  } finally {
    await browser.close();
    srv.stop();
  }
})();
