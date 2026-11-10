// C.378 proof (GDD 230장 보충, c281-proof 기반): 이펙트 배치 도구 확정 값이 게임 전투에 — 블록을 쓰면 도트 이펙트·투사체·연결 동작. 1배 844×390, 두 종족.
// 실행: node scripts/c378-proof.cjs (C249_URL=<주소>) — 캡처 docs/captures/c378/
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.C249_OUT ?? path.join(ROOT, 'docs/captures/c378');
const PART = process.env.C249_PART ?? 'all';
const PORT = 5381;

async function startServer() {
  if (process.env.C249_URL) return { url: process.env.C249_URL, stop: () => {} };
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

async function reopen(page) {
  await page.reload();
  await page.waitForTimeout(1500);
  const cont = page.getByRole('button', { name: '이어하기' });
  if (await cont.count()) { await cont.first().click().catch(() => {}); await page.waitForTimeout(500); }
  const load = page.getByRole('button', { name: '불러오기' });
  if (!(await page.locator('.bha-slot').count()) && (await load.count())) { await load.first().click().catch(() => {}); await page.waitForTimeout(600); }
  const slot = page.locator('.bha-slot').first();
  if (await slot.count()) { await slot.click().catch(() => {}); await page.getByRole('button', { name: '확인' }).click().catch(() => {}); await page.waitForTimeout(1500); }
  await skipTut(page);
}

const screens = (page) => page.evaluate(() => [...document.querySelectorAll('.bha-lcd .bha-app')].map((e) => e.className.replace('bha-app ', '')).join('|'));

// 한 종족: 새로 시작 → 튜토리얼 넘김 → 테스트 '바로 전투' → 공격 블록을 눌러 도트 자국(.bha-pxfx)이 뜨면 한가운데 프레임을 찍는다
async function runFaction(browser, fi, tag, proof, traits) {
  const page0 = { p: null };
  try { return await runFactionInner(browser, fi, tag, proof, traits, page0); } catch (e) { if (page0.p) await page0.p.screenshot({ path: path.join(OUT, `${tag}-fail.png`) }); throw new Error(`${String(e.message).split('\n')[0]} @ ${(e.stack.match(/c268-proof\.cjs:(\d+)/) || [])[1]}`); }
}
async function runFactionInner(browser, fi, tag, proof, traits, page0) {
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  page0.p = page;
  page.on('pageerror', (e) => proof.errors.push(`${tag}: ${e.message}`));
  const fxReq = [];
  page.on('response', (r) => { if (/\/fx\//.test(r.url())) fxReq.push(`${r.status()} ${r.url().split('/fx/')[1]}`); });
  const shot = async (name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); proof.shots.push(`${name}.png`); };
  const base = proof.url;
  await page.goto(`${base}?test=1`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${base}?test=1`);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '새로 시작' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-slot').first().click();
  await page.getByRole('button', { name: '확인' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-species__card').nth(fi).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await page.waitForTimeout(400);
  // 이름·성별 정하기(GDD 199장, c330-proof 와 같은 순서)
  const nameIn = page.locator('[data-ident="name"]');
  if (await nameIn.count()) {
    await nameIn.fill('시험');
    await page.locator('[data-ident="next"]').click();
    await page.waitForTimeout(200);
    await page.locator('.bha-ident__gender').first().click();
    await page.locator('[data-ident="done"]').click();
  }
  await page.waitForTimeout(2000);
  await skipTut(page);
  await patchSave(page, `
    t.help.guides = { ...t.help.guides, 'first-run': 'done', 'home-intro': 'done', 'first-run-room': 'done', 'birth': 'done', 'recover': 'done' };
    t.nest.hunger = 20; t.nest.condition = 80; t.nest.hpFraction = 1; t.nest.spa = null;
    t.nest.collapsed = false; t.nest.collapsedAt = 0; t.nest.weakened = false; t.nest.tired = false; t.nest.dead = false;
  `);
  await reopen(page);
  await page.getByRole('button', { name: '더보기' }).first().click({ timeout: 4000 });
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: '테스트' }).first().click({ timeout: 4000 });
  await page.waitForTimeout(600);
  // 테스트 패널 '특성' 탭: 특성 칸 1 = 고른 계열 공격 특성 → 적용
  await page.locator('.bha-viewtitle button').first().click({ timeout: 4000 });
  await page.waitForTimeout(400);
  await page.getByText('블록', { exact: true }).first().click({ timeout: 4000 });
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: '블록 칸 1' }).first().click({ timeout: 4000 });
  await page.waitForTimeout(300);
  // 목록 글자는 계열 이름만('참'·'조') — 같은 이름 중 traits.json 순서(물·불·흙·뇌·혈·독·허)의 n번째
  const [fam, nth] = traits;
  const opt = page.locator('[role="option"]').filter({ hasText: new RegExp(`^\\s*${fam}\\s*$`) }).nth(nth);
  await opt.scrollIntoViewIfNeeded();
  await opt.click({ timeout: 4000 });
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '적용' }).first().click({ timeout: 4000 });
  await page.waitForTimeout(500);
  await page.locator('.bha-viewtitle button').first().click({ timeout: 4000 });
  await page.waitForTimeout(400);
  await page.getByText('바로 전투', { exact: true }).first().click({ timeout: 4000 });
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: '전투 시작' }).click({ timeout: 4000 });
  await page.waitForTimeout(1500);
  if (process.env.C268_BG) {
    // 이펙트 배치 도구 배경: 효과 없는 전투 장면 몇 장 + 맞는 몸 가운데(페이지 px). C268_NOHERO = 내 캐릭터를 숨기고 그 그림 자리·변형을 남긴다(도구가 움직이는 캐릭터를 얹음)
    if (process.env.C268_NOHERO) {
      proof.trace.push({ tag, hero: await page.evaluate(() => {
        const img = document.querySelector('.bha-hero__img');
        const r = img.getBoundingClientRect();
        const chain = [];
        for (let n = img; n && !n.classList?.contains('bha-arena'); n = n.parentElement) chain.push(`${n.className}: ${getComputedStyle(n).transform}`);
        return { x: r.left, y: r.top, w: r.width, h: r.height, nat: [img.naturalWidth, img.naturalHeight], chain: chain.slice(0, 4) };
      }) });
      await page.addStyleTag({ content: '.bha-hero{visibility:hidden!important}' });
    }
    for (let k = 0; k < 6; k++) {
      await page.waitForTimeout(170);
      const geo = await page.evaluate(() => {
        const b = document.querySelector('.bha-foe__body').getBoundingClientRect();
        const l = document.querySelector('.bha-afx-layer').getBoundingClientRect();
        const m = document.querySelector('.bha-hero__body').getBoundingClientRect();
        return { foe: { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height }, hero: { x: m.left + m.width / 2, y: m.top + m.height / 2, w: m.width, h: m.height }, layer: { x: l.left, y: l.top, w: l.width, h: l.height }, afx: document.querySelectorAll('.bha-afx, .bha-pxfx').length };
      });
      await page.screenshot({ path: path.join(OUT, `bg-${tag}-${k}.png`) });
      proof.trace.push({ tag, bg: k, geo });
    }
    return;
  }
  const seen = [];
  let pixelCount = 0;
  let tries = 0;
  const WANT = Number(process.env.C378_N ?? 1);
  const names = new Set();
  for (let i = 0; i < 300 && pixelCount < WANT && tries < 14; i++) {
    const cells = await page.evaluate(() => [...document.querySelectorAll('.bha-v2cell .bha-block')].map((c, k) => ({ k, kind: c.dataset.kind || '', label: c.getAttribute('aria-label') || '' })));
    // 장착한 계열 공격 블록 (data-kind = 속성). C378_RUN=2·3 이면 같은 블록이 그만큼 붙은 곳(체인 = 2·3블록)만 누른다
    const run = Number(process.env.C378_RUN ?? 1);
    const fam = (k) => cells[k] && cells[k].kind && cells[k].kind !== 'normal' && cells[k].kind !== 'void';
    const want = cells.find((c) => fam(c.k) && Array.from({ length: run }, (_, j) => fam(c.k + j) && cells[c.k + j].kind === c.kind).every(Boolean) && !(fam(c.k - 1) && cells[c.k - 1].kind === c.kind));
    if (!want) { await page.waitForTimeout(300); continue; }
    tries++;
    await page.locator('.bha-v2cell .bha-block').nth(want.k).click({ timeout: 2000 }).catch(() => {});
    let got = null;
    for (let w = 0; w < 40 && !got; w++) {
      await page.waitForTimeout(25);
      got = await page.evaluate(() => {
        const n = [...document.querySelectorAll('.bha-pxfx-wrap .bha-pxfx')].find((e) => Number(getComputedStyle(e).opacity) > 0);
        return n ? { name: n.dataset.fx, n: document.querySelectorAll('.bha-pxfx-wrap').length } : null;
      });
    }
    if (got && !names.has(got.name)) {
      names.add(got.name);
      pixelCount++;
      await page.waitForTimeout(Number(process.env.C281_MID ?? 110)); // 한가운데 프레임
      await shot(`${tag}-${pixelCount}-${got.name}`);
    }
    seen.push({ block: want.label, kind: want.kind, pixel: got });
    await page.waitForTimeout(900);
  }
  proof.trace.push({ tag, seen, pixelCount, fxReq: [...new Set(fxReq)] });
  if (!pixelCount) {
    // 도트 자국이 없으면(호로) 계열 공격 순간의 옛 자국을 찍는다
    const cells = await page.evaluate(() => [...document.querySelectorAll('.bha-v2cell .bha-block')].map((c, k) => ({ k, kind: c.dataset.kind || '' })));
    const want = cells.find((c) => c.kind && c.kind !== 'normal');
    if (want) {
      await page.locator('.bha-v2cell .bha-block').nth(want.k).click({ timeout: 2000 }).catch(() => {});
      for (let w = 0; w < 40; w++) { await page.waitForTimeout(25); if (await page.locator('.bha-afx').count()) break; }
      await page.waitForTimeout(60);
    }
    await shot(`${tag}-no-pixel`);
    proof.trace.push({ tag, afx: await page.locator('.bha-afx').count(), pxfx: await page.locator('.bha-pxfx').count() });
  }
  await page.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { url: srv.url, shots: [], errors: [], trace: [] };
  try {
    // 사신 참: 속성 3가지(불·물·허), 호로 조(같은 family-a)는 그대로 SVG 자국인지
    // 이름 = 테스트 패널 특성 목록 글자
    const order = ['water', 'fire', 'earth', 'thunder', 'blood', 'poison', 'kyo'];
    // [종족 카드(0 호로·1 사신), 이름, [계열 글자, 속성 순번]]
    const all = [[0, 'h-brute-tan-fire', ['탄', order.indexOf('fire')]]];
    const runs = process.env.C378_ONLY ? all.filter((r) => process.env.C378_ONLY.split(',').includes(r[1])) : all;
    for (const [fi, tag, traits] of runs) {
      try { await runFaction(browser, fi, tag, proof, traits); } catch (e) { proof.errors.push(`${tag}: ${e.message}`); }
    }
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
    await browser.close();
    srv.stop();
  }
  console.log(JSON.stringify(proof, null, 1));
  process.exit(0);
})();
