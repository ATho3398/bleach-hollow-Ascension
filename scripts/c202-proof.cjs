// C.202 (GDD 128장 2·3·4·7·9) proof: 조우 연출(일반·강적)·휴식 칸 도착·흡수 화면 뒤로 확인 창·[내 상태] 창·바퀴 끝 타일 칸. 캡처 docs/captures/c202/
// 실행: node scripts/c202-proof.cjs (vite 를 띄운다, C202_URL=<주소> 면 그 주소). C202_FACTION=0|1 (없으면 둘 다). 1배·844×390
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c202');
const PORT = 5302;
/** 종족마다 찍을 장면 (10장 이내) */
const SHOTS = {
  hollow: ['plan-board', 'encounter-normal', 'encounter-elite', 'rest', 'absorb-back', 'absorb-status', 'lap-end-tiles'],
  shinigami: ['encounter-normal', 'rest', 'absorb-status'],
};

async function startServer() {
  if (process.env.C202_URL) return { url: process.env.C202_URL, stop: () => {} };
  const p = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe' });
  const url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) return { url, stop: () => p.kill() }; } catch { /* 아직 */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  p.kill();
  throw new Error('vite 서버가 뜨지 않았다');
}

async function newGame(page, url, fi) {
  await page.goto(`${url}?test=1`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${url}?test=1`);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '새로 시작' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-slot').first().click();
  await page.getByRole('button', { name: '확인' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-species__card').nth(fi).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await page.waitForTimeout(1500);
}

const lcd = (page) => page.locator('.bha-lcd');
const back = (page) => page.locator('.bha-dev__btn--back').first().click();

/** 테스트 패널 능력치 전부 최대(이기는 몸) — 걷기 속도는 1배 그대로 */
async function strongBody(page) {
  await lcd(page).getByRole('button', { name: '더보기' }).click();
  await page.waitForTimeout(500);
  await page.locator('.bha-homedock__tray').getByRole('button', { name: '테스트' }).click();
  await page.waitForTimeout(700);
  await page.locator('.bha-lcd .bha-viewtitle__btn').first().click();
  await page.locator('.bha-viewtitle__list').getByRole('option', { name: '능력치' }).click();
  await page.waitForTimeout(400);
  const inp = page.locator('.bha-lcd input[type="number"]');
  for (let i = 0; i < Math.min(await inp.count(), 6); i++) await inp.nth(i).fill((await inp.nth(i).getAttribute('max')) ?? '999');
  await lcd(page).getByRole('button', { name: '적용' }).click();
  await page.waitForTimeout(400);
  for (let i = 0; i < 4 && (await page.locator('.bha-lcd [data-dev-layer]').count()); i++) await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
}

(async () => {
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = { runs: [] };
  try {
    const list = process.env.C202_FACTION ? [[Number(process.env.C202_FACTION), ['hollow', 'shinigami'][Number(process.env.C202_FACTION)]]] : [[0, 'hollow'], [1, 'shinigami']];
    for (const [fi, faction] of list) {
      const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const want = new Set(SHOTS[faction]);
      const run = { faction, shots: [], notes: [] };
      const shot = async (name) => {
        if (!want.has(name)) return;
        want.delete(name);
        await page.screenshot({ path: path.join(OUT, `${faction}-${name}.png`) });
        run.shots.push(name);
      };
      await newGame(page, server.url, fi);
      await strongBody(page);
      // 원정 준비: 휴식 칸·강적 칸을 앞쪽에 놓는다
      await page.locator('.bha-prop--door').first().click();
      await page.waitForTimeout(900);
      await lcd(page).getByRole('button', { name: '★1', exact: true }).click();
      await page.waitForTimeout(600);
      for (const [kind, cell] of [['rest', 2], ['elite', 4]]) {
        const card = page.locator(`.bha-lcd .bha-tilecard--${kind}`).first();
        if (!(await card.count())) { run.notes.push(`손에 ${kind} 타일 없음`); continue; }
        await card.click();
        await page.waitForTimeout(200);
        await page.locator('.bha-lcd .bha-road__cell').nth(cell).click();
        await page.waitForTimeout(300);
      }
      await shot('plan-board');
      await lcd(page).getByRole('button', { name: '출발' }).click();
      await page.waitForTimeout(1200);
      const vis = (l) => l.filter({ visible: true });
      let absorbs = 0;
      for (let t = 0; t < 900 && want.size > 0; t++) {
        // 걷는 앞쪽 (조우·휴식)
        const ahead = page.locator('.bha-lcd .bha-ahead:not(.is-leaving)');
        if (await ahead.count()) {
          const k = await ahead.first().getAttribute('data-ahead');
          if (k === 'rest' && want.has('rest')) {
            await page.locator('.bha-lcd .bha-ahead.is-arrived').waitFor({ timeout: 6000 }).catch(() => {});
            await page.waitForTimeout(500);
            run.notes.push(`휴식 도착: 회복 빛 ${(await page.locator('.bha-lcd .bha-walker__heal:not([hidden])').count()) ? '보임' : '안 보임'}`);
            await shot('rest');
          } else if ((k === 'foe' && want.has('encounter-normal')) || ((k === 'elite' || k === 'boss') && want.has('encounter-elite'))) {
            await page.waitForTimeout(1050); // 다 다가오기 직전
            await shot(k === 'foe' ? 'encounter-normal' : 'encounter-elite');
          }
        }
        // 흡수 화면
        const eat = vis(page.getByRole('button', { name: /하러 가기$/ }));
        if (await eat.count()) {
          await eat.first().click({ timeout: 3000 }).catch(() => {});
          await page.waitForTimeout(900);
        }
        if (await page.locator('.bha-lcd .bha-absorbpage').count()) {
          if (want.has('absorb-back')) {
            await back(page);
            await page.waitForTimeout(500);
            run.notes.push(`흡수 뒤로 → 창 ${await page.locator('.bha-lcd [data-dev-layer]').count()}개`);
            await shot('absorb-back');
            await back(page); // 아니오
            await page.waitForTimeout(400);
          }
          if (want.has('absorb-status') && absorbs > 0) {
            await page.locator('.bha-lcd [data-absorb-me]').click();
            await page.waitForTimeout(500);
            await shot('absorb-status');
            await back(page);
            await page.waitForTimeout(400);
          }
          if (absorbs === 0) {
            // 첫 흡수는 실제로 먹는다(둘 다 → 첫 후보 → 슬롯) — 다음 흡수 화면의 [내 상태]에 이번 원정 흡수·장착이 보이게
            await page.locator('.bha-lcd .bha-absorbpage button.bha-btn--primary').first().click().catch(() => {});
            await page.waitForTimeout(700);
            for (let i = 0; i < 4 && (await page.locator('.bha-lcd .bha-absorbpage').count()); i++) {
              const cand = page.locator('.bha-lcd .bha-absorbpage .bha-cand').filter({ visible: true });
              const slot = page.locator('.bha-lcd .bha-absorbpage button.bha-slot').filter({ visible: true });
              const go = page.locator('.bha-lcd .bha-absorbpage button.bha-btn--primary:not([disabled])').filter({ visible: true });
              if (await slot.count()) await slot.first().click().catch(() => {});
              else if (await cand.count()) await cand.first().click().catch(() => {});
              else if (await go.count()) await go.first().click().catch(() => {});
              await page.waitForTimeout(700);
            }
            absorbs++;
          } else await page.locator('.bha-lcd .bha-absorbpage button.bha-btn--lg').last().click().catch(() => {}); // '… 안 함'
          await page.waitForTimeout(900);
          continue;
        }
        // 바퀴 끝 창
        const nest = vis(page.getByRole('button', { name: '귀환', exact: true }));
        if (await nest.count()) {
          const draft = page.locator('.bha-lcd .bha-draft__card').first();
          if (await draft.count()) await draft.click().catch(() => {});
          await page.waitForTimeout(400);
          await page.evaluate(() => (document.querySelector('.bha-lcd .bha-sheet .bha-draft') ?? document.querySelector('.bha-lcd .bha-sheet .bha-road'))?.scrollIntoView({ block: 'start' }));
          await page.waitForTimeout(300);
          await shot('lap-end-tiles');
          break;
        }
        await page.waitForTimeout(150);
      }
      run.missing = [...want];
      run.errors = errors;
      proof.runs.push(run);
      await page.close();
    }
  } finally {
    await browser.close();
    server.stop();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 1));
  console.log(JSON.stringify(proof, null, 1));
})();
