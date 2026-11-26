// C.540 proof (GDD 8-9 v6.204, 사용자 2026-11-26 "그 훈련인형도 특수던전마냥, 왼쪽에 리스트로 훈련인형, 무슨훈련? 그거 리스트로 띄우고, 오른쪽에 그림이랑 설면 넣고 시작 누르게 바꿔라"):
// 방 수련장 → 목록 화면(훈련 인형 골라짐) → 수련 항목(4단계 전 잠김) → 훈련 인형 [시작] 뒤 적 설정 창.
// PC 844×390(호로) + 폰 796×384 터치(사신), 1배. 실행: node scripts/c540-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c540'));
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
    for (const id of ['birth', 'home-intro', 'first-run', 'recover', 'first-run-room', 'first-absorb']) s.help.guides[id] = 'done';
    g.writeSave(localStorage, s);
  }, fi);
  await page.goto(url);
  await wait(1200);
  await page.getByRole('button', { name: /이어하기/ }).first().click({ timeout: 5000 }).catch(() => {});
  await wait(1200);
}

const state = (page) => page.evaluate(() => ({
  screen: document.querySelector('[data-screen]')?.getAttribute('data-screen') ?? null,
  items: [...document.querySelectorAll('[data-hall]')].map((b) => ({ id: b.dataset.hall, text: b.textContent.trim(), selected: b.classList.contains('is-selected'), locked: b.classList.contains('is-locked') })),
  lock: document.querySelector('[data-hall-lock]')?.textContent.trim() ?? null,
  desc: document.querySelector('[data-hall-desc]')?.textContent.trim() ?? null,
  goDisabled: document.querySelector('[data-hall-stage] [data-go]')?.disabled ?? null,
  art: document.querySelector('[data-hall-stage] .bha-sdg__art')?.dataset.art ?? null,
  dialog: !!document.querySelector('.bha-dialog, [role="dialog"]'),
}));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { errors: [], shots: [], steps: {} };
  try {
    for (const [tag, opt, fi, n] of [['pc', PC, 0, 1], ['phone', PH, 1, 4]]) {
      const ctx = await browser.newContext(opt);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`${tag}: ${e.message}`));
      await loadSave(page, server.url, fi);
      const steps = (proof.steps[tag] = []);
      await page.locator('[data-prop="altar"]').first().click();
      await wait(900);
      steps.push({ step: 'enter', ...(await state(page)) });
      const shot = async (i, name) => { const f = `0${n + i}-${tag}-${name}.png`; await page.screenshot({ path: path.join(OUT, f) }); proof.shots.push(f); };
      await shot(0, 'hall-dummy');
      await page.locator('[data-hall="train"]').click();
      await wait(500);
      steps.push({ step: 'train', ...(await state(page)) });
      await shot(1, 'hall-train-locked');
      await page.locator('[data-hall="practice"]').click();
      await wait(300);
      await page.locator('[data-hall-stage] [data-go="practice"]').click();
      await wait(1500);
      steps.push({ step: 'start', ...(await state(page)) });
      await shot(2, 'practice-dialog');
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
