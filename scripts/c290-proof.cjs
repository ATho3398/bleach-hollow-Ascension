// 리디자인 v2 화면 F (GDD 183장, 코딩204, C.290) proof: 상태·설정·책장(진화체 도감·칭호 도감)·진급 시험·수련장·훈련 인형·도전의 탑·스토리·대화창 두 종족 캡처.
// 테스트 모드(?test=1, 튜토리얼 없음). 화면마다 LCD 안 글자 넘침(가로 잘림)과 12px 미만 글자 수를 센다. 캡처 1배 844×390.
// 실행: node scripts/c290-proof.cjs (F204_URL=<주소>, F204_OUT=docs/captures/cNNN, F204_FACTIONS=0,1, F204_ONLY=status,settings)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, process.env.F204_OUT ?? 'docs/captures/c290');
const PORT = 5391;
const FACTIONS = (process.env.F204_FACTIONS ?? '0,1').split(',').map(Number);
const ONLY = process.env.F204_ONLY ? process.env.F204_ONLY.split(',') : null;

async function startServer() {
  if (process.env.F204_URL) return { url: process.env.F204_URL, stop: () => {} };
  const p = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe', detached: true });
  const url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) return { url, stop: () => { try { process.kill(-p.pid); } catch { /* */ } } }; } catch { /* */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite 서버가 뜨지 않았다');
}

/** LCD 안 보이는 글자 중 가로로 잘린 것 + 12px 미만 글자 */
const checkPage = () => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width >= 2 && r.height >= 2; };
  const over = [...document.querySelectorAll('.bha-lcd button, .bha-lcd .bha-chip, .bha-lcd .bha-num, .bha-lcd .bha-meter__value, .bha-lcd [class*="__name"], .bha-lcd [class*="__label"]')]
    .filter((e) => vis(e) && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'visible' && getComputedStyle(e).textOverflow !== 'ellipsis')
    .map((e) => `${String(e.className).split(' ')[0]} '${(e.textContent || '').trim().slice(0, 16)}' ${e.scrollWidth}>${e.clientWidth}`);
  const small = [...document.querySelectorAll('.bha-lcd *')]
    .filter((e) => vis(e) && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12)
    .map((e) => `${String(e.className).split(' ')[0] || e.tagName} '${(e.textContent || '').trim().slice(0, 12)}' ${getComputedStyle(e).fontSize}`);
  return { over, small };
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { shots: [], check: {}, errors: [] };
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
        proof.check[file] = await page.evaluate(checkPage);
        console.log(file, proof.check[file].over.length, proof.check[file].small.length);
      };
      const toRoom = async () => {
        await page.goto(`${srv.url}?test=1`);
        await wait(1200);
        await page.getByRole('button', { name: '이어하기' }).first().click();
        await wait(2200);
      };
      const want = (k) => !ONLY || ONLY.includes(k);
      const step = async (key, fn) => { if (!want(key)) return; try { await fn(); } catch (e) { proof.errors.push(`${fname} ${key}: ${String(e.message).split('\n')[0]}`); await page.screenshot({ path: path.join(OUT, `err-${fname}-${key}.png`) }); } await toRoom(); };
      const toWorld = async () => { await page.locator('.bha-prop--outside').first().click(); await wait(1500); };
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
      await step('status', async () => {
        await page.locator('.bha-room__status').first().click();
        await wait(900);
        await shot('15-status');
        // 능력치 ⓘ 창 (시안 장면: 힘 ⓘ)
        await page.locator('.bha-care-page .bha-stats .bha-info').nth(1).click();
        await shot('15-status-info');
      });
      await step('settings', async () => {
        await page.getByRole('button', { name: '더보기' }).first().click();
        await wait(300);
        await page.locator('.bha-homedock__tray').getByRole('button', { name: '설정' }).first().click();
        await wait(900);
        for (const [i, t] of ['화면', '소리', '전투', '기타'].entries()) {
          await page.locator('.bha-settings-page').getByRole('tab', { name: t }).first().click().catch(() => page.locator('.bha-settings-page').getByRole('button', { name: t }).first().click());
          await wait(300);
          await shot(`16-settings-${i + 1}`);
        }
        await esc(1);
      });
      await step('dex', async () => {
        await page.locator('.bha-prop--book').first().click();
        await wait(900);
        await shot('17-dex');
        await page.locator('.bha-viewtitle__btn').first().click();
        await wait(300);
        await page.locator('.bha-viewtitle__item').nth(1).click();
        await wait(600);
        await shot('18-titles');
      });
      await step('rank', async () => {
        await page.locator('.bha-prop--rank').first().click();
        await wait(900);
        await shot('19-rank');
      });
      await step('training', async () => {
        await toWorld();
        await page.locator('.bha-worldmap [data-place="training"]').first().click();
        await wait(1500);
        await shot('20-training');
        // 한 판 장면 (첫 종목 카드)
        await page.locator('.bha-train__card').first().click();
        await wait(500);
        await page.locator('.bha-lcd').getByRole('button', { name: '시작', exact: true }).last().click();
        await wait(2600);
        await shot('20-training-play');
        await esc(1);
        await wait(600);
        await toRoom();
        await toWorld();
        await page.locator('.bha-worldmap [data-place="training"]').first().click();
        await wait(1500);
        await page.locator('.bha-viewtitle__btn').first().click();
        await wait(300);
        await page.locator('.bha-viewtitle__item', { hasText: '훈련 인형' }).first().click();
        await wait(1000);
        await shot('21-practice');
      });
      await step('tower', async () => {
        await toWorld();
        await page.locator('.bha-worldmap [data-place="tower"]').first().click();
        await wait(1500);
        await shot('22-tower');
      });
      await step('story', async () => {
        await toWorld();
        await page.locator('.bha-worldmap [data-place="adventure"]').first().click();
        await wait(1500);
        await page.locator('.bha-depart-tabs .bha-viewtitle__btn').first().click();
        await wait(300);
        await page.locator('.bha-viewtitle__item').nth(1).click();
        await wait(900);
        await shot('23-story');
        // 잠긴 장·화: 테스트 세이브를 2단계 · 스토리 진행 없음으로 바꿔 다시 연다 (캡처 전용)
        await page.evaluate(() => {
          const k = 'bha-save-test';
          const raw = JSON.parse(localStorage.getItem(k));
          const s = raw.save ?? raw.data ?? raw;
          s.evolution.tierIndex = 1;
          for (const f of Object.keys(s.story ?? {})) s.story[f] = { ...s.story[f], cleared: {}, chapters: [] };
          localStorage.setItem(k, JSON.stringify(raw));
        });
        await toRoom();
        await toWorld();
        await page.locator('.bha-worldmap [data-place="adventure"]').first().click();
        await wait(1500);
        await page.locator('.bha-depart-tabs .bha-viewtitle__btn').first().click();
        await wait(300);
        await page.locator('.bha-viewtitle__item').nth(1).click();
        await wait(900);
        await page.locator('.bha-story [data-locked]').first().click({ force: true });
        await wait(300);
        await shot('23-story-locked');
        await page.locator('.bha-story .bha-mdrow').last().click();
        await wait(400);
        await shot('23-story-locked-chapter');
        // 대화창: 첫 장 첫 화 [도전]
        await page.locator('.bha-story .bha-mdrow').first().click();
        await wait(300);
        await page.locator('.bha-story [data-go]').first().click();
        await wait(1500);
        await shot('24-dialogue');
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
