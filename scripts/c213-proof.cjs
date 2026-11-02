// C.213 (GDD 136장 2·3) proof: 출발 화면 배치판(두 종족, 타일 비율 그대로 + 가로 밀기)·폭주/호로화 문구 화면. 캡처 docs/captures/c213/
// 실행: node scripts/c213-proof.cjs (vite 를 띄운다, C213_URL=<주소> 면 그 주소). C213_FACTION=0|1 (없으면 둘 다). 1배·844×390
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c213');
const PORT = 5313;

async function startServer() {
  if (process.env.C213_URL) return { url: process.env.C213_URL, stop: () => {} };
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
  // 각본 튜토리얼·탄생 연출 넘기기 (C.211)
  for (let t = 0; t < 40 && (await page.locator('.bha-tut').count()); t++) {
    const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled])').filter({ visible: true });
    if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
    else await page.locator('.bha-lcd').first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
}

const lcd = (page) => page.locator('.bha-lcd');

/** 배치판 측정: 칸 크기·비율, 가로 밀기 가능 여부, [출발] 띠와 겹침 */
async function measure(page) {
  return page.evaluate(() => {
    const road = document.querySelector('.bha-lcd .bha-plan .bha-road');
    const cells = [...document.querySelectorAll('.bha-lcd .bha-plan .bha-road__cell')].map((c) => c.getBoundingClientRect());
    const go = document.querySelector('.bha-lcd .bha-plan__go')?.getBoundingClientRect();
    const r = road?.getBoundingClientRect();
    const handBox = document.querySelector('.bha-lcd .bha-plan .bha-road__hand')?.getBoundingClientRect();
    return {
      cells: cells.length,
      cell: cells[0] ? { w: Math.round(cells[0].width), h: Math.round(cells[0].height) } : null,
      road: r ? { scrollW: road.scrollWidth, clientW: road.clientWidth, top: Math.round(r.top), bottom: Math.round(r.bottom) } : null,
      goTop: go ? Math.round(go.top) : null,
      noteBottom: Math.round(document.querySelector('.bha-lcd .bha-plan .bha-road__noterow')?.getBoundingClientRect().bottom ?? 0),
      planOverflow: (() => { const p = document.querySelector('.bha-lcd .bha-app.bha-plan'); return p ? p.scrollHeight - p.clientHeight : null; })(),
      roadOverGo: r && go ? r.bottom > go.top + 1 : null,
      handBoxOverGo: go && handBox ? handBox.bottom > go.top + 1 : null, // 손패는 자기 상자 안에서만 세로 스크롤 — 상자가 띠 위에서 끝나면 카드가 띠 밑으로 겹치지 않는다
    };
  });
}

(async () => {
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { runs: [] };
  try {
    const list = process.env.C213_FACTION ? [[Number(process.env.C213_FACTION), ['hollow', 'shinigami'][Number(process.env.C213_FACTION)]]] : [[0, 'hollow'], [1, 'shinigami']];
    for (const [fi, faction] of list) {
      const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const run = { faction, shots: [], notes: [] };
      await newGame(page, server.url, fi);
      if (process.env.C213_DEBUG) await page.screenshot({ path: path.join(OUT, `_debug-${faction}.png`) });
      if (faction === 'shinigami') {
        // 폭주 상태 이름 문구 (GDD 136장 2): 도움말 → 용어 사전 '[소모품]' 항목 = "{frenzyName} 중에는 회복약을 못 쓴다" → 사신 "호로화"
        await lcd(page).getByRole('button', { name: '더보기' }).click({ timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(500);
        await page.getByRole('button', { name: '도움말' }).first().click({ timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(700);
        await page.locator('.bha-mdrow').filter({ hasText: '[소모품]' }).first().click({ timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(600);
        run.frenzyText = await page.evaluate(() => (document.querySelector('.bha-mddetail__body')?.textContent ?? '').match(/[^.]*호로화[^.]*/)?.[0] ?? null);
        await page.screenshot({ path: path.join(OUT, `${faction}-frenzy-name.png`) });
        run.shots.push('frenzy-name');
        for (let i = 0; i < 4 && (await page.locator('[role="dialog"][aria-label="도움말"]').count()); i++) { await page.locator('.bha-dev__btn--back').first().click(); await page.waitForTimeout(400); }
        for (let i = 0; i < 4 && (await page.locator('.bha-lcd [data-dev-layer]').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
      }
      await page.locator('.bha-prop--outside, .bha-prop--door').first().click();
      await page.waitForTimeout(900);
      if (await page.locator('.bha-worldmap [data-place="adventure"]').count()) {
        await page.click('.bha-worldmap [data-place="adventure"]');
        await page.waitForTimeout(1200);
      }
      for (let i = 0; i < 6 && (await page.locator('.bha-lcd [data-dev-layer]').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
      const star = lcd(page).getByRole('button', { name: '★1', exact: true });
      if (await star.count()) { await star.click(); await page.waitForTimeout(600); }
      // 손패 타일을 뒤쪽 칸(밀어야 보이는 칸)에 하나 놓는다
      const card = page.locator('.bha-lcd .bha-tilecard').first();
      if (await card.count()) {
        await card.click();
        await page.waitForTimeout(200);
        const cells = page.locator('.bha-lcd .bha-road__cell:not(.is-locked)');
        if (await cells.count()) { await cells.nth(1).click(); await page.waitForTimeout(300); }
      } else run.notes.push('손패 타일 없음');
      run.before = await measure(page);
      await page.screenshot({ path: path.join(OUT, `${faction}-plan-board.png`) });
      run.shots.push('plan-board');
      // 기기 ▼ 를 여러 번 눌러 커서가 배치판 뒤쪽 칸으로 가면 판이 따라 밀리는지
      for (let i = 0; i < 14; i++) { await page.locator('.bha-dev__btn--dir').nth(1).click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(80); }
      run.afterKeys = await page.evaluate(() => {
        const road = document.querySelector('.bha-lcd .bha-plan .bha-road');
        const f = document.activeElement;
        return { scrollLeft: road ? Math.round(road.scrollLeft) : null, focused: f ? f.className.slice(0, 60) : null };
      });
      await page.screenshot({ path: path.join(OUT, `${faction}-plan-board-scrolled.png`) });
      run.shots.push('plan-board-scrolled');
      run.errors = errors;
      proof.runs.push(run);
      await page.close();
    }
  } finally {
    // 한 종족만 돌렸으면 다른 종족 기록은 남긴다
    let old = { runs: [] };
    try { old = JSON.parse(fs.readFileSync(path.join(OUT, 'proof.json'), 'utf8')); } catch { /* 없음 */ }
    const done = new Set(proof.runs.map((r) => r.faction));
    proof.runs = [...old.runs.filter((r) => !done.has(r.faction)), ...proof.runs];
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close();
    server.stop();
  }
  console.log(JSON.stringify(proof, null, 2));
})();
