// C.456 proof (GDD 12-4): 초월자 화면에 진화 단계·진화체 이름 대신 '초월자' · 무월 이치고 그림(불꽃 앞뒤 레이어) · 아이젠 크기 ×0.85. PC 844×390 1배. 실행: node scripts/c456-proof.cjs [저장 폴더] [explore]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c456'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function skipTut(page) {
  for (let t = 0; t < 40 && (await page.locator('.bha-tut').count()); t++) {
    const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled])').filter({ visible: true });
    if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
    else await page.locator('.bha-lcd').first().click({ timeout: 2000 }).catch(() => {});
    await wait(400);
  }
}
async function newGame(page, url, species = 0) {
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
  await page.locator('.bha-species__card').nth(species).click();
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
async function becomeTranscendent(page, name) {
  await openTest(page, '붕옥·초월자');
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).first().click({ timeout: 3000 });
  await wait(2500); await skipTut(page);
}
async function startBattle(page) {
  await openTest(page, '바로 전투');
  await page.getByRole('button', { name: '전투 시작' }).first().click({ timeout: 3000 });
  await page.waitForFunction(() => !!window.__bhaCombat && window.__bhaCombat.tick > 5, null, { timeout: 15000 });
  await page.evaluate(() => {
    const s = window.__bhaCombat;
    s.enemy.maxHp *= 50; s.enemy.hp = s.enemy.maxHp; s.player.maxHp *= 3; s.player.hp = s.player.maxHp;
    s.spawnTimer = 1e9; s.enemy.attackTimer = 1e9; s.enemy.actionTimer = 1e9; s.params.timeLimitSeconds = 1e6; s.player.attackTimer = 1e9;
  });
}
/** 화면에 보이는 글자 중 진화 단계·진화체 흔적 */
const texts = (page) => page.evaluate(() => (document.querySelector('.bha-root, body')?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 1500));
const figBox = (page, sel) => page.evaluate((sel) => [...document.querySelectorAll(sel)].filter((n) => n.offsetParent).map((n) => { const r = n.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y), cls: n.className }; }), sel);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const explore = process.argv[3] === 'explore';
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { errors: [], shots: [], facts: {} };
  const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  try {
    const ctx = await browser.newContext(PC);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => proof.errors.push(e.message.slice(0, 200)));
    await newGame(page, server.url);
    await becomeTranscendent(page, '이치고');
    proof.facts.ichigoRoom = await texts(page);
    await shot(page, '00-ichigo-room-nametag');
    // 1) 초월자 상태 화면
    await page.locator('.bha-room__status').first().click({ timeout: 3000 });
    await wait(900);
    proof.facts.ichigoStatus = await texts(page);
    await page.locator('[data-evolution]').first().scrollIntoViewIfNeeded().catch(() => {});
    await wait(400);
    await shot(page, '01-ichigo-status');
    await back(page);
    // 2) 무월 이치고 전투
    await startBattle(page);
    proof.facts.battleText = await texts(page);
    proof.facts.normalBox = await figBox(page, '.bha-unit--me .bha-hero__img');
    await shot(page, '06-ichigo-normal-battle'); // 크기 비교: 무월 전 몸(기반 진화체 종이인형)
    await page.evaluate(() => { const s = window.__bhaCombat; s.kit.risk = 0; s.kit.mastery = 100; s.tray = []; });
    await wait(500);
    await page.locator('.bha-v2herolib').first().click({ timeout: 3000, force: true });
    await wait(1800);
    proof.facts.mugetsu = await page.evaluate(() => ({ second: window.__bhaCombat.kit.second, layers: [...document.querySelectorAll('.bha-hero__alt img')].map((i) => i.getAttribute('src')) }));
    proof.facts.mugetsuBox = await figBox(page, '.bha-unit--me .bha-hero__img');
    await shot(page, '02-ichigo-mugetsu-battle');
    await ctx.close();
    // 3) 아이젠 방·전투
    const ctx2 = await browser.newContext(PC);
    const p2 = await ctx2.newPage();
    p2.on('pageerror', (e) => proof.errors.push(e.message.slice(0, 200)));
    await newGame(p2, server.url);
    await becomeTranscendent(p2, '아이젠');
    proof.facts.aizenRoomBox = await figBox(p2, '.bha-char__frame img, .bha-room img[class*="char"]');
    await shot(p2, '04-aizen-room');
    await startBattle(p2);
    proof.facts.aizenBattleBox = await figBox(p2, '.bha-hero__img, .bha-foe img');
    await shot(p2, '05-aizen-battle');
    await ctx2.close();
  } catch (e) {
    proof.errors.push(String(e).slice(0, 400));
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close(); server.stop?.();
    console.log(JSON.stringify(proof, null, 1));
    process.exit(0);
  }
})();
