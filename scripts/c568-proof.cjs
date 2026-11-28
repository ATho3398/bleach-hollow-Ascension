// C.568 proof (GDD 8-5 v6.254 진화 연출 = 묻지 않고 바로 진화 + 3번 터치 취소): PC 844×390, 1배.
// 01 호로 연출 중(글줄·버튼 없음) · 02 호로 3번 터치 → 취소 확인 창 · 03 사신 연출 중 · 04 사신 [계속] 뒤 결과
// 실행: node scripts/c568-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs/captures/c568'));
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** 진화 연출 차례(evolution.pending)가 남은 세이브를 슬롯 1에 쓰고 이어하기 → 방에 들어오면 연출 */
async function seedPending(page, url, factionId) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async (factionId) => {
    const g = await import('/src/game.ts');
    const ev = await import('/src/engine/evolution/evolution.ts');
    const tut = await import('/src/engine/tutorial.ts');
    const slots = await import('/src/saveSlots.ts');
    const now = Date.now();
    const s = g.newSaveData(factionId, now);
    s.name = '시험';
    s.gender = 'male';
    s.help.tutorialSeen = true;
    for (const id of tut.GUIDE_IDS) s.help.guides[id] = 'done';
    s.nest.hunger = 30;
    s.nest.condition = 90;
    s.evolution.steps = ev.stepsNeeded(s.evolution);
    s.evolution.pending = { hunger: 30, condition: 90, runId: 3 };
    slots.writeSlotSave(localStorage, s, 1);
    slots.touchSlot(localStorage, 1, now);
  }, factionId);
  await page.goto(url);
  await wait(1500);
  const cont = page.getByRole('button', { name: '이어하기' });
  if (await cont.count()) await cont.click({ timeout: 5000 });
  await page.waitForSelector('[data-evolve-cut]', { timeout: 8000 });
}

/** 연출 화면에 보이는 버튼·글자 (애니만이어야 한다) */
const cutUi = (page) => page.evaluate(() => {
  const cut = document.querySelector('[data-evolve-cut]');
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  const app = cut?.closest('.bha-app');
  return {
    buttons: app ? [...app.querySelectorAll('button')].filter((b) => vis(b) && !b.closest('[hidden]')).map((b) => b.textContent.trim()) : null,
    text: cut ? cut.textContent.trim() : null,
    chips: document.querySelectorAll('.bha-chip:not([hidden])').length,
  };
});

const saved = (page) => page.evaluate(() => {
  for (let i = 0; i < localStorage.length; i++) {
    const raw = localStorage.getItem(localStorage.key(i));
    if (!raw || !raw.includes('"evolution"')) continue;
    try {
      const s = JSON.parse(raw);
      const e = s.evolution ?? s.save?.evolution;
      if (e) return { tierIndex: e.tierIndex, formId: e.formId, cancels: e.cancels, excluded: e.excluded ?? null, pending: e.pending ?? null };
    } catch { /* 다른 칸 */ }
  }
  return null;
});

async function tap3(page) {
  for (let i = 0; i < 3; i++) {
    await page.mouse.click(422, 195);
    await wait(150);
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { shots: [], errors: [], checks: {} };
  const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  try {
    // 호로: 연출 중 → 3번 터치 → 취소 확인 → [취소한다]
    {
      const page = await browser.newPage(PC);
      page.on('pageerror', (e) => proof.errors.push(e.message));
      await seedPending(page, srv.url, 'hollow');
      await wait(1300);
      proof.checks.hollowCutUi = await cutUi(page);
      await shot(page, '01-hollow-cutscene-no-ui');
      await tap3(page);
      await page.waitForSelector('.bha-evolve-cancel', { timeout: 3000 });
      await wait(500);
      proof.checks.hollowDialog = await page.evaluate(() => {
        const d = document.querySelector('.bha-evolve-cancel');
        return d ? { title: d.querySelector('.bha-modal__title')?.textContent, buttons: [...d.querySelectorAll('button')].map((b) => b.textContent.trim()) } : null;
      });
      await shot(page, '02-hollow-three-tap-cancel');
      await page.getByRole('button', { name: '취소한다' }).click({ timeout: 3000 });
      await wait(1200);
      proof.checks.hollowAfterCancel = { save: await saved(page), cutGone: (await page.locator('[data-evolve-cut]').count()) === 0 };
      await page.close();
    }
    // 사신: 연출 중 → 3번 터치 → [계속] → 이어서 결과
    {
      const page = await browser.newPage(PC);
      page.on('pageerror', (e) => proof.errors.push(e.message));
      await seedPending(page, srv.url, 'shinigami');
      await wait(1000);
      proof.checks.shinigamiCutUi = await cutUi(page);
      await shot(page, '03-shinigami-cutscene-no-ui');
      await tap3(page);
      await page.waitForSelector('.bha-evolve-cancel', { timeout: 3000 });
      await wait(1500); // 창이 떠 있는 동안 연출이 멈춰 결과로 넘어가지 않는다
      proof.checks.shinigamiPausedNoResult = await page.evaluate(() => document.querySelector('.bha-evolve__result')?.hidden === true);
      await page.getByRole('button', { name: '계속' }).click({ timeout: 3000 });
      await page.waitForSelector('.bha-evolve__result:not([hidden])', { timeout: 6000 });
      await wait(600);
      proof.checks.shinigamiResult = { title: await page.locator('.bha-evolve__title').textContent(), save: await saved(page) };
      await shot(page, '04-shinigami-result-after-continue');
      await page.close();
    }
  } catch (e) {
    proof.errors.push(String(e && e.stack || e));
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    console.log(JSON.stringify(proof, null, 2));
    await browser.close();
    srv.stop();
  }
})();
