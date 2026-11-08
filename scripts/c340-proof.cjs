// C.340 proof (GDD 205장 · 115-A 85): 적 덩치(<속성>-basic) = 종이인형 덩치(속성 색) — 전투에서 캔버스로 움직이는지, 대기·공격·맞음 캡처.
// 실행: node scripts/c340-proof.cjs (C340_URL=<주소>). 캡처 1배 844×390 docs/captures/c340/. 덩치가 나올 때까지 새로 시작(최대 8번)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c340');
const PORT = 5391;

async function startServer() {
  if (process.env.C340_URL) return { url: process.env.C340_URL, stop: () => {} };
  const p = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe', detached: true });
  const url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) return { url, stop: () => { try { process.kill(-p.pid); } catch { /* */ } } }; } catch { /* */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite 서버가 뜨지 않았다');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { tries: [], shots: [], foe: null, errors: [] };
  try {
    for (let n = 0; n < 8 && !proof.foe; n++) {
      const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
      page.on('pageerror', (e) => proof.errors.push(e.message));
      const wait = (ms) => page.waitForTimeout(ms);
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
      await page.locator('.bha-species__card').nth(n % 2).click();
      await wait(300);
      await page.getByRole('button', { name: '시작', exact: true }).click();
      await wait(400);
      const input = page.locator('[data-ident="name"]');
      if (await input.count()) {
        await input.fill('시험');
        await page.locator('[data-ident="next"]').click();
        await wait(200);
        await page.locator('.bha-ident__gender').first().click();
        await page.locator('[data-ident="done"]').click();
      }
      await wait(4000);
      await page.locator('.bha-prop--outside').first().click();
      await wait(900);
      await page.locator('.bha-worldmap [data-place="adventure"]').first().click();
      await wait(2200);
      await page.locator('.bha-lcd').getByRole('button', { name: '★1', exact: true }).first().click();
      await wait(400);
      await page.locator('.bha-lcd').getByRole('button', { name: '출발', exact: true }).first().click();
      await page.locator('.bha-battle').waitFor({ timeout: 60_000 });
      await wait(1500);
      const info = await page.evaluate(() => {
        const s = window.__bhaCombat;
        const foe = document.querySelector('.bha-unit--foe');
        return { enemy: s?.enemy?.id ?? s?.enemyId ?? null, rigCanvas: !!foe?.querySelector('canvas.bha-rigcanvas'), img: foe?.querySelector('img')?.getAttribute('src') ?? null };
      });
      proof.tries.push(info);
      console.log('try', n, JSON.stringify(info));
      if (info.rigCanvas) {
        proof.foe = info;
        const fname = n % 2 === 0 ? 'hollow' : 'shinigami';
        for (let i = 0; i < 6; i++) {
          const file = `${fname}-battle-${i}.png`;
          await page.screenshot({ path: path.join(OUT, file) });
          proof.shots.push(file);
          await wait(700);
        }
      }
      await page.close();
    }
  } finally {
    await browser.close();
    srv.stop();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 1));
})();
