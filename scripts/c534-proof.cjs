// C.534 proof (GDD 8-9 v6.194, 사용자 2026-11-24 "수련장에서 뒤로가기 눌러도 전투로 진입함. 그리고 그만두기하면 훈련 설정으로 돌아가고 거기서 뒤로가면 홈으로가게 해"):
// ① 수련장 화면([전투 들어가기]) 뒤로 = 방 ② 훈련 인형 전투 중 [그만두기] = 훈련 설정 창(빈 적 자리 + 적 설정 창) ③ 설정 창 뒤로 = 방.
// PC 844×390 + 폰 796×384 터치 두 벌, 1배. 실행: node scripts/c534-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c534'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PH = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const BTN = { ok: '확정', back: '취소' };
const press = async (page, b) => { await page.locator(`.bha-dev__btn[aria-label="${BTN[b]}"]`).first().click({ timeout: 2000 }).catch(() => {}); await wait(500); };

async function skipTut(page) {
  for (let t = 0; t < 40 && (await page.locator('.bha-tut').count()); t++) {
    const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled]), .bha-tut button:has-text("다음"), .bha-tut button:has-text("확인"), .bha-tut button:has-text("닫기")').filter({ visible: true });
    if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
    else await page.locator('.bha-lcd').first().click({ timeout: 2000 }).catch(() => {});
    await wait(400);
  }
}
async function closeNotes(page) {
  for (const b of ['닫기', '확인', '나중에']) { const x = page.getByRole('button', { name: b, exact: true }).filter({ visible: true }); if (await x.count()) await x.first().click({ timeout: 1500 }).catch(() => {}); }
  await wait(300);
}
async function newGame(page, url, tutorialDone = true) {
  await page.goto(url);
  await wait(600);
  await page.evaluate(async (tutorialDone) => {
    localStorage.clear();
    const g = await import('/src/game.ts');
    const F = await import('/src/data/factions/index.ts');
    const now = Date.now();
    const s = g.newSaveData(F.FACTIONS[0].id, now);
    s.name = '권영'; s.help.tutorialSeen = true; s.lastSeenAt = now;
    for (const id of Object.keys(s.help.guides ?? {})) s.help.guides[id] = 'done';
    const ids = ['first-run', 'first-run-room', 'birth', 'recover', 'home-intro', 'recover-cure', 'tile-intro', 'tile-plan', 'tile-draw', 'unlock-gear', 'unlock-pet'];
    if (tutorialDone) ids.push('practice', 'practice-intro');
    for (const id of ids) s.help.guides[id] = 'done';
    g.writeSave(localStorage, s);
  }, tutorialDone);
  await page.goto(url);
  await wait(1200);
  await page.getByRole('button', { name: /이어하기/ }).first().click({ timeout: 5000 }).catch(() => {});
  await wait(3500);
  await skipTut(page);
  await closeNotes(page);
}
/** 지금 화면: room = 방, entry = 수련장 화면([전투 들어가기]), dialog = 전투 + 설정 창, slot = 전투 빈 적 자리(창 닫힘), fight = 적과 전투 중 */
const where = (page) => page.evaluate(() => {
  if (document.querySelector('.bha-room--home')) return 'room';
  if (document.querySelector('[data-sc="practice-enter"]')) return 'entry';
  if (document.querySelector('.bha-testarena')) return 'dialog';
  if ([...document.querySelectorAll('.bha-battle .bha-battle-ov__title')].some((e) => e.textContent === '일시정지')) return 'paused';
  if (document.querySelector('.bha-unit--foe.is-empty') || document.querySelector('.bha-testarena__slot')) return 'slot';
  if (document.querySelector('.bha-battle')) return 'fight';
  return 'other';
});

/** 방이 될 때까지 뒤로 (최대 6번) — 지나간 화면을 돌려준다 */
async function backToRoom(page) {
  const seq = [];
  for (let i = 0; i < 6 && (await where(page)) !== 'room'; i++) {
    await press(page, 'back');
    seq.push(await where(page));
    if (seq[seq.length - 1] === 'paused') await page.locator('.bha-overlay').getByRole('button', { name: '그만두기' }).first().click({ timeout: 2000 }).catch(() => {}), await wait(800), seq.push(`quit→${await where(page)}`);
  }
  await skipTut(page);
  return seq;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { errors: [], shots: [], flows: {} };
  try {
    for (const [tag, opt] of [['pc', PC], ['phone', PH]]) {
      const ctx = await browser.newContext(opt);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`${tag}: ${e.message.slice(0, 200)}`));
      const shot = async (name) => { const f = `${name}-${tag}.png`; await page.screenshot({ path: path.join(OUT, f) }); proof.shots.push(f); };
      const F = (proof.flows[tag] = {});
      await newGame(page, server.url);
      // ③ 방 → 훈련 인형 = 전투 + 설정 창 → 뒤로 = 방
      await page.locator('.bha-prop--altar').first().click({ timeout: 4000 });
      await wait(1400);
      F.enter = await where(page);
      await press(page, 'back');
      F.dialogBack = await where(page);
      await shot('03-dialog-back-room');
      F.dialogBackRest = await backToRoom(page);
      // ② 다시 → [확인] 적 등장 → [그만두기] = 설정 창
      await page.locator('.bha-prop--altar').first().click({ timeout: 4000 });
      await wait(1400);
      await page.getByRole('button', { name: '확인', exact: true }).filter({ visible: true }).last().click({ timeout: 2000 });
      await page.waitForFunction(() => !document.querySelector('.bha-unit--foe.is-empty') && !document.querySelector('.bha-testarena'), null, { timeout: 15000 });
      await wait(2200); // 조우 연출이 끝날 때까지
      F.fight = await where(page);
      await page.getByRole('button', { name: '그만두기' }).filter({ visible: true }).first().click({ timeout: 2000 });
      await wait(900);
      F.quit = await where(page);
      await shot('02-quit-dialog');
      // 일시정지 창의 [그만두기]도 같은 곳
      await page.getByRole('button', { name: '확인', exact: true }).filter({ visible: true }).last().click({ timeout: 2000 });
      await page.waitForFunction(() => !document.querySelector('.bha-testarena'), null, { timeout: 15000 });
      await wait(2200);
      await press(page, 'back'); // 뒤로 = 일시정지
      F.pausedByBack = await where(page);
      await page.locator('.bha-overlay').getByRole('button', { name: '그만두기' }).first().click({ timeout: 2000 });
      await wait(900);
      F.quitFromPause = await where(page);
      // 설정 창 [나가기] = 수련장 화면(기존 결정) → 뒤로 = 방
      await page.getByRole('button', { name: '나가기', exact: true }).filter({ visible: true }).first().click({ timeout: 2000 });
      await wait(900);
      F.exit = await where(page);
      await press(page, 'back');
      F.entryBack = await where(page);
      await wait(1500);
      F.entryBackLater = await where(page);
      await shot('01-entry-back-room');
      F.entryBackRest = await backToRoom(page);
      // 폰 뒤로가기(브라우저 history back)도 같은 길
      await page.locator('.bha-prop--altar').first().click({ timeout: 4000 });
      await wait(1400);
      await page.goBack().catch(() => {});
      await wait(900);
      F.historyBackDialog = await where(page);
      // 설정 창 [창 닫기] = 빈 적 자리 → 뒤로 = 방 (일시정지 아님)
      await page.locator('.bha-prop--altar').first().click({ timeout: 4000 });
      await wait(1400);
      await page.getByRole('button', { name: '창 닫기', exact: true }).filter({ visible: true }).first().click({ timeout: 2000 });
      await wait(500);
      F.closed = await where(page);
      await press(page, 'back');
      F.slotBack = await where(page);
      await ctx.close();
    }
  } catch (e) {
    proof.errors.push(`중단: ${String(e.message).split('\n')[0]}`);
  } finally {
    await browser.close();
    server.stop();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 1));
})();
