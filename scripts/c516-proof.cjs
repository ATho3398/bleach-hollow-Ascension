// C.516 proof (허무 합침 — 허무 = 적 전용): PC 844×390, 1배.
// 01 호로 허무 적 흡수 화면(둘 다·속성만 흐림 + 이유 한 줄) · 02 사신 허무 강적 흡수 화면 — 적 이름표 속성 칩 '허무' · 03 공화 '허무 블록'(글자 허) · 04 옛 세이브(형식 94, 허 블록 장착) 불러온 뒤 가방 슬롯
// 실행: node scripts/c516-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c516'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** 세이브를 슬롯 1에 쓰고 이어하기. build = 세이브를 고치는 코드(브라우저 안, s·m·arg·now) */
async function seed(page, url, test, factionId, build, arg = {}) {
  const q = test ? '?test=1' : '';
  await page.goto(`${url}${q}`);
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async ({ test, factionId, build, arg }) => {
    const m = {
      g: await import('/src/game.ts'), tut: await import('/src/engine/tutorial.ts'), x: await import('/src/engine/expedition/index.ts'),
      ab: await import('/src/engine/absorb/index.ts'), en: await import('/src/data/enemies/index.ts'), rng: await import('/src/engine/rng.ts'),
      fa: await import('/src/engine/evolution/formAbilities.ts'), fd: await import('/src/data/evolution/index.ts'), tm: await import('/src/engine/testMode.ts'),
    };
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
    new Function('s', 'm', 'arg', 'now', build)(s, m, arg, now);
    slots.writeSlotSave(store, s, 1);
    slots.touchSlot(store, 1, now);
  }, { test, factionId, build, arg });
  await page.goto(`${url}${q}`);
  await wait(1500);
  const cont = page.getByRole('button', { name: '이어하기' });
  if (await cont.count()) await cont.click({ timeout: 5000 });
  await wait(2500);
}

/** 허무 적을 이긴 흡수 화면 (원정 중간 저장) */
const ABSORB = `
  const exp = m.x.createExpedition({ factionId: s.factionId, seed: 5, hunger: 30, condition: 90, risk: 20, deck: ['prey-nest-a', 'prey-nest-a', 'rest-a'], build: s.build, evolution: s.evolution });
  exp.absorbOffer = m.ab.buildOffer(m.rng.createRng(1), m.en.getEnemy(arg.enemy), exp.build, { status: 'won', finisher: null, chain3Count: 0, weakChain3Count: 0 });
  exp.phase = 'absorb';
  s.activeExpedition = m.x.serializeExpedition(exp, 1, now);
  s.lastScreen = 'expedition';
`;

const FORM4 = `
  const e = s.evolution;
  e.tierIndex = 3; e.formHistory = ['t2:base', arg.third, arg.formId]; e.formId = arg.formId; e.ascended = true;
  const trait = m.fa.representativeAbility(m.fd.getForm(arg.formId), 'shinigami')?.id;
  e.abilities = { owned: trait ? { [trait]: 1 } : {}, equipped: trait ? [trait] : [], slots: 2, tier4Ever: true };
  while (s.build.slots.length < 6) s.build.slots.push(null);
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

const absorbFacts = (page) => page.evaluate(() => ({
  modes: [...document.querySelectorAll('.bha-absorb__actions [data-mode]')].map((b) => ({ mode: b.dataset.mode, disabled: b.disabled, blockless: 'blockless' in b.dataset, on: b.classList.contains('is-on'), title: b.title })),
  desc: [...document.querySelectorAll('.bha-absorb__desc p')].map((p) => `${p.dataset.line}:${p.textContent.trim()}`),
  go: document.querySelector('.bha-absorb__go')?.textContent ?? null,
  foeTags: [...document.querySelectorAll('.bha-foecard__tags')].map((t) => t.textContent.replace(/\s+/g, ' ').trim()),
  wide: document.querySelectorAll('.bha-foecard .bha-eldot--wide').length,
}));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const F = { errors: [] };
  try {
    const page = await (await browser.newContext(PC)).newPage();
    page.on('pageerror', (e) => F.errors.push(e.message));
    const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`) });

    // ① 호로 허무 적 흡수 화면
    await seed(page, server.url, false, 'hollow', ABSORB, { enemy: 'kyo-basic' });
    await page.waitForSelector('.bha-absorb__go', { timeout: 8000 }).catch(() => {});
    await wait(600);
    F.absorbHollow = await absorbFacts(page);
    await shot('01-hollow-kyo-absorb-blockless');

    // ② 사신 허무 강적 흡수 화면 — 적 이름표 '허무' 칩 (행위 이름 = 정화 흡수)
    await seed(page, server.url, false, 'shinigami', ABSORB, { enemy: 'kyo-heavy-seal' });
    await page.waitForSelector('.bha-absorb__go', { timeout: 8000 }).catch(() => {});
    await wait(600);
    F.absorbShinigami = await absorbFacts(page);
    await shot('02-shinigami-kyo-elite-nameplate');

    // ③ 공화(사신 히든 허무형) 바 맨 앞 '허무 블록'
    await seed(page, server.url, true, 'shinigami', FORM4, { formId: 'h4:void', third: 't3:normal' });
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
    });
    await wait(600);
    F.gonghwa = await page.evaluate(() => ({
      glyphs: [...document.querySelectorAll('.bha-block .bha-block__glyph')].map((g) => g.textContent),
      titles: [...document.querySelectorAll('.bha-block.is-locked')].map((b) => b.getAttribute('title')),
      special: (window.__bhaCombat.tray ?? []).filter((b) => String(b.traitId ?? '').startsWith('evo:')).map((b) => b.traitId),
    }));
    const off = page.locator('.bha-block.is-locked').first();
    const bb = await off.boundingBox().catch(() => null);
    if (bb) { await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await wait(80); await page.mouse.up(); }
    await wait(500);
    F.gonghwaToast = await page.locator('.bha-toast').allTextContents();
    await shot('03-gonghwa-heomu-block');

    // ④ 옛 세이브(형식 94): 허 블록 장착·보유 + 허 강화 3 → 불러오기(마이그레이션) → 가방 슬롯
    await seed(page, server.url, false, 'hollow', `
      while (s.build.slots.length < 4) s.build.slots.push(null);
      s.build.slots = ['t-kyo-a', 't-water-a', 't-kyo-b', null];
      s.build.owned = ['t-kyo-a', 't-water-a', 't-kyo-b', 't-kyo-c'];
      s.build.equipOrder = ['t-kyo-a', 't-water-a', 't-kyo-b'];
      s.build.enhance = { kyo: 3, water: 1 };
      s.meta.format = 94;
    `);
    F.migrated = await page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const raw = localStorage.getItem(localStorage.key(i));
        if (raw && raw.includes('"build"') && raw.includes('"enhance"')) {
          const s = JSON.parse(raw);
          return { key: localStorage.key(i), format: s.meta?.format, slots: s.build?.slots, owned: s.build?.owned, enhance: s.build?.enhance };
        }
      }
      return null;
    });
    await page.locator('.bha-prop--chest').first().click({ timeout: 4000 }).catch((e) => F.errors.push(`chest: ${e.message}`));
    await wait(900);
    await page.getByRole('tab', { name: '슬롯' }).or(page.getByRole('button', { name: '슬롯', exact: true })).first().click({ timeout: 3000 }).catch((e) => F.errors.push(`slots tab: ${e.message}`));
    await wait(800);
    F.bag = await page.evaluate(() => document.body.innerText.split('\n').map((l) => l.trim()).filter((l) => /허|물|강화|빈/.test(l)).slice(0, 20));
    await shot('04-old-save-bag-slots');
  } finally {
    fs.writeFileSync(path.join(OUT, 'facts.json'), JSON.stringify(F, null, 1));
    console.log(JSON.stringify(F, null, 1));
    await browser.close();
    server.stop();
  }
})();
