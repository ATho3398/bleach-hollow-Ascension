// C.476 proof (GDD v6.106 7절·12-4): 블록 모션 길이 통일(1/2/3체인 0.8/1.0/1.2초) · 아이젠 프라고르 몫 0.6 · 경화수월 반격 창 0.8초.
// 01 3단계 아쥬커스 3체인 모션 중간(PC) · 02 사신 3체인 모션(PC) · 03 아이젠 융합 중 레일(프라고르 섞임, PC) · 04 아이젠 반격 창 발광(폰).
// 브라우저 안 실측: 블록을 쓴 틱 → 엔진 몸동작 끝 틱(평타 멈춤 길이), 화면 재생 배율(cue.pace 와 같은 식)도 같이 적는다. PC 844×390 · 폰 796×384 1배.
// 실행: node scripts/c476-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c476'));
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
async function openTest(page, tabName) {
  if (!(await page.locator('.bha-test-page').count())) { // 이미 테스트 화면이면 탭만 바꾼다
    await page.getByRole('button', { name: /더보기/ }).first().click({ timeout: 3000 });
    await wait(400);
    await page.getByRole('button', { name: '테스트', exact: true }).first().click({ timeout: 3000 });
    await wait(700);
  }
  await page.locator('.bha-test-page .bha-viewtitle, .bha-test-page [aria-haspopup]').first().click({ timeout: 2000 }).catch(() => {});
  await wait(300);
  await page.getByRole('option', { name: tabName }).or(page.getByRole('menuitemradio', { name: tabName })).or(page.getByRole('button', { name: tabName })).first().click({ timeout: 3000 });
  await wait(600);
}
async function pickForm(page, label) {
  await openTest(page, '진화체');
  await page.getByRole('button', { name: '진화체', exact: true }).first().click({ timeout: 3000 });
  await wait(300);
  await page.getByRole('option', { name: label }).first().click({ timeout: 3000 });
  await wait(200);
  await page.getByRole('button', { name: '이 몸으로' }).first().click({ timeout: 3000 });
  await wait(1500);
  await skipTut(page);
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
/** 같은 계열 공격 블록 n개를 바에 놓고 첫 칸을 눌러 n체인 — 엔진 몸동작 길이(틱)·화면 배율을 잰다 */
const useChain = (page, n, family) => page.evaluate(async ({ n, family }) => {
  const C = await import('/src/engine/combat/index.ts');
  const s = window.__bhaCombat;
  const fam = family ?? Object.keys(s.params.families)[0];
  s.tray = Array.from({ length: n }, () => ({ uid: s.nextUid++, kind: 'skill', traitId: C.BASIC_SKILL_ID, family: fam, element: null }));
  await new Promise((r) => requestAnimationFrame(() => r(0)));
  document.querySelector('.bha-tray .bha-block, [data-cell="0"]')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  const t0 = s.tick;
  const ok = C.applyInput(s, { type: 'use', cell: 0 });
  const cur = s.motion?.cur;
  const key = C.blockHitKey(fam, n);
  const nat = C.motionSpecOf(s.params, key);
  const m = C.blockMotionOf(s.params, key, n);
  return { ok, family: fam, chain: n, tick: t0, motionTicks: cur ? cur.endTick - t0 : 0, engineSeconds: m?.total ?? 0, naturalSeconds: nat?.total ?? 0, pace: m?.rate ?? 1, hitDelay: C.blockHitDelayOf(s.params, key, n), motionTier: s.params.motion?.tier ?? null };
}, { n, family });

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { errors: [], shots: [], facts: {}, table: null };
  const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  const step = async (name, fn) => { try { await fn(); } catch (e) { proof.errors.push(`${name}: ${String(e).slice(0, 300)}`); } };
  try {
    for (const [key, card, form, file] of [['adjuchas', 0, /아쥬커스/, '01-pc-adjuchas-3chain-mid'], ['shinigami', 1, /평대원/, '02-pc-shinigami-3chain-mid']]) {
      const ctx = await browser.newContext(PC);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`${key}: ${e.message.slice(0, 200)}`));
      await step(key, async () => {
        await newGame(page, server.url, card);
        await pickForm(page, form);
        await startBattle(page);
        const look = await page.evaluate(() => document.querySelector('.bha-unit--me [data-look], .bha-hero [data-look]')?.getAttribute('data-look') ?? null);
        const rows = [];
        for (const n of [1, 2, 3]) {
          rows.push(await useChain(page, n));
          await page.waitForFunction(() => !window.__bhaCombat.motion?.cur && !(window.__bhaCombat.motion?.queue.length), null, { timeout: 8000 });
          await wait(500);
        }
        const r3 = await useChain(page, 3);
        await page.waitForFunction((t) => window.__bhaCombat.tick >= t + 6, r3.tick, { timeout: 8000 }); // 1.2초 모션의 중간(0.6초)
        await shot(page, file);
        proof.facts[key] = { look, chains: [...rows, { ...r3, shot: file }] };
        await page.waitForFunction(() => !window.__bhaCombat.motion?.cur, null, { timeout: 8000 });
      });
      await ctx.close();
    }
    for (const [vpName, vp] of [['pc', PC], ['phone', PH]]) {
      const ctx = await browser.newContext(vp);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`aizen ${vpName}: ${e.message.slice(0, 200)}`));
      await step(`aizen ${vpName}`, async () => {
        await newGame(page, server.url, 0);
        await openTest(page, '붕옥·초월자');
        await page.getByRole('button', { name: /^아이젠/ }).first().click({ timeout: 3000 });
        await wait(2500); await skipTut(page);
        await startBattle(page);
        const motion = await page.evaluate(async () => {
          const C = await import('/src/engine/combat/index.ts');
          const s = window.__bhaCombat;
          return { block: s.params.motion?.block, blockMotion: C.blockMotionOf(s.params, null, 3), tier: s.params.motion?.tier ?? null, fragorWeight: s.params.kit?.blocks?.find?.((b) => b.id === 'fragor')?.weight ?? null, counterWindow: s.params.kit?.blocks?.find?.((b) => b.id === 'kyoka')?.counter?.windowSeconds ?? null };
        });
        proof.facts[`aizen-${vpName}`] = { motion };
        if (vpName === 'pc') {
          // 융합 → 블록이 나오게(생성 타이머 짧게) → 레일에 귀도·프라고르 섞임
          await page.evaluate(async () => {
            const C = await import('/src/engine/combat/index.ts');
            const s = window.__bhaCombat;
            s.kit.risk = 90;
            C.applyInput(s, { type: 'liberate' });
            s.spawnTimer = 1;
          });
          // 프라고르가 섞이고 바가 반쯤 찰 때까지 생성(몫 귀도 0.9 : 프라고르 0.6 — 굴림이라 기다린다), 그다음 생성 멈춤
          for (let i = 0; i < 80; i++) {
            const done = await page.evaluate(() => { const s = window.__bhaCombat; const ok = s.tray.length >= 5 && s.tray.some((b) => /fragor/.test(b.traitId ?? '')) && s.tray.some((b) => /kido/.test(b.traitId ?? '')); if (ok) s.spawnTimer = 1e9; else { if (s.tray.length >= 7) s.tray.shift(); s.spawnTimer = Math.min(s.spawnTimer, 2); } return ok; });
            if (done) break;
            await wait(250);
          }
          await wait(400);
          proof.facts['aizen-pc'].rail = await page.evaluate(async () => ({ fused: (await import('/src/engine/combat/index.ts')).liberationActive(window.__bhaCombat), tray: window.__bhaCombat.tray.map((b) => (b.traitId ?? b.kind).replace(/^.*:/, '')), risk: window.__bhaCombat.kit.risk }));
          await shot(page, '03-pc-aizen-fusion-rail');
        } else {
          // 경화수월 반격 창: 바에 경화수월 → 적 일반 공격을 맞음 → 0.8초 창(발광)
          await page.evaluate(async () => {
            const C = await import('/src/engine/combat/index.ts');
            const s = window.__bhaCombat;
            s.params.evadeChance = 0;
            s.tray = [{ uid: s.nextUid++, kind: 'skill', traitId: C.KIT_TRAIT_PREFIX + 'kyoka', family: null, element: null }, { uid: s.nextUid++, kind: 'skill', traitId: C.KIT_TRAIT_PREFIX + 'kido', family: null, element: null }];
            s.enemy.attackTimer = 1;
          });
          await page.waitForFunction(() => document.querySelector('.bha-kitglow') !== null, null, { timeout: 8000 });
          const w = await page.evaluate(async () => {
            const C = await import('/src/engine/combat/index.ts');
            const s = window.__bhaCombat;
            return { open: C.kitCounterOpen(s), ticksLeft: s.kit.counterUntil - s.tick, glow: document.querySelectorAll('.bha-kitglow').length };
          });
          await wait(150);
          await shot(page, '04-phone-aizen-kyoka-window-glow');
          // 창 길이 실측: 열린 틱부터 닫힐 때까지
          const len = await page.evaluate(async () => {
            const C = await import('/src/engine/combat/index.ts');
            const s = window.__bhaCombat;
            const start = s.tick;
            while (C.kitCounterOpen(s)) await new Promise((r) => setTimeout(r, 20));
            return (s.tick - start) * s.params.tickSeconds;
          });
          proof.facts['aizen-phone'].counter = { ...w, closedAfterSecondsFromShot: len };
        }
      });
      await ctx.close();
    }
  } catch (e) {
    proof.errors.push(String(e).slice(0, 400));
  } finally {
    const tablePath = process.env.TABLE;
    if (tablePath && fs.existsSync(tablePath)) proof.table = JSON.parse(fs.readFileSync(tablePath, 'utf8'));
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close(); server.stop?.();
    console.log(JSON.stringify({ ...proof, table: proof.table ? `${proof.table.length} rows` : null }, null, 1));
    process.exit(0);
  }
})();
