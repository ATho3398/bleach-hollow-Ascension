// C.353 proof (GDD 215장): 해방 준비 오라(발밑에서 솟구치는 기운) · '<해방 이름> 가능!' 알림 · 기기 초점(.bha-sel)과 함께.
// 테스트 모드 새 게임 → 4단계 진화체 + 깬 상태 → 모험 ★1 전투 → 게이지 가득 채움. 캡처 1배 docs/captures/c353/ (4장). 실행: node scripts/c353-proof.cjs
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c353');
const MODES = [
  { id: 'pc', ctx: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 } },
  { id: 'ph', ctx: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true } },
];
// 고쳐 넣을 진화체: 호로 = 불 탄(루시에르나가), 사신 = 물 참(백랑파천), 사신 둔도(실패형 — 만해 없음 → 한정 해제 그대로)
// 호로 = 폰(ph), 사신 = PC — 4단계 진화체 + 깬 상태(고유 해방 이름 레스렉시온/만해)
const CASES = [['ph', 0, 't4:fire:special'], ['pc', 1, 't4:water:mixed']];
const SAVE_KEY = 'bha-save-test'; // 테스트 모드 세이브 키
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function newGame(page, url, fi) {
  await page.goto(`${url}?test=1`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${url}?test=1`);
  await wait(1200);
  await page.getByRole('button', { name: '새로 시작' }).click();
  await wait(300);
  await page.locator('.bha-slot').first().click();
  await wait(200);
  await page.getByRole('button', { name: '확인' }).click();
  await wait(300);
  await page.locator('.bha-species__card').nth(fi).click();
  await wait(300);
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await wait(400);
  const input = page.locator('[data-ident="name"]');
  if (await input.count()) {
    await input.fill('시험');
    await page.locator('[data-ident="next"]').click();
    await wait(200);
    await page.locator('.bha-ident__gender').first().click();
    await page.locator('[data-ident="done"]').click();
  }
  await wait(2500);
}

/** 세이브를 4단계 진화체 + 깬 상태로 고친다 (그림 확인용) */
async function patchSave(page, formId) {
  return page.evaluate(({ key, formId }) => {
    const s = JSON.parse(localStorage.getItem(key));
    s.evolution.tierIndex = 3;
    s.evolution.formId = formId;
    s.evolution.ascended = true;
    s.formDex = [...new Set([...(s.formDex ?? []), formId, 'h4:fail'])];
    localStorage.setItem(key, JSON.stringify(s));
    return s.factionId;
  }, { key: SAVE_KEY, formId });
}

async function continueGame(page, url) {
  await page.goto(`${url}?test=1`);
  await wait(1500);
  const cont = page.getByRole('button', { name: /이어|계속/ }).first();
  if (await cont.count()) { await cont.click(); await wait(400); }
  const slot = page.locator('.bha-slot').first();
  if (await slot.count()) { await slot.click(); await wait(200); const ok = page.getByRole('button', { name: '확인' }); if (await ok.count()) await ok.click(); }
  await wait(2500);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { shots: [], checks: {} };
  try {
    for (const [modeId, fi, formId] of CASES) {
      const mode = MODES.find((m) => m.id === modeId);
      const page = await browser.newPage(mode.ctx);
      const shot = async (file) => { await page.screenshot({ path: path.join(OUT, file) }); proof.shots.push(file); };
      await newGame(page, srv.url, fi);
      const factionId = await patchSave(page, formId);
      await continueGame(page, srv.url);
      await page.locator('.bha-prop--outside').first().click();
      await wait(900);
      await page.locator('.bha-worldmap [data-place="adventure"]').first().click();
      await wait(2200);
      await page.locator('.bha-lcd').getByRole('button', { name: '★1', exact: true }).first().click();
      await wait(400);
      await page.locator('.bha-lcd').getByRole('button', { name: '출발', exact: true }).first().click();
      await page.locator('.bha-battle').waitFor({ timeout: 60_000 });
      await wait(2500);
      const before = await page.evaluate(() => ({ ready: document.querySelector('.bha-battle')?.classList.contains('is-lib-ready'), notice: document.querySelector('.bha-libready')?.classList.contains('is-on') }));
      // 해방 게이지를 가득 채운다 → 다음 화면 갱신에서 준비 됨으로 바뀌는 순간 알림
      await page.evaluate(() => { const s = window.__bhaCombat; if (s) s.liberation.gauge = 1e6; });
      await wait(250);
      const atRise = await page.evaluate(() => ({ ready: document.querySelector('.bha-battle')?.classList.contains('is-lib-ready'), notice: document.querySelector('.bha-libready')?.classList.contains('is-on'), text: document.querySelector('.bha-libready__text')?.textContent, pointer: getComputedStyle(document.querySelector('.bha-libready')).pointerEvents, pop: document.querySelector('.bha-v2herolib')?.classList.contains('is-ready-pop') }));
      if (modeId === 'ph') await shot(`ph-hollow-notice.png`);
      await wait(1500);
      const after = await page.evaluate(() => ({ ready: document.querySelector('.bha-battle')?.classList.contains('is-lib-ready'), notice: document.querySelector('.bha-libready')?.classList.contains('is-on'), auraShown: getComputedStyle(document.querySelector('.bha-libaura')).display }));
      await shot(`${modeId}-${factionId}-aura.png`);
      if (modeId === 'pc') {
        await page.evaluate(() => document.querySelector('.bha-v2herolib')?.classList.add('bha-sel'));
        await wait(300);
        await shot(`pc-${factionId}-aura-sel.png`);
      }
      proof.checks[`${modeId}-${factionId}`] = { before, atRise, after };
      await page.close();
    }
  } finally {
    await browser.close();
    srv.stop();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 1));
})();
