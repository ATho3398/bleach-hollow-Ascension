// C.220 (GDD 142장) proof: ① 3단계 → 4단계 진화 (새 단계 이름) ② 상태 화면 특성 칸 1칸 + 치명 두 줄 ③ 수련장 아란칼화/참백도 구상화 도전 칸
// ④ 옛 세이브(형식 56, 5단계 아란칼)를 불러온 뒤 4단계로 옮겨진 모습. 새 테스트 칸(?test=1). 저장 JSON 을 직접 고쳐 다시 연다.
// 캡처 docs/captures/c220/ (1배 844×390). 실행: node scripts/c220-proof.cjs (C220_URL=<주소> 면 그 주소)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c220');
const PORT = 5320;

async function startServer() {
  if (process.env.C220_URL) return { url: process.env.C220_URL, stop: () => {} };
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
  await skipTut(page);
}
/** 저장 JSON 의 지금 트랙 진화 상태·빌드를 고치고 다시 연다 (patch = 페이지 안에서 도는 함수 본문 문자열, 인자 d = 세이브) */
async function editSave(page, patch) {
  await page.evaluate((src) => {
    const fn = new Function('d', src);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const raw = localStorage.getItem(k);
      if (!raw || !raw.includes('"evolution"') || !raw.includes('"meta"')) continue;
      const d = JSON.parse(raw);
      fn(d);
      localStorage.setItem(k, JSON.stringify(d));
    }
  }, patch);
  await page.reload();
  await page.waitForTimeout(1500);
  const cont = page.getByRole('button', { name: '이어하기' });
  if (await cont.count()) { await cont.first().click().catch(() => {}); await page.waitForTimeout(500); }
  const slot = page.locator('.bha-slot').first();
  if (await slot.count()) { await slot.click().catch(() => {}); await page.getByRole('button', { name: '확인' }).click().catch(() => {}); await page.waitForTimeout(1500); }
  await skipTut(page);
}
const lcd = (page) => page.locator('.bha-lcd').first();
async function closeLayers(page) {
  for (let i = 0; i < 6 && (await page.locator('.bha-lcd [data-dev-layer]').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
}
async function openTest(page, tab) {
  await closeLayers(page);
  await lcd(page).getByRole('button', { name: '더보기' }).click();
  await page.waitForTimeout(500);
  await page.locator('.bha-homedock__tray').getByRole('button', { name: '테스트' }).click();
  await page.waitForTimeout(700);
  await page.locator('.bha-lcd .bha-viewtitle__btn').first().click();
  await page.locator('.bha-viewtitle__list').getByRole('option', { name: tab, exact: true }).click();
  await page.waitForTimeout(400);
}
async function back(page) {
  for (let i = 0; i < 4; i++) {
    if (await page.locator('.bha-room__status').count()) return;
    await page.locator('.bha-dev__btn--back').first().click().catch(() => {});
    await page.waitForTimeout(600);
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { shots: [], errors: [] };
  const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  try {
    // ── 호로: ① 3단계(아쥬커스_불) → 4단계 진화
    const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => proof.errors.push(e.message));
    await newGame(page, srv.url, 0);
    await editSave(page, `
      Object.assign(d.evolution, { tierIndex: 2, formId: 't3:fire', formHistory: ['t2:base', 't3:fire'], ability: 'atk', ev: { hp: 4, atk: 12, int: 6, def: 2, spr: 2, spd: 4 },
        abilities: { owned: { 'disp:atk': 1, 'el:fire': 1 }, equipped: ['el:fire'], slots: 1, ascendedEver: false } });
      d.build.owned = ['t-fire-a', 't-fire-b', 't-water-c']; d.build.slots = ['t-fire-a', 't-fire-b', 't-water-c', null, null]; d.build.equipOrder = ['t-fire-a', 't-fire-b', 't-water-c'];
      d.nest.hunger = 20; d.nest.condition = 80;
    `);
    await openTest(page, '진화');
    await page.getByRole('button', { name: '다음 진화' }).click({ timeout: 4000 });
    await page.waitForTimeout(4500);
    proof.evolvePath = await page.evaluate(() => document.querySelector('.bha-evolve__path')?.textContent ?? null);
    proof.evolveName = await page.evaluate(() => document.querySelector('.bha-evo__formname, .bha-evolve__name, h1')?.textContent ?? null);
    await shot(page, '01-evolve-3to4-hollow');
    for (let i = 0; i < 6; i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(400); }
    await closeLayers(page);
    await back(page);
    // ② 상태 화면: 특성 칸 1칸 + 평타·블록 치명 두 줄
    await page.locator('.bha-room__status').first().click({ timeout: 4000 });
    await page.waitForTimeout(900);
    const slots = page.locator('[data-ability-slots]').first();
    // 평타 치명 줄이 화면 위쪽에 오게 (그 아래 블록 치명·특성 칸까지 한 화면)
    await page.locator('[data-crit="basic"]').first().evaluate((el) => el.scrollIntoView({ block: 'start' })).catch(() => {});
    await page.waitForTimeout(300);
    proof.abilitySlots = await slots.textContent().catch(() => null);
    proof.critRows = await page.evaluate(() => [...document.querySelectorAll('[data-crit]')].map((e) => e.textContent));
    await shot(page, '02-status-slots-crit-hollow');
    await back(page);
    // ③ 수련장 → 수련 화면의 아란칼화 칸 (4단계라 도전 가능)
    await lcd(page).getByRole('button', { name: /수련장/ }).first().click({ timeout: 4000 }).catch(async () => { await page.locator('[data-prop="altar"], .bha-room__prop--altar').first().click({ timeout: 3000 }); });
    await page.waitForTimeout(900);
    const asc = page.locator('[data-training="ascension"]').first();
    await asc.scrollIntoViewIfNeeded().catch(() => {});
    proof.ascension = await asc.textContent().catch(() => null);
    await shot(page, '03-training-ascension-hollow');
    await page.close();

    // ── 호로: ④ 옛 세이브(형식 56, 5단계 아란칼 물 혼합) → 4단계로 옮겨진 모습 (아란칼화를 깬 것으로 — 아란칼 모습 유지)
    const sp = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
    sp.on('pageerror', (e) => proof.errors.push(e.message));
    await newGame(sp, srv.url, 0);
    await editSave(sp, `
      d.meta.format = 56;
      delete d.evolution.abilities;
      Object.assign(d.evolution, { tierIndex: 4, formId: 't5:water:mixed', formHistory: ['t2:base', 't3:base', 't4:water', 't5:water:mixed'], ability: 'spr', look: null, ev: { hp: 10, atk: 6, int: 14, def: 4, spr: 16, spd: 6 } });
      d.formDex = ['t2:base', 't3:base', 't4:water', 't5:water:mixed'];
      d.build.owned = ['t-water-a', 't-water-b', 't-water-c', 't-fire-b']; d.build.slots = ['t-water-a', 't-water-b', 't-water-c', 't-fire-b', null, null, null]; d.build.equipOrder = ['t-water-a', 't-water-b', 't-water-c', 't-fire-b'];
      d.rebirth.count = 1;
    `);
    proof.migrated = await sp.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const raw = localStorage.getItem(localStorage.key(i));
        if (raw && raw.includes('"evolution"') && raw.includes('"meta"')) { const d = JSON.parse(raw); return { format: d.meta.format, evolution: { tierIndex: d.evolution.tierIndex, formId: d.evolution.formId, formHistory: d.evolution.formHistory, ascended: d.evolution.ascended, look: d.evolution.look, abilities: d.evolution.abilities }, slots: d.build.slots.length }; }
      }
      return null;
    });
    await shot(sp, '04a-old-save-room-hollow');
    await sp.locator('.bha-room__status').first().click({ timeout: 4000 });
    await sp.waitForTimeout(900);
    const evoPanel = sp.locator('[data-evolution]').first();
    await evoPanel.scrollIntoViewIfNeeded().catch(() => {});
    proof.migratedEvo = await evoPanel.textContent().catch(() => null);
    await shot(sp, '04b-old-save-status-hollow');
    await sp.close();
  } catch (e) {
    proof.error = String(e && e.stack || e);
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), `${JSON.stringify(proof, null, 2)}\n`);
    await browser.close();
    srv.stop();
  }
  console.log(JSON.stringify(proof, null, 1).slice(0, 3000));
})();
