// C.444 proof (GDD 12-4 v6.054): 아이젠 붕옥 감응도 = 리스크 게이지 그 자체 — 방 리스크 칸 이름·값(최소 20) · 전투 시작 값 = 방 값 · 붕옥 블록 +10. PC 844×390 1배 3장. 실행: node scripts/c444-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c444'));
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
  let n = 1;
  try {
    const ctx = await browser.newContext(PC);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => proof.errors.push(`pc: ${e.message.slice(0, 200)}`));
    const shot = async (name) => { const f = `${String(n++).padStart(2, '0')}-pc-${name}.png`; await page.screenshot({ path: path.join(OUT, f) }); proof.shots.push(f); };
    const facts = proof.facts;
    const step = async (label, fn) => { try { await fn(); } catch (e) { proof.errors.push(`${label}: ${String(e).slice(0, 200)}`); await back(page); } };
    await newGame(page, server.url);
    await step('grant', async () => {
      await openTest(page, '붕옥·초월자');
      await page.getByRole('button', { name: /^아이젠/ }).first().click({ timeout: 3000 });
      await wait(2500);
      await skipTut(page);
    });
    await step('set-risk', async () => {
      await openTest(page, '둥지·시간');
      const inp = page.locator('input[aria-label="붕옥 감응도"]').first();
      facts.inputLabel = await inp.count();
      await inp.fill('5'); // 20 밑을 넣어도 저장 때 20 으로 (최솟값)
      await page.getByRole('button', { name: '적용' }).first().click({ timeout: 3000 });
      await wait(500);
      await back(page);
      await wait(800);
      await skipTut(page);
      facts.roomAfter5 = await page.evaluate(() => ({ risk: JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => /slot.?1|save/i.test(k) && localStorage.getItem(k).includes('"nest"')) ?? '') ?? 'null')?.nest?.risk ?? null, note: document.body.innerText.match(/붕옥 감응도[^\n]*/g) }));
      await openTest(page, '둥지·시간');
      await page.locator('input[aria-label="붕옥 감응도"]').first().fill('47');
      await page.getByRole('button', { name: '적용' }).first().click({ timeout: 3000 });
      await wait(500);
      await back(page);
      await wait(1000);
      await skipTut(page);
      facts.room = await page.evaluate(() => ({ risk: JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => /slot.?1|save/i.test(k) && localStorage.getItem(k).includes('"nest"')) ?? '') ?? 'null')?.nest?.risk ?? null, note: document.body.innerText.match(/붕옥 감응도[^\n]*/g) }));
      await shot('room-gauge-47');
    });
    await step('battle', async () => {
      await openTest(page, '바로 전투');
      await page.getByRole('button', { name: '전투 시작' }).first().click({ timeout: 3000 });
      await page.waitForFunction(() => !!window.__bhaCombat && window.__bhaCombat.tick > 5, null, { timeout: 15000 });
      await calm(page);
      facts.battleStart = await page.evaluate(() => window.__bhaCombat.kit.risk);
      await setTray(page, ['hogyoku', 'kyoka', 'kido', 'kido']);
      await wait(900);
      facts.chip = await page.evaluate(() => document.querySelector('.bha-riskchip')?.textContent ?? null);
      await shot('battle-start-47');
      const u0 = await page.evaluate(() => window.__bhaCombat.tray[0].uid);
      await clickUid(page, u0);
      await wait(700);
      facts.afterHogyoku = await page.evaluate(() => ({ risk: window.__bhaCombat.kit.risk, chip: document.querySelector('.bha-riskchip')?.textContent ?? null }));
      await shot('battle-hogyoku-57');
    });
    await ctx.close();
  } catch (e) {
    proof.errors.push(String(e).slice(0, 400));
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close();
    server.stop?.();
    console.log(JSON.stringify(proof, null, 1));
    process.exit(0);
  }
})();
