// C.222 (GDD 146장) proof: 튜토리얼 마무리 3체인 = 동작 → 스킬 연출이 닿음 → 그 순간 피해 숫자·체력 감소 → 쓰러짐. 캡처 docs/captures/c222/ (1배, 3장)
// 실행: node scripts/c222-proof.cjs (vite 를 띄운다, C222_URL=<주소> 면 그 주소). 호로만 캡처, 두 종족 시각표는 proof.json
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c222');
const PORT = 5322;

async function startServer() {
  if (process.env.C222_URL) return { url: process.env.C222_URL, stop: () => {} };
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


// 화면 시각표: 블록 바에서 체인이 사라짐(사용) · 스킬 이름 · 적 체력 바뀜 · 체인 피해 숫자 · 쓰러짐 연출
const WATCH = () => {
  const t0 = performance.now();
  const tl = (window.__tl = []);
  const hpText = () => document.querySelector('.bha-unit--foe .bha-hp, .bha-unit--foe [class*="hp"]')?.textContent ?? '';
  let hp = hpText();
  const seen = new Set();
  const mark = (k, extra) => { if (!seen.has(k)) { seen.add(k); tl.push({ k, ms: Math.round(performance.now() - t0), ...extra }); } };
  const tick = () => {
    const h = hpText();
    if (h !== hp) { mark('hp-change', { from: hp, to: h }); hp = h; }
    if (document.querySelector('.bha-afx-name')) mark('skill-name');
    const f = [...document.querySelectorAll('.bha-float--attack.is-chained')].find((x) => !x.hidden);
    if (f) mark('damage-float', { text: f.textContent });
    if (document.querySelector('.bha-battle.is-tutkill')) mark('tutkill');
    if (!seen.has('tutkill') || performance.now() - t0 < 4000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

(async () => {
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { runs: [] };
  fs.mkdirSync(OUT, { recursive: true });
  try {
    for (const [fi, faction] of [[0, 'hollow'], [1, 'shinigami']]) {
      const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await newGame(page, server.url, fi);
      const dev = (name) => page.locator(`.bha-dev__btn[aria-label="${name}"]`).first();
      const run = { faction, cards: [], errors, timeline: null };
      // 방 → 홈 안내 → 첫 모험 (c214 와 같은 흐름)
      for (let t = 0; t < 160 && !(await page.locator('.bha-battle').count()); t++) {
        const st = await page.evaluate(look).catch(() => ({}));
        const go = page.locator('.bha-lcd [data-dev-layer] button.bha-btn--primary:not([disabled])').filter({ visible: true });
        if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
        else if (st.only) await dev(st.selOnly ? '확정' : '아래').click();
        else if (st.dialog) await page.locator('.bha-lcd').first().click({ timeout: 2000 }).catch(() => {});
        else if (t > 8 && st.screen.includes('worldmap')) await page.locator('.bha-worldmap [data-place="adventure"]').click({ timeout: 2000 }).catch(() => {});
        else if (t > 8) await page.locator('.bha-prop--outside, .bha-prop--door').first().click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(500);
      }
      // 각본 전투: 기기 버튼만. 7번째 카드(chain-use)에서 ✓ 직전부터 시각표
      let lastStep = null;
      let chainPressed = false;
      for (let t = 0; t < 500 && !chainPressed; t++) {
        const st = await page.evaluate(look).catch(() => ({}));
        if (st.name !== 'script') { await page.waitForTimeout(250); continue; }
        if (st.step !== lastStep) { lastStep = st.step; run.cards.push(st.step); await page.waitForTimeout(300); continue; }
        const acting = st.pass && st.only;
        if (acting && !(st.selSc === 'guard' || String(st.selSc).startsWith('block.'))) { await dev('아래').click(); await page.waitForTimeout(200); continue; }
        if (acting && run.cards.length === 7) {
          await page.evaluate(WATCH);
          chainPressed = true;
        }
        await dev('확정').click();
        if (!chainPressed) await page.waitForTimeout(acting ? 2600 : 400);
      }
      const P = faction === 'hollow' ? 'h' : 's';
      const tlNow = () => page.evaluate(() => window.__tl ?? []);
      const waitFor = async (k, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { if ((await tlNow()).some((x) => x.k === k)) return true; await page.waitForTimeout(15); } return false; };
      // ① 캐릭터 동작 중(적 체력 그대로): 스킬 이름이 뜬 직후
      await waitFor('skill-name');
      await page.waitForTimeout(120);
      const before = await tlNow();
      run.shot1HpUnchanged = !before.some((x) => x.k === 'hp-change');
      if (faction === 'hollow') await page.screenshot({ path: path.join(OUT, `${P}-1-motion.png`) });
      // ② 스킬이 닿는 순간 피해 숫자
      await waitFor('damage-float');
      await page.waitForTimeout(200); // 숫자가 떠오르는 애니(처치 슬로우 0.3배) 첫머리
      if (faction === 'hollow') await page.screenshot({ path: path.join(OUT, `${P}-2-impact.png`) });
      // ③ 쓰러짐 연출
      await waitFor('tutkill');
      await page.waitForTimeout(500);
      if (faction === 'hollow') await page.screenshot({ path: path.join(OUT, `${P}-3-kill.png`) });
      await page.waitForTimeout(1500);
      run.timeline = await tlNow();
      const at = (k) => run.timeline.find((x) => x.k === k)?.ms ?? null;
      run.order = { skillName: at('skill-name'), hpChange: at('hp-change'), damageFloat: at('damage-float'), tutkill: at('tutkill') };
      run.ok = run.order.skillName !== null && run.order.hpChange !== null && run.order.hpChange >= run.order.skillName && run.order.tutkill >= run.order.hpChange;
      proof.runs.push(run);
      await page.close();
      console.log(faction, JSON.stringify(run.order), 'ok', run.ok, 'shot1HpUnchanged', run.shot1HpUnchanged, errors.length ? errors : '');
    }
  } finally {
    await browser.close();
    server.stop();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
})();
