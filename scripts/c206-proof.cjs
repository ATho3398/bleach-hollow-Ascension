// C.206 (GDD 129-2) proof: ① 각본 전투 블록·막기 = 카드 닫힘 → 약 0.5초 → 모션·피해 ② 회복 안내 = 행동 버튼 없이 원래 조작(기기 버튼만), 하기 전 [다음] 잠김.
// 새 게임 → 첫 원정(튜토리얼) → 전투·회복 안내 모두 기기 ▲▼✓ 만. 캡처 docs/captures/c206/
// 실행: node scripts/c206-proof.cjs (vite 를 띄운다, C206_URL=<주소> 면 그 주소). C206_FACTION=0|1 (없으면 둘 다)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c206');
const PORT = 5306;
const RECOVER_SHOTS = { hollow: { cure: 'h-2-cure-bag', 'to-spa': 'h-3-spa-way', feed: 'h-4-feed' }, shinigami: { 'to-spa': 's-3-spa-way' } };

async function startServer() {
  if (process.env.C206_URL) return { url: process.env.C206_URL, stop: () => {} };
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
    hp: document.querySelector('.bha-room__hp')?.textContent ?? null, foe: document.querySelector('.bha-unit--foe')?.textContent?.match(/\d+\s*\/\s*\d+/)?.[0] ?? null,
  };
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { runs: [] };
  try {
    for (const [fi, faction] of process.env.C206_FACTION ? [[Number(process.env.C206_FACTION), ['hollow', 'shinigami'][Number(process.env.C206_FACTION)]]] : [[0, 'hollow'], [1, 'shinigami']]) {
      const p = faction === 'hollow' ? 'h' : 's';
      const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await newGame(page, server.url, fi);
      const dev = (name) => page.locator(`.bha-dev__btn[aria-label="${name}"]`).first();
      const run = { faction, battle: [], recover: [], errors };
      // 방 → 첫 원정 (안내 카드 [다음] · 밖으로 → 모험)
      for (let t = 0; t < 120 && !(await page.locator('.bha-battle').count()); t++) {
        if (process.env.C206_DEBUG) console.log('pre', t, JSON.stringify(await page.evaluate(look)));
        const go = page.locator('.bha-lcd [data-dev-layer] button.bha-btn--primary:not([disabled])').filter({ visible: true });
        if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
        else if (await page.locator('.bha-worldmap [data-place="adventure"]').count()) await page.locator('.bha-worldmap [data-place="adventure"]').click({ timeout: 2000 }).catch(() => {});
        else await page.locator('.bha-prop--outside, .bha-prop--door').first().click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(600);
      }
      // ① 각본 전투: 기기 버튼만. 행동 카드(막기·블록)에서 ✓ 를 누른 뒤 50ms 마다 카드·적 체력을 잰다
      let lastStep = null;
      for (let t = 0; t < 500; t++) {
        if (await page.locator('.bha-battle.is-tutkill').count()) break;
        const st = await page.evaluate(look);
        if (process.env.C206_DEBUG && t % 10 === 0) console.log('battle', t, JSON.stringify(st));
        if (st.name !== 'script') { await page.waitForTimeout(250); continue; }
        if (st.step !== lastStep) { lastStep = st.step; await page.waitForTimeout(300); continue; }
        const acting = st.pass && st.only;
        if (acting && !(st.selSc === 'guard' || String(st.selSc).startsWith('block.'))) { await dev('아래').click(); await page.waitForTimeout(200); continue; }
        await dev('확정').click();
        if (acting) {
          const t0 = Date.now();
          const foe0 = st.foe;
          const trace = { step: st.step, title: st.title, cardGoneMs: null, foeChangeMs: null, foe0 };
          let shot = false;
          while (Date.now() - t0 < 2500) {
            const x = await page.evaluate(look);
            const ms = Date.now() - t0;
            if (trace.cardGoneMs === null && x.name !== 'script') trace.cardGoneMs = ms;
            if (trace.foeChangeMs === null && x.foe !== foe0) trace.foeChangeMs = ms;
            if (!shot && p === 'h' && /블록/.test(st.title ?? '') && trace.cardGoneMs !== null && ms > 200) { shot = true; await page.screenshot({ path: path.join(OUT, 'h-1-block-gap.png') }); }
            if (trace.foeChangeMs !== null && trace.cardGoneMs !== null) break;
            await page.waitForTimeout(40);
          }
          run.battle.push(trace);
        }
        await page.waitForTimeout(400);
      }
      // 흡수 화면 등 (각본 밖): 주 버튼으로 넘긴다 → 방 회복 안내
      let lastR = null;
      let idle = 0;
      for (let t = 0; t < 500; t++) {
        const st = await page.evaluate(look);
        if (process.env.C206_DEBUG) console.log('recover', t, JSON.stringify(st));
        if (st.name === 'first-run-room') { run.reachedNext = true; break; }
        if (st.name !== 'recover') {
          if (st.name && st.next && !st.next.disabled) { await dev(st.selInTut ? '확정' : '아래').click(); await page.waitForTimeout(400); continue; } // 다른 안내 카드(첫 포식 등)
          if (st.dialog && st.selUse) { await dev('확정').click(); await page.waitForTimeout(400); continue; }
          if (++idle > 6 && !run.recover.length) {
            const go = page.locator('.bha-lcd button.bha-btn--primary:not([disabled]), .bha-lcd button.bha-btn--lg:not([disabled])').filter({ visible: true });
            if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
            idle = 0;
          }
          await page.waitForTimeout(400);
          continue;
        }
        idle = 0;
        if (st.step !== lastR) {
          lastR = st.step;
          run.recover.push({ step: st.step, title: st.title, nextLockedAtStart: st.next?.disabled ?? null, screen: st.screen, hp: st.hp, presses: [] });
          await page.waitForTimeout(500);
          const id = ['dying', 'to-bag', 'cure', 'potion', 'merchant', 'to-spa', 'spa-rest', 'feed', 'done'][Number(st.step.match(/(\d+) \//)?.[1] ?? 0) - 1];
          run.recover[run.recover.length - 1].id = id;
          continue;
        }
        const cur = run.recover[run.recover.length - 1];
        const shotName = RECOVER_SHOTS[faction]?.[cur.id];
        if (shotName && st.selOnly && !cur.shot && (cur.id !== 'to-spa' || st.screen.includes('worldmap'))) { cur.shot = true; await page.screenshot({ path: path.join(OUT, `${shotName}.png`) }); }
        // 하기 전 [다음] 을 눌러도 안 넘어가는지 (터치로 한 번)
        if (st.next?.disabled && !cur.triedLocked) {
          cur.triedLocked = true;
          await page.locator('.bha-tut[data-tutorial="recover"] .bha-tut__actions button').last().click({ force: true, timeout: 1000 }).catch(() => {});
          await page.waitForTimeout(300);
          cur.lockedHeld = (await page.evaluate(look)).step === st.step;
          continue;
        }
        let key;
        if (st.dialog) key = st.selUse ? '확정' : '아래';
        else if (st.next && !st.next.disabled) key = st.selInTut ? '확정' : '아래';
        else if (st.only) key = st.selOnly ? '확정' : '아래';
        else { await page.waitForTimeout(300); continue; }
        cur.presses.push(key === '확정' ? `✓(${st.sel})` : '▼');
        if (cur.presses.length > 40) throw new Error(`회복 안내 ${cur.id} 에서 막힘: ${JSON.stringify(st)}`);
        await dev(key).click();
        await page.waitForTimeout(450);
        cur.after = (await page.evaluate(look)).screen;
      }
      run.home = await page.evaluate(look);
      proof.runs.push(run);
      await page.close();
      console.log(faction, JSON.stringify(run.battle), run.recover.map((r) => `${r.id}:${r.nextLockedAtStart ? 'lock' : 'open'}${r.lockedHeld === false ? '!FAIL' : ''}:${r.presses.join('')}`).join(' | '), 'next', !!run.reachedNext, 'hp', run.home.hp, errors);
    }
  } finally {
    await browser.close();
    server.stop();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
  process.exit(0); // npx vite 자식이 남아 끝나지 않는 것 방지
})();
