// C.558 proof (우라하라 마주침 연출, GDD 5-5 v6.239): 1배 3장.
// 01 PC 걷기 — 우라하라가 배경 쪽에서 흘러와 캐릭터 앞에서 인사(숙이기 + '어이~' 말풍선) 중 / 02 PC 모험 결산 — '우라하라가 시장에 왔다 mm:ss' 한 줄 / 03 폰(667×375) 모험 결산
// 실행: node scripts/c558-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c558'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 667, height: 375 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** 세이브를 심는다. 'meet' = 1바퀴 1번 칸에서 마주치는 빈 길 원정을 이어하기로, 'nest' = 1바퀴를 다 돌아 둥지 칸 도착(귀환 고르기) + 4분 전에 마주침 */
async function seed(page, url, mode) {
  await page.goto(`${url}?test=1`);
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async (mode) => {
    const m = { g: await import('/src/game.ts'), tut: await import('/src/engine/tutorial.ts'), tm: await import('/src/engine/testMode.ts'), w: await import('/src/engine/wanderer.ts'), x: await import('/src/engine/expedition/index.ts') };
    const slots = await import('/src/saveSlots.ts');
    const store = m.tm.testStorage(localStorage);
    const now = Date.now();
    const s = m.g.newSaveData('hollow', now);
    s.name = '시험';
    s.gender = 'male';
    s.help.tutorialSeen = true;
    for (const id of m.tut.GUIDE_IDS) s.help.guides[id] = 'done';
    s.nest.hunger = 30;
    s.nest.condition = 90;
    m.tm.fillAllUnlocked(s);
    let seed = 1;
    while (!m.w.rollWandererMeet(seed, 1, 1)) seed++;
    const exp = m.x.createExpedition({ factionId: s.factionId, seed, hunger: 20, condition: 80, deck: [], build: s.build, evolution: s.evolution });
    if (mode === 'nest') {
      for (let i = 0; i < 400 && exp.phase !== 'nest-choice'; i++) {
        if (exp.phase === 'battle') { const b = m.x.startBattle(exp); b.status = 'won'; m.x.finishBattle(exp, b); }
        else if (exp.phase === 'absorb') m.x.chooseRelease(exp);
        else if (exp.phase === 'rest') m.x.finishRest(exp);
        else if (exp.phase === 'moving') m.x.advance(exp);
        else break;
        exp.hunger = 0;
        m.x.drainEvents(exp);
      }
      const at = now - 4 * 60_000 - 13_000;
      exp.wandererMeets = [{ lap: 1, cell: 1, at }];
      s.shared.wanderer.visit = { at, runId: 0, tier: 3, stock: m.w.rollWandererStock(3, Math.random) };
    }
    s.activeExpedition = m.x.serializeExpedition(exp, 1, now);
    slots.writeSlotSave(store, s, 1);
    slots.touchSlot(store, 1, now);
  }, mode);
  await page.goto(`${url}?test=1`);
  await wait(1500);
  const cont = page.getByRole('button', { name: '이어하기' });
  if (await cont.count()) await cont.click({ timeout: 5000 });
  await wait(2500);
  await page.waitForFunction(() => !document.querySelector('.bha-toast'), null, { timeout: 12000 }).catch(() => {});
}

async function walkShot(browser, url, F) {
  const page = await (await browser.newContext(PC)).newPage();
  page.on('pageerror', (e) => F.errors.push(`walk: ${e.message}`));
  await seed(page, url, 'meet');
  await page.getByRole('button', { name: /모험 이어하기/ }).first().click({ timeout: 4000 });
  await page.waitForSelector('.bha-passer', { timeout: 15000 });
  F.noDialog = (await page.locator('.bha-confirm').count()) === 0;
  // 인사 한가운데(숙인 자세 + 말풍선)로 맞춰 멈춘다: 지나가기·숙이기·말풍선 애니메이션 시각을 그 순간으로
  F.walk = await page.evaluate(() => {
    const p = document.querySelector('.bha-passer');
    const ms = (n) => parseFloat(getComputedStyle(p).getPropertyValue(n));
    const bowAt = ms('--passer-bow-at');
    const sayAt = ms('--passer-say-at');
    const t = bowAt + ms('--passer-bow-ms') * 0.25;
    for (const a of document.getAnimations()) {
      const tg = a.effect?.target;
      if (!tg || !(tg === p || p.contains(tg))) continue;
      a.pause();
      a.currentTime = t;
    }
    const r = (n) => { const b = n.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
    return {
      vars: { passMs: ms('--passer-ms'), bowAt, sayAt },
      passer: r(p), walker: r(document.querySelector('.bha-walker')), scene: r(document.querySelector('.bha-walk')),
      say: { text: p.querySelector('.bha-passer__say')?.textContent, opacity: getComputedStyle(p.querySelector('.bha-passer__say')).opacity },
      figTransform: getComputedStyle(p.querySelector('.bha-passer__fig')).transform,
      behindWalker: [...p.parentElement.children].indexOf(p) < [...p.parentElement.children].indexOf(document.querySelector('.bha-walker')),
    };
  });
  await wait(150);
  await page.screenshot({ path: path.join(OUT, '01-pc-walk-greet.png') });
  await page.context().close();
}

async function resultShot(browser, url, ctx, name, F, key) {
  const page = await (await browser.newContext(ctx)).newPage();
  page.on('pageerror', (e) => F.errors.push(`${key}: ${e.message}`));
  await seed(page, url, 'nest');
  await page.getByRole('button', { name: /모험 이어하기/ }).first().click({ timeout: 4000 });
  await page.getByRole('button', { name: /^귀환$/ }).first().click({ timeout: 8000 });
  await page.waitForSelector('[data-wanderer-result]', { timeout: 10000 });
  await wait(1200);
  F[key] = await page.evaluate(() => {
    const n = document.querySelector('[data-wanderer-result]');
    const r = n.getBoundingClientRect();
    const right = document.querySelector('.bha-result__right')?.getBoundingClientRect();
    return { text: n.textContent, box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], inRight: !!right && r.left >= right.left - 1 && r.right <= right.right + 1, clipped: n.scrollWidth > n.clientWidth + 1 };
  });
  await page.screenshot({ path: path.join(OUT, name) });
  await wait(1100);
  F[`${key}Later`] = await page.evaluate(() => document.querySelector('[data-wanderer-result] .bha-wresult__time')?.textContent);
  await page.context().close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const F = { errors: [] };
  for (const job of [
    () => walkShot(browser, server.url, F),
    () => resultShot(browser, server.url, PC, '02-pc-result-timer.png', F, 'pc'),
    () => resultShot(browser, server.url, PHONE, '03-phone-result-timer.png', F, 'phone'),
  ]) {
    try { await job(); } catch (e) { F.errors.push(String(e && e.stack ? e.stack : e).slice(0, 600)); }
  }
  fs.writeFileSync(path.join(OUT, 'facts.json'), JSON.stringify(F, null, 1));
  console.log(JSON.stringify(F, null, 1));
  await browser.close();
  server.stop();
})();
