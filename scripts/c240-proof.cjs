// C.240 proof (C.235 proof 바탕, GDD 161장): 새 게임(사신) → 첫 모험(회복 물건 알림 없음) → 각본 전투 → 흡수 → 회복 안내 → 귀환
// → 두 번째 모험(장비 드롭 확률만 브라우저에서 1로) 첫 전투 끝 → 진행 알림(도감 보상) 1장. 뜬 노란 알림(.bha-toast)은 전부 proof.json 에 남긴다.
// 캡처 docs/captures/c240/ (1배). 실행: node scripts/c240-proof.cjs (C240_URL=<주소> 면 그 주소)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const RECOVER_IDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/help/tutorial.json'), 'utf8')).recover.map((x) => x.id);
const OUT = path.join(ROOT, 'docs/captures/c240');
const PORT = 5340;

async function startServer() {
  if (process.env.C240_URL) return { url: process.env.C240_URL, stop: () => {} };
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
  const proof = { toasts: [], shots: [] };
  let page;
  const shot = async (name, note) => {
    // 배경음 알림은 헤드리스에서 소리가 안 나 곡이 연달아 넘어가며 쌓인다 — 캡처에서만 지운다(기록에는 남김)
    await page.evaluate(() => document.querySelectorAll('.bha-toast').forEach((t) => { if (t.textContent.startsWith('배경음')) t.remove(); }));
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    proof.shots.push({ name, note, toastsOnScreen: await page.evaluate(() => [...document.querySelectorAll('.bha-toast')].map((t) => t.textContent)) });
  };
  try {
    page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
    const errors = [];
    proof.errors = errors;
    page.on('pageerror', (e) => errors.push(e.message));
    await page.exposeFunction('logToast', (t) => proof.toasts.push(t));
    await page.addInitScript(() => {
      new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.classList?.contains('bha-toast')) setTimeout(() => window.logToast(n.textContent), 30); })
        .observe(document, { childList: true, subtree: true });
    });
    await newGame(page, server.url, 1);
    const dev = (name) => page.locator(`.bha-dev__btn[aria-label="${name}"]`).first();
    // 방 → 홈 안내 → 첫 모험 강제 → 첫 모험 카드 → [걷기 시작] 직후 캡처
    let sawFirstRun = false;
    for (let t = 0; t < 200 && !(await page.locator('.bha-battle').count()); t++) {
      const st = await page.evaluate(look).catch(() => ({}));
      if (st.name === 'first-run') sawFirstRun = true;
      else if (sawFirstRun && !proof.departShot && (st.screen ?? '').length) {
        await page.waitForTimeout(1500); // 옛 '회복 물건' 알림은 카드를 닫자마자 떴다
        proof.brokenImgs = await page.evaluate(() => [...document.querySelectorAll('img')].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute('src')));
        await shot('1-tutorial-depart', '첫 모험 [걷기 시작] 직후 1.5초 — 회복 물건 알림 없음');
        proof.departShot = true;
      }
      const go = page.locator('.bha-lcd [data-dev-layer] button.bha-btn--primary:not([disabled])').filter({ visible: true });
      if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
      else if (st.only) await dev(st.selOnly ? '확정' : '아래').click();
      else if (st.dialog) await page.locator('.bha-lcd').first().click({ timeout: 2000 }).catch(() => {});
      else if (t > 8 && st.screen.includes('worldmap')) await page.locator('.bha-worldmap [data-place="adventure"]').click({ timeout: 2000 }).catch(() => {});
      else if (t > 8) await page.locator('.bha-prop--outside, .bha-prop--door').first().click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(500);
    }
    // 각본 전투
    for (let t = 0; t < 600; t++) {
      if (await page.locator('.bha-battle.is-tutkill').count()) break;
      const st = await page.evaluate(look).catch(() => ({}));
      if (st.name !== 'script') { await page.waitForTimeout(250); continue; }
      const acting = st.pass && st.only;
      if (acting && !(st.selSc === 'guard' || String(st.selSc).startsWith('block.'))) { await dev('아래').click(); await page.waitForTimeout(200); continue; }
      await dev('확정').click();
      await page.waitForTimeout(acting ? 2600 : 400);
    }
    // 흡수 → 회복 안내 → 귀환 결과 → '다음 할 일'
    let idle = 0;
    for (let t = 0; t < 900; t++) {
      const st = await page.evaluate(look).catch(() => ({}));
      if (st.name === 'first-run-room') { proof.reachedRoom = true; break; }
      if (!proof.resultShot && (st.screen ?? '').includes('result')) {
        await page.waitForTimeout(1500);
        await shot('2-return-items-no-toast', '첫 모험 귀환 결과 — 얻은 먹이·물건은 목록에만, 알림 없음');
        proof.resultShot = true;
      }
      if (st.name && st.next && !st.next.disabled) { await dev(st.selInTut ? '확정' : '아래').click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(400); idle = 0; continue; }
      if (st.name && (st.dialog || st.only)) {
        const k = st.dialog ? (st.selUse ? '확정' : '아래') : (st.selOnly ? '확정' : '아래');
        await dev(k).click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(300);
        idle = 0;
        continue;
      }
      if (++idle > 6) {
        const go = page.locator('.bha-lcd button.bha-btn--primary:not([disabled]), .bha-lcd button.bha-btn--lg:not([disabled])').filter({ visible: true });
        if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
        idle = 0;
      }
      await page.waitForTimeout(300);
    }
    proof.toastsAfterTutorial = proof.toasts.filter((t) => !t.startsWith('배경음'));
    // 두 번째 모험: 장비 드롭 확률만 브라우저 안에서 1로 (게임 코드 변경 아님) → 첫 전투 승리 → 흡수 화면에서 캡처
    await page.evaluate(() => import('/src/config/balance.ts').then((m) => { m.BALANCE.provisional.gear.dropChance.normal = 1; m.BALANCE.provisional.gear.dropChance.elite = 1; }));
    const toast0 = proof.toasts.length;
    for (let t = 0; t < 400; t++) {
      const st = await page.evaluate(look).catch(() => ({}));
      const scr = st.screen ?? '';
      if (scr.includes('absorb')) {
        await page.waitForTimeout(1500);
        await shot('3-gear-drop-no-toast', '두 번째 모험 첫 전투 승리 직후(장비 드롭 확률 1) — 장비 알림 없음');
        break;
      }
      if (st.name && st.next && !st.next.disabled) { await dev(st.selInTut ? '확정' : '아래').click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(400); continue; }
      if (scr.includes('worldmap')) await page.locator('.bha-worldmap [data-place="adventure"]').click({ timeout: 2000 }).catch(() => {});
      else if (scr.includes('room')) await page.locator('.bha-prop--outside, .bha-prop--door').first().click({ timeout: 2000 }).catch(() => {});
      else {
        const go = page.locator('.bha-lcd button.bha-btn--primary:not([disabled])').filter({ visible: true });
        if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
      }
      await page.waitForTimeout(700);
    }
    proof.toastsSecondRun = proof.toasts.slice(toast0).filter((t) => !t.startsWith('배경음'));
    // 진행 알림은 남는다: 도감 보상 알림(먹이 줄은 빠지고 영옥만)
    await page.evaluate(() => Promise.all([import('/src/ui/tutorialGoalsView.ts'), import('/src/data/factions/index.ts')]).then(([v, f]) => {
      v.showDexToasts([{ milestone: { dex: 'forms', count: 10, reward: {} }, food: [['snack', 2]], jade: 3 }], f.getFaction('shinigami'));
    }));
    await page.waitForTimeout(700);
    await shot('4-progress-toast-kept', '진행 알림(도감 보상)은 그대로 — 보상 줄의 먹이(주먹밥 2)는 빠짐');
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close();
    server.stop();
  }
  console.log(JSON.stringify({ broken: proof.brokenImgs, shots: proof.shots.map((s) => s.name), reachedRoom: proof.reachedRoom, toasts: proof.toasts.filter((t) => !t.startsWith('배경음')), errors: proof.errors }, null, 1));
})();
