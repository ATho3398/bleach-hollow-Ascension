// C.473 proof (GDD v6.102 12-4·15-6): 해방 가능 오라(켜짐) → 해방 중(오라 없음) · 최후의 월아천충 연출(자막 1 팔 올림 · 자막 2 '무월—' · 내려 베기 큰 숫자) ·
// 무월 해방 순간(옛 임시 발밑 기운 없음) · 패배 쓰러짐 숨 · 폰 1장. PC 844×390 · 폰 796×384 1배.
// 실행: node scripts/c473-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c473'));
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

async function toIchigo(page, server) {
  await newGame(page, server.url, 0);
  await openTest(page, '붕옥·초월자');
  await page.getByRole('button', { name: /^이치고/ }).first().click({ timeout: 3000 });
  await wait(2500); await skipTut(page);
}

const facts = (page) => page.evaluate(() => {
  const s = window.__bhaCombat;
  const sheet = document.querySelector('.bha-unit--me .bha-bankaiaura');
  return {
    tick: s.tick, second: s.kit.second, cine: s.kit.cine, risk: s.kit.risk, mastery: s.kit.mastery, hp: Math.round(s.player.hp), status: s.status,
    app: document.querySelector('.bha-battle')?.className,
    auraSheet: sheet ? { hidden: sheet.hidden, fx: sheet.dataset.fx ?? null } : null,
    oldAura: document.querySelectorAll('.bha-libaura').length,
    heroFilter: getComputedStyle(document.querySelector('.bha-unit--me .bha-hero__body')).filter,
    cut: document.querySelector('.bha-libcut.is-on')?.textContent ?? null,
    kitline: document.querySelector('.bha-kitline.is-on')?.textContent ?? null,
    floats: [...document.querySelectorAll('.bha-float, [class*="bha-dmg"]')].map((f) => f.textContent).slice(-4),
  };
});
const cineAt = (page, sec) => page.waitForFunction((sec) => { const s = window.__bhaCombat; return !!s.kit.cine && (s.tick - s.kit.cine.start) * s.params.tickSeconds >= sec; }, sec, { timeout: 15000 });
async function toMugetsuReady(page) {
  await startBattle(page);
  await page.evaluate(() => { const s = window.__bhaCombat; s.kit.risk = 0; s.kit.mastery = 99; s.tray = []; });
  await wait(600);
  await page.evaluate(() => { window.__bhaCombat.kit.mastery = 100; });
}
async function fireFinal(page) {
  await page.evaluate(() => {
    const s = window.__bhaCombat;
    s.kit.finalStack = s.params.kit.mastery.stacks;
    s.tray = [];
    s.player.attackTimer = 1;
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { errors: [], shots: [], facts: {} };
  const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  const step = async (name, fn) => { try { await fn(); } catch (e) { proof.errors.push(`${name}: ${String(e).slice(0, 300)}`); } };
  try {
    {
      const ctx = await browser.newContext(PC);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`pc: ${e.message.slice(0, 200)}`));
      await toIchigo(page, server);
      await step('ready-release', async () => {
        await toMugetsuReady(page);
        await wait(700);
        proof.facts.ready = await facts(page);
        await shot(page, '01-pc-mugetsu-ready-aura-on');
        await page.locator('.bha-v2herolib').first().click({ timeout: 3000, force: true });
        await wait(250);
        proof.facts.releaseMoment = await facts(page);
        await shot(page, '02-pc-mugetsu-release-moment');
        await wait(1800);
        proof.facts.during = await facts(page);
        await shot(page, '03-pc-mugetsu-during-no-aura');
      });
      await step('final', async () => {
        await fireFinal(page);
        await cineAt(page, 1.3);
        proof.facts.caption1 = await facts(page);
        await shot(page, '04-pc-final-caption1-arm-up');
        await cineAt(page, 2.95);
        proof.facts.caption2 = await facts(page);
        await shot(page, '05-pc-final-caption2-mugetsu');
        await page.waitForFunction(() => { const s = window.__bhaCombat; return !!s.kit.cine && s.tick >= s.kit.cine.hit + 1; }, null, { timeout: 15000 });
        await wait(60);
        proof.facts.slash = await facts(page);
        await shot(page, '06-pc-final-slash-big-number');
        await page.waitForFunction(() => !window.__bhaCombat.kit.cine, null, { timeout: 15000 });
        proof.facts.after = await facts(page);
      });
      await ctx.close();
    }
    {
      const ctx = await browser.newContext(PC);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`lose: ${e.message.slice(0, 200)}`));
      await toIchigo(page, server);
      await step('lose', async () => {
        // 무월 몸(종이인형)으로 진다. 테스트 모드 연속 전투는 0.8초 뒤 다음 판으로 넘어가므로(autoEnd) 캡처 동안만 그 타이머를 미룬다(결과 화면 = 계속 쓰러짐 숨)
        await toMugetsuReady(page);
        await wait(500);
        await page.locator('.bha-v2herolib').first().click({ timeout: 3000, force: true });
        await page.waitForFunction(() => window.__bhaCombat.kit.second, null, { timeout: 5000 });
        await wait(1500);
        await page.evaluate(() => {
          const st = window.setTimeout.bind(window);
          window.setTimeout = (fn, ms, ...a) => st(fn, ms === 800 ? 1e7 : ms, ...a);
          const s = window.__bhaCombat; s.player.hp = 1; s.enemy.attackTimer = 1;
        });
        await page.waitForFunction(() => window.__bhaCombat.status === 'lost', null, { timeout: 15000 });
        await wait(2300);
        proof.facts.lose = await page.evaluate(() => ({ status: window.__bhaCombat.status, second: window.__bhaCombat.kit.second }));
        await shot(page, '07-pc-lose-down-breath');
      });
      await ctx.close();
    }
    {
      const ctx = await browser.newContext(PH);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`phone: ${e.message.slice(0, 200)}`));
      await toIchigo(page, server);
      await step('phone', async () => {
        await toMugetsuReady(page);
        await wait(500);
        await page.locator('.bha-v2herolib').first().click({ timeout: 3000, force: true });
        await wait(1500);
        await fireFinal(page);
        await cineAt(page, 1.3);
        proof.facts.phone = await facts(page);
        await shot(page, '08-phone-final-caption1');
      });
      await ctx.close();
    }
  } catch (e) {
    proof.errors.push(String(e).slice(0, 400));
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close(); server.stop?.();
    console.log(JSON.stringify(proof, null, 1));
    process.exit(0);
  }
})();
