// C.522 점검D 확인 필요 ④: 회복 안내 ③ 온천 → ④ 배부름 카드를 사람 속도 ✓ 연타(PRESS_MS, 기본 150ms)로 넘기는지. node scripts/c522-recover-mash.cjs
// 회복 안내 ③ 온천 → ④ 배부름 카드: 사람 속도 ✓ 연타(PRESS_MS 간격)로 ④ 를 못 보고 넘기는지
const { chromium } = require('playwright');
const PRESS_MS = Number(process.env.PRESS_MS || 150);
const url = process.env.URL || 'http://localhost:5199/';
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 844, height: 390 } });
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.goto(url);
  await page.waitForTimeout(1500);
  const off = page.getByRole('button', { name: '로그인 없이 하기' });
  if (await off.count()) { await off.click(); await page.waitForTimeout(500); }
  await page.getByRole('button', { name: '새로 시작' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-slot').first().click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: '확인' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-species__card').nth(Number(process.env.FACTION || 0)).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '네', exact: true }).click(); await page.waitForTimeout(500);
  await page.locator('[data-ident="name"]').fill('검수');
  await page.locator('.bha-ident__gender').first().click();
  await page.getByRole('button', { name: '시작', exact: true }).click(); await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const k = 'bleach-hollow-ascension.save';
    const j = JSON.parse(localStorage.getItem(k));
    j.help = { tutorialSeen: true, guides: { 'first-run': 'done', 'home-intro': 'done', birth: 'done', recover: 'pending', 'recover-cure': 'done', 'recover-cure-reward': 'done', 'first-run-room': 'pending' } };
    j.nest.hpFraction = 0.3; j.nest.collapsed = false; j.nest.hunger = 60;
    localStorage.setItem(k, JSON.stringify(j));
  });
  await page.goto(url);
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: '이어하기' }).click();
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    window.__steps = [];
    const seen = new Set();
    const obs = new MutationObserver(() => {
      for (const s of document.querySelectorAll('.bha-tut__step')) {
        const t = s.textContent.trim();
        const card = s.closest('.bha-tut__card');
        const title = card?.querySelector('.bha-tut__title')?.textContent.trim() ?? '';
        const key = t + '|' + title;
        if (!seen.has(key)) { seen.add(key); window.__steps.push({ t, title, at: Math.round(performance.now()) }); }
      }
    });
    obs.observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  for (let i = 0; i < 40 && !(await page.locator('.bha-tut__step').count()); i++) await page.waitForTimeout(250);
  // ③ 온천 카드: 방 → 월드맵 → 온천
  await page.locator('.bha-prop--outside').first().click(); await page.waitForTimeout(1200);
  await page.locator('.bha-worldmap [data-place="spa"]').first().click();
  // 온천에서 가득 찰 때까지 (튜토리얼 10초) — 그 뒤 사람처럼 ✓ 연타
  const t0 = Date.now();
  for (let i = 0; i < 80; i++) {
    const full = await page.evaluate(() => [...document.querySelectorAll('.bha-toast')].some((t) => /가득 찼다/.test(t.textContent)));
    if (full) break;
    await page.waitForTimeout(200);
  }
  console.log('spa full after', Date.now() - t0, 'ms; pressing ✓ every', PRESS_MS, 'ms');
  for (let i = 0; i < Math.round(5000 / PRESS_MS); i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(PRESS_MS); }
  await page.waitForTimeout(800);
  const steps = await page.evaluate(() => window.__steps);
  console.log(JSON.stringify(steps));
  console.log('now:', await page.evaluate(() => [...document.querySelectorAll('.bha-tut__step')].map((s) => s.textContent.trim()).join(',')));
  await page.waitForTimeout(600); await page.keyboard.press('Enter'); await page.waitForTimeout(800);
  console.log('after pause + one ✓:', await page.evaluate(() => [...document.querySelectorAll('.bha-tut__step')].map((s) => s.textContent.trim()).join(',')));
  await page.screenshot({ path: `rec-${PRESS_MS}.png` });
  await b.close();
})();
