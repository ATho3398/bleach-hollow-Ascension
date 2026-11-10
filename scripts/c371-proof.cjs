// C.371 (GDD 227장) proof: 강적 스티치마우스 = 외눈 길리안 · 강적 강공격 = 빨간 세로(불투명도 0.7). 캡처 1배 844×390 docs/captures/c371/
// 실행: npx vite --port 5395 → node scripts/c371-proof.cjs http://localhost:5395/
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const OUT = path.resolve(__dirname, '../docs/captures/c371');
const URL = process.argv[2] || 'http://localhost:5395/';
const lcd = (page) => page.locator('.bha-lcd');
async function newGame(page, fi) {
  await page.goto(`${URL}?test=1`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${URL}?test=1`);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '새로 시작' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-slot').first().click();
  await page.getByRole('button', { name: '확인' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-species__card').nth(fi).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await page.waitForTimeout(600);
  const input = page.locator('[data-ident="name"]');
  if (await input.count()) {
    await input.fill('시험');
    await page.locator('[data-ident="next"]').click();
    await page.waitForTimeout(200);
    await page.locator('.bha-ident__gender').first().click();
    await page.locator('[data-ident="done"]').click();
  }
  await page.waitForTimeout(1500);
}
async function openTest(page, tab) {
  const more = lcd(page).getByRole('button', { name: '더보기' });
  for (let i = 0; i < 6 && !(await more.isVisible().catch(() => false)); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
  await more.click();
  await page.waitForTimeout(500);
  await page.locator('.bha-homedock__tray').getByRole('button', { name: '테스트' }).click();
  await page.waitForTimeout(700);
  await page.locator('.bha-lcd .bha-viewtitle__btn').first().click();
  await page.locator('.bha-viewtitle__list').getByRole('option', { name: tab, exact: true }).click();
  await page.waitForTimeout(400);
}
async function pickText(page, aria, text) {
  await page.locator(`.bha-lcd button.bha-pick[aria-label="${aria}"]`).click();
  await page.waitForTimeout(200);
  const ok = await page.evaluate((text) => {
    for (const n of document.querySelector('.bha-pick__list')?.children ?? []) if (n.getAttribute('role') === 'option' && n.textContent.includes(text)) { n.click(); return true; }
    return false;
  }, text);
  await page.waitForTimeout(300);
  return ok;
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const proof = { url: URL, shots: [], errors: [], foe: null, cero: null };
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => proof.errors.push(e.message));
  try {
    await newGame(page, 1); // 사신 (상대 = 스티치마우스)
    await openTest(page, '바로 전투');
    proof.picked = await pickText(page, '상대', '스티치마우스');
    await lcd(page).getByRole('button', { name: '전투 시작' }).click();
    await page.locator('.bha-battle').waitFor({ timeout: 20_000 });
    await page.waitForTimeout(800);
    for (let i = 0; i < 3 && (await page.locator('.bha-tut').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
    await page.evaluate(() => { const s = window.__bhaCombat; if (s) { s.enemy.maxHp *= 50; s.enemy.hp = s.enemy.maxHp; s.player.maxHp *= 50; s.player.hp = s.player.maxHp; } });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, 'foe-gillian-cyclops.png') });
    proof.shots.push('foe-gillian-cyclops.png');
    proof.foe = await page.evaluate(() => { const f = document.querySelector('.bha-unit--foe'); const c = f?.querySelector('canvas.bha-rigcanvas'); return { canvas: !!c, size: c ? [c.width, c.height] : null, delay: window.__bhaCombat?.params?.hitDelay?.heavy ?? null }; });
    // 강공격 세로가 뜰 때까지(최대 60초): 혈 세로 조각이 생기면 두 장
    const t0 = Date.now();
    while (Date.now() - t0 < 60000) {
      const got = await page.evaluate(() => { const w = document.querySelector('.bha-pxfx-wrap[data-fx="custom-cero-blood"]'); return w ? { opacity: getComputedStyle(w).opacity } : null; });
      if (got) {
        proof.cero = got;
        await page.waitForTimeout(120);
        await page.screenshot({ path: path.join(OUT, 'elite-heavy-cero-1.png') });
        await page.waitForTimeout(160);
        await page.screenshot({ path: path.join(OUT, 'elite-heavy-cero-2.png') });
        proof.shots.push('elite-heavy-cero-1.png', 'elite-heavy-cero-2.png');
        break;
      }
      await page.waitForTimeout(30);
    }
  } catch (e) {
    proof.errors.push(String(e));
    await page.screenshot({ path: path.join(OUT, 'error.png') });
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 1));
  console.log(JSON.stringify(proof, null, 1));
  await browser.close();
})();
