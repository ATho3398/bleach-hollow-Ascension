// C.238 proof (GDD 160장): 방(짚인형·월드맵 물건 ×1.5)·수련장(방에서 → 뒤로 = 방)·월드맵(시장 = 수레 그림·수련장 장소)·시장(월드맵 물건·장비 상점 ×1.2)·상태 화면(상태이상이 능력치 위·노력치 글자·능력치 ⓘ 창). C.236 proof 바탕. 사신(C238_FI=1 기본).
// 실행: node scripts/c238-proof.cjs (C238_URL=<주소>, C238_OUT=<폴더>) — 캡처 docs/captures/c238/ (1배 844×390)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.C238_OUT ?? path.join(ROOT, 'docs/captures/c238');
const PORT = 5338;

async function startServer() {
  if (process.env.C238_URL) return { url: process.env.C238_URL, stop: () => {} };
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
  const box = (q) => page.evaluate((q) => [...document.querySelectorAll(q)].map((e) => { const b = e.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), s: getComputedStyle(e).getPropertyValue('--prop-s') }; }), q);
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
    await page.locator('.bha-species__card').nth(Number(process.env.C238_FI ?? 1)).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '시작', exact: true }).click();
    await page.waitForTimeout(2000);
    await skipTut(page);
    // 노력치·상태이상(쇠약·피곤)을 넣은 저장
    await patchSave(page, `
      t.help.guides = { ...t.help.guides, 'first-run': 'done', 'home-intro': 'done', 'first-run-room': 'done', 'birth': 'done', 'recover': 'done' };
      t.evolution.ev = { hp: 12, atk: 30, int: 8, def: 5, spr: 0, spd: 4 };
      t.nest.hunger = 0; t.nest.condition = 8; t.nest.weakened = true; t.nest.tired = true;
    `);
    await reopen(page);
    proof.trace.push(['room', await screens(page)]);
    proof.roomProps = { altar: await box('.bha-room .bha-prop--altar'), outside: await box('.bha-room .bha-prop--outside'), book: await box('.bha-room .bha-prop--book') };
    await shot('01-room');
    // 방 짚인형 → 수련장 → 뒤로 = 방 (기기 버튼)
    await page.locator('.bha-room .bha-prop--altar').first().click({ timeout: 4000 });
    await page.waitForTimeout(1500);
    proof.trace.push(['training-from-room', await screens(page)]);
    await shot('02-training');
    await devBtn('back');
    await page.waitForTimeout(1200);
    proof.trace.push(['training-back', await screens(page)]);
    // 상태 화면 (상태이상이 능력치 위, 노력치)
    await page.keyboard.press('g');
    await page.waitForTimeout(1200);
    proof.trace.push(['status', await screens(page)]);
    proof.statusOrder = await page.evaluate(() => [...document.querySelectorAll('.bha-care-page .bha-nest__state, .bha-care-page [aria-label="능력치"]')].map((e) => [e.textContent.replace(/\s+/g, ' ').trim().slice(0, 30), Math.round(e.getBoundingClientRect().top)]));
    proof.evStyle = await page.evaluate(() => { const e = document.querySelector('.bha-care-page .bha-ev'); if (!e) return null; const c = getComputedStyle(e); return { text: e.textContent, size: c.fontSize, weight: c.fontWeight }; });
    proof.tipRows = await page.evaluate(() => document.querySelectorAll('.bha-care-page .bha-statrow__tip, .bha-care-page button.bha-statrow').length);
    await shot('03-status-ailment');
    // 노력치 확대 (오른쪽 능력치 칸만)
    const st = page.locator('.bha-care-page [aria-label="능력치"]').first();
    await st.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(300);
    await shot('04-status-ev');
    // 능력치 ⓘ 창
    await page.locator('.bha-care-page [aria-label="능력치"] .bha-info').first().click({ timeout: 4000 });
    await page.waitForTimeout(600);
    proof.statInfo = await page.evaluate(() => document.querySelector('.bha-pop')?.textContent.replace(/\s+/g, ' ').slice(0, 900) ?? null);
    await shot('05-status-info');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await devBtn('back');
    await page.waitForTimeout(1200);
    proof.trace.push(['status-back', await screens(page)]);
    // 월드맵 (시장 = 수레 그림, 수련장 = 짚인형)
    await page.locator('.bha-room .bha-prop--outside').first().click({ timeout: 4000 });
    await page.waitForTimeout(1200);
    proof.worldImgs = await page.evaluate(() => [...document.querySelectorAll('.bha-worldmap [data-place]')].map((b) => [b.dataset.place, b.querySelector('img')?.getAttribute('src') ?? 'icon']));
    await shot('06-worldmap');
    // 월드맵 수련장 → 뒤로 = 월드맵
    await page.locator('.bha-worldmap [data-place="training"]').click({ timeout: 4000 });
    await page.waitForTimeout(2000);
    proof.trace.push(['training-from-map', await screens(page)]);
    await devBtn('back');
    await page.waitForTimeout(1200);
    proof.trace.push(['training-map-back', await screens(page)]);
    await page.locator('.bha-worldmap [data-place="market"]').click({ timeout: 4000 });
    await page.waitForTimeout(2500);
    proof.marketProps = { exit: await box('.bha-market .bha-prop--outside'), gearShop: await box('.bha-market [data-spot="gearShop"]'), shop: await box('.bha-market [data-spot="shop"]') };
    await shot('07-market');
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close();
    srv.stop();
  }
  console.log(JSON.stringify(proof));
  process.exit(0);
})();
