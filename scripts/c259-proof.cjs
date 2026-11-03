// C.259 proof (GDD 176장 코딩188): 기기 버튼 조작·초점 — 1 펼침 목록 ▼ · 2 바퀴 끝 첫 초점 · 4 돌보기 뒤 초점 · 5 탄생 뒤 입력 막기 · 7 상태 화면 아래 ·
// 8 나왔다 돌아오면 들어갔던 칸 · 10 다마고치 ◀·아래 버튼 · 14 타일 배치 초점 · 빈사 칩. 모든 조작은 기기 버튼(.bha-dev__btn)만.
// 실행: node scripts/c259-proof.cjs (C259_URL=<주소>, C259_OUT=<폴더>, C259_PART=birth|room|exp|all) — 캡처 1배 844×390
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.C259_OUT ?? path.join(ROOT, 'docs/captures/c259');
const PART = process.env.C259_PART ?? 'all';
const PORT = 5359;

async function startServer() {
  if (process.env.C259_URL) return { url: process.env.C259_URL, stop: () => {} };
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

const state = (page) => page.evaluate(() => {
  if (document.querySelector('.bha-birth')) return 'birth';
  if (document.querySelector('.bha-tut')) return 'tut';
  if (document.querySelector('.bha-lcd .bha-worldmap')) return 'worldmap';
  if (document.querySelector('[data-input-gate]')) return 'gate';
  if (document.querySelector('.bha-lcd .bha-room')) return 'room';
  return 'other';
});

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { shots: [], checks: {}, trace: [], errors: [] };
  const mk = async () => {
    const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => proof.errors.push(e.message));
    return page;
  };
  const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  try {
    // ── 5 탄생 연출 끝 ~ 홈 안내 사이: ✓ 연타해도 월드맵이 안 열린다 (호로) ──
    if (PART === 'all' || PART === 'birth') {
      const page = await mk();
      await newGame(page, srv.url, 0, false);
      const seq = [];
      for (let t = 0; t < 120; t++) {
        const s = await state(page);
        if (seq[seq.length - 1] !== s) seq.push(s);
        if (s === 'tut' && seq.includes('birth')) break;
        await page.locator('.bha-dev__btn[aria-label="확정"]').first().click({ timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(100);
      }
      const tutAt = seq.indexOf('tut');
      proof.checks.birthGap = { seq, worldmapBeforeIntro: seq.slice(0, tutAt < 0 ? seq.length : tutAt).includes('worldmap'), ok: tutAt >= 0 && !seq.slice(0, tutAt).includes('worldmap') };
      await page.close();
    }

    // ── 사신: 방·상태·다마고치·수련장 목록·빈사 칩 ──
    if (PART === 'all' || PART === 'room') {
      const page = await mk();
      await newGame(page, srv.url, 1);
      await page.waitForTimeout(2500);
      await skipTut(page);
      await patchSave(page, `
        t.help.guides = { ...t.help.guides, 'first-run': 'done', 'home-intro': 'done', 'first-run-room': 'done', 'birth': 'done', 'recover': 'done' };
        t.nest.hunger = 20; t.nest.condition = 60; t.nest.hpFraction = 0.6; t.nest.spa = null; t.nest.careRequest = null;
        t.nest.collapsed = false; t.nest.collapsedAt = 0; t.nest.weakened = false; t.nest.tired = false; t.nest.dead = false;
      `);
      await reopen(page);
      await page.waitForTimeout(800);
      const sceneH = () => page.evaluate(() => document.querySelector('.bha-room .bha-room__scene, .bha-room .bha-room__body')?.getBoundingClientRect().height ?? 0);
      const normalH = await sceneH();
      // 4 돌보기 → 초점 그대로
      const careSel = await downTo(page, (s) => s.care === 'pet');
      await press(page, 'ok', 500);
      const afterCare = await sel(page);
      await shot(page, '03-care-focus-kept');
      await page.waitForTimeout(3200); // 말풍선 끝
      const afterBubble = await sel(page);
      proof.checks.care = { before: careSel, afterCare, afterBubble, ok: afterCare?.care === 'pet' && afterBubble?.care === 'pet' };
      // 8 책장 → 뒤로 = 책장 / 가방(상자) → 뒤로 = 가방
      const ret = {};
      for (const prop of ['book', 'chest']) {
        await downTo(page, (s) => s.cls.includes(`bha-prop--${prop}`) || s.cls.includes('bha-prop') && s.lab.includes(prop === 'book' ? '책' : '가방'));
        const before = await sel(page);
        await press(page, 'ok', 900);
        await press(page, 'down', 150);
        await press(page, 'down', 150);
        await press(page, 'back', 900);
        ret[prop] = { before, after: await sel(page) };
        ret[prop].ok = ret[prop].before?.lab === ret[prop].after?.lab;
      }
      // 7 상태 화면 아래까지 ▼
      await downTo(page, (s) => s.cls.includes('bha-room__status'));
      await press(page, 'ok', 900);
      const scroll = [];
      for (let i = 0; i < 25; i++) {
        await press(page, 'down', 140);
        scroll.push(await page.evaluate(() => {
          const boxes = [...document.querySelectorAll('.bha-lcd .bha-app *')].filter((e) => e.scrollHeight > e.clientHeight + 1 && ['auto', 'scroll'].includes(getComputedStyle(e).overflowY));
          return boxes.map((b) => `${Math.round(b.scrollTop)}/${b.scrollHeight - b.clientHeight}`).join(',');
        }));
      }
      const bottom = await page.evaluate(() => [...document.querySelectorAll('.bha-lcd .bha-app *')].filter((e) => e.scrollHeight > e.clientHeight + 1 && ['auto', 'scroll'].includes(getComputedStyle(e).overflowY)).map((b) => b.scrollHeight - b.clientHeight - b.scrollTop));
      // 끝까지 내려간 순간을 찍기 위해 처음부터 다시: 끝에 닿은 때 캡처
      await press(page, 'back', 900);
      ret.status = { after: await sel(page) };
      ret.status.ok = !!ret.status.after?.cls.includes('bha-room__status');
      await press(page, 'ok', 900);
      for (let i = 0; i < 30; i++) {
        const left = await page.evaluate(() => Math.max(0, ...[...document.querySelectorAll('.bha-lcd .bha-app *')].filter((e) => e.scrollHeight > e.clientHeight + 1 && ['auto', 'scroll'].includes(getComputedStyle(e).overflowY)).map((b) => b.scrollHeight - b.clientHeight - b.scrollTop)));
        if (left <= 2) break;
        await press(page, 'down', 140);
      }
      await shot(page, '04-status-bottom');
      proof.checks.status = { scroll, bottomLeft: bottom, ok: bottom.every((x) => x <= 2) };
      await press(page, 'back', 900);
      proof.checks.returnFocus = ret;
      // 10 다마고치: 더보기 → 다마고치 → ▼ 로 아래 버튼까지 → ◀ 로 끄기
      await downTo(page, (s) => s.lab === '더보기');
      await press(page, 'ok', 400);
      await downTo(page, (s) => s.lab === '다마고치');
      await press(page, 'ok', 1400);
      const tamaOn = await page.evaluate(() => document.documentElement.classList.contains('bha-tama-on'));
      const order = [];
      let tamaSel = null;
      for (let i = 0; i < 20; i++) {
        await press(page, 'down', 140);
        const s = await sel(page);
        order.push(s?.tama ?? s?.lab);
        if (s?.tama && !tamaSel) { tamaSel = s; await page.waitForTimeout(300); await shot(page, '05-tamagotchi-bar-focus'); }
      }
      await press(page, 'back', 1200);
      const tamaOff = await page.evaluate(() => !document.documentElement.classList.contains('bha-tama-on'));
      proof.checks.tamagotchi = { tamaOn, order, tamaSel, tamaOff, ok: tamaOn && !!tamaSel && tamaOff };
      await page.waitForTimeout(800);
      // 1 수련장 머리 목록: 월드맵 → 수련장 → 제목 ✓ → ▼ (목록이 안 닫힌다)
      await downTo(page, (s) => s.cls.includes('bha-prop--outside') || s.lab.includes('월드맵'));
      await press(page, 'ok', 1500);
      await downTo(page, (s) => s.lab.includes('수련장'));
      await press(page, 'ok', 2500);
      await skipTut(page);
      const t0 = await downTo(page, (s) => s.cls.includes('bha-viewtitle__btn'));
      await press(page, 'ok', 400);
      const opened = await page.evaluate(() => !document.querySelector('.bha-lcd .bha-viewtitle__list')?.hidden);
      await press(page, 'down', 250);
      const s1 = await sel(page);
      const stillOpen = await page.evaluate(() => !document.querySelector('.bha-lcd .bha-viewtitle__list')?.hidden);
      await shot(page, '01-viewtitle-list-down');
      await press(page, 'back', 400);
      const closedByBack = await page.evaluate(() => !!document.querySelector('.bha-lcd .bha-viewtitle__list')?.hidden);
      proof.checks.viewtitle = { t0, opened, s1, stillOpen, closedByBack, ok: opened && stillOpen && !!s1?.cls.includes('bha-viewtitle__item') && closedByBack };
      // 빈사 칩: 빈사로 다시 연다
      await patchSave(page, `t.nest.spa = null; t.nest.collapsed = true; t.nest.collapsedAt = Date.now(); t.nest.hpFraction = 0.05;`);
      await reopen(page);
      await page.waitForTimeout(1500);
      const dying = await page.evaluate(() => {
        const r = (q) => { const e = document.querySelector(q); if (!e) return null; const b = e.getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) }; };
        return { chip: r('.bha-room .bha-room__status'), info: r('.bha-room .bha-room__statusinfo'), body: r('.bha-room .bha-char .bha-char__body'), side: document.querySelector('.bha-room .bha-room__status')?.classList.contains('is-side') };
      });
      const ov = (a, b) => a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
      const band = await page.evaluate(() => document.querySelectorAll('.bha-room .bha-room__hud .bha-notice').length);
      const dyingH = await sceneH();
      proof.checks.dyingChip = { ...dying, chipOverBody: ov(dying.chip, dying.body), band, normalH, dyingH, ok: !ov(dying.chip, dying.body) && band === 0 && Math.abs(dyingH - normalH) < 2 };
      await shot(page, '07-dying-chip');
      // 177장: 사망도 띠 없이 장면 안 [부활]
      await patchSave(page, `t.nest.collapsed = false; t.nest.collapsedAt = 0; t.nest.dead = true;`);
      await reopen(page);
      await page.waitForTimeout(1200);
      const dead = await page.evaluate(() => ({ band: document.querySelectorAll('.bha-room .bha-room__hud .bha-notice').length, revive: !!document.querySelector('.bha-room .bha-room__body > .bha-room__revive') }));
      const deadSel = await downTo(page, (s) => s.lab === '부활');
      proof.checks.dead = { ...dead, deadSel, deadH: await sceneH(), ok: dead.band === 0 && dead.revive && !!deadSel };
      await shot(page, '08-dead-revive');
      await page.close();
    }

    // ── 사신 원정: 2 바퀴 끝 첫 초점 · 14 타일 배치 ──
    if (PART === 'all' || PART === 'exp') {
      const page = await mk();
      await newGame(page, srv.url, 1);
      await page.waitForTimeout(2500);
      await skipTut(page);
      await patchSave(page, `
        t.help.guides = { ...t.help.guides, 'home-intro': 'done', 'birth': 'done', 'recover': 'done' };
        t.nest.hunger = 20; t.nest.condition = 80; t.nest.hpFraction = 1; t.nest.careRequest = null;
      `);
      await reopen(page);
      await page.waitForTimeout(600);
      // 테스트 속도 ×4
      await page.locator('.bha-lcd').getByRole('button', { name: '더보기' }).click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(400);
      await page.locator('.bha-homedock__tray').getByRole('button', { name: '테스트' }).click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(700);
      await page.click('.bha-lcd .bha-viewtitle__btn', { timeout: 3000 }).catch(() => {});
      await page.locator('.bha-viewtitle__list').getByRole('option', { name: '둥지·시간' }).click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(400);
      await page.locator('.bha-lcd .bha-seg__item').filter({ hasText: '×4' }).click({ timeout: 3000 }).catch(() => {});
      await page.locator('.bha-dev__btn--back').first().click().catch(() => {});
      await page.waitForTimeout(700);
      await page.locator('.bha-prop--outside').first().click();
      await page.waitForTimeout(1500);
      await page.click('.bha-worldmap [data-place="adventure"]').catch(() => {});
      await page.waitForTimeout(1500);
      await skipTut(page);
      for (let i = 0; i < 6 && (await page.locator('.bha-lcd [data-dev-layer]').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
      await page.locator('.bha-lcd').getByRole('button', { name: '★1', exact: true }).click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(500);
      await page.locator('.bha-lcd').getByRole('button', { name: '출발' }).first().click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(1200);
      let lap = null;
      for (let t = 0; t < 500 && !lap; t++) {
        const sheet = page.locator('.bha-lcd .bha-exp .bha-sheet:not(.bha-event)');
        if (await sheet.count()) {
          await page.waitForTimeout(400);
          lap = { first: await sel(page) };
          await shot(page, '02-lap-end-focus');
          const order = [];
          for (let i = 0; i < 24; i++) { await press(page, 'down', 110); order.push((await sel(page))?.lab); }
          lap.order = order;
          lap.pauseInOrder = order.some((x) => /일시정지|재개/.test(x ?? ''));
          lap.ok = /귀환/.test(lap.first?.lab ?? '') && !lap.pauseInOrder;
          // 14: 드래프트 카드 → 손 카드 → 첫 빈 칸 → 놓기 → 다음 카드
          const tile = {};
          if (await page.locator('.bha-lcd .bha-draft__card:not([disabled])').count()) {
            await downTo(page, (s) => s.cls.includes('bha-draft__card') || s.cls.includes('bha-tilechip'));
            await press(page, 'ok', 500);
          }
          const card = await downTo(page, (s) => s.cls.includes('bha-tilecard'), 40);
          tile.card = card;
          if (card) {
            await press(page, 'ok', 400);
            tile.afterPick = await sel(page);
            await shot(page, '06-tile-pick-to-cell');
            await press(page, 'ok', 400);
            tile.afterPlace = await sel(page);
            tile.ok = !!tile.afterPick?.cls.includes('bha-road__cell') && !!tile.afterPlace && !tile.afterPlace.cls.includes('bha-road__cell');
          }
          lap.tile = tile;
          break;
        }
        const layerGo = page.locator('.bha-lcd [data-dev-layer] button.bha-btn--primary, .bha-lcd [data-dev-layer] button.bha-btn--danger').filter({ visible: true });
        if (await page.locator('.bha-absorbpage').count()) {
          const go = page.locator('.bha-lcd .bha-absorbpage button.bha-btn--primary:not([disabled])').filter({ visible: true });
          const slot = page.locator('.bha-lcd .bha-absorbpage .bha-slot').filter({ visible: true });
          const cand = page.locator('.bha-lcd .bha-cand').filter({ visible: true });
          if (await layerGo.count()) await layerGo.first().click({ timeout: 3000 }).catch(() => {});
          else if (await go.count()) await go.first().click({ timeout: 3000 }).catch(() => {});
          else if (await slot.count()) await slot.first().click({ timeout: 3000 }).catch(() => {});
          else if (await cand.count()) await cand.first().click({ timeout: 3000 }).catch(() => {});
        } else if (await layerGo.count()) await layerGo.first().click({ timeout: 3000 }).catch(() => {});
        else if (await page.locator('.bha-lcd .bha-event').count()) await page.locator('.bha-lcd .bha-event button').first().click({ timeout: 3000 }).catch(() => {});
        else {
          const eat = page.getByRole('button', { name: /하러 가기$/ }).filter({ visible: true });
          if (await eat.count()) await eat.first().click({ timeout: 3000 }).catch(() => {});
        }
        await page.waitForTimeout(500);
      }
      proof.checks.lapEnd = lap ?? { ok: false, note: '바퀴 끝 창 못 봄' };
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
