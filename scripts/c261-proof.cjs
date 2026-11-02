// C.261 (GDD 178장) proof: 전투 블록 생성 게이지 · 봉인 덮개 삭제 · 강조는 그림 모양대로. 캡처 docs/captures/c261/
// 실행: node scripts/c261-proof.cjs [before] (vite 를 띄운다, C261_URL=<주소> 면 그 주소). before = 해방 오라 '전' 캡처만
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c261');
const PORT = 5361;
const BEFORE = process.argv[2] === 'before';

async function startServer() {
  if (process.env.C261_URL) return { url: process.env.C261_URL, stop: () => {} };
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
}
const lcd = (page) => page.locator('.bha-lcd');
async function openTest(page, tab) {
  for (let i = 0; i < 4 && (await page.locator('.bha-lcd [data-dev-layer]').count()); i++) await page.keyboard.press('Escape');
  await lcd(page).getByRole('button', { name: '더보기' }).click();
  await page.waitForTimeout(500);
  await page.locator('.bha-homedock__tray').getByRole('button', { name: '테스트' }).click();
  await page.waitForTimeout(700);
  await page.locator('.bha-lcd .bha-viewtitle__btn').first().click();
  await page.locator('.bha-viewtitle__list').getByRole('option', { name: tab }).click();
  await page.waitForTimeout(400);
}
async function pick(page, aria, group, nth = 0) {
  await page.locator(`.bha-lcd button.bha-pick[aria-label="${aria}"]`).click();
  await page.waitForTimeout(200);
  const ok = await page.evaluate(({ group, nth }) => {
    const box = document.querySelector('.bha-pick__list');
    if (!box) return false;
    let inGroup = false;
    let k = 0;
    for (const n of box.children) {
      if (n.classList.contains('bha-pick__group')) { inGroup = n.textContent === group; continue; }
      if (inGroup && n.getAttribute('role') === 'option') { if (k++ === nth) { n.click(); return true; } }
    }
    return false;
  }, { group, nth });
  await page.waitForTimeout(300);
  return ok;
}
async function battle(page, url, fi, form) {
  await newGame(page, url, fi);
  if (form) {
    await openTest(page, '진화체');
    const ok = await pick(page, '진화체', form, 0);
    if (ok) await lcd(page).getByRole('button', { name: '이 몸으로' }).click();
    await page.waitForTimeout(600);
    for (let i = 0; i < 4 && (await page.locator('.bha-lcd [data-dev-layer]').count()); i++) await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
  }
  await openTest(page, '바로 전투');
  await pick(page, '상대', '일반', 0);
  await lcd(page).getByRole('button', { name: '전투 시작' }).click();
  await page.locator('.bha-battle').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  for (let i = 0; i < 3 && (await page.locator('.bha-tut').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
  // 적이 죽지 않게(캡처 동안) 적 체력을 크게
  await page.evaluate(() => { const s = window.__bhaCombat; if (s) { s.enemy.maxHp *= 50; s.enemy.hp = s.enemy.maxHp; } });
}
const spawnInfo = () => {
  const s = window.__bhaCombat;
  const pill = document.querySelector('.bha-v2role--spawn');
  const o = document.querySelector('.bha-lcd').getBoundingClientRect();
  const r = (q) => { const e = document.querySelector(q); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.left - o.left), y: Math.round(b.top - o.top), w: Math.round(b.width) }; };
  return { state: pill?.dataset.state, fill: pill?.querySelector('.bha-v2role__bar i')?.style.width, label: pill?.getAttribute('aria-label'), tray: s?.tray.length, cap: s?.params.trayCapacity, spawnTimer: s?.spawnTimer, sealTicks: s?.sealTicks,
    pill: r('.bha-v2role--spawn'), guard: r('.bha-v2role--guard'), item: r('.bha-v2role--item'), gear: r('.bha-v2role--gear'),
    cellsVisible: [...document.querySelectorAll('.bha-v2tray__grid .bha-block')].filter((b) => b.getBoundingClientRect().width > 0).length,
    veil: document.querySelectorAll('.bha-v2tray__veil').length };
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { runs: [] };
  try {
    for (const [fi, faction] of [[0, 'hollow'], [1, 'shinigami']]) {
      const p = faction === 'hollow' ? 'h' : 's';
      const run = { faction, errors: [] };
      const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
      page.on('pageerror', (e) => run.errors.push(e.message));
      await battle(page, server.url, fi, '5단계');
      if (BEFORE) {
        // 해방 오라 '전': 게이지를 채워 해방 → 오라 캡처
        await page.evaluate(() => { window.__bhaCombat.liberation.gauge = 1e9; });
        await page.waitForTimeout(300);
        await page.locator('.bha-v2herolib').click();
        await page.waitForTimeout(900);
        await lcd(page).screenshot({ path: path.join(OUT, `${p}-lib-before.png`) });
        proof.runs.push(run);
        await page.close();
        continue;
      }
      // ① 생성 게이지 차는 중 (블록 바를 비우고 반쯤 찬 순간)
      await page.evaluate(() => { const s = window.__bhaCombat; s.tray.length = 0; });
      await page.waitForTimeout(600);
      run.filling = await page.evaluate(spawnInfo);
      for (let i = 0; i < 20 && run.filling.state !== 'filling'; i++) { await page.waitForTimeout(150); run.filling = await page.evaluate(spawnInfo); }
      // 반쯤 찼을 때 찍는다
      for (let i = 0; i < 40; i++) { const f = parseInt((await page.evaluate(spawnInfo)).fill, 10); if (f >= 40 && f <= 70) break; await page.waitForTimeout(60); }
      run.filling = await page.evaluate(spawnInfo);
      if (fi === 0) await lcd(page).screenshot({ path: path.join(OUT, `${p}-spawn-filling.png`) });
      // ② 블록 칸 가득 (블록을 안 쓰고 기다림)
      for (let i = 0; i < 240; i++) { const v = await page.evaluate(spawnInfo); if (v.state === 'full') break; await page.waitForTimeout(250); }
      run.full = await page.evaluate(spawnInfo);
      if (fi === 0) await lcd(page).screenshot({ path: path.join(OUT, `${p}-spawn-full.png`) });
      // ③ 블록 생성 봉인: 블록을 조금 쓰고 봉인
      await page.evaluate(() => { const s = window.__bhaCombat; s.tray.length = Math.min(s.tray.length, 4); s.sealTicks = Math.round(6 / s.params.tickSeconds); });
      await page.waitForTimeout(500);
      run.sealed = await page.evaluate(spawnInfo);
      // 봉인 중 블록 사용 가능한지: 맨 오른쪽 블록 누르기
      const before = run.sealed.tray;
      const cell = page.locator('.bha-v2tray__grid > .bha-v2cell .bha-block').first();
      if (fi === 0) await lcd(page).screenshot({ path: path.join(OUT, `${p}-spawn-sealed.png`) });
      if (await cell.count()) { await cell.click(); await page.waitForTimeout(400); }
      run.sealedUse = { trayBefore: before, trayAfter: (await page.evaluate(spawnInfo)).tray };
      // ④ 해방 오라 '후'
      await page.evaluate(() => { const s = window.__bhaCombat; s.sealTicks = 0; s.liberation.gauge = 1e9; });
      await page.waitForTimeout(300);
      run.libReady = await page.evaluate(() => getComputedStyle(document.querySelector('.bha-unit--me .bha-unit__fig')).filter);
      if (fi === 0) await lcd(page).screenshot({ path: path.join(OUT, `${p}-lib-ready-after.png`) });
      await page.locator('.bha-v2herolib').click();
      await page.waitForTimeout(900);
      run.libOn = await page.evaluate(() => ({ app: getComputedStyle(document.querySelector('.bha-battle')).boxShadow, fig: getComputedStyle(document.querySelector('.bha-unit--me .bha-unit__fig')).filter, before: getComputedStyle(document.querySelector('.bha-unit--me .bha-unit__fig'), '::before').content }));
      await lcd(page).screenshot({ path: path.join(OUT, `${p}-lib-after.png`) });
      proof.runs.push(run);
      await page.close();
    }
  } finally {
    await browser.close();
    server.stop();
  }
  fs.writeFileSync(path.join(OUT, BEFORE ? 'proof-before.json' : 'proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 1).slice(0, 3000));
})();
