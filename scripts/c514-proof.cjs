// C.514 proof (GDD 8-7 2차 — 사신 현음·석양홍·만리장): PC 844×390, 1배.
// 01 현음 바 '체인4' 묶음 · 02 현음 4체인 「사현」 발동 · 03 석양홍 「석양」 특수 평타(귀 계열 불 도트 이펙트 재사용) · 04 만리장 굳은 3체인 '체인3 · 굳음'.
// 블록은 실제 규칙으로 쓰고(사용·충전·굳음 시간), 바에 블록 놓기만 테스트용 주입. 세이브·바로 전투는 c506-proof 와 같은 방식.
// 실행: node scripts/c514-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c514'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** 4단계 사신 진화체 + 4단계 특성 세이브를 슬롯 1에 쓴다 */
async function seed(page, url, formId, third, extra = {}) {
  await page.goto(`${url}?test=1`);
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async ({ formId, third, extra }) => {
    const g = await import('/src/game.ts');
    const fa = await import('/src/engine/evolution/formAbilities.ts');
    const fd = await import('/src/data/evolution/index.ts');
    const slots = await import('/src/saveSlots.ts');
    const tut = await import('/src/engine/tutorial.ts');
    const tm = await import('/src/engine/testMode.ts');
    const store = tm.testStorage(localStorage); // 테스트 모드 세이브 칸
    const now = Date.now();
    const s = g.newSaveData('shinigami', now);
    s.name = '권영';
    s.gender = 'male';
    s.help.tutorialSeen = true;
    for (const id of tut.GUIDE_IDS) s.help.guides[id] = 'done';
    const e = s.evolution;
    e.tierIndex = 3;
    e.formHistory = ['t2:base', third, formId];
    e.formId = formId;
    e.ascended = true;
    const trait = fa.representativeAbility(fd.getForm(formId), 'shinigami')?.id;
    e.abilities = { owned: trait ? { [trait]: 1 } : {}, equipped: trait ? [trait] : [], slots: 2, tier4Ever: true };
    if (extra.pets) {
      s.shared.unlocks.pet = now;
      for (const id of extra.pets) s.shared.pets.owned[id] = { laps: 0, gotAt: now };
      s.shared.pets.active = extra.pets[0];
      s.shared.pets.active2 = extra.pets[1];
    }
    while (s.build.slots.length < 6) s.build.slots.push(null);
    s.nest.hunger = 80;
    s.nest.condition = 90;
    g.checkUnlocks?.(s, now);
    slots.writeSlotSave(store, s, 1);
    slots.touchSlot(store, 1, now);
  }, { formId, third, extra });
  await page.goto(`${url}?test=1`);
  await wait(1500);
  const cont = page.getByRole('button', { name: '이어하기' });
  if (await cont.count()) await cont.click({ timeout: 5000 });
  else {
    await page.getByRole('button', { name: '불러오기' }).click({ timeout: 5000 });
    await wait(500);
    await page.locator('.bha-slot').first().click();
    await page.getByRole('button', { name: '확인' }).click({ timeout: 3000 });
  }
  await wait(2500);
  for (let i = 0; i < 4 && (await page.locator('[data-dev-layer], .bha-tut').count()); i++) { await page.keyboard.press('Escape'); await wait(250); }
}

async function openTest(page, tabName) {
  await page.getByRole('button', { name: /더보기/ }).first().click({ timeout: 3000 });
  await wait(400);
  await page.getByRole('button', { name: '테스트', exact: true }).first().click({ timeout: 3000 });
  await wait(700);
  await page.locator('.bha-test-page .bha-viewtitle, .bha-test-page [aria-haspopup]').first().click({ timeout: 2000 }).catch(() => {});
  await wait(300);
  await page.getByRole('option', { name: tabName }).or(page.getByRole('menuitemradio', { name: tabName })).or(page.getByRole('button', { name: tabName })).first().click({ timeout: 3000 });
  await wait(600);
}

/** 바로 전투 → 멈춘 상태(타이머 정지)로 */
async function battle(page) {
  await openTest(page, '바로 전투');
  await page.getByRole('button', { name: '전투 들어가기' }).first().click({ timeout: 3000 });
  await wait(800);
  const ok = page.getByRole('button', { name: '확인', exact: true }).filter({ visible: true });
  if (await ok.count()) await ok.last().click({ timeout: 3000 });
  await page.waitForFunction(() => !!window.__bhaCombat && window.__bhaCombat.tick > 5, null, { timeout: 15000 });
  await page.evaluate(() => {
    const s = window.__bhaCombat;
    s.enemy.maxHp *= 50; s.enemy.hp = s.enemy.maxHp; s.player.maxHp *= 3; s.player.hp = s.player.maxHp;
    s.spawnTimer = 1e9; s.enemy.attackTimer = 1e9; s.enemy.actionTimer = 1e9; s.params.timeLimitSeconds = 1e6; s.player.attackTimer = 1e9;
    s.tray = [];
  });
  await wait(300);
}



(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { shots: [], errors: [], checks: {} };
  const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  const marks = (page) => page.locator('.bha-mark').evaluateAll((els) => els.map((e) => `${e.dataset.mark}:${e.textContent}`));
  const tabs = (page) => page.locator('.bha-chain__tab').allInnerTexts();
  const fresh = async () => { const p = await browser.newPage(PC); p.on('pageerror', (e) => proof.errors.push(e.message)); return p; };
  try {
    // 01·02 현음: 같은 블록 4개 + 다른 1개 → 바 '체인4' 묶음 → 써서 「사현」(실제 사용)
    let page = await fresh();
    await seed(page, srv.url, 't4:normal:special', 't3:normal');
    await battle(page);
    proof.checks.hyeon = await page.evaluate(async () => {
      const c = await import('/src/engine/combat/index.ts');
      const s = window.__bhaCombat;
      const push = (f) => s.tray.push({ uid: s.nextUid++, kind: 'skill', traitId: 'basic-skill', family: f, element: null });
      for (const f of ['family-a', 'family-a', 'family-a', 'family-a', 'family-b', 'family-c']) push(f);
      return { cap: c.chainCapOf(s), groups: c.chainGroupsOf(s.tray, c.chainCapOf(s)) };
    });
    await wait(300);
    proof.checks.hyeonTabs = await tabs(page);
    await shot(page, '01-hyeoneum-chain4-bar');
    proof.checks.hyeonUse = await page.evaluate(async () => {
      const c = await import('/src/engine/combat/index.ts');
      const s = window.__bhaCombat;
      const ok = c.applyInput(s, { type: 'use', cell: 0 });
      return { ok, tray: s.tray.length, procs: s.evo.procs, byChain: s.blocksByChain };
    });
    await wait(260);
    await shot(page, '02-hyeoneum-sahyeon');
    await page.close();

    // 03 석양홍: 귀 블록 → 화상, 화상 걸린 적에게 귀 블록 → 석양 충전(실제 사용) → 다음 평타 「석양」
    page = await fresh();
    await seed(page, srv.url, 't4:fire:special', 't3:fire');
    await battle(page);
    proof.checks.sunset = await page.evaluate(async () => {
      const c = await import('/src/engine/combat/index.ts');
      const s = window.__bhaCombat;
      const push = (f) => s.tray.push({ uid: s.nextUid++, kind: 'skill', traitId: 'basic-skill', family: f, element: null });
      push('family-c');
      c.applyInput(s, { type: 'use', cell: 0 });
      push('family-c');
      c.applyInput(s, { type: 'use', cell: 0 });
      for (const f of ['family-a', 'family-b', 'family-c']) push(f);
      const charge = s.evo.charges.sunset?.n ?? 0;
      s.player.attackTimer = 3;
      return { charge, burn: s.evo.buffs.burn ?? null, el: s.params.playerElements };
    });
    await page.waitForFunction(() => (window.__bhaCombat.evo.procs['석양!'] ?? 0) > 0, null, { timeout: 5000 }).catch(() => {});
    await page.evaluate(() => { window.__bhaCombat.player.attackTimer = 1e9; });
    await wait(180);
    proof.checks.sunsetMarks = await marks(page);
    proof.checks.sunsetFx = await page.locator('.bha-pxfx-wrap').evaluateAll((els) => els.map((e) => e.dataset.fx));
    await shot(page, '03-seokyanghong-sunset-shot');
    proof.checks.sunsetAfter = await page.evaluate(() => ({ procs: window.__bhaCombat.evo.procs, charge: window.__bhaCombat.evo.charges.sunset?.n }));
    await page.close();

    // 04 만리장: 흙 3체인 묶음이 2초 지나 '굳음' (실제 시간)
    page = await fresh();
    await seed(page, srv.url, 't4:earth:special', 't3:earth');
    await battle(page);
    proof.checks.wall = await page.evaluate(() => {
      const s = window.__bhaCombat;
      const push = (f) => s.tray.push({ uid: s.nextUid++, kind: 'skill', traitId: 'basic-skill', family: f, element: null });
      for (const f of ['family-a', 'family-a', 'family-a', 'family-b', 'family-b']) push(f);
      return { el: s.params.playerElements, tick: s.tick };
    });
    await wait(3000);
    proof.checks.wallDebug = await page.evaluate(async () => {
      const c = await import('/src/engine/combat/index.ts');
      const s = window.__bhaCombat;
      return { tick: s.tick, groups: s.evo.groups, hard: s.evo.stacks.hard, starts: c.evoHardenedStarts(s), harden: s.params.evo?.ability.harden ?? null, els: s.tray.map((b) => c.blockElementOf(s.params, b)), cap: c.chainCapOf(s), status: s.status };
    });
    await page.waitForFunction(async () => { const c = await import('/src/engine/combat/index.ts'); return c.evoHardenedStarts(window.__bhaCombat).length > 0; }, null, { timeout: 8000 }).catch(() => {});
    await wait(300);
    proof.checks.wallTabs = await tabs(page);
    proof.checks.wallMarks = await marks(page);
    await shot(page, '04-manrijang-hardened-chain3');
    await page.close();
  } catch (err) {
    proof.errors.push(String(err && err.stack || err));
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close();
    srv.stop?.();
    process.exit(0);
  }
})();
