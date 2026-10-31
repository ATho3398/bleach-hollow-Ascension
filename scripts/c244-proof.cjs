// C.244 proof (GDD 163장): 흡수 갈래 고르기 → 설명 칸. c236-proof 바탕. 사신(C244_FI=1 기본, 0 = 호로).
// 새 게임(?test=1) → 안내 끝낸 저장 → 모험 ★1 → 흡수 화면: 갈래 4개 고르기(손가락·기기 ▲▼) → 원정 중간 저장 고쳐 다시 열기(한계 경고·첫 흡수 연습). 캡처 docs/captures/c244/ (1배 844×390). 실행: node scripts/c244-proof.cjs
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c244');
const PORT = 5344;

async function startServer() {
  if (process.env.C244_URL) return { url: process.env.C244_URL, stop: () => {} };
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

async function reopen(page, skip = true) {
  await page.reload();
  await page.waitForTimeout(1500);
  const cont = page.getByRole('button', { name: '이어하기' });
  if (await cont.count()) { await cont.first().click().catch(() => {}); await page.waitForTimeout(500); }
  const slot = page.locator('.bha-slot').first();
  if (await slot.count()) { await slot.click().catch(() => {}); await page.getByRole('button', { name: '확인' }).click().catch(() => {}); await page.waitForTimeout(1500); }
  if (skip) await skipTut(page);
}

const screens = (page) => page.evaluate(() => [...document.querySelectorAll('.bha-lcd .bha-app')].map((e) => e.className.replace('bha-app ', '')).join('|'));



(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const proof = { shots: [], errors, trace: [], desc: {} };
  const PFX = process.env.C244_PFX ?? '';
  const shot = async (name) => { await page.screenshot({ path: path.join(OUT, `${PFX}${name}.png`) }); proof.shots.push(`${PFX}${name}.png`); };
  const DEV = { up: '위', down: '아래', ok: '확정', back: '취소' };
  const devBtn = (k) => page.locator(`.bha-dev__btn[aria-label="${DEV[k]}"]`).first().click().catch(() => {});
  const state = () => page.evaluate(() => ({
    sel: document.querySelector('.bha-lcd .bha-sel')?.textContent.trim() ?? null,
    on: document.querySelector('.bha-absorbpage button[data-mode].is-on')?.dataset.mode ?? null,
    desc: [...document.querySelectorAll('.bha-absorbpage .bha-absorb__desc p')].map((p) => p.textContent),
    step: document.querySelector('.bha-absorbpage .bha-h1')?.textContent ?? null,
    buttons: [...document.querySelectorAll('.bha-absorbpage button[data-mode]')].map((b) => b.textContent.trim()),
  }));
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
    await page.locator('.bha-species__card').nth(Number(process.env.C244_FI ?? 1)).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '시작', exact: true }).click();
    await page.waitForTimeout(2000);
    await skipTut(page);
    await patchSave(page, `
      t.help.guides = { ...t.help.guides, 'first-run': 'done', 'home-intro': 'done', 'first-run-room': 'done', 'birth': 'done', 'recover': 'done' };
    `);
    await reopen(page);
    await page.locator('.bha-prop--outside').first().click({ timeout: 4000 });
    await page.waitForTimeout(1200);
    await page.locator('.bha-worldmap [data-place="adventure"]').click({ timeout: 4000 });
    await page.waitForTimeout(1500);
    for (let i = 0; i < 6 && (await page.locator('.bha-lcd [data-dev-layer]').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
    await page.locator('.bha-lcd').getByRole('button', { name: '★1', exact: true }).click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(500);
    await page.locator('.bha-lcd').getByRole('button', { name: '출발' }).first().click({ timeout: 3000 }).catch(() => proof.trace.push(['no-depart']));
    await page.waitForTimeout(1200);
    const vis = (loc) => loc.filter({ visible: true });
    const toAbsorb = async () => {
      for (let t = 0; t < 600 && !(await page.locator('.bha-absorbpage').count()); t++) {
        const layerGo = vis(page.locator('.bha-lcd [data-dev-layer] button.bha-btn--primary'));
        const eat = vis(page.getByRole('button', { name: /하러 가기$/ }));
        if (await eat.count()) await eat.first().click({ timeout: 2000 }).catch(() => {});
        else if (await layerGo.count()) await layerGo.first().click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(500);
      }
      await page.waitForTimeout(800);
    };
    await toAbsorb();
    // 1 들어온 직후: 첫 갈래 골라짐 + 설명 칸
    proof.desc.enter = await state();
    await shot('1-enter-both');
    // 2 기기 ▼ = 다음 갈래 고르기만 (실행 안 됨)
    await devBtn('down');
    await page.waitForTimeout(300);
    proof.desc.devDown = await state();
    await shot('2-trait-device');
    // 3 손가락: 능력치 흡수 한 번 = 고르기만
    await page.locator('.bha-absorbpage button[data-mode="stat"]').click();
    await page.waitForTimeout(300);
    proof.desc.stat = await state();
    await shot('3-stat');
    await page.locator('.bha-absorbpage button[data-mode="none"]').click();
    await page.waitForTimeout(300);
    proof.desc.none = await state();
    await shot('4-release');
    // 5 한계 경고: 원정 중간 저장의 리스크를 99 로 고쳐 다시 연다
    await patchSave(page, `if (t.activeExpedition) { const e = t.activeExpedition.exp ?? t.activeExpedition; e.risk = 99; }`);
    await reopen(page);
    await toAbsorb();
    proof.desc.warn = await state();
    await shot('5-warn');
    // 6 같은 버튼 두 번 = 실행 (정화 흡수 → 특성 고르기 단계)
    proof.trace.push(['before-6', await screens(page), await page.evaluate(() => document.querySelectorAll('.bha-absorbpage button[data-mode]').length)]);
    await page.locator('.bha-absorbpage button[data-mode="both"]').click({ timeout: 5000 }).catch((e) => proof.trace.push(['click-6-fail', String(e).slice(0, 200)]));
    await page.waitForTimeout(400);
    proof.desc.afterSecond = await state();
    // 7 첫 흡수 연습: 같은 저장을 tutorial 로 고쳐 다시 연다
    await devBtn('back');
    await page.waitForTimeout(400);
    await patchSave(page, `if (t.activeExpedition) { const e = t.activeExpedition.exp ?? t.activeExpedition; e.tutorial = true; e.risk = 0; }`);
    await reopen(page, false);
    for (let t = 0; t < 40 && !(await page.locator('.bha-absorbpage').count()); t++) await page.waitForTimeout(300);
    await page.waitForTimeout(1200);
    proof.desc.tutorial = await state();
    proof.tutCard = await page.evaluate(() => document.querySelector('.bha-tut')?.textContent.replace(/\s+/g, ' ') ?? null);
    await shot('6-tutorial-card1');
    await page.locator('.bha-tut button.bha-btn--primary').filter({ visible: true }).first().click({ timeout: 2000 }).catch((e) => proof.trace.push(['tut-next-fail', String(e).slice(0, 160)]));
    await page.waitForTimeout(800);
    proof.tutHole = await page.evaluate(() => { const h = document.querySelector('.bha-tut__hole:not(.is-none)'); const m = document.querySelector('.bha-absorb__actions--modes'); const r = (e) => e && (({ x, y, width, height }) => [Math.round(x), Math.round(y), Math.round(width), Math.round(height)])(e.getBoundingClientRect()); return { hole: r(h), modes: r(m) }; });
    await page.waitForTimeout(600);
    proof.tutCard2 = await page.evaluate(() => document.querySelector('.bha-tut')?.textContent.replace(/\s+/g, ' ') ?? null);
    await shot('7-tutorial-card2');
  } finally {
    fs.writeFileSync(path.join(OUT, `${PFX}proof.json`), JSON.stringify(proof, null, 2));
    await browser.close();
    srv.stop();
  }
  console.log(JSON.stringify(proof, null, 1));
  process.exit(0);
})();
