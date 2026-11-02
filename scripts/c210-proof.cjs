// C.210 (GDD 133장 2) proof: 세로 폰(390×844)에서 시작 → 가로(844×390) 강제 전환(전체 화면 + 가로 고정 흉내) 뒤 다마고치 기기 화면의 버튼(▲▼✓◀) 자리.
// 그림 기기의 누름 영역(.bha-tama__hit)이 그림 버튼 자리와 같은지 = "그 크기로 처음부터 켠 화면"의 자리와 같은지로 잰다(기기 안 좌표·화면 좌표 모두).
// 장면: ① 세로 → 가로 전환 뒤 켜기 ② 켠 채로 세로 → 가로 ③ 크기가 늦게 바뀜(전환 이벤트 뒤 400ms 에 크기) ④ 가로 → 세로(전체 화면 해제) ⑤ 다시 가로.
// 실행: node scripts/c210-proof.cjs (C210_URL=<주소> 면 그 주소, C210_FACTION=0|1 기본 0). 캡처 docs/captures/c210/
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c210');
const PORT = 5310;
const FI = Number(process.env.C210_FACTION ?? 0);

async function startServer() {
  if (process.env.C210_URL) return { url: process.env.C210_URL, stop: () => {} };
  const p = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe' });
  const url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) return { url, stop: () => p.kill() }; } catch { /* 아직 */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  p.kill();
  throw new Error('vite 서버가 뜨지 않았다');
}

/** 누름 영역 4개의 화면 좌표(가운데) + 조작 줄 자리 */
const measure = () => {
  const out = {};
  for (const h of document.querySelectorAll('.bha-tama__hit')) {
    const r = h.getBoundingClientRect();
    out[h.dataset.hit] = h.hidden ? null : [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2), Math.round(r.width), Math.round(r.height)];
  }
  const names = ['up', 'down', 'ok', 'back'];
  [...document.querySelectorAll('.bha-dev > * .bha-dev__btn, .bha-dev .bha-dev__btn')].slice(0, 4).forEach((b, i) => {
    const r = b.getBoundingClientRect();
    out['css-' + names[i]] = r.width ? [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2), Math.round(r.width), Math.round(r.height)] : null;
  });
  const bar = document.querySelector('.bha-tama__bar');
  const br = bar && !bar.hidden ? bar.getBoundingClientRect() : null;
  out.bar = br ? [Math.round(br.left), Math.round(br.top), Math.round(br.width), Math.round(br.height), bar.dataset.pos] : null;
  out.rotated = document.querySelector('.bha-dev')?.classList.contains('is-rotated') ?? null;
  out.tama = document.documentElement.classList.contains('bha-tama-on');
  return out;
};

const dist = (a, b) => {
  let m = 0;
  for (const k of ['up', 'down', 'ok', 'back', 'css-up', 'css-down', 'css-ok', 'css-back']) {
    if (!a[k] || !b[k]) { if (a[k] !== b[k]) return Infinity; continue; }
    for (let i = 0; i < 4; i++) m = Math.max(m, Math.abs(a[k][i] - b[k][i]));
  }
  if (JSON.stringify(a.bar) !== JSON.stringify(b.bar)) m = Math.max(m, a.bar && b.bar ? Math.max(...a.bar.slice(0, 4).map((v, i) => Math.abs(v - b.bar[i]))) : Infinity);
  return m;
};

/** 헤드리스 창은 진짜 전체 화면이면 크기를 못 바꾸므로 전체 화면 요청은 성공한 척(이벤트만)하고, 크기 바꿈은 rotateTo 가 한다 */
const fakeFs = () => {
  Element.prototype.requestFullscreen = function () { setTimeout(() => document.dispatchEvent(new Event('fullscreenchange')), 0); return Promise.resolve(); };
};
async function newGame(page, url) {
  await page.addInitScript(fakeFs);
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.goto(url);
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
}

/** 그림 기기(DEVICE, 기본 device-zaraki) 를 보유·착용시킨 세이브로 다시 열고 [이어하기] */
const DEVICE = process.env.C210_DEVICE ?? 'device-zaraki';
async function wearDevice(page, url) {
  await page.evaluate((id) => {
    const k = 'bleach-hollow-ascension.save';
    const s = JSON.parse(localStorage.getItem(k));
    const walk = (o) => {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o.cosmetics) && !o.cosmetics.includes(id)) o.cosmetics.push(id);
      if (o.wear && typeof o.wear === 'object' && !Array.isArray(o.wear)) o.wear.device = id;
      for (const v of Object.values(o)) walk(v);
    };
    walk(s);
    localStorage.setItem(k, JSON.stringify(s));
  }, DEVICE);
  await page.goto(url);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '이어하기' }).click();
  await page.waitForTimeout(1800);
  await page.waitForFunction(() => document.querySelector('.bha-dev')?.classList.contains('is-skin'), null, { timeout: 15000 });
}

const setTama = (page, on) => page.evaluate((on) => {
  const k = 'bha-tamago';
  let p = {};
  try { p = JSON.parse(localStorage.getItem(k) || '{}'); } catch { /* */ }
  localStorage.setItem(k, JSON.stringify({ ...p, on }));
  window.dispatchEvent(new CustomEvent('bha-tamago-change'));
}, on);

// 세로 = 주소창 보이는 크기, 가로 = 전체 화면 크기 (C210_SIZE=same 이면 지시의 390×844 ↔ 844×390)
const SAME = process.env.C210_SIZE === 'same';
const P = SAME ? { width: 390, height: 844 } : { width: 412, height: 780 };
const L = SAME ? { width: 844, height: 390 } : { width: 915, height: 412 };

/** 그 크기로 처음부터 켠 화면의 기준 자리 */
async function reference(browser, url, size) {
  console.log('기준', JSON.stringify(size));
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await newGame(page, url);
  if (DEVICE !== 'none') await wearDevice(page, url);
  await setTama(page, true);
  await page.waitForTimeout(1200);
  const m = await page.evaluate(measure);
  await ctx.close();
  return m;
}

/** 전체 화면 전환 흉내: 이벤트(orientationchange·fullscreenchange)가 먼저 오고 크기는 lateMs 뒤에 바뀐다 */
async function rotateTo(page, size, lateMs) {
  await page.evaluate(() => {
    window.dispatchEvent(new Event('orientationchange'));
    document.dispatchEvent(new Event('fullscreenchange'));
  });
  if (lateMs) await page.waitForTimeout(lateMs);
  await page.setViewportSize(size);
  await page.waitForTimeout(1200);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { faction: FI, cases: [] };
  try {
    const refL = await reference(browser, srv.url, L);
    const refP = await reference(browser, srv.url, P);
    proof.refL = refL;
    proof.refP = refP;
    const ctx = await browser.newContext({ viewport: P, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await newGame(page, srv.url);
    if (DEVICE !== 'none') await wearDevice(page, srv.url);
    const step = async (name, ref, shot) => {
      const m = await page.evaluate(measure);
      const d = dist(m, ref);
      proof.cases.push({ name, d, m });
      console.log(`${d <= 2 ? 'OK ' : 'BAD'} ${name} 어긋남 ${d}px`, JSON.stringify(m));
      if (shot) await page.screenshot({ path: path.join(OUT, shot) });
    };
    // ① 세로에서 게임 → 가로 전환(늦은 크기) → 다마고치 켜기
    await rotateTo(page, L, 400);
    await setTama(page, true);
    await page.waitForTimeout(1200);
    await step('세로→가로 전환 뒤 다마고치 켜기', refL, '01-portrait-to-landscape-then-tama.png');
    // ② 켠 채로 가로 → 세로(전체 화면 해제)
    await rotateTo(page, P, 400);
    await step('켠 채 가로→세로(전체 화면 해제)', refP, '02-tama-landscape-to-portrait.png');
    // ③ 켠 채로 세로 → 가로(다시 전체 화면, 늦은 크기)
    await rotateTo(page, L, 400);
    await step('켠 채 세로→가로(다시 전체 화면)', refL, '03-tama-portrait-to-landscape.png');
    // ④ 폰 직접 회전(이벤트와 크기 동시)
    await rotateTo(page, P, 0);
    await rotateTo(page, L, 0);
    await step('폰 직접 회전 세로→가로', refL);
    // ⑤ 끄고 세로 → 가로 → 켜기
    await setTama(page, false);
    await page.waitForTimeout(900);
    await rotateTo(page, P, 0);
    await setTama(page, true);
    await page.waitForTimeout(1200);
    await rotateTo(page, L, 400);
    await step('세로에서 켜고 가로 전환', refL, '04-tama-on-in-portrait-then-landscape.png');
    await ctx.close();
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 1));
    await browser.close();
    srv.stop();
  }
})().catch((e) => { console.error(e); process.exit(1); });
