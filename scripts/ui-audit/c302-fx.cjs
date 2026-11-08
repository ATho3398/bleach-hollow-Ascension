// C.302 (GDD 190장 2): 전투 C.281 모양으로 되돌린 뒤 픽셀FX(185장) 이펙트가 그대로 나오는지 — 폰 796×384 터치, 블록을 눌러 이펙트(.bha-pxfx-wrap)가 뜬 순간을 찍는다
// 쓰기: node scripts/ui-audit/c302-fx.cjs <주소> <저장 폴더>
//   pc = 844×390 마우스(PC 고정 모드) · phone = 796×384 터치 · phone115 = 796×384 터치 + 글자 1.15
// 상태(평소·체인2·체인3·봉인·소모품 낀 것·해방)는 테스트 모드 전역 __bhaCombat 을 그 순간만 바꿔 만든다(보이는 모양 확인용)
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const [url, out, ...modesArg] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });

async function toBattle(page, fi) {
  await page.goto(`${url}?test=1`); await page.evaluate(() => localStorage.clear()); await page.goto(`${url}?test=1`); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '새로 시작' }).click(); await page.waitForTimeout(300);
  await page.locator('.bha-slot').first().click(); await page.waitForTimeout(200);
  await page.getByRole('button', { name: '확인' }).click(); await page.waitForTimeout(300);
  await page.locator('.bha-species__card').nth(fi).click(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: '시작', exact: true }).click(); await page.waitForTimeout(1800);
  await page.locator('.bha-prop--outside').first().click(); await page.waitForTimeout(700);
  await page.locator('.bha-worldmap [data-place="adventure"]').first().click(); await page.waitForTimeout(2000);
  await page.getByRole('button', { name: '★1', exact: true }).first().click().catch(() => {}); await page.waitForTimeout(300);
  await page.getByRole('button', { name: '출발', exact: true }).first().click();
  await page.locator('.bha-battle').waitFor({ timeout: 60_000 });
  await page.waitForFunction(() => {
    const s = window.__bhaCombat;
    return s && s.tray.some((b) => b.kind === 'skill' && b.family);
  }, null, { timeout: 30_000 });
}


(async () => {
  const b = await chromium.launch();
  for (const [fi, fac] of [[0, 'hollow'], [1, 'shinigami']]) {
    const page = await b.newPage({ viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await toBattle(page, fi);
    let ok = false;
    for (let t = 0; t < 12 && !ok; t++) {
      await page.evaluate(() => { const s = window.__bhaCombat; const k = s.tray.find((x) => x.kind === 'skill' && x.family); if (k) s.tray = [k, { ...k, uid: 88000 + Math.floor(Math.random() * 999) }]; });
      await page.waitForTimeout(250);
      await page.locator('.bha-root .bha-block').first().click({ force: true }).catch(() => {});
      try {
        await page.locator('.bha-pxfx-wrap').first().waitFor({ timeout: 2500 });
        await page.waitForTimeout(120);
        const lcd = await page.locator('.bha-lcd').boundingBox();
        await page.screenshot({ path: path.join(out, `fx-phone-${fac}.png`), clip: { x: lcd.x, y: lcd.y, width: lcd.width, height: lcd.height } });
        const n = await page.locator('.bha-pxfx-wrap').count();
        console.log(fac, '이펙트 조각', n, await page.locator('.bha-pxfx-wrap').first().getAttribute('data-fx'));
        ok = true;
      } catch { await page.waitForTimeout(1500); }
    }
    if (!ok) console.log(fac, '이펙트 못 찍음');
    await page.close();
  }
  await b.close();
})();
