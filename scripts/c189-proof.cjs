// 코딩189 proof (GDD 176장 문구·표시): 사신 결과·상태 가진 것·흡수 노력치 가득·회복 5/7·빈사 시간·특성 상점·진화 결과·백업. 1배 844×390. 실행: C189_OUT=docs/captures/<패치> node scripts/c189-proof.cjs
// 새 게임(?test=1) → 안내 끝낸 저장 → 모험 ★1 → 흡수 화면: 갈래 4개 고르기(손가락·기기 ▲▼) → 원정 중간 저장 고쳐 다시 열기(한계 경고·첫 흡수 연습). 캡처 docs/captures/c244/ (1배 844×390). 실행: node scripts/c244-proof.cjs
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, process.env.C189_OUT ?? 'docs/captures/c189');
const PORT = 5389;

async function startServer() {
  if (process.env.C189_URL) return { url: process.env.C189_URL, stop: () => {} };
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
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const proof = { shots: [], errors, trace: [], text: {} };
  const shot = async (name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  const lcdText = () => page.evaluate(() => document.querySelector('.bha-lcd')?.innerText ?? '');
  const vis = (loc) => loc.filter({ visible: true });
  const toRoom = async () => { for (let i = 0; i < 6 && !(await page.locator('.bha-lcd .bha-room').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); } };
  try {
    // C189_MODE=normal: 테스트 모드 밖 새 게임(결과·진화·백업 — 시드·런 로그 줄이 없고 백업 메뉴가 보인다). 기본 = 테스트 모드(상태·상점·흡수·빈사·회복 안내)
    const NORMAL = process.env.C189_MODE === 'normal';
    const Q = NORMAL ? '?test=0' : '?test=1';
    await page.goto(`${srv.url}${Q}`);
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${srv.url}${Q}`);
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: '새로 시작' }).click();
    await page.waitForTimeout(300);
    await page.locator('.bha-slot').first().click();
    await page.getByRole('button', { name: '확인' }).click();
    await page.waitForTimeout(300);
    await page.locator('.bha-species__card').nth(1).click(); // 사신
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '시작', exact: true }).click();
    await page.waitForTimeout(2000);
    await skipTut(page);
    // 안내 끝 + 노력치 가득(흡수 노력치 가득) + 걸음 많이(귀환 때 진화) + 먹을 것
    await patchSave(page, `
      t.help.guides = { ...t.help.guides, 'first-run': 'done', 'home-intro': 'done', 'first-run-room': 'done', 'birth': 'done', 'recover': 'done' };
      for (const k of Object.keys(t.evolution.ev)) t.evolution.ev[k] = 9999;
      if (${NORMAL}) { t.evolution.tierIndex = 2; t.evolution.steps = 84; } // 4단계 진화 걸음(85) 바로 앞 — 이번 모험에서 넘겨 귀환 때 진화 (테스트 모드 새 게임은 이미 마지막 단계)
      for (const k of Object.keys(shared.food)) shared.food[k] = 3;
      shared.tradeCoins = 5000;
    `);
    await reopen(page);
    if (!NORMAL) {
    // 2 상태 화면 가진 것
    await page.locator('.bha-room__status').first().click({ timeout: 3000 }).catch((e) => proof.trace.push(['status', String(e).slice(0, 120)]));
    // (상태 화면에서 방으로는 다시 열기로 — Esc 가 방에서 '처음 화면으로' 창을 연다)
    await page.waitForTimeout(900);
    await page.evaluate(() => { const p = [...document.querySelectorAll('.bha-lcd [aria-label="가진 것"]')][0]; p?.scrollIntoView({ block: 'center' }); });
    await page.waitForTimeout(300);
    proof.text.holdings = await page.evaluate(() => document.querySelector('.bha-lcd [aria-label="가진 것"]')?.innerText ?? null);
    await shot('02-shinigami-status-holdings');
    await reopen(page);
    // 6 특성 상점
    await page.locator('.bha-prop--outside').first().click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await page.locator('.bha-worldmap [data-place="market"]').click({ timeout: 4000 }).catch((e) => proof.trace.push(['market', String(e).slice(0, 120)]));
    await page.waitForTimeout(1500);
    await skipTut(page);
    await page.locator('.bha-lcd [data-spot="traitShop"]').first().click({ timeout: 4000 }).catch((e) => proof.trace.push(['traitShop', String(e).slice(0, 120)]));
    await page.waitForTimeout(1200);
    await skipTut(page);
    proof.text.traitShop = await lcdText();
    await shot('06-trait-shop');
    await reopen(page);
    } // !NORMAL
    if (NORMAL) {
    // 모험 출발 → 흡수 노력치 가득
    await page.locator('.bha-prop--outside').first().click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await page.locator('.bha-worldmap [data-place="adventure"]').click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await skipTut(page);
    proof.text.adv = await lcdText();
    for (let i = 0; i < 6 && (await page.locator('.bha-lcd [data-dev-layer]').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
    await page.locator('.bha-lcd').getByRole('button', { name: '★1', exact: true }).click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(500);
    await page.locator('.bha-lcd [data-sc="go"]').first().click({ timeout: 3000 }).catch(() => proof.trace.push(['no-depart']));
    await page.waitForTimeout(1200);
    // 빈 길 확인 창 등: 보이는 확인 버튼을 누른다
    for (let i = 0; i < 3 && (await page.locator('.bha-lcd [data-sc="go"]').count()); i++) {
      const yes = vis(page.locator('.bha-lcd [role="dialog"] .bha-btn--primary, .bha-lcd [data-dev-layer] .bha-btn--primary'));
      proof.trace.push(['depart-dialog', await page.evaluate(() => document.querySelector('.bha-lcd [role="dialog"], .bha-lcd [data-dev-layer]')?.innerText?.slice(0, 200) ?? null)]);
      if (await yes.count()) await yes.first().click({ timeout: 2000 }).catch(() => {});
      else await page.locator('.bha-lcd [data-sc="go"]').first().click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(1200);
    }
    let absorbShot = false;
    for (let t = 0; t < 700; t++) {
      if (await vis(page.getByRole('button', { name: '귀환', exact: true })).count()) break;
      const layerGo = vis(page.locator('.bha-lcd [data-dev-layer] button.bha-btn--primary, .bha-lcd [data-dev-layer] button.bha-btn--danger'));
      const eat = vis(page.getByRole('button', { name: /하러 가기$/ }));
      if (await page.locator('.bha-absorbpage').count()) {
        if (!absorbShot && (await page.locator('.bha-absorbpage button[data-mode="stat"]').count())) {
          absorbShot = true;
          await page.locator('.bha-absorbpage button[data-mode="stat"]').click({ force: true });
          await page.waitForTimeout(300);
          proof.text.absorb = await page.evaluate(() => ({ desc: [...document.querySelectorAll('.bha-absorbpage .bha-absorb__desc p')].map((p) => p.textContent), dim: document.querySelector('.bha-absorbpage button[data-mode="stat"]')?.getAttribute('aria-disabled') }));
          await shot('03-absorb-ev-full');
          await page.locator('.bha-absorbpage [data-absorb-go]').click().catch(() => {});
          await page.waitForTimeout(400);
          proof.text.absorbToast = await page.evaluate(() => [...document.querySelectorAll('.bha-toast')].map((x) => x.innerText));
          continue;
        }
        const go = vis(page.locator('.bha-lcd .bha-absorbpage [data-absorb-go]'));
        const slot = vis(page.locator('.bha-lcd .bha-absorbpage .bha-slot'));
        const cand = vis(page.locator('.bha-lcd .bha-cand'));
        if (await layerGo.count()) await layerGo.first().click({ timeout: 3000 }).catch(() => {});
        else if (await go.count()) await go.first().click({ timeout: 3000 }).catch(() => {});
        else if (await cand.count()) await cand.first().click({ timeout: 3000 }).catch(() => {});
        else if (await slot.count()) await slot.first().click({ timeout: 3000 }).catch(() => {});
      } else if (await layerGo.count()) await layerGo.first().click({ timeout: 3000 }).catch(() => {});
      else if (await eat.count()) await eat.first().click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(400);
    }
    proof.text.lapEnd = await page.evaluate(() => document.querySelector('.bha-lcd .bha-sheet')?.innerText ?? null);
    await vis(page.getByRole('button', { name: '귀환', exact: true })).first().click({ timeout: 3000 }).catch((e) => proof.trace.push(['return', String(e).slice(0, 120)]));
    for (let t = 0; t < 20 && !(await page.locator('.bha-resultpage').count()); t++) await page.waitForTimeout(400);
    await page.waitForTimeout(800);
    proof.text.result = await lcdText();
    await shot('01-shinigami-result');
    await page.locator('.bha-resultpage .bha-dock .bha-btn').first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const skip = vis(page.getByRole('button', { name: '건너뛰기' }));
    if (await skip.count()) await skip.first().click().catch(() => {});
    await page.waitForTimeout(800);
    proof.text.evolve = await lcdText();
    await shot('07-evolution-result');
    for (let t = 0; t < 6; t++) { const b = vis(page.locator('.bha-lcd .bha-evolve__result .bha-btn--primary')); if (await b.count()) { await b.first().click().catch(() => {}); await page.waitForTimeout(800); } }
    await reopen(page);
    // 8 백업 (테스트 모드에선 숨는다 — 테스트 표시 없이 다시 연다)
    await page.locator('.bha-homedock button[aria-label="더보기"]').first().click({ timeout: 3000 }).catch((e) => proof.trace.push(['more', String(e).slice(0, 120)]));
    await page.waitForTimeout(500);
    const direct = vis(page.locator('.bha-lcd').getByRole('button', { name: '백업·불러오기' }));
    if (await direct.count()) await direct.first().click().catch(() => {});
    else await vis(page.locator('.bha-lcd').getByRole('button', { name: '설정' })).first().click({ timeout: 3000 }).catch((e) => proof.trace.push(['settings', String(e).slice(0, 120)]));
    await page.waitForTimeout(900);
    if (!(await page.getByText('세이브 백업').count())) for (const name of ['기타', '정보', '저장']) { if (await page.locator('.bha-lcd').getByRole('button', { name: '세이브 백업' }).filter({ visible: true }).count()) break; await vis(page.locator('.bha-lcd').getByRole('button', { name, exact: true })).first().click({ timeout: 1500 }).catch(() => {}); await vis(page.locator('.bha-lcd').getByRole('tab', { name, exact: true })).first().click({ timeout: 1500 }).catch(() => {}); await page.waitForTimeout(400); }
    if (!(await page.locator('.bha-lcd').getByText('내보내기').count())) await vis(page.locator('.bha-lcd').getByRole('button', { name: '세이브 백업' })).first().click({ timeout: 3000 }).catch((e) => proof.trace.push(['backup', String(e).slice(0, 120)]));
    await page.waitForTimeout(900);
    proof.text.backup = await lcdText();
    await shot('08-backup');
    } // NORMAL
    if (!NORMAL) {
    // 5 빈사 남은 시간 (상태 화면 줄)
    await patchSave(page, `t.nest.collapsed = true; t.nest.dead = false; t.nest.collapsedAt = Date.now() - 60000;`);
    await reopen(page);
    await page.waitForTimeout(3500); // 말풍선 동안은 상태 칩이 숨는다
    await page.locator('.bha-room__status').first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(900);
    if (!(await page.getByText('남은 시간').count())) { await page.keyboard.press('KeyG'); await page.waitForTimeout(900); }
    proof.text.dying = await page.evaluate(() => [...document.querySelectorAll('.bha-lcd *')].map((e) => e.childElementCount === 0 ? e.textContent : '').filter((x) => x && x.includes('남은 시간')).slice(0, 3));
    await shot('05-dying-time');
    // 4 회복 안내 5/7: recover 안내를 다시 켜고 안내가 시키는 것을 누른다
    await patchSave(page, `t.help.guides.recover = 'pending'; delete t.help.guides['recover-cure']; t.nest.collapsed = true; t.nest.dead = false; t.nest.hpFraction = 0.1; t.nest.collapsedAt = Date.now() - 60000; shared.items = shared.items || {};`);
    await reopen(page, false);
    for (let t = 0; t < 120; t++) {
      const stepText = await page.evaluate(() => document.querySelector('[data-tutorial]')?.innerText ?? '');
      if (/5\s*\/\s*7/.test(stepText) && /돌아왔다/.test(stepText)) break;
      const sel = await page.evaluate(() => document.querySelector('[data-tutorial]')?.dataset.devOnly ?? null);
      const next = vis(page.locator('[data-tutorial] button.bha-btn--primary:not([disabled])'));
      if (sel) await page.locator(sel).filter({ visible: true }).first().click({ timeout: 1500 }).catch(() => {});
      else if (await next.count()) await next.first().click({ timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(600);
    }
    proof.text.recover = await page.evaluate(() => document.querySelector('[data-tutorial]')?.innerText ?? null);
    await shot('04-recover-5of7');
    } // !NORMAL (빈사·회복 안내)
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close();
    srv.stop();
  }
  console.log(JSON.stringify({ shots: proof.shots, errors, trace: proof.trace }, null, 1));
  process.exit(0);
})();
