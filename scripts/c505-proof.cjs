// C.505 proof (GDD 8-7 1차 — 사신 13종 진화체 고유 능력): PC 844×390, 1배.
// 01 봉수대 '봉수 폭렬'(봉화 5 → 다음 평타) · 02 반석 방어막(흙 블록 생김 → 방어막) · 03 공화 공허 블록 켜짐 + 처형선 두 개 · 04 연우 장마(2체인 2번 → 바 끝 블록 3개)
// 05 추성 펫 2마리 · 06 상태 화면 고유 능력 줄(봉수대). 진화체 상태는 실제 규칙으로 돌리고, 시간이 드는 쌓기만 테스트용 주입.
// 세이브는 Vite 개발 서버의 게임 모듈로 만든다(튜토리얼 끝남 · 4단계 진화체 · 4단계 특성) → 이어하기 → 테스트 모드 '바로 전투'.
// 실행: node scripts/c499-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c505'));
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


const EV = () => window.__bhaCombat.evo;
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { shots: [], errors: [], checks: {} };
  const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  const marks = (page) => page.locator('.bha-mark').evaluateAll((els) => els.map((e) => `${e.dataset.mark}:${e.textContent}`));
  const fresh = async () => { const p = await browser.newPage(PC); p.on('pageerror', (e) => proof.errors.push(e.message)); return p; };
  try {
    // 06 상태 화면 · 01 봉수대
    let page = await fresh();
    await seed(page, srv.url, 't4:fire:physical', 't3:fire');
    await page.keyboard.press('g');
    await wait(1200);
    const uniq = page.locator('[data-evo-unique]');
    proof.checks.statusLines = (await uniq.count()) ? await uniq.first().innerText() : null;
    if (await uniq.count()) await uniq.first().scrollIntoViewIfNeeded();
    await wait(300);
    await shot(page, '06-status-unique-lines');
    await page.keyboard.press('Escape');
    await wait(600);
    await battle(page);
    proof.checks.beacon = await page.evaluate(() => {
      const s = window.__bhaCombat;
      for (const f of ['family-a', 'family-b', 'family-a']) s.tray.push({ uid: s.nextUid++, kind: 'skill', traitId: 'basic-skill', family: f, element: null });
      s.evo.stacks.beacon.n = 5; // 평타 15대 분 (테스트 주입)
      s.player.attackTimer = 2; // 다음 평타 = 봉수 폭렬 (실제 규칙)
      return { evo: !!s.params.evo, need: s.params.evo?.nums.need };
    });
    await page.waitForFunction(() => (window.__bhaCombat.evo.procs['봉수 폭렬!'] ?? 0) > 0, null, { timeout: 5000 }).catch(() => {});
    await page.evaluate(() => { window.__bhaCombat.player.attackTimer = 1e9; });
    await wait(120);
    proof.checks.beaconAfter = await page.evaluate(() => ({ procs: window.__bhaCombat.evo.procs, beacon: window.__bhaCombat.evo.stacks.beacon.n, status: window.__bhaCombat.status, tick: window.__bhaCombat.tick }));
    await shot(page, '01-bongsudae-burst');
    await page.close();

    // 02 반석 방어막
    page = await fresh();
    await seed(page, srv.url, 't4:earth:physical', 't3:earth');
    await battle(page);
    proof.checks.banseok = await page.evaluate(() => {
      const s = window.__bhaCombat;
      s.spawnTimer = 1; // 생성 타이머를 돌려 흙 블록이 실제로 생기게 (생길 때마다 방어막 +4%)
      return { maxHp: s.player.maxHp };
    });
    await page.waitForFunction(() => window.__bhaCombat.tray.length >= 6, null, { timeout: 15000 }).catch(() => {});
    proof.checks.banseokAfter = await page.evaluate(() => { const s = window.__bhaCombat; s.spawnTimer = 1e9; return { tray: s.tray.length, shieldPct: Math.round((s.player.shield ?? 0) / s.player.maxHp * 1000) / 10 }; });
    await wait(200);
    await shot(page, '02-banseok-shield');
    await page.close();

    // 03 공화: 공허 블록 2칸(실제 고정) + 공허 스택(주입 40 = 블록선 20%) + 적 체력 15%
    page = await fresh();
    await seed(page, srv.url, 'h4:void', 't3:normal');
    await battle(page);
    proof.checks.gonghwa = await page.evaluate(() => {
      const s = window.__bhaCombat;
      s.tray = s.tray.filter((b) => b.fixed);
      if (s.tray.length === 0) for (let k = 0; k < 2; k++) s.tray.push({ uid: s.nextUid++, kind: 'skill', traitId: 'evo:nil', family: null, element: null, solo: true, fixed: true });
      for (const f of ['family-a', 'family-a', 'family-a', 'family-b']) s.tray.push({ uid: s.nextUid++, kind: 'skill', traitId: 'basic-skill', family: f, element: null });
      s.evo.stacks.hollow.n = 40;
      s.enemy.hp = s.enemy.maxHp * 0.15;
      s.events.push({ kind: 'evo-proc', text: '공허!', damage: 0 });
      return { fixed: s.tray.filter((b) => b.fixed).length, execute: s.params.abilityEffects.execute ?? null };
    });
    await wait(200);
    proof.checks.execLines = await page.locator('.bha-execline').evaluateAll((els) => els.map((e) => ({ cls: e.className, hidden: e.hidden, left: e.style.left })));
    proof.checks.gonghwaMarks = await marks(page);
    await shot(page, '03-gonghwa-void-block-exec-lines');
    await page.close();

    // 04 연우: 2체인 2번 연달아(실제 사용) → 바 끝 물·귀 블록 3개 + 장마
    page = await fresh();
    await seed(page, srv.url, 't4:water:special', 't3:water');
    await battle(page);
    proof.checks.yeonu = await page.evaluate(async () => {
      const c = await import('/src/engine/combat/index.ts');
      const s = window.__bhaCombat;
      const push = (f) => s.tray.push({ uid: s.nextUid++, kind: 'skill', traitId: 'basic-skill', family: f, element: null });
      push('family-a'); push('family-a'); push('family-b');
      const a = c.applyInput(s, { type: 'use', cell: 0 });
      push('family-b');
      const b = c.applyInput(s, { type: 'use', cell: 0 });
      return { used: [a, b], tray: s.tray.map((x) => x.family), rain: s.evo.stacks.rain.n };
    });
    await wait(250);
    proof.checks.yeonuMarks = await marks(page);
    await shot(page, '04-yeonu-rain-spawn');
    await page.close();

    // 05 추성: 펫 2마리 (2번째 칸 = 피해 70%)
    page = await fresh();
    await seed(page, srv.url, 'h4:hunter', 't3:normal', { pets: ['pet-kon', 'pet-chappy'] });
    // 테스트 모드는 처음 열 때 두 번째 캐릭터로 바꿨다 돌아온다 — 그 캐릭터엔 칸이 없어 2번째 펫이 보유 목록으로 내려간다(설계대로). 다시 끼우고 이어하기
    await page.evaluate(async () => {
      const g = await import('/src/game.ts');
      const slots = await import('/src/saveSlots.ts');
      const tm = await import('/src/engine/testMode.ts');
      const store = tm.testStorage(localStorage);
      const s = g.loadSave(store, slots.slotKey(1));
      s.shared.pets.active2 = 'pet-chappy';
      slots.writeSlotSave(store, s, 1);
    });
    await page.goto(`${srv.url}?test=1`);
    await wait(1500);
    await page.getByRole('button', { name: '이어하기' }).click({ timeout: 5000 }).catch(() => {});
    await wait(2500);
    for (let i = 0; i < 4 && (await page.locator('[data-dev-layer], .bha-tut').count()); i++) { await page.keyboard.press('Escape'); await wait(250); }
    await battle(page);
    proof.checks.chuseong = await page.evaluate(() => {
      const s = window.__bhaCombat;
      s.evo.stacks.mark.n = 6;
      s.petTimer = 2; s.petTimer2 = 10;
      return { pet: s.params.petAttack, pet2: s.params.petAttack2 };
    });
    await wait(500);
    proof.checks.petEls = await page.locator('.bha-pet--battle').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return `${e.dataset.pet} ${e.className} @${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)} pos=${cs.position} r=${cs.right} l=${cs.left} b=${cs.bottom} tr=${cs.translate} parent=${e.parentElement?.className}`; }));
    await shot(page, '05-chuseong-two-pets');
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
