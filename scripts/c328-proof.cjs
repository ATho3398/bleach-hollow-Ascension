// C.328 proof (GDD 198장): 레스렉시온·만해 이름 해방 컷인 · 사신 한정 해제 · 적 이름(짐승형 호로 등) · 진화체 도감 해방 줄.
// 테스트 모드(?test=1) 새 게임 → 세이브를 4단계 진화체 + 아란칼화/구상화 완료로 고쳐 다시 읽기 → 모험 ★1 첫 전투(적 이름·해방 컷인) → 진화체 도감.
// 모드: pc = 844×390 마우스 / ph = 796×384 터치. 두 종족. 캡처 1배 docs/captures/c328/ (8장). 실행: node scripts/c328-proof.cjs
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c328');
const MODES = [
  { id: 'pc', ctx: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 } },
  { id: 'ph', ctx: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true } },
];
// 고쳐 넣을 진화체: 호로 = 불 탄(루시에르나가), 사신 = 물 참(백랑파천), 사신 둔도(실패형 — 만해 없음 → 한정 해제 그대로)
const CASES = [[0, 'hollow', 't4:fire:special', 'hollow', '바스트로데 불 탄'], [1, 'shinigami', 't4:water:mixed', 'shinigami', '수석 대원 물 참'], [1, 'shinigami', 'h4:fail', 'dundo', '혼백']];
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
    for (const mode of MODES) {
      for (const [fi, fid, formId, name, rowName] of CASES) {
        if (mode.id === 'ph' && name === 'dundo') continue; // 둔도(만해 없음)는 PC 만
        const page = await browser.newPage(mode.ctx);
        const tag = `${mode.id}-${name}`;
        const shot = async (shotName) => {
          await wait(350);
          const file = `${tag}-${shotName}.png`;
          if (mode.id === 'pc' || shotName === '1-release') { await page.screenshot({ path: path.join(OUT, file) }); proof.shots.push(file); }
        };
        await newGame(page, srv.url, fi);
        const factionId = await patchSave(page, formId);
        await continueGame(page, srv.url);
        // 진화체 도감: 그 4단계 진화체 칸을 눌러 상세의 해방 줄
        if (mode.id === 'pc') {
          await page.locator('.bha-prop--book').first().click();
          await wait(900);
          const row = page.locator('.bha-mdrow__name', { hasText: rowName }).last();
          await row.scrollIntoViewIfNeeded().catch(() => {});
          await row.click().catch(() => {});
          await wait(400);
          await shot('0-dex');
          proof.checks[`${tag}-dex`] = await page.evaluate(() => document.querySelector('.bha-mddetail__body')?.textContent ?? null);
          await page.locator('.bha-dev__btn[aria-label="취소"]').first().click().catch(() => {});
          await wait(700);
        }
        // 모험 ★1 첫 전투
        await page.locator('.bha-prop--outside').first().click();
        await wait(900);
        await page.locator('.bha-worldmap [data-place="adventure"]').first().click();
        await wait(2200);
        await page.locator('.bha-lcd').getByRole('button', { name: '★1', exact: true }).first().click();
        await wait(400);
        await page.locator('.bha-lcd').getByRole('button', { name: '출발', exact: true }).first().click();
        await page.locator('.bha-battle').waitFor({ timeout: 60_000 });
        await wait(4000);
        const enemyName = await page.evaluate(() => document.querySelector('.bha-battle')?.textContent?.match(/(짐승형|부유형|갑각형) 호로|[가-힣 ]+/)?.[0] ?? null);
        const cut = await page.evaluate(() => document.querySelector('.bha-libcut__text')?.textContent ?? null);
        await page.evaluate(() => {
          const s = window.__bhaCombat;
          if (s) s.liberation.ticksLeft = 120;
          const lib = document.querySelector('.bha-v2herolib');
          if (lib) lib.hidden = false;
          document.querySelector('.bha-libcut')?.classList.add('is-on');
        });
        await shot('1-release');
        proof.checks[tag] = { factionId, cutin: cut, enemyNameSeen: enemyName, enemyIsNewName: await page.evaluate(() => /(짐승형|부유형|갑각형) 호로/.test(document.querySelector('.bha-battle')?.textContent ?? '')) };
        await page.close();
      }
    }
  } finally {
    await browser.close();
    srv.stop();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 1));
})();
