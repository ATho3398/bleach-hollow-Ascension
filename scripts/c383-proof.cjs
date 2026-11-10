// C.383 proof (GDD 232장, 코딩264): 클라우드 저장 실패 원인 보이기 — 설정 > 기타 '로그인' 줄의 오류 코드 문구 + [다시 올리기].
// 실제 Firebase 는 자동 점검에서 못 써 dev 서버의 가짜 클라우드(`?cloudfake`, src/cloudFake.ts)로 흉내 낸다: bha-cloud-fake.fail = Firestore 코드 · `?cloudfake=sdkfail` = SDK 조각 받기 실패.
// pc(844×390 마우스): ① permission-denied 문구·버튼 → 실패 각본을 지우고 [다시 올리기] → ② 올림·버튼 사라짐. ph(796×384 터치): ③ unavailable ④ SDK 준비 실패.
// 캡처 1배 docs/captures/c383/. 실행: node scripts/c383-proof.cjs (C383_URL=<주소>)
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
if (process.env.C383_URL) process.env.C276_URL = process.env.C383_URL;
const { startServer, newGame } = require('./c276-proof.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c383');
const USER = { uid: 'fake-uid', name: '테스트 사용자', email: 'tester@example.com', anonymous: false };

async function openSettingsEtc(page) {
  await page.getByRole('button', { name: '설정' }).first().click();
  await page.waitForTimeout(400);
  await page.locator('.bha-tab[data-tab="etc"]').click();
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('[data-set="cloud-login"]')?.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
}

const loginRow = (page) => page.evaluate(() => {
  const b = document.querySelector('[data-set="cloud-login"]');
  const rb = document.querySelector('[data-set="cloud-retry"]');
  const hint = b?.closest('.bha-setrow')?.querySelector('.bha-settings__hint');
  const lcd = document.querySelector('.bha-lcd').getBoundingClientRect();
  const r = rb?.getBoundingClientRect();
  return {
    hint: hint ? hint.textContent.trim() : '',
    retry: rb ? { shown: !rb.hidden && r.height > 0, disabled: rb.disabled, label: rb.textContent.trim(), inside: r.left >= lcd.left && r.right <= lcd.right && r.top >= lcd.top && r.bottom <= lcd.bottom } : null,
  };
});

async function seed(page, url, fail) {
  await page.evaluate(([u, f]) => {
    localStorage.setItem('bha-cloud', JSON.stringify(u));
    localStorage.setItem('bha-cloud-gate', JSON.stringify({ at: 1 }));
    localStorage.removeItem('bha-cloud-sync');
    localStorage.setItem('bha-cloud-fake', JSON.stringify({ user: u, doc: null, active: null, googleTaken: false, fail: f }));
  }, [USER, fail]);
  await page.goto(url);
  await page.waitForTimeout(1500);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { runs: [], errors: [], warns: [] };
  try {
    {
      const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`pc: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'warning' && m.text().includes('[클라우드]')) proof.warns.push(`pc: ${m.text()}`); });
      await newGame(page, srv.url, 0);
      await page.waitForTimeout(1200);
      await seed(page, `${srv.url}?cloudfake`, 'permission-denied');
      await openSettingsEtc(page);
      const r = { mode: 'pc', denied: await loginRow(page) };
      await page.screenshot({ path: path.join(OUT, 'pc-1-permission-denied.png') });
      // 규칙을 게시했다고 치고(실패 각본 지움) [다시 올리기] — 재시도 대기(5초) 없이 바로
      await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('bha-cloud-fake')); s.fail = null; localStorage.setItem('bha-cloud-fake', JSON.stringify(s)); });
      await page.locator('[data-set="cloud-retry"]').click();
      r.during = await loginRow(page);
      await page.waitForTimeout(700);
      r.after = await loginRow(page);
      r.uploaded = await page.evaluate(() => !!JSON.parse(localStorage.getItem('bha-cloud-fake')).doc);
      await page.screenshot({ path: path.join(OUT, 'pc-2-retried.png') });
      proof.runs.push(r);
      await ctx.close();
    }
    {
      const ctx = await browser.newContext({ viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`ph: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'warning' && m.text().includes('[클라우드]')) proof.warns.push(`ph: ${m.text()}`); });
      await newGame(page, srv.url, 1);
      await page.waitForTimeout(1200);
      await seed(page, `${srv.url}?cloudfake`, 'unavailable');
      await openSettingsEtc(page);
      const r = { mode: 'ph', unavailable: await loginRow(page) };
      await page.screenshot({ path: path.join(OUT, 'ph-3-unavailable.png') });
      await seed(page, `${srv.url}?cloudfake=sdkfail`, null);
      await openSettingsEtc(page);
      r.sdkfail = await loginRow(page);
      await page.screenshot({ path: path.join(OUT, 'ph-4-sdk-fail.png') });
      proof.runs.push(r);
      await ctx.close();
    }
  } finally {
    await browser.close();
    await srv.close?.();
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    console.log(JSON.stringify(proof, null, 2));
    process.exit(0);
  }
})();
