// C.294 proof (GDD 187장, 코딩206): 전투 [막기] 왼쪽 블록 생성 게이지 이름표 = '블록' — 두 종족 평소·봉인 캡처 + 이름표 글자 기록.
// 실행: node scripts/c294-proof.cjs (C294_URL=<주소>, C294_FACTIONS=0,1). 캡처 1배 844×390 docs/captures/c294/
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c294');
const PORT = 5385;
const FACTIONS = (process.env.C294_FACTIONS ?? '0,1').split(',').map(Number);

async function startServer() {
  if (process.env.C294_URL) return { url: process.env.C294_URL, stop: () => {} };
  const p = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe', detached: true });
  const url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) return { url, stop: () => { try { process.kill(-p.pid); } catch { /* */ } } }; } catch { /* */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite 서버가 뜨지 않았다');
}

/** 배치 점검: 전투 루트 좌표계 안 위치(px) — 머리 줄 40·스킬창 130·블록 칸 정사각·생성 칸 초점 제외·버튼 높이 */
const layoutInPage = () => {
  const root = document.querySelector('.bha-root.bha-battle');
  if (!root) return null;
  const k = root.getBoundingClientRect().width / root.offsetWidth; // 화면 배율
  const o = root.getBoundingClientRect();
  const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round((r.left - o.left) / k), y: Math.round((r.top - o.top) / k), w: Math.round(r.width / k), h: Math.round(r.height / k) }; };
  const q = (s) => root.querySelector(s);
  const cells = [...root.querySelectorAll('.bha-v2cell')].map(box);
  const fonts = [...root.querySelectorAll('.bha-skillpanel *, .bha-v2toprow *')].filter((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && e.getClientRects().length)
    .map((e) => parseFloat(getComputedStyle(e).fontSize) );
  return {
    root: { w: root.offsetWidth, h: root.offsetHeight },
    top: box(q('.bha-v2toprow')), skill: box(q('.bha-skillpanel')), legend: box(q('.bha-v2legendrow')),
    gen: box(q('.bha-v2role--spawn')), genFocusable: q('.bha-v2role--spawn')?.matches('button, a[href], input, select, summary, [role="tab"], [data-dev-press]') ?? null,
    guard: box(q('.bha-v2role--guard')), item: box(q('.bha-v2role--item')), gear: box(q('.bha-v2role--gear')),
    cellsSquare: cells.every((c) => c && c.w === c.h), cell0: cells[0], cellCount: cells.length,
    me: box(q('.bha-unit--me .bha-unit__fig')), foe: box(q('.bha-unit--foe .bha-unit__fig')), meHp: box(q('.bha-unit--me .bha-v2hp')), foeHp: box(q('.bha-unit--foe .bha-v2hp')),
    minFont: Math.min(...fonts),
    topButtons: [...root.querySelectorAll('.bha-v2bar button')].map((b) => box(b).h),
  };
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { shots: [], label: {}, layout: {}, errors: [] };
  try {
    for (const fi of FACTIONS) {
      const fname = fi === 0 ? 'hollow' : 'shinigami';
      const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
      page.on('pageerror', (e) => proof.errors.push(`${fname}: ${e.message}`));
      const wait = (ms) => page.waitForTimeout(ms);
      const shot = async (name) => {
        await wait(350);
        const file = `${fname}-${name}.png`;
        await page.screenshot({ path: path.join(OUT, file) });
        proof.shots.push(file);
        console.log(file);
      };
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
      await page.locator('.bha-species__card').nth(fi).click();
      await wait(300);
      await page.getByRole('button', { name: '시작', exact: true }).click();
      await wait(2500);
      await page.locator('.bha-prop--outside').first().click();
      await wait(900);
      await page.locator('.bha-worldmap [data-place="adventure"]').first().click();
      await wait(2200);
      await page.locator('.bha-lcd').getByRole('button', { name: '★1', exact: true }).first().click();
      await wait(400);
      await page.locator('.bha-lcd').getByRole('button', { name: '출발', exact: true }).first().click();
      await page.locator('.bha-battle').waitFor({ timeout: 60_000 });
      await wait(5000);
      const label = () => page.evaluate(() => { const p = document.querySelector('.bha-v2gen, [class*="v2gen"]'); const names = [...document.querySelectorAll('.bha-v2gen__name')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.textContent); return { names, aria: p?.getAttribute('aria-label') ?? null }; });
      await shot('1-battle');
      proof.label[`${fname}-normal`] = await label();
      await page.evaluate(() => { const s = window.__bhaCombat; if (s) s.sealTicks = 60; });
      await wait(300);
      await shot('2-sealed');
      proof.label[`${fname}-sealed`] = await label();
      await page.close();
    }
  } finally {
    await browser.close();
    srv.stop();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 1));
})();
