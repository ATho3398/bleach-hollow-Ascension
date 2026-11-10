// C.372 proof (GDD 227장 보충, c369-proof 기반): 강적 강공격 빨간 세로가 몸마다 입에서 나가는지 — 테스트 패널 바로 전투(상대 = 이름), 세로가 다 뻗은 순간면 도트 이펙트·투사체·연결 동작. 1배 844×390, 두 종족.
// 실행: node scripts/c372-proof.cjs (C249_URL=<주소>) — 캡처 docs/captures/c372/
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.C249_OUT ?? path.join(ROOT, 'docs/captures/c372');
const PART = process.env.C249_PART ?? 'all';
const PORT = 5381;

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

const screens = (page) => page.evaluate(() => [...document.querySelectorAll('.bha-lcd .bha-app')].map((e) => e.className.replace('bha-app ', '')).join('|'));

// 한 종족: 새로 시작 → 튜토리얼 넘김 → 테스트 '바로 전투' → 공격 블록을 눌러 도트 자국(.bha-pxfx)이 뜨면 한가운데 프레임을 찍는다
async function runFaction(browser, fi, tag, proof, traits) {
  const page0 = { p: null };
  try { return await runFactionInner(browser, fi, tag, proof, traits, page0); } catch (e) { if (page0.p) await page0.p.screenshot({ path: path.join(OUT, `${tag}-fail.png`) }); throw new Error(`${String(e.message).split('\n')[0]} @ ${(e.stack.match(/c268-proof\.cjs:(\d+)/) || [])[1]}`); }
}
async function runFactionInner(browser, fi, tag, proof, traits, page0) {
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  page0.p = page;
  page.on('pageerror', (e) => proof.errors.push(`${tag}: ${e.message}`));
  const fxReq = [];
  page.on('response', (r) => { if (/\/fx\//.test(r.url())) fxReq.push(`${r.status()} ${r.url().split('/fx/')[1]}`); });
  const shot = async (name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  const base = proof.url;
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
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await page.waitForTimeout(400);
  // 이름·성별 정하기(GDD 199장, c330-proof 와 같은 순서)
  const nameIn = page.locator('[data-ident="name"]');
  if (await nameIn.count()) {
    await nameIn.fill('시험');
    await page.locator('[data-ident="next"]').click();
    await page.waitForTimeout(200);
    await page.locator('.bha-ident__gender').first().click();
    await page.locator('[data-ident="done"]').click();
  }
  await page.waitForTimeout(2000);
  await skipTut(page);
  await patchSave(page, `
    t.help.guides = { ...t.help.guides, 'first-run': 'done', 'home-intro': 'done', 'first-run-room': 'done', 'birth': 'done', 'recover': 'done' };
    t.nest.hunger = 20; t.nest.condition = 80; t.nest.hpFraction = 1; t.nest.spa = null;
    t.nest.collapsed = false; t.nest.collapsedAt = 0; t.nest.weakened = false; t.nest.tired = false; t.nest.dead = false;
  `);
  await reopen(page);
  await page.getByRole('button', { name: '더보기' }).first().click({ timeout: 4000 });
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: '테스트' }).first().click({ timeout: 4000 });
  await page.waitForTimeout(600);
  // 테스트 패널 '바로 전투': 상대 = 이름으로 고른 강적 → 전투 시작. 블록은 안 누른다
  await page.locator('.bha-viewtitle button').first().click({ timeout: 4000 });
  await page.waitForTimeout(400);
  await page.getByText('바로 전투', { exact: true }).first().click({ timeout: 4000 });
  await page.waitForTimeout(500);
  const [foeName] = traits;
  await page.locator('.bha-lcd button.bha-pick[aria-label="상대"]').click();
  await page.waitForTimeout(200);
  const picked = await page.evaluate((name) => {
    const n = [...document.querySelectorAll('.bha-pick__list [role="option"]')].find((o) => o.textContent.trim() === name);
    if (n) n.click();
    return n ? n.textContent : null;
  }, foeName);
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '전투 시작' }).click({ timeout: 4000 });
  await page.waitForTimeout(1500);
  // 강적 강공격 세로가 다 뻗은 순간을 찍는다 (최대 60초)
  let got = null;
  for (let w = 0; w < 2400 && !got; w++) {
    await page.waitForTimeout(25);
    got = await page.evaluate(() => {
      const n = [...document.querySelectorAll('.bha-pxfx-wrap')].find((e) => /cero/.test(e.dataset.fx || '') && e.dataset.side === 'enemy' && Number(getComputedStyle(e.querySelector('.bha-pxfx') || e).opacity) > 0);
      return n ? { name: n.dataset.fx } : null;
    });
  }
  if (got) {
    await page.waitForTimeout(Number(process.env.C372_MID ?? 120));
    await shot(`${tag}-${got.name}`);
  } else await shot(`${tag}-no-heavy`);
  proof.trace.push({ tag, picked, got });
  await page.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { url: srv.url, shots: [], errors: [], trace: [] };
  try {
    // 사신 참: 속성 3가지(불·물·허), 호로 조(같은 family-a)는 그대로 SVG 자국인지
    // 이름 = 테스트 패널 특성 목록 글자
    const order = ['water', 'fire', 'earth', 'thunder', 'blood', 'poison', 'kyo'];
    // [종족 카드(0 호로·1 사신), 이름, [계열 글자, 속성 순번]]
    const all = [[1, 'elite-gillian', ['스티치마우스']], [1, 'elite-brute', ['스모크 위도우']], [1, 'elite-serpent', ['롯팽']]];
    const runs = process.env.C372_ONLY ? all.filter((r) => process.env.C372_ONLY.split(',').includes(r[1])) : all;
    for (const [fi, tag, traits] of runs) {
      try { await runFaction(browser, fi, tag, proof, traits); } catch (e) { proof.errors.push(`${tag}: ${e.message}`); }
    }
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close();
    srv.stop();
  }
  console.log(JSON.stringify(proof, null, 1));
  process.exit(0);
})();
