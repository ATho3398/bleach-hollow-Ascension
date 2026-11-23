// C.529 proof (치명 확률 상한 70%, GDD 7-4 v6.182): PC 844×390, 1배. 상태 화면 능력치 ⓘ 설명 창 '일반 공격 치명 … (최대 70%)'.
// 01 호로 라나(PC) — 진화체 능력 치명 +가 커도 상한 70%
// 실행: node scripts/c529-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c529'));
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
      [PC, 'hollow', 't4:water:physical', 't3:water', 'crit6', '01-rana-status-crit-max-pc'],
    ];
    for (const [vp, faction, formId, third, trait, name] of cases) {
      const page = await browser.newPage(vp);
      page.on('pageerror', (e) => proof.errors.push(e.message));
      await seed(page, srv.url, faction, formId, third, trait);
      if (vp === PHONE) await page.locator('.bha-room__status').first().tap(); // 폰 = 단축키 없음 → 상태 박스 탭
      else await page.keyboard.press('g');
      await wait(1200);
      const info = page.locator('.bha-info[data-info="능력치"]').first();
      await info.click({ timeout: 5000 });
      await wait(600);
      proof.checks[name] = await page.evaluate(() => [...document.querySelectorAll('[role="tooltip"], .bha-infopop, .bha-pop')].map((e) => e.textContent).join(' | '));
      proof.checks[name + ':crit'] = await page.evaluate(() => [...document.querySelectorAll('[data-crit]')].map((e) => e.textContent));
      await shot(page, name);
      await page.close();
    }
  } catch (err) {
    proof.errors.push(String(err && err.stack || err));
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close();
    srv.stop?.();
    process.exit(0);
  }
})();
