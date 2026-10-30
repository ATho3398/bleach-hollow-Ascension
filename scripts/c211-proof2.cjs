// C.211 proof 2: ① 새 세이브(호로) 가방 소모품 = 치료제 3 (홈 안내만 본 것으로 표시하고 방에서 가방) ② 사신 테스트 모드 [다음 진화] 혼백 → 영술원 학생 진화 문구. 캡처 docs/captures/c211/
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c211');
const PORT = 5312;
async function startServer() {
  const p = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe' });
  const url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) return { url, stop: () => p.kill() }; } catch { /* 아직 */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite 서버가 뜨지 않았다');
}
async function newGame(page, url, fi) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.goto(url);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '새로 시작' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-slot').first().click();
  await page.getByRole('button', { name: '확인' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-species__card').nth(fi).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await page.waitForTimeout(2500);
}
const markIntroDone = () => {
  for (const k of Object.keys(localStorage)) {
    const v = localStorage.getItem(k) ?? '';
    if (!v.includes('"home-intro"')) continue;
    localStorage.setItem(k, v.replace(/"home-intro":"pending"/g, '"home-intro":"done"'));
    return k;
  }
  return null;
};
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  const proof = {};
  try {
    const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
    await newGame(page, server.url, 0);
    proof.saveKey = await page.evaluate(markIntroDone);
    await page.goto(server.url);
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: /이어하기/ }).first().click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(2500);
    proof.cures = await page.evaluate(() => { for (const k of Object.keys(localStorage)) { const m = (localStorage.getItem(k) ?? '').match(/"med-cure":(\d+)/); if (m) return Number(m[1]); } return null; });
    await page.locator('.bha-prop--chest').first().click({ timeout: 5000 });
    await page.waitForTimeout(800);
    await page.locator('button').filter({ hasText: /^물건/ }).first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(600);
    await page.locator('button').filter({ hasText: /^소모품/ }).first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(600);
    proof.bagCure = await page.evaluate(() => (document.querySelector('[data-item="med-cure"]')?.textContent ?? '').trim());
    await page.screenshot({ path: path.join(OUT, '3-new-save-bag-cures.png') });
    await page.close();

    const sp = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
    await newGame(sp, `${server.url}?test=1`, 1);
    for (let t = 0; t < 20 && (await sp.locator('.bha-tut').count()); t++) {
      const go = sp.locator('.bha-tut button.bha-btn--primary:not([disabled])').filter({ visible: true });
      if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
      await sp.waitForTimeout(400);
    }
    proof.dockButtons = await sp.evaluate(() => [...document.querySelectorAll('button')].map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim()).filter(Boolean).slice(0, 40));
    fs.writeFileSync(path.join(OUT, 'proof2.json'), JSON.stringify(proof, null, 2));
    await sp.locator('button').filter({ hasText: '더보기' }).first().click({ timeout: 4000 }).catch(() => {});
    await sp.locator('[aria-label="더보기"]').first().click({ timeout: 2000 }).catch(() => {});
    await sp.waitForTimeout(500);
    await sp.locator('button').filter({ hasText: /^테스트$/ }).first().click({ timeout: 4000 }).catch(() => {});
    await sp.waitForTimeout(800);
    // 테스트 칸은 5단계로 시작한다: [진화체] 탭에서 1단계(진화 전)로 바꾼 뒤 [진화] 탭
    await sp.locator('button').filter({ hasText: /테스트 ·/ }).first().click({ timeout: 3000 }).catch(() => {});
    await sp.waitForTimeout(400);
    await sp.locator('button, [role="option"], [role="menuitem"]').filter({ hasText: /^진화체$/ }).first().click({ timeout: 3000 }).catch(() => {});
    await sp.waitForTimeout(500);
    await sp.locator('.bha-test__select').nth(1).click({ timeout: 3000 }).catch((e) => { proof.selErr = String(e).slice(0, 200); });
    await sp.waitForTimeout(400);
    proof.opts = await sp.evaluate(() => [...document.querySelectorAll('.bha-pick__list [role=option]')].slice(0, 5).map((e) => e.textContent));
    await sp.locator('.bha-pick__list [role="option"]').filter({ hasText: '진화 전' }).first().click({ timeout: 3000 }).catch((e) => { proof.selErr2 = String(e).slice(0, 200); });
    await sp.waitForTimeout(400);
    await sp.locator('button').filter({ hasText: '이 몸으로' }).first().click({ timeout: 2000 }).catch(() => {});
    await sp.waitForTimeout(600);
    // 탭 고르기: 제목 토글 → '진화'
    await sp.locator('button').filter({ hasText: /테스트 ·/ }).first().click({ timeout: 3000 }).catch(() => {});
    await sp.waitForTimeout(400);
    await sp.locator('button, [role="option"], [role="menuitem"]').filter({ hasText: /^진화$/ }).first().click({ timeout: 3000 }).catch(() => {});
    await sp.waitForTimeout(500);
    await sp.locator('button').filter({ hasText: '다음 진화' }).first().click({ timeout: 4000 });
    await sp.waitForTimeout(3300);
    proof.lines = await sp.evaluate(() => [...document.querySelectorAll('.bha-evolve__line')].map((e) => e.textContent));
    await sp.screenshot({ path: path.join(OUT, '4-shinigami-evolve-lines.png') });
    await sp.waitForTimeout(1500);
    proof.reason = await sp.evaluate(() => document.querySelector('[data-evolve-reason]')?.textContent ?? null);
    proof.path = await sp.evaluate(() => document.querySelector('.bha-evolve__path')?.textContent ?? null);
    await sp.screenshot({ path: path.join(OUT, '5-shinigami-evolve-result.png') });
  } catch (e) { proof.error = String(e); } finally {
    fs.writeFileSync(path.join(OUT, 'proof2.json'), JSON.stringify(proof, null, 2));
    console.log(JSON.stringify(proof, null, 1));
    await browser.close();
    server.stop();
    process.exit(0);
  }
})();
