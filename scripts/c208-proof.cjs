// C.208 (GDD 132장) proof: ① 회복 안내 카드가 누를 때마다 다음 대상으로(단계·문구·자리·기기 초점) — 카드가 대상·열린 창을 가리지 않는지 매 걸음 잰다
// ② 월드맵 캐릭터·초점 = 있던 곳 ③ 아이템·먹이 1초 / 튜토리얼 온천 3초 차오름 뒤 [다음] ④ 온천 계단식 입수.
// 새 게임 → 홈 안내 → 첫 원정 → 회복 안내(기기 ▲▼✓ 만) → 월드맵. 캡처 docs/captures/c208/
// 실행: node scripts/c208-proof.cjs (C208_URL=<주소> 면 그 주소, C208_FACTION=0|1 기본 0)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c208');
const PORT = 5308;

async function startServer() {
  if (process.env.C208_URL) return { url: process.env.C208_URL, stop: () => {} };
  const p = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe' });
  const url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) return { url, stop: () => p.kill() }; } catch { /* 아직 */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  p.kill();
  throw new Error('vite 서버가 뜨지 않았다');
}

async function newGame(page, url, fi) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.goto(url);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '새로 시작' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-slot').first().click();
  await page.getByRole('button', { name: '확인' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-species__card').nth(fi).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await page.waitForTimeout(1500);
}

/** 떠 있는 튜토리얼 카드·기기 선택 상태 */
const look = () => {
  const l = [...document.querySelectorAll('.bha-tut')].pop() ?? null;
  const sel = document.querySelector('.bha-sel');
  const next = l ? [...l.querySelectorAll('.bha-tut__actions button')].pop() : null;
  const only = l?.dataset.devOnly ?? null;
  const dlg = [...document.querySelectorAll('[data-dev-layer]')].filter((x) => !x.classList.contains('bha-tut')).pop() ?? null;
  return {
    name: l?.dataset.tutorial ?? null, step: l?.querySelector('.bha-tut__step')?.textContent ?? null, title: l?.querySelector('.bha-tut__title')?.textContent ?? null,
    next: next ? { text: next.textContent.trim(), disabled: next.disabled } : null, only, pass: !!l?.hasAttribute('data-dev-pass'),
    sel: sel ? (sel.getAttribute('aria-label') || sel.textContent || '').trim().slice(0, 20) : null, selInTut: !!sel?.closest('.bha-tut'), selOnly: !!(sel && only && sel.matches(only)),
    selSc: sel?.dataset.sc ?? null, dialog: dlg ? (dlg.textContent || '').slice(0, 40) : null, selUse: !!sel && (sel.textContent || '').trim() === '사용',
    screen: [...document.querySelectorAll('.bha-lcd .bha-app')].map((e) => e.className.replace('bha-app ', '')).join('|'),
    stage: l?.dataset.stage ?? null, body: l?.querySelector('.bha-tut__body')?.textContent ?? null,
    actor: document.querySelector('.bha-spa__actor')?.className ?? null, actfx: !!document.querySelector('.bha-actfx'),
    spaHp: document.querySelector('.bha-spa__status')?.getAttribute('aria-label') ?? null,
    hp: document.querySelector('.bha-room__hp')?.textContent ?? null, foe: document.querySelector('.bha-unit--foe')?.textContent?.match(/\d+\s*\/\s*\d+/)?.[0] ?? null,
  };
};

/** 카드가 강조 대상·열린 창을 가리는 비율 (ui-audit tutCoverInPage 와 같은 잣대: 15% 넘으면 문제) */
const cover = () => {
  const out = [];
  const box = (e) => e.getBoundingClientRect();
  const over = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  for (const t of document.querySelectorAll('.bha-tut')) {
    const card = t.querySelector('.bha-tut__card');
    if (!card || card.getClientRects().length === 0) continue;
    const c = box(card);
    const hole = t.querySelector('.bha-tut__hole:not(.is-none)');
    const targets = hole && hole.getClientRects().length ? [['hole', box(hole)]] : [];
    for (const sel of ['.bha-itemdialog .bha-itemmodal', '.bha-homedock__tray--food', '.bha-actfx']) for (const w of document.querySelectorAll(sel)) if (w.getClientRects().length) targets.push([sel, box(w)]);
    for (const [what, r] of targets) {
      const area = r.width * r.height;
      if (area >= 4) out.push({ what, pct: Math.round((100 * over(c, r)) / area) });
    }
  }
  return out;
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { runs: [] };
  const fi = Number(process.env.C208_FACTION ?? 0);
  const faction = ['hollow', 'shinigami'][fi];
  const p = faction[0];
  const shot = async (page, name) => page.screenshot({ path: path.join(OUT, `${p}-${name}.png`) });
  try {
    const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await newGame(page, server.url, fi);
    const dev = (name) => page.locator(`.bha-dev__btn[aria-label="${name}"]`).first();
    const run = { faction, homeIntro: [], recover: [], covers: [], timing: {}, worldmap: {}, errors };
    // 방 → 홈 안내 → 첫 모험 강제(밖으로 → 모험): 단계가 바뀌면 기록
    for (let t = 0; t < 160 && !(await page.locator('.bha-battle').count()); t++) {
      const st = await page.evaluate(look);
      if (process.env.C208_DEBUG) console.log('pre', t, JSON.stringify(st));
      if (st.name === 'home-intro') {
        const key = `${st.step}#${st.stage}`;
        if (!run.homeIntro.some((x) => x.key === key)) run.homeIntro.push({ key, body: st.body, only: st.only, sel: st.sel, screen: st.screen, cover: await page.evaluate(cover) });
        if (st.screen.includes('worldmap') && !run.worldmap.forced) {
          run.worldmap.forced = await page.evaluate(() => ({ at: document.querySelector('.bha-worldmap__char')?.dataset.at, sel: document.querySelector('.bha-sel')?.dataset.place ?? null }));
        }
      }
      const go = page.locator('.bha-lcd [data-dev-layer] button.bha-btn--primary:not([disabled])').filter({ visible: true });
      if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
      else if (st.only) await dev(st.selOnly ? '확정' : '아래').click();
      else if (st.dialog) await page.locator('.bha-lcd').first().click({ timeout: 2000 }).catch(() => {}); // 탄생 연출 건너뛰기
      else if (t > 8 && st.screen.includes('worldmap')) await page.locator('.bha-worldmap [data-place="adventure"]').click({ timeout: 2000 }).catch(() => {});
      else if (t > 8) await page.locator('.bha-prop--outside, .bha-prop--door').first().click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(500);
    }
    // 각본 전투: 기기 버튼만 (c206 과 같은 흐름)
    let lastStep = null;
    for (let t = 0; t < 500; t++) {
      if (await page.locator('.bha-battle.is-tutkill').count()) break;
      const st = await page.evaluate(look);
      if (st.name !== 'script') { await page.waitForTimeout(250); continue; }
      if (st.step !== lastStep) { lastStep = st.step; run.covers.push({ where: `battle ${st.step}`, cover: await page.evaluate(cover) }); await page.waitForTimeout(300); continue; }
      const acting = st.pass && st.only;
      if (acting && !(st.selSc === 'guard' || String(st.selSc).startsWith('block.'))) { await dev('아래').click(); await page.waitForTimeout(200); continue; }
      await dev('확정').click();
      await page.waitForTimeout(acting ? 2600 : 400);
    }
    // 회복 안내: 기기 버튼만. 걸음마다 단계·덮임을 재고, 행동 뒤 [다음]이 풀리는 시간을 잰다
    let lastKey = null;
    let idle = 0;
    let pressAt = 0;
    const shots = new Set();
    for (let t = 0; t < 700; t++) {
      const st = await page.evaluate(look);
      if (st.name === 'first-run-room') { run.reachedNext = true; break; }
      if (st.name !== 'recover') {
        if (st.name && st.next && !st.next.disabled) { await dev(st.selInTut ? '확정' : '아래').click(); await page.waitForTimeout(400); continue; }
        if (st.dialog && st.selUse) { await dev('확정').click(); await page.waitForTimeout(400); continue; }
        if (++idle > 6 && !run.recover.length) {
          const go = page.locator('.bha-lcd button.bha-btn--primary:not([disabled]), .bha-lcd button.bha-btn--lg:not([disabled])').filter({ visible: true });
          if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
          idle = 0;
        }
        await page.waitForTimeout(300);
        continue;
      }
      idle = 0;
      const id = ['dying', 'to-bag', 'cure', 'potion', 'merchant', 'to-spa', 'spa-rest', 'feed', 'done'][Number(st.step.match(/(\d+) \//)?.[1] ?? 0) - 1];
      const key = `${id}#${st.stage}#${st.screen}#${!!st.dialog}`;
      if (key !== lastKey) {
        lastKey = key;
        await page.waitForTimeout(400); // 카드가 새 자리에 놓인 뒤 잰다
        run.recover.push({ id, stage: st.stage, screen: st.screen, dialog: !!st.dialog, body: st.body, only: st.only, sel: st.sel, nextLocked: st.next?.disabled ?? null, cover: await page.evaluate(cover) });
        await page.waitForTimeout(300);
      }
      // 캡처: 포션 [사용] 단계(상세 창 열림) · 먹이 목록 단계 · 온천 계단 중간 · 튜토리얼 온천 막대 차오르는 중
      if (id === 'potion' && st.dialog && !shots.has('potion')) { shots.add('potion'); await page.waitForTimeout(250); await shot(page, '1-potion-use'); }
      if (id === 'feed' && st.stage === '1' && !shots.has('feed')) { shots.add('feed'); await page.waitForTimeout(250); await shot(page, '3-feed-list'); }
      if (id === 'to-spa' && st.screen.includes('spa')) {
        if (!shots.has('stairs') && /is-wading/.test(st.actor ?? '') && !/is-seated/.test(st.actor ?? '')) { shots.add('stairs'); await shot(page, '4-spa-stairs'); }
        if (!run.timing.spaEnter) run.timing.spaEnter = Date.now();
        if (/is-seated/.test(st.actor ?? '') && !run.timing.spaSeated) run.timing.spaSeated = Date.now();
        if (run.timing.spaSeated && !shots.has('fill') && Date.now() - run.timing.spaSeated > 1200) { shots.add('fill'); run.timing.spaHpMid = st.spaHp; await shot(page, '5-spa-fill'); }
        if (st.next && !st.next.disabled && !run.timing.spaUnlock) { run.timing.spaUnlock = Date.now(); run.timing.spaHpEnd = st.spaHp; }
      }
      if (pressAt && st.next && !st.next.disabled && !run.timing[`${id}Unlock`]) run.timing[`${id}Unlock`] = Date.now() - pressAt;
      if (id === 'potion' && st.actfx && !shots.has('potionfx')) { shots.add('potionfx'); await shot(page, '2-potion-fill'); }
      if (id === 'to-spa' && st.screen.includes('spa') && st.next?.disabled) { await page.waitForTimeout(150); continue; } // 쉬는 중: 지켜보기만
      let k;
      if (st.dialog) k = st.selUse ? '확정' : '아래';
      else if (st.next && !st.next.disabled) k = st.selInTut ? '확정' : '아래';
      else if (st.only) k = st.selOnly ? '확정' : '아래';
      else { await page.waitForTimeout(200); continue; }
      if (k === '확정') pressAt = st.dialog || (st.only && st.selOnly && st.next?.disabled) ? Date.now() : 0; // 행동 누름부터 [다음] 풀림까지
      await dev(k).click();
      await page.waitForTimeout(k === '확정' ? 150 : 350);
    }
    if (run.timing.spaUnlock) run.timing.spaUnlockAfterSeatMs = run.timing.spaUnlock - run.timing.spaSeated;
    // 첫 원정 뒤 안내를 닫고 → 밖으로 → 월드맵(홈에서) → 시장 → 뒤로 → 월드맵(시장에서)
    for (let t = 0; t < 20 && (await page.locator('.bha-tut').count()); t++) {
      const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled])').filter({ visible: true });
      if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(800);
    await page.locator('.bha-prop--outside').first().click();
    await page.waitForTimeout(900);
    const wmState = () => page.evaluate(() => ({ at: document.querySelector('.bha-worldmap__char')?.dataset.at, sel: document.querySelector('.bha-sel')?.dataset.place ?? document.querySelector('.bha-sel')?.textContent?.trim() ?? null }));
    run.worldmap.fromHome = await wmState();
    await shot(page, '6-worldmap-home');
    await page.locator('.bha-worldmap [data-place="market"]').click();
    await page.waitForTimeout(700);
    await page.locator('.bha-dev__btn--back').first().click();
    await page.waitForTimeout(900);
    run.worldmap.fromMarket = await wmState();
    await shot(page, '7-worldmap-market');
    proof.runs.push(run);
    console.log(JSON.stringify({ homeIntro: run.homeIntro.map((x) => `${x.key} ${JSON.stringify(x.cover)}`), recover: run.recover.map((r) => `${r.id}#${r.stage}${r.dialog ? '(창)' : ''} ${r.screen} ${JSON.stringify(r.cover)}`), timing: run.timing, worldmap: run.worldmap, reachedNext: run.reachedNext, errors }, null, 1));
    await page.close();
  } finally {
    await browser.close();
    server.stop();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
  process.exit(0);
})();
