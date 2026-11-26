// C.540 proof ([블록 생성 위치 반전] 설정, GDD 7절 v6.205): 1배, 6장.
// 01 PC · 04 폰 설정 전투 탭 [조작] 토글 켬 / 02 PC · 05 폰 전투 블록 바 끔(칸 1 맨 오른쪽) / 03 PC · 06 폰 켬(칸 1 맨 왼쪽) — 체인3·체인2 묶음 보이게
// 실행: node scripts/c540-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c540'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function seed(page, url, flip) {
  await page.goto(`${url}?test=1`);
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async (flip) => {
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
    slots.writeSlotSave(store, s, 1);
    slots.touchSlot(store, 1, now);
    if (flip) localStorage.setItem('bha-tray-flip', '1');
  }, flip);
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

async function enterBattle(page) {
  await openTest(page, '바로 전투');
  await page.getByRole('button', { name: '전투 들어가기' }).first().click({ timeout: 3000 });
  await wait(800);
  const ok = page.getByRole('button', { name: '확인', exact: true }).filter({ visible: true });
  if (await ok.count()) await ok.last().click({ timeout: 3000 });
  await page.waitForFunction(() => !!window.__bhaCombat && window.__bhaCombat.tick > 5, null, { timeout: 15000 });
}

/** 전투를 멈춰 세우고 바를 채운다: 칸 1~3 = 계열 A(체인3), 칸 4~5 = 계열 B(체인2), 칸 6 = 계열 C */
async function setTray(page) {
  await page.evaluate(() => {
    const s = window.__bhaCombat;
    s.enemy.maxHp *= 50; s.enemy.hp = s.enemy.maxHp; s.player.maxHp *= 3; s.player.hp = s.player.maxHp;
    s.spawnTimer = 1e9; s.enemy.attackTimer = 1e9; s.enemy.actionTimer = 1e9; s.params.timeLimitSeconds = 1e6; s.player.attackTimer = 1e9;
    const b = (traitId, family) => ({ uid: s.nextUid++, kind: 'skill', traitId, family, element: 'fire' });
    s.tray = [b('t-fire-a', 'family-a'), b('t-fire-a', 'family-a'), b('t-fire-a', 'family-a'), b('t-fire-c', 'family-c'), b('t-fire-c', 'family-c'), b('t-fire-b', 'family-b')];
    window.__c540uids = s.tray.map((x) => x.uid);
  });
  await wait(500);
}

/** 칸 1·2 의 화면 x, 체인 묶음 자리, 기기 시작 칸, 맨 왼쪽 칸 누르기 → 쓰인 칸 */
const facts = (page) => page.evaluate(() => {
  const grid = document.querySelector('.bha-v2tray__grid');
  const cells = [...grid.querySelectorAll(':scope > .bha-v2cell')];
  const xs = cells.map((c) => Math.round(c.getBoundingClientRect().left));
  const uidAt = cells.map((c) => Number(c.querySelector('.bha-block')?.dataset.uid ?? -1));
  const tray = window.__bhaCombat.tray.map((b) => b.uid);
  const chains = [...grid.querySelectorAll('.bha-v2chain')].map((c) => ({ text: c.textContent, left: Math.round(c.getBoundingClientRect().left), right: Math.round(c.getBoundingClientRect().right) }));
  const start = grid.querySelector('[data-dev-start]');
  const slot1 = cells.find((c) => Number(c.querySelector('.bha-block')?.dataset.uid) === tray[0]);
  return {
    flipClass: grid.classList.contains('is-fill-left'),
    domCellX: xs,
    domOrderUids: uidAt,
    engineTray: tray,
    slot1X: slot1 ? Math.round(slot1.getBoundingClientRect().left) : null,
    devStartIsSlot1: !!start && start === slot1,
    chains,
  };
});

async function battleShot(browser, url, ctxOpt, name, F, key, flip) {
  const page = await (await browser.newContext(ctxOpt)).newPage();
  page.on('pageerror', (e) => F.errors.push(`${key}: ${e.message}`));
  await seed(page, url, flip);
  await enterBattle(page);
  await setTray(page);
  F[key] = await facts(page);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  // 숫자키 1 = 칸 1 (반전과 무관) — 캡처 뒤에 눌러 확인
  const before = await page.evaluate(() => window.__bhaCombat.tray.map((b) => b.uid));
  await page.keyboard.press('1');
  await wait(400);
  const after = await page.evaluate(() => window.__bhaCombat.tray.map((b) => b.uid));
  F[key].key1Used = before.filter((u) => !after.includes(u));
  F[key].key1ExpectSlot1 = before[0];
  // 화면 맨 왼쪽 칸 누르기 → 쓰인 블록
  const left = await page.evaluate(() => {
    const g = document.querySelector('.bha-v2tray__grid').getBoundingClientRect();
    const c = [...document.querySelectorAll('.bha-v2tray__grid > .bha-v2cell')].sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0].getBoundingClientRect();
    return { x: c.left + c.width / 2, y: c.top + c.height / 2, gl: g.left };
  });
  const b2 = await page.evaluate(() => window.__bhaCombat.tray.map((b) => b.uid));
  await page.mouse.click(left.x, left.y);
  await wait(400);
  const a2 = await page.evaluate(() => window.__bhaCombat.tray.map((b) => b.uid));
  F[key].leftClickUsed = b2.filter((u) => !a2.includes(u));
  F[key].leftClickTray = b2;
  await page.context().close();
}

async function settingsShot(browser, url, ctxOpt, name, F, key) {
  const page = await (await browser.newContext(ctxOpt)).newPage();
  page.on('pageerror', (e) => F.errors.push(`${key}: ${e.message}`));
  await seed(page, url, false);
  await page.getByRole('button', { name: '설정' }).first().click({ timeout: 3000 }).catch(async () => {
    await page.getByRole('button', { name: /더보기/ }).first().click({ timeout: 3000 });
    await wait(400);
    await page.getByRole('button', { name: '설정', exact: true }).first().click({ timeout: 3000 });
  });
  await wait(500);
  await page.locator('.bha-tab[data-tab="battle"]').click();
  await wait(300);
  await page.locator('[data-set="trayFlip"]').click();
  await wait(200);
  await page.evaluate(() => document.querySelector('[data-set="trayFlip"]')?.scrollIntoView({ block: 'center' }));
  await wait(300);
  F[key] = await page.evaluate(() => {
    const b = document.querySelector('[data-set="trayFlip"]');
    return { checked: b?.getAttribute('aria-checked'), text: b?.closest('.bha-setgroup, section')?.textContent?.replace(/\s+/g, ' ').trim() };
  });
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  // [저장] → 저장소에 기록
  await page.getByRole('button', { name: '저장', exact: true }).first().click({ timeout: 3000 }).catch(() => {});
  await wait(300);
  F[key].stored = await page.evaluate(() => localStorage.getItem('bha-tray-flip'));
  await page.context().close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const F = { errors: [] };
  try {
    await settingsShot(browser, server.url, PC, '01-pc-settings-toggle', F, 'pcSettings');
    await battleShot(browser, server.url, PC, '02-pc-battle-off', F, 'pcOff', false);
    await battleShot(browser, server.url, PC, '03-pc-battle-on', F, 'pcOn', true);
    await settingsShot(browser, server.url, PHONE, '04-phone-settings-toggle', F, 'phSettings');
    await battleShot(browser, server.url, PHONE, '05-phone-battle-off', F, 'phOff', false);
    await battleShot(browser, server.url, PHONE, '06-phone-battle-on', F, 'phOn', true);
  } catch (e) {
    F.errors.push(String(e && e.stack ? e.stack : e));
  } finally {
    fs.writeFileSync(path.join(OUT, 'facts.json'), JSON.stringify(F, null, 1));
    console.log(JSON.stringify(F, null, 1));
    await browser.close();
    server.stop();
  }
})();
