// C.304 proof (GDD 193장 8·10, 코딩221): 종족 고르기(한 줄 소개·확인 창 2문장) · 홈 안내 3장 · 회복 안내 첫 카드(빈사+가방 합침).
// 조건 2벌: pc = 844×390 고정 / ph = 796×384 터치. 두 종족. 1배. 폰은 phone-checks(phoneInPage) 로 글자 넘침·터치 크기 점검.
// 쓰기: node scripts/c304-proof.cjs [저장 폴더]  (C304_URL=<주소> 이미 떠 있는 서버, C304_FACTIONS=0,1, C304_MODES=pc,ph)
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');
const { phoneInPage } = require('./ui-audit/phone-checks.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs/captures/c304'));
const FACTIONS = (process.env.C304_FACTIONS ?? '0,1').split(',').map(Number);
const MODES = (process.env.C304_MODES ?? 'pc,ph').split(',');
if (process.env.C304_URL) process.env.C276_URL = process.env.C304_URL;
const FNAME = ['hollow', 'shinigami'];
const SAVE_KEY = 'bleach-hollow-ascension.save';
const VIEW = {
  pc: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 },
  ph: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
};

const tutText = (page) => page.evaluate(() => {
  const t = [...document.querySelectorAll('.bha-tut[data-tut-guard]')].pop();
  return t ? { tut: t.dataset.tutorial, step: t.querySelector('.bha-tut__step')?.textContent ?? '', title: t.querySelector('.bha-tut__title')?.textContent ?? '', body: t.querySelector('.bha-tut__body')?.textContent ?? '' } : null;
});

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const out = { checks: {}, cards: {}, errors: [] };
  try {
    for (const mode of MODES) for (const fi of FACTIONS) {
      const tag = `${mode}-${FNAME[fi]}`;
      const issues = [];
      out.checks[tag] = issues;
      const cards = [];
      out.cards[tag] = cards;
      const page = await browser.newPage(VIEW[mode]);
      page.on('pageerror', (e) => out.errors.push(`${tag}: ${e.message}`));
      const click = (loc) => (mode === 'ph' ? loc.tap() : loc.click());
      const shot = async (name) => {
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(OUT, `${tag}-${name}.png`) });
        if (mode !== 'pc') for (const r of await page.evaluate(phoneInPage)) issues.push({ shot: name, ...r });
      };
      await page.goto(server.url);
      await page.evaluate(() => localStorage.clear());
      await page.goto(server.url);
      await page.waitForTimeout(1200);
      await click(page.getByRole('button', { name: '새로 시작' }));
      await page.waitForTimeout(300);
      await click(page.locator('.bha-slot').first());
      await click(page.getByRole('button', { name: '확인' }));
      await page.waitForTimeout(500);
      if (fi === FACTIONS[0]) await shot('1-species');
      await click(page.locator('.bha-species__card').nth(fi));
      await page.waitForTimeout(400);
      await shot('2-species-confirm');
      await click(page.getByRole('button', { name: '시작', exact: true }));
      // 탄생 연출 → 홈 안내
      for (let i = 0; i < 60 && !(await tutText(page)); i++) await page.waitForTimeout(250);
      for (let n = 1; n <= 4; n++) {
        const t = await tutText(page);
        if (!t || t.tut !== 'home-intro') break;
        cards.push(t);
        await shot(`3-home-${n}`);
        const next = page.locator('.bha-tut[data-tut-guard] .bha-tut__actions button', { hasText: '다음' }).last();
        if (!(await next.isEnabled().catch(() => false))) break; // 마지막 = 실제 버튼(월드맵) 눌러야 끝
        await click(next);
        for (let i = 0; i < 20; i++) { await page.waitForTimeout(150); const u = await tutText(page); if (u && u.step !== t.step) break; }
      }
      // 회복 안내 첫 카드: 튜토리얼 원정 뒤와 같은 상태(빈사 + 회복 안내 차례)를 세이브에 넣고 다시 연다
      await page.evaluate((k) => {
        const s = JSON.parse(localStorage.getItem(k));
        Object.assign(s.help.guides, { 'home-intro': 'done', 'first-run': 'done', birth: 'done', recover: 'pending' });
        s.help.tutorialSeen = true;
        s.nest.collapsed = true;
        s.nest.hpFraction = 0.1;
        localStorage.setItem(k, JSON.stringify(s));
      }, SAVE_KEY);
      await page.goto(server.url);
      await page.waitForTimeout(1200);
      await click(page.getByRole('button', { name: '이어하기' })).catch(() => {});
      for (let i = 0; i < 80; i++) { await page.waitForTimeout(250); const t = await tutText(page); if (t && t.tut === 'recover') break; }
      const r = await tutText(page);
      if (r) cards.push(r);
      await shot('4-recover-1');
      await page.close();
    }
  } catch (e) {
    out.errors.push(String(e && e.stack || e));
  } finally {
    await browser.close();
    server.stop();
  }
  fs.writeFileSync(path.join(OUT, 'checks.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ issues: Object.fromEntries(Object.entries(out.checks).map(([k, v]) => [k, v.length])), cards: out.cards, errors: out.errors }, null, 2));
})();
