// C.551 proof (GDD 7절 v6.225 '블록 피해 = 몸동작 타격 순간에 바로', 사용자 2026-11-27 "스킬은 쓰면 그냥 모션에 맞춰서 딜 들어가게 하자"):
// 사신 평대원 · 참 1체인·3체인 블록을 쓰고, 엔진 피해가 들어가 적 체력이 준 그 프레임에 화면 애니메이션을 전부 멈춰 1배 캡처.
// 적는 것: 블록을 쓴 뒤 피해 틱·엔진 타격 지연(= 몸동작 표 타격 시각 ÷ max(1, 배율)) · 몸 타격 프레임(probe swing-frame/hit-frame) 시각 · 그 순간 도트 이펙트 진행.
// 실행: node scripts/c551-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c551'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function skipTut(page) {
  for (let t = 0; t < 40 && (await page.locator('.bha-tut').count()); t++) {
    const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled])').filter({ visible: true });
    if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
    else await page.locator('.bha-lcd').first().click({ timeout: 2000 }).catch(() => {});
    await wait(400);
  }
}
async function newGame(page, url, card = 0) {
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
  await page.locator('.bha-species__card').nth(card).click();
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
async function openTest(page, tabName) {
  if (!(await page.locator('.bha-test-page').count())) { // 이미 테스트 화면이면 탭만 바꾼다
    await page.getByRole('button', { name: /더보기/ }).first().click({ timeout: 3000 });
    await wait(400);
    await page.getByRole('button', { name: '테스트', exact: true }).first().click({ timeout: 3000 });
    await wait(700);
  }
  await page.locator('.bha-test-page .bha-viewtitle, .bha-test-page [aria-haspopup]').first().click({ timeout: 2000 }).catch(() => {});
  await wait(300);
  await page.getByRole('option', { name: tabName }).or(page.getByRole('menuitemradio', { name: tabName })).or(page.getByRole('button', { name: tabName })).first().click({ timeout: 3000 });
  await wait(600);
}
async function pickForm(page, label) {
  await openTest(page, '진화체');
  await page.getByRole('button', { name: '진화체', exact: true }).first().click({ timeout: 3000 });
  await wait(300);
  await page.getByRole('option', { name: label }).first().click({ timeout: 3000 });
  await wait(200);
  await page.getByRole('button', { name: '이 몸으로' }).first().click({ timeout: 3000 });
  await wait(1500);
  await skipTut(page);
}
const calm = (page) => page.evaluate(() => {
  const s = window.__bhaCombat;
  s.enemy.maxHp *= 50; s.enemy.hp = s.enemy.maxHp; s.player.maxHp *= 3; s.player.hp = s.player.maxHp;
  s.spawnTimer = 1e9; s.enemy.attackTimer = 1e9; s.enemy.actionTimer = 1e9; s.params.timeLimitSeconds = 1e6; s.player.attackTimer = 1e9; s.tray = [];
});
const startBattle = async (page) => {
  await openTest(page, '바로 전투');
  await page.getByRole('button', { name: '전투 들어가기' }).first().click({ timeout: 3000 });
  await wait(800);
  const ok = page.getByRole('button', { name: '확인', exact: true }).filter({ visible: true });
  if (await ok.count()) await ok.last().click({ timeout: 3000 });
  await page.waitForFunction(() => !!window.__bhaCombat && window.__bhaCombat.tick > 5, null, { timeout: 15000 });
  await calm(page);
};

/** n체인 블록을 쓰고 적 체력이 준 프레임에 멈춘다 */
const useAndFreezeAtHit = (page, n) => page.evaluate(async ({ n }) => {
  const C = await import('/src/engine/combat/index.ts');
  const s = window.__bhaCombat;
  const fam = 'family-a';
  s.tray = Array.from({ length: n }, () => ({ uid: s.nextUid++, kind: 'skill', traitId: C.BASIC_SKILL_ID, family: fam, element: null }));
  await new Promise((r) => requestAnimationFrame(() => r(0)));
  const key = C.blockHitKey(fam, n);
  const m = C.blockMotionOf(s.params, key, n);
  const probe = window.__bhaProbe ?? [];
  const p0i = probe.length;
  const hp0 = s.enemy.hp;
  const t0 = s.tick;
  const p0 = performance.now();
  const ok = C.applyInput(s, { type: 'use', cell: 0 });
  let damageTick = null;
  let damageMs = null;
  while (performance.now() - p0 < 3000 && damageTick === null) {
    await new Promise((r) => requestAnimationFrame(() => r(0)));
    if (s.enemy.hp < hp0) { damageTick = s.tick - t0; damageMs = Math.round(performance.now() - p0); }
  }
  for (const a of document.getAnimations()) a.pause();
  const fx = [...document.querySelectorAll('.bha-pxfx-wrap')].flatMap((w) => w.getAnimations({ subtree: true }).map((a) => {
    const ct = a.effect.getComputedTiming();
    return { fx: w.dataset.fx, progress: ct.progress === null ? null : Math.round(ct.progress * 1000) / 1000 };
  }));
  const marks = probe.slice(p0i).filter((x) => x.type === 'swing-frame' || x.type === 'hit-frame' || (x.type === 'event' && x.kind === 'block')).map((x) => ({ type: x.type, side: x.side ?? null, landed: x.landed ?? null, ms: Math.round(x.t - p0), tick: x.tick - t0 }));
  const bar = document.querySelector('.bha-v2-enemy .bha-hpbar__fill, [data-hp="enemy"] .bha-hpbar__fill');
  return { n, ok, key, bodyRate: m?.rate ?? 1, motionHitSeconds: m?.hit ?? null, hitDelaySeconds: C.blockHitDelayOf(s.params, key, n), blockBy: s.params.hitDelay.blockBy?.[key] ?? null, hasBlockFxBy: 'blockFxBy' in s.params.hitDelay, damageTick, damageMs, enemyHp: [Math.round(hp0), Math.round(s.enemy.hp)], enemyBarWidth: bar ? bar.style.width || getComputedStyle(bar).width : null, marks, fx };
}, { n });
const resume = (page) => page.evaluate(() => { for (const a of document.getAnimations()) a.play(); });
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { rule: 'GDD 7절 v6.225 — 블록 피해 = 몸동작 타격 순간에 바로 (이펙트 도착 안 기다림)', errors: [], shots: [], runs: [] };
  const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  const ctx = await browser.newContext(PC);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => proof.errors.push(e.message.slice(0, 200)));
  try {
    await newGame(page, server.url, 1);
    await pickForm(page, /평대원/);
    await startBattle(page);
    for (const [n, file] of [[1, '01-chain1-hit-frame'], [3, '02-chain3-hit-frame']]) {
      const r = await useAndFreezeAtHit(page, n);
      await shot(page, file);
      await resume(page);
      r.shot = `${file}.png`;
      proof.runs.push(r);
      await page.waitForFunction(() => !window.__bhaCombat.motion?.cur && !(window.__bhaCombat.motion?.queue.length), null, { timeout: 10000 }).catch(() => {});
      await wait(1500);
    }
  } catch (e) {
    proof.errors.push(String(e).slice(0, 300));
  }
  fs.writeFileSync(path.join(OUT, 'facts.json'), JSON.stringify(proof, null, 2));
  await browser.close();
  server.stop();
  console.log(JSON.stringify(proof, null, 1).slice(0, 4000));
})();
