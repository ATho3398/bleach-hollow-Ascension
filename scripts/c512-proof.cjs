// C.512 proof (GDD 7절 v6.150, 사용자 2026-11-20 "이펙트에 슬로우 달려있다. 모션만 속도 따라가는거지, 이펙은 정상속도로 나와야지"):
// 같은 블록(사신 평대원 · 참 3체인, 도트 이펙트 + 연결 동작)을 몸 배율만 다르게(느린 몸 ×2 · 기본 · 빠른 몸) 쓰고, 블록을 쓴 뒤 같은 실제 시각(260ms)에
// 화면의 모든 애니메이션을 멈춰 도트 이펙트 Animation 의 playbackRate·진행(progress)·현재 시각을 적고 1배 캡처. 이펙트 진행이 몸 배율과 무관하게 같아야 한다.
// 엔진 쪽: 블록 몸동작 배율(blockMotionOf.rate)·타격 지연(blockHitDelayOf)·실제 피해 틱. PC 844×390 1배.
// 실행: node scripts/c512-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c512'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const AT_MS = 260;

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

/** 블록 기준 길이를 바꿔 몸 배율을 만든다 (target 초, null = 기본) → 3체인 사용 → AT_MS 뒤 전부 멈추고 잰다 */
const useAndFreeze = (page, target) => page.evaluate(async ({ target, AT }) => {
  const C = await import('/src/engine/combat/index.ts');
  const s = window.__bhaCombat;
  const fam = 'family-a';
  const n = 3;
  window.__c511Len ??= s.params.motion.blockLength; // 기본 기준 길이 보관
  s.params.motion.blockLength = target === null ? window.__c511Len : { default: [target, target, target], byTier: {} };
  s.tray = Array.from({ length: n }, () => ({ uid: s.nextUid++, kind: 'skill', traitId: C.BASIC_SKILL_ID, family: fam, element: null }));
  await new Promise((r) => requestAnimationFrame(() => r(0)));
  const key = C.blockHitKey(fam, n);
  const m = C.blockMotionOf(s.params, key, n);
  const hp0 = s.enemy.hp;
  const t0 = s.tick;
  const p0 = performance.now();
  const ok = C.applyInput(s, { type: 'use', cell: 0 });
  let damageTick = s.enemy.hp < hp0 ? 0 : null; // 엔진 피해가 들어간 틱(블록을 쓴 틱부터)
  while (performance.now() - p0 < AT) {
    await new Promise((r) => requestAnimationFrame(() => r(0)));
    if (damageTick === null && s.enemy.hp < hp0) damageTick = s.tick - t0;
  }
  const all = document.getAnimations();
  for (const a of all) a.pause();
  const fx = [...document.querySelectorAll('.bha-pxfx-wrap')].flatMap((w) => w.getAnimations({ subtree: true }).map((a) => {
    const ct = a.effect.getComputedTiming();
    const tm = a.effect.getTiming();
    return { fx: w.dataset.fx, node: a.effect.target === w ? 'wrap(길)' : 'sheet(프레임)', playbackRate: a.playbackRate, currentTime: Math.round(a.currentTime), delay: Math.round(tm.delay), duration: Math.round(Number(tm.duration)), progress: ct.progress === null ? null : Math.round(ct.progress * 1000) / 1000 };
  }));
  return { ok, damageTick, key, target: target ?? 'default', bodyRate: m?.rate ?? 1, engineMotionSeconds: m?.total ?? 0, hitDelaySeconds: C.blockHitDelayOf(s.params, key, n), blockFxBy: s.params.hitDelay.blockFxBy?.[key] ?? 0, blockBy: s.params.hitDelay.blockBy?.[key] ?? null, useTick: t0, hp0, elapsedMs: Math.round(performance.now() - p0), fx };
}, { target, AT: AT_MS });
const resume = (page) => page.evaluate(() => { for (const a of document.getAnimations()) a.play(); });
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { rule: 'GDD 7절 v6.150 — 모션 배율은 몸동작에만, 이펙트는 늘 1배', atMs: AT_MS, errors: [], shots: [], runs: [] };
  const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  const ctx = await browser.newContext(PC);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => proof.errors.push(e.message.slice(0, 200)));
  try {
    await newGame(page, server.url, 1);
    await pickForm(page, /평대원/);
    await startBattle(page);
    for (const [target, file] of [[2.4, '01-slow-body-x2'], [null, '02-default-body'], [0.3, '03-fast-body']]) {
      const r = await useAndFreeze(page, target);
      await shot(page, `${file}-${AT_MS}ms`);
      await resume(page);
      r.shot = `${file}-${AT_MS}ms.png`;
      proof.runs.push(r);
      await page.waitForFunction(() => !window.__bhaCombat.motion?.cur && !(window.__bhaCombat.motion?.queue.length), null, { timeout: 10000 }).catch(() => {});
      await wait(1500);
    }
    const sig = (r) => JSON.stringify(r.fx.map((f) => [f.fx, f.node, f.playbackRate, f.duration, f.delay]));
    const near = (r) => r.fx.every((f, i) => Math.abs((f.progress ?? -1) - (proof.runs[0].fx[i]?.progress ?? -1)) <= 0.02); // 한 프레임(16ms) 안
    proof.sameFxProgress = proof.runs.every((r) => sig(r) === sig(proof.runs[0]) && near(r));
    proof.allFxRate1 = proof.runs.every((r) => r.fx.length > 0 && r.fx.every((f) => f.playbackRate === 1));
    proof.sameDamageTick = proof.runs.every((r) => r.damageTick === proof.runs[0].damageTick);
  } catch (e) {
    proof.errors.push(String(e).slice(0, 300));
  }
  fs.writeFileSync(path.join(OUT, 'facts.json'), JSON.stringify(proof, null, 2));
  await browser.close();
  server.stop();
  console.log(JSON.stringify({ errors: proof.errors, sameFxProgress: proof.sameFxProgress, allFxRate1: proof.allFxRate1, sameDamageTick: proof.sameDamageTick, runs: proof.runs.map((r) => ({ t: r.target, rate: r.bodyRate, hd: r.hitDelaySeconds, fxBy: r.blockFxBy, dmg: r.damageTick, nfx: r.fx.length, el: r.elapsedMs })) }, null, 1));
})();
