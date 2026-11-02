// C.215 (GDD 137장) proof: ① 블록 설명·상세에 타입(물리·혼합·특수) 글자 없음 ② 전투 블록 칸에 체인 원 없음
// ③ 온천 계단 쭉 내려가는 중(멈칫 없이 — 자리를 시간마다 재서 멈춘 구간이 없는지) ④ 월드맵 장소 고르면 걸어가는 중 · 페이드 · 다음 화면.
// 캡처 docs/captures/c215/ (1배 844×390). 실행: node scripts/c215-proof.cjs (C215_URL=<주소> 면 그 주소, C215_FACTION=0|1 기본 0)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c215');
const PORT = 5315;
const FI = Number(process.env.C215_FACTION ?? 0);

async function startServer() {
  if (process.env.C215_URL) return { url: process.env.C215_URL, stop: () => {} };
  const p = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe', detached: true });
  const url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) return { url, stop: () => { try { process.kill(-p.pid); } catch { /* 이미 */ } } }; } catch { /* 아직 */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  try { process.kill(-p.pid); } catch { /* */ }
  throw new Error('vite 서버가 뜨지 않았다');
}

async function newGame(page, url) {
  await page.goto(`${url}?test=1`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${url}?test=1`);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '새로 시작' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-slot').first().click();
  await page.getByRole('button', { name: '확인' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-species__card').nth(FI).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await page.waitForTimeout(1500);
  await skipTut(page);
}
async function skipTut(page) {
  for (let t = 0; t < 40 && (await page.locator('.bha-tut').count()); t++) {
    const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled])').filter({ visible: true });
    if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
    else await page.locator('.bha-lcd').first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
}
const shot = (page, name) => page.locator('.bha-lcd').first().screenshot({ path: path.join(OUT, name) });
const charPos = (page) => page.evaluate(() => {
  const c = document.querySelector('.bha-worldmap__char');
  return c ? { left: c.style.left, top: c.style.top, cls: c.className } : null;
});
const fadeOp = (page) => page.evaluate(() => { const v = document.querySelector('.bha-worldmap__fade'); return v ? Number(getComputedStyle(v).opacity).toFixed(2) : null; });
const screenId = (page) => page.evaluate(() => [...document.querySelectorAll('.bha-lcd .bha-app')].map((e) => e.className.replace('bha-app ', '')).join('|'));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  const proof = { faction: FI === 0 ? 'hollow' : 'shinigami' };
  try {
    await newGame(page, srv.url);
    // ── 둥지 값: 체력 50%·컨디션 60 (온천에 들어갈 수 있게) — 테스트 패널 ──
    await page.locator('[data-dock="more"]').click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '테스트' }).click();
    await page.waitForTimeout(400);
    await page.locator('.bha-viewtitle__btn').click();
    await page.waitForTimeout(200);
    await page.getByRole('option', { name: '둥지·시간' }).click();
    await page.waitForTimeout(300);
    await page.getByLabel('컨디션').fill('60');
    await page.getByLabel('체력 %').fill('50');
    await page.getByRole('button', { name: '적용' }).click();
    await page.waitForTimeout(300);
    // 특성 칸 1·2 = 공격 특성 (블록 상세 캡처용)
    await page.locator('.bha-viewtitle__btn').click();
    await page.waitForTimeout(200);
    await page.getByRole('option', { name: '특성' }).click();
    await page.waitForTimeout(300);
    const fam = FI === 0 ? ['조', '교'] : ['권', '참'];
    for (const [i, nm] of [[1, fam[0]], [2, fam[1]]]) {
      await page.getByRole('button', { name: `특성 칸 ${i}` }).click();
      await page.waitForTimeout(200);
      await page.getByRole('option', { name: nm, exact: true }).nth(1).click();
      await page.waitForTimeout(200);
    }
    await page.getByRole('button', { name: '적용' }).click();
    await page.waitForTimeout(300);

    // ── ① 블록 상세 (테스트 패널 특성 탭은 테스트 화면이라, 실제 화면 = 상태 → 특성) ──
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    proof.screenAfterTest = await screenId(page);

    // ── ④ 월드맵: 밖으로 → 시장 (걷는 중 · 페이드 · 시장) ──
    await page.locator('.bha-prop--outside').click();
    await page.waitForTimeout(600);
    proof.worldmapStart = await charPos(page);
    await shot(page, '01-worldmap-start.png');
    await page.locator('.bha-worldmap [data-place="market"]').click();
    const t0 = Date.now();
    const track = [];
    let fadeShot = false;
    for (let i = 0; i < 24; i++) {
      await page.waitForTimeout(40);
      const f = await fadeOp(page);
      track.push({ ms: Date.now() - t0, ...(await charPos(page)), fade: f, screen: await screenId(page) });
      if (i === 6) await shot(page, '02-worldmap-walking.png');
      if (!fadeShot && f !== null && Number(f) >= 0.3) { fadeShot = true; await shot(page, '03-worldmap-fade.png'); }
    }
    // 걷는 중 입력 잠금: 다른 장소를 눌러도 화면이 그대로
    proof.walkTrack = track;
    await page.waitForTimeout(900);
    proof.afterWalk = await screenId(page);
    await shot(page, '04-market-fadein.png');

    // ── 뒤로 = 취소 (시장 → 월드맵 → 모험 고르고 걷는 중 뒤로) ──
    await page.keyboard.press('Escape');
    await page.waitForTimeout(700);
    proof.backToMap = await screenId(page);
    const before = await charPos(page);
    await page.locator('.bha-worldmap [data-place="adventure"]').click();
    await page.waitForTimeout(250);
    const mid = await charPos(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    proof.cancel = { before, mid, after: await charPos(page), screen: await screenId(page), fade: await fadeOp(page) };

    // ── ③ 온천: 시장 → 온천, 계단 쭉 내려가기 (자리 기록: 멈춘 구간 없이) ──
    await page.locator('.bha-worldmap [data-place="market"]').click();
    await page.waitForTimeout(1800);
    await page.locator('.bha-market [data-spot="spa"]').click();
    const s0 = Date.now();
    const spa = [];
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(60);
      spa.push(await page.evaluate(() => { const a = document.querySelector('.bha-spa__actor'); return a ? { left: parseFloat(a.style.left), bottom: parseFloat(a.style.bottom), wl: a.style.getPropertyValue('--bha-spa-wl'), cls: a.className.replace('bha-spa__actor ', '') } : null; }));
      spa[spa.length - 1].ms = Date.now() - s0;
      if (spa.at(-1)?.left < 72 && !proof.spaShot) { proof.spaShot = spa.at(-1); await shot(page, '05-spa-descending.png'); }
    }
    proof.spaTrack = spa;
    // 계단 구간(left 82 → 50)에서 이웃 기록끼리 자리가 같은(멈춘) 경우
    const stair = spa.filter((p) => p && p.left < 82 && p.left > 50.5);
    proof.spaStallSamples = stair.filter((p, i) => i > 0 && Math.abs(p.left - stair[i - 1].left) < 0.05).length;
    await shot(page, '06-spa-seated.png');
    // 나가기: 쭉 올라옴
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await shot(page, '07-spa-leaving.png');
    await page.waitForTimeout(2200);

    // ── ① 블록 상세: 가방 → 슬롯 → 특성 카드 (흡수 후보·빌드와 같은 설명 함수) ──
    for (let i = 0; i < 4 && (await screenId(page)) !== 'bha-room'; i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(600); }
    await page.locator('.bha-prop--chest').click();
    await page.waitForTimeout(500);
    await page.getByRole('tab', { name: /슬롯/ }).click().catch(async () => page.getByRole('button', { name: /^슬롯/ }).click());
    await page.waitForTimeout(400);
    await page.locator('.bha-sgcell[data-index="0"]').first().click();
    await page.waitForTimeout(500);
    proof.detail = await page.evaluate(() => (document.querySelector('.bha-itemmodal')?.textContent ?? '').slice(0, 300));
    proof.detailTypeWords = (proof.detail.match(/물리|혼합|특수 공격|물공|마공/g) ?? []);
    await shot(page, '00-block-detail.png');

    // ── ② 전투 블록 칸 (테스트 바로 전투) ──
    await page.goto(`${srv.url}?test=1`);
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: '이어하기' }).click().catch(() => {});
    await page.waitForTimeout(1500);
    await skipTut(page);
    await page.locator('[data-dock="more"]').click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '테스트' }).click();
    await page.waitForTimeout(400);
    await page.locator('.bha-viewtitle__btn').click();
    await page.waitForTimeout(200);
    await page.getByRole('option', { name: '바로 전투' }).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '전투 시작' }).click();
    await page.waitForTimeout(9000);
    proof.battle = await page.evaluate(() => ({
      blocks: document.querySelectorAll('.bha-lcd .bha-block').length,
      pips: document.querySelectorAll('.bha-lcd .bha-block__pips').length,
      runs: document.querySelectorAll('.bha-lcd .bha-v2chain, .bha-lcd [class*="chain"]').length,
    }));
    await shot(page, '08-battle-blocks.png');
    // ── ① 블록 설명 화면: 흡수 후보·빌드 설명과 같은 traitDescription — 일시정지 → 블록 상세가 없으면 상태 화면 특성 ──
    proof.typeWords = await page.evaluate(() => (document.querySelector('.bha-lcd')?.textContent ?? '').match(/물리|혼합|물공|마공/g) ?? []);
  } catch (e) {
    proof.error = String(e && e.stack || e);
    await shot(page, '99-error.png').catch(() => {});
  } finally {
    fs.writeFileSync(path.join(OUT, `proof-${proof.faction}.json`), JSON.stringify(proof, null, 1));
    await browser.close();
    srv.stop();
  }
})();
