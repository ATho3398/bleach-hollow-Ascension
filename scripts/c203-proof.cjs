// C.203 (GDD 129-1) proof: 저절로 뜨는 튜토리얼 안내 카드 회색 덮개 없음 · 장터/온천 '방으로 돌아가기' 왼쪽 위 같은 자리. 캡처 docs/captures/c203/
// 실행: node scripts/c203-proof.cjs (vite 를 띄운다, C203_URL=<주소> 면 그 주소)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c203');
const PORT = 5303;

async function startServer() {
  if (process.env.C203_URL) return { url: process.env.C203_URL, stop: () => {} };
  const p = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe' });
  const url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) return { url, stop: () => p.kill() }; } catch { /* 아직 */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  p.kill();
  throw new Error('vite 서버가 뜨지 않았다');
}

async function newGame(page, url, fi, test) {
  await page.goto(`${url}${test ? '?test=1' : ''}`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${url}${test ? '?test=1' : ''}`);
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

/** 떠 있는 튜토리얼 안내 카드들: 이름·덮개(구멍 box-shadow)·is-nodim·다시 보기 */
const tutState = () => [...document.querySelectorAll('.bha-tut')].map((t) => {
  const hole = t.querySelector('.bha-tut__hole');
  const cs = hole ? getComputedStyle(hole) : null;
  return { name: t.dataset.tutorial, nodim: t.classList.contains('is-nodim'), replay: t.hasAttribute('data-replay'), dim: !!cs && cs.display !== 'none' && cs.boxShadow !== 'none', title: t.querySelector('.bha-tut__title')?.textContent ?? '', step: t.querySelector('.bha-tut__step')?.textContent ?? '' };
});
/** 공간 화면 '방으로 돌아가기' 자리 (LCD 기준) */
const backRect = () => {
  const b = document.querySelector('.bha-lcd [data-space-back]');
  const o = document.querySelector('.bha-lcd')?.getBoundingClientRect();
  if (!b || !o) return null;
  const r = b.getBoundingClientRect();
  return { text: b.textContent.trim(), x: Math.round(r.left - o.left), y: Math.round(r.top - o.top), w: Math.round(r.width), h: Math.round(r.height) };
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { guides: [], spaces: {} };
  try {
    // ① 첫 원정 튜토리얼: 첫 원정 안내(first-run) → 각본 전투 → 첫 포식 안내(first-absorb)
    for (const [fi, faction] of process.env.C203_FACTION ? [[Number(process.env.C203_FACTION), ['hollow', 'shinigami'][Number(process.env.C203_FACTION)]]] : [[0, 'hollow'], [1, 'shinigami']]) {
      const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await newGame(page, server.url, fi, false);
      const p = faction === 'hollow' ? 'h' : 's';
      const seen = new Set();
      const dev = (name) => page.locator(`.bha-dev__btn[aria-label="${name}"]`).first();
      for (let t = 0; t < 500; t++) {
        const st = await page.evaluate(tutState);
        if (process.env.C203_DEBUG && t % 10 === 0) console.log(t, await page.evaluate(() => [...document.querySelectorAll('.bha-lcd .bha-app')].map((e) => e.className).join('|')), JSON.stringify(st.map((g) => g.name + ':' + g.step)));
        for (const g of st) {
          const key = `${g.name}|${g.title}`;
          if (seen.has(key)) continue;
          seen.add(key);
          proof.guides.push({ faction, ...g });
          if (g.name === 'first-run' && faction === 'hollow' && !seen.has('shot-first-run')) {
            seen.add('shot-first-run');
            await page.waitForTimeout(400);
            await page.screenshot({ path: path.join(OUT, `${p}-1-first-run-guide.png`) });
          }
          if (g.name === 'first-absorb' && !seen.has('shot-absorb')) {
            seen.add('shot-absorb');
            await page.waitForTimeout(400);
            await page.screenshot({ path: path.join(OUT, `${p}-2-first-absorb-guide.png`) });
          }
        }
        if (seen.has('shot-absorb')) break;
        if (st.length) {
          const s = await page.evaluate(() => { const l = document.querySelector('.bha-tut[data-dev-pass]'); const sel = document.querySelector('.bha-sel'); return { wait: !!l, sel: sel ? (sel.dataset.sc ?? '') : '' }; });
          if (s.wait && !(s.sel === 'guard' || s.sel.startsWith('block.'))) await dev('아래').click().catch(() => {});
          else await dev('확정').click().catch(() => {});
          await page.waitForTimeout(500);
        } else {
          if (!(await page.locator('.bha-battle, .bha-exp').count())) await page.locator('.bha-prop--door').first().click({ timeout: 1500 }).catch(() => {});
          const layerGo = page.locator('.bha-lcd [data-dev-layer] button.bha-btn--primary').filter({ visible: true });
          if (await layerGo.count()) await layerGo.first().click({ timeout: 1500 }).catch(() => {});
          await page.waitForTimeout(400);
        }
      }
      proof[`${faction}Errors`] = errors;
      await page.close();
    }
    // ② 공간 화면 (테스트 모드): 장터 → 온천 (체력 40%)
    {
      const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
      await newGame(page, server.url, 0, true);
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
      await page.waitForTimeout(500);
      await page.click('.bha-prop--market');
      await page.waitForTimeout(900);
      proof.spaces.market = await page.evaluate(backRect);
      proof.spaces.marketDevOrder = await page.evaluate(() => { const s = document.querySelector('.bha-lcd .bha-sel'); return s?.textContent?.trim() ?? null; });
      await page.screenshot({ path: path.join(OUT, 'h-3-market.png') });
      await page.click('.bha-market [data-spot="spa"]');
      await page.waitForTimeout(3300);
      proof.spaces.spa = await page.evaluate(backRect);
      await page.screenshot({ path: path.join(OUT, 'h-4-spa.png') });
      const a = proof.spaces.market, b = proof.spaces.spa;
      proof.spaces.same = !!a && !!b && a.text === b.text && Math.abs(a.x - b.x) <= 1.5 && Math.abs(a.y - b.y) <= 1.5 && Math.abs(a.w - b.w) <= 1.5 && Math.abs(a.h - b.h) <= 1.5;
      await page.close();
    }
  } finally {
    await browser.close();
    server.stop();
  }
  proof.anyAutoDim = proof.guides.filter((g) => !g.replay && g.dim);
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify({ guides: proof.guides.map((g) => `${g.faction}:${g.name}:${g.dim ? 'DIM' : 'nodim'}`), spaces: proof.spaces, anyAutoDim: proof.anyAutoDim.length }, null, 1));
})();
