// C.513 proof (폭주 블록 = 리스크 게이지, 컨디션과 상관없음): PC 844×390, 1배.
// 01 걷기 화면 리스크 낮음(10) · 컨디션 낮음(20) — '폭주 블록 +n%' 는 리스크 막대에 · 02 리스크 높음(90) · 컨디션 가득(100) · 03 방 컨디션 ⓘ · 04 방 리스크(광기) ⓘ
// 실행: node scripts/c512-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c512'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function seed(page, url, build) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async (build) => {
    const m = { g: await import('/src/game.ts'), tut: await import('/src/engine/tutorial.ts'), x: await import('/src/engine/expedition/index.ts') };
    const slots = await import('/src/saveSlots.ts');
    const now = Date.now();
    const s = m.g.newSaveData('hollow', now);
    s.name = '시험';
    s.gender = 'male';
    s.help.tutorialSeen = true;
    for (const id of m.tut.GUIDE_IDS) s.help.guides[id] = 'done';
    s.nest.hunger = 30;
    s.nest.condition = 20;
    s.nest.risk = 70;
    // eslint-disable-next-line no-new-func
    new Function('s', 'm', 'now', build)(s, m, now);
    slots.writeSlotSave(localStorage, s, 1);
    slots.touchSlot(localStorage, 1, now);
  }, build);
  await page.goto(url);
  await wait(1500);
  const cont = page.getByRole('button', { name: '이어하기' });
  if (await cont.count()) await cont.click({ timeout: 5000 });
  await wait(2500);
}

const walk = (risk, condition) => `
  const DECK = ['prey-nest-a', 'prey-nest-a', 'elite-den-a', 'env-fog', 'rest-a', 'prey-nest-b', 'env-ruin', 'elite-den-b'];
  const exp = m.x.createExpedition({ factionId: 'hollow', seed: 11, hunger: 10, condition: ${condition}, risk: ${risk}, deck: DECK });
  s.activeExpedition = m.x.serializeExpedition(exp, 1, now);
  s.lastScreen = 'expedition';
`;
const meters = (page) => page.evaluate(() => [...document.querySelectorAll('.bha-meter')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
const tipText = (page) => page.evaluate(() => [...document.querySelectorAll('[role="tooltip"], .bha-infotip__pop, .bha-info-pop, .bha-infotip')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const F = {};
  try {
    const page = await (await browser.newContext(PC)).newPage();
    const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`) });

    await seed(page, server.url, walk(10, 20));
    F.walkLow = await meters(page);
    await shot('01-walk-risk10-cond20');

    await seed(page, server.url, walk(90, 100));
    F.walkHigh = await meters(page);
    await shot('02-walk-risk90-cond100');

    // 상태 화면(방 머리 위 상태 박스 → 상태)의 컨디션 ⓘ · 광기 ⓘ
    await seed(page, server.url, '');
    await page.locator('.bha-room__status').first().click({ force: true }); await wait(1500);
    const tip = async (name, file, key) => {
      const b = page.getByRole('button', { name }).first();
      await b.scrollIntoViewIfNeeded();
      await b.click(); await wait(800);
      F[key] = await page.evaluate(() => document.body.innerText.split('\n').filter((l) => /폭주|피곤|손해|구간|하는 일/.test(l)).slice(0, 20));
      await shot(file);
      await b.click(); await wait(400);
    };
    await tip('컨디션 설명', '03-status-condition-info', 'condTip');
    await tip('광기 설명', '04-status-risk-info', 'riskTip');
  } finally {
    fs.writeFileSync(path.join(OUT, 'facts.json'), JSON.stringify(F, null, 1));
    console.log(JSON.stringify(F, null, 1));
    await browser.close();
    server.stop();
  }
})();
