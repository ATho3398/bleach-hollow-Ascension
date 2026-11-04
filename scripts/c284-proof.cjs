// C.284 proof (GDD 183장 화면 A, 코딩199): 리디자인 v2 — 방 · 월드맵 · 시장 · 온천 두 종족 캡처.
// 방(첫 초점) · 방 책장 초점 · 방 더보기 펼침 · 뼈 껍데기 꾸미기 방 · 월드맵 · 시장 · 온천(가득) +
// 세이브를 고쳐(떠돌이 상인 와 있음 · 체력 50%) 월드맵 '상인' 배지 · 시장 '왔다' 배지 · 온천(차오르는 중) · 빈사 방(상태이상 칩) · 사망 방([부활]).
// 화면마다 LCD 안 글자 넘침 개수도 센다. 캡처 1배 844×390 docs/captures/c284/
// 실행: node scripts/c284-proof.cjs (C284_URL=<주소>, C284_FACTIONS=0,1)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c284');
const PORT = 5384;
const FACTIONS = (process.env.C284_FACTIONS ?? '0,1').split(',').map(Number);

async function startServer() {
  if (process.env.C284_URL) return { url: process.env.C284_URL, stop: () => {} };
  const p = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe', detached: true });
  const url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) return { url, stop: () => { try { process.kill(-p.pid); } catch { /* */ } } }; } catch { /* */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite 서버가 뜨지 않았다');
}

const overflowInPage = () => [...document.querySelectorAll('.bha-lcd button, .bha-lcd .bha-chip, .bha-lcd .bha-num, .bha-lcd .bha-plate, .bha-lcd [class*="__tag"], .bha-lcd [class*="__name"]')]
  .filter((e) => {
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(e);
    return e.scrollWidth > e.clientWidth + 1 && cs.overflowX !== 'visible' && cs.textOverflow !== 'ellipsis';
  })
  .map((e) => `${String(e.className).split(' ')[0]} '${(e.textContent || '').trim().slice(0, 16)}' ${e.scrollWidth}>${e.clientWidth}`);

/** 화면 A 의 숫자·글자 크기·터치 크기 점검 (PROMPT 7절): 12px 미만 글자 · 36px 미만 누를 것 */
const sizeAudit = () => {
  const lcd = document.querySelector('.bha-lcd');
  if (!lcd) return { small: [], tiny: [] };
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1 && getComputedStyle(e).visibility !== 'hidden'; };
  const small = [...lcd.querySelectorAll('.bha-app *')].filter((e) => vis(e) && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12)
    .map((e) => `${String(e.className).split(' ')[0] || e.tagName} '${e.textContent.trim().slice(0, 10)}' ${getComputedStyle(e).fontSize}`);
  const tiny = [...lcd.querySelectorAll('.bha-app button:not([disabled])')].filter(vis).filter((e) => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height) < 35.5; })
    .map((e) => `${String(e.className).split(' ')[0]} '${(e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 10)}' ${Math.round(e.getBoundingClientRect().width)}×${Math.round(e.getBoundingClientRect().height)}`);
  return { small, tiny };
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { shots: [], overflow: {}, sizes: {}, errors: [] };
  try {
    for (const fi of FACTIONS) {
      const fname = fi === 0 ? 'hollow' : 'shinigami';
      const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
      page.on('pageerror', (e) => proof.errors.push(`${fname}: ${e.message}`));
      const wait = (ms) => page.waitForTimeout(ms);
      const shot = async (name) => {
        await wait(500);
        const file = `${fname}-${name}.png`;
        await page.screenshot({ path: path.join(OUT, file) });
        proof.shots.push(file);
        proof.overflow[file] = await page.evaluate(overflowInPage);
        proof.sizes[file] = await page.evaluate(sizeAudit);
        console.log(file, proof.overflow[file].length, proof.sizes[file].small.length, proof.sizes[file].tiny.length);
      };
      const toRoom = async () => {
        await page.goto(`${srv.url}?test=1`);
        await wait(1200);
        await page.getByRole('button', { name: '이어하기' }).first().click();
        await wait(2500);
      };
      /** 테스트 세이브를 고친다 (화면 확인용 — 게임 코드는 그대로) */
      const editSave = (fn) => page.evaluate((src) => {
        const k = Object.keys(localStorage).find((x) => x.startsWith('bha-save') && !x.endsWith('.slots'));
        const s = JSON.parse(localStorage.getItem(k));
        new Function('s', src)(s);
        localStorage.setItem(k, JSON.stringify(s));
      }, fn);
      const step = async (label, fn) => { try { await fn(); } catch (e) { proof.errors.push(`${fname} ${label}: ${String(e.message).split('\n')[0]}`); await toRoom(); } };
      await page.goto(`${srv.url}?test=1`);
      await page.evaluate(() => localStorage.clear());
      await page.goto(`${srv.url}?test=1`);
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
      await wait(2500);
      await step('방', async () => shot('1-room'));
      await step('방 책장 초점', async () => {
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('ArrowDown');
        await shot('1b-room-focus-book');
      });
      await step('방 더보기', async () => {
        await page.getByRole('button', { name: '더보기' }).first().click();
        await shot('1c-room-more');
        await page.keyboard.press('Escape');
        await wait(300);
      });
      await step('꾸미기 방', async () => {
        await page.evaluate(() => {
          const r = document.documentElement;
          r.dataset.cosShell = 'bone';
          for (const p of ['body', 'line', 'lcd']) r.style.setProperty(`--cos-shell-${p}`, `var(--bha-cos-shell-bone-${p})`);
        });
        await shot('1d-room-shell-bone');
        await page.evaluate(() => {
          const r = document.documentElement;
          delete r.dataset.cosShell;
          for (const p of ['body', 'line', 'lcd']) r.style.removeProperty(`--cos-shell-${p}`);
        });
      });
      await step('월드맵', async () => {
        await page.locator('.bha-prop--outside').first().click();
        await wait(2200);
        await shot('2-worldmap');
      });
      await step('시장', async () => {
        await page.locator('.bha-worldmap [data-place="market"]').first().click();
        await wait(2200);
        await shot('3-market');
        await page.keyboard.press('Escape');
        await wait(1500);
      });
      await step('온천 가득', async () => {
        await page.locator('.bha-worldmap [data-place="spa"]').first().click();
        await wait(1200);
        await shot('5-spa-full');
      });
      // 떠돌이 상인 와 있음 · 체력 50% (온천에서 차오르는 중)
      await step('상인·체력 50%', async () => {
        await toRoom();
        await editSave(`s.shared.wanderer.visit = { at: Date.now(), runId: 0, tier: 1, stock: [{ itemId: 'w-snack-crate', price: 10, sold: false }] }; s.nest.hpFraction = 0.5; s.nest.hpAt = Date.now();`);
        await toRoom();
        await shot('1e-room-hp50');
        await page.locator('.bha-prop--outside').first().click();
        await wait(2200);
        await shot('2b-worldmap-wanderer');
        await page.locator('.bha-worldmap [data-place="market"]').first().click();
        await wait(2200);
        await shot('3b-market-wanderer');
        await page.keyboard.press('Escape');
        await wait(1500);
        await page.locator('.bha-worldmap [data-place="spa"]').first().click();
        await wait(3200);
        await shot('5b-spa-resting');
      });
      await step('빈사 방', async () => {
        await toRoom();
        await editSave(`s.nest.spa = null; s.nest.collapsed = true; s.nest.collapsedAt = Date.now(); s.nest.hpFraction = 0.1; s.nest.tired = true;`);
        await toRoom();
        await shot('1f-room-dying');
      });
      await step('사망 방', async () => {
        await editSave(`s.nest.dead = true;`);
        await toRoom();
        await shot('1g-room-dead');
      });
      await page.close();
    }
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close();
    srv.stop();
  }
})();
