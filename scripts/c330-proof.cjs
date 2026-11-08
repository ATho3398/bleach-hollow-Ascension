// C.330 proof (GDD 200장): 적 도감 — 책장 제목 토글 ▾ 에서 '적 도감' → 목록(실루엣 섞임) · 강적 상세(등급·잡은 수) · 보스 상세. 기기 ▲▼✓ 로 목록 이동.
// 테스트 모드(?test=1) 새 게임 → 세이브 enemyDex 에 몇 칸(일반 2·강적 1·보스 1, 새 점 1)을 넣어 다시 읽기 → 방 책장 → 토글 → 적 도감.
// 모드: pc = 844×390 마우스(호로) / ph = 796×384 터치(사신). 캡처 1배 docs/captures/c330/ (6장). 실행: node scripts/c330-proof.cjs
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c330');
const MODES = [
  { id: 'pc', fi: 0, ctx: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 } },
  { id: 'ph', fi: 1, ctx: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true } },
];
const SAVE_KEY = 'bha-save-test';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const DEX = {
  'normal-basic': { seen: 7, kills: 5, absorbs: { both: 3, trait: 1, stat: 0, none: 1 }, where: 'ground:outskirts', firstAt: 1 },
  'water-swift': { seen: 2, kills: 0, absorbs: { both: 0, trait: 0, stat: 0, none: 0 }, where: 'ground:outskirts', firstAt: 1 },
  'fire-heavy-seal': { seen: 3, kills: 2, absorbs: { both: 1, trait: 0, stat: 1, none: 0 }, where: 'ground:canyon', firstAt: 1, fresh: true },
  'sand-maw': { seen: 1, kills: 1, absorbs: { both: 1, trait: 0, stat: 0, none: 0 }, where: 'tower', firstAt: 1 },
};

async function newGame(page, url, fi) {
  await page.goto(`${url}?test=1`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${url}?test=1`);
  await wait(1200);
  await page.getByRole('button', { name: '새로 시작' }).click();
  await wait(300);
  await page.locator('.bha-slot').first().click();
  await wait(200);
  await page.getByRole('button', { name: '확인' }).click();
  await wait(300);
  await page.locator('.bha-species__card').nth(fi).click();
  await wait(300);
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await wait(400);
  const input = page.locator('[data-ident="name"]');
  if (await input.count()) {
    await input.fill('시험');
    await page.locator('[data-ident="next"]').click();
    await wait(200);
    await page.locator('.bha-ident__gender').first().click();
    await page.locator('[data-ident="done"]').click();
  }
  await wait(2500);
}

async function patchSave(page) {
  return page.evaluate(({ key, dex }) => {
    const s = JSON.parse(localStorage.getItem(key));
    s.enemyDex = dex;
    localStorage.setItem(key, JSON.stringify(s));
    return s.meta.format;
  }, { key: SAVE_KEY, dex: DEX });
}

async function continueGame(page, url) {
  await page.goto(`${url}?test=1`);
  await wait(1500);
  const cont = page.getByRole('button', { name: /이어|계속/ }).first();
  if (await cont.count()) { await cont.click(); await wait(400); }
  const slot = page.locator('.bha-slot').first();
  if (await slot.count()) { await slot.click(); await wait(200); const ok = page.getByRole('button', { name: '확인' }); if (await ok.count()) await ok.click(); }
  await wait(2500);
}

const press = async (page, label, ms = 220) => {
  await page.locator(`.bha-dev__btn[aria-label="${label}"]`).first().click({ timeout: 2000 }).catch(() => {});
  await wait(ms);
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { shots: [], checks: {}, errors: [] };
  try {
    for (const mode of MODES) {
      const page = await browser.newPage(mode.ctx);
      page.on('pageerror', (e) => proof.errors.push(`${mode.id}: ${e.message}`));
      const shot = async (name) => {
        await wait(350);
        const file = `${mode.id}-${name}.png`;
        await page.screenshot({ path: path.join(OUT, file) });
        proof.shots.push(file);
      };
      await newGame(page, srv.url, mode.fi);
      const format = await patchSave(page);
      await continueGame(page, srv.url);
      // 방 책장 → 제목 토글 ▾ → 적 도감
      await page.locator('.bha-prop--book').first().click();
      await wait(900);
      await page.locator('.bha-viewtitle__btn').first().click();
      await wait(300);
      await page.locator('.bha-viewtitle__item', { hasText: '적 도감' }).click();
      await wait(700);
      const list = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('.bha-mdrow')];
        const r = (el) => el.getBoundingClientRect();
        const lcd = document.querySelector('.bha-lcd')?.getBoundingClientRect();
        const inside = (b) => !!lcd && b.left >= lcd.left - 1 && b.right <= lcd.right + 1;
        return {
          rows: rows.length,
          unknown: rows.filter((b) => b.classList.contains('is-unknown')).length,
          names: rows.slice(0, 6).map((b) => b.querySelector('.bha-mdrow__name')?.textContent),
          caps: [...document.querySelectorAll('.bha-mdcap')].map((c) => c.textContent),
          sub: document.querySelector('.bha-lcdpage__sub')?.textContent,
          newDots: document.querySelectorAll('.bha-edex__new').length,
          active: document.querySelector('.bha-mdrow.is-active .bha-mdrow__name')?.textContent,
          silhouetteImgs: document.querySelectorAll('.bha-edex__art.is-silhouette img').length,
          overflowX: rows.some((b) => !inside(r(b))),
          head: document.querySelector('.bha-lcdpage__head')?.getBoundingClientRect().width,
        };
      });
      proof.checks[`${mode.id}-list`] = { format, ...list };
      // 첫 선택 = 새 점이 있는 강적(fire-heavy-seal) → 그 상세가 보인다. 목록 캡처는 맨 위(일반)로 올려서
      await page.locator('.bha-mdrow').first().click();
      await wait(300);
      await shot('1-list');
      // 강적 상세: 스티치마우스 쪽 줄 중 '새' 점이 있던 불 강공격형
      const eliteRow = page.locator('.bha-mdrow.bha-edex__row--elite').first();
      await eliteRow.scrollIntoViewIfNeeded().catch(() => {});
      await eliteRow.click();
      await wait(400);
      proof.checks[`${mode.id}-elite`] = await page.evaluate(() => ({
        title: document.querySelector('.bha-mddetail__title')?.textContent,
        chips: [...document.querySelectorAll('.bha-mddetail__head .bha-chip')].map((c) => c.textContent),
        lines: [...document.querySelectorAll('.bha-edex__line')].map((l) => l.textContent),
        newDotsAfter: document.querySelectorAll('.bha-edex__new').length,
        detailInside: (() => { const d = document.querySelector('.bha-mddetail')?.getBoundingClientRect(); const l = document.querySelector('.bha-lcd')?.getBoundingClientRect(); return !!d && !!l && d.right <= l.right + 1 && d.bottom <= l.bottom + 1; })(),
      }));
      await shot('2-elite');
      // 보스 상세
      const bossRow = page.locator('.bha-mdrow.bha-edex__row--boss').first();
      await bossRow.scrollIntoViewIfNeeded().catch(() => {});
      await bossRow.click();
      await wait(400);
      proof.checks[`${mode.id}-boss`] = await page.evaluate(() => ({
        title: document.querySelector('.bha-mddetail__title')?.textContent,
        chips: [...document.querySelectorAll('.bha-mddetail__head .bha-chip')].map((c) => c.textContent),
        lines: [...document.querySelectorAll('.bha-edex__line')].map((l) => l.textContent),
      }));
      await shot('3-boss');
      // 기기 ▲ 한 번 = 바로 위 행(강적 마지막) 으로, 상세가 바뀐다
      await press(page, '위');
      proof.checks[`${mode.id}-device-up`] = await page.evaluate(() => document.querySelector('.bha-mdrow.is-active')?.getAttribute('aria-label'));
      // 저장: 새 점이 지워졌는가
      proof.checks[`${mode.id}-saved`] = await page.evaluate((key) => { const s = JSON.parse(localStorage.getItem(key)); return { fresh: s.enemyDex['fire-heavy-seal'].fresh ?? null, kills: s.enemyDex['fire-heavy-seal'].kills }; }, SAVE_KEY);
      await page.close();
    }
  } finally {
    await browser.close();
    srv.stop();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 1));
})();
