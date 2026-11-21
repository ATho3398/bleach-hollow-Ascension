// C.517 proof (마스터 11-21 — 토르멘타 강화 필드 = 필드 누적 3번마다): PC 844×390, 1배. 테스트 모드 세이브(토르멘타) → 바로 전투,
// 바에 2체인·3체인을 놓고 실제로 눌러 써서 필드 3번(필드 사이 앞 필드 지움 = 겹치지 않음). 01 누적 칩 2(설명 2/3) · 02 3번째에 강화 자기장 켜진 순간(누적 0).
// 실행: node scripts/c517-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c517'));
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


/** 바의 uid 블록을 눌러 쓴다(초점 + Enter — 키보드 사용 경로) */
async function useUid(page, uid) {
  const el = page.locator(`[data-uid="${uid}"]`).first();
  await el.focus();
  await page.keyboard.press('Enter');
  await wait(400);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { shots: [], errors: [], checks: {} };
  const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  const page = await browser.newPage(PC);
  page.on('pageerror', (e) => proof.errors.push(e.message));
  const st = () => page.evaluate(() => { const s = window.__bhaCombat; return { fieldCount: s.evo.stacks.fieldCount?.n ?? 0, field: s.evo.stacks.field?.n ?? 0, storm: (s.evo.buffs.storm?.until ?? 0) > s.tick ? s.evo.buffs.storm.value : 0, magicCut: s.evo.buffs.storm ? 1 : 0 }; });
  /** 2체인(family-a) + 3체인(family-c)을 바에 놓고 차례로 눌러 쓴다 → 필드 1번 */
  const field = async () => {
    const uids = await page.evaluate(() => {
      const s = window.__bhaCombat;
      s.tray = [];
      const out = [];
      for (const f of ['family-a', 'family-a', 'family-c', 'family-c', 'family-c']) { const uid = s.nextUid++; s.tray.push({ uid, kind: 'skill', traitId: 'basic-skill', family: f, element: null }); out.push(uid); }
      return out;
    });
    await wait(300);
    await useUid(page, uids[0]);
    await useUid(page, uids[2]);
  };
  try {
    await seed(page, srv.url, 't4:thunder:special', 't3:thunder');
    await battle(page);
    await field();
    proof.checks.after1 = await st();
    // 필드가 끝날 만큼 기다린 뒤(동시에 겹치지 않게) 2번째
    await page.evaluate(() => { const s = window.__bhaCombat; s.evo.stacks.field = { n: 0, exp: [] }; });
    await field();
    proof.checks.after2 = await st();
    await wait(250);
    proof.checks.marks2 = await marks(page);
    proof.checks.title2 = await page.locator('.bha-mark').evaluateAll((els) => els.map((e) => e.getAttribute('title') || e.getAttribute('aria-label') || ''));
    await shot(page, '01-tormenta-count-2of3');
    await page.evaluate(() => { const s = window.__bhaCombat; s.evo.stacks.field = { n: 0, exp: [] }; });
    await field();
    proof.checks.after3 = await st();
    await wait(250);
    proof.checks.marks3 = await marks(page);
    await shot(page, '02-tormenta-storm-on');
  } catch (err) {
    proof.errors.push(String(err && err.stack || err));
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close();
    srv.stop?.();
    process.exit(0);
  }
})();
