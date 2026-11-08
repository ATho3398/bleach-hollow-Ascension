// 예전(리디자인 전 C.281) ↔ 지금 비교 캡처 (GDD 189장, 코딩208). 게임 코드는 안 고친다.
// 쓰기: node scripts/ui-audit/r208-compare.cjs <주소> <저장 폴더> <접두어>
//   예) 옛 빌드: git worktree add <폴더> 68acec7b → 그 폴더에서 npx vite --port 5289 → node scripts/ui-audit/r208-compare.cjs http://localhost:5289/ docs/captures/r208 old
// 조건: PC 고정 844×390(화면 세션 캡처 조건) · 터치 폰 796×384(사용자 폰 = 갤럭시 2340×1080, DPR 2.8125 → 832×384, 왼쪽 안전 영역 약 37px 를 뺀 폭)
// 화면: 방 · 상태 · 걷기(출발 2.5초 뒤) · 전투(조우 2.5초 뒤). 두 종족.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const [url, outDir, prefix] = process.argv.slice(2);
const CONDS = [
  { id: 'pc844', opt: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 } },
  { id: 'ph796', opt: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true } },
];

async function newGame(page, fi) {
  await page.goto(`${url}?test=1`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${url}?test=1`);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '새로 시작' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-slot').first().click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: '확인' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-species__card').nth(fi).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await page.waitForTimeout(1800);
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const b = await chromium.launch();
  for (const c of CONDS) {
    for (const [fi, fac] of [[0, 'hollow'], [1, 'shinigami']]) {
      const page = await b.newPage(c.opt);
      const shot = (name) => page.screenshot({ path: path.join(outDir, `${prefix}-${c.id}-${fac}-${name}.png`) });
      try {
        await newGame(page, fi);
        await shot('1room');
        await page.locator('.bha-room__status').first().click();
        await page.waitForTimeout(800);
        await shot('2status');
        await page.keyboard.press('Escape');
        await page.goto(`${url}?test=1`);
        await page.waitForTimeout(1200);
        await page.getByRole('button', { name: '이어하기' }).click().catch(() => {});
        await page.waitForTimeout(1500);
        await page.locator('.bha-prop--outside').first().click();
        await page.waitForTimeout(700);
        await page.locator('.bha-worldmap [data-place="adventure"]').first().click();
        await page.waitForTimeout(2000);
        await page.getByRole('button', { name: '★1', exact: true }).first().click().catch(() => {});
        await page.waitForTimeout(300);
        await page.getByRole('button', { name: '출발', exact: true }).first().click();
        await page.waitForTimeout(2500);
        await shot('3walk');
        await page.locator('.bha-battle').waitFor({ timeout: 60_000 });
        await page.waitForTimeout(2500);
        await shot('4battle');
      } catch (e) {
        console.log(c.id, fac, 'fail', String(e.message).split('\n')[0]);
        await shot('zz-fail').catch(() => {});
      }
      await page.close();
    }
  }
  await b.close();
})();
