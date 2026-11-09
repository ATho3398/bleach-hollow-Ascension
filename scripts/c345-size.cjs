// C.345 size proof (GDD 206장 보충): 전투에서 적 덩치와 내 덩치의 화면상 키·도트 한 칸 px 실측 — 차 2% 안.
// 실행: npm run build → npx vite preview --port 5393 → node scripts/c345-size.cjs http://localhost:5393/ [적id,...]. 캡처 docs/captures/c345/
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const OUT = path.resolve(__dirname, '../docs/captures/c345');
const URL = process.argv[2] || 'http://localhost:5393/';
const FOES = (process.argv[3] || '갑각형:pc,짐승형:phone').split(',').map((x) => x.split(':'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PH = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };

async function newHollow(page, url, look, tier = 0, skin = null) {
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
  const changed = await page.evaluate(({ look, tier, skin }) => {
    let n = 0;
    const fix = (o, sh) => { if (!o || typeof o !== 'object') return; if (o.evolution && 'look' in o.evolution) { o.evolution.look = look; o.evolution.tierIndex = tier; o.skin = skin; if (skin && o.shared?.cosmetics && !o.shared.cosmetics.includes('skin-' + skin)) o.shared.cosmetics.push('skin-' + skin); n++; } for (const v of Object.values(o)) fix(v); };
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i); const raw = localStorage.getItem(k);
      try { const j = JSON.parse(raw); const before = n; fix(j); if (n > before) localStorage.setItem(k, JSON.stringify(j)); } catch { /* */ }
    }
    return n;
  }, { look, tier, skin });
  await page.reload();
  await wait(1200);
  await page.getByRole('button', { name: '이어하기' }).click();
  await wait(3500);
  return changed;
}



/** 캔버스(.bha-rigcanvas)의 그려진 덩치: 화면 키(px)·도트 한 칸(px) — 불투명 픽셀 범위를 캔버스 픽셀로 읽어 화면 비율로 바꾼다 */
const measure = (page) => page.evaluate(() => {
  const one = (sel) => {
    const c = document.querySelector(sel);
    if (!c) return null;
    const r = c.getBoundingClientRect();
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let top = -1, bot = -1;
    for (let y = 0; y < c.height; y++) { let any = false; for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 40) { any = true; break; } if (any) { if (top < 0) top = y; bot = y; } }
    const k = r.height / c.height; // 화면 px / 캔버스 px
    return { boxH: +r.height.toFixed(1), canvasH: c.height, figH: +((bot - top + 1) * k).toFixed(1), pxPerCanvas: +k.toFixed(4), dpr: devicePixelRatio };
  };
  return { hero: one('.bha-hero canvas.bha-rigcanvas'), foe: one('.bha-foe canvas.bha-rigcanvas') };
});

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const proof = { runs: [], errors: [] };
  for (const [foeName, devName, look = 'brute'] of FOES) {
    const dev = devName === 'pc' ? PC : PH;
    const page = await browser.newPage(dev);
    page.on('pageerror', (e) => proof.errors.push(e.message));
    const wait = (ms) => page.waitForTimeout(ms);
    await newHollow(page, URL, look);
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
    await wait(1500);
    const enemy = await page.evaluate(() => window.__bhaCombat?.enemy?.def?.id ?? window.__bhaCombat?.enemy?.id ?? null);
    const m = await measure(page);
    const ratio = m.hero && m.foe ? { fig: +(m.foe.figH / m.hero.figH).toFixed(4), dot: +(m.foe.pxPerCanvas / m.hero.pxPerCanvas).toFixed(4) } : null;
    const run = { enemy, dev: devName, look, ...m, ratio };
    proof.runs.push(run);
    console.log(JSON.stringify(run));
    if (process.env.SHOT) await page.screenshot({ path: path.join(OUT, `battle-${look}-vs-${enemy}-${devName}.png`) });
    await page.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, `size-proof${process.env.SHOT ? '' : '-draft'}.json`), JSON.stringify(proof, null, 2));
})();
