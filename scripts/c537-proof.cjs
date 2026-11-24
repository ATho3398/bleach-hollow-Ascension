// C.537 proof (GDD 13-5 v6.200, 사용자 2026-11-24 "-튜토상태에서 나가있으면 배고픔다는거 수정. 튜토에선 수치 안변하게
// -튜토에서 구급상자를 사용해보자 창이 그 뒤에 설명창을 가림. 이거 없애."):
// ① 회복 안내 중(빈사) 세이브를 10시간 전에 저장한 것으로 두고 다시 열기 → 방 상태 박스 배부름·컨디션 그대로
// ② 가방 → 구급상자 → 상세 창이 열리면 '구급상자를 사용해 보자' 창 없이 [사용] 강조만.
// PC 844×390 + 폰 796×384 터치, 1배. 실행: node scripts/c537-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c537'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PH = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const AWAY_H = 10;

async function loadTutorialSave(page, url) {
  await page.goto(url);
  await wait(600);
  await page.evaluate(async (awayH) => {
    localStorage.clear();
    const g = await import('/src/game.ts');
    const F = await import('/src/data/factions/index.ts');
    const now = Date.now();
    const t0 = now - awayH * 3_600_000;
    const s = g.newSaveData(F.FACTIONS[0].id, t0);
    s.name = '권영'; s.help.tutorialSeen = true;
    // 첫 모험을 다녀와 빈사로 돌아온 뒤(회복 안내 ① 차례) 앱을 끄고 awayH 시간 뒤 다시 연다
    for (const id of ['birth', 'home-intro', 'first-run']) s.help.guides[id] = 'done';
    s.help.guides.recover = 'pending';
    Object.assign(s.nest, { hunger: 40, condition: 60, collapsed: true, collapsedAt: t0, hpFraction: 0.1, lastTickMs: t0, lastMealAt: t0 });
    s.lastSeenAt = t0;
    g.writeSave(localStorage, s);
  }, AWAY_H);
  await page.goto(url);
  await wait(1200);
  await page.getByRole('button', { name: /이어하기/ }).first().click({ timeout: 5000 }).catch(() => {});
}
const nestNow = (page) => page.evaluate(() => {
  const box = document.querySelector('.bha-room__status');
  return { status: box ? box.textContent.replace(/\s+/g, ' ').trim() : null };
});
const waitFor = async (page, sel, ms = 12000) => {
  for (let t = 0; t < ms / 250; t++) { if (await page.locator(sel).filter({ visible: true }).count()) return true; await wait(250); }
  return false;
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { errors: [], shots: [], flows: {} };
  try {
    for (const [tag, opt] of [['pc', PC], ['phone', PH]]) {
      const ctx = await browser.newContext(opt);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`${tag}: ${e.message}`));
      await loadTutorialSave(page, server.url);
      const f = (proof.flows[tag] = {});
      f.cardShown = await waitFor(page, '.bha-tut[data-tutorial="recover"] .bha-tut__card, .bha-tut .bha-tut__card');
      await wait(800);
      f.room = await nestNow(page);
      if (tag === 'pc') {
        await page.screenshot({ path: path.join(OUT, '01-pc-room-after-10h.png') });
        proof.shots.push('01-pc-room-after-10h.png');
      }
      // ① 가방 열기 (실제 조작)
      await page.locator('.bha-prop--chest').first().click({ timeout: 4000 }).catch((e) => proof.errors.push(`${tag} chest: ${e.message}`));
      f.listStage = await waitFor(page, '[data-item="med-cure"]');
      await wait(1200);
      f.listCardVisible = await page.evaluate(() => [...document.querySelectorAll('.bha-tut__card')].some((c) => getComputedStyle(c).visibility === 'visible'));
      // ② 구급상자 → 상세 창
      await page.locator('[data-item="med-cure"]').first().click({ timeout: 4000 }).catch((e) => proof.errors.push(`${tag} item: ${e.message}`));
      f.dialog = await waitFor(page, '.bha-itemdialog[data-item-dialog="med-cure"] [data-act="use"]');
      await wait(1200);
      f.detail = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('.bha-tut__card')];
        const hole = document.querySelector('.bha-tut__hole');
        const use = document.querySelector('.bha-itemdialog[data-item-dialog="med-cure"] [data-act="use"]');
        const hr = hole?.getBoundingClientRect();
        const ur = use?.getBoundingClientRect();
        return {
          cardVisible: cards.some((c) => getComputedStyle(c).visibility === 'visible'),
          cardless: cards.map((c) => c.dataset.cardless),
          holeOnUse: !!(hr && ur && hr.left <= ur.left && hr.top <= ur.top && hr.right >= ur.right && hr.bottom >= ur.bottom),
          holeVisible: hole ? getComputedStyle(hole).visibility !== 'hidden' : false,
        };
      });
      const shot = tag === 'pc' ? '02-pc-cure-detail-nocard.png' : '03-phone-cure-detail-nocard.png';
      await page.screenshot({ path: path.join(OUT, shot) });
      proof.shots.push(shot);
      // [사용] → 빈사 풀림 결과 카드는 그대로
      await page.locator('.bha-itemdialog [data-act="use"]').first().click({ timeout: 4000 }).catch((e) => proof.errors.push(`${tag} use: ${e.message}`));
      await wait(2500);
      f.afterUse = await page.evaluate(() => [...document.querySelectorAll('.bha-tut__card')].filter((c) => getComputedStyle(c).visibility === 'visible').map((c) => c.textContent.replace(/\s+/g, ' ').trim()));
      await ctx.close();
    }
  } catch (e) {
    proof.errors.push(String(e && e.stack || e));
  } finally {
    await browser.close();
    server.stop();
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    console.log(JSON.stringify(proof, null, 2));
    process.exit(0);
  }
})();
