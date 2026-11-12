// C.427 proof (GDD 6-16 v6.017, 코딩280): 특수던전 — 월드맵 이름 · 탑 탭 · 주간던전 · 보스전 · 전투. PC 844×390 + 폰 796×384, 1배
// 실행: node scripts/c426-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c427'));
const PH = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const DONE = ['first-run', 'first-run-room', 'birth', 'recover', 'home-intro', 'recover-cure', 'tile-intro', 'tile-plan', 'tile-draw', 'unlock-gear', 'unlock-battle-item', 'unlock-instinct', 'unlock-rank', 'unlock-accessory', 'unlock-pet', 'unlock-sortie'];

async function boot(page, url) {
  await page.goto(url); await page.waitForTimeout(600);
  await page.evaluate(async (done) => {
    localStorage.clear();
    const g = await import('/src/game.ts');
    const s = g.newSaveData('hollow', Date.now());
    s.name = '권영'; s.help.tutorialSeen = true; s.lastSeenAt = Date.now();
    s.evolution.tierIndex = 3; s.evolution.formHistory = ['t2:base', 't3:fire', 't4:fire:physical']; s.evolution.formId = 't4:fire:physical';
    for (const id of ['tiles', 'gear', 'battleItem', 'instinct', 'rankBattle']) s.shared.unlocks[id] = 0;
    s.difficulty.unlocked = 4; s.tower.best = 12;
    s.bossDex['sand-maw'] = { kills: 2, firstAt: 1 }; s.bossDex['canyon-king'] = { kills: 1, firstAt: 1 };
    for (const id of done) s.help.guides[id] = 'done';
    g.enterSpecial(s, 'weekly', 'soul'); // 세공 던전 1회 쓴 상태 (2/3)
    g.writeSave(localStorage, s);
  }, DONE);
  await page.goto(url); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /이어하기/ }).first().click({ timeout: 5000 }); await page.waitForTimeout(1800);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { errors: [], shots: [], facts: {} };
  const F = proof.facts;
  try {
    let n = 1;
    for (const [dk, opts] of [['pc', PC], ['phone', PH]]) {
      const page = await browser.newPage(opts);
      page.on('pageerror', (e) => proof.errors.push(e.message.slice(0, 200)));
      const shot = async (name, wait = 350) => { await page.waitForTimeout(wait); await page.screenshot({ path: path.join(OUT, `${String(n++).padStart(2, '0')}-${dk}-${name}.png`) }); proof.shots.push(`${dk}-${name}`); };
      const facts = () => page.evaluate(() => {
        const r = (q) => { const e = document.querySelector(q); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
        const list = document.querySelector('.bha-sdg__list');
        return {
          screen: document.querySelector('[data-screen]')?.dataset.screen ?? null,
          tabs: [...document.querySelectorAll('[data-sdg-tabs] button')].map((b) => `${b.textContent.trim()}${b.getAttribute('aria-selected') === 'true' ? '*' : ''}`),
          items: [...document.querySelectorAll('.bha-sdg__item')].map((b) => `${b.textContent.replace(/\s+/g, ' ').trim()}${b.classList.contains('is-selected') ? ' [선택]' : ''}`),
          art: document.querySelector('.bha-sdg__art')?.dataset.art ?? null, artRect: r('.bha-sdg__art'), listRect: r('.bha-sdg__list'),
          listScroll: list ? [list.scrollHeight, list.clientHeight] : null,
          info: document.querySelector('.bha-sdg__info')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
          go: [...document.querySelectorAll('[data-go]')].map((b) => `${b.textContent.trim()}${b.disabled ? '(off)' : ''}`),
          banner: document.querySelector('.bha-battle__banner, [class*="banner"]')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 120) ?? null,
        };
      });
      await boot(page, server.url);
      await page.locator('.bha-prop--outside').first().click(); await page.waitForTimeout(1500);
      F[`${dk}-worldmap`] = await page.evaluate(() => document.querySelector('.bha-worldmap [data-place="tower"]')?.textContent.replace(/\s+/g, ' ').trim() ?? null);
      if (dk === 'pc') await shot('worldmap');
      await page.locator('.bha-worldmap [data-place="tower"]').first().click(); await page.waitForTimeout(2500);
      F[`${dk}-tower`] = await facts();
      await shot('special-tower-tab');
      await page.locator('[data-sdg-tabs] button', { hasText: '주간던전' }).click(); await page.waitForTimeout(400);
      F[`${dk}-weekly-first`] = await facts();
      await page.locator('.bha-sdg__item').nth(1).click(); await page.waitForTimeout(300);
      F[`${dk}-weekly`] = await facts();
      await shot('weekly-shard');
      await page.locator('[data-sdg-tabs] button', { hasText: '보스전' }).click(); await page.waitForTimeout(400);
      await page.locator('.bha-sdg__item').nth(1).click(); await page.waitForTimeout(300);
      F[`${dk}-boss`] = await facts();
      await shot('boss-canyon-king');
      if (dk === 'pc') {
        await page.locator('[data-sdg-tabs] button', { hasText: '주간던전' }).click(); await page.waitForTimeout(300);
        await page.locator('.bha-sdg__item').nth(1).click(); await page.waitForTimeout(200);
      }
      await page.locator('[data-go]').first().click(); await page.waitForTimeout(2500);
      F[`${dk}-battle`] = await facts();
      F[`${dk}-used`] = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => localStorage.getItem(k)?.includes('"special"')) ?? '') ?? 'null')?.shared?.special?.used ?? null);
      await shot(dk === 'pc' ? 'battle-weekly-1of3' : 'battle-boss');
      await page.close();
    }
  } catch (e) {
    proof.errors.push(String(e).slice(0, 400));
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close();
    server.close?.();
    console.log(JSON.stringify(proof, null, 1).slice(0, 4000));
    process.exit(0);
  }
})();
