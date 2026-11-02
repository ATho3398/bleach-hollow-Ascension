// C.211 (GDD 134장 1·2·3) proof: 새 게임(호로) → 첫 원정 → 흡수 직후 치명상 카드(비틀거림·체력 막대 깜빡) → 귀환 → 회복 안내 첫 카드 빈사 설명
// → 회복 안내 끝 → 가방 치료제 3개. 사신은 테스트 모드 [다음 진화]로 혼백 → 영술원 학생 진화 문구. 캡처 docs/captures/c211/ (1배)
// 실행: node scripts/c211-proof.cjs (C211_URL=<주소> 면 그 주소)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c211');
const PORT = 5311;

async function startServer() {
  if (process.env.C211_URL) return { url: process.env.C211_URL, stop: () => {} };
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
  const shot = async (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
  try {
    const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await newGame(page, server.url, 0);
    const dev = (name) => page.locator(`.bha-dev__btn[aria-label="${name}"]`).first();
    const run = { faction: 'hollow', homeIntro: [], wound: [], recover: [], worldmap: {}, errors };
    // 방 → 홈 안내 → 첫 모험 강제(밖으로 → 모험): 단계가 바뀌면 기록
    for (let t = 0; t < 160 && !(await page.locator('.bha-battle').count()); t++) {
      const st = await page.evaluate(look).catch(() => ({}));
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
      const st = await page.evaluate(look).catch(() => ({}));
      if (st.name !== 'script') { await page.waitForTimeout(250); continue; }
      if (st.step !== lastStep) { lastStep = st.step; await page.waitForTimeout(300); continue; }
      const acting = st.pass && st.only;
      if (acting && !(st.selSc === 'guard' || String(st.selSc).startsWith('block.'))) { await dev('아래').click(); await page.waitForTimeout(200); continue; }
      await dev('확정').click();
      await page.waitForTimeout(acting ? 2600 : 400);
    }
    // 전투 뒤: 흡수 → 치명상 카드 → 방 회복 안내. 기기 ✓ 위주
    const shots = new Set();
    let idle = 0;
    for (let t = 0; t < 700; t++) {
      const st = await page.evaluate(look).catch(() => ({}));
      if (st.name === 'first-run-room') { run.reachedNext = true; break; }
      if (st.name === 'wound') {
        if (!run.wound.some((w) => w.step === st.step)) {
          await page.waitForTimeout(1600); // 체력 막대가 다 떨어지고 깜빡이기 시작한 뒤
          const info = await page.evaluate(() => ({ hp: document.querySelector('.bha-wound__hp')?.getAttribute('aria-valuenow'), blink: !!document.querySelector('.bha-wound__hp.is-blink'), sway: getComputedStyle(document.querySelector('.bha-wound__hero')).animationName }));
          run.wound.push({ step: st.step, title: st.title, body: st.body, cover: await page.evaluate(cover), ...info });
          if (!shots.has('wound')) { shots.add('wound'); await shot(page, '1-wound-card'); }
        }
      }
      if (st.name === 'recover') {
        const id = ['dying', 'to-bag', 'cure', 'potion', 'merchant', 'to-spa', 'spa-rest', 'feed', 'done'][Number(st.step.match(/(\d+) \//)?.[1] ?? 0) - 1];
        if (!run.recover.some((r) => r.id === id)) {
          await page.waitForTimeout(500);
          run.recover.push({ id, title: st.title, body: st.body, cover: await page.evaluate(cover) });
          if (id === 'dying') await shot(page, '2-home-dying-card');
        }
        if (id === 'to-spa' && st.screen.includes('spa') && st.next?.disabled) { await page.waitForTimeout(150); continue; }
        let k;
        if (st.dialog) k = st.selUse ? '확정' : '아래';
        else if (st.next && !st.next.disabled) k = st.selInTut ? '확정' : '아래';
        else if (st.only) k = st.selOnly ? '확정' : '아래';
        else { await page.waitForTimeout(200); continue; }
        await dev(k).click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(k === '확정' ? 300 : 350);
        continue;
      }
      if (st.name && st.next && !st.next.disabled) { await dev(st.selInTut ? '확정' : '아래').click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(400); idle = 0; continue; }
      if (++idle > 6) {
        const go = page.locator('.bha-lcd button.bha-btn--primary:not([disabled]), .bha-lcd button.bha-btn--lg:not([disabled])').filter({ visible: true });
        if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
        idle = 0;
      }
      await page.waitForTimeout(300);
    }
    // 안내를 닫고 가방(소모품) → 치료제 3개
    for (let t = 0; t < 20 && (await page.locator('.bha-tut').count()); t++) {
      const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled])').filter({ visible: true });
      if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(800);
    await page.locator('.bha-prop--chest').first().click();
    await page.waitForTimeout(800);
    const tab = page.getByRole('tab', { name: /소모품/ });
    if (await tab.count()) { await tab.first().click().catch(() => {}); await page.waitForTimeout(500); }
    run.bag = await page.evaluate(() => (document.querySelector('[data-item="med-cure"]')?.textContent ?? '').trim());
    run.save = await page.evaluate(() => { for (const k of Object.keys(localStorage)) { const v = localStorage.getItem(k) ?? ''; const m = v.match(/"med-cure":(\d+)/); if (m) return { key: k, cures: Number(m[1]) }; } return null; });
    await shot(page, '3-bag-cures');
    proof.runs.push(run);
    await page.close();

    // 사신: 테스트 모드 새 게임 → [테스트] → [진화] → 다음 진화 (혼백 → 영술원 학생)
    const sp = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
    sp.on('pageerror', (e) => errors.push(e.message));
    await newGame(sp, `${server.url}?test=1`, 1);
    const evo = { faction: 'shinigami' };
    for (let t = 0; t < 30 && (await sp.locator('.bha-tut').count()); t++) {
      const go = sp.locator('.bha-tut button.bha-btn--primary:not([disabled])').filter({ visible: true });
      if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
      else await sp.locator('.bha-lcd').first().click({ timeout: 2000 }).catch(() => {});
      await sp.waitForTimeout(400);
    }
    await sp.evaluate(() => { window.__openTest = true; });
    proof.evo = evo;
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    // 더보기 → 테스트 → 진화 탭
    await sp.getByRole('button', { name: /더보기/ }).first().click({ timeout: 4000 }).catch(() => {});
    await sp.waitForTimeout(400);
    await sp.getByRole('button', { name: '테스트' }).first().click({ timeout: 4000 }).catch(() => {});
    await sp.waitForTimeout(600);
    await sp.locator('.bha-viewtitle, [aria-haspopup]').filter({ hasText: '테스트' }).first().click({ timeout: 3000 }).catch(() => {});
    await sp.waitForTimeout(300);
    await sp.getByRole('option', { name: '진화' }).or(sp.getByRole('menuitem', { name: '진화' })).or(sp.getByRole('button', { name: '진화', exact: true })).first().click({ timeout: 3000 }).catch(() => {});
    await sp.waitForTimeout(400);
    await sp.getByRole('button', { name: '다음 진화' }).click({ timeout: 4000 });
    await sp.waitForTimeout(3300);
    evo.lines = await sp.evaluate(() => [...document.querySelectorAll('.bha-evolve__line')].map((e) => e.textContent));
    await shot(sp, '4-shinigami-evolve-lines');
    await sp.waitForTimeout(1200);
    evo.reason = await sp.evaluate(() => document.querySelector('[data-evolve-reason]')?.textContent ?? null);
    evo.path = await sp.evaluate(() => document.querySelector('.bha-evolve__path')?.textContent ?? null);
    await shot(sp, '5-shinigami-evolve-result');
    await sp.close();
    console.log(JSON.stringify({ wound: run.wound, recover: run.recover.slice(0, 2), bag: run.bag, save: run.save, evo, reachedNext: run.reachedNext, errors }, null, 1));
  } finally {
    await browser.close();
    server.stop();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
  process.exit(0);
})();
