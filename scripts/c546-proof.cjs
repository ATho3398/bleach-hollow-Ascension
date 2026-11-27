// C.546 proof (적 길리안 눈동자 = 그 적 속성 색, GDD 15-5 v6.215): 1배 3장.
// 01 PC 전투 — 스티치마우스(노멀, 외눈 길리안) 눈동자 / 02 PC 8속성 나란히(같은 길리안 몸에 속성만 바꾼 tint, 머리 확대) / 03 폰 전투
// 실행: node scripts/c546-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c546'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ab = () => ({ both: 1, trait: 0, stat: 0, none: 0 });
const DEX = {};
DEX['normal-heavy-seal'] = { seen: 2, kills: 1, absorbs: ab(), where: 'ground:outskirts', firstAt: 1 };

async function seed(page, url) {
  await page.goto(`${url}?test=1`);
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async (dex) => {
    const m = { g: await import('/src/game.ts'), tut: await import('/src/engine/tutorial.ts'), tm: await import('/src/engine/testMode.ts') };
    const slots = await import('/src/saveSlots.ts');
    const store = m.tm.testStorage(localStorage);
    const now = Date.now();
    const s = m.g.newSaveData('hollow', now);
    s.name = '시험';
    s.gender = 'male';
    s.help.tutorialSeen = true;
    for (const id of m.tut.GUIDE_IDS) s.help.guides[id] = 'done';
    s.nest.hunger = 30;
    s.nest.condition = 90;
    m.tm.fillAllUnlocked(s);
    m.tm.setForm(s, 't4:fire:physical');
    s.enemyDex = dex;
    slots.writeSlotSave(store, s, 1);
    slots.touchSlot(store, 1, now);
  }, DEX);
  await page.goto(`${url}?test=1`);
  await wait(1500);
  const cont = page.getByRole('button', { name: '이어하기' });
  if (await cont.count()) await cont.click({ timeout: 5000 });
  await wait(2500);
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


async function battleShot(browser, url, ctx, name, F, key) {
  const page = await (await browser.newContext(ctx)).newPage();
  page.on('pageerror', (e) => F.errors.push(`${key}: ${e.message}`));
  await seed(page, url);
  await openTest(page, '바로 전투');
  await page.getByRole('button', { name: '전투 들어가기' }).first().click({ timeout: 3000 });
  await wait(800);
  await page.locator('[aria-label="적 종류"]').filter({ visible: true }).first().click({ timeout: 3000 });
  await wait(300);
  await page.getByRole('option', { name: '스티치마우스', exact: true }).first().click({ timeout: 3000 });
  await wait(300);
  const ok = page.getByRole('button', { name: '확인', exact: true }).filter({ visible: true });
  if (await ok.count()) await ok.last().click({ timeout: 3000 });
  await page.waitForFunction(() => !!window.__bhaCombat && window.__bhaCombat.tick > 5, null, { timeout: 15000 });
  await wait(2500);
  F[key] = await page.evaluate(() => {
    const cv = document.querySelector('.bha-foe canvas.bha-rigcanvas');
    if (!cv) return { foeId: window.__bhaCombat.enemy?.def?.id ?? null, canvas: false };
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let red = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] && d[i] === 226 && d[i + 1] === 16 && d[i + 2] === 20) red++;
    const tok = getComputedStyle(document.querySelector('.bha-foe') ?? document.documentElement).getPropertyValue('--bha-el-normal').trim();
    return { foeId: window.__bhaCombat.enemy?.def?.id ?? null, canvas: true, oldRedPixels: red, normalToken: tok };
  });
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  await page.context().close();
}

async function gridShot(browser, url, F) {
  const page = await (await browser.newContext(PC)).newPage();
  page.on('pageerror', (e) => F.errors.push(`grid: ${e.message}`));
  await seed(page, url);
  F.grid = await page.evaluate(async () => {
    const man = await import('/src/data/art/manifest.ts');
    const els = await import('/src/data/elements/index.ts');
    const bat = await import('/src/ui/bha/battle.ts');
    const root = document.querySelector('.bha-root') ?? document.body;
    const wrap = document.createElement('div');
    wrap.id = 'c546-grid';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;background:var(--bha-bg-1);display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:repeat(2,1fr);padding:8px;gap:4px;';
    const base = man.enemyArt('normal-heavy-seal', '/');
    const out = [];
    for (const el of els.ELEMENTS) {
      const cell = document.createElement('div');
      cell.style.cssText = 'position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;border:1px solid var(--bha-line);color:var(--bha-text-1);font-size:12px;';
      const lab = document.createElement('div');
      lab.textContent = `${el.name['*']} 속성`;
      lab.style.cssText = 'position:absolute;bottom:2px;left:0;right:0;text-align:center;z-index:2;';
      const box = document.createElement('div');
      box.style.cssText = 'width:160px;height:160px;transform:scale(2.2);transform-origin:50% 22%;margin-top:10px;';
      box.className = 'bha-battle';
      box.append(bat.foeEl('foe-b', null, { ...base, tint: { ...base.tint, token: el.color } }));
      cell.append(box, lab);
      wrap.append(cell);
      out.push({ el: el.id, token: el.color, value: getComputedStyle(root).getPropertyValue(el.color).trim() });
    }
    root.append(wrap);
    return out;
  });
  await wait(2500);
  await page.screenshot({ path: path.join(OUT, '02-pc-gillian-eyes-8.png') });
  await page.context().close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const F = { errors: [] };
  try {
    await battleShot(browser, server.url, PC, '01-pc-battle-stitchmouse', F, 'pcBattle');
    await gridShot(browser, server.url, F);
    await battleShot(browser, server.url, PHONE, '03-phone-battle-stitchmouse', F, 'phoneBattle');
  } catch (e) {
    F.errors.push(String(e && e.stack ? e.stack : e));
  } finally {
    fs.writeFileSync(path.join(OUT, 'facts.json'), JSON.stringify(F, null, 1));
    console.log(JSON.stringify(F, null, 1));
    await browser.close();
    server.stop();
  }
})();
