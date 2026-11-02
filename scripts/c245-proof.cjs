// C.245 proof (C.235 proof 바탕, GDD 162장): 새 게임(호로) → 첫 모험 카드 → 각본 전투 카드 5장 → 흡수 카드 → 회복 안내 3 구급상자 → 4 온천 자동 이동 → '다음 할 일'.
// 캡처 docs/captures/c245/ (1배). 실행: node scripts/c245-proof.cjs (C245_URL=<주소> 면 그 주소)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const RECOVER_IDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/help/tutorial.json'), 'utf8')).recover.map((x) => x.id);
const OUT = process.env.OUT || path.join(ROOT, 'docs/captures/c245');
const PORT = 5345;

async function startServer() {
  if (process.env.C245_URL) return { url: process.env.C245_URL, stop: () => {} };
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


const timeline = () => {
  const r = (q) => { const e = [...document.querySelectorAll(q)].find((x) => x.getClientRects().length); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
  const tuts = [...document.querySelectorAll('.bha-tut')].map((t) => { const c = t.querySelector('.bha-tut__card'); return { n: t.dataset.tutorial, vis: c ? getComputedStyle(c).visibility : null, card: c && c.getClientRects().length ? r('.bha-tut[data-tutorial="' + t.dataset.tutorial + '"] .bha-tut__card') : null, step: t.querySelector('.bha-tut__step')?.textContent, body: t.querySelector('.bha-tut__body')?.textContent, hole: t.querySelector('.bha-tut__hole:not(.is-none)') ? r('.bha-tut[data-tutorial="' + t.dataset.tutorial + '"] .bha-tut__hole') : null }; });
  return { tuts, toast: [...document.querySelectorAll('.bha-toast')].map((x) => x.textContent.slice(0, 40)), actfx: !!document.querySelector('.bha-actfx'), tray: r('.bha-homedock__tray--food'), water: r('.bha-spa__water'), actor: r('.bha-spa__actor'), scene: r('.bha-spa__scene'), screen: [...document.querySelectorAll('.bha-lcd .bha-app')].map((e) => e.className.replace('bha-app ', '')).join('|'), hunger: document.querySelector('.bha-room__hp')?.textContent };
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
  const proof = { cards: [] };
  const shotSet = new Set();
  let page;
  const shot = async (name, st) => {
    if (shotSet.has(name)) return;
    shotSet.add(name);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    proof.cards.push({ shot: name, name: st?.name, step: st?.step, title: st?.title, body: st?.body, screen: st?.screen });
  };
  try {
    page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
    const errors = [];
    proof.errors = errors;
    page.on('pageerror', (e) => errors.push(e.message));
    await newGame(page, server.url, Number(process.env.FI ?? 1));
    proof.tl = [];
    // 모든 튜토리얼 카드: 카드가 강조 구멍·주인공(방·온천 캐릭터)을 가린 최대 비율 (카드가 보인 뒤 0.3초 지난 것만 — 들어오는 연출 제외)
    await page.evaluate(() => {
      window.__cov = {};
      const box = (e) => e.getBoundingClientRect();
      const over = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      const since = {};
      setInterval(() => {
        for (const t of document.querySelectorAll('.bha-tut')) {
          const card = t.querySelector('.bha-tut__card');
          if (!card || card.getClientRects().length === 0 || getComputedStyle(card).visibility !== 'visible') continue;
          const key = `${t.dataset.tutorial}|${t.querySelector('.bha-tut__step')?.textContent}|${t.dataset.stage ?? ''}|${(t.querySelector('.bha-tut__body')?.textContent ?? '').slice(0, 12)}`;
          since[key] = since[key] ?? Date.now();
          if (Date.now() - since[key] < 300) continue;
          const c = box(card);
          const hole = t.querySelector('.bha-tut__hole:not(.is-none)');
          const rs = [];
          if (hole && hole.getClientRects().length) rs.push(['hole', box(hole)]);
          for (const q of ['.bha-char', '.bha-spa__actor']) for (const w of document.querySelectorAll(q)) if (w.getClientRects().length) rs.push([q, box(w)]);
          const o = window.__cov[key] ?? (window.__cov[key] = {});
          for (const [w, r] of rs) { const a = r.width * r.height; if (a >= 4) o[w] = Math.max(o[w] ?? 0, Math.round((100 * over(c, r)) / a)); }
        }
      }, 120);
    });
    let lastTl = '';
    const t0 = Date.now();
    const dev = (name) => page.locator(`.bha-dev__btn[aria-label="${name}"]`).first();
    // 방 → 홈 안내 → 첫 모험 강제 → 첫 모험 카드
    for (let t = 0; t < 200 && !(await page.locator('.bha-battle').count()); t++) {
      const st = await page.evaluate(look).catch(() => ({}));
      if (st.name === 'first-run') { await page.waitForTimeout(500); await shot('01-first-run', await page.evaluate(look)); }
      const go = page.locator('.bha-lcd [data-dev-layer] button.bha-btn--primary:not([disabled])').filter({ visible: true });
      if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
      else if (st.only) await dev(st.selOnly ? '확정' : '아래').click();
      else if (st.dialog) await page.locator('.bha-lcd').first().click({ timeout: 2000 }).catch(() => {});
      else if (t > 8 && st.screen.includes('worldmap')) await page.locator('.bha-worldmap [data-place="adventure"]').click({ timeout: 2000 }).catch(() => {});
      else if (t > 8) await page.locator('.bha-prop--outside, .bha-prop--door').first().click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(500);
    }
    // 각본 전투 카드: 강공격 · 막기 성공 · 위기 · 좋아! · 체인
    const SCRIPT_SHOT = ['02-heavy', '03-guard-ok', '04-crisis', '05-nice', '06-chain'];
    let lastStep = null;
    for (let t = 0; t < 600; t++) {
      if (await page.locator('.bha-battle.is-tutkill').count()) break;
      const st = await page.evaluate(look).catch(() => ({}));
      if (st.name !== 'script') { await page.waitForTimeout(250); continue; }
      if (st.step !== lastStep) {
        lastStep = st.step;
        await page.waitForTimeout(700);
        const n = Number(st.step?.match(/(\d+) \//)?.[1] ?? 0);
        if (SCRIPT_SHOT[n - 1]) await shot(SCRIPT_SHOT[n - 1], await page.evaluate(look));
        (proof.heads = proof.heads ?? []).push(await page.evaluate(() => {
          const r = (q) => { const e = document.querySelector(q); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
          const c = document.querySelector('.bha-tut .bha-tut__card');
          const L = document.querySelector('.bha-tut');
          return { style: c?.getAttribute('style'), cls: c?.className, layer: L?.className, host: r('.bha-lcd'), parent: L?.parentElement?.className, tray: r('[data-help="battle.tray"]'), lib: r('[data-help="battle.liberation"]'), guard: r('[data-help="battle.guard"]'), gauge: r('.bha-unit--foe .bha-hgauge--cast'), heads: r('.bha-unit--foe .bha-unit__heads'), card: r('.bha-tut .bha-tut__card'), foe: r('.bha-unit--foe'), me: r('.bha-unit--me') };
        }));
        if (process.env.C245_QUICK) { console.log(JSON.stringify(proof.heads)); process.exit(0); }
        continue;
      }
      const acting = st.pass && st.only;
      if (acting && !(st.selSc === 'guard' || String(st.selSc).startsWith('block.'))) { await dev('아래').click(); await page.waitForTimeout(200); continue; }
      await dev('확정').click();
      await page.waitForTimeout(acting ? 2600 : 400);
    }
    // 흡수 → 치명상 → 회복 안내
    let idle = 0;
    for (let t = 0; t < 900; t++) {
      const st = await page.evaluate(look).catch(() => ({}));
      if (st.name === 'recover' || proof.inRec) {
        proof.inRec = true;
        const tl = await page.evaluate(timeline).catch(() => null);
        const k = JSON.stringify(tl);
        if (k !== lastTl) { lastTl = k; proof.tl.push({ ms: Date.now() - t0, ...tl }); }
        const vis = tl && tl.tuts.find((x) => x.n === 'recover' && x.vis === 'visible');
        const eat = tl && tl.tuts.find((x) => x.n === 'recover' && x.vis === 'hidden' && (x.step || '').includes('6 /'));
        if (eat && !shotSet.has('r-6-7-eating')) await shot('r-6-7-eating', await page.evaluate(look));
        if (vis) { const nm = 'r' + (vis.step || '').replace(/\D+/g, '-') + '-' + (await page.evaluate(() => [...document.querySelectorAll('.bha-tut')].pop()?.dataset.stage ?? '')) + '-' + (vis.body || '').slice(0, 6).replace(/[^가-힣a-z0-9]/g, ''); if (!shotSet.has(nm)) { await page.waitForTimeout(300); await shot(nm, await page.evaluate(look)); } }
      }
      if (st.name === 'first-run-room') { proof.reachedNext = true; await page.waitForTimeout(800); await shot('10-first-run-room', st); proof.cards.push({ name: st.name, title: st.title, body: st.body }); break; }
      if (st.name === 'first-absorb' && !proof.absorb2) {
        if (!shotSet.has('07-absorb')) { await page.waitForTimeout(600); await shot('07-absorb', await page.evaluate(look)); }
        else if (st.body && !st.body.includes('둘 다')) { proof.absorb2 = true; proof.cards.push({ name: st.name, step: st.step, title: st.title, body: st.body }); }
      }
      if (st.name === 'recover') {
        const n = Number(st.step?.match(/(\d+) \//)?.[1] ?? 0);
        const key = `${n}#${st.body}`;
        if (!proof.cards.some((c) => c.key === key)) proof.cards.push({ key, name: st.name, step: st.step, title: st.title, body: st.body, screen: st.screen });
        if (n === 3 && st.only && !shotSet.has('08-recover3-cure')) { await page.waitForTimeout(600); await shot('08-recover3-cure', await page.evaluate(look)); }
        if (n === 4 && st.screen.includes('spa') && st.body === '체력이 차오른다.' && !shotSet.has('09-recover4-spa')) {
          // 들어가는 연출이 끝나 카드가 뜬 뒤 (GDD 143장 1)
          for (let w = 0; w < 40; w++) {
            const vis = await page.evaluate(() => { const c = [...document.querySelectorAll('.bha-tut')].pop()?.querySelector('.bha-tut__card'); return !!c && getComputedStyle(c).visibility === 'visible'; });
            if (vis) break;
            await page.waitForTimeout(200);
          }
          await page.waitForTimeout(400);
          await shot('09-recover4-spa', await page.evaluate(look));
        }
        if (n === 4 && st.screen.includes('spa') && st.next?.disabled) { await page.waitForTimeout(150); continue; }
        let k;
        if (st.dialog) k = st.selUse ? '확정' : '아래';
        else if (st.next && !st.next.disabled) k = st.selInTut ? '확정' : '아래';
        else if (st.only) k = st.selOnly ? '확정' : '아래';
        else { await page.waitForTimeout(200); continue; }
        idle = 0;
        if (n === 4 && !st.screen.includes('spa') && k === '확정') proof.spaFrom = { screen: st.screen, at: Date.now() };
        await dev(k).click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(n === 6 && st.only && k === '확정' ? 700 : 300); // 먹이: 한 번 누르고 연출을 기다린다(연달아 먹이지 않게)
        continue;
      }
      if (proof.spaFrom && !proof.spaArrive && st.screen?.includes('spa')) proof.spaArrive = { ms: Date.now() - proof.spaFrom.at };
      if (st.name && st.next && !st.next.disabled) { await dev(st.selInTut ? '확정' : '아래').click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(400); idle = 0; continue; }
      if (++idle > 6) {
        // C.244 흡수 갈래 화면: 같은 갈래 버튼을 두 번 누르면 실행
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
        idle = 0;
      }
      await page.waitForTimeout(300);
    }
  } finally {
    proof.cov = await page.evaluate(() => window.__cov).catch(() => null);
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 1));
    await browser.close();
    server.stop();
  }
  console.log(JSON.stringify({ shots: [...shotSet], reachedNext: proof.reachedNext, errors: proof.errors }, null, 1));
})();
