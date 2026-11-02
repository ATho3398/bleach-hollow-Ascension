// C.227 proof (GDD 150장): ① 시장의 상점 4곳 ② 방 [상점] 고르는 창 ③ 특성 상점 ④ 상태 화면 특성 칸(진화 특성 보기 전용 + 탈착 특성 [빼기]).
// 새 게임(호로, ?test=1) → 저장을 고쳐 다시 연다. 캡처 docs/captures/c227/ (1배 844×390). 실행: node scripts/c227-proof.cjs (C227_URL=<주소>)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c227');
const PORT = 5327;

async function startServer() {
  if (process.env.C227_URL) return { url: process.env.C227_URL, stop: () => {} };
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
  const DEV = { up: '위', down: '아래', ok: '확정', back: '취소' };
  const devBtn = (k) => page.locator(`.bha-dev__btn[aria-label="${DEV[k]}"]`).first().click().catch(() => {});
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
    await patchSave(page, `
      t.help.guides = { ...t.help.guides, 'first-run': 'done', 'home-intro': 'done', 'first-run-room': 'done', 'birth': 'done', 'recover': 'done' };
      if (shared) { shared.tradeCoins = 3000; }
      PATCH_EXTRA
    `.replace('PATCH_EXTRA', process.env.C227_PATCH ?? ''));
    await reopen(page);
    proof.trace.push(['room', await screens(page)]);

    // ① 시장의 상점 4곳
    await page.locator('.bha-prop--outside').first().click({ timeout: 4000 });
    await page.waitForTimeout(1200);
    await page.locator('.bha-worldmap [data-place="market"]').click({ timeout: 4000 });
    await page.waitForTimeout(2500);
    proof.spots = await page.evaluate(() => [...document.querySelectorAll('.bha-market [data-spot]')].map((b) => `${b.dataset.spot}: ${b.textContent}`));
    await shot('01-market-4-shops');
    // 기기 ▼ 로 첫 상점(소모품) → ✓
    await page.locator('.bha-market [data-spot="shop"]').click({ timeout: 4000 });
    await page.waitForTimeout(800);
    proof.consumable = await page.evaluate(() => ({ title: document.querySelector('.bha-shop h1, .bha-shop .bha-lcdhead__title')?.textContent, tabs: [...document.querySelectorAll('.bha-itemtab')].map((t) => t.textContent) }));
    await devBtn('back');
    await page.waitForTimeout(800);
    // ③ 특성 상점
    await page.locator('.bha-market [data-spot="traitShop"]').click({ timeout: 4000 });
    await page.waitForTimeout(800);
    proof.trait = await page.evaluate(() => ({ cards: [...document.querySelectorAll('.bha-itemcard')].map((c) => `${c.dataset.item}: ${c.textContent}`) }));
    // 집중 하나 사기 → 산 뒤 모습(③)
    await page.locator('.bha-itemcard[data-item="trait-focus"]').click().catch(() => {});
    await page.waitForTimeout(400);
    await page.locator('.bha-itemdialog [data-act="buy"]').first().click().catch(() => {});
    await page.waitForTimeout(500);
    await page.locator('.bha-confirm .bha-btn--primary').first().click().catch(() => {});
    await page.waitForTimeout(900);
    proof.afterBuy = await page.evaluate(() => ({ cards: [...document.querySelectorAll('.bha-itemcard')].map((c) => `${c.dataset.item}: ${c.textContent}`), note: document.querySelector('.bha-shop p.bha-small')?.textContent }));
    await page.waitForTimeout(2200);
    await shot('03-trait-shop');
    await page.goto(`${srv.url}?test=1`);
    // ② 방 [상점] 고르는 창 (빈사일 때 위 줄 버튼)
    await patchSave(page, `t.nest.collapsed = true; t.nest.collapsedAt = Date.now(); t.nest.hpFraction = 0.05;`);
    await reopen(page);
    const btn = page.locator('.bha-room__hud button', { hasText: '상점' }).first();
    await btn.click({ timeout: 4000 });
    await page.waitForTimeout(600);
    await devBtn('down');
    await page.waitForTimeout(300);
    proof.picker = await page.evaluate(() => ({ btns: [...document.querySelectorAll(".bha-shoppick button")].map((b) => b.textContent), focus: document.activeElement?.textContent }));
    await shot('02-room-shop-picker');
    await devBtn('ok');
    await page.waitForTimeout(800);
    proof.pickedTitle = await page.evaluate(() => document.querySelector('.bha-shop')?.dataset.shop);
    // ④ 상태 화면 특성 칸: 진화 특성 1(보기 전용) + 탈착 특성 1([빼기]) + 빈 칸([끼우기]). 환생 2회 = 칸 3
    await page.goto(`${srv.url}?test=1`);
    await patchSave(page, `t.nest.collapsed = false; t.nest.hpFraction = 1; t.rebirth.count = 2;
      t.evolution.abilities = { owned: { 'el:water': 1 }, equipped: ['el:water'], slots: 3, tier4Ever: false, detached: ['focus'] };
      if (shared) shared.traits = ['focus', 'tough', 'sharpen'];`);
    await reopen(page);
    await page.locator('.bha-room__status').first().click({ timeout: 4000 });
    await page.waitForTimeout(900);
    const slots = page.locator('[data-ability-slots]').first();
    await slots.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(300);
    proof.status = await page.evaluate(() => [...document.querySelectorAll('[data-ability-slot]')].map((e) => `${e.textContent} [${[...e.querySelectorAll('button')].map((b) => b.textContent).join(',')}]`));
    await shot('04-status-ability-slots');
    // [끼우기] → 질긴 몸 → 칸 3/3
    await page.locator('[data-act="detach-in"]').first().click().catch(() => {});
    await page.waitForTimeout(500);
    proof.equipPick = await page.evaluate(() => [...document.querySelectorAll('.bha-shoppick button')].map((b) => b.textContent));
    await page.locator('.bha-shoppick [data-pick="tough"]').click().catch(() => {});
    await page.waitForTimeout(800);
    proof.statusAfterEquip = await page.evaluate(() => [...document.querySelectorAll('[data-ability-slot]')].map((e) => e.textContent));
  } catch (e) {
    proof.fatal = String(e && e.stack || e);
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close();
    srv.stop();
  }
})();
