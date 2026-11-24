// C.535 proof (진화체 고유 능력 설명 = 진화 정보 칸 · 투자 안내 괄호 없음, GDD 8-7 v6.195): 1배, 5장.
// 01 PC 호로 마르티요 · 02 폰 호로 마르티요 · 03 PC 사신 노도 · 04 폰 사신 노도 — 상태 화면 진화 정보 칸(진화체 이름·단계·속성 줄 아래 고유 능력)
// 05 PC 도감 4단계 상세(마르티요)
// 실행: node scripts/c535-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c535'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** 4단계 진화체 + 4단계 특성 세이브를 슬롯 1에 쓴다 */
async function seed(page, url, faction, formId, third, trait) {
  await page.goto(`${url}?test=1`);
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async ({ faction, formId, third, trait }) => {
    const g = await import('/src/game.ts');
    const slots = await import('/src/saveSlots.ts');
    const tut = await import('/src/engine/tutorial.ts');
    const tm = await import('/src/engine/testMode.ts');
    const store = tm.testStorage(localStorage); // 테스트 모드 세이브 칸
    const now = Date.now();
    const s = g.newSaveData(faction, now);
    s.name = '권영';
    s.gender = 'male';
    s.help.tutorialSeen = true;
    for (const id of tut.GUIDE_IDS) s.help.guides[id] = 'done';
    const e = s.evolution;
    e.tierIndex = 3;
    e.formHistory = ['t2:base', third, formId];
    e.formId = formId;
    e.ascended = true;
    e.abilities = { owned: { [`evo:${trait}`]: 1 }, equipped: [`evo:${trait}`], slots: 2, tier4Ever: true };
    while (s.build.slots.length < 6) s.build.slots.push(null);
    s.nest.hunger = 80;
    s.nest.condition = 90;
    e.ev = { ...e.ev, aspd: 60, atk: 40 }; // 지금 값이 기본값과 달라 보이게 노력치 조금
    s.formDex = Array.from(new Set([...(s.formDex ?? []), 't2:base', third, formId]));
    g.checkUnlocks?.(s, now);
    slots.writeSlotSave(store, s, 1);
    slots.touchSlot(store, 1, now);
  }, { faction, formId, third, trait });
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
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { shots: [], errors: [], checks: {} };
  const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  try {
    const cases = [
      [PC, 'hollow', 't4:normal:physical', 't3:normal', 'aspd6', '01-pc-hollow-martillo-evo-info'],
      [PHONE, 'hollow', 't4:normal:physical', 't3:normal', 'aspd6', '02-phone-hollow-martillo-evo-info'],
      [PC, 'shinigami', 't4:water:physical', 't3:water', 'aspd6', '03-pc-shinigami-nodo-evo-info'],
      [PHONE, 'shinigami', 't4:water:physical', 't3:water', 'aspd6', '04-phone-shinigami-nodo-evo-info'],
    ];
    for (const [vp, faction, formId, third, trait, name] of cases) {
      const page = await browser.newPage(vp);
      page.on('pageerror', (e) => proof.errors.push(e.message));
      await seed(page, srv.url, faction, formId, third, trait);
      if (vp === PHONE) await page.locator('.bha-room__status').first().tap(); // 폰 = 단축키 없음 → 상태 박스 탭
      else await page.keyboard.press('g');
      await wait(1200);
      const uniq = page.locator('[data-evo-unique]');
      proof.checks[name] = {
        count: await uniq.count(),
        insideEvoPanel: await page.evaluate(() => !!document.querySelector('[data-evolution] [data-evo-unique]')),
        afterFormLine: await page.evaluate(() => document.querySelector('[data-evo-unique]')?.previousElementSibling?.classList.contains('bha-evo__form') ?? false),
        text: (await uniq.count()) ? await uniq.first().innerText() : null,
      };
      await page.evaluate(() => document.querySelector('[data-evolution]')?.scrollIntoView({ block: 'start' }));
      await wait(300);
      await shot(page, name);
      await page.close();
    }
    // 도감 4단계 상세 (내 몸이 아닌 곳 — 고유 능력 줄이 있으면 기본값)
    const page = await browser.newPage(PC);
    page.on('pageerror', (e) => proof.errors.push(e.message));
    await seed(page, srv.url, 'hollow', 't4:normal:physical', 't3:normal', 'aspd6');
    await page.locator('button[aria-label="책장"]').first().click({ timeout: 4000 });
    await wait(1200);
    const nm = await page.evaluate(async () => {
      const fd = await import('/src/data/evolution/index.ts');
      return fd.formName(fd.getForm('t4:normal:physical'), 'hollow');
    });
    await page.evaluate((n) => {
      const card = [...document.querySelectorAll('.bha-dexcard')].find((c) => c.querySelector('.bha-dexcard__name')?.textContent === n);
      card?.scrollIntoView({ block: 'center' });
    }, nm);
    await wait(400);
    await page.locator('.bha-dexcard', { hasText: nm }).first().click({ timeout: 4000 });
    await wait(900);
    proof.checks.dex = { name: nm, text: await page.locator('.bha-modal, [role="dialog"]').first().innerText().catch(() => null) };
    await shot(page, '05-pc-dex-t4-detail');
    await page.close();
  } catch (err) {
    proof.errors.push(String(err && err.stack || err));
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close();
    srv.stop?.();
    process.exit(0);
  }
})();
