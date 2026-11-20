// C.509 proof (점검B 코드 개선): 빌드 결과물(vite preview)로 ① 첫 화면 + 동작 덩어리 따로 받기 + 오프라인 다시 열기 ② 튜토리얼 시작
// ③ 전투 1판(이치고 종이인형이 그려지는지) ④ 모험 준비(타일 배치) 화면을 여러 번 열고 닫아도 window pointermove 리스너 수가 늘지 않는지(CDP). PC 844×390 1배 3장.
// 실행: npm run build && node scripts/c509-proof.cjs [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs/captures/c509'));
const PORT = 4791;
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function preview() {
  const p = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe', detached: true });
  const url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url)).ok) return { url, stop: () => { try { process.kill(-p.pid); } catch { /* */ } } }; } catch { /* */ }
    await wait(500);
  }
  throw new Error('vite preview 가 뜨지 않았다');
}
async function skipTut(page) {
  for (let t = 0; t < 40 && (await page.locator('.bha-tut').count()); t++) {
    const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled])').filter({ visible: true });
    if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
    else await page.locator('.bha-lcd').first().click({ timeout: 2000 }).catch(() => {});
    await wait(400);
  }
}
async function newGame(page, url, { test = false, skip = true } = {}) {
  const u = test ? `${url}?test=1` : url;
  await page.goto(u);
  await page.evaluate(() => localStorage.clear());
  await page.goto(u);
  await wait(1500);
  const noLogin = page.getByRole('button', { name: '로그인 없이 하기' }).filter({ visible: true });
  if (await noLogin.count()) { await noLogin.first().click(); await wait(500); }
  await page.getByRole('button', { name: '새로 시작' }).click();
  await wait(300);
  await page.locator('.bha-slot').first().click();
  await page.getByRole('button', { name: '확인' }).click();
  await wait(300);
  await page.locator('.bha-species__card').nth(0).click();
  await wait(300);
  await page.getByRole('button', { name: '네', exact: true }).click();
  await wait(400);
  const nm = page.locator('[data-ident="name"]');
  if (await nm.count()) {
    await nm.fill('권영');
    await nm.press('Enter');
    await wait(300);
    await page.locator('.bha-ident__gender[data-gender="male"]').click();
    await page.locator('.bha-ident .bha-btn--primary').last().click();
  }
  await wait(2500);
  if (skip) await skipTut(page);
}
async function back(page) {
  await page.locator('.bha-dev__btn[aria-label="취소"]').first().click({ timeout: 2000 }).catch(() => {});
  await wait(700);
  const no = page.getByRole('button', { name: '아니요', exact: true }).filter({ visible: true });
  if (await no.count()) { await no.first().click({ timeout: 2000 }).catch(() => {}); await wait(400); }
}
async function openTest(page, tabName) {
  await page.getByRole('button', { name: /더보기/ }).first().click({ timeout: 3000 });
  await wait(400);
  await page.getByRole('button', { name: '테스트', exact: true }).first().click({ timeout: 3000 });
  await wait(700);
  await page.locator('.bha-test-page .bha-viewtitle, .bha-test-page [aria-haspopup]').first().click({ timeout: 2000 }).catch(() => {});
  await wait(300);
  await page.getByRole('option', { name: tabName }).or(page.getByRole('menuitemradio', { name: tabName })).or(page.getByRole('button', { name: tabName })).first().click({ timeout: 3000 });
  await wait(600);
}
const dollInk = (page) => page.evaluate(() => [...document.querySelectorAll('canvas.bha-rigcanvas')].map((c) => {
  let ink = 0;
  try { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i]) ink++; } catch { /* */ }
  return ink;
}));
/** CDP: window 에 걸린 pointermove 리스너 수 */
async function windowPointerListeners(page) {
  const cdp = await page.context().newCDPSession(page);
  const { result } = await cdp.send('Runtime.evaluate', { expression: 'window' });
  const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
  await cdp.detach();
  return listeners.filter((l) => /^pointer(move|up|cancel)$/.test(l.type)).length;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await preview();
  const browser = await chromium.launch();
  const proof = { errors: [], warnings: [], shots: [], facts: {} };
  const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  const step = async (name, fn) => { try { await fn(); } catch (e) { proof.errors.push(`${name}: ${String(e).slice(0, 300)}`); } };
  const watch = (page, tag) => {
    page.on('pageerror', (e) => proof.errors.push(`${tag}: ${e.message.slice(0, 200)}`));
    page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') proof.warnings.push(`${tag}: ${m.text().slice(0, 160)}`); });
  };
  try {
    // ① 첫 화면 + 동작 덩어리 + 오프라인 다시 열기
    {
      const ctx = await browser.newContext(PC);
      const page = await ctx.newPage();
      watch(page, 'title');
      const chunks = [];
      page.on('request', (r) => { const m = r.url().match(/assets\/([A-Za-z]+)-[^/]+\.js$/); if (m) chunks.push(m[1]); });
      await step('title', async () => {
        await page.goto(server.url);
        await page.getByRole('button', { name: '새로 시작' }).waitFor({ timeout: 15000 });
        proof.facts.chunksOnFirstLoad = [...new Set(chunks)];
        await shot(page, '01-pc-title');
        await page.waitForFunction(() => navigator.serviceWorker?.controller || navigator.serviceWorker?.ready.then(() => true), null, { timeout: 15000 }).catch(() => {});
        await page.reload();
        await wait(2500); // 워커가 미리 캐시를 채울 시간
        await ctx.setOffline(true);
        await page.reload();
        await page.getByRole('button', { name: '새로 시작' }).waitFor({ timeout: 15000 });
        proof.facts.offlineTitle = true;
        await ctx.setOffline(false);
      });
      await ctx.close();
    }
    // ② 튜토리얼 시작 (일반 모드 새 세이브)
    {
      const ctx = await browser.newContext(PC);
      const page = await ctx.newPage();
      watch(page, 'tutorial');
      await step('tutorial', async () => {
        await newGame(page, server.url, { skip: false });
        // 탄생 연출('화면을 누르면 건너뛰기') → 튜토리얼 첫 카드
        for (let t = 0; t < 20 && !(await page.locator('.bha-tut').count()); t++) {
          await page.locator('.bha-lcd').first().click({ timeout: 2000 }).catch(() => {});
          await wait(700);
        }
        proof.facts.tutorialShown = (await page.locator('.bha-tut').count()) > 0;
        proof.facts.roomDollInk = await dollInk(page);
        await shot(page, '02-pc-tutorial-start');
      });
      await ctx.close();
    }
    // ③ 전투 1판 — 이치고(초월자) 종이인형 ④ 타일 배치 화면 열고 닫기 반복 리스너 수
    {
      const ctx = await browser.newContext(PC);
      const page = await ctx.newPage();
      watch(page, 'battle');
      await newGame(page, server.url, { test: true });
      await step('plan-listeners', async () => {
        const counts = [await windowPointerListeners(page)];
        for (let i = 0; i < 4; i++) {
          // 가방 > 타일 > [타일 배치] = 배치판(roadPlanner)이 있는 모험 준비 화면
          await page.locator('.bha-prop--chest').first().click({ timeout: 3000 });
          await wait(800);
          await page.locator('[role="tab"][data-tab="tiles"]').first().click({ timeout: 3000 });
          await wait(400);
          await page.locator('[data-sc="tile-place"]').click({ timeout: 3000 });
          await wait(900);
          proof.facts.planHasRoad = (await page.locator('.bha-road').count()) > 0;
          if (i === 0) {
            // 끌기 한 번(누름 → 움직임 → 뗌): 누르는 동안만 걸리고 떼면 풀린다
            const card = page.locator('.bha-road [data-drag], .bha-tilecard[data-drag]').first();
            if (await card.count()) {
              const b = await card.boundingBox();
              await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
              await page.mouse.down();
              proof.facts.listenersWhilePressed = await windowPointerListeners(page);
              await page.mouse.move(b.x + b.width / 2, b.y - 40, { steps: 4 });
              await page.mouse.up();
              await wait(300);
            }
          }
          counts.push(await windowPointerListeners(page));
          await back(page);
          await back(page);
          await back(page);
          await wait(800);
        }
        counts.push(await windowPointerListeners(page));
        proof.facts.windowPointerListeners = counts; // 열 때마다 같아야 한다(옛: 3개씩 늘었다)
      });
      await step('battle-ichigo', async () => {
        await openTest(page, '붕옥·초월자');
        await page.getByRole('button', { name: /^이치고/ }).first().click({ timeout: 3000 });
        await wait(2500);
        await skipTut(page);
        // 천년혈전 모드 = 혈쇄 이치고 종이인형 (C.465 proof 와 같은 길 — 기본 모드 전투는 기준 빌드도 내 자리가 점선 상자)
        await page.locator('.bha-room__status').first().click({ timeout: 4000 });
        await wait(1000);
        const seg = page.locator('[data-sc="kit-mode-tybw"]').first();
        await seg.scrollIntoViewIfNeeded().catch(() => {});
        await seg.click({ timeout: 3000 });
        await wait(1000);
        await back(page);
        await wait(1000);
        await openTest(page, '바로 전투');
        await page.getByRole('button', { name: '전투 들어가기' }).first().click({ timeout: 3000 });
        await wait(800);
        const ok = page.getByRole('button', { name: '확인', exact: true }).filter({ visible: true });
        if (await ok.count()) await ok.last().click({ timeout: 3000 });
        await page.waitForFunction(() => !!window.__bhaCombat && window.__bhaCombat.tick > 5, null, { timeout: 15000 });
        await wait(1500);
        proof.facts.midDollInk = await dollInk(page);
        await shot(page, '03-pc-battle-ichigo');
        await page.waitForFunction(() => window.__bhaCombat.enemy.hp <= 0 || window.__bhaCombat.tick > 600, null, { timeout: 60000 }).catch(() => {});
        await wait(600);
        proof.facts.battle = await page.evaluate(() => ({ tick: window.__bhaCombat.tick, enemyHp: Math.round(window.__bhaCombat.enemy.hp), playerHp: Math.round(window.__bhaCombat.player.hp) }));
        proof.facts.battleDollInk = await dollInk(page);
      });
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.stop();
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 1));
    console.log(JSON.stringify(proof, null, 1));
  }
})();
