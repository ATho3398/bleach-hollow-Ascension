// C.505 proof (GDD 12-4 — 그림 없는 초월자 = 빈 자리): PC 844×390, 1배.
// 01 유하바하 방 · 02 유하바하 전투 · 03 기본 모드 이치고 방 · 04 아이젠 방(그림 그대로). 실행: node scripts/c505-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c505'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** 초월자 트랙(tid)으로 바꾼 세이브를 슬롯 1에 쓰고 이어하기 */
async function seed(page, url, tid) {
  await page.goto(`${url}?test=1`);
  await page.evaluate(() => localStorage.clear());
  const info = await page.evaluate(async (tid) => {
    const g = await import('/src/game.ts');
    const slots = await import('/src/saveSlots.ts');
    const tut = await import('/src/engine/tutorial.ts');
    const tm = await import('/src/engine/testMode.ts');
    const store = tm.testStorage(localStorage);
    const now = Date.now();
    const s = g.newSaveData('hollow', now);
    s.name = '호영';
    s.gender = 'male';
    s.help.tutorialSeen = true;
    for (const id of tut.GUIDE_IDS) s.help.guides[id] = 'done';
    s.nest.hunger = 80;
    s.nest.condition = 90;
    tm.testGrantTranscendent(s, tid, now);
    g.switchTrack(s, `tr:${tid}`, now);
    slots.writeSlotSave(store, s, 1);
    slots.touchSlot(store, 1, now);
    return { tr: s.transcendentId, skin: s.skin, artSkin: g.artSkinOf(s) };
  }, tid);
  await page.goto(`${url}?test=1`);
  await wait(1500);
  const cont = page.getByRole('button', { name: '이어하기' });
  if (await cont.count()) await cont.click({ timeout: 5000 });
  else {
    await page.getByRole('button', { name: '불러오기' }).click({ timeout: 5000 });
    await wait(500);
    await page.locator('.bha-slot').first().click();
    await page.getByRole('button', { name: '확인' }).click({ timeout: 3000 });
  }
  await wait(2500);
  for (let i = 0; i < 4 && (await page.locator('[data-dev-layer], .bha-tut').count()); i++) { await page.keyboard.press('Escape'); await wait(250); }
  return info;
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

async function battle(page) {
  await openTest(page, '바로 전투');
  await page.getByRole('button', { name: '전투 들어가기' }).first().click({ timeout: 3000 });
  await wait(800);
  const ok = page.getByRole('button', { name: '확인', exact: true }).filter({ visible: true });
  if (await ok.count()) await ok.last().click({ timeout: 3000 });
  await page.waitForFunction(() => !!window.__bhaCombat && window.__bhaCombat.tick > 5, null, { timeout: 15000 });
  await page.evaluate(() => {
    const s = window.__bhaCombat;
    s.enemy.maxHp *= 50; s.enemy.hp = s.enemy.maxHp; s.player.maxHp *= 3; s.player.hp = s.player.maxHp;
    s.spawnTimer = 1e9; s.enemy.attackTimer = 1e9; s.enemy.actionTimer = 1e9; s.params.timeLimitSeconds = 1e6; s.player.attackTimer = 1e9;
  });
  await wait(300);
}

const bodyOf = (page, sel) => page.evaluate((sel) => {
  const b = document.querySelector(sel);
  return b ? { cls: b.className, empty: !!b.querySelector('.bha-emptyart'), img: b.querySelector('img')?.getAttribute('src') ?? null } : null;
}, sel);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { shots: [], errors: [], checks: {} };
  const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  const room = async (name, tid) => {
    const page = await browser.newPage(PC);
    page.on('pageerror', (e) => proof.errors.push(`${name}: ${e.message}`));
    const info = await seed(page, srv.url, tid);
    proof.checks[name] = { ...info, body: await bodyOf(page, '.bha-char__body') };
    await shot(page, name);
    return page;
  };
  try {
    const p1 = await room('01-yhwach-room', 'yhwach');
    await battle(p1);
    proof.checks['02-yhwach-battle'] = { body: await bodyOf(p1, '.bha-unit--me .bha-hero__body') };
    await shot(p1, '02-yhwach-battle');
    await p1.close();
    await (await room('03-ichigo-basic-room', 'ichigo')).close();
    await (await room('04-aizen-room', 'aizen')).close();
  } catch (e) {
    proof.errors.push(String(e && e.stack || e));
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 1));
  await browser.close(); srv.stop(); process.exit(0);
})();
