// C.460 proof (GDD v6.088 12-4): 이치고 천년혈전 — 상태 화면 전투 모드 · 소도 자세(스택 칩) · 대도 발도 충전 중 · 혈쇄참월 분신 2명 · 천쇄참월 회색 블록 불 켜짐 · 폰 1장. PC 844×390 · 폰 796×384 1배. 실행: node scripts/c460-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c460'));
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
  s.tray = ids.map((id) => ({ uid: s.nextUid++, kind: 'skill', traitId: `kit:${id}`, family: null, element: null, ...(id === 'odachi' ? { solo: true } : {}) }));
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
    stance: s.kit.stance, stacks: s.kit.stanceStacks, lib: s.liberation.ticksLeft > 0, draw: s.kit.draw, drawPower: s.kit.drawPower, lit: s.tray.filter((b) => b.lit).length,
    tray: s.tray.map((b) => b.traitId), kitChips: txt('.bha-kitstack'), kitBuff: txt('.bha-kitbuff'), stanceBtn: document.querySelector('[data-sc="stance"]')?.textContent ?? null,
    guardBtn: document.querySelector('[data-sc="guard"]')?.getAttribute('aria-label') ?? null, libChip: txt('.bha-v2libchip'), clones: document.querySelectorAll('.bha-kitclone').length,
    gray: document.querySelectorAll('.bha-block.is-sealed').length, glow: document.querySelectorAll('.bha-block.bha-kitglow').length,
    libBtn: document.querySelector('.bha-v2herolib')?.getAttribute('aria-label') ?? null, cut: document.querySelector('.bha-libcut')?.textContent ?? null,
    blocks: [...document.querySelectorAll('.bha-block .bha-block__name')].map((n) => n.textContent),
    log: [...document.querySelectorAll('.bha-battlelog li, [class*="log"] li')].slice(-4).map((l) => l.textContent),
  };
});
const libClick = async (page) => { await page.locator('.bha-v2herolib').first().click({ timeout: 3000, force: true }); };
const startBattle = async (page) => {
  await openTest(page, '바로 전투');
  await page.getByRole('button', { name: '전투 들어가기' }).first().click({ timeout: 3000 });
  await wait(800);
  const ok = page.getByRole('button', { name: '확인', exact: true }).filter({ visible: true });
  if (await ok.count()) await ok.last().click({ timeout: 3000 }); // 적 설정 창 (C.457)
  await page.waitForFunction(() => !!window.__bhaCombat && window.__bhaCombat.tick > 5, null, { timeout: 15000 });
  await calm(page);
  await page.evaluate(() => { const s = window.__bhaCombat; s.player.attackTimer = 1e9; s.tray = []; });
};

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
    // 1) 상태 화면 '전투 모드' [기본][천년혈전] → 천년혈전 고르기
    await page.locator('.bha-room__status').first().click({ timeout: 4000 }); await wait(1000);
    const modeSeg = page.locator('[data-sc="kit-mode-tybw"]').first();
    await modeSeg.scrollIntoViewIfNeeded().catch(() => {});
    await modeSeg.click({ timeout: 3000 }); await wait(800);
    await page.locator('[data-sc="kit-mode-tybw"]').first().scrollIntoViewIfNeeded().catch(() => {});
    proof.facts.status = await page.evaluate(() => ({ panel: document.querySelector('[aria-label="전투 모드"]')?.textContent.replace(/\s+/g, ' ').trim() ?? null, mode: document.querySelector('[data-kit-mode]')?.getAttribute('data-kit-mode') ?? null }));
    await shot(page, '01-pc-status-mode');
    await back(page);
    // 2) 천년혈전 전투 — 소도 자세, 스택 12/30 · 소도 블록 4개
    await startBattle(page);
    await page.evaluate(() => {
      const s = window.__bhaCombat; s.kit.stanceStacks[0] = 12; s.kit.stanceUntil[0] = s.tick + 1e6;
      s.tray = [0, 1, 2, 3].map(() => ({ uid: s.nextUid++, kind: 'skill', traitId: 'kit:kodachi', family: null, element: null }));
    });
    await wait(600);
    proof.facts.kodachi = await facts(page);
    await shot(page, '02-pc-kodachi-stacks');
    // 3) [자세] 눌러 대도 → 대도 블록 누르고 있기(발도 충전 중)
    await page.locator('[data-sc="stance"]').first().click({ timeout: 3000 }); await wait(400);
    await page.evaluate(() => { const s = window.__bhaCombat; s.player.attackTimer = 1e9; s.kit.stanceStacks[1] = 7; s.kit.stanceUntil[1] = s.tick + 1e6; s.kit.holdTicks = 60; });
    const odUids = await setTray(page, ['odachi', 'odachi', 'odachi']);
    const box = await page.locator(`.bha-block[data-uid="${odUids[0]}"]`).first().boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await wait(700);
    proof.facts.draw = await facts(page);
    await shot(page, '03-pc-odachi-draw');
    await page.mouse.up(); await wait(400);
    proof.facts.drawReleased = await facts(page);
    // 4) 혈쇄참월: 소도로 돌아와 스택 25 → 해방, 바에 소도 6개(분신 2명) → 평타 한 대 순간
    await page.evaluate(() => { const s = window.__bhaCombat; s.kit.stanceReadyAt = 0; });
    await page.locator('[data-sc="stance"]').first().click({ timeout: 3000 }); await wait(300);
    await page.evaluate(() => {
      const s = window.__bhaCombat; s.player.attackTimer = 1e9; s.kit.stanceStacks[0] = 25; s.kit.stanceUntil[0] = s.tick + 1e6;
      s.tray = [0, 1, 2, 3, 4, 5].map(() => ({ uid: s.nextUid++, kind: 'skill', traitId: 'kit:kodachi', family: null, element: null }));
    });
    await wait(300);
    await libClick(page); await wait(1500);
    await page.evaluate(() => { const s = window.__bhaCombat; s.kit.stanceStacks[0] = 25; s.player.attackTimer = 1; });
    await page.waitForSelector('.bha-kitclone', { timeout: 5000 }).catch(() => {});
    await wait(330);
    proof.facts.clones = await facts(page);
    proof.facts.cloneRects = await page.evaluate(() => [...document.querySelectorAll('.bha-kitclone')].map((n) => { const r = n.getBoundingClientRect(); const cs = getComputedStyle(n); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height), cs.opacity, cs.transform, n.parentElement?.className]; }));
    proof.facts.heroRect = await page.evaluate(() => { const n = document.querySelector('.bha-kitclone')?.parentElement?.querySelector(':scope > :not(.bha-kitclone)'); const r = n?.getBoundingClientRect(); return r ? [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height), n.className] : null; });
    await shot(page, '04-pc-kessa-clones');
    await page.evaluate(() => { window.__bhaCombat.player.attackTimer = 1e9; });
    // 5) 천쇄참월: 만해를 풀고 대도로 → 스택 25 → 해방, 회색 블록 6개 중 3개 불 켜기
    await page.evaluate(() => { const s = window.__bhaCombat; s.kit.stanceStacks[0] = 1; s.player.attackTimer = 1; });
    await page.waitForFunction(() => window.__bhaCombat.liberation.ticksLeft === 0, null, { timeout: 8000 });
    await page.evaluate(() => { const s = window.__bhaCombat; s.player.attackTimer = 1e9; s.kit.stanceReadyAt = 0; });
    await wait(300);
    await page.locator('[data-sc="stance"]').first().click({ timeout: 3000 }); await wait(300);
    await page.evaluate(() => { const s = window.__bhaCombat; s.player.attackTimer = 1e9; s.kit.stanceStacks[1] = 25; s.kit.stanceUntil[1] = s.tick + 1e6; s.tray = []; });
    await wait(300);
    await libClick(page); await wait(1500);
    await page.evaluate(() => { const s = window.__bhaCombat; s.player.attackTimer = 1e9; });
    const grayUids = await setTray(page, ['odachi', 'odachi', 'odachi', 'odachi', 'odachi', 'odachi']);
    await wait(300);
    for (const u of grayUids.slice(0, 3)) { await clickUid(page, u); await wait(250); }
    await wait(400);
    proof.facts.lanterns = await facts(page);
    await shot(page, '05-pc-tensa-lanterns');
    await ctx.close();
    // 6) 폰: 소도 자세 스택 칩
    const pctx = await browser.newContext(PH);
    const pp = await pctx.newPage();
    pp.on('pageerror', (e) => proof.errors.push(`phone: ${e.message.slice(0, 200)}`));
    await newGame(pp, server.url);
    await openTest(pp, '붕옥·초월자');
    await pp.getByRole('button', { name: '이치고 · 천년혈전' }).first().click({ timeout: 3000 });
    await wait(2500); await skipTut(pp);
    await startBattle(pp);
    await pp.evaluate(() => {
      const s = window.__bhaCombat; s.kit.stanceStacks[0] = 21; s.kit.stanceUntil[0] = s.tick + 1e6;
      s.tray = [0, 1, 2].map(() => ({ uid: s.nextUid++, kind: 'skill', traitId: 'kit:kodachi', family: null, element: null }));
    });
    await wait(600);
    proof.facts.phone = await facts(pp);
    await shot(pp, '06-phone-kodachi');
    await pctx.close();
  } catch (e) {
    proof.errors.push(String(e).slice(0, 400));
    for (const c of browser.contexts()) for (const pg of c.pages()) await pg.screenshot({ path: path.join(OUT, '_err.png') }).catch(() => {});
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close(); server.stop?.();
    console.log(JSON.stringify(proof, null, 1));
    process.exit(0);
  }
})();
