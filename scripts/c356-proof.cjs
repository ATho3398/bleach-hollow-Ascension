// C.356 proof (GDD 212장, 코딩248): 모험 소모품 = 끼운 1개·바퀴당 1번 — ① 걷기 가방에서 쓴 뒤 흐림(폰) ② 전투 소모품 칸 '씀'(PC) ③ 바퀴 끝 창 소모품 바꾸기(폰·PC).
// c309-proof 바탕. 쓰기: node scripts/c356-proof.cjs [저장 폴더]  (C276_URL=<주소> 이미 떠 있는 서버)
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs/captures/c356'));
const VIEW = {
  pc: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 },
  ph: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
};
async function patch(page, src) {
  await page.evaluate((code) => {
    const f = new Function('t', 'shared', code);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const raw = localStorage.getItem(k);
      if (!raw || !raw.includes('"runLog"')) continue;
      const data = JSON.parse(raw);
      let sh = null;
      const find = (o) => { if (!o || typeof o !== 'object' || sh) return; if (o.food && o.items && o.wanderer) { sh = o; return; } for (const v of Object.values(o)) find(v); };
      find(data);
      const walk = (o) => { if (!o || typeof o !== 'object') return; if (o.nest && o.help && o.runLog) f(o, o.shared ?? sh); for (const v of Object.values(o)) walk(v); };
      walk(data);
      localStorage.setItem(k, JSON.stringify(data));
    }
  }, src);
}
async function skipTut(page) {
  for (let t = 0; t < 40 && (await page.locator('.bha-tut').count()); t++) {
    const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled])').filter({ visible: true });
    if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
    else await page.locator('.bha-lcd').first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
}
async function closeLayers(page) {
  for (let i = 0; i < 6 && (await page.locator('.bha-tut, .bha-lcd .bha-guide').count()); i++) {
    const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled]), .bha-lcd .bha-guide button.bha-btn--primary').filter({ visible: true });
    if (await go.count()) await go.first().click({ timeout: 1500 }).catch(() => {}); else await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
}
async function depart(page, url) {
  const u = `${url}?test=1`;
  await page.goto(u); await page.evaluate(() => localStorage.clear()); await page.goto(u); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '새로 시작' }).click(); await page.waitForTimeout(300);
  await page.locator('.bha-slot').first().click(); await page.waitForTimeout(200);
  await page.getByRole('button', { name: '확인' }).click(); await page.waitForTimeout(300);
  await page.locator('.bha-species__card').nth(0).click(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: '시작', exact: true }).click(); await page.waitForTimeout(400);
  const nm = page.locator('[data-ident="name"]');
  if (await nm.count()) {
    await nm.fill('권영'); await nm.press('Enter'); await page.waitForTimeout(300);
    await page.locator('.bha-ident__gender[data-gender="male"]').click();
    await page.locator('.bha-ident .bha-btn--primary').last().click();
  }
  await page.waitForTimeout(1500);
  await skipTut(page);
  await patch(page, `t.nest.hpFraction = 0.9; shared.items = { 'heal-salve': 2, 'heal-patch': 3, 'battle-haste': 1 }; shared.battleItem = 'heal-salve';`);
  await page.goto(u); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '이어하기' }).click().catch(() => {}); await page.waitForTimeout(1500);
  await skipTut(page);
  await page.locator('.bha-prop--outside').first().click(); await page.waitForTimeout(700);
  await page.locator('.bha-worldmap [data-place="adventure"]').first().click(); await page.waitForTimeout(1800);
  await closeLayers(page);
  await page.getByRole('button', { name: '출발', exact: true }).first().click(); await page.waitForTimeout(500);
  const yes = page.locator('.bha-lcd [data-dev-layer] .bha-btn').filter({ hasText: '출발' });
  if (await yes.count()) { await yes.first().click(); }
  await page.waitForTimeout(1500);
}
const E = `const str = typeof t.activeExpedition === 'string'; const snap = str ? JSON.parse(t.activeExpedition) : t.activeExpedition; const e = snap && (snap.exp ?? snap); if (e) { queueMicrotask(() => {}); `;
const END = ` } if (snap && str) t.activeExpedition = JSON.stringify(snap);`;
let BASE = '';
/** 앱이 떠날 때 메모리 상태로 덮어쓰지 않게, 같은 주소의 정적 파일로 옮긴 뒤 세이브를 고친다 */
async function patchAway(page, src) {
  await page.goto(`${BASE}manifest.webmanifest`); await page.waitForTimeout(300);
  await patch(page, src);
}
async function resume(page) {
  await page.goto(`${BASE}?test=1`); await page.waitForTimeout(1500);
  await page.getByRole('button', { name: '이어하기' }).click().catch(() => {}); await page.waitForTimeout(1500);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  BASE = server.url;
  const browser = await chromium.launch();
  const facts = {};
  const errors = [];
  try {
    for (const mode of ['ph', 'pc']) {
      const page = await browser.newPage(VIEW[mode]);
      page.on('pageerror', (e) => errors.push(`${mode}: ${e.message.slice(0, 120)}`));
      const shot = async (name) => { await page.waitForTimeout(300); await page.screenshot({ path: path.join(OUT, `${mode}-${name}.png`) }); };
      await depart(page, server.url);
      if (mode === 'ph') {
        // ① 걷기 가방: 체력 낮춤 → 끼운 회복약 쓰기 → 흐림 + 이유 줄
        await patchAway(page, `${E} e.phase = 'moving'; e.pending = null; e.hpFraction = 0.35; e.wildCells = []; e.pos = 1; ${END}`);
        await resume(page);
        await page.locator('.bha-exp__bag').first().click(); await page.waitForTimeout(500);
        await page.locator('.bha-healbag [data-item="heal-salve"]').first().click(); await page.waitForTimeout(1200);
        await page.locator('.bha-healbag [data-item="heal-patch"]').first().click(); await page.waitForTimeout(400);
        facts.bag = await page.evaluate(() => ({ status: document.querySelector('.bha-healbag__slot')?.textContent, note: [...document.querySelectorAll('.bha-healbag .bha-modal__body')].map((p) => p.textContent) }));
        await shot('1-walk-bag-used');
        await page.keyboard.press('Escape'); await page.waitForTimeout(300);
      } else {
        // ② 전투: 이번 바퀴에 이미 씀 → 소모품 칸 '씀'
        await patchAway(page, `${E} e.phase = 'moving'; e.pending = null; e.lapItems = [{ lap: e.lap, itemId: 'heal-salve', where: 'walk' }]; e.wildCells = [2]; e.pos = 1; e.slots[2] = null; ${END}`);
        await resume(page);
        for (let i = 0; i < 40 && !(await page.locator('.bha-battle').count()); i++) await page.waitForTimeout(300);
        await page.waitForTimeout(2500);
        facts.battle = await page.evaluate(() => { const b = [...document.querySelectorAll('.bha-battle button, .bha-battle [role="button"]')].find((x) => (x.title || '').includes('이번 바퀴')); return b ? { title: b.title, text: b.textContent, disabled: b.disabled || b.getAttribute('aria-disabled') } : null; });
        await shot('2-battle-item-spent');
      }
      // ③ 바퀴 끝 창 → [바꾸기] 고르기 창
      await patchAway(page, `${E} e.phase = 'moving'; e.pending = null; e.queuedBattle = null; e.wildCells = []; e.pos = e.slots.length - 1; e.lapItems = [{ lap: e.lap, itemId: 'heal-salve', where: 'battle' }]; ${END}`);
      await resume(page);
      for (let t = 0; t < 60; t++) {
        if (await page.getByRole('button', { name: '귀환', exact: true }).filter({ visible: true }).count()) break;
        const layerGo = page.locator('.bha-lcd [data-dev-layer] button.bha-btn--primary').filter({ visible: true });
        if (await layerGo.count()) await layerGo.first().click({ timeout: 1500 }).catch(() => {});
        await page.waitForTimeout(400);
      }
      await page.waitForTimeout(500);
      facts[`${mode}-lapend`] = await page.locator('.bha-lapitem').textContent().catch(() => null);
      await page.locator('[data-lap-item-change]').first().click().catch(() => {}); await page.waitForTimeout(500);
      await shot('3-lapend-pick');
      await page.locator('.bha-shoppick [data-pick="heal-patch"]').first().click().catch(() => {}); await page.waitForTimeout(500);
      facts[`${mode}-lapend-after`] = await page.locator('.bha-lapitem').textContent().catch(() => null);
      if (mode === 'pc') await shot('4-lapend-swapped');
      await page.close();
    }
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify({ facts, errors }, null, 1));
    console.log(JSON.stringify({ facts, errors }, null, 1));
    await browser.close();
    server.stop();
  }
})();
