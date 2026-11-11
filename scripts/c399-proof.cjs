// C.399 proof (GDD 241-A, 코딩267): 처음 화면·새로 시작·설정 8건 캡처 + 잠긴 아이콘 알림 측정. 폰 796×384 터치 · 1배.
// 쓰기: npm run build && node scripts/c399-proof.cjs [저장 폴더]
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs/captures/c399'));
const PORT = 5399;

async function server() {
  const p = spawn(path.join(ROOT, 'node_modules/.bin/vite'), ['preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore', detached: true });
  const url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) { try { if ((await fetch(url)).ok) return { url, stop: () => { try { process.kill(-p.pid); } catch { /* */ } } }; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  throw new Error('preview 안 뜸');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await server();
  const b = await chromium.launch();
  const proof = { shots: [], errors: [], checks: {} };
  const page = await b.newPage({ viewport: { width: 796, height: 384 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => proof.errors.push(e.message.slice(0, 160)));
  const shot = async (n) => { await page.screenshot({ path: path.join(OUT, `${n}.png`) }); proof.shots.push(`${n}.png`); };
  try {
    await page.goto(srv.url);
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('bha-cloud-gate', JSON.stringify({ at: 1 })); });
    await page.goto(srv.url); await page.waitForTimeout(1500);
    // 새 게임: 종족(설명 없음) → 확인 '○○로 시작하시겠습니까?' 네/아니요 → 이름·성별 한 화면
    await page.getByRole('button', { name: '새로 시작' }).click(); await page.waitForTimeout(300);
    await page.locator('.bha-slot').first().click(); await page.getByRole('button', { name: '확인' }).click(); await page.waitForTimeout(400);
    proof.checks.speciesTagline = await page.locator('.bha-species__tagline').count();
    await shot('02-species');
    await page.locator('.bha-species__card').nth(0).click(); await page.waitForTimeout(300);
    proof.checks.confirm = await page.locator('.bha-confirm .bha-modal').innerText();
    await shot('03-species-confirm');
    await page.getByRole('button', { name: '네', exact: true }).click(); await page.waitForTimeout(500);
    await page.locator('[data-ident="name"]').fill('이치고');
    await shot('04-identity-empty-gender');
    await page.locator('[data-gender]').first().click(); await page.waitForTimeout(150);
    proof.checks.identity = await page.locator('.bha-ident').innerText();
    await shot('04b-identity');
    await page.locator('[data-ident="done"]').click(); await page.waitForTimeout(5000);
    // 방: 대기 보상 = 초시계 · 잠긴 번호 쟁탈전 누르면 알림(매끄러운 들어오기) — 측정
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const runs = [];
    for (let i = 0; i < 6; i++) {
      runs.push(await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => {
        const t0 = performance.now();
        document.querySelector('.is-locked').click();
        const seen = []; let last = performance.now(); const deltas = [];
        const tick = (t) => {
          const toast = document.querySelector('.bha-toast');
          if (toast) { const cs = getComputedStyle(toast); seen.push(`${cs.transform}|${cs.opacity}`); }
          deltas.push(t - last); last = t;
          if (performance.now() - t0 < 500) requestAnimationFrame(tick); else done({ states: new Set(seen).size, frames: seen.length, maxFrameMs: +Math.max(...deltas).toFixed(1) });
        };
        requestAnimationFrame(tick);
      }))));
      await page.waitForTimeout(2600);
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    proof.checks.lockToast = runs;
    await page.evaluate(() => document.querySelector('.is-locked').click()); await page.waitForTimeout(150); // 튜토리얼 카드가 덮어도 누름
    await shot('06-room-lock-toast');
    await page.waitForTimeout(2600);
    // 설정 아이콘(더보기 안) 롤백
    await page.evaluate(() => document.querySelector('[data-sc="dock.more"]').click()); await page.waitForTimeout(300);
    await shot('07-room-more-settings-icon');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    // 처음 화면 순서 (세이브 있음 → 이어하기·불러오기·새로 시작)
    await page.goto(srv.url); await page.waitForTimeout(1500);
    proof.checks.startOrder = await page.locator('.bha-start__menu .bha-btn').allInnerTexts();
    await shot('01-start');
    // 새로 시작 → 기록 있는 슬롯 [삭제](기본 모양) → 입력해야 열리는 확인 창
    await page.getByRole('button', { name: '새로 시작' }).click(); await page.waitForTimeout(300);
    await page.locator('.bha-slot').first().click(); await page.waitForTimeout(150);
    proof.checks.deleteBtnClass = await page.locator('[data-sc="slots.delete"]').getAttribute('class');
    await page.locator('[data-sc="slots.delete"]').click(); await page.waitForTimeout(300);
    const yes = page.locator('.bha-confirm .bha-modal__actions .bha-btn').last();
    proof.checks.deleteYesDisabledEmpty = await yes.isDisabled();
    await page.locator('[data-confirm-input]').fill('삭');
    proof.checks.deleteYesDisabledPartial = await yes.isDisabled();
    await page.locator('[data-confirm-input]').fill('삭제');
    proof.checks.deleteYesEnabledTyped = !(await yes.isDisabled());
    await shot('05-slot-delete');
    await page.locator('.bha-confirm .bha-btn--ghost').click(); await page.waitForTimeout(200);
    // 설정 기타: 바깥 열 하나만 스크롤, 띠는 스크롤 칸 밖 — 한 번 끌어 끝까지
    await page.goto(srv.url); await page.waitForTimeout(1500);
    await page.getByRole('button', { name: '설정' }).first().click(); await page.waitForTimeout(400);
    await page.locator('[data-tab="etc"]').click(); await page.waitForTimeout(400);
    const sc = () => page.evaluate(() => { const c = document.querySelector('.bha-settings-page .bha-lcdpage__col--left'); return { top: c.scrollTop, max: c.scrollHeight - c.clientHeight, sh: c.scrollHeight }; });
    const before = await sc();
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await touch('touchStart', 400, 260);
    for (let k = 1; k <= 12; k++) { await touch('touchMove', 400, 260 - k * 12); await page.waitForTimeout(16); }
    await touch('touchEnd', 400, 116); await page.waitForTimeout(600);
    const after = await sc();
    proof.checks.settingsEtcDrag = { before, afterOneDrag: after, gridScroller: await page.evaluate(() => getComputedStyle(document.querySelector('.bha-settings__grid')).overflowY) };
    await shot('08-settings-etc-after-one-drag');
  } catch (e) {
    proof.errors.push(String(e).slice(0, 300));
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof.checks, null, 1), proof.errors);
  await b.close();
  srv.stop();
})();
