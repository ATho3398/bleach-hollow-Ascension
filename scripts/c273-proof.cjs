// C.273 proof (GDD 180장 2·3): 온천 가득 순간 온천 안 노란 알림 → 2초 뒤 방(알림 없음) · 튜토리얼 온천 가득 · 고기 1개 배부름 +5. 캡처 1배 844×390
// 실행: node scripts/c273-proof.cjs (C273_URL=<주소>, C273_OUT=<폴더>)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.C273_OUT ?? path.join(ROOT, 'docs/captures/c273');
const PORT = 5373;

async function startServer() {
  if (process.env.C273_URL) return { url: process.env.C273_URL, stop: () => {} };
  const p = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe', detached: true });
  const url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) return { url, stop: () => { try { process.kill(-p.pid); } catch { /* */ } } }; } catch { /* */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  try { process.kill(-p.pid); } catch { /* */ }
  throw new Error('vite 서버가 뜨지 않았다');
}

const btn = { up: '위', down: '아래', ok: '확정', back: '취소' };
const press = async (page, b, wait = 160) => {
  await page.locator(`.bha-dev__btn[aria-label="${btn[b]}"]`).first().click({ timeout: 2000 });
  await page.waitForTimeout(wait);
};
/** 지금 기기 초점 칸 */
const sel = (page) => page.evaluate(() => {
  const s = document.querySelector('.bha-sel');
  if (!s) return null;
  const lab = (s.getAttribute('aria-label') || s.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30);
  return { lab, cls: s.className.split(' ').filter((c) => c.startsWith('bha-')).slice(0, 3).join('.'), care: s.dataset.care ?? null, tama: s.dataset.tama ?? null };
}).catch(() => null); // 화면이 다시 열리는 순간(서비스 워커 갱신 등)은 다음 번에
/** pred 에 맞는 칸이 고를 때까지 ▼ (최대 n번) */
async function downTo(page, pred, n = 30) {
  for (let i = 0; i < n; i++) {
    const s = await sel(page);
    if (s && pred(s)) return s;
    await press(page, 'down', 120);
  }
  return null;
}

async function skipTut(page) {
  for (let t = 0; t < 40 && (await page.locator('.bha-tut').count()); t++) {
    const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled])').filter({ visible: true });
    if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
    else await page.locator('.bha-lcd').first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
}

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

async function reopen(page) {
  await page.reload();
  await page.waitForTimeout(1500);
  const cont = page.getByRole('button', { name: '이어하기' });
  if (await cont.count()) { await cont.first().click().catch(() => {}); await page.waitForTimeout(500); }
  const slot = page.locator('.bha-slot').first();
  if (await slot.count()) { await slot.click().catch(() => {}); await page.getByRole('button', { name: '확인' }).click().catch(() => {}); await page.waitForTimeout(1500); }
  await skipTut(page);
}

async function newGame(page, url, fi, test = true) {
  const u = test ? `${url}?test=1` : url; // 탄생 연출은 테스트 모드가 아닐 때만 (app.ts renderSpecies)
  await page.goto(u);
  await page.evaluate(() => localStorage.clear());
  await page.goto(u);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '새로 시작' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-slot').first().click();
  await page.getByRole('button', { name: '확인' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-species__card').nth(fi).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '시작', exact: true }).click();
}


const toastText = (page) => page.evaluate(() => [...document.querySelectorAll('.bha-toast')].filter((t) => getComputedStyle(t).visibility !== 'hidden' && !t.classList.contains('is-out')).map((t) => t.textContent.replace(/\s+/g, ' ').trim()));
const screenId = (page) => page.evaluate(() => (document.querySelector('.bha-lcd .bha-spa') ? 'spa' : document.querySelector('.bha-lcd .bha-room') ? 'room' : 'other'));

async function toSpa(page) {
  await page.locator('.bha-prop--outside').first().click({ timeout: 4000 });
  await page.waitForTimeout(1500);
  await page.click('.bha-worldmap [data-place="spa"]', { timeout: 4000 });
}
/** 온천 안에서 가득 알림이 뜰 때까지 기다렸다가 찍고, 2.3초 뒤 방을 찍는다 */
async function waitFull(page, tag, maxMs = 40000) {
  const r = { tag };
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const tt = await toastText(page);
    if (tt.some((x) => x.includes('체력이 가득 찼다'))) {
      r.at = Date.now() - t0;
      r.screenAtNotice = await screenId(page);
      r.toast = tt;
      r.seated = await page.evaluate(() => !!document.querySelector('.bha-spa__actor.is-seated'));
      await shot(page, `${tag}-1-spa-full-notice`);
      const t1 = Date.now();
      while (Date.now() - t1 < 4000 && (await screenId(page)) === 'spa') await page.waitForTimeout(100);
      r.toRoomMs = Date.now() - t1;
      await page.waitForTimeout(300);
      r.screenAfter = await screenId(page);
      r.toastAfter = await toastText(page);
      await shot(page, `${tag}-2-room-after`);
      r.ok = r.screenAtNotice === 'spa' && r.seated && r.screenAfter === 'room' && r.toRoomMs >= 1500 && r.toRoomMs <= 2900 && !r.toastAfter.some((x) => /가득|돌아왔다/.test(x));
      return r;
    }
    await page.waitForTimeout(100);
  }
  r.ok = false;
  r.note = 'timeout';
  return r;
}

let shot;
const proof = { shots: [], checks: {}, errors: [] };
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const mk = async () => {
    const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => proof.errors.push(e.message));
    return page;
  };
  shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  try {
    for (const [fi, fid] of [[0, 'hollow'], [1, 'shinigami']]) {
      const page = await mk();
      await newGame(page, srv.url, fi);
      await page.waitForTimeout(2500);
      await skipTut(page);
      // 평소 온천: 체력 85%·컨디션 90 → 몇 초 뒤 가득
      await patchSave(page, `
        t.help.guides = { ...t.help.guides, 'first-run': 'done', 'home-intro': 'done', 'first-run-room': 'done', 'birth': 'done', 'recover': 'done' };
        t.nest.hunger = 30; t.nest.condition = 90; t.nest.hpFraction = 0.85; t.nest.spa = null; t.nest.careRequest = null;
        t.nest.collapsed = false; t.nest.collapsedAt = 0; t.nest.weakened = false; t.nest.tired = false; t.nest.dead = false; t.nest.feedLog = [];
        shared.food = { ...shared.food, basic: 5 };
      `);
      await reopen(page);
      await page.waitForTimeout(800);
      await toSpa(page);
      proof.checks[`${fid}-spa`] = await waitFull(page, `${fid}`);
      // 먹이: 고기 1개 → 배부름 +5
      if (fid === 'hollow') {
        await page.waitForTimeout(3500);
        const before = await page.evaluate(() => document.querySelector('.bha-room .bha-room__gauge--hunger .bha-room__gaugenum')?.textContent ?? null);
        await page.locator('.bha-homedock__carebtn--feed, .bha-homedock [data-care="feed"]').first().click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(400);
        const label = await page.locator('.bha-homedock__food[data-food="basic"]').textContent().catch(() => null);
        await page.locator('.bha-homedock__food[data-food="basic"]').click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(500);
        const bubble = await page.evaluate(() => [...document.querySelectorAll('.bha-room .bha-bubble, .bha-room [class*="bubble"]')].map((b) => b.textContent.trim()).filter(Boolean).slice(0, 3));
        await shot(page, 'feed-basic-plus5');
        await page.waitForTimeout(1500);
        const after = await page.evaluate(() => document.querySelector('.bha-room .bha-room__gauge--hunger .bha-room__gaugenum')?.textContent ?? null);
        proof.checks.feed = { before, after, label, bubble, ok: (label ?? '').includes('+5') && bubble.some((b) => b.includes('+5')) };
      }
      await page.close();
    }
    // 튜토리얼 온천 (회복 안내, 사신): 빈사 아님·체력 50% → '온천' 단계부터
    {
      const page = await mk();
      await newGame(page, srv.url, 1);
      await page.waitForTimeout(2500);
      await skipTut(page);
      await patchSave(page, `
        t.help.guides = { ...t.help.guides, 'first-run': 'done', 'home-intro': 'done', 'first-run-room': 'done', 'birth': 'done', 'recover': 'pending', 'recover-cure': 'done' };
        t.nest.hunger = 30; t.nest.condition = 50; t.nest.hpFraction = 0.5; t.nest.spa = null; t.nest.careRequest = null;
        t.nest.collapsed = false; t.nest.collapsedAt = 0; t.nest.weakened = false; t.nest.tired = false; t.nest.dead = false;
      `);
      await page.reload();
      await page.waitForTimeout(1500);
      const cont = page.getByRole('button', { name: '이어하기' });
      if (await cont.count()) { await cont.first().click().catch(() => {}); await page.waitForTimeout(500); }
      const slot = page.locator('.bha-slot').first();
      if (await slot.count()) { await slot.click().catch(() => {}); await page.getByRole('button', { name: '확인' }).click().catch(() => {}); await page.waitForTimeout(2000); }
      // 안내가 가리키는 길(방 → 월드맵 → 온천)을 따라간다
      for (let i = 0; i < 20 && !(await page.locator('.bha-lcd .bha-spa').count()); i++) {
        if (await page.locator('.bha-worldmap [data-place="spa"]').count()) await page.click('.bha-worldmap [data-place="spa"]', { timeout: 2000 }).catch(() => {});
        else if (await page.locator('.bha-prop--outside').count()) await page.locator('.bha-prop--outside').first().click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(900);
      }
      proof.checks.tutorialSpaEntered = await page.locator('.bha-lcd .bha-spa').count() > 0;
      proof.checks['tutorial-spa'] = await waitFull(page, 'tutorial-shinigami', 30000);
      await page.close();
    }
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close();
    srv.stop();
  }
  console.log(JSON.stringify(proof.checks, null, 1));
  console.log('errors', proof.errors);
  process.exit(0);
})();
