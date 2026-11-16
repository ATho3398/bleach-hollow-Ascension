// C.461 proof (GDD v6.090 15-6): 만해 오라 — 해방 열림(호로·사신·이치고) · 해방 순간(해방1 동작)·해방 중 · 무월 실시간 불꽃 · 폰 1장. PC 844×390 · 폰 796×384 1배.
// 실행: node scripts/c461-proof.cjs [저장 폴더]  
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c461'));
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
async function newGame(page, url, card = 0) {
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
  await page.locator('.bha-species__card').nth(card).click();
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
const calm = (page) => page.evaluate(() => {
  const s = window.__bhaCombat;
  s.enemy.maxHp *= 50; s.enemy.hp = s.enemy.maxHp; s.player.maxHp *= 3; s.player.hp = s.player.maxHp;
  s.spawnTimer = 1e9; s.enemy.attackTimer = 1e9; s.enemy.actionTimer = 1e9; s.params.timeLimitSeconds = 1e6; s.player.attackTimer = 1e9; s.tray = [];
});
const startBattle = async (page) => {
  await openTest(page, '바로 전투');
  await page.getByRole('button', { name: '전투 들어가기' }).first().click({ timeout: 3000 });
  await wait(800);
  const ok = page.getByRole('button', { name: '확인', exact: true }).filter({ visible: true });
  if (await ok.count()) await ok.last().click({ timeout: 3000 });
  await page.waitForFunction(() => !!window.__bhaCombat && window.__bhaCombat.tick > 5, null, { timeout: 15000 });
  await calm(page);
};
const fill = (page) => page.evaluate(() => { window.__bhaCombat.liberation.gauge = 100; });
const aura = (page) => page.evaluate(() => {
  const s = window.__bhaCombat;
  const a = document.querySelector('.bha-bankaiaura');
  const r = (n) => { if (!n) return null; const b = n.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; };
  const img = document.querySelector('.bha-unit--me .bha-hero__img, .bha-unit--me .bha-hero__body canvas');
  return {
    gauge: s.liberation.gauge, active: s.liberation.ticksLeft > 0 || !!s.liberation.endless, elements: s.params.playerElements,
    fx: a && !a.hidden ? a.dataset.fx : null, auraRect: a && !a.hidden ? r(a) : null, heroImg: r(img), lift: r(document.querySelector('.bha-unit--me .bha-hero__lift')),
    appCls: ['is-lib-ready', 'has-bankai-aura', 'is-liberated'].filter((c) => document.querySelector('.bha-battle')?.classList.contains(c)),
    oldAuraShown: getComputedStyle(document.querySelector('.bha-libaura') ?? document.body).display,
  };
});

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { errors: [], shots: [], facts: {} };
  const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  try {
    // 1) 호로 1단계 — 해방 게이지 덜 참(꺼짐) → 가득(해방 열림)
    for (const [card, tag] of [[0, 'hollow'], [1, 'shinigami']]) {
      const ctx = await browser.newContext(PC);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`${tag}: ${e.message.slice(0, 200)}`));
      await newGame(page, server.url, card);
      await startBattle(page);
      await wait(400);
      proof.facts[`${tag}-closed`] = await aura(page);
      await fill(page); await wait(1200);
      proof.facts[`${tag}-ready`] = await aura(page);
      await shot(page, `0${card + 1}-pc-${tag}-ready`);
      if (card === 0) { // 해방 순간 = 해방1 동작(있는 몸만) + 컷인 · 해방 중 오라
        await page.locator('.bha-v2herolib').first().click({ timeout: 3000, force: true });
        await wait(450);
        proof.facts[`${tag}-release`] = { ...(await aura(page)), cut: await page.evaluate(() => document.querySelector('.bha-libcut')?.className ?? null) };
        await shot(page, '08-pc-hollow-release');
      }
      await ctx.close();
    }
    // 2) 이치고(초월자) — 해방 열림 → 해방 중
    {
      const ctx = await browser.newContext(PC);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`ichigo: ${e.message.slice(0, 200)}`));
      await newGame(page, server.url, 0);
      await openTest(page, '붕옥·초월자');
      await page.getByRole('button', { name: /^이치고/ }).first().click({ timeout: 3000 });
      await wait(2500); await skipTut(page);
      await startBattle(page);
      await fill(page); await wait(1200);
      proof.facts['ichigo-ready'] = await aura(page);
      await shot(page, '03-pc-ichigo-ready');
      await page.locator('.bha-v2herolib').first().click({ timeout: 3000, force: true });
      await wait(2200);
      await page.evaluate(() => { window.__bhaCombat.player.attackTimer = 1e9; });
      proof.facts['ichigo-active'] = await aura(page);
      await shot(page, '04-pc-ichigo-active');
      await ctx.close();
    }
    // 2b) 이치고 무월 — 실시간 불꽃(몸 뒤 캔버스). 무월 평타는 돌진이 없어 끌림 장면은 단위 테스트(tests/c461)로만
    {
      const ctx = await browser.newContext(PC);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`mugetsu: ${e.message.slice(0, 200)}`));
      await newGame(page, server.url, 0);
      await openTest(page, '붕옥·초월자');
      await page.getByRole('button', { name: /^이치고/ }).first().click({ timeout: 3000 });
      await wait(2500); await skipTut(page);
      await startBattle(page);
      await page.evaluate(() => { const s = window.__bhaCombat; s.kit.risk = 0; s.kit.mastery = 100; s.tray = []; });
      await wait(500);
      await page.locator('.bha-v2herolib').first().click({ timeout: 3000, force: true });
      await wait(2500);
      const live = () => page.evaluate(() => {
        const c = document.querySelector('.bha-liveflame');
        const r = c?.getBoundingClientRect();
        let ink = 0;
        if (c && c.width) { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i]) ink++; }
        return { second: window.__bhaCombat.kit.second, canvas: c ? { hidden: c.hidden, w: c.width, h: c.height, rect: r && [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], ink } : null,
          backHidden: getComputedStyle(document.querySelector('.bha-hero__altback') ?? document.body).visibility };
      });
      proof.facts['mugetsu-idle'] = await live();
      await shot(page, '06-pc-mugetsu-liveflame');
      await ctx.close();
    }
    // 3) 폰: 사신 해방 열림
    {
      const ctx = await browser.newContext(PH);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`phone: ${e.message.slice(0, 200)}`));
      await newGame(page, server.url, 0);
      await startBattle(page);
      await fill(page); await wait(1200);
      proof.facts['phone-ready'] = await aura(page);
      await shot(page, '05-phone-hollow-ready');
      await ctx.close();
    }
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
