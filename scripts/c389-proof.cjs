// C.389 proof (GDD 237장, 코딩266): 복귀 = 대기 보상 창 하나 — ① 보상 + '비운 동안 줄어든 것' ② 보상 창이 안 뜨는 복귀 = 줄어든 것만 + [확인]. 노란 복귀 띠 없음. PC 844×390 1배.
// 쓰기: node scripts/c389-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs/captures/c389'));
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

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  BASE = server.url;
  const browser = await chromium.launch();
  const facts = {};
  const errors = [];
  try {
    for (const [tag, withIdle] of [['01-idle-reward-plus-loss', true], ['02-loss-only', false]]) {
      const page = await browser.newPage(VIEW.pc);
      page.on('pageerror', (e) => errors.push(`${tag}: ${e.message.slice(0, 160)}`));
      const F = (facts[tag] = {});
      await testGame(page);
      F.patch = await patchAway(page, `for (const k of Object.keys(t.help.guides)) t.help.guides[k] = 'done'; t.idlePending = null; t.runLog.runs = t.runLog.runs.filter((r) => !r.tutorial); ${withIdle ? "t.runLog.runs.push({ runId: 1, laps: 1, outcome: 'returned', gained: [], lost: [], endReason: 'tutorial-clear', seed: 1, factionId: t.factionId, gainedTraits: [], lostTraits: [], riskPeak: 0, breakthrough: false, tutorial: true });" : 't.runLog.runs = [];'} t.lastSeenAt = Date.now() - 136 * 60000; t.nest.lastTickMs = t.lastSeenAt; t.activeExpedition = null; t.nest.hunger = 10; t.nest.condition = 90; t.nest.weakened = false; t.nest.collapsed = false; return 1;`);
      await page.goto(`${BASE}?test=1`); await page.waitForTimeout(1500);
      await page.getByRole('button', { name: '이어하기' }).click().catch(() => {}); await page.waitForTimeout(1800);
      await skipTut(page);
      await page.waitForTimeout(800);
      F.confirms = await confirms(page);
      F.loss = await page.evaluate(() => [...document.querySelectorAll('[data-absence-loss] li')].map((l) => l.textContent));
      F.toasts = await toastText(page);
      F.buttons = await page.evaluate(() => [...document.querySelectorAll('.bha-confirm button')].map((b) => b.textContent.trim()));
      await page.screenshot({ path: path.join(OUT, `${tag}.png`) });
      await page.close();
    }
  } finally {
    await browser.close();
    server.stop();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify({ facts, errors }, null, 1));
  console.log(JSON.stringify({ facts, errors }, null, 1));
})();
