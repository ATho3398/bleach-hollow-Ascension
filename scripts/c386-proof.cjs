// C.386 proof (GDD 233장 1, 코딩265): 대기 보상 [받기] 뒤 '받은 것' 알림 없음 · 복귀 알림은 뜬다. PC 844×390 · 폰 796×384, 1배.
// 쓰기: node scripts/c386-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs/captures/c386'));
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
    for (const mode of ['pc', 'ph']) {
      const page = await browser.newPage(VIEW[mode]);
      page.on('pageerror', (e) => errors.push(`${mode}: ${e.message.slice(0, 160)}`));
      const F = (facts[mode] = {});
      await testGame(page);
      // 3시간 꺼 둔 세이브로 고친 뒤 이어하기 → 복귀 알림 + 대기 보상 창
      F.patch = await patchAway(page, `for (const k of Object.keys(t.help.guides)) t.help.guides[k] = 'done'; t.idlePending = null; if (t.runLog.runs.length === 0) t.runLog.runs.push({ runId: 1, laps: 1, outcome: 'returned', gained: [], lost: [], endReason: 'tutorial-clear', seed: 1, factionId: t.factionId, gainedTraits: [], lostTraits: [], riskPeak: 0, breakthrough: false, tutorial: true }); t.lastSeenAt = Date.now() - 180 * 60000; t.activeExpedition = null; t.nest.hunger = 0; t.nest.weakened = false; t.nest.collapsed = false; return 1;`);
      await page.goto(`${BASE}?test=1`); await page.waitForTimeout(1500);
      await page.getByRole('button', { name: '이어하기' }).click().catch(() => {}); await page.waitForTimeout(1800);
      await skipTut(page);
      F.before = { confirms: await confirms(page), toasts: await toastText(page) };
      if (mode === 'ph') await page.screenshot({ path: path.join(OUT, 'ph-return-toast.png') });
      await page.locator('.bha-confirm button').filter({ hasText: '받기' }).first().click().catch((e) => errors.push(`${mode} 받기: ${e.message.slice(0, 80)}`));
      await page.waitForTimeout(800);
      F.afterClaim = { confirms: await confirms(page), toasts: await toastText(page) };
      if (mode === 'pc') await page.screenshot({ path: path.join(OUT, 'pc-after-claim.png') });
      await page.close();
    }
  } finally {
    await browser.close();
    server.stop();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify({ facts, errors }, null, 1));
  console.log(JSON.stringify({ facts, errors }, null, 1));
})();
