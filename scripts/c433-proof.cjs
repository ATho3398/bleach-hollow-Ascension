// C.433 proof (사용자 "ui배치도구한테, 내가 방 새로 만드는 기능도 만들라해. 용도는 만들때마다 알려줄테니까 일단 만드는 기능 부터 구현 ㄱㄱ", GDD 17절 새 방 만들기):
// ?layout [새 방] → 이름 → 배경 고르기(게임 배경 scene-*) → 물건 넣기(월드맵 문·가방·책장) → 끌기 → 새로고침해도 남는지 → 내보내기 rooms(RoomDef 모양).
// 캡처 docs/captures/c433/ (1배). 실행: node scripts/c433-proof.cjs (C433_URL=<주소>)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c433');
const PORT = 5433;
async function startServer() {
  if (process.env.C433_URL) return { url: process.env.C433_URL, stop: () => {} };
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
  const ctx = await browser.newContext({ viewport: { width: 900, height: 980 }, deviceScaleFactor: 1, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const proof = { shots: [], errors };
  const S = 'select[aria-label="장면"]';
  const status = () => page.locator('.bha-ltool__status').textContent();
  const drawn = () => page.evaluate(() => [...document.querySelectorAll('.bha-room__scene .bha-prop')].filter((e) => !e.hidden).map((e) => e.dataset.prop));
  try {
    await page.goto(srv.url);
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${srv.url}?layout`);
    await page.waitForTimeout(1500);
    page.once('dialog', (d) => d.accept('연습 방'));
    await page.locator('[data-new-room]').click();
    await page.waitForTimeout(900);
    proof.created = { status: await status(), scene: await page.locator(S).inputValue(), drawn: await drawn() };
    proof.bgChoices = await page.evaluate(() => [...document.querySelectorAll('[data-room-bg] option')].map((o) => o.value));
    await page.screenshot({ path: path.join(OUT, '1-new-room-empty.png'), clip: { x: 0, y: 0, width: 900, height: 860 } });
    proof.shots.push('1-new-room-empty.png');
    await page.locator('[data-room-bg]').selectOption(proof.bgChoices.includes('scene.room-ichigo') ? 'scene.room-ichigo' : 'scene.room');
    await page.waitForTimeout(700);
    for (const k of ['outside', 'chest', 'book']) { await page.locator(`[data-room-prop="${k}"]`).click(); await page.waitForTimeout(500); }
    const bk = await page.locator('.bha-room__scene .bha-prop[data-prop="book"]').boundingBox();
    await page.mouse.move(bk.x + bk.width / 2, bk.y + bk.height / 3);
    await page.mouse.down();
    await page.mouse.move(bk.x + bk.width / 2 - 80, bk.y + bk.height / 3 + 10, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(700);
    proof.placed = { status: await status(), drawn: await drawn(), bg: await page.evaluate(() => getComputedStyle(document.querySelector('.bha-room__scene')).backgroundImage.slice(0, 60)) };
    await page.screenshot({ path: path.join(OUT, '2-new-room-placed.png'), clip: { x: 0, y: 0, width: 900, height: 860 } });
    proof.shots.push('2-new-room-placed.png');
    await page.reload();
    await page.waitForTimeout(1500);
    await page.locator(S).selectOption('newroom.room-1');
    await page.waitForTimeout(900);
    proof.afterReload = await drawn();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '내보내기' }).click()]);
    const file = path.join(OUT, 'export-sample.json');
    await dl.saveAs(file);
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    proof.exportRooms = j.rooms;
  } catch (e) {
    proof.errors.push(e.message);
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    console.log(JSON.stringify({ ...proof, exportRooms: Object.keys(proof.exportRooms ?? {}) }, null, 2));
    await browser.close();
    srv.stop();
  }
})();
