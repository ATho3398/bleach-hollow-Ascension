// C.539 proof (픽셀FX — 탄생·진화 연출 도트판): 게임에서 실제로 재생되는지 1배 844×390 캡처.
//  탄생: 새 세이브(탄생 안내만 남김) → 이어하기 → 방에서 연출. 호로 = 화면이 불탄 구멍으로 걷힘, 사신 = 영자 모여 영혼 → 화면 페이드.
//  진화: c497 과 같은 세이브(진화 기준에 닿은 3단계 + 원정 중간 저장) → [귀환하기] → [진화] → 지금 진화체로 시작해 임팩트 순간 다음 진화체.
// 실행: node scripts/c539-proof.cjs [저장 폴더]   (C539_PART=birth|evolve|all)
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c539'));
const PART = process.env.C539_PART || 'all';
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** 탄생: 튜토리얼·안내는 끝, 'birth' 안내만 남긴 새 세이브 */
async function seedBirth(page, url, faction) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async (fid) => {
    const g = await import('/src/game.ts');
    const slots = await import('/src/saveSlots.ts');
    const tut = await import('/src/engine/tutorial.ts');
    const now = Date.now();
    const s = g.newSaveData(fid, now);
    s.name = '시험';
    s.gender = 'male';
    s.help.tutorialSeen = true;
    for (const id of tut.GUIDE_IDS) s.help.guides[id] = 'done';
    s.help.guides.birth = 'pending';
    s.lastScreen = 'room';
    slots.writeSlotSave(localStorage, s, 1);
    slots.touchSlot(localStorage, 1, now);
  }, faction);
  await page.goto(url);
  await wait(1500);
  await page.getByRole('button', { name: '이어하기' }).click({ timeout: 5000 });
}

/** 진화: 진화 기준에 닿은 3단계 + 원정 중간 저장 (c497 과 같음) */
async function seedEvolve(page, url, faction) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async (fid) => {
    const g = await import('/src/game.ts');
    const slots = await import('/src/saveSlots.ts');
    const ex = await import('/src/engine/expedition/index.ts');
    const snap = await import('/src/engine/expedition/snapshot.ts');
    const ev = await import('/src/engine/evolution/index.ts');
    const ab = await import('/src/engine/absorb/build.ts');
    const tut = await import('/src/engine/tutorial.ts');
    const now = Date.now();
    const s = g.newSaveData(fid, now);
    s.name = '시험';
    s.gender = 'male';
    s.help.tutorialSeen = true;
    for (const id of tut.GUIDE_IDS) s.help.guides[id] = 'done';
    const e = s.evolution;
    e.tierIndex = 2;
    e.formHistory = ['t2:base', 't3:water'];
    e.formId = 't3:water';
    e.steps = ev.stepsNeeded(e);
    while (s.build.slots.length < 4) s.build.slots.push(null);
    ab.gainTrait(s.build, 't-water-a');
    s.nest.hunger = 20;
    s.nest.condition = 80;
    g.checkUnlocks?.(s, now);
    const exp = ex.createExpedition({ factionId: fid, seed: 11, runId: g.nextRunId(s), hunger: 20, condition: 80, deck: [], build: s.build, evolution: s.evolution, risk: s.nest.risk });
    s.activeExpedition = snap.serializeExpedition(exp, 1, now);
    s.lastScreen = 'expedition';
    slots.writeSlotSave(localStorage, s, 1);
    slots.touchSlot(localStorage, 1, now);
  }, faction);
  await page.goto(url);
  await wait(1500);
  await page.getByRole('button', { name: '이어하기' }).click({ timeout: 5000 });
  await wait(2500);
  for (let i = 0; i < 4 && (await page.locator('[data-dev-layer], .bha-tut').count()); i++) { await page.keyboard.press('Escape'); await wait(250); }
  await page.locator('.bha-exp__pausebtn').first().click({ timeout: 5000 });
  await wait(400);
  await page.locator('.bha-exp__abort').first().click({ timeout: 5000 });
  await wait(500);
  const yes = page.locator('.bha-confirm').getByRole('button', { name: '귀환하기' }).filter({ visible: true });
  if (await yes.count()) await yes.last().click({ timeout: 3000 });
  await wait(1800);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { shots: [], errors: [], checks: {} };
  const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  try {
    if (PART === 'all' || PART === 'birth') {
      for (const [fid, times] of [['hollow', [1500, 2850]], ['shinigami', [1700, 2700]]]) {
        const page = await browser.newPage(PC);
        page.on('pageerror', (e) => proof.errors.push(`${fid}: ${e.message}`));
        await seedBirth(page, srv.url, fid);
        await page.locator('.bha-birth__pixel').waitFor({ timeout: 8000 });
        const t0 = Date.now();
        proof.checks[`${fid}BirthPixel`] = await page.locator('.bha-birth__pixel').getAttribute('data-fx');
        proof.checks[`${fid}BirthSelf`] = await page.locator('.bha-birth').evaluate((e) => e.classList.contains('bha-birth--self'));
        for (const ms of times) {
          await wait(Math.max(0, ms - (Date.now() - t0)));
          await shot(page, `birth-${fid}-${ms}`);
        }
        await wait(3600 - (Date.now() - t0) + 600);
        proof.checks[`${fid}BirthGone`] = (await page.locator('.bha-birth').count()) === 0;
        await page.close();
      }
    }
    if (PART === 'all' || PART === 'evolve') {
      for (const [fid, times] of [['hollow', [1800, 3150]], ['shinigami', [2300, 2950]]]) {
        const page = await browser.newPage(PC);
        page.on('pageerror', (e) => proof.errors.push(`${fid}: ${e.message}`));
        await seedEvolve(page, srv.url, fid);
        await page.locator('.bha-evolve-choice').getByRole('button', { name: '진화' }).first().click({ timeout: 5000 });
        await page.locator('.bha-evolve__px').waitFor({ timeout: 8000 });
        const t0 = Date.now();
        proof.checks[`${fid}EvolvePixel`] = await page.locator('.bha-evolve__px').getAttribute('data-fx');
        // 몸 가운데 맞춤: 시트 기준점(가운데) = 그림 상자 가운데
        proof.checks[`${fid}EvolveCenter`] = await page.evaluate(() => {
          const f = document.querySelector('.bha-evolve__fig--px').getBoundingClientRect(), p = document.querySelector('.bha-evolve__px').getBoundingClientRect();
          return { figCx: Math.round(f.left + f.width / 2), figCy: Math.round(f.top + f.height / 2), fxCx: Math.round(p.left + p.width / 2), fxCy: Math.round(p.top + p.height / 2) };
        });
        const heroSrc = () => page.locator('.bha-evolve__fig--px').first().evaluate((f) => { const h = f.querySelector('.bha-hero'); return h ? h.innerHTML.length + ':' + (h.querySelector('[style*="background"],img,canvas')?.outerHTML.slice(0, 80) ?? '') : null; }).catch(() => null);
        proof.checks[`${fid}FromSrc`] = await heroSrc();
        for (const ms of times) {
          await wait(Math.max(0, ms - (Date.now() - t0)));
          await shot(page, `evolve-${fid}-${ms}`);
        }
        proof.checks[`${fid}ToSrc`] = await heroSrc();
        await page.close();
      }
    }
  } catch (e) {
    proof.errors.push(String(e && e.stack || e));
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close();
    srv.stop();
    console.log(JSON.stringify(proof, null, 2));
  }
})();
