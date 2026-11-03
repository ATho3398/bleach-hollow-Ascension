// C.256 proof (GDD 173장 1, c252-proof 바탕): 흡수 갈래 4개마다 [흡수] 버튼 자리(y) 재기 + 첫 흡수 연습 화면. C256_FI=0 호로: 흡수 갈래 고르기 → 설명 칸. c236-proof 바탕. 사신(C256_FI=1 기본, 0 = 호로).
// 새 게임(?test=1) → 안내 끝낸 저장 → 모험 ★1 → 흡수 화면: 갈래 4개 고르기(손가락·기기 ▲▼) → 원정 중간 저장 고쳐 다시 열기(한계 경고·첫 흡수 연습). 캡처 docs/captures/c244/ (1배 844×390). 실행: node scripts/c244-proof.cjs
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, process.env.C256_OUT ?? 'docs/captures/c256');
const PORT = 5356;

async function startServer() {
  if (process.env.C256_URL) return { url: process.env.C256_URL, stop: () => {} };
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
  const proof = { shots: [], errors, trace: [], desc: {} };
  const PFX = process.env.C256_PFX ?? '';
  const shot = async (name) => { await page.screenshot({ path: path.join(OUT, `${PFX}${name}.png`) }); proof.shots.push(`${PFX}${name}.png`); };
  const DEV = { up: '위', down: '아래', ok: '확정', back: '취소' };
  const devBtn = (k) => page.locator(`.bha-dev__btn[aria-label="${DEV[k]}"]`).first().click().catch(() => {});
  const state = () => page.evaluate(() => ({
    sel: document.querySelector('.bha-lcd .bha-sel')?.textContent.trim() ?? null,
    on: document.querySelector('.bha-absorbpage button[data-mode].is-on')?.dataset.mode ?? null,
    desc: [...document.querySelectorAll('.bha-absorbpage .bha-absorb__desc p')].map((p) => p.textContent),
    step: document.querySelector('.bha-absorbpage .bha-h1')?.textContent ?? null,
    go: document.querySelector('.bha-absorbpage [data-absorb-go]')?.textContent.trim() ?? null,
    buttons: [...document.querySelectorAll('.bha-absorbpage button[data-mode]')].map((b) => b.textContent.trim()),
  }));
  try {
    await page.goto(`${srv.url}?test=1`);
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${srv.url}?test=1`);
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: '새로 시작' }).click();
    await page.waitForTimeout(300);
    await page.locator('.bha-slot').first().click();
    await page.getByRole('button', { name: '확인' }).click();
    await page.waitForTimeout(300);
    await page.locator('.bha-species__card').nth(Number(process.env.C256_FI ?? 1)).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '시작', exact: true }).click();
    await page.waitForTimeout(2000);
    await skipTut(page);
    await patchSave(page, `
      t.help.guides = { ...t.help.guides, 'first-run': 'done', 'home-intro': 'done', 'first-run-room': 'done', 'birth': 'done', 'recover': 'done' };
    `);
    await reopen(page);
    if (process.env.C256_ITEM) {
      // 상세 창(itemDialog) 행동 버튼 자리: 수련장 종목 카드마다 열어 재기
      await page.locator('.bha-prop--outside').first().click({ timeout: 4000 }).catch((e) => proof.trace.push(['out', String(e).slice(0, 200)]));
      await page.waitForTimeout(1200);
      proof.places = await page.evaluate(() => [...document.querySelectorAll('.bha-worldmap [data-place]')].map((b) => b.dataset.place));
      await page.locator('.bha-worldmap [data-place="training"]').click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(2000);
      await skipTut(page);
      proof.item = [];
      const n = await page.locator('.bha-train__card:not([disabled])').count();
      for (let i = 0; i < n; i++) {
        await page.locator('.bha-train__card:not([disabled])').nth(i).click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(500);
        proof.item.push(await page.evaluate(() => { const m = document.querySelector('.bha-itemmodal'); const a = document.querySelector('.bha-itemmodal__acts .bha-btn'); return m && a ? { modal: [Math.round(m.getBoundingClientRect().y), Math.round(m.getBoundingClientRect().height)], act: Math.round(a.getBoundingClientRect().y), name: document.querySelector('.bha-itemmodal__name')?.textContent } : null; }));
        if (i === 0 && !process.env.C256_NOSHOT) await shot('6-item');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
      }
      return;
    }
    await page.locator('.bha-prop--outside').first().click({ timeout: 4000 });
    await page.waitForTimeout(1200);
    await page.locator('.bha-worldmap [data-place="adventure"]').click({ timeout: 4000 });
    await page.waitForTimeout(1500);
    for (let i = 0; i < 6 && (await page.locator('.bha-lcd [data-dev-layer]').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
    await page.locator('.bha-lcd').getByRole('button', { name: '★1', exact: true }).click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(500);
    await page.locator('.bha-lcd').getByRole('button', { name: '출발' }).first().click({ timeout: 3000 }).catch(() => proof.trace.push(['no-depart']));
    await page.waitForTimeout(1200);
    const vis = (loc) => loc.filter({ visible: true });
    const toAbsorb = async () => {
      for (let t = 0; t < 600 && !(await page.locator('.bha-absorbpage').count()); t++) {
        const layerGo = vis(page.locator('.bha-lcd [data-dev-layer] button.bha-btn--primary'));
        const eat = vis(page.getByRole('button', { name: /하러 가기$/ }));
        if (await eat.count()) await eat.first().click({ timeout: 2000 }).catch(() => {});
        else if (await layerGo.count()) await layerGo.first().click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(500);
      }
      await page.waitForTimeout(800);
    };
    await toAbsorb();
    const goBox = () => page.evaluate(() => { const r = document.querySelector('.bha-absorbpage [data-absorb-go]')?.getBoundingClientRect(); return r ? [Math.round(r.y), Math.round(r.height)] : null; });
    proof.goY = {};
    for (const m of ['both', 'trait', 'stat', 'none']) {
      await page.locator(`.bha-absorbpage button[data-mode="${m}"]`).click();
      await page.waitForTimeout(250);
      proof.goY[m] = { go: await goBox(), lines: (await state()).desc.length };
      if (!process.env.C256_NOSHOT) await shot(`1-${m}`);
    }
    if (process.env.C256_NEST) {
      // 바퀴 끝 창: 흡수를 끝내고 걸어서 둥지 칸까지 → 뽑기 카드 고르기 전/후 [귀환] 자리
      const vis = (loc) => loc.filter({ visible: true });
      const retY = () => page.evaluate(() => { const b = [...document.querySelectorAll('.bha-lcd .bha-continue .bha-btn')]; return b.map((x) => Math.round(x.getBoundingClientRect().y)); });
      for (let t = 0; t < 400; t++) {
        if (await vis(page.getByRole('button', { name: '귀환', exact: true })).count()) break;
        const layerGo = vis(page.locator('.bha-lcd [data-dev-layer] button.bha-btn--primary, .bha-lcd [data-dev-layer] button.bha-btn--danger'));
        const eat = vis(page.getByRole('button', { name: /하러 가기$/ }));
        if (await page.locator('.bha-absorbpage').count()) {
          const go = vis(page.locator('.bha-lcd .bha-absorbpage [data-absorb-go]'));
          const slot = vis(page.locator('.bha-lcd .bha-absorbpage .bha-slot'));
          const cand = vis(page.locator('.bha-lcd .bha-cand'));
          if (await layerGo.count()) await layerGo.first().click({ timeout: 3000 }).catch(() => {});
          else if (await go.count()) await go.first().click({ timeout: 3000 }).catch(() => {});
          else if (await cand.count()) { if (!proof.pickShot) {
            proof.pickShot = true;
            const ry = () => page.evaluate(() => { const r = document.querySelector('.bha-lcd [data-sc="reroll"]')?.getBoundingClientRect(); return r ? Math.round(r.y) : null; });
            proof.reroll = { before: await ry() };
            await page.locator('.bha-lcd [data-sc="reroll"]').click({ timeout: 2000 }).catch(() => {});
            await page.waitForTimeout(500);
            proof.reroll.after = await ry();
            await shot('3-pick'); } await cand.first().click({ timeout: 3000 }).catch(() => {}); }
          else if (await slot.count()) await slot.first().click({ timeout: 3000 }).catch(() => {});
        } else if (await layerGo.count()) await layerGo.first().click({ timeout: 3000 }).catch(() => {});
        else if (await eat.count()) await eat.first().click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(500);
      }
      await page.waitForTimeout(800);
      proof.nest = { before: await retY(), sheetH: await page.evaluate(() => Math.round(document.querySelector('.bha-lcd .bha-exp .bha-sheet')?.getBoundingClientRect().height ?? 0)) };
      await shot('4-nest-before');
      const card = vis(page.locator('.bha-lcd .bha-draft__card'));
      if (await card.count()) { await card.first().click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(600); }
      proof.nest.after = await retY();
      proof.nest.head = await page.evaluate(() => document.querySelector('.bha-lcd .bha-draft__head')?.textContent ?? null);
      await shot('5-nest-after');
    }
    if (process.env.C256_TUT) {
      await patchSave(page, `if (t.activeExpedition) { const e = t.activeExpedition.exp ?? t.activeExpedition; e.tutorial = true; e.risk = 0; }`);
      await reopen(page, false);
      for (let t = 0; t < 40 && !(await page.locator('.bha-absorbpage').count()); t++) await page.waitForTimeout(300);
      await page.waitForTimeout(1000);
      for (let t = 0; t < 4 && (await page.locator('.bha-tut').count()); t++) { await page.locator('.bha-tut button.bha-btn--primary').filter({ visible: true }).first().click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(500); }
      proof.tutGoY = {};
      for (const m of ['both', 'trait', 'stat', 'none']) {
        await page.locator(`.bha-absorbpage button[data-mode="${m}"]`).click().catch(() => {});
        await page.waitForTimeout(250);
        proof.tutGoY[m] = await goBox();
      }
      await shot('2-tutorial');
    }
  } finally {
    fs.writeFileSync(path.join(OUT, `${PFX}proof.json`), JSON.stringify(proof, null, 2));
    await browser.close();
    srv.stop();
  }
  console.log(JSON.stringify(proof, null, 1));
  process.exit(0);
})();
