// C.282 proof (GDD 183장 1 ①, 코딩195): 리디자인 v2 공용 부품 적용 뒤 두 종족 화면 캡처.
// 방 · 월드맵 · 상점 상세 창 · 전투 · 흡수 · 가방 · 상태 · 설정 + 기기 껍데기 꾸미기(뼈) 낀 방. 테스트 모드(?test=1, 튜토리얼 없음).
// 화면마다 LCD 안 글자 넘침(가로 잘림) 개수도 센다. 캡처 1배 844×390 docs/captures/c282/
// 실행: node scripts/c282-proof.cjs (C282_URL=<주소>, C282_FACTIONS=0,1)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c282');
const PORT = 5381;
const FACTIONS = (process.env.C282_FACTIONS ?? '0,1').split(',').map(Number);

async function startServer() {
  if (process.env.C282_URL) return { url: process.env.C282_URL, stop: () => {} };
  const p = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe', detached: true });
  const url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) return { url, stop: () => { try { process.kill(-p.pid); } catch { /* */ } } }; } catch { /* */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite 서버가 뜨지 않았다');
}

/** LCD 안 보이는 글자 요소 중 가로로 잘린 것 (scrollWidth > clientWidth + 1, overflow 숨김) */
const overflowInPage = () => [...document.querySelectorAll('.bha-lcd button, .bha-lcd .bha-chip, .bha-lcd .bha-num, .bha-lcd .bha-meter__value, .bha-lcd [class*="__name"], .bha-lcd [class*="__label"]')]
  .filter((e) => {
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(e);
    return e.scrollWidth > e.clientWidth + 1 && cs.overflowX !== 'visible' && cs.textOverflow !== 'ellipsis';
  })
  .map((e) => `${e.className.split(' ')[0]} '${(e.textContent || '').trim().slice(0, 16)}' ${e.scrollWidth}>${e.clientWidth}`);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { shots: [], overflow: {}, errors: [] };
  try {
    for (const fi of FACTIONS) {
      const fname = fi === 0 ? 'hollow' : 'shinigami';
      const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
      page.on('pageerror', (e) => proof.errors.push(`${fname}: ${e.message}`));
      const wait = (ms) => page.waitForTimeout(ms);
      const esc = async (n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press('Escape'); await wait(250); } };
      const shot = async (name) => {
        await wait(400);
        const file = `${fname}-${name}.png`;
        await page.screenshot({ path: path.join(OUT, file) });
        proof.shots.push(file);
        proof.overflow[file] = await page.evaluate(overflowInPage);
        console.log(file, proof.overflow[file].length);
      };
      // 앞 화면 상태와 무관하게 방으로: 다시 열고 [이어하기] (테스트 세이브 그대로)
      const toRoom = async () => {
        await page.goto(`${srv.url}?test=1`);
        await wait(1200);
        await page.getByRole('button', { name: '이어하기' }).first().click();
        await wait(2500);
      };
      const step = async (label, fn) => { try { await fn(); } catch (e) { proof.errors.push(`${fname} ${label}: ${String(e.message).split('\n')[0]}`); await toRoom(); } };
      // 새 게임 (테스트 모드)
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
      await step('꾸미기 방', async () => {
        // 기기 껍데기 꾸미기(뼈)를 입은 상태 = cosmetics.ts applyCosmetics 와 같은 루트 표시
        await page.evaluate(() => {
          const r = document.documentElement;
          r.dataset.cosShell = 'bone';
          for (const p of ['body', 'line', 'lcd']) r.style.setProperty(`--cos-shell-${p}`, `var(--bha-cos-shell-bone-${p})`);
        });
        await shot('9-room-shell-bone');
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
        await toRoom();
      });
      await step('상점 상세', async () => {
        await page.locator('.bha-prop--outside').first().click();
        await wait(900);
        await page.locator('.bha-worldmap [data-place="market"]').first().click();
        await wait(2200);
        await page.locator('.bha-market [data-spot="shop"]').first().click();
        await wait(900);
        await page.locator('.bha-lcd .bha-itemcard').first().click();
        await wait(700);
        await shot('3-shop-detail');
        await toRoom();
      });
      await step('가방', async () => {
        await page.locator('.bha-prop--chest').first().click();
        await wait(900);
        await shot('6-bag');
        await toRoom();
      });
      await step('상태', async () => {
        await page.locator('.bha-room__status').first().click();
        await wait(900);
        await shot('7-status');
        await toRoom();
      });
      await step('설정', async () => {
        await page.getByRole('button', { name: '더보기' }).first().click();
        await wait(300);
        await page.locator('.bha-homedock__tray').getByRole('button', { name: '설정' }).first().click();
        await wait(900);
        await shot('8-settings');
        await esc(1);
        await toRoom();
      });
      await step('전투', async () => {
        // 앞 화면 상태와 무관하게 방에서 시작: 다시 열고 [이어하기]
        await page.goto(`${srv.url}?test=1`);
        await wait(1200);
        await page.getByRole('button', { name: '이어하기' }).first().click();
        await wait(2500);
        await page.locator('.bha-prop--outside').first().click();
        await wait(900);
        await page.locator('.bha-worldmap [data-place="adventure"]').first().click();
        await wait(2200);
        await page.locator('.bha-lcd').getByRole('button', { name: '★1', exact: true }).first().click();
        await wait(400);
        await page.locator('.bha-lcd').getByRole('button', { name: '출발', exact: true }).first().click();
        await page.locator('.bha-battle').waitFor({ timeout: 60_000 });
        await wait(4000);
        await shot('4-battle');
      });
      await step('흡수', async () => {
        const go = page.getByRole('button', { name: /하러 가기$/ });
        await go.first().waitFor({ timeout: 180_000 });
        await go.first().click();
        await wait(1500);
        await shot('5-absorb');
      });
      await page.close();
    }
  } catch (e) {
    proof.errors.push(String((e && e.stack) || e));
  } finally {
    await browser.close();
    srv.stop();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof.errors, null, 1));
})();
