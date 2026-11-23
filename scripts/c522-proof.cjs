// C.522 캡처 (docs/captures/c522): node scripts/c522-proof.cjs [all|login|food|arena|spa] — URL=<주소> (기본 vite 5199, 로그인 창은 빌드 미리보기에서만 뜬다)
const { chromium } = require('playwright');
const OUT = '/home/user/bleach-hollow-Ascension/docs/captures/c522';
const url = process.env.URL || 'http://localhost:5199/';
const W = (p, ms) => p.waitForTimeout(ms);
async function newGame(page, test, fi = 0) {
  const u = test ? `${url}?test=1` : url;
  await page.goto(u); await page.evaluate(() => localStorage.clear()); await page.goto(u); await W(page, 1500);
  const off = page.getByRole('button', { name: '로그인 없이 하기' });
  if (await off.count()) { await off.click(); await W(page, 500); }
  await page.getByRole('button', { name: '새로 시작' }).click(); await W(page, 300);
  await page.locator('.bha-slot').first().click(); await W(page, 200);
  await page.getByRole('button', { name: '확인' }).click(); await W(page, 300);
  await page.locator('.bha-species__card').nth(fi).click(); await W(page, 300);
  await page.getByRole('button', { name: '네', exact: true }).click(); await W(page, 500);
  await page.locator('[data-ident="name"]').fill('검수');
  await page.locator('.bha-ident__gender').first().click();
  await page.getByRole('button', { name: '시작', exact: true }).click(); await W(page, 2500);
}
(async () => {
  const b = await chromium.launch();
  const which = process.argv[2] || 'all';
  // 1 로그인 창
  if (which === 'all' || which === 'login') {
    const page = await b.newPage({ viewport: { width: 844, height: 390 } });
    await page.goto(url); await page.evaluate(() => localStorage.clear()); await page.goto(url); await W(page, 5000); console.log((await page.content()).length, await page.evaluate(() => document.body.innerText.slice(0, 200)));
    await page.screenshot({ path: `${OUT}/04-login-gate-choices.png` });
    await page.close();
  }
  // 2 먹이 줄 펼침 (호로 방)
  if (which === 'all' || which === 'food') {
    const page = await b.newPage({ viewport: { width: 844, height: 390 } });
    await newGame(page, true, 0);
    await page.locator('.bha-homedock__carebtn--feed').click(); await W(page, 700);
    const hidden = await page.evaluate(() => [...document.querySelectorAll('.bha-prop__tag')].map((t) => `${t.textContent.trim()}:${t.classList.contains('is-under-tray') ? '숨김' : '보임'}`).join(' · '));
    console.log('food tray tags:', hidden);
    await page.screenshot({ path: `${OUT}/03-room-food-tray-tags-hidden.png` });
    await page.locator('.bha-homedock__carebtn--feed').click(); await W(page, 500);
    console.log('closed tags:', await page.evaluate(() => [...document.querySelectorAll('.bha-prop__tag.is-under-tray')].length));
    await page.close();
  }
  // 3 수련장 적 설정 창
  if (which === 'all' || which === 'arena') {
    const page = await b.newPage({ viewport: { width: 844, height: 390 } });
    await newGame(page, true, 1);
    await page.locator('.bha-prop--altar').first().click(); await W(page, 1200);
    console.log((await page.locator('.bha-lcd').innerText()).slice(0, 300));
    await page.screenshot({ path: `${OUT}/02a-practice-entry.png` });
    await page.getByRole('button', { name: /전투 들어가기/ }).first().click(); await W(page, 2500);
    const set = page.getByRole('button', { name: /적 설정/ });
    if (await set.count() && !(await page.locator('.bha-lcd input[type="number"]').count())) { await set.first().click(); await W(page, 800); }
    console.log((await page.locator('.bha-lcd').innerText()).slice(0, 400));
    await page.screenshot({ path: `${OUT}/02-practice-enemy-dialog.png` });
    await page.close();
  }
  // 4 온천 상태 설명창(값이 바뀌는 동안 열어 둠)
  if (which === 'all' || which === 'spa') {
    const page = await b.newPage({ viewport: { width: 844, height: 390 } });
    await newGame(page, true, 0);
    await page.getByRole('button', { name: '더보기' }).click(); await W(page, 300);
    await page.locator('.bha-homedock__tray').getByRole('button', { name: '테스트' }).click(); await W(page, 700);
    await page.locator('.bha-lcd .bha-viewtitle__btn').first().click(); await W(page, 300);
    await page.locator('.bha-viewtitle__list').getByRole('option', { name: '둥지·시간' }).click(); await W(page, 400);
    await page.locator('.bha-lcd input[type="number"]').nth(3).fill('40');
    await page.getByRole('button', { name: '적용' }).click(); await W(page, 400);
    for (let i = 0; i < 4 && (await page.locator('.bha-lcd [data-dev-layer]').count()); i++) { await page.keyboard.press('Escape'); await W(page, 250); }
    await page.keyboard.press('Escape'); await W(page, 800);
    await page.locator('.bha-prop--outside').first().click(); await W(page, 1000);
    await page.locator('.bha-worldmap [data-place="spa"]').first().click(); await W(page, 4500);
    const info = page.locator('.bha-lcd .bha-info').first();
    await info.hover(); await W(page, 300);
    const read = () => page.evaluate(() => ({ pop: document.querySelector('.bha-pop')?.textContent.replace(/\s+/g, ' ').slice(0, 160) ?? null, box: document.querySelector('.bha-room__status, .bha-spa .bha-room__status')?.getAttribute('aria-label') ?? null }));
    console.log('t0', JSON.stringify(await read()));
    await W(page, 3000);
    console.log('t3', JSON.stringify(await read()));
    await page.screenshot({ path: `${OUT}/01-spa-status-tip-live.png` });
    await page.evaluate(() => document.querySelector('.bha-lcd [data-space-back]')?.click()); await W(page, 4500);
    console.log('after leaving spa (mouse still there): pops =', await page.locator('.bha-pop').count(), await page.evaluate(() => [...document.querySelectorAll('.bha-lcd .bha-app')].map((e) => e.className).join('|').slice(0, 80)));
    await page.close();
  }
  await b.close();
})();
