// C.489 proof (GDD v6.121 12-4·7-8): 아이젠 붕옥·경화수월 고정 몫 · 수련장 들어갔다 나오기 · 폭주 블록 문구.
// 01 아이젠 전투 레일에 붕옥·경화수월(PC) · 02 수련장 → 나가기/그만두기 → 뒤로 = 둥지(PC) · 03 같은 것 폰 · 04 폭주 블록 표시(폰). PC 844×390 · 폰 796×384 1배.
// 실행: node scripts/c489-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c489'));
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

const shown = (page) => page.evaluate(() => { const a = document.querySelector('.bha-lcd .bha-app'); return a ? [...a.classList].filter((c) => c !== 'bha-app' && c !== 'bha-v2').join('.') : 'none'; });
const press = async (page, label, ms = 600) => { await page.locator(`.bha-dev__btn[aria-label="${label}"]`).first().click({ timeout: 2000 }); await wait(ms); };
/** 둥지 수련장 → [전투 들어가기] → 창 [나가기] → 뒤로 · 수련장 → 싸움 → 뒤로(일시정지) → [그만두기] → 뒤로. 화면 이름을 다 적는다 */
async function trainingRoundTrip(page) {
  const log = [];
  const note = async (what) => log.push(`${what}: ${await shown(page)}`);
  await note('시작');
  await page.locator('[data-prop="altar"]').click({ timeout: 3000 }); await wait(700); await note('수련장');
  await page.locator('[data-sc="practice-enter"]').click({ timeout: 3000 }); await wait(1200); await note('전투 들어가기(적 설정 창)');
  await page.getByRole('button', { name: '나가기', exact: true }).click({ timeout: 3000 }); await wait(800); await note('창 [나가기]');
  await press(page, '취소'); await note('뒤로');
  await page.locator('[data-prop="altar"]').click({ timeout: 3000 }); await wait(700); await note('수련장(2번째)');
  await page.locator('[data-sc="practice-enter"]').click({ timeout: 3000 }); await wait(1200);
  await page.getByRole('button', { name: '확인', exact: true }).filter({ visible: true }).last().click({ timeout: 3000 }); await wait(1500); await note('적 [확인] = 싸움');
  await skipTut(page);
  await press(page, '취소'); await note('뒤로(일시정지)');
  await page.locator('.bha-battle-ov').getByRole('button', { name: '그만두기' }).first().click({ timeout: 3000 }); await wait(1000); await note('[그만두기]');
  await press(page, '취소'); await note('뒤로');
  return log;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { errors: [], shots: [], facts: {} };
  const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  const step = async (name, fn) => { try { await fn(); } catch (e) { proof.errors.push(`${name}: ${String(e).slice(0, 300)}`); } };
  try {
    // 01 아이젠 전투 레일: 감응도 20 고정, 블록을 자연 생성(출현표 그대로)해 붕옥·경화수월이 바에 같이 있을 때 찍는다
    {
      const ctx = await browser.newContext(PC);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`aizen: ${e.message.slice(0, 200)}`));
      await step('aizen', async () => {
        await newGame(page, server.url, 0);
        await openTest(page, '붕옥·초월자');
        await page.getByRole('button', { name: /^아이젠/ }).first().click({ timeout: 3000 });
        await wait(2500); await skipTut(page);
        await startBattle(page);
        const table = await page.evaluate(async () => {
          const C = await import('/src/engine/combat/index.ts');
          const s = window.__bhaCombat;
          s.kit.risk = 20;
          return C.spawnTableOf(s.params, false, 20).entries.map((e) => [(e.source?.id ?? e.kind).replace(/^.*:/, ''), Math.round(e.chance * 10000) / 10000]);
        });
        let spawned = 0;
        for (let i = 0; i < 200; i++) {
          const r = await page.evaluate(() => {
            const s = window.__bhaCombat;
            s.kit.risk = 20;
            const has = (b) => s.tray.some((x) => (x.traitId ?? '').endsWith(':' + b));
            if (has('hogyoku') && has('kyoka') && s.tray.length >= 4) { s.spawnTimer = 1e9; return { done: true, n: s.nextUid }; }
            if (s.tray.length >= 7) { const k = s.tray.findIndex((x) => !/hogyoku|kyoka/.test(x.traitId ?? '')); s.tray.splice(k >= 0 ? k : 0, 1); }
            s.spawnTimer = Math.min(s.spawnTimer, 1);
            return { done: false, n: s.nextUid };
          });
          spawned = r.n;
          if (r.done) break;
          await wait(150);
        }
        await wait(500);
        proof.facts.aizen = { table, tray: await page.evaluate(() => window.__bhaCombat.tray.map((b) => (b.traitId ?? b.kind).replace(/^.*:/, ''))), uidsUsed: spawned, legend: await page.evaluate(() => document.querySelector('.bha-v2legend, [class*="legend"]')?.textContent ?? null) };
        await shot(page, '01-pc-aizen-rail-hogyoku-kyoka');
      });
      await ctx.close();
    }
    // 02·03 수련장 들어갔다 나오기 (PC·폰) — 끝 화면 = 둥지
    for (const [vpName, vp, file] of [['pc', PC, '02-pc-training-out-nest'], ['phone', PH, '03-phone-training-out-nest']]) {
      const ctx = await browser.newContext(vp);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`training ${vpName}: ${e.message.slice(0, 200)}`));
      await step(`training ${vpName}`, async () => {
        await newGame(page, server.url, 0);
        proof.facts[`training-${vpName}`] = await trainingRoundTrip(page);
        await wait(400);
        await shot(page, file);
      });
      await ctx.close();
    }
    // 04 폭주 블록 표시 (폰): 아쥬커스 전투 바에 폭주 블록 + 기본 블록, 범례 '폭주'
    {
      const ctx = await browser.newContext(PH);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`void: ${e.message.slice(0, 200)}`));
      await step('void', async () => {
        await newGame(page, server.url, 0);
        await startBattle(page);
        await page.evaluate(async () => {
          const C = await import('/src/engine/combat/index.ts');
          const s = window.__bhaCombat;
          const fam = Object.keys(s.params.families)[0];
          const sk = () => ({ uid: s.nextUid++, kind: 'skill', traitId: C.BASIC_SKILL_ID, family: fam, element: null });
          s.tray = [sk(), { uid: s.nextUid++, kind: 'void', traitId: null, family: null, element: null }, sk(), sk(), { uid: s.nextUid++, kind: 'void', traitId: null, family: null, element: null }];
        });
        await wait(600);
        proof.facts.void = await page.evaluate(() => ({
          legend: [...document.querySelectorAll('.bha-lcd *')].filter((e) => e.children.length === 0 && /^(공허|폭주)$/.test((e.textContent ?? '').trim())).map((e) => e.textContent.trim()),
          voidBlocks: [...document.querySelectorAll('[data-kind="void"], .bha-v2blk--void, .is-void')].map((e) => (e.getAttribute('aria-label') ?? '') + '|' + (e.textContent ?? '').trim()),
        }));
        await shot(page, '04-phone-void-block-frenzy');
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
