// C.392 (GDD 240장) proof: 새 모델(가시형·속도형·부유형) 외형 + 새 모델 강적.
// 실행: npx vite --port 5401 (또는 vite preview) → node scripts/c392-proof.cjs http://localhost:5401/ — 캡처 1배 844×390 docs/captures/c392/
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const OUT = path.resolve(__dirname, '../docs/captures/c392');
const URL = process.argv[2] || 'http://localhost:5401/';

async function newGame(page, url, fi) {
  await page.goto(`${url}?test=1`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${url}?test=1`);
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
const lcd = (page) => page.locator('.bha-lcd');
async function esc(page, n = 4) {
  for (let i = 0; i < n; i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
}
async function openTest(page, tab) {
  for (let i = 0; i < 4 && (await page.locator('.bha-lcd [data-dev-layer]').count()); i++) await page.keyboard.press('Escape');
  const more = lcd(page).getByRole('button', { name: '더보기' });
  for (let i = 0; i < 6 && !(await more.isVisible().catch(() => false)); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
  if (!(await more.isVisible().catch(() => false))) await page.screenshot({ path: path.join(OUT, `debug-${tab}.png`) });
  await more.click();
  await page.waitForTimeout(500);
  await page.locator('.bha-homedock__tray').getByRole('button', { name: '테스트' }).click();
  await page.waitForTimeout(700);
  await page.locator('.bha-lcd .bha-viewtitle__btn').first().click();
  await page.locator('.bha-viewtitle__list').getByRole('option', { name: tab, exact: true }).click();
  await page.waitForTimeout(400);
}
/** 고르기 목록(aria)에서 글자가 들어간 항목 */
async function pickText(page, aria, text) {
  await page.locator(`.bha-lcd button.bha-pick[aria-label="${aria}"]`).click();
  await page.waitForTimeout(200);
  const ok = await page.evaluate((text) => {
    const box = document.querySelector('.bha-pick__list');
    for (const n of box?.children ?? []) if (n.getAttribute('role') === 'option' && n.textContent.includes(text)) { n.click(); return true; }
    return false;
  }, text);
  await page.waitForTimeout(300);
  return ok;
}
const figs = () => {
  const one = (sel) => {
    const u = document.querySelector(sel);
    const c = u?.querySelector('canvas.bha-rigcanvas');
    const img = u?.querySelector('img');
    return { canvas: !!c, size: c ? [c.width, c.height] : null, img: img?.getAttribute('src') ?? null };
  };
  const s = window.__bhaCombat;
  return { enemy: s?.enemy?.id ?? null, me: one('.bha-unit--me, .bha-unit--hero, .bha-unit:not(.bha-unit--foe)'), foe: one('.bha-unit--foe') };
};
async function battle(page, foeName, tag, proof) {
  await openTest(page, '바로 전투');
  proof.picked.push({ tag, foe: foeName, ok: await pickText(page, '상대', foeName) });
  await lcd(page).getByRole('button', { name: '전투 시작' }).click();
  await page.locator('.bha-battle').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  for (let i = 0; i < 3 && (await page.locator('.bha-tut').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
  await page.evaluate(() => { const s = window.__bhaCombat; if (s) { s.enemy.maxHp *= 50; s.enemy.hp = s.enemy.maxHp; s.player.maxHp *= 50; s.player.hp = s.player.maxHp; } });
  for (let i = 0; i < 2; i++) {
    await page.waitForTimeout(i ? 900 : 1500);
    const f = `${tag}-battle-${i}.png`;
    await page.screenshot({ path: path.join(OUT, f) });
    proof.shots.push(f);
  }
  proof.battles.push({ tag, ...(await page.evaluate(figs)) });
  await esc(page, 2);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const proof = { url: URL, picked: [], battles: [], shots: [], save: [], errors: [] };
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => proof.errors.push(e.message));
  try {
    await newGame(page, URL, 0); // 호로
    await openTest(page, '스킨');
    proof.picked.push({ tag: 'skin', ok: await pickText(page, '스킨', '가시형') });
    await lcd(page).getByRole('button', { name: '착용', exact: true }).first().click();
    await page.waitForTimeout(600);
    await battle(page, '옵시디아나', 'spiky-vs-obsidiana', proof);
    await newGame(page, URL, 0);
    await openTest(page, '스킨');
    proof.picked.push({ tag: 'skin', ok: await pickText(page, '스킨', '속도형') });
    await lcd(page).getByRole('button', { name: '착용', exact: true }).first().click();
    await page.waitForTimeout(600);
    await battle(page, '본크러셔', 'speed-vs-bonecrusher', proof);
    await newGame(page, URL, 0);
    await openTest(page, '스킨');
    proof.picked.push({ tag: 'skin', ok: await pickText(page, '스킨', '부유형') });
    await lcd(page).getByRole('button', { name: '착용', exact: true }).first().click();
    await page.waitForTimeout(600);
    await battle(page, '손하이드', 'wraith-vs-sonhide', proof);
  } catch (e) {
    proof.errors.push(String(e));
    await page.screenshot({ path: path.join(OUT, 'error.png') });
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 1));
  console.log(JSON.stringify(proof, null, 1));
  await browser.close();
})();
