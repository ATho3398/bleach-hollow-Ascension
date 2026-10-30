// C.218 (GDD 140장) proof: 사신 홈 안내 첫 장(대원실이다)·바퀴 끝 드래프트 창(두 종족)·흡수 후보 창·결과 보상 카드. 캡처 docs/captures/c218/
// 실행: node scripts/c218-proof.cjs (vite 를 띄운다, C218_URL=<주소> 면 그 주소). C218_FACTION=0|1 (없으면 둘 다). C218_TAG=<파일 앞머리>. 1배·844×390
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c218');
const PORT = 5318;
const TAG = process.env.C218_TAG ?? '';

async function startServer() {
  if (process.env.C218_URL) return { url: process.env.C218_URL, stop: () => {} };
  const p = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe' });
  const url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) return { url, stop: () => p.kill() }; } catch { /* 아직 */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  p.kill();
  throw new Error('vite 서버가 뜨지 않았다');
}

const vis = (loc) => loc.filter({ visible: true });

/** 창 측정: 같은 줄 카드 크기·글 잘림·처음 스크롤 (ui-audit cardsInPage 와 같은 기준) */
async function measure(page, sel) {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return null;
    const scrolls = [root, ...root.querySelectorAll('*')].filter((e) => { const cs = getComputedStyle(e); return /(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 1; }).map((e) => ({ cls: String(e.className).slice(0, 40), top: Math.round(e.scrollTop), over: e.scrollHeight - e.clientHeight }));
    const cards = [...root.querySelectorAll('.bha-draft__card, .bha-cand, .bha-result__card, .bha-reward')].map((c) => { const r = c.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), cut: [...c.querySelectorAll('*')].some((e) => e.children.length === 0 && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1) && getComputedStyle(e).overflow !== 'visible') }; });
    const btns = [...root.querySelectorAll('.bha-continue .bha-grid2 > .bha-btn')].map((b) => { const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
    return { scrolls, cards, btns, text: root.textContent.replace(/\s+/g, ' ').slice(0, 300) };
  }, sel);
}

async function newGame(page, url, fi, run) {
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
  await page.waitForTimeout(1500);
  // 탄생 연출·각본 튜토리얼 뒤에 홈 안내(여기가 {nestName}(이)다)가 뜬다 — 뜰 때까지 넘기며 기다린다
  for (let t = 0; t < 80; t++) {
    if (!(await page.locator('.bha-tut').count())) {
      if (run.homeIntro || t > 30) break;
      await page.waitForTimeout(500);
      continue;
    }
    const txt = (await page.locator('.bha-tut').allTextContents().catch(() => [])).join(' ');
    run.tutSeen = [...(run.tutSeen ?? []), txt.replace(/\s+/g, ' ').slice(0, 40)];
    if (/여기가/.test(txt) && !run.homeIntro) {
      run.homeIntro = txt.replace(/\s+/g, ' ').slice(0, 80);
      await page.screenshot({ path: path.join(OUT, `${TAG}${run.faction}-home-intro.png`) });
      run.shots.push('home-intro');
    }
    const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled])').filter({ visible: true });
    if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
    else await page.locator('.bha-lcd').first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
}

(async () => {
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { runs: [] };
  try {
    const list = process.env.C218_FACTION ? [[Number(process.env.C218_FACTION), ['hollow', 'shinigami'][Number(process.env.C218_FACTION)]]] : [[0, 'hollow'], [1, 'shinigami']];
    for (const [fi, faction] of list) {
      const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const run = { faction, shots: [], notes: [] };
      await newGame(page, server.url, fi, run);
      // 홈 안내 첫 장 (GDD 140장 1): 첫 실행 안내가 안 떴으면 도움말 → 안내 다시 보기 → [홈 안내] 로 같은 카드를 연다
      if (!run.homeIntro) {
        await page.locator('.bha-lcd').getByRole('button', { name: '더보기' }).click({ timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(400);
        await page.getByRole('button', { name: '도움말' }).first().click({ timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(700);
        await page.locator('.bha-mdrow').filter({ hasText: '안내 다시 보기' }).first().click({ timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(500);
        await page.locator('[data-replay="홈 안내"]').first().click({ timeout: 4000 }).catch(() => run.notes.push('홈 안내 다시 보기 없음'));
        await page.waitForTimeout(900);
        const txt = (await page.locator('.bha-tut').allTextContents().catch(() => [])).join(' ');
        run.homeIntro = txt.replace(/\s+/g, ' ').slice(0, 80);
        await page.screenshot({ path: path.join(OUT, `${TAG}${faction}-home-intro.png`) });
        run.shots.push('home-intro');
        for (let i = 0; i < 6 && (await page.locator('.bha-tut').count()); i++) { await page.locator('.bha-dev__btn--back').first().click().catch(() => {}); await page.waitForTimeout(400); }
        for (let i = 0; i < 4 && (await page.locator('.bha-lcd [data-dev-layer]').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
      }
      // 테스트 속도 ×4
      await page.locator('.bha-lcd').getByRole('button', { name: '더보기' }).click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(400);
      await page.locator('.bha-homedock__tray').getByRole('button', { name: '테스트' }).click({ timeout: 4000 }).catch(() => run.notes.push('테스트 버튼 없음'));
      await page.waitForTimeout(700);
      await page.click('.bha-lcd .bha-viewtitle__btn', { timeout: 3000 }).catch(() => {});
      await page.locator('.bha-viewtitle__list').getByRole('option', { name: '둥지·시간' }).click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(400);
      await page.locator('.bha-lcd .bha-seg__item').filter({ hasText: '×4' }).click({ timeout: 3000 }).catch(() => run.notes.push('×4 없음'));
      for (let i = 0; i < 4 && (await page.locator('.bha-lcd [data-dev-layer]').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
      await page.locator('.bha-dev__btn--back').first().click().catch(() => {});
      await page.waitForTimeout(700);
      await page.locator('.bha-prop--outside, .bha-prop--door').first().click();
      await page.waitForTimeout(900);
      if (await page.locator('.bha-worldmap [data-place="adventure"]').count()) { await page.click('.bha-worldmap [data-place="adventure"]'); await page.waitForTimeout(1200); }
      for (let i = 0; i < 6 && (await page.locator('.bha-lcd [data-dev-layer]').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
      await page.locator('.bha-lcd').getByRole('button', { name: '★1', exact: true }).click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(500);
      await page.locator('.bha-lcd').getByRole('button', { name: '출발' }).first().click({ timeout: 3000 }).catch(() => run.notes.push('출발 없음'));
      await page.waitForTimeout(1200);
      let absorbShot = false; let draftShot = false;
      for (let t = 0; t < 400 && !(await page.locator('.bha-resultpage').count()); t++) {
        const eat = vis(page.getByRole('button', { name: /하러 가기$/ }));
        const nestHome = vis(page.getByRole('button', { name: '귀환', exact: true }));
        const layerGo = vis(page.locator('.bha-lcd [data-dev-layer] button.bha-btn--primary, .bha-lcd [data-dev-layer] button.bha-btn--danger'));
        if (await page.locator('.bha-absorbpage').count()) {
          const go = vis(page.locator('.bha-lcd .bha-absorbpage button.bha-btn--primary:not([disabled])'));
          if (!absorbShot && (await vis(page.locator('.bha-lcd .bha-cand')).count())) {
            absorbShot = true;
            run.absorb = await measure(page, '.bha-lcd .bha-absorbpage');
            await page.screenshot({ path: path.join(OUT, `${TAG}${faction}-absorb.png`) });
            run.shots.push('absorb');
          }
          // 확인 창 > 진행 버튼 > 슬롯 > 후보 순서로 끝까지 넘긴다 (ui-audit 흡수·결과와 같은 순서)
          const slot = vis(page.locator('.bha-lcd .bha-absorbpage .bha-slot'));
          const cand = vis(page.locator('.bha-lcd .bha-cand'));
          if (await layerGo.count()) await layerGo.first().click({ timeout: 3000 }).catch(() => {});
          else if (await go.count()) await go.first().click({ timeout: 3000 }).catch(() => {});
          else if (await slot.count()) await slot.first().click({ timeout: 3000 }).catch(() => {});
          else if (await cand.count()) await cand.first().click({ timeout: 3000 }).catch(() => {});
        } else if (await layerGo.count()) await layerGo.first().click({ timeout: 3000 }).catch(() => {});
        else if (await nestHome.count()) {
          if (!draftShot) {
            draftShot = true;
            await page.waitForTimeout(500);
            run.draft = await measure(page, '.bha-lcd .bha-exp .bha-sheet');
            await page.screenshot({ path: path.join(OUT, `${TAG}${faction}-draft.png`) });
            run.shots.push('draft');
            // 기기 ▼ 로 카드 → 버튼 순서 확인
            const order = [];
            for (let i = 0; i < 6; i++) {
              await page.locator('.bha-dev__btn--dir').nth(1).click({ timeout: 2000 }).catch(() => {});
              await page.waitForTimeout(120);
              order.push(await page.evaluate(() => { const f = document.querySelector('.bha-lcd .bha-sel'); return f ? (f.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 14) : null; }));
            }
            run.draftKeyOrder = order;
          }
          await nestHome.first().click({ timeout: 3000 }).catch(() => {});
        } else if (await eat.count()) await eat.first().click({ timeout: 3000 }).catch(() => {});
        else {
          // 1바퀴 다 돌기 전에 [귀환하기] 는 누르지 않는다 — 바퀴 끝 창을 봐야 한다
        }
        if (process.env.C218_DEBUG && t % 30 === 0) await page.screenshot({ path: path.join(process.env.C218_DEBUG, `t${t}.png`) });
        await page.waitForTimeout(600);
      }
      if (await page.locator('.bha-resultpage').count()) {
        await page.waitForTimeout(800);
        run.result = await measure(page, '.bha-lcd .bha-resultpage');
        await page.screenshot({ path: path.join(OUT, `${TAG}${faction}-result.png`) });
        run.shots.push('result');
      } else run.notes.push('결과 화면 못 봄');
      run.errors = errors;
      proof.runs.push(run);
      await page.close();
    }
  } finally {
    let old = { runs: [] };
    try { old = JSON.parse(fs.readFileSync(path.join(OUT, `${TAG}proof.json`), 'utf8')); } catch { /* 없음 */ }
    const done = new Set(proof.runs.map((r) => r.faction));
    proof.runs = [...old.runs.filter((r) => !done.has(r.faction)), ...proof.runs];
    fs.writeFileSync(path.join(OUT, `${TAG}proof.json`), JSON.stringify(proof, null, 2));
    await browser.close();
    server.stop();
  }
  console.log(JSON.stringify(proof, null, 2));
})();
