// C.207 (GDD 131장) proof: ① 각본 전투 블록·막기 = 카드 닫힘 → 약 0.5초 → 모션·피해 ② 회복 안내 = 행동 버튼 없이 원래 조작(기기 버튼만), 하기 전 [다음] 잠김.
// 새 게임 → 첫 원정(튜토리얼) → 전투·회복 안내 모두 기기 ▲▼✓ 만. 캡처 docs/captures/c207/
// 실행: node scripts/c207-proof.cjs (vite 를 띄운다, C207_URL=<주소> 면 그 주소). C207_FACTION=0|1 (없으면 둘 다)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c207');
const PORT = 5307;
const RECOVER_SHOTS = { hollow: { cure: 'h-2-cure-bag', 'to-spa': 'h-3-spa-way', feed: 'h-4-feed' }, shinigami: { 'to-spa': 's-3-spa-way' } };

async function startServer() {
  if (process.env.C207_URL) return { url: process.env.C207_URL, stop: () => {} };
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
    for (const [fi, faction] of [[0, 'hollow'], [1, 'shinigami']]) {
      const p = faction === 'hollow' ? 'h' : 's';
      const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await newGame(page, server.url, fi);
      const dev = (name) => page.locator(`.bha-dev__btn[aria-label="${name}"]`).first();
      const run = { faction, cards: [], errors };
      let last = null;
      for (let t = 0; t < 200; t++) {
        const st = await page.evaluate(look);
        if (st.screen.includes('bha-exp') || st.screen.includes('bha-walk') || (st.name && st.name !== 'home-intro' && run.cards.length)) { run.end = st.screen; break; }
        if (st.name !== 'home-intro') { await page.waitForTimeout(300); continue; }
        if (st.step !== last) {
          last = st.step;
          await page.waitForTimeout(400);
          const c = await page.evaluate(() => { const l = [...document.querySelectorAll('.bha-tut')].pop(); const h = l?.querySelector('.bha-tut__hole'); return { body: l?.querySelector('.bha-tut__body')?.innerText ?? '', hole: h && !h.classList.contains('is-none') ? true : false, dim: h ? getComputedStyle(h).boxShadow !== 'none' : false, skip: !!l && [...l.querySelectorAll('button')].some((b) => b.textContent.includes('건너뛰기')) }; });
          run.cards.push({ step: st.step, title: st.title, ...c, next: st.next });
          const n = run.cards.length;
          if (p === 'h' && n === 1) await page.screenshot({ path: path.join(OUT, 'h-1-intro.png') });
          if (p === 'h' && n === 2) await page.screenshot({ path: path.join(OUT, 'h-2-outside.png') });
          continue;
        }
        const cur = run.cards[run.cards.length - 1];
        if (st.pass && st.only) {
          // 첫 모험 강제: 잠긴 방 버튼 터치 · 기기 뒤로 → 그대로인지
          if (!cur.forced) {
            cur.forced = true;
            await page.screenshot({ path: path.join(OUT, `${p}-3-forced-room.png`) });
            await page.locator('.bha-prop--chest').click({ force: true, timeout: 1000 }).catch(() => {});
            await page.waitForTimeout(400);
            cur.chestTapStays = (await page.evaluate(look)).screen;
            await dev('취소').click();
            await page.waitForTimeout(400);
            cur.backStays = (await page.evaluate(look)).screen;
            cur.backToast = await page.evaluate(() => [...document.querySelectorAll('.bha-toast')].map((x) => x.textContent).join('|'));
            cur.roomItems = await page.evaluate(() => document.querySelector('.bha-sel')?.getAttribute('aria-label'));
          }
          if (st.screen.includes('worldmap') && !cur.world) {
            cur.world = await page.evaluate(() => [...document.querySelectorAll('.bha-worldmap [data-place]')].map((b) => `${b.dataset.place}:${b.getAttribute('aria-disabled') === 'true' ? 'lock' : 'open'}`));
            if (p === 'h') await page.screenshot({ path: path.join(OUT, 'h-4-forced-worldmap.png') });
            await page.locator('.bha-worldmap [data-place="market"]').click({ timeout: 1000 }).catch(() => {});
            await page.waitForTimeout(400);
            cur.marketTapStays = (await page.evaluate(look)).screen;
          }
          await dev(st.selOnly ? '확정' : '아래').click();
          cur.presses = (cur.presses ?? '') + (st.selOnly ? `✓(${st.sel})` : '▼');
          await page.waitForTimeout(600);
          continue;
        }
        await dev(st.selInTut ? '확정' : '아래').click();
        await page.waitForTimeout(350);
      }
      proof.runs.push(run);
      await page.close();
      console.log(faction, run.cards.map((c) => `${c.step}:${c.title}${c.dim ? ':DIM' : ''}${c.skip ? ':SKIP' : ''}`).join(' | '));
      const f = run.cards[run.cards.length - 1];
      console.log(' forced', JSON.stringify({ chest: f.chestTapStays, back: f.backStays, toast: f.backToast, world: f.world, market: f.marketTapStays, presses: f.presses, end: run.end }), errors);
    }
  } finally {
    await browser.close();
    server.stop();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
  process.exit(0);
})();
