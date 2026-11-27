// C.553 proof (우라하라 마주침 창 꾸밈, GDD 5-5 v6.227): 1배 3장.
// 01 PC 마주침 창(왼쪽 우라하라 도트 + 제목 + [확인 (n)], 머묾 문구 없음) / 02 폰(작은 가로 667×375) 같은 창 / 03 등장 연출(튀어 오름) 중간
// 실행: node scripts/c553-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c553'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 667, height: 375 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** 세이브를 심는다. mode 'meet' = 1바퀴 1번 칸에서 마주치는 원정을 이어하기로, 'here' = 우라하라가 3초 전에 와 있음 */
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
    if (mode === 'here') s.shared.wanderer.visit = { at: now - 3000, runId: 0, tier: 3, stock: m.w.rollWandererStock(3, Math.random) };
    if (mode === 'meet') {
      let seed = 1;
      while (!m.w.rollWandererMeet(seed, 1, 1)) seed++;
      const exp = m.x.createExpedition({ factionId: s.factionId, seed, hunger: 20, condition: 80, deck: [], build: s.build, evolution: s.evolution });
      s.activeExpedition = m.x.serializeExpedition(exp, 1, now);
    }
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


/** 창 안 글·그림이 창·LCD 밖으로 잘리는지 */
const facts = (page) => page.evaluate(() => {
  const q = (s) => document.querySelector(`.bha-wmeet ${s}`);
  const box = (n) => { if (!n) return null; const r = n.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; };
  const modal = q('.bha-modal');
  const lcd = document.querySelector('.bha-lcd');
  const inside = (n, p) => { if (!n || !p) return null; const a = n.getBoundingClientRect(); const b = p.getBoundingClientRect(); return a.left >= b.left - 0.5 && a.right <= b.right + 0.5 && a.top >= b.top - 0.5 && a.bottom <= b.bottom + 0.5; };
  const fig = q('.bha-wmeet__fig');
  const clipped = (n) => !!n && (n.scrollWidth > n.clientWidth + 1 || n.scrollHeight > n.clientHeight + 1);
  return {
    title: q('.bha-modal__title')?.textContent, body: q('.bha-modal__body')?.textContent, button: q('.bha-btn')?.textContent,
    fig: fig ? { loaded: fig.complete && fig.naturalWidth > 0, natural: [fig.naturalWidth, fig.naturalHeight], box: box(fig), render: getComputedStyle(fig).imageRendering, anim: getComputedStyle(fig).animationName } : null,
    modal: box(modal), lcd: box(lcd), modalInLcd: inside(modal, lcd), figInModal: inside(fig, modal), titleInModal: inside(q('.bha-modal__title'), modal), btnInModal: inside(q('.bha-btn'), modal),
    textClipped: [q('.bha-modal__title'), q('.bha-modal__body'), q('.bha-btn')].map(clipped),
  };
});

async function shot(browser, url, ctx, name, F, key, mid) {
  const page = await (await browser.newContext(ctx)).newPage();
  page.on('pageerror', (e) => F.errors.push(`${key}: ${e.message}`));
  await seed(page, url, 'meet');
  await page.getByRole('button', { name: /모험 이어하기/ }).first().click({ timeout: 4000 });
  await page.waitForSelector('.bha-wmeet', { timeout: 15000 });
  if (mid) {
    // 등장 연출 중간: 도트 애니메이션을 멈추고 55%(가장 높이 뜬 때) 근처로 — 창 자체 등장 애니메이션은 끝으로
    await page.waitForSelector('.bha-wmeet__fig', { timeout: 3000 });
    F[key] = await page.evaluate(() => {
      const out = [];
      for (const a of document.getAnimations()) {
        const t = a.effect?.getComputedTiming?.();
        const el = a.effect?.target;
        a.pause();
        if (el?.classList?.contains('bha-wmeet__fig')) { a.currentTime = 80 + 280 * 0.45; out.push({ name: a.animationName, at: a.currentTime, transform: getComputedStyle(el).transform }); }
        else if (t && Number.isFinite(t.endTime)) a.currentTime = t.endTime;
      }
      return out;
    });
    await wait(100);
  } else {
    await page.waitForSelector('.bha-wmeet__fig', { timeout: 3000 });
    await wait(600);
    await page.screenshot({ path: path.join(OUT, name) });
    F[key] = await facts(page);
    return page.context().close();
  }
  await page.screenshot({ path: path.join(OUT, name) });
  await page.context().close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const F = { errors: [] };
  for (const job of [
    () => shot(browser, server.url, PC, '01-pc-meet.png', F, 'pc'),
    () => shot(browser, server.url, PHONE, '02-phone-meet.png', F, 'phone'),
    () => shot(browser, server.url, PC, '03-pc-hop-mid.png', F, 'hop', true),
  ]) {
    try { await job(); } catch (e) { F.errors.push(String(e && e.stack ? e.stack : e).slice(0, 600)); }
  }
  fs.writeFileSync(path.join(OUT, 'facts.json'), JSON.stringify(F, null, 1));
  console.log(JSON.stringify(F, null, 1));
  await browser.close();
  server.stop();
})();
