// C.248 proof (GDD 169장): 새 게임부터 홈 안내 → 첫 모험 → 첫 전투 각본 카드 → 흡수 → 회복 안내 7장(온천·먹이) → 다음 할 일까지 돌며
// 튜토리얼 안내 창마다 대상(강조 구멍)과 창 사이 거리·쪽(아래/위/오른쪽/왼쪽)·가림 %·단계 사이 위↔아래 뒤집힘을 잰다.
// 실행: FACTION=shinigami|hollow OUT=<폴더> [SHOTS=1] node scripts/c248-proof.cjs  (C248_URL=<주소> 면 그 주소)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const FACTION = process.env.FACTION || 'shinigami';
const OUT = process.env.OUT || path.join(ROOT, 'docs/captures/c248');
const SHOTS = !!process.env.SHOTS;
const PORT = Number(process.env.PORT || 5348);

async function startServer() {
  if (process.env.C248_URL) return { url: process.env.C248_URL, stop: () => {} };
  const p = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe' });
  const url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) return { url, stop: () => p.kill() }; } catch { /* 아직 */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  p.kill();
  throw new Error('vite 서버가 뜨지 않았다');
}

async function newGame(page, url) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.goto(url);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '새로 시작' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-slot').first().click();
  await page.getByRole('button', { name: '확인' }).click();
  await page.waitForTimeout(300);
  await page.locator(`.bha-species__card[data-faction="${FACTION}"]`).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await page.waitForTimeout(1500);
}

const look = () => {
  const l = [...document.querySelectorAll('.bha-tut')].pop() ?? null;
  const sel = document.querySelector('.bha-sel');
  const next = l ? [...l.querySelectorAll('.bha-tut__actions button')].pop() : null;
  const only = l?.dataset.devOnly ?? null;
  const dlg = [...document.querySelectorAll('[data-dev-layer]')].filter((x) => !x.classList.contains('bha-tut')).pop() ?? null;
  const card = l?.querySelector('.bha-tut__card');
  return {
    name: l?.dataset.tutorial ?? null, step: l?.querySelector('.bha-tut__step')?.textContent ?? null, title: l?.querySelector('.bha-tut__title')?.textContent ?? null,
    next: next ? { text: next.textContent.trim(), disabled: next.disabled } : null, only, pass: !!l?.hasAttribute('data-dev-pass'),
    selInTut: !!sel?.closest('.bha-tut'), selOnly: !!(sel && only && sel.matches(only)), selSc: sel?.dataset.sc ?? null,
    dialog: dlg ? (dlg.textContent || '').slice(0, 40) : null, selUse: !!sel && (sel.textContent || '').trim() === '사용',
    screen: [...document.querySelectorAll('.bha-lcd .bha-app')].map((e) => e.className.replace('bha-app ', '')).join('|'),
    stage: l?.dataset.stage ?? null, body: l?.querySelector('.bha-tut__body')?.textContent ?? null,
    vis: !!card && getComputedStyle(card).visibility === 'visible',
  };
};

/** 안내 창 기록기: 창이 0.3초 이상 제자리에 보이면 한 줄(대상·창 자리, 쪽, 거리, 가림 %) */
const recorder = () => {
  window.__rec = [];
  const box = (e) => e.getBoundingClientRect();
  const over = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  let cur = null;
  setInterval(() => {
    const t = [...document.querySelectorAll('.bha-tut')].pop();
    const card = t?.querySelector('.bha-tut__card');
    if (!card || card.getClientRects().length === 0 || getComputedStyle(card).visibility !== 'visible') { cur = null; return; }
    const c = box(card);
    const holeEl = t.querySelector('.bha-tut__hole:not(.is-none)');
    const h = holeEl && holeEl.getClientRects().length ? box(holeEl) : null;
    const key = `${t.dataset.tutorial}|${t.querySelector('.bha-tut__step')?.textContent}|${t.dataset.stage ?? ''}|${(t.querySelector('.bha-tut__body')?.textContent ?? '').slice(0, 14)}|${Math.round(c.left)},${Math.round(c.top)},${Math.round(c.width)}|${h ? [h.left, h.top, h.width, h.height].map(Math.round).join(',') : '-'}`;
    if (!cur || cur.key !== key) { cur = { key, since: Date.now(), done: false }; return; }
    if (cur.done || Date.now() - cur.since < 300) return;
    cur.done = true;
    let side = 'center';
    let dist = null;
    if (h) {
      const gx = Math.max(0, h.left - c.right, c.left - h.right);
      const gy = Math.max(0, h.top - c.bottom, c.top - h.bottom);
      dist = Math.round(Math.hypot(gx, gy));
      side = c.top >= h.bottom - 1 ? 'below' : c.bottom <= h.top + 1 ? 'above' : c.left >= h.right - 1 ? 'right' : c.right <= h.left + 1 ? 'left' : 'overlap';
    }
    const ch = [...document.querySelectorAll('.bha-char, .bha-spa__actor')].filter((w) => w.getClientRects().length).map((w) => { const r = box(w); return Math.round((100 * over(c, r)) / Math.max(1, r.width * r.height)); });
    const lcd = document.querySelector('.bha-lcd')?.getBoundingClientRect() ?? { left: 0, top: 0, width: innerWidth, height: innerHeight };
    const edge = Math.round(Math.min(c.top - lcd.top, lcd.top + lcd.height - c.bottom));
    window.__rec.push({
      name: t.dataset.tutorial, step: t.querySelector('.bha-tut__step')?.textContent ?? '', stage: t.dataset.stage ?? '', title: t.querySelector('.bha-tut__title')?.textContent ?? '',
      body: (t.querySelector('.bha-tut__body')?.textContent ?? '').slice(0, 24), screen: [...document.querySelectorAll('.bha-lcd .bha-app')].map((e) => [...e.classList].filter((c) => !c.startsWith('is-') && c !== 'bha-app').join(' ')).join('|'),
      card: [c.left, c.top, c.width, c.height].map(Math.round), hole: h ? [h.left, h.top, h.width, h.height].map(Math.round) : null,
      side, dist, holeCover: h ? Math.round((100 * over(c, h)) / Math.max(1, h.width * h.height)) : 0, charCover: ch.length ? Math.max(...ch) : 0, edge,
    });
  }, 100);
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { faction: FACTION, shots: [] };
  let page;
  const shotSet = new Set();
  const shot = async (name) => {
    if (!SHOTS || shotSet.has(name)) return;
    shotSet.add(name);
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    proof.shots.push(name);
  };
  /** 장면별로 찍을 것: (지금 상태) → 파일 이름 또는 null */
  const want = (st) => {
    if (!st.vis) return null;
    const pre = FACTION === 'hollow' ? 'h-' : '';
    if (st.name === 'home-intro') {
      const n = Number(st.step?.match(/(\d+) \//)?.[1] ?? 0);
      if (FACTION === 'hollow') return n === 3 ? 'h-home-3' : null;
      return n >= 2 && n <= 5 ? `0${n - 1}-home-${n}` : null;
    }
    if (st.name === 'script' && /2 \//.test(st.step ?? '')) return `${pre}05-battle-2`;
    if (st.name === 'recover' && /4 \//.test(st.step ?? '') && st.screen.includes('spa') && FACTION !== 'hollow') return '06-spa-4';
    if (st.name === 'recover' && /6 \//.test(st.step ?? '') && st.only && FACTION !== 'hollow') return '07-feed-6';
    return null;
  };
  try {
    page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
    const errors = [];
    proof.errors = errors;
    page.on('pageerror', (e) => errors.push(e.message));
    await newGame(page, server.url);
    await page.evaluate(recorder);
    const dev = (name) => page.locator(`.bha-dev__btn[aria-label="${name}"]`).first();
    let idle = 0;
    for (let t = 0; t < 1500; t++) {
      const st = await page.evaluate(look).catch(() => ({}));
      const w = want(st);
      if (w && !shotSet.has(w)) { await page.waitForTimeout(500); await shot(w); }
      if (st.name === 'first-run-room') { proof.reachedNext = true; await page.waitForTimeout(800); break; }
      if (await page.locator('.bha-battle').count() && st.name === 'script') {
        const acting = st.pass && st.only;
        if (acting && !(st.selSc === 'guard' || String(st.selSc).startsWith('block.'))) { await dev('아래').click(); await page.waitForTimeout(200); continue; }
        if (!st.vis) { await page.waitForTimeout(250); continue; }
        await page.waitForTimeout(500);
        await dev('확정').click();
        await page.waitForTimeout(acting ? 2600 : 400);
        continue;
      }
      if (st.name === 'recover') {
        const n = Number(st.step?.match(/(\d+) \//)?.[1] ?? 0);
        if (n === 4 && st.screen.includes('spa') && st.next?.disabled) { await page.waitForTimeout(150); continue; }
        let k;
        if (st.dialog) k = st.selUse ? '확정' : '아래';
        else if (st.next && !st.next.disabled) k = st.selInTut ? '확정' : '아래';
        else if (st.only) k = st.selOnly ? '확정' : '아래';
        else { await page.waitForTimeout(200); continue; }
        if (st.vis) await page.waitForTimeout(450);
        await dev(k).click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(n === 6 && st.only && k === '확정' ? 700 : 300);
        continue;
      }
      if (st.name && st.vis && st.next && !st.next.disabled) { await page.waitForTimeout(450); await dev(st.selInTut ? '확정' : '아래').click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(400); idle = 0; continue; }
      if (st.name && st.vis && st.only) { await page.waitForTimeout(450); await dev(st.selOnly ? '확정' : '아래').click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(500); continue; }
      if (++idle > 6) {
        const mode = page.locator('.bha-absorbpage button[data-mode]:not([disabled])').filter({ visible: true });
        if (await mode.count()) {
          await mode.first().click({ timeout: 2000 }).catch(() => {});
          await page.waitForTimeout(300);
          await mode.first().click({ timeout: 2000 }).catch(() => {});
          idle = 0;
          await page.waitForTimeout(500);
          continue;
        }
        const go = page.locator('.bha-lcd button.bha-btn--primary:not([disabled]), .bha-lcd button.bha-btn--lg:not([disabled])').filter({ visible: true });
        if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
        else if (st.screen?.includes('worldmap')) await page.locator('.bha-worldmap [data-place="adventure"]').click({ timeout: 2000 }).catch(() => {});
        idle = 0;
      }
      await page.waitForTimeout(300);
    }
    if (SHOTS) {
      // 먹이 결과(다음 할 일) 장면 1장 — 사신만
      if (FACTION !== 'hollow') await shot('08-first-run-room');
    }
  } finally {
    proof.rec = await page.evaluate(() => window.__rec).catch(() => null);
    // 단계 사이 위↔아래 뒤집힘: 같은 화면에서 연달아 뜬 창이 대상 아래 ↔ 위로 바뀐 횟수
    let flips = 0;
    let prev = null;
    for (const r of proof.rec ?? []) {
      if (prev && prev.screen === r.screen && ((prev.side === 'below' && r.side === 'above') || (prev.side === 'above' && r.side === 'below'))) { flips++; r.flip = true; }
      if (r.side !== 'center') prev = r;
    }
    proof.flips = flips;
    fs.writeFileSync(path.join(OUT, `proof-${FACTION}.json`), JSON.stringify(proof, null, 1));
    await browser.close();
    server.stop();
  }
  const rec = proof.rec ?? [];
  console.log(JSON.stringify({ faction: FACTION, n: rec.length, reachedNext: proof.reachedNext, flips: proof.flips, maxHole: Math.max(0, ...rec.map((r) => r.holeCover)), far: rec.filter((r) => r.dist !== null && r.dist > 40).length, shots: proof.shots, errors: proof.errors }));
})();
