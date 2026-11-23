// C.519 proof (GDD 7절 v6.167, 사용자 2026-11-22 "모션 슬로우걸리는거 왜 아직도 남아있음?" → 11-23 "남는 시간은 끝자세 말고 기본 아이들로 남겨놔"):
// 블록 몸동작 배율 하한 1배 — 기준 길이보다 짧은 몸은 1배로 끝까지, 남는 시간은 기본 대기(idle) 동작. 긴 동작만 빨라진다.
// 블록을 쓰고 rAF 마다 내 몸 재생기의 동작(playing)·실제 재생 배율(playbackRate)을 적다가 정한 시각에 멈춰 1배 캡처.
// 01 아란칼 조 3체인(옛 ×0.136) · 02 사신 평대원 참 1체인(옛 ×0.25) · 03 길리안 교 3체인(옛 ×0.194) — 1배 동작이 끝나고 대기 동작으로 넘어간 장면
// 04 길리안 탄 1체인(배율 1.33 — 빨라지는 몸) 동작 중간. PC 844×390 1배.
// 실행: node scripts/c519-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c519'));
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

/** 세이브를 슬롯 1에 쓰고 이어하기 (factionId · 진화 단계 · 형태) */
async function seed(page, url, o) {
  await page.goto(`${url}?test=1`);
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async (o) => {
    const g = await import('/src/game.ts');
    const slots = await import('/src/saveSlots.ts');
    const tut = await import('/src/engine/tutorial.ts');
    const tm = await import('/src/engine/testMode.ts');
    const store = tm.testStorage(localStorage);
    const now = Date.now();
    const s = g.newSaveData(o.factionId, now);
    s.name = '호영';
    s.gender = 'male';
    s.help.tutorialSeen = true;
    for (const id of tut.GUIDE_IDS) s.help.guides[id] = 'done';
    const e = s.evolution;
    e.tierIndex = o.tierIndex;
    e.formHistory = o.history;
    e.formId = o.formId;
    e.ascended = !!o.ascended;
    if (o.tierIndex >= 3) e.abilities = { owned: {}, equipped: [], slots: 2, tier4Ever: true };
    while (s.build.slots.length < 6) s.build.slots.push(null);
    s.nest.hunger = 80;
    s.nest.condition = 90;
    g.checkUnlocks?.(s, now);
    slots.writeSlotSave(store, s, 1);
    slots.touchSlot(store, 1, now);
  }, o);
  await page.goto(`${url}?test=1`);
  await wait(1500);
  const cont = page.getByRole('button', { name: '이어하기' });
  if (await cont.count()) await cont.click({ timeout: 5000 });
  await wait(2500);
  for (let i = 0; i < 4 && (await page.locator('[data-dev-layer], .bha-tut').count()); i++) { await page.keyboard.press('Escape'); await wait(250); }
  await skipTut(page);
}

async function openTest(page, tabName) {
  if (!(await page.locator('.bha-test-page').count())) {
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
async function startBattle(page) {
  await openTest(page, '바로 전투');
  await page.getByRole('button', { name: '전투 들어가기' }).first().click({ timeout: 3000 });
  await wait(800);
  const ok = page.getByRole('button', { name: '확인', exact: true }).filter({ visible: true });
  if (await ok.count()) await ok.last().click({ timeout: 3000 });
  await page.waitForFunction(() => !!window.__bhaCombat && window.__bhaCombat.tick > 5, null, { timeout: 15000 });
  await page.evaluate(() => {
    const s = window.__bhaCombat;
    s.enemy.maxHp *= 50; s.enemy.hp = s.enemy.maxHp; s.player.maxHp *= 3; s.player.hp = s.player.maxHp;
    s.spawnTimer = 1e9; s.enemy.attackTimer = 1e9; s.enemy.actionTimer = 1e9; s.params.timeLimitSeconds = 1e6; s.player.attackTimer = 1e9; s.tray = [];
  });
  await wait(1200);
}

/** n체인 계열 블록을 쓰고 rAF 마다 내 몸 재생기를 적다가 at ms 에 멈춘다 */
const useAndFreeze = (page, fam, n, at) => page.evaluate(async ({ fam, n, at }) => {
  const C = await import('/src/engine/combat/index.ts');
  const A = await import('/src/ui/bha/animPlayer.ts');
  const s = window.__bhaCombat;
  const me = [...document.querySelectorAll('.bha-unit--me, .bha-unit--me *, .bha-hero, .bha-hero *')];
  const owner = me.find((el) => A.animOf(el));
  const pl = owner ? A.animOf(owner) : null;
  const look = document.querySelector('.bha-unit--me [data-look], .bha-hero [data-look]')?.getAttribute('data-look') ?? null;
  s.tray = Array.from({ length: n }, () => ({ uid: s.nextUid++, kind: 'skill', traitId: C.BASIC_SKILL_ID, family: fam, element: null }));
  await new Promise((r) => requestAnimationFrame(() => r(0)));
  const key = C.blockHitKey(fam, n);
  const m = C.blockMotionOf(s.params, key, n);
  const hp0 = s.enemy.hp;
  const t0 = s.tick;
  const p0 = performance.now();
  const ok = C.applyInput(s, { type: 'use', cell: 0 });
  let damageTick = s.enemy.hp < hp0 ? 0 : null;
  const samples = [];
  let motionEndTick = null;
  while (performance.now() - p0 < at) {
    await new Promise((r) => requestAnimationFrame(() => r(0)));
    if (damageTick === null && s.enemy.hp < hp0) damageTick = s.tick - t0;
    if (motionEndTick === null && s.motion?.cur) motionEndTick = s.motion.cur.endTick - t0;
    if (pl) samples.push({ ms: Math.round(performance.now() - p0), playing: pl.playing, rate: Math.round((pl.playbackRate ?? 1) * 1000) / 1000 });
  }
  if (pl) pl.setPaused(true);
  for (const a of document.getAnimations()) a.pause();
  const body = samples.filter((x) => x.playing && x.playing !== 'idle');
  const firstIdle = samples.find((x, i) => x.playing === 'idle' && samples.slice(0, i).some((y) => y.playing && y.playing !== 'idle'));
  return {
    ok, look, key, freezeMs: at, damageTick, hitDelaySeconds: C.blockHitDelayOf(s.params, key, n),
    engine: { motionRatio: m ? Math.round(m.rate * 1000) / 1000 : null, bodyPlaybackRate: m ? Math.max(1, Math.round(m.rate * 1000) / 1000) : null, motionSeconds: m?.total ?? 0, motionHitSeconds: m ? Math.round(m.hit * 1000) / 1000 : 0, motionEndTick },
    animation: { bodyActions: [...new Set(body.map((x) => x.playing))], minPlaybackRate: body.length ? Math.min(...body.map((x) => x.rate)) : null, maxPlaybackRate: body.length ? Math.max(...body.map((x) => x.rate)) : null, bodyEndMs: body.length ? body.at(-1).ms : null, idleFromMs: firstIdle?.ms ?? null, atFreeze: samples.at(-1) ?? null },
    samples: samples.filter((_, i) => i % 3 === 0),
  };
}, { fam, n, at });
const resume = (page) => page.evaluate(async () => {
  const A = await import('/src/ui/bha/animPlayer.ts');
  for (const el of document.querySelectorAll('.bha-unit--me, .bha-unit--me *, .bha-hero, .bha-hero *')) A.animOf(el)?.setPaused(false);
  for (const a of document.getAnimations()) a.play();
});

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { rule: 'GDD 7절 v6.167 — 몸동작 배율 하한 1배, 남는 시간 = 기본 대기(idle) 동작', errors: [], shots: [], runs: [] };
  const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  const run = async (page, label, fam, n, at, file) => {
    const r = await useAndFreeze(page, fam, n, at);
    await shot(page, file);
    await resume(page);
    proof.runs.push({ label, shot: `${file}.png`, ...r });
    await page.waitForFunction(() => !window.__bhaCombat.motion?.cur && !(window.__bhaCombat.motion?.queue.length), null, { timeout: 10000 }).catch(() => {});
    await wait(1200);
  };
  const scenes = [
    { o: { factionId: 'hollow', tierIndex: 3, history: ['t2:base', 't3:normal', 't4:normal:physical'], formId: 't4:normal:physical', ascended: true }, runs: [['아란칼 조 3체인', 'family-a', 3, 700, '01-arrancar-claw3-idle']] },
    { o: { factionId: 'shinigami', tierIndex: 2, history: ['t2:base', 't3:normal'], formId: 't3:normal' }, runs: [['사신 평대원 참 1체인', 'family-a', 1, 550, '02-shinigami-slash1-idle']] },
    { o: { factionId: 'hollow', tierIndex: 1, history: ['t2:base'], formId: 't2:base' }, runs: [['길리안 교 3체인', 'family-b', 3, 700, '03-gillian-bite3-idle'], ['길리안 탄 1체인(긴 동작 — 빨라짐)', 'family-c', 1, 330, '04-gillian-shot1-fast']] },
  ];
  for (const sc of scenes) {
    const ctx = await browser.newContext(PC);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => proof.errors.push(e.message.slice(0, 200)));
    try {
      await seed(page, server.url, sc.o);
      await startBattle(page);
      for (const [label, fam, n, at, file] of sc.runs) await run(page, label, fam, n, at, file);
    } catch (e) {
      proof.errors.push(String(e).slice(0, 300));
    }
    await ctx.close();
  }
  proof.allPlaybackRateAtLeast1 = proof.runs.every((r) => r.animation.minPlaybackRate !== null && r.animation.minPlaybackRate >= 0.999);
  proof.idleAfterBody = proof.runs.filter((r) => r.shot.includes('idle')).every((r) => r.animation.atFreeze?.playing === 'idle' && r.animation.idleFromMs !== null);
  fs.writeFileSync(path.join(OUT, 'facts.json'), JSON.stringify(proof, null, 2));
  await browser.close();
  server.stop();
  console.log(JSON.stringify({ errors: proof.errors, allPlaybackRateAtLeast1: proof.allPlaybackRateAtLeast1, idleAfterBody: proof.idleAfterBody, runs: proof.runs.map((r) => ({ l: r.label, look: r.look, eng: r.engine, an: { ...r.animation, atFreeze: r.animation.atFreeze?.playing }, dmg: r.damageTick })) }, null, 1));
})();
