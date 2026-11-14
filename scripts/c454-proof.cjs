// C.454 proof (GDD v6.069 12-4): 이치고 기본 모드 — 참월 충전 · 각호고 · 무월수련 · 무월 10스택 · 최후의 월아천충. PC 844×390 1배 5장. 실행: node scripts/c454-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c454'));
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

/** 바를 전용 블록으로 채운다 (테스트 모드 window.__bhaCombat — 엔진 상태 직접) */
const setTray = (page, ids) => page.evaluate((ids) => {
  const s = window.__bhaCombat;
  s.tray = ids.map((id) => ({ uid: s.nextUid++, kind: 'skill', traitId: `kit:${id}`, family: null, element: null, ...(id === 'kyoka' || id === 'hogyoku' ? { solo: true } : {}) }));
  return s.tray.map((b) => b.uid);
}, ids);
const clickUid = async (page, uid) => { await page.locator(`.bha-block[data-uid="${uid}"]`).first().click({ timeout: 3000, force: true }); };
const calm = (page) => page.evaluate(() => {
  const s = window.__bhaCombat;
  s.enemy.maxHp *= 50; s.enemy.hp = s.enemy.maxHp; s.player.maxHp *= 3; s.player.hp = s.player.maxHp;
  s.spawnTimer = 1e9; s.enemy.attackTimer = 1e9; s.enemy.actionTimer = 1e9; s.params.timeLimitSeconds = 1e6;
});
const facts = (page) => page.evaluate(() => {
  const s = window.__bhaCombat;
  const txt = (q) => [...document.querySelectorAll(q)].filter((n) => !n.hidden).map((n) => n.textContent.replace(/\s+/g, ' ').trim());
  return {
    risk: s.kit.risk, mastery: s.kit.mastery, charges: s.kit.charges, second: s.kit.second, finalStack: s.kit.finalStack, lib: s.liberation.ticksLeft > 0, gauge: s.liberation.gauge,
    tray: s.tray.map((b) => b.traitId), riskChip: txt('.bha-riskchip'), kitChips: txt('.bha-kitstack'), libChip: txt('.bha-v2libchip'),
    libBtn: document.querySelector('.bha-v2herolib')?.getAttribute('aria-label') ?? null, cut: document.querySelector('.bha-libcut')?.textContent ?? null,
    blocks: [...document.querySelectorAll('.bha-block .bha-block__name')].map((n) => n.textContent),
    log: [...document.querySelectorAll('.bha-battlelog li, [class*="log"] li')].slice(-4).map((l) => l.textContent),
  };
});
const libClick = async (page) => { await page.locator('.bha-v2herolib').first().click({ timeout: 3000, force: true }); };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { errors: [], shots: [], facts: {} };
  const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  try {
    const ctx = await browser.newContext(PC);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => proof.errors.push(e.message.slice(0, 200)));
    await newGame(page, server.url);
    await openTest(page, '붕옥·초월자');
    await page.getByRole('button', { name: /^이치고/ }).first().click({ timeout: 3000 });
    await wait(2500); await skipTut(page);
    await openTest(page, '바로 전투');
    await page.getByRole('button', { name: '전투 시작' }).first().click({ timeout: 3000 });
    await page.waitForFunction(() => !!window.__bhaCombat && window.__bhaCombat.tick > 5, null, { timeout: 15000 });
    await calm(page);
    await page.evaluate(() => { const s = window.__bhaCombat; s.player.attackTimer = 1e9; s.tray = []; s.liberation.gauge = 40; });
    // 1) 참월: 월아천충 1블록 + 2체인 → 충전 3 · 호로화 100 − 5 − 8 = 87 (v6.074)
    let uids = await setTray(page, ['getsuga']);
    await clickUid(page, uids[0]); await wait(900);
    uids = await setTray(page, ['getsuga', 'getsuga']);
    await clickUid(page, uids[0]); await wait(900);
    proof.facts.zangetsu = await facts(page);
    await shot(page, '01-pc-zangetsu-charge');
    // 충전 평타 한 대 (월아천충 ×2.0) — 숫자만 확인
    await page.evaluate(() => { window.__bhaCombat.player.attackTimer = 1; });
    await wait(1200);
    await page.evaluate(() => { window.__bhaCombat.player.attackTimer = 1e9; });
    proof.facts.afterShot = await facts(page);
    // 2) 각호고: 만해 게이지 가득 → 캐릭터 눌러 해방 (컷인 '각호고')
    await page.evaluate(() => { const s = window.__bhaCombat; s.liberation.gauge = 100; s.tray = []; });
    await wait(400);
    await libClick(page); await wait(500);
    proof.facts.kago = await facts(page);
    await shot(page, '02-pc-kagoko');
    // 월아천충 평타로 호로화를 다 쓴다 (평타마다 −5 + 1초마다 −4) → 각호고 풀림 · 무월수련
    await page.evaluate(() => { const s = window.__bhaCombat; s.kit.charges = 9; s.player.attackTimer = 1; });
    await page.waitForFunction(() => window.__bhaCombat.kit.risk <= 0, null, { timeout: 30000 });
    await page.evaluate(() => { const s = window.__bhaCombat; s.player.attackTimer = 1e9; s.kit.charges = 0; s.tray = []; });
    proof.facts.kagoEnd = await facts(page);
    // 3) 무월수련: 블록 4개 쓰기 (+4 씩) + 평타 몇 대 (+2) — 값은 테스트 모드로 46 에 맞춤
    await page.evaluate(() => { window.__bhaCombat.kit.mastery = 42; });
    uids = await setTray(page, ['getsuga']);
    await clickUid(page, uids[0]); await wait(1200);
    await page.evaluate(() => { window.__bhaCombat.kit.charges = 0; });
    proof.facts.mugetsuTraining = await facts(page);
    await shot(page, '03-pc-mugetsu-training');
    // 4) 무월: 수련 가득 → 캐릭터 눌러 해방, 10스택 + 바에 월아천충 3개
    await page.evaluate(() => { window.__bhaCombat.kit.mastery = 100; });
    await wait(500);
    proof.facts.mugetsuReady = await facts(page);
    await libClick(page); await wait(1600);
    await page.evaluate(() => {
      const s = window.__bhaCombat; s.kit.finalStack = 10; s.kit.charges = 0;
      s.tray = [0, 1, 2].map(() => ({ uid: s.nextUid++, kind: 'skill', traitId: 'kit:getsuga', family: null, element: null }));
    });
    await wait(500);
    proof.facts.mugetsu10 = await facts(page);
    await shot(page, '04-pc-mugetsu-10stack');
    // 5) 최후의 월아천충: 다음 평타 → 무월 풀림 · 호로화 100 · 무월수련 0
    await page.evaluate(() => { window.__bhaCombat.player.attackTimer = 1; });
    await page.waitForFunction(() => window.__bhaCombat.kit.finals > 0, null, { timeout: 15000 });
    await page.evaluate(() => { window.__bhaCombat.player.attackTimer = 1e9; });
    await wait(350);
    proof.facts.final = await facts(page);
    await shot(page, '05-pc-final-getsuga');
    await ctx.close();
  } catch (e) {
    proof.errors.push(String(e).slice(0, 400));
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close(); server.stop?.();
    console.log(JSON.stringify(proof, null, 1));
    process.exit(0);
  }
})();
