// C.395 (GDD 241-F 1) proof: 사신 1단계(혼백) = 혼백 모델. 실행: npx vite --port 5402 → node scripts/c395-proof.cjs http://localhost:5402/ — 1배 캡처 docs/captures/c395/
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const OUT = path.resolve(__dirname, '../docs/captures/c395');
const URL = process.argv[2] || 'http://localhost:5402/';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const errors = [];
  for (const [gi, name] of [[0, 'male'], [1, 'female']]) {
    const page = await b.newPage({ viewport: { width: 844, height: 390 } });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${URL}`);
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${URL}`);
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: '새로 시작' }).click();
    await page.waitForTimeout(300);
    await page.locator('.bha-slot').first().click();
    await page.getByRole('button', { name: '확인' }).click();
    await page.waitForTimeout(300);
    await page.locator('.bha-species__card').nth(1).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '시작', exact: true }).click();
    await page.waitForTimeout(600);
    const input = page.locator('[data-ident="name"]');
    if (await input.count()) {
      await input.fill('시험');
      await page.locator('[data-ident="next"]').click();
      await page.waitForTimeout(200);
      await page.locator('.bha-ident__gender').nth(gi).click();
      await page.locator('[data-ident="done"]').click();
    }
    await page.waitForTimeout(2000);
    for (let i = 0; i < 0; i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
    // 여는 연출을 눌러 넘기며 1단계(혼백) 모습이 나오는 화면을 차례로 찍는다
    for (let i = 0; i < 1; i++) {
      await page.mouse.click(420, 190);
      await page.waitForTimeout(1800);
      await page.screenshot({ path: path.join(OUT, `start-${name}-${i + 1}.png`) });
    }
    await page.close();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify({ errors }, null, 1));
  console.log('errors', errors);
  await b.close();
})();
