// C.497 proof (GDD 8-5 진화 미루기): 진화 기준에 닿은 3단계 몸이 원정 중 [귀환하기] → 둥지에서 [진화] [미루기] 창.
// 01 창 PC 844×390 · 02 같은 창 폰 796×384 · 03 미루기 뒤 둥지(PC) · 04 다음 귀환 때 다시 묻는 창(PC). 1배.
// 세이브는 Vite 개발 서버의 게임 모듈로 만든다(튜토리얼 끝남 · 3단계 · 걸음 = 진화 기준 · 원정 중간 저장) → 이어하기 → 원정 [귀환하기].
// 실행: node scripts/c497-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c497'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PH = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** 진화 기준에 닿은 3단계 호로 + 원정 중간 저장을 슬롯 1에 쓴다 */
async function seed(page, url, deferrals = 0) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async (n) => {
    const g = await import('/src/game.ts');
    const slots = await import('/src/saveSlots.ts');
    const ex = await import('/src/engine/expedition/index.ts');
    const snap = await import('/src/engine/expedition/snapshot.ts');
    const ev = await import('/src/engine/evolution/index.ts');
    const ab = await import('/src/engine/absorb/build.ts');
    const tut = await import('/src/engine/tutorial.ts');
    const now = Date.now();
    const s = g.newSaveData('hollow', now);
    s.name = '권영';
    s.gender = 'male';
    s.help.tutorialSeen = true;
    for (const id of tut.GUIDE_IDS) s.help.guides[id] = 'done';
    const e = s.evolution;
    e.tierIndex = 2;
    e.formHistory = ['t2:base', 't3:water'];
    e.formId = 't3:water';
    e.steps = ev.stepsNeeded(e);
    e.deferrals = n;
    while (s.build.slots.length < 4) s.build.slots.push(null);
    ab.gainTrait(s.build, 't-water-a');
    s.nest.hunger = 20;
    s.nest.condition = 80;
    g.checkUnlocks?.(s, now);
    const exp = ex.createExpedition({ factionId: 'hollow', seed: 11, runId: g.nextRunId(s), hunger: 20, condition: 80, deck: [], build: s.build, evolution: s.evolution, risk: s.nest.risk });
    s.activeExpedition = snap.serializeExpedition(exp, 1, now);
    s.lastScreen = 'expedition';
    slots.writeSlotSave(localStorage, s, 1);
    slots.touchSlot(localStorage, 1, now);
  }, deferrals);
  await page.goto(url);
  await wait(1500);
  await page.getByRole('button', { name: '이어하기' }).click({ timeout: 5000 });
  await wait(2500);
}

/** 원정 화면에서 [귀환하기] → 확인 */
async function abort(page) {
  for (let i = 0; i < 4 && (await page.locator('[data-dev-layer], .bha-tut').count()); i++) { await page.keyboard.press('Escape'); await wait(250); }
  await page.locator('.bha-exp__pausebtn').first().click({ timeout: 5000 }); // 일시정지 창 안에 [귀환하기] (C.298)
  await wait(400);
  await page.locator('.bha-exp__abort').first().click({ timeout: 5000 });
  await wait(500);
  const yes = page.locator('.bha-confirm').getByRole('button', { name: '귀환하기' }).filter({ visible: true });
  if (await yes.count()) await yes.last().click({ timeout: 3000 });
  await wait(1800);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { shots: [], errors: [], checks: {} };
  const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  try {
    // 01·03·04: PC
    const page = await browser.newPage(PC);
    page.on('pageerror', (e) => proof.errors.push(e.message));
    await seed(page, srv.url);
    if (process.env.C497_DEBUG) { await shot(page, '00-debug'); proof.checks.btns = await page.getByRole('button').allInnerTexts(); }
    await abort(page);
    await page.locator('.bha-evolve-choice').waitFor({ timeout: 5000 });
    proof.checks.pcDialog = (await page.locator('.bha-evolve-choice').innerText()).replace(/\s+/g, ' ');
    await shot(page, '01-choice-pc');
    // 기기 취소(Esc)로는 닫히지 않는다
    await page.keyboard.press('Escape');
    await wait(300);
    proof.checks.escKeepsOpen = (await page.locator('.bha-evolve-choice').count()) === 1;
    await page.locator('.bha-evolve-choice').getByRole('button', { name: '미루기' }).click();
    await wait(1200);
    const after = await page.evaluate(async () => {
      const g = await import('/src/game.ts');
      const s = g.loadSave(localStorage);
      return s && s.evolution ? { tier: s.evolution.tierIndex, deferrals: s.evolution.deferrals, log: s.runLog.tiers.deferrals.length } : null;
    }).catch(() => null);
    proof.checks.afterDefer = after;
    proof.checks.roomAfterDefer = (await page.locator('.bha-evolve-choice').count()) === 0 && (await page.locator('.bha-room').count()) > 0;
    await shot(page, '03-room-after-defer');
    // 04: 다음 귀환 — 미루기 1회 세이브로 다시 원정 → [귀환하기] → 다시 묻는다
    await seed(page, srv.url, 1);
    await abort(page);
    await page.locator('.bha-evolve-choice').waitFor({ timeout: 5000 });
    await shot(page, '04-choice-again-pc');
    await page.close();
    // 02: 폰
    const ph = await browser.newPage(PH);
    ph.on('pageerror', (e) => proof.errors.push(e.message));
    await seed(ph, srv.url);
    await abort(ph);
    await ph.locator('.bha-evolve-choice').waitFor({ timeout: 5000 });
    await shot(ph, '02-choice-phone');
    await ph.close();
  } catch (err) {
    proof.errors.push(String(err && err.stack || err));
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close();
    srv.stop();
  }
  console.log(JSON.stringify(proof, null, 2));
})();
