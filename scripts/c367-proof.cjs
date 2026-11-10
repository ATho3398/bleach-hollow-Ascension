// C.367 (GDD 224장) proof: 튜토리얼 각본 전투 '일반 공격은 자동' 카드 + 강공격·블록 피해가 모션 타격 프레임에 맞는지 프레임 단위 실측. 캡처 docs/captures/c367/
// 실행: npx vite --port 5400 → node scripts/c367-proof.cjs http://localhost:5400/   (EXPLORE=1 이면 탐색만)
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const OUT = path.resolve(__dirname, '../docs/captures/c367');
const URL = process.argv[2] || 'http://localhost:5400/';
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PH = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };

async function newGame(page, url, fi) {
  await page.goto(`${url}?test=1`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${url}?test=1`);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '새로 시작' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-slot').first().click();
  await page.getByRole('button', { name: '확인' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-species__card').nth(fi).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await page.waitForTimeout(600);
  const input = page.locator('[data-ident="name"]');
  if (await input.count()) {
    await input.fill('시험');
    await page.locator('[data-ident="next"]').click();
    await page.waitForTimeout(200);
    await page.locator('.bha-ident__gender').first().click();
    await page.locator('[data-ident="done"]').click();
  }
  await page.waitForTimeout(1500);
}

const SC = '/tmp/claude-0/-home-user-bleach-hollow-Ascension/579ae260-f464-51a8-88ce-7549e02305c8/scratchpad';
const FRAME = 1000 / 60;
/** 튜토리얼 체험 전투(첫 모험과 같은 각본, GDD 123장 5)를 연다: 더보기 → 도움말 → 다시 보기 → 튜토리얼 다시 보기 */
async function openDemo(page) {
  for (let i = 0; i < 4 && (await page.locator('.bha-tut').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
  await page.locator('.bha-lcd').getByRole('button', { name: '더보기' }).click();
  await page.waitForTimeout(500);
  await page.locator('.bha-homedock__tray').getByRole('button', { name: '도움말' }).click();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: '다시 보기' }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: '튜토리얼 다시 보기' }).first().click();
  await page.locator('.bha-battle').waitFor({ timeout: 20_000 });
  // 프레임마다 체력·단계 기록 (체력 막대는 같은 프레임에 그려진다)
  await page.evaluate(() => {
    const log = (window.__bhaFrames = []);
    const ticks = (window.__bhaRaf = []);
    let last = '';
    const f = (ts) => {
      ticks.push(ts);
      const s = window.__bhaCombat;
      if (s) {
        const k = `${Math.round(s.player.hp)}|${Math.round(s.enemy.hp)}|${s.script?.stage ?? '-'}`;
        if (k !== last) { last = k; log.push({ t: performance.now(), tick: s.tick, php: s.player.hp, ehp: s.enemy.hp, stage: s.script?.stage ?? null, status: s.status }); }
      }
      if (!s || s.status === 'playing') requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
}
/** 지금 카드·단계 */
const look = (page) => page.evaluate(() => {
  const s = window.__bhaCombat;
  const card = document.querySelector('.bha-tut');
  const next = card ? [...card.querySelectorAll('button')].find((b) => /다음|확인|✓/.test(b.textContent || '') || /다음/.test(b.getAttribute('aria-label') || '')) : null;
  return { stage: s?.script?.stage ?? null, status: s?.status, card: !!card, title: card?.querySelector('.bha-tut__title, h2, h3')?.textContent ?? null, hasNext: !!next };
});
/** 각본을 사람처럼 진행: 카드 [다음], 막기 카드 → 막기, 블록 카드 → 첫 블록. shots: 단계 → 캡처 함수 */
async function playDemo(page, tag, hooks = {}) {
  const seen = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 90_000) {
    const L = await look(page);
    if (L.status && L.status !== 'playing') break;
    if (L.card && L.stage && !seen.includes(L.stage)) {
      seen.push(L.stage);
      await page.waitForTimeout(400);
      if (hooks.card) await hooks.card(L.stage, L);
    }
    if (L.card && L.hasNext) {
      await page.evaluate(() => { const c = document.querySelector('.bha-tut'); const b = [...c.querySelectorAll('button')].find((x) => /다음|확인|✓/.test(x.textContent || '') || /다음/.test(x.getAttribute('aria-label') || '')); b?.click(); });
      await page.waitForTimeout(250);
      continue;
    }
    if (L.stage === 'guard-now') { await page.locator('[data-sc="guard"]').first().click({ timeout: 2000, force: true }).catch((e) => console.log('guardclick', e.message.slice(0, 200))); await page.waitForTimeout(250); continue; }
    if (L.stage === 'hurt' || L.stage === 'chain-use') { await page.evaluate(() => document.querySelector('[data-sc="block.1"]')?.dispatchEvent(new Event('bha-press'))); await page.waitForTimeout(250); continue; }
    if (hooks.tick) await hooks.tick(L);
    await page.waitForTimeout(30);
  }
  console.log('end', JSON.stringify(await look(page)));
  await page.waitForTimeout(1500);
  return seen;
}
/** 피해가 들어간 순간(엔진 사건 = 피해 숫자·체력 막대) ↔ 맞는 쪽 반응(hit-frame) ↔ 치는 쪽 동작 타격 프레임(swing-frame) 비교 */
async function analyze(page) {
  return page.evaluate((FRAME) => {
    const P = window.__bhaProbe || [];
    const F = window.__bhaFrames || [];
    const out = [];
    const fr = (ms) => Math.round((ms / FRAME) * 10) / 10;
    const nearest = (list, t) => list.reduce((best, x) => (best === null || Math.abs(x.t - t) < Math.abs(best.t - t) ? x : best), null);
    // 피해가 들어간 사건: 적 강공격(heavy-hit), 내 블록(block, 공격 — 피해 > 0), 각본 마무리 착탄(script-impact). 예약된 것은 landed 쪽만
    const dmg = P.filter((x) => x.type === 'event' && (x.kind === 'heavy-hit' || x.kind === 'script-impact' || (x.kind === 'block' && x.damage > 0)));
    for (const h of dmg) {
      if (h.kind === 'block' && h.stage === 'chain-hit' && !h.landed) continue; // 마무리 체인: 발동만(피해 = script-impact)
      const target = h.kind === 'heavy-hit' ? 'player' : 'enemy';
      const attacker = target === 'player' ? 'enemy' : 'player';
      const swing = h.landed ? [...P].reverse().find((x) => x.type === 'swing' && x.kind === h.kind && x.t <= h.t) : null;
      const start = h.kind === 'script-impact' ? [...P].reverse().find((x) => x.type === 'event' && x.kind === 'block' && x.t <= h.t)?.t ?? h.t : swing ? swing.t : h.t;
      const win = (x) => x.t >= start - 1 && x.t <= h.t + 2500;
      // 같은 때 겹친 평타(tier basic) 연출은 빼고 이 공격의 연출만
      const mine = (x) => (h.kind === 'heavy-hit' ? x.tier === 'special' : x.tier !== 'basic');
      const hf = nearest(P.filter((x) => x.type === 'hit-frame' && x.side === target && win(x) && mine(x)), h.t);
      // 치는 쪽 타격 프레임: 마무리 체인(여러 동작)은 마지막 동작의 타격 = 이 공격 창 안 마지막 것, 한 번 치는 공격은 가장 가까운 것
      const sfs = P.filter((x) => x.type === 'swing-frame' && x.side === attacker && win(x) && mine(x) && x.t <= h.t + 400);
      const sf = h.kind === 'script-impact' ? sfs[sfs.length - 1] ?? null : nearest(sfs, h.t);
      const float = P.find((x) => x.type === 'float' && x.t >= h.t - 1 && x.t <= h.t + 100 && x.kind !== 'chain');
      const bar = F.find((x) => x.t >= h.t - 1);
      const dHit = hf ? fr(h.t - hf.t) : null;
      const dSwing = sf ? fr(h.t - sf.t) : null;
      out.push({
        kind: h.kind, stage: h.stage, family: h.family, chain: h.chain, damage: Math.round((h.damage ?? 0) * 10) / 10, delayedByEngine: !!swing,
        motionStartToDamageMs: Math.round(h.t - start),
        damageAt: Math.round(h.t), floatAt: float ? Math.round(float.t) : null, floatText: float?.text ?? null, barAt: bar ? Math.round(bar.t) : null,
        targetReactAt: hf ? Math.round(hf.t) : null, attackerHitFrameAt: sf ? Math.round(sf.t) : null,
        // + = 피해가 타격 프레임보다 늦음 / − = 피해가 먼저 (프레임 = 1/60초)
        vsTargetReactFrames: dHit, vsAttackerHitFrameFrames: dSwing,
        // 기준: 피해 = 맞는 쪽 반응(이펙트 타격)과 ±1 프레임, 그리고 치는 쪽 동작 타격 프레임보다 먼저가 아님(−1 프레임 이내). 한 번 치는 공격은 둘 다 ±1
        ok: dHit !== null && Math.abs(dHit) <= 1 && (dSwing === null || dSwing >= -1),
      });
    }
    const R = window.__bhaRaf || [];
    const gaps = R.slice(1).map((x, i) => x - R[i]).sort((a, b) => a - b);
    const frameMs = gaps.length ? gaps[Math.floor(gaps.length / 2)] : FRAME;
    for (const r of out) {
      // 실제 화면 프레임(이 실행의 rAF 간격 중앙값) 단위로도
      r.vsTargetReactRenderedFrames = r.vsTargetReactFrames === null ? null : Math.round((r.vsTargetReactFrames * FRAME / frameMs) * 10) / 10;
      r.vsAttackerHitRenderedFrames = r.vsAttackerHitFrameFrames === null ? null : Math.round((r.vsAttackerHitFrameFrames * FRAME / frameMs) * 10) / 10;
    }
    const t0 = P[0]?.t ?? 0;
    return { frameMs: Math.round(frameMs * 10) / 10, rows: out, timeline: P.filter((x) => x.type !== 'event' || x.kind !== 'player-attack').map((x) => ({ ...x, t: Math.round(x.t - t0) })) };
  }, FRAME);
}

const lcd = (page) => page.locator('.bha-lcd');
async function openTest(page, tab) {
  for (let i = 0; i < 4 && (await page.locator('.bha-lcd [data-dev-layer]').count()); i++) await page.keyboard.press('Escape');
  await lcd(page).getByRole('button', { name: '더보기' }).click();
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
    const groups = [];
    let inGroup = false;
    let k = 0;
    for (const n of box.children) {
      if (n.classList.contains('bha-pick__group')) { groups.push(n.textContent); inGroup = n.textContent === group; continue; }
      if (inGroup && n.getAttribute('role') === 'option') { if (k++ === nth) { n.click(); return true; } }
    }
    return groups.join(',');
  }, { group, nth });
  await page.waitForTimeout(300);
  return ok;
}
/** ③ 일반 전투 (GDD 224장 3): 테스트 모드 '바로 전투' 강적 — 강공격(못 막음·막음)과 블록 1·2·3체인 */
async function normalBattle(page, fi) {
  await newGame(page, URL, fi);
  await openTest(page, '바로 전투');
  const picked = await pick(page, '상대', '강적', 0);
  if (picked !== true) throw new Error(`강적 못 고름: ${picked}`);
  await lcd(page).getByRole('button', { name: '전투 시작' }).click();
  await page.locator('.bha-battle').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  for (let i = 0; i < 3 && (await page.locator('.bha-tut').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
  await page.evaluate(() => {
    const s = window.__bhaCombat;
    s.enemy.maxHp *= 50; s.enemy.hp = s.enemy.maxHp; s.player.maxHp *= 50; s.player.hp = s.player.maxHp;
    window.__bhaProbe.length = 0;
    const log = (window.__bhaFrames = []);
    const ticks = (window.__bhaRaf = []);
    const f = (ts) => { ticks.push(ts); log.push({ t: performance.now(), tick: s.tick, php: s.player.hp, ehp: s.enemy.hp }); if (s.status === 'playing') requestAnimationFrame(f); };
    requestAnimationFrame(f);
  });
  // 블록 1·2·3체인: 바의 첫 공격 블록을 n 개 같은 것으로 채우고 첫 칸을 누른다
  await page.waitForFunction(() => (window.__bhaCombat.tray ?? []).some((b) => b.kind === 'skill' && b.family), null, { timeout: 30_000 });
  const fams = await page.evaluate(() => Object.keys(window.__bhaCombat.params.families));
  for (const fam of fams) for (const n of [1, 2, 3]) {
    await page.waitForTimeout(500);
    await page.evaluate(({ n, fam }) => {
      const s = window.__bhaCombat;
      const b = s.tray.find((x) => x.kind === 'skill' && x.family) ?? window.__bhaBlock;
      window.__bhaBlock = b;
      s.tray.length = 0;
      for (let i = 0; i < n; i++) s.tray.push({ ...b, family: fam, uid: s.nextUid++ });
    }, { n, fam });
    await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('[data-sc="block.1"]')?.dispatchEvent(new Event('bha-press')));
    await page.waitForTimeout(1800);
  }
  // 강공격: 한 번은 그냥 맞고, 한 번은 막는다(막기 게이지를 채워 두고 예고 때 막기)
  for (const guard of [false, true]) {
    const t0 = Date.now();
    let cast = false;
    while (Date.now() - t0 < 25_000) {
      const st = await page.evaluate(() => { const s = window.__bhaCombat; return { cast: !!s.enemy.cast, ticks: s.enemy.cast?.ticks ?? 0 }; });
      if (st.cast && !cast) {
        cast = true;
        if (guard) {
          await page.evaluate(() => { const s = window.__bhaCombat; s.guardGauge = 1; s.guardFilled = true; });
          await page.waitForFunction(() => (window.__bhaCombat.enemy.cast?.ticks ?? 0) <= 3, null, { timeout: 10_000 }).catch(() => {});
          await page.locator('[data-sc="guard"]').first().click({ force: true }).catch(() => {});
        }
      }
      if (cast && !st.cast) break;
      await page.waitForTimeout(20);
    }
    await page.waitForTimeout(1500);
  }
}
/** 캡처용: 화면 프레임 멈추기 (rAF 를 붙잡고 모든 애니메이션 일시정지) — 페이지 스크립트보다 먼저 */
const FREEZE_INIT = () => {
  const raf = window.requestAnimationFrame.bind(window);
  const q = [];
  let paused = [];
  window.requestAnimationFrame = (cb) => (window.__frozen ? (q.push(cb), 0) : raf(cb));
  window.__freeze = () => {
    if (window.__frozen) return;
    window.__frozen = true;
    paused = document.getAnimations().filter((a) => a.playState === 'running');
    paused.forEach((a) => a.pause());
  };
  window.__unfreeze = () => {
    window.__frozen = false;
    paused.forEach((a) => a.play());
    paused = [];
    q.splice(0).forEach((cb) => raf(cb));
  };
};
/** 다음 '피해 사건 → 피해 숫자'가 뜨는 그 프레임에서 멈추게 무장 (kind: heavy-hit·block·script-impact, guarded: 막은 것만/안 막은 것만) */
const armFreeze = (page, want) => page.evaluate((want) => {
  const P = window.__bhaProbe;
  if (!P.__wrapped) {
    const orig = P.push.bind(P);
    P.push = (...xs) => {
      const r = orig(...xs);
      for (const x of xs) {
        const w = window.__freezeWant;
        if (!w) continue;
        if (x.type === 'event' && x.kind === w.kind && (w.guarded === undefined || (w.guarded ? x.damage === 0 : x.damage > 0)) && (x.kind !== 'block' || (x.damage > 0 && (x.landed || !w.landed)))) window.__freezeArmed = true;
        else if (x.type === 'float' && window.__freezeArmed && x.kind !== 'chain') { window.__freezeArmed = false; window.__freezeWant = null; window.__freezeAt = x.t; window.__freeze(); }
      }
      return r;
    };
    P.__wrapped = true;
  }
  window.__freezeWant = want;
  window.__freezeArmed = false;
  window.__freezeAt = null;
}, want);
/** 멈추면 찍고 다시 흐르게 */
async function shotFrozen(page, name, ms = 40_000) {
  await page.waitForFunction(() => !!window.__frozen, null, { timeout: ms });
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  const info = await page.evaluate(() => { const s = window.__bhaCombat; return { stage: s.script?.stage ?? null, php: Math.round(s.player.hp), ehp: Math.round(s.enemy.hp), at: Math.round(window.__freezeAt) }; });
  await page.evaluate(() => window.__unfreeze());
  return info;
}
/** 캡처 실행 (CAPTURE=1): 자동 공격 카드 두 종족(+폰), 강공격 맞는 순간·블록 타격 순간·마무리 체인 착탄 프레임 — 8장 */
async function captures(browser, proof) {
  const plan = [
    { tag: 'pc', opt: PC, fi: 0, card: 'pc-hollow-auto-card', frames: [['heavy-hit', false, 'pc-hollow-heavy-hit'], ['script-impact', undefined, 'pc-hollow-chain3-hit']] },
    { tag: 'pc', opt: PC, fi: 1, card: 'pc-shinigami-auto-card', frames: [['block', undefined, 'pc-shinigami-block1-hit']] },
    { tag: 'ph', opt: PH, fi: 0, card: 'ph-hollow-auto-card', frames: [] },
    { tag: 'ph', opt: PH, fi: 1, card: null, frames: [['heavy-hit', true, 'ph-shinigami-heavy-guard'], ['block', undefined, 'ph-shinigami-block1-hit']] },
  ];
  for (const c of plan) {
    const ctx = await browser.newContext(c.opt);
    await ctx.addInitScript(FREEZE_INIT);
    const page = await ctx.newPage();
    try {
      await newGame(page, URL, c.fi);
      await openDemo(page);
      const frames = [...c.frames];
      const got = [];
      let armed = null;
      const arm = async () => {
        const f = frames.shift();
        armed = f ?? null;
        if (f) await armFreeze(page, { kind: f[0], guarded: f[1], landed: true });
      };
      await arm();
      // 진행하면서 멈춘 프레임을 찍는다 (각본 진행은 playDemo 와 같은 규칙)
      const t0 = Date.now();
      let carded = false;
      while (Date.now() - t0 < 90_000) {
        if (armed && (await page.evaluate(() => !!window.__frozen))) {
          const info = await shotFrozen(page, armed[2]);
          got.push({ name: armed[2], ...info });
          await arm();
          continue;
        }
        const L = await look(page);
        if (L.status && L.status !== 'playing') break;
        if (L.card && L.stage === 'auto-intro' && c.card && !carded) { carded = true; await page.waitForTimeout(500); await page.screenshot({ path: path.join(OUT, `${c.card}.png`) }); got.push({ name: c.card }); }
        if (L.card && L.hasNext) { await page.evaluate(() => { const card = document.querySelector('.bha-tut'); const b = [...card.querySelectorAll('button')].find((x) => /다음|확인|✓/.test(x.textContent || '') || /다음/.test(x.getAttribute('aria-label') || '')); b?.click(); }); await page.waitForTimeout(250); continue; }
        if (L.stage === 'guard-now') { await page.locator('[data-sc="guard"]').first().click({ timeout: 2000, force: true }).catch(() => {}); await page.waitForTimeout(250); continue; }
        if (L.stage === 'hurt' || L.stage === 'chain-use') { await page.evaluate(() => document.querySelector('[data-sc="block.1"]')?.dispatchEvent(new Event('bha-press'))); await page.waitForTimeout(250); continue; }
        if (!armed && carded !== false && !frames.length && (c.card ? carded : true)) break;
        await page.waitForTimeout(25);
      }
      (proof.captures ??= []).push({ tag: c.tag, faction: c.fi === 0 ? 'hollow' : 'shinigami', shots: got });
      console.log('capture', c.tag, c.fi, JSON.stringify(got));
    } catch (e) { proof.errors.push(`capture ${c.tag}${c.fi}: ${e.message}`); console.log('ERR', e.message); }
    await ctx.close();
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const proof = { url: URL, before: process.env.BEFORE === '1', runs: [], errors: [] };
  const browser = await chromium.launch();
  for (const [tag, ctxOpt] of [['pc', PC], ['ph', PH]].filter(([t]) => !process.env.ONLY || process.env.ONLY === t)) {
    for (const fi of [0, 1].filter((x) => !process.env.FI || String(x) === process.env.FI)) {
      if (process.env.SKIP_TUT) continue;
      const ctx = await browser.newContext(ctxOpt);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`${tag}${fi}: ${e.message}`));
      if (process.env.DBG) page.on('console', (m) => { if (m.text().startsWith('DBG')) console.log(m.text()); });
      try {
        await newGame(page, URL, fi);
        await openDemo(page);
        const delay = await page.evaluate(() => window.__bhaCombat.params.hitDelay);
        if (process.env.DBG) console.log(JSON.stringify(delay));
        const seen = await playDemo(page, tag, {});
        const { rows, timeline, frameMs } = await analyze(page);
        console.log('frameMs', frameMs);
        proof.runs.push({ tag, faction: fi === 0 ? 'hollow' : 'shinigami', hitDelay: delay, renderedFrameMs: frameMs, cards: seen, hits: rows, timeline });
        console.log(tag, fi, JSON.stringify(seen));
        for (const r of rows) console.log(' ', r.ok ? 'OK ' : 'BAD', r.kind, r.stage, r.floatText, 'react', r.vsTargetReactFrames, 'swing', r.vsAttackerHitFrameFrames, 'start→dmg', r.motionStartToDamageMs);
      } catch (e) { proof.errors.push(`${tag}${fi}: ${e.message}`); console.log('ERR', e.message); await page.screenshot({ path: `${SC}/err-${tag}${fi}.png` }); }
      await ctx.close();
    }
  }
  if (process.env.CAPTURE) await captures(browser, proof);
  // ③ 일반 전투
  for (const [tag, ctxOpt] of [['pc', PC], ['ph', PH]].filter(([t]) => !process.env.ONLY || process.env.ONLY === t)) {
    for (const fi of [0, 1].filter((x) => !process.env.FI || String(x) === process.env.FI)) {
      if (process.env.SKIP_NORMAL) continue;
      const ctx = await browser.newContext(ctxOpt);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`normal ${tag}${fi}: ${e.message}`));
      try {
        await normalBattle(page, fi);
        const delay = await page.evaluate(() => window.__bhaCombat.params.hitDelay);
        const { rows, timeline, frameMs } = await analyze(page);
        (proof.normal ??= []).push({ tag, faction: fi === 0 ? 'hollow' : 'shinigami', hitDelay: delay, renderedFrameMs: frameMs, hits: rows, timeline });
        console.log('normal', tag, fi, 'frameMs', frameMs);
        for (const r of rows) console.log(' ', r.ok ? 'OK ' : 'BAD', r.kind, r.family ?? '', r.chain ?? '', r.damage, r.floatText, 'react', r.vsTargetReactFrames, 'swing', r.vsAttackerHitFrameFrames, 'start→dmg', r.motionStartToDamageMs);
      } catch (e) { proof.errors.push(`normal ${tag}${fi}: ${e.message}`); console.log('ERR', e.message); await page.screenshot({ path: `${SC}/nerr-${tag}${fi}.png` }); }
      await ctx.close();
    }
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, process.env.BEFORE === '1' ? 'proof-before.json' : 'proof.json'), JSON.stringify(proof, null, 1));
})();
