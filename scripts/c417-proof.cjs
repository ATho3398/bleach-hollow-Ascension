// C.417 proof (GDD 245장, 코딩275): PC 844×390, 1배.
//  ① 튜토리얼 흐름: 배부름 카드 강조 테두리 = 배부름 줄(실측 px) · 첫 포식 갈래 하나씩 카드 · 온천 '가득 찼다' · 치료제/먹이 보상 · 상태 화면 능력치 표시
//  ② 강공격 실측 (튜토리얼 막기·일반 강적·보스): 예고 끝 프레임 = 빔이 닿는(맞음 반응) 프레임 = 피해 숫자 프레임 (±1프레임), 막기 중이면 그 순간 막힘
// 실행: node scripts/c417-proof.cjs [저장 폴더]   (vite 는 c276-proof startServer 가 띄운다)
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer, newGame } = require('./c276-proof.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs/captures/c417'));
const VIEW = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const FRAME = 1000 / 60;

/** 프레임마다 강공격 예고 남은 틱·체력 기록 (전투 화면이 뜬 뒤 부른다) */
const startFrameLog = (page) => page.evaluate(() => {
  const s = window.__bhaCombat;
  window.__bhaProbe.length = 0;
  const log = (window.__bhaFrames = []);
  let last = '';
  const f = () => {
    const c = window.__bhaCombat;
    if (!c) return;
    const k = `${c.enemy.cast ? c.enemy.cast.ticks : '-'}|${Math.round(c.player.hp)}|${c.guard.ticks > 0}`;
    if (k !== last) { last = k; log.push({ t: performance.now(), tick: c.tick, cast: c.enemy.cast ? c.enemy.cast.ticks : null, php: c.player.hp, guard: c.guard.ticks > 0 }); }
    if (c.status === 'playing') requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
  return !!s;
});

/** 강공격마다: windup(모션 시작) → 예고 끝 프레임 · 맞음 반응(빔 닿음) · 판정 사건 · 피해 숫자/막기 표시 */
const analyzeHeavy = (page) => page.evaluate((FRAME) => {
  const P = window.__bhaProbe || [];
  const F = window.__bhaFrames || [];
  const fr = (ms) => (ms === null ? null : Math.round((ms / FRAME) * 10) / 10);
  const rows = [];
  const winds = P.filter((x) => x.type === 'swing' && x.kind === 'heavy-hit');
  for (const w of winds) {
    const ev = P.find((x) => x.type === 'event' && x.kind === 'heavy-hit' && x.t >= w.t);
    if (!ev) continue;
    const react = P.filter((x) => x.type === 'hit-frame' && x.side === 'player' && x.tier === 'special' && x.t >= w.t).sort((a, b) => Math.abs(a.t - ev.t) - Math.abs(b.t - ev.t))[0] ?? null;
    const float = P.find((x) => x.type === 'float' && (x.kind === 'hurt' || x.kind === 'guard') && x.t >= ev.t - 1 && x.t <= ev.t + 100) ?? null;
    // 예고 끝 프레임 = 남은 틱이 있던 프레임 다음, 예고가 사라진 첫 프레임
    // (연속 강공격은 다음 예고가 바로 이어져 null 이 안 보일 수 있다 — 남은 틱이 다시 늘어난 프레임도 끝)
    const endIdx = F.findIndex((x, i) => i > 0 && x.t >= w.t && F[i - 1].cast !== null && (x.cast === null || x.cast > F[i - 1].cast));
    const castEnd = endIdx >= 0 ? F[endIdx] : null;
    const dReact = react ? fr(react.t - ev.t) : null;
    const dEnd = castEnd ? fr(castEnd.t - ev.t) : null;
    const dFloat = float ? fr(float.t - ev.t) : null;
    rows.push({
      stage: ev.stage, damage: Math.round((ev.damage ?? 0) * 10) / 10, landed: !!ev.landed, guardedAtHit: castEnd ? castEnd.guard : null,
      windupToHitMs: Math.round(ev.t - w.t), floatText: float?.text ?? null,
      castEndVsHitFrames: dEnd, beamReactVsHitFrames: dReact, floatVsHitFrames: dFloat,
      ok: dEnd !== null && Math.abs(dEnd) <= 1 && dReact !== null && Math.abs(dReact) <= 1 && dFloat !== null && Math.abs(dFloat) <= 1,
    });
  }
  return rows;
}, FRAME);

/** 화면 프레임 멈추기 (C.385 와 같은 방식): 피해 숫자/막기 표시가 뜬 그 프레임에서 rAF·애니메이션을 붙잡는다 */
const FREEZE_INIT = () => {
  const raf = window.requestAnimationFrame.bind(window);
  const q = [];
  let paused = [];
  window.requestAnimationFrame = (cb) => (window.__frozen ? (q.push(cb), 0) : raf(cb));
  window.__freeze = () => { if (window.__frozen) return; window.__frozen = true; paused = document.getAnimations().filter((a) => a.playState === 'running'); paused.forEach((a) => a.pause()); };
  window.__unfreeze = () => { window.__frozen = false; paused.forEach((a) => a.play()); paused = []; q.splice(0).forEach((cb) => raf(cb)); };
};
/** 다음 강공격 판정(heavy-hit) 뒤 첫 표시(float)에서 멈추게 */
const armFreeze = (page) => page.evaluate(() => {
  const P = window.__bhaProbe;
  if (!P.__wrapped) {
    const orig = P.push.bind(P);
    P.push = (...xs) => {
      const r = orig(...xs);
      for (const x of xs) {
        if (!window.__freezeWant) continue;
        if (x.type === 'event' && x.kind === 'heavy-hit') window.__freezeArmed = true;
        else if (x.type === 'float' && window.__freezeArmed && (x.kind === 'hurt' || x.kind === 'guard')) { window.__freezeArmed = false; window.__freezeWant = false; window.__freeze(); }
      }
      return r;
    };
    P.__wrapped = true;
  }
  window.__freezeWant = true;
  window.__freezeArmed = false;
});
async function shotIfFrozen(page, name, facts) {
  if (!(await page.evaluate(() => !!window.__frozen))) return false;
  await page.evaluate(() => window.__unfreeze());
  await page.waitForTimeout(60); // 빔이 방어막·몸에 닿아 번쩍이는 순간
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  facts.shots.push(name);
  return true;
}

const dev = (page, name) => page.locator(`.bha-dev__btn[aria-label="${name}"]`).first();
const look = (page) => page.evaluate(() => {
  const l = [...document.querySelectorAll('.bha-tut')].pop() ?? null;
  const sel = document.querySelector('.bha-sel');
  const only = l?.dataset.devOnly ?? null;
  return {
    name: l?.dataset.tutorial ?? null, title: l?.querySelector('.bha-tut__title, h2, h3')?.textContent ?? null, body: l?.querySelector('.bha-tut__body')?.textContent ?? null,
    only, pass: !!l?.hasAttribute('data-dev-pass'), selOnly: !!(sel && only && sel.matches(only)),
    screen: [...document.querySelectorAll('.bha-lcd .bha-app')].map((e) => e.className).join('|'),
    absorb: !!document.querySelector('.bha-tutabsorb .bha-absorb__pick'), spa: !!document.querySelector('.bha-spa'),
    toast: [...document.querySelectorAll('.bha-toast')].map((t) => t.textContent).join(' | '), stage: window.__bhaCombat?.script?.stage ?? null,
  };
});
const rectOf = (page, sel) => page.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; }, sel);

/** ① + 튜토리얼 강공격(막기): 새 게임 튜토리얼을 끝까지 */
async function tutorialFlow(browser, url, facts, errors) {
  const ctx = await browser.newContext(VIEW);
  await ctx.addInitScript(FREEZE_INIT);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`flow: ${e.message.slice(0, 160)}`));
  await newGame(page, url, 0); // 새 게임 튜토리얼은 테스트 모드가 아닐 때만 뜬다
  const shot = async (name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); facts.shots.push(name); };
  const seen = new Set();
  let roomSince = 0;
  let wasRoom = false;
  for (let t = 0; t < 1600; t++) {
    const st = await look(page).catch((e) => ({ err: e.message.slice(0, 120) }));
    if (process.env.DBG && t % 10 === 0) console.error(t, JSON.stringify({ n: st.name, ti: st.title, only: st.only, sel: st.selOnly, sc: (st.screen || '').slice(0, 60), err: st.err }));
    const inRoom = (st.screen || '').includes('bha-room--home');
    if (inRoom && !wasRoom) roomSince = Date.now();
    wasRoom = inRoom;
    const key = `${st.name}:${st.title}`;
    if (st.title && !seen.has(key)) { seen.add(key); facts.stages.push(`${st.name}:${st.title}`); }
    if (await page.locator('.bha-battle').count()) {
      if (st.name === 'script') {
        const acting = st.pass && st.only;
        if (acting && !st.selOnly) await dev(page, '아래').click().catch(() => {});
        else await dev(page, '확정').click().catch(() => {});
        await page.waitForTimeout(acting ? 700 : 250);
        continue;
      }
      await page.waitForTimeout(60);
      continue;
    }
    // 첫 포식: 갈래 카드 하나씩 (GDD 245장 5)
    if (st.name === 'first-absorb' && /둘 다|포식/.test(st.title ?? '') && !seen.has(`abs:${st.title}`)) {
      seen.add(`abs:${st.title}`);
      if (!facts.absorbCards) facts.absorbCards = [];
      facts.absorbCards.push({ title: st.title, body: st.body, hole: await rectOf(page, '.bha-tut__hole'), sameBadge: await page.locator('.bha-absorb__risk--same').count() });
      if (facts.absorbCards.length === 2) { await page.waitForTimeout(300); await shot('03-absorb-mode-card'); }
    }
    if (st.name === 'recover' && /배부름/.test(st.title ?? '') && !seen.has('full')) {
      seen.add('full');
      await page.waitForTimeout(1200); // 화면이 자리 잡은 뒤(이름표가 생겨 줄이 내려감)에도 테두리가 따라가는지
      facts.fullnessHole = { hole: await rectOf(page, '.bha-tut__hole'), hunger: await rectOf(page, '.bha-room__status [data-gauge="hunger"]'), pad: 6 };
      await shot('01-fullness-highlight');
    }
    if (st.spa && /가득 찼다/.test(st.body ?? '') && !seen.has('spadone')) { seen.add('spadone'); facts.spaDone = { body: st.body, hp: await page.evaluate(() => document.querySelector('.bha-spa')?.textContent?.match(/\d+\s*\/\s*\d+/)?.[0] ?? null) }; await shot('04-spa-full'); }
    if ((st.toast ?? '').includes('치료제') && !seen.has('cure')) { seen.add('cure'); facts.cureToast = st.toast; }
    if ((st.toast ?? '').includes('튜토리얼 보상') && /먹이|6종/.test(st.toast) && !seen.has('reward')) {
      seen.add('reward'); facts.foodToast = st.toast; await page.waitForTimeout(600); await shot('05-food-reward');
      facts.items = await page.evaluate(() => { for (let i = 0; i < localStorage.length; i++) { const raw = localStorage.getItem(localStorage.key(i)); if (raw && raw.includes('"runLog"')) { const m = raw.match(/"items":\{[^}]*\}/); const f = raw.match(/"food":\{[^}]*\}/); return { items: m?.[0] ?? null, food: f?.[0] ?? null }; } } return null; });
      break;
    }
    const go = page.locator('.bha-lcd [data-dev-layer] button.bha-btn--primary:not([disabled])').filter({ visible: true });
    if (st.absorb && !st.name) await page.locator('.bha-absorb__go').click({ timeout: 2000 }).catch(() => {});
    else if (!st.name && st.screen?.includes('bha-resultv2')) await page.locator('.bha-lcd .bha-result__home').first().click({ timeout: 2000 }).catch(() => {});
    else if (!st.name && st.screen?.includes('bha-tutabsorb')) await page.locator('.bha-lcd .bha-tutabsorb button.bha-btn--primary').first().click({ timeout: 2000 }).catch(() => {});
    else if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
    else if (st.only) await dev(page, st.selOnly ? '확정' : '아래').click().catch(() => {});
    else if (t > 8 && st.screen?.includes('worldmap')) await page.locator('.bha-worldmap [data-place="adventure"]').click({ timeout: 2000 }).catch(() => {});
    else if (t > 8 && !st.screen?.includes('spa') && Date.now() - roomSince > 12_000) await page.locator('.bha-prop--outside, .bha-prop--door').first().click({ timeout: 2000 }).catch(() => {}); // 방에 막 돌아왔으면 안내(회복 안내 등)가 뜰 틈을 준다
    await page.waitForTimeout(300);
  }
  // 상태 화면 능력치 (GDD 245장 4): 남은 안내 닫고 상태 박스를 눌러 연다
  for (let i = 0; i < 8; i++) {
    const go = page.locator('.bha-lcd [data-dev-layer] button.bha-btn--primary:not([disabled])').filter({ visible: true });
    if (await go.count()) { await go.first().click({ timeout: 1500 }).catch(() => {}); await page.waitForTimeout(400); } else break;
  }
  await page.waitForTimeout(3500);
  await page.locator('.bha-room__status').first().click({ timeout: 3000 }).catch((e) => errors.push(`status: ${e.message.slice(0, 80)}`));
  await page.waitForTimeout(900);
  facts.statRows = await page.evaluate(() => [...document.querySelectorAll('.bha-stats .bha-statrow')].map((r) => r.textContent.trim()));
  facts.roomMaxHp = null;
  await shot('06-status-stats');
  await ctx.close();
}

/** ② 튜토리얼 강공격 (막기 1 · 못 막기 1): 테스트 모드에서 '튜토리얼 다시 보기'(첫 모험과 같은 각본, GDD 123장 5) */
async function tutorialDemo(browser, url, facts, errors) {
  const ctx = await browser.newContext(VIEW);
  await ctx.addInitScript(FREEZE_INIT);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`demo: ${e.message.slice(0, 160)}`));
  await newGame(page, `${url}?test=1`, 0);
  await page.waitForTimeout(1200);
  for (let i = 0; i < 4 && (await page.locator('.bha-tut').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
  await page.locator('.bha-lcd').getByRole('button', { name: '더보기' }).click();
  await page.waitForTimeout(500);
  await page.locator('.bha-homedock__tray').getByRole('button', { name: '도움말' }).click();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: '다시 보기' }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: '튜토리얼 다시 보기' }).first().click();
  await page.locator('.bha-battle').waitFor({ timeout: 20_000 });
  await page.waitForFunction(() => !!window.__bhaCombat && !!window.__bhaProbe, null, { timeout: 10_000 });
  await startFrameLog(page);
  await armFreeze(page);
  facts.tutDelay = await page.evaluate(() => window.__bhaCombat.params.hitDelay.heavy);
  const t0 = Date.now();
  let shots = 0;
  while (Date.now() - t0 < 90_000) {
    if (await shotIfFrozen(page, shots === 0 ? '02-tut-heavy-guarded' : '08-tut-heavy-hit', facts)) { shots++; if (shots < 2) await armFreeze(page); continue; }
    const L = await page.evaluate(() => {
      const s = window.__bhaCombat;
      const card = document.querySelector('.bha-tut');
      const next = card ? [...card.querySelectorAll('button')].find((b) => /다음|확인|✓/.test(b.textContent || '') || /다음/.test(b.getAttribute('aria-label') || '')) : null;
      return { stage: s?.script?.stage ?? null, status: s?.status, card: !!card, hasNext: !!next && !next.disabled };
    });
    if (L.status && L.status !== 'playing') break;
    if (L.stage === 'heavy2' || L.stage === 'hurt-hold') { if (!facts.tutHeavyRows) { /* 진행 중 */ } }
    if (L.card && L.hasNext) { await page.evaluate(() => { const c = document.querySelector('.bha-tut'); const b = [...c.querySelectorAll('button')].find((x) => /다음|확인|✓/.test(x.textContent || '') || /다음/.test(x.getAttribute('aria-label') || '')); b?.click(); }); await page.waitForTimeout(250); continue; }
    if (L.stage === 'guard-now') { await page.locator('[data-sc="guard"]').first().click({ timeout: 2000, force: true }).catch(() => {}); await page.waitForTimeout(250); continue; }
    if (L.stage === 'hurt' || L.stage === 'chain-use' || L.stage === 'skill-use') { await page.evaluate(() => document.querySelector('[data-sc="block.1"]')?.dispatchEvent(new Event('bha-press'))); await page.waitForTimeout(250); continue; }
    if (shots >= 2 && (await page.evaluate(() => (window.__bhaProbe || []).filter((x) => x.type === 'event' && x.kind === 'heavy-hit').length >= 2))) { await page.waitForTimeout(800); break; }
    await page.waitForTimeout(25);
  }
  facts.tutHeavy = await analyzeHeavy(page);
  if (process.env.DUMP) facts.tutProbe = await page.evaluate(() => (window.__bhaProbe || []).filter((x) => x.type !== 'event' || x.kind !== 'player-attack').map((x) => ({ ...x, t: Math.round(x.t) })));
  await ctx.close();
}

async function openTest(page, tab) {
  for (let i = 0; i < 4 && (await page.locator('.bha-tut').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
  await page.locator('.bha-lcd').getByRole('button', { name: '더보기' }).click();
  await page.waitForTimeout(500);
  await page.locator('.bha-homedock__tray').getByRole('button', { name: '테스트' }).click();
  await page.waitForTimeout(700);
  await page.locator('.bha-lcd .bha-viewtitle__btn').first().click();
  await page.locator('.bha-viewtitle__list').getByRole('option', { name: tab }).click();
  await page.waitForTimeout(400);
}
async function pick(page, aria, group, nth = 0) {
  await page.locator(`.bha-lcd button.bha-pick[aria-label="${aria}"]`).click();
  await page.waitForTimeout(200);
  const ok = await page.evaluate(({ group, nth }) => {
    const box = document.querySelector('.bha-pick__list');
    if (!box) return 'nolist';
    let inGroup = false;
    let k = 0;
    for (const n of box.children) {
      if (n.classList.contains('bha-pick__group')) { inGroup = n.textContent === group; continue; }
      if (inGroup && n.getAttribute('role') === 'option') { if (k++ === nth) { n.click(); return true; } }
    }
    return false;
  }, { group, nth });
  await page.waitForTimeout(300);
  return ok;
}

/** ② 일반 강적 / 보스: 테스트 '바로 전투' — 강공격 2번(그냥 맞기 · 막기) */
async function testBattle(browser, url, group, tag, facts, errors) {
  const ctx = await browser.newContext(VIEW);
  await ctx.addInitScript(FREEZE_INIT);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message.slice(0, 160)}`));
  await newGame(page, `${url}?test=1`, 0);
  await page.waitForTimeout(1200);
  await openTest(page, '바로 전투');
  if ((await pick(page, '상대', group, 0)) !== true) throw new Error(`${group} 못 고름`);
  await page.locator('.bha-lcd').getByRole('button', { name: '전투 시작' }).click();
  await page.locator('.bha-battle').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  for (let i = 0; i < 3 && (await page.locator('.bha-tut').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
  await page.evaluate(() => { const s = window.__bhaCombat; s.enemy.maxHp *= 50; s.enemy.hp = s.enemy.maxHp; s.player.maxHp *= 50; s.player.hp = s.player.maxHp; s.guardFilled = true; });
  await startFrameLog(page);
  facts[`${tag}Delay`] = await page.evaluate(() => window.__bhaCombat.params.hitDelay.heavy);
  for (const guard of [false, true]) {
    await armFreeze(page);
    const t0 = Date.now();
    let cast = false;
    let done = false;
    while (Date.now() - t0 < 40_000 && !done) {
      if (await shotIfFrozen(page, `${tag === 'elite' ? '07' : '09'}-${tag}-heavy-${guard ? 'guarded' : 'hit'}`, facts)) { done = true; break; }
      const st = await page.evaluate(() => { const s = window.__bhaCombat; return { cast: !!s.enemy.cast, ticks: s.enemy.cast?.ticks ?? 0 }; });
      if (st.cast && !cast) {
        cast = true;
        if (guard) {
          await page.evaluate(() => { const s = window.__bhaCombat; s.guardGauge = 1; s.guardFilled = true; });
          await page.waitForFunction(() => (window.__bhaCombat.enemy.cast?.ticks ?? 0) <= 4, null, { timeout: 10_000 }).catch(() => {});
          await page.locator('[data-sc="guard"]').first().click({ force: true }).catch(() => {});
        }
      }
      await page.waitForTimeout(15);
    }
    await page.waitForTimeout(1500);
  }
  facts[`${tag}Heavy`] = await analyzeHeavy(page);
  await ctx.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const facts = { shots: [], stages: [] };
  const errors = [];
  try {
    if (!process.env.SKIP_FLOW) await tutorialFlow(browser, server.url, facts, errors).catch((e) => errors.push(`flow: ${e.message}`));
    if (!process.env.SKIP_BATTLE) {
      await tutorialDemo(browser, server.url, facts, errors).catch((e) => errors.push(`demo: ${e.message}`));
      if (!process.env.ONLY_DEMO) await testBattle(browser, server.url, '강적', 'elite', facts, errors).catch((e) => errors.push(`elite: ${e.message}`));
      if (!process.env.ONLY_DEMO) await testBattle(browser, server.url, '보스', 'boss', facts, errors).catch((e) => errors.push(`boss: ${e.message}`));
    }
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify({ facts, errors }, null, 1));
    console.log(JSON.stringify({ facts: { ...facts, stages: facts.stages.length }, errors }, null, 1));
    await browser.close();
    server.stop();
  }
})();
