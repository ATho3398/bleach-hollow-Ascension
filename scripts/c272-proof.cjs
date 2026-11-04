// C.272 proof (사용자 "배경 바꾸기로 배경 넣었는데 까맣게 나오는 이유 찾아서 수정 / 호로랑 사신 각각 둥지랑 대원실 따로 넣었는데 통일된 이유 찾아서 수정"):
// ?layout 도구에 ① 2.7MB 급 큰 배경(노이즈 png, 브라우저에서 만듦)을 올려 까맣지 않게 걸리는지 ② 호로 둥지·사신 대원실에 서로 다른 그림을 올려 서로 안 덮는지
// ③ 옛 공통 키 prop.home 이 남은 저장본을 열면 정리되는지. 캡처 docs/captures/c272/ (1배). 실행: node scripts/c272-proof.cjs (C272_URL=<주소>)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c272');
const PORT = 5372;
async function startServer() {
  if (process.env.C272_URL) return { url: process.env.C272_URL, stop: () => {} };
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
  const proof = { shots: [], errors };
  const shot = async (name) => { await page.locator('.bha-ltool__frame').screenshot({ path: path.join(OUT, name) }); proof.shots.push(name); };
  const status = () => page.locator('.bha-ltool__status').textContent();
  const upload = async (btn, file) => {
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: btn }).click()]);
    await fc.setFiles(file);
    await page.waitForTimeout(1500);
  };
  try {
    await page.goto(srv.url);
    // 옛 도구 저장본: 공통 키 prop.home 에 그림
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('bha.layoutTool.v1', JSON.stringify({ v: 1, preview: false, scenes: {}, looks: { 'prop.home': { art: 'data:image/png;base64,AAAA' } } })); });
    await page.goto(`${srv.url}?layout`);
    await page.waitForTimeout(1200);
    proof.prune = await status();
    // ① 큰 배경: 2600×1500 노이즈 png (2MB 넘게)
    const bigB64 = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 2600; c.height = 1500;
      const g = c.getContext('2d');
      const im = g.createImageData(2600, 1500);
      let s = 1;
      for (let i = 0; i < im.data.length; i += 4) { s = (s * 1103515245 + 12345) & 0x7fffffff; im.data[i] = s & 255; im.data[i + 1] = (i >> 5) & 255; im.data[i + 2] = (i >> 13) & 255; im.data[i + 3] = 255; }
      g.putImageData(im, 0, 0);
      return c.toDataURL('image/png').split(',')[1];
    });
    const big = { name: 'big-bg.png', mimeType: 'image/png', buffer: Buffer.from(bigB64, 'base64') };
    proof.bigBytes = big.buffer.length;
    await page.locator('.bha-ltool__select').selectOption('room.hollow');
    await page.waitForTimeout(600);
    await upload('배경 바꾸기', big);
    proof.bg = { status: await status(), backgroundImage: await page.evaluate(() => getComputedStyle(document.querySelector('.bha-room__scene')).backgroundImage.slice(0, 20)) };
    await shot('1-big-bg-room-hollow.png');
    // ② 둥지·대원실 따로
    const pick = [['worldmap.hollow', path.join(ROOT, 'public/art/prop-tower.png')], ['worldmap.shinigami', path.join(ROOT, 'public/art/prop-chest.png')]];
    proof.home = {};
    for (const [id, file] of pick) {
      await page.locator('.bha-ltool__select').selectOption(id);
      await page.waitForTimeout(600);
      await page.locator('.bha-room__scene .bha-prop[data-prop="home"]').dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true });
      await page.waitForTimeout(300);
      await upload('그림 올리기', file);
      proof.home[id] = await page.locator('.bha-ltool__panel .bha-ltool__note').last().textContent();
    }
    for (const [n, id] of [[2, 'worldmap.hollow'], [3, 'worldmap.shinigami']]) {
      await page.locator('.bha-ltool__select').selectOption(id);
      await page.waitForTimeout(800);
      proof.home[`${id}.src`] = await page.evaluate(() => document.querySelector('.bha-room__scene .bha-prop[data-prop="home"] img')?.src.slice(0, 40) ?? null);
      await shot(`${n}-${id.replace('.', '-')}-home.png`);
    }
    proof.looks = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('bha.layoutTool.v1')).looks));
  } catch (e) {
    proof.errors.push(e.message);
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    console.log(JSON.stringify(proof, null, 2));
    await browser.close();
    srv.stop();
  }
})();
