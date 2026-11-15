// C.445 proof: 경화수월 반격 창(발광) 중 누른 직후 프레임(블록이 공중에 남지 않음) · 융합 중 프라고르 1블록 −3. PC 844×390 1배 2장. 실행: node scripts/c445-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c445'));
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
    // 1) 경화수월 반격 창(발광) 중에 누른 직후 ~150ms 프레임 — 블록이 사라지는 중(투명해짐)
    const uids = await setTray(page, ['kyoka', 'kido', 'kido']);
    await page.evaluate(() => { const s = window.__bhaCombat; s.kit.counterUntil = s.tick + 100000; s.kit.counterLost = 10; });
    await wait(500);
    await page.evaluate((uid) => {
      window.__probe = [];
      const t0 = performance.now();
      const tick = () => { const n = document.querySelector(`.bha-block[data-uid="${uid}"]`); window.__probe.push({ t: Math.round(performance.now() - t0), on: !!n, op: n ? Number(getComputedStyle(n).opacity).toFixed(2) : null, anim: n ? getComputedStyle(n).animationName : null }); if (performance.now() - t0 < 900) requestAnimationFrame(tick); };
      tick();
    }, uids[0]);
    await clickUid(page, uids[0]);
    await wait(150);
    await page.screenshot({ path: path.join(OUT, '01-pc-kyoka-glow-pressed-150ms.png') }); proof.shots.push('01-pc-kyoka-glow-pressed-150ms.png');
    await wait(900);
    const pr = await page.evaluate(() => window.__probe);
    proof.facts.kyokaFrames = pr.filter((_, i) => i % 3 === 0).map((x) => `${x.t}ms ${x.on ? `op ${x.op} ${x.anim}` : '없음'}`);
    proof.facts.kyokaGoneMs = (pr.find((x) => !x.on) || {}).t ?? null;
    // 2) 융합 중 프라고르 1블록 −3
    await page.evaluate(() => { window.__bhaCombat.kit.risk = 60; });
    await page.locator('[data-sc="kit-release"]').first().click({ timeout: 3000 });
    await wait(1500);
    const u2 = await setTray(page, ['fragor', 'kido']);
    await wait(400);
    await clickUid(page, u2[0]);
    await wait(400);
    proof.facts.afterFragor = await page.evaluate(() => ({ risk: window.__bhaCombat.kit.risk, chip: document.querySelector('.bha-riskchip')?.textContent ?? null }));
    await page.screenshot({ path: path.join(OUT, '02-pc-fragor-minus3.png') }); proof.shots.push('02-pc-fragor-minus3.png');
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
