// C.406 proof (GDD 241-C 4~9·11 · 241-G, 코딩269): ① 눌러서 말 걸기 좋아함(교감 +1) ② 7번째 싫어함(교감 −1) ③ 상태 화면('가진 것'·진화 안내 글 없음) ④ 교감 ⓘ(약 문구 삭제·눌러서 말 걸기)
// ⑤ 칭호 도감 탭(일반·에픽·히든) ⑥ 외눈형 길리안(1단계 교감 3번 뒤 진화) ⑦ 가방 시작 지급(치료제 3종). 세이브는 게임 모듈로 만들어 넣는다. 1배 844×390
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs/captures/c406'));

async function seed(page, base, mode) {
  await page.goto(base);
  await page.waitForTimeout(600);
  const out = await page.evaluate(async (mode) => {
    localStorage.clear();
    const g = await import('/src/game.ts');
    const s = g.newSaveData('hollow', Date.now());
    s.name = '권영';
    s.help.tutorialSeen = true;
    for (const id of ['first-run', 'first-run-room', 'birth', 'recover', 'home-intro', 'recover-cure']) s.help.guides[id] = 'done';
    if (mode === 'cyclops') {
      for (let i = 0; i < 3; i++) g.touchCharacter(s, Date.now() - 4 * 3600000 + i);
      s.evolution.steps = 999999;
      const r = g.performEvolution(s, Date.now());
      for (const k of Object.keys(s.help.guides)) s.help.guides[k] = 'done';
      s.lastSeenAt = Date.now();
      g.writeSave(localStorage, s);
      return { look: s.evolution.look, special: r.ok ? r.record.specialLook : null, evFree: s.evolution.evFree, specialLooks: s.shared.specialLooks };
    }
    s.lastSeenAt = Date.now();
    g.writeSave(localStorage, s);
    return { food: s.shared.food, items: s.shared.items };
  }, mode);
  await page.goto(base);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /이어하기/ }).first().click({ timeout: 5000 });
  await page.waitForTimeout(1600);
  return out;
}
const bubble = (page) => page.evaluate(() => { const b = document.querySelector('.bha-room__bubble, .bha-bubble'); return b && !b.hidden ? b.textContent.trim() : null; });
const text = (page, sel) => page.evaluate((sel) => [...document.querySelectorAll(sel)].map((e) => e.textContent.replace(/\s+/g, ' ').trim()), sel);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { errors: [], shots: [], facts: {} };
  const F = proof.facts;
  try {
    const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => proof.errors.push(e.message.slice(0, 200)));
    const shot = async (name) => { await page.waitForTimeout(350); await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
    const tapChar = async () => { await page.evaluate(() => document.querySelector('.bha-room .bha-char, .bha-room [data-char], .bha-room__char')?.click()); await page.waitForTimeout(450); };

    F.start = await seed(page, server.url, 'new');
    F.charSel = await page.evaluate(() => [...document.querySelectorAll('.bha-room button')].filter((b) => /char/.test(b.className)).map((b) => b.className).slice(0, 3));
    F.touch = [];
    for (let i = 1; i <= 7; i++) {
      await tapChar();
      F.touch.push(await bubble(page));
      if (i === 1) await shot('01-touch-like');
      if (i === 7) await shot('02-touch-7th-hate');
      await page.waitForTimeout(250);
    }
    F.bondAfter = await page.evaluate(async () => { const g = await import('/src/game.ts'); return g.loadSave(localStorage)?.nest.bond; });
    await page.waitForTimeout(2600);
    // 상태 화면
    await page.locator('.bha-room__status').first().click(); await page.waitForTimeout(900);
    F.statusPanels = await text(page, '.bha-care-page .bha-panel__title');
    F.statusEvo = await text(page, '[data-evolution]');
    await shot('03-status-no-holdings');
    // 교감 ⓘ
    const info = page.locator('.bha-care-page [data-info="bond"], .bha-care-page .bha-infobtn').first();
    if (await info.count()) { await info.click().catch(() => {}); await page.waitForTimeout(500); }
    F.infoText = (await text(page, '.bha-infodialog, .bha-info, .bha-statusinfo')).map((t) => t.slice(0, 400));
    await shot('04-status-info');
    // 칭호 도감
    await page.goto(server.url); await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /이어하기/ }).first().click({ timeout: 5000 }); await page.waitForTimeout(1500);
    await page.locator('.bha-prop--book').first().click(); await page.waitForTimeout(900);
    await page.locator('.bha-viewtitle__btn').first().click().catch(() => {}); await page.waitForTimeout(300);
    F.bookViews = await text(page, '.bha-viewtitle__item');
    await page.locator('.bha-viewtitle__item', { hasText: '칭호' }).first().click().catch(() => {}); await page.waitForTimeout(800);
    F.titleTabs = await text(page, '[role="tab"], .bha-tabs button, .bha-seg button');
    await shot('05-title-dex-tabs');
    // 가방 시작 지급
    await page.goto(server.url); await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /이어하기/ }).first().click({ timeout: 5000 }); await page.waitForTimeout(1500);
    await page.evaluate(async () => { const m = await import('/src/ui/lcdScreens.ts'); m.openChestAtConsumables(); });
    await page.locator('.bha-prop--chest').first().click(); await page.waitForTimeout(1000);
    await shot('06-bag-start-items');
    // 외눈형
    F.cyclops = await seed(page, server.url, 'cyclops');
    await shot('07-gillian-cyclops-room');
    await page.close();
  } catch (e) {
    proof.errors.push(`script: ${e.message.slice(0, 300)}`);
  } finally {
    await browser.close();
    server.stop();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 1));
  console.log(JSON.stringify(proof, null, 1));
})();
