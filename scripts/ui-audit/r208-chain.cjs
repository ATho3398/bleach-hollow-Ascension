// 전투 블록 바 체인 표시 예전 ↔ 지금 캡처 (GDD 189장 7번, 코딩208). 게임 코드는 안 고친다.
// 쓰기: node scripts/ui-audit/r208-chain.cjs <주소> <저장 폴더> <접두어> [난이도 ★1~★4 — 길게 싸워 체인 3 을 보려면 ★4]   (PC 844×390, 전투 아래 판 + 위 칩 줄만 잘라 시간대별 저장)
const { chromium } = require('playwright');
const path = require('node:path');
const [url, out, prefix, star = '★1'] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch();
  for (const [fi, fac] of [[0, 'hollow'], [1, 'shinigami']]) {
    const page = await b.newPage({ viewport: { width: 844, height: 390 } });
    await page.goto(`${url}?test=1`); await page.evaluate(() => localStorage.clear()); await page.goto(`${url}?test=1`); await page.waitForTimeout(1200);
    await page.getByRole('button', { name: '새로 시작' }).click(); await page.waitForTimeout(300);
    await page.locator('.bha-slot').first().click(); await page.waitForTimeout(200);
    await page.getByRole('button', { name: '확인' }).click(); await page.waitForTimeout(300);
    await page.locator('.bha-species__card').nth(fi).click(); await page.waitForTimeout(300);
    await page.getByRole('button', { name: '시작', exact: true }).click(); await page.waitForTimeout(1800);
    await page.locator('.bha-prop--outside').first().click(); await page.waitForTimeout(700);
    await page.locator('.bha-worldmap [data-place="adventure"]').first().click(); await page.waitForTimeout(2000);
    await page.getByRole('button', { name: star, exact: true }).first().click().catch(() => {}); await page.waitForTimeout(300);
    await page.getByRole('button', { name: '출발', exact: true }).first().click();
    await page.locator('.bha-battle').waitFor({ timeout: 60_000 });
    for (let t = 1; t <= 12; t++) {
      await page.waitForTimeout(2500);
      const lcd = await page.locator('.bha-lcd').boundingBox();
      await page.screenshot({ path: path.join(out, `${prefix}-${fac}-t${t}.png`), clip: { x: lcd.x, y: lcd.y, width: lcd.width, height: lcd.height } });
    }
    await page.close();
  }
  await b.close();
})();
