// C.446 proof (GDD v6.055 7·8절): 옛 세이브 → 새로 시작 안내 · 상태 화면 능력치 7칸 · 공격속도·블록속도 999(상한 0.3초·1초) 상태 화면·전투. PC 844×390 + 폰 796×384, 1배 10장 이내. 실행: node scripts/c446-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c446'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PH = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function skipTut(page) {
  for (let t = 0; t < 40 && (await page.locator('.bha-tut').count()); t++) {
    const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled])').filter({ visible: true });
    if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
    else await page.locator('.bha-lcd').first().click({ timeout: 2000 }).catch(() => {});
    await wait(400);
  }
}
async function newGame(page, url) {
  const u = `${url}?test=1`;
  await page.goto(u);
  await page.evaluate(() => localStorage.clear());
  await page.goto(u);
  await wait(1200);
  await page.getByRole('button', { name: '새로 시작' }).click();
  await wait(300);
  await page.locator('.bha-slot').first().click();
  await page.getByRole('button', { name: '확인' }).click();
  await wait(300);
  await page.locator('.bha-species__card').nth(0).click();
  await wait(300);
  await page.getByRole('button', { name: '네', exact: true }).click();
  await wait(400);
  const nm = page.locator('[data-ident="name"]');
  if (await nm.count()) {
    await nm.fill('권영');
    await nm.press('Enter');
    await wait(300);
    await page.locator('.bha-ident__gender[data-gender="male"]').click();
    await page.locator('.bha-ident .bha-btn--primary').last().click();
  }
  await wait(2500);
  await skipTut(page);
}
async function back(page) {
  await page.locator('.bha-dev__btn[aria-label="취소"]').first().click({ timeout: 2000 }).catch(() => {});
  await wait(700);
  const no = page.getByRole('button', { name: '아니요', exact: true }).filter({ visible: true });
  if (await no.count()) { await no.first().click({ timeout: 2000 }).catch(() => {}); await wait(400); }
}
async function openTest(page, tabName) {
  await page.getByRole('button', { name: /더보기/ }).first().click({ timeout: 3000 });
  await wait(400);
  await page.getByRole('button', { name: '테스트', exact: true }).first().click({ timeout: 3000 });
  await wait(700);
  await page.locator('.bha-test-page .bha-viewtitle, .bha-test-page [aria-haspopup]').first().click({ timeout: 2000 }).catch(() => {});
  await wait(300);
  await page.getByRole('option', { name: tabName }).or(page.getByRole('menuitemradio', { name: tabName })).or(page.getByRole('button', { name: tabName })).first().click({ timeout: 3000 });
  await wait(600);
}
const vis = (loc) => loc.filter({ visible: true });

async function openStatus(page) {
  for (let i = 0; i < 6 && (await page.locator('.bha-lcd [data-dev-layer]').count()); i++) { await page.keyboard.press('Escape'); await wait(250); }
  await page.locator('.bha-room__status').first().click({ timeout: 4000 });
  await wait(900);
}
const statRows = (page) => page.evaluate(() => [...document.querySelectorAll('.bha-stats .bha-statrow')].map((r) => r.textContent.replace(/\s+/g, ' ').trim()));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { errors: [], shots: [], facts: {} };
  let n = 1;
  try {
    for (const [dk, opts] of [['pc', PC], ['phone', PH]]) {
      const full = dk === 'pc';
      const ctx = await browser.newContext(opts);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`${dk}: ${e.message.slice(0, 200)}`));
      const shot = async (name) => { const f = `${String(n++).padStart(2, '0')}-${dk}-${name}.png`; await page.screenshot({ path: path.join(OUT, f) }); proof.shots.push(f); };
      const facts = (proof.facts[dk] = {});
      const step = async (label, fn) => { try { await fn(); } catch (e) { proof.errors.push(`${dk} ${label}: ${String(e).slice(0, 200)}`); if (process.env.DBG) await page.screenshot({ path: path.join(process.env.DBG, `${dk}-${label}.png`) }); await back(page); } };
      // 1) 옛 세이브(형식 86) → 시작 화면 안내 · 백업 키
      await step('reset', async () => {
        await page.goto(server.url); // 테스트 모드는 따로 저장소(testStorage)라 일반 주소로
        await page.evaluate(() => {
          localStorage.clear();
          localStorage.setItem('bleach-hollow-ascension.save', JSON.stringify({ meta: { format: 86, balanceVersion: 136, startPatch: 'C.444' }, factionId: 'hollow', runLog: { runs: [] }, evolution: { tierIndex: 2 } }));
        });
        await page.goto(server.url);
        await wait(1500);
        facts.reset = await page.evaluate(() => ({ keys: Object.keys(localStorage).filter((k) => k.startsWith('bleach-hollow-ascension')), notice: [...document.querySelectorAll('.bha-notice')].map((x) => x.textContent.trim()), slot1: localStorage.getItem('bleach-hollow-ascension.save') }));
        await shot('start-reset-notice');
      });
      // 2) 새로 시작 → 상태 화면 능력치 7칸
      await newGame(page, server.url);
      await step('status', async () => {
        await openStatus(page);
        facts.status = await statRows(page);
        await shot('status-7stats');
        await back(page);
      });
      // 3) 테스트 능력치 공격속도·블록속도 999 → 상태 화면(상한 값) → 바로 전투(상한 근처)
      await step('stats', async () => {
        await openTest(page, '능력치');
        const inputs = page.locator('.bha-test-page input[type="number"]');
        const labels = await page.evaluate(() => [...document.querySelectorAll('.bha-test-page input[type="number"]')].map((i) => i.getAttribute('aria-label') || i.closest('label')?.textContent?.trim() || ''));
        facts.testLabels = labels.slice(0, 8);
        const ai = labels.findIndex((l) => l.includes('공격속도'));
        const bi = labels.findIndex((l) => l.includes('블록속도'));
        if (ai >= 0) await inputs.nth(ai).fill('999');
        if (bi >= 0) await inputs.nth(bi).fill('999');
        if (full) await shot('test-stats-inputs');
        await page.getByRole('button', { name: '적용', exact: true }).first().click({ timeout: 3000 });
        await wait(600);
        await back(page);
        await openStatus(page);
        facts.statusCapped = await statRows(page);
        if (full) await shot('status-capped');
        await back(page);
      });
      await step('battle', async () => {
        await openTest(page, '바로 전투');
        await page.getByRole('button', { name: '전투 시작' }).first().click({ timeout: 3000 });
        await page.waitForFunction(() => !!window.__bhaCombat && window.__bhaCombat.tick > 10, null, { timeout: 15000 });
        await page.evaluate(() => { const s = window.__bhaCombat; s.enemy.hp = s.enemy.maxHp = 1e9; s.params.trayCapacity = Math.max(s.params.trayCapacity, 8); });
        const a = await page.evaluate(() => { const s = window.__bhaCombat; return { tick: s.tick, basic: s.basicCount ?? 0, tray: s.tray.length, stats: s.params.playerStats }; });
        await wait(5000);
        const b = await page.evaluate(() => { const s = window.__bhaCombat; return { tick: s.tick, basic: s.basicCount ?? 0, tray: s.tray.length, gauge: document.querySelector('[class*="spawn"]')?.textContent?.trim() ?? null }; });
        const sec = (b.tick - a.tick) * 0.1;
        facts.battle = { seconds: +sec.toFixed(1), basicAttacks: b.basic - a.basic, perSecond: +((b.basic - a.basic) / sec).toFixed(2), trayBefore: a.tray, trayAfter: b.tray, aspd: a.stats?.aspd, bspd: a.stats?.bspd };
        await shot('battle-capped');
        await back(page); await back(page);
      });
      await ctx.close();
    }
  } catch (e) {
    proof.errors.push(String(e).slice(0, 400));
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close();
    server.stop?.();
    console.log(JSON.stringify(proof, null, 1).slice(0, 9000));
    process.exit(0);
  }
})();
