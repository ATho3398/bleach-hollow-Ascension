// C.199 (GDD 123장 5) 각본 전투 proof: 새 게임 → 첫 원정(튜토리얼) → 전투는 기기 버튼(▲▼✓)만으로 끝까지. 캡처 docs/captures/c199/
// 실행: node scripts/c199-proof.cjs (vite 를 띄운다, C199_URL=<주소> 면 그 주소). C199_FACTION=0|1 (없으면 둘 다)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c199');
const PORT = 5299;
const SHOTS = { hollow: ['intro', 'guard-now', 'hurt', 'block-use', 'chain-use'], shinigami: [] };
const RECOVER_SHOTS = { hollow: ['dying', 'potion', 'to-spa', 'spa-rest', 'feed'], shinigami: [] };
const RECOVER_IDS = ['dying', 'to-bag', 'cure', 'potion', 'merchant', 'to-spa', 'spa-rest', 'feed', 'done'];

async function startServer() {
  if (process.env.C199_URL) return { url: process.env.C199_URL, stop: () => {} };
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
  await page.goto(`${url}`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${url}`);
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

(async () => {
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { runs: [] };
  try {
    for (const [fi, faction] of process.env.C199_FACTION ? [[Number(process.env.C199_FACTION), ['hollow', 'shinigami'][Number(process.env.C199_FACTION)]]] : [[0, 'hollow'], [1, 'shinigami']]) {
      const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await newGame(page, server.url, fi);
      // 방 → 첫 원정까지는 안내 [다음]·문 누르기 (전투 전 단계는 이 proof 대상 아님)
      const vis = (l) => l.filter({ visible: true });
      for (let t = 0; t < 80 && !(await page.locator('.bha-battle').count()); t++) {
        const layerGo = vis(page.locator('.bha-lcd [data-dev-layer] button.bha-btn--primary'));
        if (await layerGo.count()) await layerGo.first().click({ timeout: 2000 }).catch(() => {});
        else await page.locator('.bha-prop--door').first().click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(700);
      }
      await page.locator('.bha-battle').waitFor({ timeout: 60_000 });
      // 여기부터 기기 버튼만: ▲(위) ▼(아래) ✓(확정)
      const dev = (name) => page.locator(`.bha-dev__btn[aria-label="${name}"]`).first();
      const run = { faction, cards: [], presses: [], end: null, errors };
      let lastCard = null;
      for (let t = 0; t < 400; t++) {
        if (await page.locator('.bha-battle .bha-battle-ov--win').count()) break;
        const card = await page.evaluate(() => {
          const l = document.querySelector('.bha-tut[data-tutorial="script"]');
          if (!l) return null;
          const sel = document.querySelector('.bha-sel');
          return { title: l.querySelector('.bha-tut__title')?.textContent ?? '', step: l.querySelector('.bha-tut__step')?.textContent ?? '', body: l.querySelector('.bha-tut__body')?.textContent ?? '', wait: l.hasAttribute('data-dev-pass'), only: l.dataset.devOnly ?? null, sel: sel ? (sel.dataset.sc ?? sel.className) : null };
        });
        if (card && card.step !== lastCard) {
          lastCard = card.step;
          run.cards.push(card);
          const idx = run.cards.length;
          const id = ['intro', 'heavy-info', 'guard-now', 'hurt', 'block-use', 'chain-info', 'chain-use'][idx - 1];
          await page.waitForTimeout(400);
          if ((SHOTS[faction] ?? []).includes(id)) await page.screenshot({ path: path.join(OUT, `${faction === 'hollow' ? 'h' : 's'}-${idx}-${id}.png`) });
        }
        if (card) {
          // 기다리는 카드는 커서가 대상(막기·블록)에 있어야 한다. 아니면 ▼ 로 옮긴다
          if (card.wait && !(card.sel && (card.sel === 'guard' || String(card.sel).startsWith('block.')))) {
            await dev('아래').click();
            run.presses.push('▼');
          } else {
            await dev('확정').click();
            run.presses.push('✓');
          }
          await page.waitForTimeout(500);
        } else await page.waitForTimeout(300);
      }
      await page.waitForTimeout(800);
      run.end = await page.evaluate(() => ({ win: !!document.querySelector('.bha-battle-ov--win'), hp: document.querySelector('[data-help="battle.hp"]')?.textContent ?? '' }));
      // 전투 뒤 → 방 회복 안내 (GDD 123장 5 수정): 기기 ✓ 만 누른다 (흡수 화면 등 ✓ 로 안 넘어가는 곳은 기록)
      run.recover = [];
      run.recoverFallback = 0;
      let lastR = null;
      let stuck = 0;
      for (let t = 0; t < 300; t++) {
        const r = await page.evaluate(() => {
          const l = document.querySelector('.bha-tut[data-tutorial="recover"]');
          const hpEl = document.querySelector('.bha-room__hp');
          return l ? { step: l.querySelector('.bha-tut__step')?.textContent ?? '', title: l.querySelector('.bha-tut__title')?.textContent ?? '', hp: hpEl?.textContent ?? '', spa: !!document.querySelector('.bha-spa') } : null;
        });
        if (r && r.step !== lastR) {
          lastR = r.step;
          run.recover.push(r);
          const id = RECOVER_IDS[run.recover.length - 1];
          await page.waitForTimeout(500);
          if ((RECOVER_SHOTS[faction] ?? []).includes(id)) await page.screenshot({ path: path.join(OUT, `${faction === 'hollow' ? 'h' : 's'}-r${run.recover.length}-${id}.png`) });
          stuck = 0;
        }
        if (run.recover.length === RECOVER_IDS.length && !r) break;
        if (!r && run.recover.length === RECOVER_IDS.length) break;
        const firstRoom = await page.locator('.bha-tut[data-tutorial="first-run-room"], [data-tutorial="first-run-room"]').count();
        if (run.recover.length === RECOVER_IDS.length && (firstRoom || !r)) break;
        stuck++;
        // 카드가 떠 있을 때만 ✓ (카드 사이 화면 전환 중에 누르면 방 물건을 누른다). 카드 없이 오래 멈추면(전투 결과·흡수 화면) ✓
        if (r || stuck > 4) await dev('확정').click().catch(() => {});
        if (stuck > 25) {
          // ✓ 로 안 넘어가는 화면: 첫 주 버튼 (기록 — 각본 대상 밖)
          const go = page.locator('.bha-lcd button.bha-btn--primary, .bha-lcd button.bha-btn--lg').filter({ visible: true });
          if (await go.count()) { await go.first().click({ timeout: 2000 }).catch(() => {}); run.recoverFallback++; }
          stuck = 0;
        }
        await page.waitForTimeout(600);
      }
      run.home = await page.evaluate(() => ({ hp: document.querySelector('.bha-room__hp')?.textContent ?? '', save: (() => { try { const k = Object.keys(localStorage).find((x) => x.startsWith('bha-save')); const j = JSON.parse(localStorage.getItem(k)); const t = j.tracks ? j : j; return JSON.stringify({ nest: t.nest ? { hunger: t.nest.hunger, hp: t.nest.hpFraction, collapsed: t.nest.collapsed } : null, guides: t.help?.guides }); } catch (e) { return String(e); } })() }));
      proof.runs.push(run);
      await page.close();
      console.log(faction, run.cards.map((c) => c.step).join(','), run.end, 'recover', run.recover.map((c) => c.step + ':' + c.hp).join(' | '), 'fallback', run.recoverFallback, run.home, errors.length ? errors : '');
    }
  } finally {
    await browser.close();
    server.stop();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
})();
