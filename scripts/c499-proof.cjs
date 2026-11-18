// C.499 proof (GDD 8-7 1차 — 진화체 고유 능력 장치): PC 844×390, 1배.
// 01 사신 백련 전투 중(바에 쌓인 블록 · 고유 능력 네모 · '백련!' 글자) · 02 사신 노도 전투 중(노도 스택 네모 · 노도 연격 특수 블록 · '노도!' 글자)
// 03 상태 화면 고유 능력·특수 블록·만해 줄(노도) · 04 소멸선 처형선 두 개(평타선 8% · 블록선 20%, 테스트용 상태 주입) + 처형 블록 켜짐.
// 세이브는 Vite 개발 서버의 게임 모듈로 만든다(튜토리얼 끝남 · 4단계 진화체 · 4단계 특성) → 이어하기 → 테스트 모드 '바로 전투'.
// 실행: node scripts/c498-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c499'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** 4단계 사신 진화체 + 4단계 특성 세이브를 슬롯 1에 쓴다 */
async function seed(page, url, formId, third, trait) {
  await page.goto(`${url}?test=1`);
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async ({ formId, third, trait }) => {
    const g = await import('/src/game.ts');
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
    e.abilities = { owned: { [`evo:${trait}`]: 1 }, equipped: [`evo:${trait}`], slots: 2, tier4Ever: true };
    while (s.build.slots.length < 6) s.build.slots.push(null);
    s.nest.hunger = 80;
    s.nest.condition = 90;
    g.checkUnlocks?.(s, now);
    slots.writeSlotSave(store, s, 1);
    slots.touchSlot(store, 1, now);
  }, { formId, third, trait });
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
  try {
    // 01 백련
    let page = await browser.newPage(PC);
    page.on('pageerror', (e) => proof.errors.push(e.message));
    await seed(page, srv.url, 't4:normal:physical', 't3:normal', 'aspd10');
    await battle(page);
    proof.checks.baekryeon = await page.evaluate(() => {
      const s = window.__bhaCombat;
      const fams = ['family-a', 'family-b', 'family-c', 'family-a', 'family-b'];
      for (const f of fams) s.tray.push({ uid: s.nextUid++, kind: 'skill', traitId: 'basic-skill', family: f, element: null });
      s.events.push({ kind: 'evo-proc', text: '백련!', damage: 0 });
      return { evo: !!s.params.evo, voidOnly: s.params.evo?.ability.spawnRule, aspdTrait: s.params.abilityEffects.evoAttackSpeed ?? 0, tray: s.tray.length };
    });
    await wait(150);
    proof.checks.baekryeonMarks = await page.locator('.bha-mark').evaluateAll((els) => els.map((e) => `${e.dataset.mark}:${e.textContent}`));
    await shot(page, '01-baekryeon-battle');
    await page.close();

    // 02 노도 · 03 상태 화면
    page = await browser.newPage(PC);
    page.on('pageerror', (e) => proof.errors.push(e.message));
    await seed(page, srv.url, 't4:water:physical', 't3:water', 'crit6');
    await page.keyboard.press('g');
    await wait(1200);
    const uniq = page.locator('[data-evo-unique]');
    proof.checks.statusLines = (await uniq.count()) ? await uniq.first().innerText() : null;
    if (await uniq.count()) await uniq.first().scrollIntoViewIfNeeded();
    await wait(300);
    await shot(page, '03-status-unique-lines');
    await page.keyboard.press('Escape');
    await wait(600);
    await battle(page);
    proof.checks.nodo = await page.evaluate(() => {
      const s = window.__bhaCombat;
      const far = s.tick + 1e6;
      s.evo.stacks.surge = { n: 3, exp: [far, far, far] };
      for (const f of ['family-a', 'family-a', 'family-b']) s.tray.push({ uid: s.nextUid++, kind: 'skill', traitId: 'basic-skill', family: f, element: null });
      s.tray.push({ uid: s.nextUid++, kind: 'skill', traitId: 'evo:rush', family: null, element: null, solo: true });
      s.events.push({ kind: 'evo-proc', text: '노도!', damage: 0 });
      return { crit: s.params.abilityEffects.evoCrit ?? 0, special: !!s.params.evo?.ability.specials?.rush };
    });
    await wait(150);
    proof.checks.nodoMarks = await page.locator('.bha-mark').evaluateAll((els) => els.map((e) => `${e.dataset.mark}:${e.textContent}`));
    await shot(page, '02-nodo-battle-stacks');
    await page.close();

    // 04 소멸선 (공화 + 소멸선 특성, 블록선은 테스트용 상태 주입)
    page = await browser.newPage(PC);
    page.on('pageerror', (e) => proof.errors.push(e.message));
    await seed(page, srv.url, 'h4:void', 't3:normal', 'obliteration');
    await battle(page);
    proof.checks.oblit = await page.evaluate(() => {
      const s = window.__bhaCombat;
      s.params.evo = { formId: 'h4:void', ability: { description: '', specials: { nil: { name: '공허', short: '공', keep: true, usable: 'execBlock' } }, passives: [{ stat: 'execBlockLine', value: 0.2 }] }, nums: {}, relNums: {} };
      s.evo ??= { stacks: {}, buffs: {}, charges: {}, counters: [], clocks: [], streaks: [], timers: {}, procs: {}, shieldAbsorbed: 0, extraBonus: 0, fromEvo: false, forceCrit: false, executes: 0 };
      for (let k = 0; k < 2; k++) s.tray.push({ uid: s.nextUid++, kind: 'skill', traitId: 'evo:nil', family: null, element: null, solo: true, fixed: true });
      for (const f of ['family-a', 'family-b', 'family-c']) s.tray.push({ uid: s.nextUid++, kind: 'skill', traitId: 'basic-skill', family: f, element: null });
      s.enemy.hp = s.enemy.maxHp * 0.16;
      s.events.push({ kind: 'evo-proc', text: '처형!', damage: 0 });
      return { execute: s.params.abilityEffects.execute ?? null };
    });
    await wait(150);
    proof.checks.execLines = await page.locator('.bha-execline').evaluateAll((els) => els.map((e) => ({ cls: e.className, hidden: e.hidden, left: e.style.left, title: e.title })));
    await shot(page, '04-obliteration-exec-lines');
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
