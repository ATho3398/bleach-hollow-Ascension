// C.204 (GDD 130장) proof: 방 [밖으로] → 월드맵(홈·시장·모험) → 시장(온천·상점·떠돌이 상인), 기기 버튼·뒤로. 캡처 docs/captures/c204/
// 실행: node scripts/c204-proof.cjs (vite 를 띄운다, C204_URL=<주소> 면 그 주소)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c204');
const PORT = 5304;

async function startServer() {
  if (process.env.C204_URL) return { url: process.env.C204_URL, stop: () => {} };
  const p = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe' });
  const url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) return { url, stop: () => p.kill() }; } catch { /* 아직 */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  p.kill();
  throw new Error('vite 서버가 뜨지 않았다');
}

async function newGame(page, url, fi) {
  await page.goto(`${url}?test=1`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${url}?test=1`);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '새로 시작' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-slot').first().click();
  await page.getByRole('button', { name: '확인' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-species__card').nth(fi).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await page.waitForTimeout(1500);
}

const sel = () => document.querySelector('.bha-lcd .bha-sel')?.getAttribute('aria-label') ?? document.querySelector('.bha-lcd .bha-sel')?.textContent?.trim() ?? null;
const screen = () => [...document.querySelectorAll('.bha-lcd .bha-app')].map((e) => e.className).join('|');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = {};
  try {
    for (const [fi, faction] of [[0, 'hollow'], [1, 'shinigami']]) {
      const p = faction === 'hollow' ? 'h' : 's';
      const r = (proof[faction] = { errors: [] });
      const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
      page.on('pageerror', (e) => r.errors.push(e.message));
      await newGame(page, server.url, fi);
      for (let i = 0; i < 6 && (await page.locator('.bha-lcd [data-dev-layer]').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
      const dev = (name) => page.locator(`.bha-dev__btn[aria-label="${name}"]`).first();
      // 온천에 들어갈 수 있게 체력 40% (테스트 패널 둥지·시간)
      await page.locator('.bha-lcd').getByRole('button', { name: '더보기' }).click();
      await page.locator('.bha-homedock__tray').getByRole('button', { name: '테스트' }).click();
      await page.waitForTimeout(600);
      await page.click('.bha-lcd .bha-viewtitle__btn');
      await page.locator('.bha-viewtitle__list').getByRole('option', { name: '둥지·시간' }).click();
      await page.waitForTimeout(300);
      await page.locator('.bha-lcd input[type="number"]').nth(3).fill('40');
      await page.locator('.bha-lcd').getByRole('button', { name: '적용' }).click();
      await page.waitForTimeout(300);
      for (let i = 0; i < 4 && (await page.locator('.bha-lcd [data-dev-layer]').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(800);
      r.roomProps = await page.evaluate(() => [...document.querySelectorAll('.bha-room .bha-prop')].map((b) => `${b.dataset.prop}:${b.getAttribute('aria-label')}`));
      r.roomFirst = await page.evaluate(sel);
      if (p === 'h') await page.screenshot({ path: path.join(OUT, 'h-1-room-outside.png') });
      // 밖으로 → 월드맵
      await page.click('.bha-prop--outside');
      await page.waitForTimeout(800);
      r.worldmap = await page.evaluate(() => ({ title: document.querySelector('.bha-worldmap__title')?.textContent, places: [...document.querySelectorAll('.bha-worldmap [data-place]')].map((b) => `${b.dataset.place}:${b.getAttribute('aria-label')}`) }));
      r.worldFirst = await page.evaluate(sel);
      const order = [];
      for (let i = 0; i < 3; i++) { await dev('아래').click(); await page.waitForTimeout(150); order.push(await page.evaluate(sel)); }
      r.worldDownOrder = order;
      await page.screenshot({ path: path.join(OUT, `${p}-2-worldmap.png`) });
      // 기기 뒤로 = 방
      await dev('취소').click();
      await page.waitForTimeout(600);
      r.worldBack = await page.evaluate(screen);
      // 밖으로 → 시장 → [월드맵으로]
      await page.click('.bha-prop--outside');
      await page.waitForTimeout(600);
      await page.click('.bha-worldmap [data-place="market"]');
      await page.waitForTimeout(800);
      r.market = await page.evaluate(() => ({ title: document.querySelector('.bha-market__title')?.textContent, back: document.querySelector('[data-space-back]')?.textContent?.trim(), spots: [...document.querySelectorAll('.bha-market [data-spot]')].map((b) => b.dataset.spot) }));
      if (p === 's') await page.screenshot({ path: path.join(OUT, 's-3-market.png') });
      await page.click('.bha-market [data-spot="spa"]');
      await page.waitForTimeout(3300);
      r.spaBack = await page.evaluate(() => document.querySelector('[data-space-back]')?.textContent?.trim());
      await dev('취소').click();
      await page.waitForTimeout(600);
      r.spaBackTo = await page.evaluate(screen);
      await dev('취소').click();
      await page.waitForTimeout(600);
      r.marketBackTo = await page.evaluate(screen);
      // 모험 → 출발 준비 화면, 뒤로 = 월드맵
      await page.click('.bha-worldmap [data-place="adventure"]');
      await page.waitForTimeout(1200);
      r.adventure = await page.evaluate(screen);
      for (let i = 0; i < 6 && (await page.locator('.bha-lcd [data-dev-layer]').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
      await dev('취소').click();
      await page.waitForTimeout(700);
      r.adventureBackTo = await page.evaluate(screen);
      await page.close();
    }
  } finally {
    await browser.close();
    server.stop();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 1));
  process.exit(0); // npx vite 자식이 남아 끝나지 않는 것 방지
})();
