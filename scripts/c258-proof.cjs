// C.258 proof (GDD 175장 UI 배치 도구): `?layout` 도구를 폰 세로(412×915, 1배)로 열어 편집 → 미리보기 켠 같은 브라우저로 게임(844×390) 방을 연다.
// 캡처 docs/captures/c258/ : 1 도구 첫 화면 · 2 끌기 중 · 3 새 물건 + 아이콘 고르기 · 4 월드맵 장면 · 5 내보내기 · 6 미리보기 적용된 게임 방(새 물건 누름 = 준비 중)
// 실행: node scripts/c258-proof.cjs  (C258_URL=<주소> 로 이미 뜬 서버 사용)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c258');
const PORT = 5358;
async function startServer() {
  if (process.env.C258_URL) return { url: process.env.C258_URL, stop: () => {} };
  const p = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe', detached: true });
  const url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) return { url, stop: () => { try { process.kill(-p.pid); } catch { /* 이미 */ } } }; } catch { /* 아직 */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  try { process.kill(-p.pid); } catch { /* */ }
  throw new Error('vite 서버가 뜨지 않았다');
}

async function skipTut(page) {
  for (let t = 0; t < 40 && (await page.locator('.bha-tut').count()); t++) {
    const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled])').filter({ visible: true });
    if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
    else await page.locator('.bha-lcd').first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
}

/** 저장의 지금 트랙을 고친다 */
async function patchSave(page, fn) {
  await page.evaluate((src) => {
    const f = new Function('t', 'shared', src);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const raw = localStorage.getItem(k);
      if (!raw || !raw.includes('"runLog"')) continue;
      const data = JSON.parse(raw);
      const walk = (o) => {
        if (!o || typeof o !== 'object') return;
        if (o.nest && o.help && o.runLog) f(o, o.shared);
        for (const v of Object.values(o)) walk(v);
      };
      walk(data);
      localStorage.setItem(k, JSON.stringify(data));
    }
  }, fn);
}

async function reopen(page, skip = true) {
  await page.reload();
  await page.waitForTimeout(1500);
  const cont = page.getByRole('button', { name: '이어하기' });
  if (await cont.count()) { await cont.first().click().catch(() => {}); await page.waitForTimeout(500); }
  const slot = page.locator('.bha-slot').first();
  if (await slot.count()) { await slot.click().catch(() => {}); await page.getByRole('button', { name: '확인' }).click().catch(() => {}); await page.waitForTimeout(1500); }
  if (skip) await skipTut(page);
}

const screens = (page) => page.evaluate(() => [...document.querySelectorAll('.bha-lcd .bha-app')].map((e) => e.className.replace('bha-app ', '')).join('|'));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, hasTouch: true, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const proof = { shots: [], errors, trace: [] };
  const shot = async (name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  const status = () => page.locator('.bha-ltool__status').textContent();
  try {
    await page.goto(srv.url);
    await page.evaluate(() => localStorage.clear());
    // ── 1 도구 첫 화면 (사신 대원실) ──
    await page.goto(`${srv.url}?layout`);
    await page.waitForTimeout(1200);
    await page.locator('.bha-ltool__select').selectOption('room.shinigami');
    await page.waitForTimeout(800);
    await shot('1-tool-first');
    proof.first = await page.evaluate(() => ({ scenes: [...document.querySelectorAll('.bha-ltool__select option')].map((o) => o.textContent), props: [...document.querySelectorAll('.bha-room__scene .bha-prop')].map((e) => e.dataset.prop) }));
    // ── 2 책장 끌기 중 ──
    const book = page.locator('.bha-room__scene .bha-prop[data-prop="book"]');
    const bb = await book.boundingBox();
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 3);
    await page.mouse.down();
    await page.mouse.move(bb.x + bb.width / 2 + 22, bb.y + bb.height / 3 + 20, { steps: 6 });
    await shot('2-dragging');
    await page.mouse.up();
    await page.waitForTimeout(300);
    proof.drag = await status();
    // ── 3 새 물건 + 아이콘 고르기 ──
    page.once('dialog', (d) => d.accept('우물'));
    await page.getByRole('button', { name: '새 물건' }).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '아이콘 고르기' }).click();
    await page.locator('.bha-ltool__icons button[aria-label="i-tile-rest"]').click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '아이콘 고르기' }).click();
    await page.waitForTimeout(300);
    await shot('3-new-prop-icons');
    proof.extra = await status();
    // ── 4 월드맵(호로) 장면: 탑 크기 키우기 ──
    await page.locator('.bha-ltool__select').selectOption('worldmap.hollow');
    await page.waitForTimeout(800);
    await page.locator('.bha-room__scene .bha-prop[data-prop="tower"]').dispatchEvent('pointerdown', { pointerId: 1, clientX: 0, clientY: 0, isPrimary: true });
    await page.waitForTimeout(200);
    const range = page.locator('.bha-ltool__range');
    await range.fill('1.4');
    await range.dispatchEvent('change');
    await page.waitForTimeout(400);
    await shot('4-worldmap');
    // ── 5 미리보기 켜기 + 내보내기 ──
    await page.getByRole('button', { name: '미리보기 켜기' }).click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '내보내기' }).click()]);
    const file = path.join(OUT, 'export-sample.json');
    await dl.saveAs(file);
    await page.waitForTimeout(300);
    await shot('5-export');
    proof.export = { name: dl.suggestedFilename(), status: await status(), bytes: fs.statSync(file).size };
    // ── 6 같은 브라우저로 게임: 사신 새로 시작 → 방 (미리보기 적용) ──
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto(`${srv.url}?test=1`);
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: '새로 시작' }).click();
    await page.waitForTimeout(300);
    await page.locator('.bha-slot').first().click();
    await page.getByRole('button', { name: '확인' }).click();
    await page.waitForTimeout(300);
    await page.locator('.bha-species__card').nth(1).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '시작', exact: true }).click();
    await page.waitForTimeout(2000);
    await skipTut(page);
    await patchSave(page, `t.help.guides = { ...t.help.guides, 'first-run': 'done', 'home-intro': 'done', 'first-run-room': 'done', 'birth': 'done', 'recover': 'done' };`);
    await reopen(page);
    await page.waitForTimeout(800);
    await page.locator('.bha-room__scene [data-extra="new-1"]').click({ timeout: 4000 }).catch((e) => proof.trace.push(['no-extra', e.message]));
    await page.waitForTimeout(400);
    await shot('6-game-room-preview');
    proof.game = await page.evaluate(() => ({
      badge: document.querySelector('.bha-ltool-badge')?.textContent ?? null,
      book: document.querySelector('.bha-room__scene .bha-prop[data-prop="book"]')?.style.left ?? null,
      extra: document.querySelector('.bha-room__scene [data-extra="new-1"]')?.textContent ?? null,
      toast: document.body.innerText.includes('준비 중'),
    }));
  } catch (e) {
    proof.trace.push(['fail', e.message]);
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    console.log(JSON.stringify(proof, null, 2));
    await browser.close();
    srv.stop();
  }
})();
