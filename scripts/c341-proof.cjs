// C.341 proof (GDD 206장): 덩치 몸 적(sturdy·heavy-*·stance) 종이인형 · 호로 덩치 외형(거구·망령·속박자) · 그림 지운 외형(사마귀) 자리표시.
// 실행: node scripts/c341-proof.cjs (C341_URL=<주소>). 캡처 1배 PC 844×390 / 폰 796×384, docs/captures/c341/
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c341');
const PORT = 5392;

async function startServer() {
  if (process.env.C341_URL) return { url: process.env.C341_URL, stop: () => {} };
  const p = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe', detached: true });
  const url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) return { url, stop: () => { try { process.kill(-p.pid); } catch { /* */ } } }; } catch { /* */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite 서버가 뜨지 않았다');
}


const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PH = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };

async function newHollow(page, url, look) {
  const wait = (ms) => page.waitForTimeout(ms);
  await page.goto(`${url}?test=1`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${url}?test=1`);
  await wait(1200);
  await page.getByRole('button', { name: '새로 시작' }).click();
  await wait(300);
  await page.locator('.bha-slot').first().click();
  await wait(200);
  await page.getByRole('button', { name: '확인' }).click();
  await wait(300);
  await page.locator('.bha-species__card').nth(0).click();
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
  await wait(1500);
  // 시작 외형 고정: 세이브 안 evolution.look 을 바꾸고 다시 불러온다
  const changed = await page.evaluate((look) => {
    let n = 0;
    const fix = (o) => { if (!o || typeof o !== 'object') return; if (o.evolution && 'look' in o.evolution) { o.evolution.look = look; o.skin = null; n++; } for (const v of Object.values(o)) fix(v); };
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i); const raw = localStorage.getItem(k);
      try { const j = JSON.parse(raw); const before = n; fix(j); if (n > before) localStorage.setItem(k, JSON.stringify(j)); } catch { /* */ }
    }
    return n;
  }, look);
  await page.reload();
  await wait(1200);
  await page.getByRole('button', { name: '이어하기' }).click();
  await wait(3500);
  return changed;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { rooms: [], battle: [], shots: [], errors: [] };
  const shot = async (page, file) => { await page.screenshot({ path: path.join(OUT, file) }); proof.shots.push(file); };
  try {
    // 방: 거구(PC) · 망령(폰) · 속박자(PC) · 사마귀(폰, 그림 지움 → 자리표시)
    for (const [look, dev, file] of [['brute', PC, '1-room-brute-pc.png'], ['ghoul', PH, '2-room-ghoul-phone.png'], ['shackled', PC, '3-room-shackled-pc.png'], ['mantis', PH, '4-room-mantis-phone.png']]) {
      const page = await browser.newPage(dev);
      page.on('pageerror', (e) => proof.errors.push(e.message));
      const changed = await newHollow(page, srv.url, look);
      const info = await page.evaluate(() => { const c = document.querySelector('.bha-room'); return { rigCanvas: !!c?.querySelector('canvas.bha-rigcanvas'), imgs: [...(c?.querySelectorAll('img') ?? [])].map((i) => i.getAttribute('src')).filter((s) => /rig|char|skin/.test(s ?? '')) }; });
      proof.rooms.push({ look, changed, ...info });
      console.log(look, changed, JSON.stringify(info));
      await shot(page, file);
      await page.close();
    }
    // 전투 ★1 (테스트 패널 바로 전투): 덩치 sturdy(갑각형) — PC, heavy-chain(브라세로) — 폰. 내 외형 거구
    for (const [foeName, dev, tag] of [['갑각형', PC, 'pc'], ['브라세로', PH, 'phone']]) {
      const page = await browser.newPage(dev);
      page.on('pageerror', (e) => proof.errors.push(e.message));
      const wait = (ms) => page.waitForTimeout(ms);
      await newHollow(page, srv.url, 'brute');
      await page.getByRole('button', { name: '더보기' }).first().click({ timeout: 4000 });
      await wait(400);
      await page.getByRole('button', { name: '테스트' }).first().click({ timeout: 4000 });
      await wait(600);
      await page.locator('.bha-viewtitle button').first().click({ timeout: 4000 });
      await wait(400);
      await page.getByText('바로 전투', { exact: true }).first().click({ timeout: 4000 });
      await wait(500);
      await page.getByRole('button', { name: '상대' }).first().click({ timeout: 4000 });
      await wait(400);
      await page.locator('[role="option"]').filter({ visible: true }).filter({ hasText: foeName }).first().click();
      await wait(300);
      await page.getByRole('button', { name: '전투 시작' }).click({ timeout: 4000 });
      await page.locator('.bha-battle').waitFor({ timeout: 60_000 });
      await wait(1800);
      const info = await page.evaluate(() => {
        const s = window.__bhaCombat;
        const foe = document.querySelector('.bha-unit--foe');
        const me = document.querySelector('.bha-unit:not(.bha-unit--foe)');
        return { enemy: s?.enemy?.def?.id ?? s?.enemy?.id ?? null, foeRig: !!foe?.querySelector('canvas.bha-rigcanvas'), meRig: !!me?.querySelector('canvas.bha-rigcanvas') };
      });
      proof.battle.push(info);
      console.log('battle', JSON.stringify(info));
      await shot(page, `${tag === 'pc' ? 5 : 6}-battle-${info.enemy}-${tag}.png`);
      await page.close();
    }
  } finally {
    await browser.close();
    srv.stop();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify({ shots: proof.shots, errors: proof.errors }, null, 1));
})();
