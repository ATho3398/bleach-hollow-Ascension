// C.531 proof (허무 재설계 — GDD 8-8 v6.160~v6.166): PC 844×390 + 폰 796×384, 1배, 6장.
// 01·04 허무 블록이 바에 있는 전투(허무 적 상대, 허무 블록 3체인 묶음) · 02·05 허무 적 처형 원형 막기 표식 · 03·06 도감 허무형(호로 허무·물리 나다) 진화 조건
// 실행: node scripts/c531-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c531'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** 세이브를 슬롯 1에 쓰고 이어하기 (test = 테스트 모드 저장소). build = 세이브를 고치는 코드(브라우저 안, s·m·now) */
async function seed(page, url, test, factionId, build) {
  const q = test ? '?test=1' : '';
  await page.goto(`${url}${q}`);
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async ({ test, factionId, build }) => {
    const m = { g: await import('/src/game.ts'), tut: await import('/src/engine/tutorial.ts'), tm: await import('/src/engine/testMode.ts') };
    const slots = await import('/src/saveSlots.ts');
    const store = test ? m.tm.testStorage(localStorage) : localStorage;
    const now = Date.now();
    const s = m.g.newSaveData(factionId, now);
    s.name = '시험';
    s.gender = 'male';
    s.help.tutorialSeen = true;
    for (const id of m.tut.GUIDE_IDS) s.help.guides[id] = 'done';
    s.nest.hunger = 30;
    s.nest.condition = 90;
    // eslint-disable-next-line no-new-func
    new Function('s', 'm', 'now', build)(s, m, now);
    slots.writeSlotSave(store, s, 1);
    slots.touchSlot(store, 1, now);
  }, { test, factionId, build });
  await page.goto(`${url}${q}`);
  await wait(1500);
  const cont = page.getByRole('button', { name: '이어하기' });
  if (await cont.count()) await cont.click({ timeout: 5000 });
  await wait(2500);
}

/** 3단계 몸 + 허무 블록·물 블록 장착 (진화 전 허무 블록) */
const KYO_BUILD = `
  m.tm.setForm(s, 't3:water');
  while (s.build.slots.length < 4) s.build.slots.push(null);
  s.build.slots = ['t-kyo', 't-water-a', null, null];
  s.build.owned = ['t-kyo', 't-water-a'];
  s.build.equipOrder = ['t-kyo', 't-water-a'];
  s.build.enhance = { kyo: 4, water: 2 };
`;

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

/** 테스트 패널 '바로 전투'로 허무 적과 전투에 들어간다 */
async function enterKyoBattle(page, F) {
  await openTest(page, '바로 전투');
  // 같은 이름 적이 속성마다 있어(짐승형 호로 …) 이름만으로는 못 고른다 — 같은 이름·같은 등급 안에서 허무 적의 순번으로 고른다
  const pick = await page.evaluate(async () => {
    const tm = await import('/src/engine/testMode.ts');
    const sc = await import('/src/data/schema.ts');
    const nameOf = (f) => sc.pickFaction(f.def.name, 'hollow');
    const foes = tm.testFoes().filter((f) => f.kind === 'enemy' && f.def.class === 'normal');
    const me = foes.find((f) => f.id === 'kyo-basic');
    const same = foes.filter((f) => nameOf(f) === nameOf(me));
    return { name: nameOf(me), nth: same.indexOf(me) };
  });
  await page.locator('[aria-label="상대"]').first().click({ timeout: 3000 });
  await wait(400);
  await page.locator('.bha-pick__list [role="option"]').filter({ hasText: new RegExp(`^${pick.name}$`) }).nth(pick.nth).click({ timeout: 3000 });
  await wait(400);
  await page.getByRole('button', { name: '전투 들어가기' }).first().click({ timeout: 3000 });
  await wait(800);
  const ok = page.getByRole('button', { name: '확인', exact: true }).filter({ visible: true });
  if (await ok.count()) await ok.last().click({ timeout: 3000 });
  await page.waitForFunction(() => !!window.__bhaCombat && window.__bhaCombat.tick > 5, null, { timeout: 15000 });
  F.foe = await page.evaluate(() => ({ id: window.__bhaCombat.enemy.def.id, element: window.__bhaCombat.enemy.def.element }));
}

/** 전투를 멈춰 세우고(내 공격·생성·적 공격) 바에 허무 블록 3개 + 물 블록 + 허무 블록 1개 */
const setBar = (page) => page.evaluate(() => {
  const s = window.__bhaCombat;
  s.enemy.maxHp *= 50; s.enemy.hp = s.enemy.maxHp * 0.3; s.player.maxHp *= 3; s.player.hp = s.player.maxHp;
  s.spawnTimer = 1e9; s.enemy.attackTimer = 1e9; s.enemy.actionTimer = 1e9; s.params.timeLimitSeconds = 1e6; s.player.attackTimer = 1e9;
  const b = (traitId, element, family) => ({ uid: s.nextUid++, kind: 'skill', traitId, family, element });
  s.tray = [b('t-kyo', 'kyo', null), b('t-kyo', 'kyo', null), b('t-kyo', 'kyo', null), b('t-water-a', 'water', 'family-a'), b('t-kyo', 'kyo', null)];
});

/** 내 체력을 처형선 아래로 — 원이 천천히 줄게(캡처용) 원 시간을 늘려 반쯤 줄어든 순간을 만든다 */
const openRing = async (page) => {
  await page.evaluate(() => {
    const s = window.__bhaCombat;
    s.params.foeExecute = { ...s.params.foeExecute, ringSeconds: 600 };
    s.player.hp = s.player.maxHp * 0.02;
  });
  await page.waitForFunction(() => !!window.__bhaCombat.execution?.ring, null, { timeout: 5000 });
  await page.evaluate(() => {
    const s = window.__bhaCombat;
    const r = s.execution.ring;
    r.startTick = s.tick - 3000;
    r.hitTick = s.tick + 3000;
  });
  await wait(400);
};

const ringFacts = (page) => page.evaluate(() => {
  const el = document.querySelector('.bha-execring');
  const r = el?.getBoundingClientRect();
  const cs = el ? getComputedStyle(el) : null;
  return el ? { hidden: el.hidden, label: el.textContent, w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y), border: cs.borderColor, scale: el.style.getPropertyValue('--bha-execring-scale') } : null;
});

const barFacts = (page) => page.evaluate(() => ({
  glyphs: [...document.querySelectorAll('.bha-block .bha-block__glyph')].map((g) => g.textContent),
  kinds: [...document.querySelectorAll('.bha-block')].map((b) => [...b.classList].filter((c) => c.startsWith('bha-block--')).join(' ')),
  tray: window.__bhaCombat.tray.map((b) => b.traitId),
}));

async function battleShots(browser, url, ctxOpt, names, F, key) {
  const page = await (await browser.newContext(ctxOpt)).newPage();
  page.on('pageerror', (e) => F.errors.push(`${key}: ${e.message}`));
  await seed(page, url, true, 'hollow', KYO_BUILD);
  await enterKyoBattle(page, F);
  await setBar(page);
  await wait(700);
  F[`${key}Bar`] = await barFacts(page);
  await page.screenshot({ path: path.join(OUT, `${names[0]}.png`) });
  await openRing(page);
  F[`${key}Ring`] = await ringFacts(page);
  await page.screenshot({ path: path.join(OUT, `${names[1]}.png`) });
  // 실제 판정: 원 시간을 되돌리고 닿는 틱에 눌러 막는다 (스턴·기록 확인)
  if (key === 'pc') {
    F.guard = await page.evaluate(async () => {
      const s = window.__bhaCombat;
      s.execution.ring.hitTick = s.tick + 4;
      const btn = document.querySelector('.bha-execring');
      for (let i = 0; i < 200 && s.execution.ring && s.tick + 1 < s.execution.ring.hitTick; i++) await new Promise((r) => setTimeout(r, 10));
      btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 400));
      return { status: s.status, blocked: s.execution.blocked, attempts: s.execution.attempts, hp: Math.round(s.player.hp * 100) / 100, hidden: btn.hidden };
    });
  }
  await page.context().close();
}

async function dexShot(browser, url, ctxOpt, name, F, key) {
  const page = await (await browser.newContext(ctxOpt)).newPage();
  page.on('pageerror', (e) => F.errors.push(`${key}: ${e.message}`));
  await seed(page, url, false, 'hollow', `
    m.tm.fillAllUnlocked(s);
    m.tm.setForm(s, 'h4:void');
    s.formDex = ['t2:base', 't3:water', 'h4:void'];
  `);
  await wait(4000);
  await page.locator('button[aria-label="책장"]').first().click({ timeout: 4000 });
  await wait(1200);
  const nada = await page.evaluate(async () => {
    const fd = await import('/src/data/evolution/index.ts');
    return fd.formName(fd.getForm('h4:void'), 'hollow');
  });
  await page.evaluate((n) => {
    const card = [...document.querySelectorAll('.bha-dexcard')].find((c) => c.querySelector('.bha-dexcard__name')?.textContent === n);
    card?.scrollIntoView({ block: 'center' });
  }, nada);
  await wait(400);
  await page.locator('.bha-dexcard', { hasText: nada }).first().click({ timeout: 4000 });
  await wait(900);
  F[`${key}Dex`] = { name: nada, body: await page.locator('.bha-mddetail__body').first().innerText().catch(() => null) };
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  await page.context().close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const F = { errors: [] };
  try {
    await battleShots(browser, server.url, PC, ['01-pc-kyo-blocks-in-bar', '02-pc-execute-ring'], F, 'pc');
    await dexShot(browser, server.url, PC, '03-pc-dex-void-condition', F, 'pc');
    await battleShots(browser, server.url, PHONE, ['04-phone-kyo-blocks-in-bar', '05-phone-execute-ring'], F, 'phone');
    await dexShot(browser, server.url, PHONE, '06-phone-dex-void-condition', F, 'phone');
  } catch (e) {
    F.errors.push(String(e && e.stack ? e.stack : e));
  } finally {
    fs.writeFileSync(path.join(OUT, 'facts.json'), JSON.stringify(F, null, 1));
    console.log(JSON.stringify(F, null, 1));
    await browser.close();
    server.stop();
  }
})();
