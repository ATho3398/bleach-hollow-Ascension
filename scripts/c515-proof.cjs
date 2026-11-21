// C.515 proof (GDD 8-7 2차 — 호로 9종 고유 능력): PC 844×390, 1배. 테스트 모드 세이브(이 몸으로 = 4단계 진화체) → 바로 전투, 장면은 상태 주입으로 고정.
// 01 토르멘타 자기장 필드 + 강화 자기장(적 쪽 네모 · 지속 피해 숫자) · 02 추파카브라 첫 칸 고정 혈 블록 + 저장 네모 · 03 게파르도 낙뢰 특수 블록 + 낙뢰 버프 · 04 바라쿠다 이빨 충전 네모.
// 실행: node scripts/c515-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c515'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** 4단계 호로 진화체(대표 특성 장착, 아란칼화 깬 생) 세이브를 슬롯 1에 쓰고 이어하기 */
async function seed(page, url, formId, third) {
  await page.goto(`${url}?test=1`);
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async ({ formId, third }) => {
    const g = await import('/src/game.ts');
    const slots = await import('/src/saveSlots.ts');
    const tut = await import('/src/engine/tutorial.ts');
    const tm = await import('/src/engine/testMode.ts');
    const evo = await import('/src/engine/evolution/index.ts');
    const data = await import('/src/data/evolution/index.ts');
    const store = tm.testStorage(localStorage);
    const now = Date.now();
    const s = g.newSaveData('hollow', now);
    s.name = '호영';
    s.gender = 'male';
    s.help.tutorialSeen = true;
    for (const id of tut.GUIDE_IDS) s.help.guides[id] = 'done';
    const e = s.evolution;
    e.tierIndex = 3;
    e.formHistory = ['t2:base', third, formId];
    e.formId = formId;
    e.ascended = formId !== 'h4:frenzy';
    const rep = evo.representativeAbility(data.getForm(formId), 'hollow');
    e.abilities = rep ? { owned: { [rep.id]: 1 }, equipped: [rep.id], slots: 2, tier4Ever: true } : { owned: {}, equipped: [], slots: 2, tier4Ever: true };
    while (s.build.slots.length < 6) s.build.slots.push(null);
    s.nest.hunger = 80;
    s.nest.condition = 90;
    g.checkUnlocks?.(s, now);
    slots.writeSlotSave(store, s, 1);
    slots.touchSlot(store, 1, now);
  }, { formId, third });
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

const marks = (page) => page.locator('.bha-mark').evaluateAll((els) => els.map((e) => `${e.dataset.mark}:${e.textContent}`));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { shots: [], errors: [], checks: {} };
  const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  const scene = async (name, formId, third, inject) => {
    const page = await browser.newPage(PC);
    page.on('pageerror', (e) => proof.errors.push(`${name}: ${e.message}`));
    await seed(page, srv.url, formId, third);
    await battle(page);
    proof.checks[name] = await page.evaluate(inject);
    await wait(250);
    proof.checks[`${name}Marks`] = await marks(page);
    proof.checks[`${name}Blocks`] = await page.locator('.bha-tray [data-kind], .bha-blk').evaluateAll((els) => els.map((e) => `${e.dataset.kind ?? ''}:${e.textContent.trim()}`)).catch(() => []);
    await shot(page, name);
    await page.close();
  };
  try {
    await scene('01-tormenta-field-storm', 't4:thunder:special', 't3:thunder', () => {
      const s = window.__bhaCombat;
      const far = s.tick + 1e6;
      s.evo.stacks.field = { n: 1, exp: [far] };
      s.evo.buffs.storm = { value: 0.02, until: far };
      for (const f of ['family-c', 'family-c', 'family-a']) s.tray.push({ uid: s.nextUid++, kind: 'skill', traitId: 'basic-skill', family: f, element: null });
      s.events.push({ kind: 'evo-proc', text: '강화 자기장!', damage: 0 });
      s.events.push({ kind: 'dot', target: 'enemy', damage: Math.round(s.enemy.maxHp * 0.02) });
      return { evo: s.params.evo?.formId, field: s.evo.stacks.field.n, storm: s.evo.buffs.storm.value, spawnCut: s.params.abilityEffects.evoSpawnCut ?? 0 };
    });
    await scene('02-chupacabra-vessel-stored', 't4:blood:physical', 't3:blood', () => {
      const s = window.__bhaCombat;
      s.tray.unshift({ uid: s.nextUid++, kind: 'skill', traitId: 'evo:vessel', family: null, element: null, solo: true, fixed: true });
      for (const f of ['family-a', 'family-b']) s.tray.push({ uid: s.nextUid++, kind: 'skill', traitId: 'basic-skill', family: f, element: null });
      s.evo.stacks.stored.n = Math.round(s.player.maxHp * 0.3);
      s.player.hp = s.player.maxHp * 0.7;
      s.events.push({ kind: 'evo-proc', text: '흡혈!', damage: 0 });
      return { first: s.tray[0].traitId, stored: s.evo.stacks.stored.n, maxHp: Math.round(s.player.maxHp), drain: s.params.abilityEffects.evoDrain ?? 0 };
    });
    await scene('03-guepardo-bolt', 't4:thunder:mixed', 't3:thunder', () => {
      const s = window.__bhaCombat;
      for (const f of ['family-b', 'family-a']) s.tray.push({ uid: s.nextUid++, kind: 'skill', traitId: 'basic-skill', family: f, element: null });
      s.tray.push({ uid: s.nextUid++, kind: 'skill', traitId: 'evo:bolt', family: null, element: null, solo: true });
      s.evo.buffs.bolt = { value: 0.3, until: s.tick + 1e6 };
      s.events.push({ kind: 'evo-proc', text: '낙뢰!', damage: 0 });
      return { bolt: s.tray.filter((b) => b.traitId === 'evo:bolt').length, aspd: s.params.abilityEffects.evoAttackSpeed ?? 0 };
    });
    await scene('04-barracuda-fang', 't4:water:mixed', 't3:water', () => {
      const s = window.__bhaCombat;
      s.evo.charges.fang = { n: 7, value: 0 };
      for (const f of ['family-b', 'family-b', 'family-a']) s.tray.push({ uid: s.nextUid++, kind: 'skill', traitId: 'basic-skill', family: f, element: null });
      s.events.push({ kind: 'evo-proc', text: '이빨!', damage: 0 });
      return { fang: s.evo.charges.fang.n, critDmg: s.params.abilityEffects.evoCritDmg ?? 0 };
    });
  } catch (err) {
    proof.errors.push(String(err && err.stack || err));
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close();
    srv.stop?.();
    process.exit(0);
  }
})();
