// C.329 proof: 임시 적 그림 48장(public/art/enemy-*.png)이 실제 전투에 나오는지.
// 새 게임(두 종족) → 모험 ★1 첫 전투 → 적 그림 <img> 의 파일 이름·로드 여부 확인 + 캡처 1배 docs/captures/c329/. 실행: node scripts/c329-proof.cjs
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const OUT = path.join(path.resolve(__dirname, '..'), 'docs/captures/c329');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** 테스트 모드(?test=1, 탄생 연출·튜토리얼 없음) 새 게임 — c328-proof 와 같은 순서 */
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

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { checks: {}, errors: [] };
  try {
    for (const [fi, fname] of [[0, 'hollow'], [1, 'shinigami']]) {
      const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
      page.on('pageerror', (e) => proof.errors.push(`${fname}: ${e.message}`));
      await newGame(page, srv.url, fi);
      await wait(1500);
      await page.locator('.bha-prop--outside').first().click();
      await wait(900);
      await page.locator('.bha-worldmap [data-place="adventure"]').first().click();
      await wait(2200);
      await page.locator('.bha-lcd').getByRole('button', { name: '★1', exact: true }).first().click();
      await wait(400);
      await page.locator('.bha-lcd').getByRole('button', { name: '출발', exact: true }).first().click();
      await page.locator('.bha-battle').waitFor({ timeout: 60_000 });
      await wait(2500);
      proof.checks[fname] = await page.evaluate(() => [...document.querySelectorAll('.bha-battle img')]
        .map((i) => ({ src: i.getAttribute('src'), loaded: i.complete && i.naturalWidth > 0 }))
        .filter((i) => /enemy-/.test(i.src ?? '')));
      await page.screenshot({ path: path.join(OUT, `${fname}-battle.png`) });
      await page.close();
    }
  } finally {
    await browser.close();
    srv.stop();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 1));
})();
