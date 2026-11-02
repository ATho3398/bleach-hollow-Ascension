// C.236 proof (GDD 158장): 방(수련장 없음·월드맵 물건)·월드맵(수련장)·시장(방 같은 배치·월드맵 물건)·흡수 화면·내 상태·가방 블록 상세. C.234 proof 바탕. 사신(C236_FI=1 기본).
// 새 게임(사신 기본, ?test=1) → 안내 끝낸 저장(가방 블록 넣음)으로 다시 연다 → 방 → 월드맵 → 시장 → 장비 상점 → 수련장 → 가방 블록 상세 → 모험 → 흡수 화면·내 상태. 캡처 docs/captures/c236/ (1배 844×390). 실행: node scripts/c236-proof.cjs (C236_URL=<주소>)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c236');
const PORT = 5336;

async function startServer() {
  if (process.env.C236_URL) return { url: process.env.C236_URL, stop: () => {} };
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
    await page.locator('.bha-species__card').nth(Number(process.env.C236_FI ?? 1)).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '시작', exact: true }).click();
    await page.waitForTimeout(2000);
    await skipTut(page);
    await patchSave(page, `
      t.help.guides = { ...t.help.guides, 'first-run': 'done', 'home-intro': 'done', 'first-run-room': 'done', 'birth': 'done', 'recover': 'done' };
      if (shared) { shared.tradeCoins = 3000; }
      t.build.owned = ['t-water-b', 't-fire-a', 't-earth-c', 't-thunder-b', 't-fire-passive'];
      t.build.slots = ['t-water-b', 't-fire-a', null];
      t.build.enhance = { water: 3, fire: 1, earth: 1, thunder: 1 };
      PATCH_EXTRA
    `.replace('PATCH_EXTRA', process.env.C236_PATCH ?? ''));
    await reopen(page);
    proof.trace.push(['room', await screens(page)]);
    await shot('01-room');

    await page.locator('.bha-prop--outside').first().click({ timeout: 4000 });
    await page.waitForTimeout(1200);
    await shot('02-worldmap');
    await page.locator('.bha-worldmap [data-place="market"]').click({ timeout: 4000 });
    await page.waitForTimeout(2500);
    proof.fill = await page.evaluate(() => {
      const r = (q) => { const e = document.querySelector(q); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; };
      return { app: r('.bha-lcd .bha-market'), scene: r('.bha-market__scene'), hud: r('.bha-market__hud'), spots: [...document.querySelectorAll('.bha-market [data-spot], .bha-market [data-exit]')].map((b) => [b.dataset.spot, Math.round(b.getBoundingClientRect().top)]) };
    });
    await shot('03-market');
    // 장비 상점 목록 → 상세 (GDD 158장 8)
    await page.locator('.bha-market [data-spot="gearShop"]').click({ timeout: 4000 });
    await page.waitForTimeout(1200);
    proof.gearList = await page.evaluate(() => [...document.querySelectorAll('.bha-shop .bha-itemgrid > *')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
    await shot('07-gear-shop');
    await page.locator('.bha-shop .bha-itemgrid > *').first().click({ timeout: 4000 });
    await page.waitForTimeout(600);
    proof.gearDetail = await page.evaluate(() => document.querySelector('.bha-itemdialog')?.textContent.replace(/\s+/g, ' ').slice(0, 300) ?? null);
    await shot('08-gear-detail');
    await devBtn('back');
    await page.waitForTimeout(500);
    await devBtn('back');
    await page.waitForTimeout(1200);
    proof.trace.push(['after-shop', await screens(page)]);
    // 시장 → 월드맵 물건(기기 ▲ 로 고르고 ✓) → 월드맵
    proof.marketKeys = [];
    for (let i = 0; i < 8; i++) {
      const sel = await page.evaluate(() => { const e = document.querySelector('.bha-lcd .bha-sel'); return e ? (e.dataset.spot ?? (e.dataset.exit !== undefined ? 'exit' : e.textContent.trim().slice(0, 8))) : null; });
      proof.marketKeys.push(sel);
      if (sel === 'exit') break;
      await devBtn('up');
      await page.waitForTimeout(150);
    }
    await devBtn('ok');
    await page.waitForTimeout(1200);
    proof.trace.push(['after-market-exit', await screens(page)]);
    // 월드맵 → 수련장 (뒤로 = 월드맵)
    await page.locator('.bha-worldmap [data-place="training"]').click({ timeout: 4000 });
    await page.waitForTimeout(1500);
    proof.trace.push(['training', await screens(page)]);
    await devBtn('back');
    await page.waitForTimeout(1200);
    proof.trace.push(['training-back', await screens(page)]);
    // 홈 → 가방 → 슬롯 탭 → 가방 블록 상세
    await page.locator('.bha-worldmap [data-place="home"]').click({ timeout: 4000 });
    await page.waitForTimeout(1500);
    await page.locator('.bha-prop--chest').first().click({ timeout: 4000 });
    await page.waitForTimeout(1000);
    await page.locator('.bha-lcd [role="tab"]').filter({ hasText: '슬롯' }).first().click({ timeout: 4000 });
    await page.waitForTimeout(600);
    await page.locator('.bha-lcd .bha-sggrid [data-trait]').first().click({ timeout: 4000 });
    await page.waitForTimeout(600);
    proof.bagDetail = await page.evaluate(() => document.querySelector('.bha-itemdialog')?.textContent.replace(/\s+/g, ' ').slice(0, 300) ?? null);
    await shot('06-bag-detail');
    for (let i = 0; i < 4 && !(await page.locator('.bha-prop--outside').count()); i++) {
      if (await page.locator('.bha-itemdialog').count()) await page.keyboard.press('Escape');
      else if (await page.getByRole('button', { name: '이어하기' }).count()) await reopen(page);
      else await devBtn('back');
      await page.waitForTimeout(900);
    }
    proof.trace.push(['after-bag', await screens(page)]);
    // 모험 → ★1 → 출발 → 첫 흡수 화면
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
    for (let t = 0; t < 600 && !(await page.locator('.bha-absorbpage').count()); t++) {
      const layerGo = vis(page.locator('.bha-lcd [data-dev-layer] button.bha-btn--primary'));
      const eat = vis(page.getByRole('button', { name: /하러 가기$/ }));
      if (await eat.count()) await eat.first().click({ timeout: 2000 }).catch(() => {});
      else if (await layerGo.count()) await layerGo.first().click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(800);
    proof.absorb = await page.evaluate(() => ({
      slots: [...document.querySelectorAll('.bha-absorbpage .bha-slot')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
      modes: [...document.querySelectorAll('.bha-absorbpage [data-mode]')].map((e) => { const r = e.getBoundingClientRect(); return [e.textContent.replace(/\s+/g, ' ').trim(), Math.round(r.width), Math.round(r.height)]; }),
      icons: document.querySelectorAll('.bha-absorbpage [data-mode] .bha-icon').length,
      text: document.querySelector('.bha-absorbpage')?.textContent.replace(/\s+/g, ' ').slice(0, 400),
    }));
    await shot('04-absorb');
    await page.locator('[data-absorb-me]').click({ timeout: 4000 });
    await page.waitForTimeout(600);
    proof.absorbStatus = await page.evaluate(() => document.querySelector('[data-absorb-status]')?.textContent.replace(/\s+/g, ' ').slice(0, 400) ?? null);
    await shot('05-absorb-status');
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close();
    srv.stop();
  }
  console.log(JSON.stringify(proof));
  process.exit(0);
})();
