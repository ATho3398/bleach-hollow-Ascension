// C.441 proof (GDD 12-4 v6.048 아이젠): 전투(레일 경화수월·귀도) · 반격 창 발광 · 반격 대사 · 영창 스택 · 흑관 · 붕옥 융합 프라고르 · 되살아나기 ·
// 흡수 화면(노력치·놓아주기만) · 전용 블록 강화. PC 844×390 전부 + 폰 796×384 핵심 3장, 1배. 실행: node scripts/c441-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c441'));
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
  s.tray = ids.map((id) => ({ uid: s.nextUid++, kind: 'skill', traitId: `kit:${id}`, family: null, element: null, ...(id === 'kyoka' ? { solo: true } : {}) }));
  return s.tray.map((b) => b.uid);
}, ids);
const clickUid = async (page, uid) => { await page.locator(`.bha-block[data-uid="${uid}"]`).first().click({ timeout: 3000, force: true }); };
const calm = (page) => page.evaluate(() => {
  const s = window.__bhaCombat;
  s.enemy.maxHp *= 50; s.enemy.hp = s.enemy.maxHp; s.player.maxHp *= 3; s.player.hp = s.player.maxHp;
  s.spawnTimer = 1e9; s.enemy.attackTimer = 1e9; s.enemy.actionTimer = 1e9; s.params.timeLimitSeconds = 1e6;
});
const kitFacts = (page) => page.evaluate(() => {
  const s = window.__bhaCombat;
  return {
    tray: s.tray.map((b) => b.traitId), stack: s.kit?.stack, counters: s.kit?.counters, finishers: s.kit?.finishers, revives: s.kit?.revives,
    glow: document.querySelectorAll('.bha-kitglow').length, line: document.querySelector('.bha-kitline')?.textContent ?? null,
    lineOn: document.querySelector('.bha-kitline')?.classList.contains('is-on') ?? false,
    stackChip: document.querySelector('.bha-kitstack')?.textContent ?? null, evade: s.params.evadeChance, libName: s.params.kit?.liberationName,
    labels: [...document.querySelectorAll('.bha-block .bha-block__name')].map((n) => n.textContent),
    log: [...document.querySelectorAll('.bha-battlelog li, [class*="log"] li')].slice(-4).map((l) => l.textContent),
  };
});

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
      await newGame(page, server.url);
      await step('grant', async () => {
        await openTest(page, '붕옥·초월자');
        await page.getByRole('button', { name: /^아이젠/ }).first().click({ timeout: 3000 });
        await wait(2500);
        await skipTut(page);
        await openTest(page, '붕옥·초월자');
        await page.getByRole('button', { name: '초월 조각 +100' }).first().click({ timeout: 3000 });
        await wait(400);
        await back(page);
        await skipTut(page);
      });
      // 1) 전용 블록 강화 (상태 화면)
      await step('upgrade', async () => {
        await page.locator('.bha-room__chips > .bha-room__status').click({ timeout: 3000 });
        await wait(900);
        await page.locator('[data-sc="kit-up-kido"]').first().click({ timeout: 3000 });
        await wait(700);
        await page.locator('[data-kit-panel]').first().scrollIntoViewIfNeeded({ timeout: 3000 });
        await wait(300);
        facts.upgrade = await page.evaluate(() => document.querySelector('[data-kit-panel]')?.textContent ?? null);
        await shot('kit-upgrade');
        await back(page);
      });
      // 2) 전투
      await step('battle', async () => {
        await openTest(page, '바로 전투');
        await page.getByRole('button', { name: '전투 시작' }).first().click({ timeout: 3000 });
        await page.waitForFunction(() => !!window.__bhaCombat && window.__bhaCombat.tick > 20, null, { timeout: 15000 });
        await wait(2500);
        await calm(page);
        await setTray(page, ['kido', 'kido', 'kyoka', 'kido', 'kido', 'kido', 'kyoka']);
        await page.evaluate(() => { const s = window.__bhaCombat; s.kit.counterUntil = s.tick + 99999; s.kit.counterLost = s.player.maxHp * 0.2; s.player.hp -= s.player.maxHp * 0.2; });
        await wait(600);
        facts.rail = await kitFacts(page);
        await shot('rail-glow');
        // 반격: 발광 중인 경화수월을 쓴다
        const uid = await page.evaluate(() => window.__bhaCombat.tray.find((b) => b.traitId === 'kit:kyoka').uid);
        await clickUid(page, uid);
        await wait(450);
        facts.counter = await kitFacts(page);
        await shot('counter-line');
        if (full) {
          // 영창 4 → 3체인 귀도 = 5/5
          await page.evaluate(() => { window.__bhaCombat.kit.stack = 4; });
          let uids = await setTray(page, ['kido', 'kido', 'kido', 'kyoka']);
          await wait(300);
          await clickUid(page, uids[0]);
          await wait(2400);
          facts.stack = await kitFacts(page);
          await shot('stack-full');
          // 흑관
          uids = await setTray(page, ['kido', 'kido', 'kido']);
          await wait(300);
          await clickUid(page, uids[0]);
          await wait(500);
          facts.heukkan = await kitFacts(page);
          facts.knockback = await page.evaluate(() => window.__bhaCombat.knockbackTicks);
          await shot('heukkan');
          // 붕옥 융합 → 프라고르 3체인 = 울트라 프라고르
          await page.evaluate(() => { const s = window.__bhaCombat; s.liberation.gauge = 100; });
          await setTray(page, ['kyoka', 'kido']);
          await wait(400);
          await page.locator('.bha-unit--me .bha-unit__fig').first().click({ timeout: 3000, force: true });
          await wait(1800);
          facts.release = await kitFacts(page);
          uids = await setTray(page, ['fragor', 'fragor', 'fragor', 'kido']);
          await wait(300);
          await clickUid(page, uids[0]);
          await wait(450);
          facts.fragor = await kitFacts(page);
          await shot('fragor-ultra');
          await wait(6000);
          // 되살아나기
          await page.evaluate(() => { const s = window.__bhaCombat; s.player.hp = 1; s.params.evadeChance = 0; s.guard.ticks = 0; s.enemy.attackTimer = 2; });
          await wait(700);
          facts.revive = await kitFacts(page);
          facts.status = await page.evaluate(() => window.__bhaCombat.status);
          await shot('revive');
        }
        await page.evaluate(() => { const s = window.__bhaCombat; s.enemy.hp = 1; s.player.attackTimer = 1; });
        await wait(4000);
        await back(page); await back(page);
      });
      // 3) 흡수 화면 (모험 ★1 첫 전투 승리 — 손으로 적 체력을 1로) — PC 만
      if (full) await step('absorb', async () => {
        await page.goto(`${server.url}?test=1`);
        await wait(1500);
        const cont = page.getByRole('button', { name: '이어하기' });
        if (await cont.count()) { await cont.first().click().catch(() => {}); await wait(600); }
        const slot = page.locator('.bha-slot').first();
        if (await slot.count()) { await slot.click().catch(() => {}); await page.getByRole('button', { name: '확인' }).click().catch(() => {}); await wait(1500); }
        await skipTut(page);
        await page.locator('.bha-prop--outside').first().click({ timeout: 4000 });
        await wait(1000);
        await page.locator('.bha-worldmap [data-place="adventure"]').first().click({ timeout: 4000 });
        await wait(1800);
        for (let i = 0; i < 6 && (await page.locator('.bha-lcd [data-dev-layer]').count()); i++) { await page.keyboard.press('Escape'); await wait(250); }
        await page.locator('.bha-lcd').getByRole('button', { name: '★1', exact: true }).first().click({ timeout: 3000 }).catch(() => {});
        await wait(400);
        await page.locator('.bha-lcd').getByRole('button', { name: '출발', exact: true }).first().click({ timeout: 3000 }).catch(() => {});
        await wait(1200);
        for (let t = 0; t < 300 && !(await page.locator('.bha-absorb__actions--modes').count()); t++) {
          await page.evaluate(() => { const s = window.__bhaCombat; if (s && s.status === 'playing' && s.tick > 30) s.enemy.hp = Math.min(s.enemy.hp, 1); });
          const depart = vis(page.getByRole('button', { name: /출발$/ }));
          if (await depart.count()) { await depart.first().click({ timeout: 2000 }).catch(() => {}); await wait(800); continue; }
          const eat = vis(page.getByRole('button', { name: /하러 가기$/ }));
          const layerGo = vis(page.locator('.bha-lcd [data-dev-layer] button.bha-btn--primary'));
          if (await eat.count()) await eat.first().click({ timeout: 2000 }).catch(() => {});
          else if (await layerGo.count()) await layerGo.first().click({ timeout: 2000 }).catch(() => {});
          await wait(500);
        }
        await wait(800);
        facts.absorb = await page.evaluate(() => ({ modes: [...document.querySelectorAll('.bha-absorb__actions--modes [data-mode]')].map((b) => b.dataset.mode), text: document.querySelector('.bha-absorb__actions--modes')?.textContent ?? null }));
        await shot('absorb-stat-only');
      });
      await ctx.close();
    }
  } catch (e) {
    proof.errors.push(String(e).slice(0, 400));
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close();
    server.stop?.();
    console.log(JSON.stringify(proof, null, 1).slice(0, 6000));
    process.exit(0);
  }
})();
