// C.226 (GDD 149·151장) proof: ① 3 → 4단계 같은 루트 진화(3단계 특성 → 4단계 특성으로 바뀜) ② 2 → 3단계 히든 통로(변이의 기운)
// ③ 2 → 3단계 망한 진화체(허우적 — 151장: 진화해도 남음) ④ 상태 화면 특성 칸 ⑤ 망한 진화체 → 4단계(허우적 남고 새 칸). ①은 151장 2 특성 칸 +1 행도. 새 테스트 칸(?test=1). 저장 JSON 을 직접 고쳐 다시 연다.
// 캡처 docs/captures/c226/ (1배 844×390). 실행: node scripts/c226-proof.cjs (C226_URL=<주소> 면 그 주소)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c226');
const PORT = 5326;

async function startServer() {
  if (process.env.C226_URL) return { url: process.env.C226_URL, stop: () => {} };
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
  const evolveNow = async (page, name) => {
    await openTest(page, '진화');
    await page.getByRole('button', { name: '다음 진화' }).click({ timeout: 4000 });
    await page.waitForTimeout(4500);
    proof[name] = await page.evaluate(() => ({
      path: document.querySelector('.bha-evolve__path')?.textContent ?? null,
      rows: [...document.querySelectorAll('.bha-evolve__effects .bha-info__row')].map((r) => r.textContent),
    }));
    await shot(page, name);
    for (let i = 0; i < 6; i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(400); }
    await closeLayers(page);
    await back(page);
  };
  try {
    const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => proof.errors.push(e.message));
    await newGame(page, srv.url, 0);
    const water = `d.build.owned = ['t-water-a', 't-water-b', 't-water-c']; d.build.slots = ['t-water-a', 't-water-b', 't-water-c', null]; d.build.equipOrder = ['t-water-a', 't-water-b', 't-water-c'];`;
    // ① 2단계 → 3단계 물(새로 받음) → 4단계 물(같은 루트): 3단계 특성 → 4단계 특성
    await editSave(page, `
      Object.assign(d.evolution, { tierIndex: 1, formId: 't2:base', formHistory: ['t2:base'], ability: 'atk', ev: { hp: 4, atk: 12, int: 6, def: 2, spr: 2, spd: 4 },
        abilities: { owned: {}, equipped: [], slots: 1, ascendedEver: false } });
      ${water} d.nest.hunger = 20; d.nest.condition = 80;
    `);
    await evolveNow(page, 'tmp-2to3');
    fs.rmSync(path.join(OUT, 'tmp-2to3.png'), { force: true });
    proof.shots = proof.shots.filter((x) => x !== 'tmp-2to3.png');
    await evolveNow(page, '01-evolve-3to4-replaced');
    // ② 2단계 → 3단계 히든 통로 (돌파 여러 번 = 통로 조건): 변이의 기운. 칸 2 (4단계 물 특성 + 빈 칸)
    for (let seed = 1; seed <= 12; seed++) {
      await editSave(page, `
        Object.assign(d.evolution, { tierIndex: 1, formId: 't2:base', formHistory: ['t2:base'], breakthroughs: 20, stageSeed: ${seed * 7919},
          abilities: { owned: { 'el4:water': 1.5 }, equipped: ['el4:water'], slots: 2, ascendedEver: false } }); d.rebirth.count = 1;
        ${water} d.nest.hunger = 20; d.nest.condition = 80;
      `);
      await evolveNow(page, '02-evolve-2to3-passage');
      if ((proof['02-evolve-2to3-passage'].rows || []).join(' ').includes('변이의 기운')) break;
    }
    // ③ 2단계 → 3단계 망한 진화체 (허기 85 이상 = 돌봄 실패): 허우적
    await editSave(page, `
      Object.assign(d.evolution, { tierIndex: 1, formId: 't2:base', formHistory: ['t2:base'], breakthroughs: 0,
        abilities: { owned: { 'el4:water': 1.5 }, equipped: ['el4:water'], slots: 2, ascendedEver: false } }); d.rebirth.count = 1;
      ${water} d.nest.hunger = 95; d.nest.condition = 80;
    `);
    await evolveNow(page, '03-evolve-2to3-fail');
    // ④ 상태 화면 특성 칸 (4단계 물 특성 + 허우적 '4단계 진화 때 바뀐다')
    await page.locator('.bha-room__status').first().click({ timeout: 4000 });
    await page.waitForTimeout(900);
    const slots = page.locator('[data-ability-slots]').first();
    await slots.evaluate((el) => el.scrollIntoView({ block: 'center' })).catch(() => {});
    await page.waitForTimeout(300);
    proof.abilitySlots = await slots.textContent().catch(() => null);
    proof.save = await page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const raw = localStorage.getItem(localStorage.key(i));
        if (raw && raw.includes('"evolution"') && raw.includes('"meta"')) { const d = JSON.parse(raw); return { format: d.meta.format, formHistory: d.evolution.formHistory, abilities: d.evolution.abilities, evolutions: d.runLog.tiers.evolutions.map((r) => r.abilityGain ?? null) }; }
      }
      return null;
    });
    await shot(page, '04-status-ability-slots');
    // ⑤ 망한 진화체 → 4단계 (151장 1·2): 허우적은 남고 4단계 진화 칸 +1 에 4단계 특성
    await editSave(page, `
      Object.assign(d.evolution, { tierIndex: 2, formId: 'h3:fail', formHistory: ['t2:base', 'h3:fail'], breakthroughs: 0, steps: 999,
        abilities: { owned: { 'el4:water': 1.5, 'uniq:fail': 1 }, equipped: ['el4:water', 'uniq:fail'], slots: 2, tier4Ever: false } }); d.rebirth.count = 1;
      d.build.owned = ['t-fire-a', 't-fire-b', 't-fire-c']; d.build.slots = ['t-fire-a', 't-fire-b', 't-fire-c', null, null]; d.build.equipOrder = ['t-fire-a', 't-fire-b', 't-fire-c'];
      d.nest.hunger = 20; d.nest.condition = 80;
    `);
    await evolveNow(page, '05-evolve-fail-to-4');
    await page.close();
  } catch (e) {
    proof.error = String(e && e.stack || e);
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), `${JSON.stringify(proof, null, 2)}\n`);
    await browser.close();
    srv.stop();
  }
  console.log(JSON.stringify(proof, null, 1).slice(0, 4000));
})();
