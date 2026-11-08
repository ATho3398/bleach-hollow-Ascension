// C.284 보충 (마스터AF 16:21): 머리 위 칩 줄·말풍선·이름표가 LCD 끝에서 잘리지 않는지 — 캐릭터 자리 극단값(왼쪽 3%·오른쪽 97%)과 온천 들어오는 중(오른쪽 끝) 캡처.
// 실행: node scripts/c284-edge.cjs (C284_URL=<주소>). 결과 docs/captures/c284/edge-*.png + edge.json(LCD 밖으로 나간 요소 목록)
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const URL = process.env.C284_URL || 'http://localhost:5384/';
const OUT = path.join(path.resolve(__dirname, '..'), 'docs/captures/c284');
const outside = () => {
  const v = document.querySelector('.bha-lcd__view') || document.querySelector('.bha-lcd');
  const L = v.getBoundingClientRect();
  return [...document.querySelectorAll('.bha-room__chips, .bha-room__bubble:not([hidden]), .bha-room__hp, .bha-prop__tag, .bha-spa__status')]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 1 && getComputedStyle(e).visibility !== 'hidden' && (r.left < L.left - 0.5 || r.right > L.right + 0.5 || r.top < L.top - 0.5); })
    .map((e) => `${String(e.className).split(' ')[0]} ${Math.round(e.getBoundingClientRect().left)}~${Math.round(e.getBoundingClientRect().right)} (LCD ${Math.round(L.left)}~${Math.round(L.right)})`);
};
(async () => {
  const browser = await chromium.launch();
  const res = {};
  for (const fi of [0, 1]) {
    const f = fi === 0 ? 'hollow' : 'shinigami';
    const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
    const wait = (ms) => page.waitForTimeout(ms);
    const shot = async (n) => { await wait(300); await page.screenshot({ path: path.join(OUT, `edge-${f}-${n}.png`) }); res[`${f}-${n}`] = await page.evaluate(outside); };
    await page.goto(`${URL}?test=1`); await page.evaluate(() => localStorage.clear()); await page.goto(`${URL}?test=1`); await wait(1200);
    await page.getByRole('button', { name: '새로 시작' }).click(); await wait(300);
    await page.locator('.bha-slot').first().click(); await wait(200);
    await page.getByRole('button', { name: '확인' }).click(); await wait(300);
    await page.locator('.bha-species__card').nth(fi).click(); await wait(300);
    await page.getByRole('button', { name: '시작', exact: true }).click(); await wait(3000);
    for (const [n, x] of [['room-left', '3%'], ['room-right', '97%']]) {
      // 캐릭터 자리를 극단값으로 옮긴다 (칩 줄·말풍선·체력 막대는 --char-x 를 따른다)
      await page.evaluate((cx) => { const sc = document.querySelector('.bha-room__scene'); sc.style.setProperty('--char-x', cx); document.querySelector('.bha-char').style.left = cx; }, x);
      await shot(n);
      await page.locator('.bha-char').first().click({ force: true }); await wait(400);
      await page.evaluate((cx) => { const sc = document.querySelector('.bha-room__scene'); sc.style.setProperty('--char-x', cx); }, x);
      await shot(`${n}-bubble`);
      await wait(3200);
    }
    await page.locator('.bha-prop--outside').first().click(); await wait(2200);
    await page.locator('.bha-worldmap [data-place="spa"]').first().click(); await wait(900);
    await shot('spa-entering');
    await wait(3000);
    await shot('spa-seated');
    await page.close();
  }
  fs.writeFileSync(path.join(OUT, 'edge.json'), JSON.stringify(res, null, 2));
  console.log(JSON.stringify(res, null, 1));
  await browser.close();
})();
