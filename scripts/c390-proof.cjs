// C.390 proof (GDD 238장, 코딩266): 방 상태 박스 한 덩어리 — 줄 열 맞춤·'모험 1번' 막대 열 시작·ⓘ 박스 안. 폰 가로·세로·PC, 상태이상 0·1·2개. 1배.
// 쓰기: node scripts/c390-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs/captures/c390'));
const VIEW = {
  pc: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 },
  ph: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
};
let BASE = '';

async function skipTut(page) {
  for (let t = 0; t < 40 && (await page.locator('.bha-tut').count()); t++) {
    const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled])').filter({ visible: true });
    if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
    else await page.locator('.bha-lcd').first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
}
async function patchAway(page, src) {
  await page.goto(`${BASE}manifest.webmanifest`); await page.waitForTimeout(300);
  return page.evaluate((code) => {
    const f = new Function('t', code);
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const raw = localStorage.getItem(k);
      if (!raw || !raw.includes('"runLog"')) continue;
      const data = JSON.parse(raw);
      const walk = (o) => { if (!o || typeof o !== 'object') return; if (o.nest && o.help && o.runLog) out.push(f(o)); for (const v of Object.values(o)) walk(v); };
      walk(data);
      localStorage.setItem(k, JSON.stringify(data));
    }
    return out;
  }, src);
}
async function testGame(page) {
  const u = `${BASE}?test=1`;
  await page.goto(u); await page.evaluate(() => localStorage.clear()); await page.goto(u); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '새로 시작' }).click(); await page.waitForTimeout(300);
  await page.locator('.bha-slot').first().click(); await page.waitForTimeout(200);
  await page.getByRole('button', { name: '확인' }).click(); await page.waitForTimeout(300);
  await page.locator('.bha-species__card').nth(0).click(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: '시작', exact: true }).click(); await page.waitForTimeout(400);
  const nm = page.locator('[data-ident="name"]');
  if (await nm.count()) {
    await nm.fill('권영'); await page.locator('[data-ident="next"]').click(); await page.waitForTimeout(200);
    await page.locator('.bha-ident__gender').first().click(); await page.locator('[data-ident="done"]').click();
  }
  await page.waitForTimeout(1500);
  await skipTut(page);
}
const toastText = (page) => page.evaluate(() => [...document.querySelectorAll('.bha-toast')].map((t) => t.textContent.replace(/\s+/g, ' ').trim()));
const confirms = (page) => page.evaluate(() => [...document.querySelectorAll('.bha-confirm')].map((c) => c.getAttribute('aria-label')));

const VIEWS = {
  'ph-land': { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  'ph-port': { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  pc: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
};
const CASES = [['ph-land', 1], ['ph-land', 2], ['ph-port', 1], ['pc', 0]];
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  BASE = server.url;
  const browser = await chromium.launch();
  const facts = {};
  const errors = [];
  try {
    for (const [view, n] of CASES) {
      const tag = `${view}-status${n}`;
      const page = await browser.newPage(VIEWS[view]);
      page.on('pageerror', (e) => errors.push(`${tag}: ${e.message.slice(0, 160)}`));
      await testGame(page);
      await patchAway(page, `for (const k of Object.keys(t.help.guides)) t.help.guides[k] = 'done'; t.idlePending = null; t.lastSeenAt = Date.now(); t.nest.lastTickMs = Date.now(); t.activeExpedition = null; t.nest.hunger = ${n > 0 ? 70 : 40}; t.nest.condition = ${n > 1 ? 20 : 80}; t.nest.weakened = ${n > 0}; t.nest.tired = ${n > 1}; t.nest.collapsed = false; t.nest.careRequest = null; return 1;`);
      await page.goto(`${BASE}?test=1`); await page.waitForTimeout(1500);
      await page.getByRole('button', { name: '이어하기' }).click().catch(() => {}); await page.waitForTimeout(1800);
      await skipTut(page);
      for (let i = 0; i < 3 && (await page.locator('.bha-confirm').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
      await page.waitForTimeout(3000);
      facts[tag] = await page.evaluate(() => {
        const box = document.querySelector('.bha-room__chips > .bha-room__status');
        const info = document.querySelector('.bha-room__statusinfo');
        const r = (e) => { const b = e.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom) }; };
        const B = r(box);
        const rows = [...box.querySelectorAll('.bha-room__gauge')].map((g) => ({ cls: g.className.replace('bha-room__gauge ', ''), track: r(g.querySelector('.bha-room__gaugetrack')), num: r(g.querySelector('.bha-room__gaugenum')), hint: g.querySelector('.bha-room__gaugehint') ? r(g.querySelector('.bha-room__gaugehint')) : null }));
        const inside = (x) => x.l >= B.l && x.r <= B.r && x.t >= B.t && x.b <= B.b;
        return { box: B, info: r(info), infoInside: inside(r(info)), rowsInside: rows.every((x) => inside(x.track) && inside(x.num) && (!x.hint || inside(x.hint))), trackLefts: [...new Set(rows.map((x) => x.track.l))], trackRights: [...new Set(rows.map((x) => x.track.r))], hintLeft: rows.find((x) => x.hint)?.hint.l ?? null };
      });
      const box = await page.locator('.bha-room__chips').boundingBox();
      await page.screenshot({ path: path.join(OUT, `${tag}.png`), clip: view === 'pc' ? undefined : undefined });
      void box;
      await page.close();
    }
  } finally {
    await browser.close();
    server.stop();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify({ facts, errors }, null, 1));
  console.log(JSON.stringify({ facts, errors }, null, 1));
})();
