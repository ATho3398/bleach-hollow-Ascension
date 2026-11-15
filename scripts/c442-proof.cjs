// C.442 proof (GDD 12-4 v6.050 아이젠 붕옥 해방 = 호로화 소모형 모드): 호로화 게이지(이름) · 50 이상 [붕옥 해방] 켜짐 · 모드(색조·프라고르) · 블록 뒤 −8 · 모드 끝.
// PC 844×390 5장 + 폰 796×384 3장, 1배. 실행: node scripts/c442-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c442'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PH = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function skipTut(page) {
  for (let t = 0; t < 40 && (await page.locator('.bha-tut').count()); t++) {
    const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled])').filter({ visible: true });
    if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
    else await page.locator('.bha-lcd').first().click({ timeout: 2000 }).catch(() => {});
    await wait(400);
  }
}
async function newGame(page, url) {
  const u = `${url}?test=1`;
  await page.goto(u);
  await page.evaluate(() => localStorage.clear());
  await page.goto(u);
  await wait(1200);
  await page.getByRole('button', { name: '새로 시작' }).click();
  await wait(300);
  await page.locator('.bha-slot').first().click();
  await page.getByRole('button', { name: '확인' }).click();
  await wait(300);
  await page.locator('.bha-species__card').nth(0).click();
  await wait(300);
  await page.getByRole('button', { name: '네', exact: true }).click();
  await wait(400);
  const nm = page.locator('[data-ident="name"]');
  if (await nm.count()) {
    await nm.fill('권영');
    await nm.press('Enter');
    await wait(300);
    await page.locator('.bha-ident__gender[data-gender="male"]').click();
    await page.locator('.bha-ident .bha-btn--primary').last().click();
  }
  await wait(2500);
  await skipTut(page);
}
async function back(page) {
  await page.locator('.bha-dev__btn[aria-label="취소"]').first().click({ timeout: 2000 }).catch(() => {});
  await wait(700);
  const no = page.getByRole('button', { name: '아니요', exact: true }).filter({ visible: true });
  if (await no.count()) { await no.first().click({ timeout: 2000 }).catch(() => {}); await wait(400); }
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
const vis = (loc) => loc.filter({ visible: true });

/** 바를 전용 블록으로 채운다 (테스트 모드 window.__bhaCombat — 엔진 상태 직접) */
const setTray = (page, ids) => page.evaluate((ids) => {
  const s = window.__bhaCombat;
  s.tray = ids.map((id) => ({ uid: s.nextUid++, kind: 'skill', traitId: `kit:${id}`, family: null, element: null, ...(id === 'kyoka' ? { solo: true } : {}) }));
  return s.tray.map((b) => b.uid);
}, ids);
const clickUid = async (page, uid) => { await page.locator(`.bha-block[data-uid="${uid}"]`).first().click({ timeout: 3000, force: true }); };
const calm = (page) => page.evaluate(() => {
  const s = window.__bhaCombat;
  s.enemy.maxHp *= 50; s.enemy.hp = s.enemy.maxHp; s.player.maxHp *= 3; s.player.hp = s.player.maxHp;
  s.spawnTimer = 1e9; s.enemy.attackTimer = 1e9; s.enemy.actionTimer = 1e9; s.params.timeLimitSeconds = 1e6;
});
const kitFacts = (page) => page.evaluate(() => {
  const s = window.__bhaCombat;
  return {
    tray: s.tray.map((b) => b.traitId), stack: s.kit?.stack, counters: s.kit?.counters, finishers: s.kit?.finishers, revives: s.kit?.revives,
    glow: document.querySelectorAll('.bha-kitglow').length, line: document.querySelector('.bha-kitline')?.textContent ?? null,
    lineOn: document.querySelector('.bha-kitline')?.classList.contains('is-on') ?? false,
    stackChip: document.querySelector('.bha-kitstack')?.textContent ?? null, evade: s.params.evadeChance, libName: s.params.kit?.liberationName,
    labels: [...document.querySelectorAll('.bha-block .bha-block__name')].map((n) => n.textContent),
    log: [...document.querySelectorAll('.bha-battlelog li, [class*="log"] li')].slice(-4).map((l) => l.textContent),
  };
});


const relFacts = (page) => page.evaluate(() => {
  const s = window.__bhaCombat;
  const btn = document.querySelector('[data-sc="kit-release"]');
  const chip = document.querySelector('.bha-riskchip');
  return {
    risk: s.kit?.risk, active: s.liberation.ticksLeft > 0, endless: !!s.liberation.endless, enters: s.kit?.modeEnters, exits: s.kit?.modeExits, spent: s.kit?.riskSpent,
    tray: s.tray.map((b) => b.traitId), chip: chip?.textContent ?? null, chipFocus: chip?.classList.contains('is-focus') ?? false,
    btn: btn?.textContent ?? null, btnDisabled: btn ? btn.disabled : null, mode: document.querySelector('.bha-battle')?.classList.contains('is-kitmode') ?? false,
    libName: s.params.kit?.liberationName, log: [...document.querySelectorAll('.bha-battlelog li, [class*="log"] li')].slice(-3).map((l) => l.textContent),
  };
});

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { errors: [], shots: [], facts: {} };
  let n = 1;
  try {
    for (const [dk, opts] of [['pc', PC], ['phone', PH]]) {
      const full = dk === 'pc';
      const ctx = await browser.newContext(opts);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`${dk}: ${e.message.slice(0, 200)}`));
      const shot = async (name) => { const f = `${String(n++).padStart(2, '0')}-${dk}-${name}.png`; await page.screenshot({ path: path.join(OUT, f) }); proof.shots.push(f); };
      const facts = (proof.facts[dk] = {});
      const step = async (label, fn) => { try { await fn(); } catch (e) { proof.errors.push(`${dk} ${label}: ${String(e).slice(0, 200)}`); if (process.env.DBG) await page.screenshot({ path: path.join(process.env.DBG, `${dk}-${label}.png`) }); await back(page); } };
      await newGame(page, server.url);
      await step('grant', async () => {
        await openTest(page, '붕옥·초월자');
        await page.getByRole('button', { name: /^아이젠/ }).first().click({ timeout: 3000 });
        await wait(2500);
        await skipTut(page);
      });
      await step('battle', async () => {
        await openTest(page, '바로 전투');
        await page.getByRole('button', { name: '전투 시작' }).first().click({ timeout: 3000 });
        await page.waitForFunction(() => !!window.__bhaCombat && window.__bhaCombat.tick > 20, null, { timeout: 15000 });
        await wait(2500);
        await calm(page);
        // 1) 호로화 30 — 게이지 이름·버튼 꺼짐
        await page.evaluate(() => { window.__bhaCombat.kit.risk = 30; });
        await setTray(page, ['kido', 'kyoka', 'kido', 'kido']);
        await wait(500);
        facts.low = await relFacts(page);
        if (full) await shot('gauge-30-off');
        // 2) 호로화 56 — [붕옥 해방] 켜짐
        await page.evaluate(() => { window.__bhaCombat.kit.risk = 56; });
        await wait(700);
        facts.ready = await relFacts(page);
        await shot('gauge-56-ready');
        // 3) 버튼으로 진입 — 모습(색조) · 경화수월 → 프라고르
        await page.locator('[data-sc="kit-release"]').first().click({ timeout: 3000 });
        await wait(1600);
        facts.mode = await relFacts(page);
        await shot('mode-fragor');
        // 4) 프라고르 3체인 → 호로화 −8
        if (full) {
          const uids = await setTray(page, ['fragor', 'fragor', 'fragor', 'kido']);
          await wait(300);
          await clickUid(page, uids[0]);
          await wait(450);
          facts.afterBlock = await relFacts(page);
          await shot('block-minus8');
          await wait(1200);
        }
        // 5) 호로화 8 에서 블록 1번 → 0, 모드 끝(원래 모습)
        await page.evaluate(() => { window.__bhaCombat.kit.risk = 8; });
        const u2 = await setTray(page, ['kido', 'fragor']);
        await wait(300);
        await clickUid(page, u2[0]);
        await wait(700);
        facts.end = await relFacts(page);
        await shot('mode-end');
        await page.evaluate(() => { const s = window.__bhaCombat; s.enemy.hp = 1; s.player.attackTimer = 1; });
        await wait(3000);
      });
      await ctx.close();
    }
  } catch (e) {
    proof.errors.push(String(e).slice(0, 400));
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close();
    server.stop?.();
    console.log(JSON.stringify(proof, null, 1).slice(0, 7000));
    process.exit(0);
  }
})();
