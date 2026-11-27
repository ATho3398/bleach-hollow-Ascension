// C.547 proof (GDD 6-2 v6.216, 사용자 2026-11-27 "모험도 그 특수던전처럼 ui바꿔야된다니까"):
// 모험 준비 [준비] 탭 = 특수던전식 목록(왼쪽 사냥터 3곳 · 오른쪽 그림·이름·설명·★·길 미리보기·[출발]).
// 01 PC 호로 준비(첫 사냥터 골라짐) · 02 PC 잠긴 사냥터 골라짐 · 03 폰 사신 준비 · 04 PC 스토리 쪽(그대로) · 05 PC [타일 배치] 탭(그대로, [출발] 아래 띠). 기기 ✓ 두 번 = [출발] 하이라이트도 확인.
// PC 844×390 + 폰 796×384 터치, 1배. 실행: node scripts/c547-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c547'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PH = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadSave(page, url, fi) {
  await page.goto(url);
  await wait(600);
  await page.evaluate(async (fi) => {
    localStorage.clear();
    const g = await import('/src/game.ts');
    const F = await import('/src/data/factions/index.ts');
    const s = g.newSaveData(F.FACTIONS[fi].id, Date.now());
    s.name = '권영'; s.help.tutorialSeen = true;
    for (const id of ['birth', 'home-intro', 'first-run', 'recover', 'first-run-room', 'first-absorb', 'tile-plan']) s.help.guides[id] = 'done';
    s.evolution.tierIndex = 1; // 2단계: 첫 사냥터만 열림(둘째 3단계·셋째 4단계)
    s.tiles.unlocked = true;
    g.writeSave(localStorage, s);
  }, fi);
  await page.goto(url);
  await wait(1200);
  await page.getByRole('button', { name: /이어하기/ }).first().click({ timeout: 5000 }).catch(() => {});
  await wait(1200);
}

async function toDepart(page) {
  for (let t = 0; t < 12; t++) {
    if (await page.locator('[data-screen="expedition-plan"]').count()) return true;
    await page.getByRole('button', { name: /건너뛰기/ }).first().click({ timeout: 300 }).catch(() => {});
    await wait(300);
    await page.locator('.bha-prop--outside, .bha-worldmap [data-place="adventure"]').first().click({ timeout: 2000 }).catch(() => {});
    await wait(900);
    await page.getByRole('button', { name: /^(확인|나간다)$/ }).first().click({ timeout: 300 }).catch(() => {});
  }
  return false;
}

const state = (page) => page.evaluate(() => ({
  screen: document.querySelector('[data-screen]')?.getAttribute('data-screen') ?? null,
  items: [...document.querySelectorAll('[data-plan-prep] [data-ground]')].map((b) => ({ id: b.dataset.ground, text: b.textContent.trim(), selected: b.classList.contains('is-selected'), locked: b.classList.contains('is-locked') })),
  title: document.querySelector('[data-plan-prep] .bha-sdg__title')?.textContent ?? null,
  art: document.querySelector('[data-plan-prep] .bha-sdg__art')?.dataset.art ?? null,
  scene: !!document.querySelector('[data-plan-prep] .bha-sdg__art .bha-scenebg'),
  lock: document.querySelector('[data-ground-lock]')?.textContent.trim() ?? null,
  stars: [...document.querySelectorAll('[data-plan-prep] [data-difficulty]')].map((b) => b.textContent.trim()),
  mini: document.querySelectorAll('[data-plan-prep] .bha-plan__minicell').length,
  miniText: document.querySelector('[data-plan-prep] .bha-plan__minitext')?.textContent ?? null,
  hp: document.querySelector('[data-plan-prep] [data-depart-hp]')?.textContent.trim() ?? null,
  goInStage: !!document.querySelector('[data-plan-prep] .bha-sdg__stage [data-sc="go"]'),
  goDisabled: document.querySelector('[data-sc="go"]')?.disabled ?? null,
  sel: document.querySelector('.bha-sel')?.dataset.sc ?? document.querySelector('.bha-sel')?.dataset.ground ?? document.querySelector('.bha-sel')?.textContent.trim().slice(0, 20) ?? null,
}));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { errors: [], shots: [], steps: {} };
  try {
    for (const [tag, opt, fi] of [['pc', PC, 0], ['phone', PH, 1]]) {
      const ctx = await browser.newContext(opt);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`${tag}: ${e.message}`));
      await loadSave(page, server.url, fi);
      const steps = (proof.steps[tag] = []);
      if (!(await toDepart(page))) { await page.screenshot({ path: path.join(OUT, `fail-${tag}.png`) }); throw new Error(`${tag}: 모험 준비 화면에 못 감 ${await page.evaluate(() => document.querySelector('[data-screen]')?.getAttribute('data-screen'))}`); }
      await wait(800);
      steps.push({ step: 'enter', ...(await state(page)) });
      const shot = async (f) => { await page.screenshot({ path: path.join(OUT, f) }); proof.shots.push(f); };
      if (tag === 'pc') {
        await shot('01-pc-hollow-prep.png');
        // 기기 조작: ▼(S)로 첫 사냥터까지 → ✓(F) 한 번 더 = 하이라이트가 [출발]로
        for (let i = 0; i < 12; i++) {
          const s = await state(page);
          if (s.sel === 'outskirts') break;
          await page.keyboard.press('KeyS');
          await wait(120);
        }
        steps.push({ step: 'device-on-first', sel: (await state(page)).sel });
        await page.keyboard.press('KeyF');
        await wait(300);
        steps.push({ step: 'device-confirm-again', sel: (await state(page)).sel });
        // 잠긴 사냥터 고르기
        await page.locator('[data-plan-prep] [data-ground="canyon"]').click();
        await wait(500);
        steps.push({ step: 'locked', ...(await state(page)) });
        await shot('02-pc-locked-ground.png');
        // [타일 배치] 탭으로 가면 원정 사냥터로 돌아오고 [출발]은 아래 띠
        await page.locator('[data-plan-side="place"]').click();
        await wait(400);
        steps.push({ step: 'place-tab', goDisabled: (await state(page)).goDisabled, goInDock: await page.evaluate(() => document.querySelector('[data-sc="go"]')?.closest('.bha-plan__go')?.parentElement?.classList.contains('bha-plan') ?? false) });
        await shot('05-pc-place-tab.png');
        await page.locator('[data-plan-side="prep"]').click();
        await wait(400);
        steps.push({ step: 'back-prep', ...(await state(page)) });
        // 스토리 쪽 (그대로)
        await page.locator('.bha-depart-tabs button').first().click();
        await wait(400);
        await page.getByRole('option', { name: /스토리/ }).first().click({ timeout: 1500 }).catch(async () => { await page.getByText('스토리', { exact: true }).last().click({ timeout: 1500 }).catch(() => {}); });
        await wait(900);
        steps.push({ step: 'story', screen: (await state(page)).screen });
        await shot('04-pc-story.png');
      } else {
        await shot('03-phone-shinigami-prep.png');
      }
      await ctx.close();
    }
  } catch (e) {
    proof.errors.push(String(e && e.stack || e));
  } finally {
    await browser.close();
    server.stop();
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    console.log(JSON.stringify(proof, null, 2));
    process.exit(0);
  }
})();
