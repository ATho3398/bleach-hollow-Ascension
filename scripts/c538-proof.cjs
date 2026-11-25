// C.538 proof (GDD 13절 v6.202, 사용자 2026-11-24 "튜토리얼에 본능수련은 바스트로데가 되면 열린다. 이거 필요 없잖아"):
// 회복 안내까지 끝낸 세이브(first-run-room pending)로 방을 열면 '다음 할 일' 카드 — 수련 해금 문장 없음.
// PC 844×390(호로) + 폰 796×384 터치(사신), 1배. 실행: node scripts/c538-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c538'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PH = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadSave(page, url, fi) {
  await page.goto(url);
  await wait(600);
  await page.evaluate(async (fi) => {
    localStorage.clear();
    const g = await import('/src/game.ts');
    const F = await import('/src/data/factions/index.ts');
    const s = g.newSaveData(F.FACTIONS[fi].id, Date.now());
    s.name = '권영'; s.help.tutorialSeen = true;
    for (const id of ['birth', 'home-intro', 'first-run', 'recover']) s.help.guides[id] = 'done';
    s.help.guides['first-run-room'] = 'pending';
    g.writeSave(localStorage, s);
  }, fi);
  await page.goto(url);
  await wait(1200);
  await page.getByRole('button', { name: /이어하기/ }).first().click({ timeout: 5000 }).catch(() => {});
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { errors: [], shots: [], cards: {} };
  try {
    for (const [tag, opt, fi, shot] of [['pc', PC, 0, '01-pc-next-card.png'], ['phone', PH, 1, '02-phone-next-card.png']]) {
      const ctx = await browser.newContext(opt);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`${tag}: ${e.message}`));
      await loadSave(page, server.url, fi);
      for (let t = 0; t < 48; t++) { if (await page.locator('.bha-tut__card').filter({ visible: true }).count()) break; await wait(250); }
      await wait(900);
      proof.cards[tag] = await page.evaluate(() => [...document.querySelectorAll('.bha-tut__card')].filter((c) => getComputedStyle(c).visibility === 'visible').map((c) => c.textContent.replace(/\s+/g, ' ').trim()));
      await page.screenshot({ path: path.join(OUT, shot) });
      proof.shots.push(shot);
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
