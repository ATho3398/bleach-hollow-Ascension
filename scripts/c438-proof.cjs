// C.438 proof (GDD 12-4 v6.045): Unknown;03398 조각 모델 — 교체 조각도 그림 검사 + 칸 바탕 채움(꽉 찬 네모 덩어리). 방 시간 차 3장 · 모노톤 섞인 순간 ·
// 칸마다 불투명 화소 비율 측정(opaque) · 동작 줄이기 = 고정. PC 844×390 + 폰 796×384, 1배. 실행: node scripts/c437-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c438'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PH = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function skipTut(page) {
  for (let t = 0; t < 40 && (await page.locator('.bha-tut').count()); t++) {
    const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled])').filter({ visible: true });
    if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
    else await page.locator('.bha-lcd').first().click({ timeout: 2000 }).catch(() => {});
    await wait(400);
  }
}
async function newGame(page, url) {
  const u = `${url}?test=1`;
  await page.goto(u);
  await page.evaluate(() => localStorage.clear());
  await page.goto(u);
  await wait(1200);
  await page.getByRole('button', { name: '새로 시작' }).click();
  await wait(300);
  await page.locator('.bha-slot').first().click();
  await page.getByRole('button', { name: '확인' }).click();
  await wait(300);
  await page.locator('.bha-species__card').nth(0).click();
  await wait(300);
  await page.getByRole('button', { name: '네', exact: true }).click();
  await wait(400);
  const nm = page.locator('[data-ident="name"]');
  if (await nm.count()) {
    await nm.fill('권영');
    await nm.press('Enter');
    await wait(300);
    await page.locator('.bha-ident__gender[data-gender="male"]').click();
    await page.locator('.bha-ident .bha-btn--primary').last().click();
  }
  await wait(2500);
  await skipTut(page);
}
async function back(page) {
  await page.locator('.bha-dev__btn[aria-label="취소"]').first().click({ timeout: 2000 }).catch(() => {});
  await wait(700);
  // 방에서 누르면 '처음 화면으로' 창 — 닫는다
  const no = page.getByRole('button', { name: '아니요', exact: true }).filter({ visible: true });
  if (await no.count()) { await no.first().click({ timeout: 2000 }).catch(() => {}); await wait(400); }
}
async function openTest(page, tabName) {
  await page.getByRole('button', { name: /더보기/ }).first().click({ timeout: 3000 });
  await wait(400);
  await page.getByRole('button', { name: '테스트', exact: true }).first().click({ timeout: 3000 });
  await wait(700);
  await page.locator('.bha-test-page .bha-viewtitle, .bha-test-page [aria-haspopup]').first().click({ timeout: 2000 }).catch(() => {});
  await wait(300);
  await page.getByRole('option', { name: tabName }).or(page.getByRole('menuitemradio', { name: tabName })).or(page.getByRole('button', { name: tabName })).first().click({ timeout: 3000 });
  await wait(600);
}


const mosaicState = (page) => page.evaluate(() => [...document.querySelectorAll('img.bha-mosaic')].filter((i) => i.isConnected).map((i) => ({ full: i.dataset.mosaicFull ?? '', mono: Number(i.dataset.mosaicMono ?? 0), src: i.src.slice(-40) }))[0] ?? null);
async function waitFor(page, pred, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const s = await mosaicState(page); if (s && pred(s)) return s; await wait(40); }
  return null;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { errors: [], shots: [], facts: {} };
  let n = 1;
  try {
    for (const [dk, opts] of [['pc', PC], ['phone', PH], ['reduced', { ...PC, reducedMotion: 'reduce' }]]) {
      const ctx = await browser.newContext(opts);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`${dk}: ${e.message.slice(0, 200)}`));
      const shot = async (name) => { const f = `${String(n++).padStart(2, '0')}-${dk}-${name}.png`; await page.screenshot({ path: path.join(OUT, f) }); proof.shots.push(f); };
      const facts = (proof.facts[dk] = {});
      await newGame(page, server.url);
      await openTest(page, '붕옥·초월자');
      await page.getByRole('button', { name: /^Unknown/ }).first().click({ timeout: 3000 }).catch((e) => proof.errors.push(`${dk} grant: ${String(e).slice(0, 120)}`));
      await wait(3000);
      await back(page);
      await skipTut(page);
      await wait(1000);
      if (dk === 'reduced') { // 동작 줄이기: 2초 동안 그림 그대로
        const a = await mosaicState(page); await wait(2000); const b = await mosaicState(page);
        facts.reducedSame = !!a && !!b && a.src === b.src;
        if (!facts.reducedSame) proof.errors.push('reduced motion: 그림이 바뀜');
        await ctx.close();
        continue;
      }
      // 1) 시간 차 3장 (조각이 계속 바뀜 — 몸 전체 흑백이 아닐 때)
      const srcs = [];
      for (let k = 0; k < (dk === 'pc' ? 3 : 1); k++) {
        const s = await waitFor(page, (x) => x.full === '', 4000);
        srcs.push(s && s.src);
        await shot(`room-t${k}`);
        await wait(1200);
      }
      facts.changing = new Set(srcs).size === srcs.length;
      if (dk !== 'pc') { await ctx.close(); continue; }
      // 2) 모노톤·흑백 조각 섞인 순간
      facts.monoMoment = await waitFor(page, (x) => x.full === '' && x.mono >= 3, 20000);
      await shot('room-mono-pieces');
      // 칸 불투명 비율: 지금 그림을 캔버스에 그려 칸(32×32)마다 alpha>32 비율의 최솟값
      facts.opaque = await page.evaluate(async () => {
        const im = document.querySelector('img.bha-mosaic');
        if (!im) return null;
        const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
        const ctx = cv.getContext('2d'); ctx.drawImage(im, 0, 0);
        const out = 32, px = ctx.getImageData(0, 0, cv.width, cv.height).data;
        let min = 1;
        for (let cy = 0; cy < cv.height / out; cy++) for (let cx = 0; cx < cv.width / out; cx++) {
          let on = 0;
          for (let y = 0; y < out; y++) for (let x = 0; x < out; x++) if (px[((cy * out + y) * cv.width + cx * out + x) * 4 + 3] > 32) on++;
          min = Math.min(min, on / (out * out));
        }
        return { size: [cv.width, cv.height], minCellOpaque: min };
      });
      if (!facts.opaque || facts.opaque.minCellOpaque < 1) proof.errors.push('칸에 투명 화소가 남음');
      await ctx.close();
    }
  } catch (e) {
    proof.errors.push(String(e).slice(0, 300));
  } finally {
    await browser.close();
    server.stop?.();
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    console.log(JSON.stringify(proof, null, 1));
    process.exit(0);
  }
})();
