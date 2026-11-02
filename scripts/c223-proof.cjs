// C.223 proof (GDD 144·145장): ① 걷기 중 [가방]에서 회복 물건 사용 ② 전투 [소모품] 칸 회복약 ③ 온천 5분 막대(조금 찬 모습) ④ 상점 약 칸 하루 남은 수.
// 새 게임(호로, ?test=1) → 저장을 고쳐(첫 원정·홈 안내 끝, 체력 30%, 소모품 칸 = 회복약) 다시 연다. 캡처 docs/captures/c223/ (1배 844×390).
// 실행: node scripts/c223-proof.cjs (C223_URL=<주소> 면 그 주소)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c223');
const PORT = 5323;

async function startServer() {
  if (process.env.C223_URL) return { url: process.env.C223_URL, stop: () => {} };
  const p = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe', detached: true });
  const url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) return { url, stop: () => { try { process.kill(-p.pid); } catch { /* 이미 */ } } }; } catch { /* 아직 */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  try { process.kill(-p.pid); } catch { /* */ }
  throw new Error('vite 서버가 뜨지 않았다');
}

async function skipTut(page) {
  for (let t = 0; t < 40 && (await page.locator('.bha-tut').count()); t++) {
    const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled])').filter({ visible: true });
    if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
    else await page.locator('.bha-lcd').first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
}

/** 저장의 지금 트랙을 고친다 */
async function patchSave(page, fn) {
  await page.evaluate((src) => {
    const f = new Function('t', 'shared', src);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const raw = localStorage.getItem(k);
      if (!raw || !raw.includes('"runLog"')) continue;
      const data = JSON.parse(raw);
      const walk = (o) => {
        if (!o || typeof o !== 'object') return;
        if (o.nest && o.help && o.runLog) f(o, o.shared);
        for (const v of Object.values(o)) walk(v);
      };
      walk(data);
      localStorage.setItem(k, JSON.stringify(data));
    }
  }, fn);
}

async function reopen(page) {
  await page.reload();
  await page.waitForTimeout(1500);
  const cont = page.getByRole('button', { name: '이어하기' });
  if (await cont.count()) { await cont.first().click().catch(() => {}); await page.waitForTimeout(500); }
  const slot = page.locator('.bha-slot').first();
  if (await slot.count()) { await slot.click().catch(() => {}); await page.getByRole('button', { name: '확인' }).click().catch(() => {}); await page.waitForTimeout(1500); }
  await skipTut(page);
}

const screens = (page) => page.evaluate(() => [...document.querySelectorAll('.bha-lcd .bha-app')].map((e) => e.className.replace('bha-app ', '')).join('|'));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const proof = { shots: [], errors, trace: [] };
  const shot = async (name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  const lcd = page.locator('.bha-lcd').first();
  try {
    await page.goto(`${srv.url}?test=1`);
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${srv.url}?test=1`);
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: '새로 시작' }).click();
    await page.waitForTimeout(300);
    await page.locator('.bha-slot').first().click();
    await page.getByRole('button', { name: '확인' }).click();
    await page.waitForTimeout(300);
    await page.locator('.bha-species__card').nth(0).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '시작', exact: true }).click();
    await page.waitForTimeout(2000);
    await skipTut(page);
    // 첫 원정·홈 안내 끝, 골드, 체력 30%, 전투 소모품 칸 = 회복약
    await patchSave(page, `
      t.help.guides = { ...t.help.guides, 'first-run': 'done', 'home-intro': 'done', 'first-run-room': 'done', 'birth': 'done' };
      t.nest.hpFraction = 0.3; t.nest.hunger = 20; t.nest.condition = 60;
      if (shared) { shared.tradeCoins = 2000; shared.battleItem = 'heal-salve'; }
    `);
    await reopen(page);
    proof.trace.push(['room', await screens(page)]);

    // ④ 상점 약 칸: 반창고 1개 사서 '오늘 4/5'
    await page.locator('.bha-prop--outside').first().click({ timeout: 4000 });
    await page.waitForTimeout(1200);
    await page.locator('.bha-worldmap [data-place="market"]').click({ timeout: 4000 });
    await page.waitForTimeout(2500);
    await page.locator('.bha-market [data-spot="shop"]').click({ timeout: 4000 });
    await page.waitForTimeout(800);
    await page.locator('.bha-itemtab[data-tab="medicine"]').click();
    await page.waitForTimeout(400);
    await page.locator('.bha-itemcard[data-item="heal-patch"]').click();
    await page.waitForTimeout(400);
    await page.locator('.bha-itemdialog [data-act="buy"], .bha-itemdialog .bha-btn--primary').first().click().catch(() => {});
    await page.waitForTimeout(800);
    proof.shopHave = await page.evaluate(() => [...document.querySelectorAll('.bha-itemcard')].map((c) => `${c.dataset.item}: ${c.querySelector('.bha-itemcard__badge')?.textContent ?? ''}`));
    await shot('04-shop-medicine-daily');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.locator('.bha-dev__btn--back').first().click().catch(() => {});
    await page.waitForTimeout(1000);
    proof.trace.push(['after-shop', await screens(page)]);
    if (!(await page.locator('.bha-market').count())) { await page.locator('.bha-worldmap [data-place="market"]').click({ timeout: 4000 }); await page.waitForTimeout(2500); }

    // ③ 온천 5분: 밖으로 → 시장 → 온천, 6초 뒤 (체력 30% → 32%쯤)
    await page.locator('.bha-market [data-spot="spa"]').click({ timeout: 4000 });
    await page.waitForTimeout(6000);
    proof.spa = await page.evaluate(() => document.querySelector('.bha-spa__status')?.getAttribute('aria-label') ?? null);
    await page.locator('.bha-spa__hud .bha-info-tip, .bha-spa__hud button[aria-label*="쉬는 중"]').first().click().catch(() => {});
    await page.waitForTimeout(500);
    proof.spaInfo = await page.evaluate(() => document.querySelector('.bha-pop')?.textContent ?? null);
    await shot('03-spa-5min');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    // 방으로
    await page.locator('.bha-spa__hud .bha-btn').first().click().catch(() => {});
    await page.waitForTimeout(3500);
    proof.trace.push(['after-spa', await screens(page)]);
    if (!(await screens(page)).includes('bha-room')) { await page.locator('.bha-dev__btn--back').first().click().catch(() => {}); await page.waitForTimeout(1500); }
    if (!(await screens(page)).includes('bha-room')) { await page.locator('.bha-worldmap [data-place="home"]').click().catch(() => {}); await page.waitForTimeout(2500); }
    proof.trace.push(['room2', await screens(page)]);

    // ① 원정: 밖으로 → 모험 → 출발 (원정 준비 화면은 주 버튼을 눌러 나아간다)
    for (let t = 0; t < 4 && !(await page.locator('.bha-worldmap').count()); t++) {
      if (await page.locator('.bha-prop--outside').count()) await page.locator('.bha-prop--outside').first().click().catch(() => {});
      else await page.locator('.bha-dev__btn--back').first().click().catch(() => {});
      await page.waitForTimeout(1500);
    }
    await page.locator('.bha-worldmap [data-place="adventure"]').click({ timeout: 4000 });
    await page.waitForTimeout(2500);
    for (let t = 0; t < 30 && !(await page.locator('.bha-exp').count()); t++) {
      proof.trace.push(['depart', await screens(page)]);
      await skipTut(page);
      const go = lcd.locator('button.bha-btn--primary:not([disabled])').filter({ visible: true });
      if (await go.count()) await go.last().click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(700);
    }
    await skipTut(page);
    await page.waitForTimeout(1500);
    for (let t = 0; t < 40 && !(await page.locator('.bha-exp__bag:not([disabled])').count()); t++) {
      const ev = page.locator('.bha-event button.bha-btn').filter({ visible: true });
      if (await ev.count()) await ev.first().click({ timeout: 1000 }).catch(() => {});
      await page.waitForTimeout(400);
    }
    await page.locator('.bha-exp__bag:not([disabled])').click({ timeout: 4000 });
    await page.waitForTimeout(500);
    await page.locator('.bha-healbag .bha-itemcard[data-item="heal-patch"]').click();
    await page.waitForTimeout(700); // 막대가 차는 중
    proof.bag = await page.evaluate(() => ({ cards: [...document.querySelectorAll('.bha-healbag .bha-itemcard')].map((c) => c.getAttribute('aria-label')), hp: document.querySelector('.bha-healbag .bha-meter')?.textContent ?? null }));
    await shot('01-walk-bag-heal');
    await page.locator('.bha-healbag .bha-btn--ghost').filter({ hasText: '닫기' }).click().catch(() => {});
    await page.waitForTimeout(500);

    // ② 전투 [소모품] 칸 = 회복약 (첫 전투까지 걷는다)
    for (let t = 0; t < 120 && !(await page.locator('.bha-battle').count()); t++) {
      await skipTut(page);
      const ev = page.locator('.bha-event button.bha-btn, .bha-sheet button.bha-btn--primary').filter({ visible: true });
      if (await ev.count()) await ev.first().click({ timeout: 1000 }).catch(() => {});
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(1500);
    await skipTut(page);
    proof.battleItem = await page.evaluate(() => [...document.querySelectorAll('.bha-battle button')].map((b) => b.getAttribute('aria-label') || b.textContent).filter((x) => x && /회복약|소모품/.test(x)));
    await shot('02-battle-item-salve');
  } catch (e) {
    proof.fail = String(e);
    await page.screenshot({ path: path.join(OUT, 'zz-fail.png') }).catch(() => {});
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    console.log(JSON.stringify(proof, null, 1).slice(0, 3000));
    await browser.close();
    srv.stop();
    process.exit(0);
  }
})();
