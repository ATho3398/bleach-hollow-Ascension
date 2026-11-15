// C.452 proof (GDD v6.066 12-4): 아이젠 전투 — 허 공식으로 자연 생성된 경화수월·붕옥이 바에 있는 장면 · 회피 성공 뒤 치명 버프 칩. PC 844×390 1배 2장. 실행: node scripts/c452-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c452'));
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
  s.tray = ids.map((id) => ({ uid: s.nextUid++, kind: 'skill', traitId: `kit:${id}`, family: null, element: null, ...(id === 'kyoka' || id === 'hogyoku' ? { solo: true } : {}) }));
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


(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { errors: [], shots: [], facts: {} };
  try {
    const ctx = await browser.newContext(PC);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => proof.errors.push(e.message.slice(0, 200)));
    await newGame(page, server.url);
    await openTest(page, '붕옥·초월자');
    await page.getByRole('button', { name: /^아이젠/ }).first().click({ timeout: 3000 });
    await wait(2500); await skipTut(page);
    await openTest(page, '바로 전투');
    await page.getByRole('button', { name: '전투 시작' }).first().click({ timeout: 3000 });
    await page.waitForFunction(() => !!window.__bhaCombat && window.__bhaCombat.tick > 5, null, { timeout: 15000 });
    await calm(page);
    // 1) 허 확률 21.5% 로 두고 자연 생성 — 바에 경화수월·붕옥이 같이 있을 때 찍는다 (바를 직접 넣지 않음)
    await page.evaluate(() => {
      const s = window.__bhaCombat;
      s.tray = []; s.params.voidChance = 0.215; s.params.voidChanceBonus = 0; s.params.voidChanceMax = 1; s.spawnTimer = 0;
      s.player.attackTimer = 1e9;
    });
    let ok = false;
    for (let i = 0; i < 480 && !ok; i++) {
      await wait(250);
      ok = await page.evaluate(() => {
        const s = window.__bhaCombat;
        const ids = s.tray.map((b) => b.traitId);
        if (ids.includes('kit:kyoka') && ids.includes('kit:hogyoku')) { s.spawnTimer = 1e9; return true; }
        if (s.tray.length >= s.params.trayCapacity - 1) { const k = s.tray.findIndex((b) => b.traitId === 'kit:kido'); if (k >= 0) s.tray.splice(k, 1); } // 귀도만 빼서 계속 생성되게
        window.__seen = window.__seen || {}; return false;
        return false;
      });
    }
    await wait(700);
    proof.facts.spawnScene = await page.evaluate(() => {
      const s = window.__bhaCombat;
      return { ok: true, tray: s.tray.map((b) => b.traitId), names: [...document.querySelectorAll('.bha-block .bha-block__name')].map((n) => n.textContent), risk: s.kit.risk };
    });
    proof.facts.spawnScene.ok = ok;
    await page.screenshot({ path: path.join(OUT, '01-pc-kyoka-hogyoku-spawned.png') }); proof.shots.push('01-pc-kyoka-hogyoku-spawned.png');
    // 2) 회피 100% 로 두고 적 공격 → 회피 → 버프 칩
    await page.evaluate(() => { const s = window.__bhaCombat; s.params.evadeChance = 1; s.enemy.attackTimer = 0.05; });
    await page.waitForFunction(() => (window.__bhaCombat.kit.evadeBuffs ?? 0) > 0, null, { timeout: 15000 });
    await page.evaluate(() => { window.__bhaCombat.enemy.attackTimer = 1e9; });
    await wait(700);
    proof.facts.buff = await page.evaluate(() => {
      const s = window.__bhaCombat; const c = document.querySelector('.bha-kitbuff');
      return { evadeBuffs: s.kit.evadeBuffs, leftTicks: s.kit.evadeBuffUntil - s.tick, chip: c?.textContent ?? null, hidden: c ? c.hidden : null, title: c?.title ?? null };
    });
    await page.screenshot({ path: path.join(OUT, '02-pc-evade-crit-buff.png') }); proof.shots.push('02-pc-evade-crit-buff.png');
    await wait(3200);
    proof.facts.buffAfter3s = await page.evaluate(() => { const c = document.querySelector('.bha-kitbuff'); return { hidden: c ? c.hidden : null }; });
    await ctx.close();
  } catch (e) {
    proof.errors.push(String(e).slice(0, 400));
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close(); server.stop?.();
    console.log(JSON.stringify(proof, null, 1));
    process.exit(0);
  }
})();
