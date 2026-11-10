// C.366 proof (GDD 223장, 코딩259): 모험 준비 머리 = '자유 모험 ▼' 제목 토글(펼침 = 자유 모험/스토리, 탑 없음) · 월드맵 도전의 탑 화면 머리 = 제목(탭 없음).
// PC 844×390 · 폰 796×384 터치, 1배. 쓰기: node scripts/c366-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs/captures/c366'));
const VIEW = {
  pc: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 },
  ph: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
};

async function skipTut(page) {
  for (let t = 0; t < 40 && (await page.locator('.bha-tut').count()); t++) {
    const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled])').filter({ visible: true });
    if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
    else await page.locator('.bha-lcd').first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
}
async function testGame(page, base) {
  const u = `${base}?test=1`;
  await page.goto(u); await page.evaluate(() => localStorage.clear()); await page.goto(u); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '새로 시작' }).click(); await page.waitForTimeout(300);
  await page.locator('.bha-slot').first().click(); await page.waitForTimeout(200);
  await page.getByRole('button', { name: '확인' }).click(); await page.waitForTimeout(300);
  await page.locator('.bha-species__card').nth(0).click(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: '시작', exact: true }).click(); await page.waitForTimeout(400);
  const nm = page.locator('[data-ident="name"]');
  if (await nm.count()) {
    await nm.fill('권영'); await page.locator('[data-ident="next"]').click(); await page.waitForTimeout(200);
    await page.locator('.bha-ident__gender').first().click(); await page.locator('[data-ident="done"]').click();
  }
  await page.waitForTimeout(1500);
  await skipTut(page);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const facts = {};
  const errors = [];
  try {
    for (const mode of ['pc', 'ph']) {
      const page = await browser.newPage(VIEW[mode]);
      page.on('pageerror', (e) => errors.push(`${mode}: ${e.message.slice(0, 160)}`));
      const shot = async (name) => { await page.waitForTimeout(300); await page.screenshot({ path: path.join(OUT, `${mode}-${name}.png`) }); };
      const F = (facts[mode] = {});
      await testGame(page, server.url);
      await page.locator('.bha-prop--outside').first().click(); await page.waitForTimeout(900);
      await page.locator('.bha-worldmap [data-place="adventure"]').first().click(); await page.waitForTimeout(1800);
      await skipTut(page);
      await page.locator('.bha-depart-tabs .bha-viewtitle__btn').first().click(); await page.waitForTimeout(400);
      F.depart = await page.evaluate(() => {
        const t = document.querySelector('.bha-depart-tabs');
        return t ? {
          seg: t.classList.contains('bha-seg'),
          btn: t.querySelector('.bha-viewtitle__btn')?.textContent.replace(/\s+/g, ' ').trim(),
          options: [...t.querySelectorAll('[role="option"]')].map((o) => o.textContent.trim()),
          towerTab: !!document.querySelector('[data-tab="tower"]'),
        } : null;
      });
      await shot('1-depart-toggle');
      // 월드맵 도전의 탑
      await page.goto(`${server.url}?test=1`); await page.waitForTimeout(1500);
      await page.getByRole('button', { name: '이어하기' }).click().catch(() => {}); await page.waitForTimeout(1800);
      await skipTut(page);
      await page.locator('.bha-prop--outside').first().click(); await page.waitForTimeout(900);
      await page.locator('.bha-worldmap [data-place="tower"]').first().click(); await page.waitForTimeout(1500);
      F.tower = await page.evaluate(() => ({
        screen: [...document.querySelectorAll('.bha-lcd .bha-app')].map((e) => e.className).join('|'),
        title: document.querySelector('.bha-lcd .bha-plan__title')?.textContent ?? null,
        tabs: !!document.querySelector('.bha-depart-tabs'),
        toast: [...document.querySelectorAll('.bha-toast')].map((t) => t.textContent.replace(/\s+/g, ' ').trim()),
      }));
      await page.waitForTimeout(4000); await shot('2-tower-head');
      await page.close();
    }
  } finally {
    await browser.close();
    server.stop();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify({ facts, errors }, null, 1));
  console.log(JSON.stringify({ facts, errors }, null, 1));
})();
