// C.397 proof (GDD 241-D 1~4·6·8, c393-proof 기반): 가방 장비 탭(무기·방어구·신발·장신구 3·펫 칸, 가로 드래그 탭, 재화 칩) · 펫 분류 · 펫 공격 전투. 1배 844×390, 두 종족.
// 실행: node scripts/c397-proof.cjs (C249_URL=<주소>) — 캡처 docs/captures/c397/
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.C249_OUT ?? path.join(ROOT, 'docs/captures/c397');
const PART = process.env.C249_PART ?? 'all';
const PORT = 5397;

async function startServer() {
  if (process.env.C249_URL) return { url: process.env.C249_URL, stop: () => {} };
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
  const load = page.getByRole('button', { name: '불러오기' });
  if (!(await page.locator('.bha-slot').count()) && (await load.count())) { await load.first().click().catch(() => {}); await page.waitForTimeout(600); }
  const slot = page.locator('.bha-slot').first();
  if (await slot.count()) { await slot.click().catch(() => {}); await page.getByRole('button', { name: '확인' }).click().catch(() => {}); await page.waitForTimeout(1500); }
  await skipTut(page);
}


async function newGame(page, base, fi) {
  await page.goto(`${base}?test=1`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${base}?test=1`);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '새로 시작' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-slot').first().click();
  await page.getByRole('button', { name: '확인' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-species__card').nth(fi).click();
  await page.waitForTimeout(300);
  const yes = page.getByRole('button', { name: /^(시작|네)$/ });
  await yes.first().click();
  await page.waitForTimeout(400);
  const nameIn = page.locator('[data-ident="name"]');
  if (await nameIn.count()) {
    await nameIn.fill('시험');
    await page.locator('[data-ident="next"]').click().catch(() => {});
    await page.waitForTimeout(200);
    await page.locator('.bha-ident__gender').first().click().catch(() => {});
    await page.locator('[data-ident="done"]').click().catch(() => {});
  }
  await page.waitForTimeout(2000);
  await skipTut(page);
}

async function runFaction(browser, fi, proof) {
  const tag = ['hollow', 'shinigami'][fi];
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => proof.errors.push(`${tag}: ${e.message}`));
  const shot = async (name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  try {
    await newGame(page, proof.url, fi);
    await patchSave(page, `
      t.help.guides = { ...t.help.guides, 'first-run': 'done', 'home-intro': 'done', 'first-run-room': 'done', 'birth': 'done', 'recover': 'done' };
      t.nest.hunger = 60; t.nest.condition = 80; t.nest.hpFraction = 1; t.nest.spa = null;
      shared.tradeCoins = 1234; shared.jade = 56;
      const mk = (uid, kind, grade, stats, plus) => ({ uid, kind, grade, star: 1, stats, special: null, plus, gotAt: 1 });
      shared.gear.items = [mk('g1','weapon','rare',{atk:5},2), mk('g2','armor','normal',{hp:4,def:3},0), mk('g3','shoes','epic',{spd:4},1), mk('g4','accessory','rare',{spr:3},0), mk('g5','accessory','normal',{crit:0.01},0), mk('g6','accessory','legendary',{int:6},3), mk('g7','accessory','normal',{hp:2},0)];
      shared.gear.equipped = { weapon: 'g1', armor: 'g2', shoes: 'g3', acc1: 'g4', acc2: 'g5', acc3: 'g6' };
      shared.gear.nextId = 8;
      shared.pets.owned = { 'pet-gold': { laps: 12, gotAt: 1 }, 'pet-guard': { laps: 0, gotAt: 2 } };
      shared.pets.active = 'pet-gold';
    `);
    await reopen(page);
    await page.getByRole('button', { name: '가방' }).first().click({ timeout: 4000 });
    await page.waitForTimeout(700);
    await page.locator('.bha-chest-page [role="tab"][data-tab="gear"]').first().click().catch(() => {});
    await page.waitForTimeout(500);
    await shot(`${tag}-01-gear`);
    const m = await page.evaluate(() => {
      const tabs = document.querySelector('.bha-eqright .bha-itemtabs');
      return { slots: [...document.querySelectorAll('.bha-eqslot')].map((b) => b.getAttribute('aria-label')), tabs: [...(tabs?.querySelectorAll('[role="tab"]') ?? [])].map((t) => t.textContent), tabScroll: tabs ? [tabs.scrollWidth, tabs.clientWidth] : null, wallet: [...document.querySelectorAll('.bha-bagwallet .bha-chip')].map((c) => c.getAttribute('aria-label')), headTabs: [...document.querySelectorAll('.bha-chest-page .bha-lcdpage__aside [role="tab"]')].map((t) => t.dataset.tab) };
    });
    proof.trace.push({ tag, ...m });
    // 탭 줄 가로 드래그 (마우스)
    const tb = await page.locator('.bha-eqright .bha-itemtabs').boundingBox();
    if (tb) { await page.mouse.move(tb.x + tb.width - 10, tb.y + tb.height / 2); await page.mouse.down(); await page.mouse.move(tb.x + 10, tb.y + tb.height / 2, { steps: 8 }); await page.mouse.up(); }
    await page.waitForTimeout(200);
    proof.trace.push({ tag, dragScrollLeft: await page.evaluate(() => document.querySelector('.bha-eqright .bha-itemtabs')?.scrollLeft ?? null) });
    await page.locator('.bha-eqright [role="tab"][data-tab="pet"]').click();
    await page.waitForTimeout(400);
    await shot(`${tag}-02-pet-tab`);
    await page.locator('.bha-eqslot--pet').click();
    await page.waitForTimeout(400);
    await shot(`${tag}-03-pet-dialog`);
    await page.keyboard.press('Escape');
    // 전투: 테스트 패널 바로 전투 (펫 공격)
    await reopen(page);
    await page.getByRole('button', { name: '더보기' }).first().click({ timeout: 4000 });
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: '테스트' }).first().click({ timeout: 4000 });
    await page.waitForTimeout(600);
    await page.locator('.bha-viewtitle button').first().click({ timeout: 4000 });
    await page.waitForTimeout(400);
    await page.getByText('바로 전투', { exact: true }).first().click({ timeout: 4000 });
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: '전투 시작' }).click({ timeout: 4000 });
    let got = false;
    for (let w = 0; w < 400 && !got; w++) {
      await page.waitForTimeout(25);
      got = await page.evaluate(() => !!document.querySelector('.bha-pet--battle.is-pounce'));
    }
    await page.waitForTimeout(120);
    await shot(`${tag}-04-battle-pet${got ? '' : '-none'}`);
  } catch (e) {
    proof.errors.push(`${tag}: ${String(e.message).split('\n')[0]}`);
    await shot(`${tag}-fail`).catch(() => {});
  }
  await page.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { url: srv.url, shots: [], errors: [], trace: [] };
  try {
    for (const fi of (process.env.C397_F ?? '0,1').split(',').map(Number)) await runFaction(browser, fi, proof);
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close();
    srv.stop();
  }
  console.log(JSON.stringify(proof, null, 1));
  process.exit(0);
})();
