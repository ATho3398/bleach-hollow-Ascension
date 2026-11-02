// C.247 proof (GDD 168장 2~4): 상태 화면 ⓘ 창 전부(잘림·계산식) · 흡수 화면 놓아주기 설명 칸(−1, 개발 메모 없음) · 놓아주기 확인 창.
// C247_FI=1 사신(기본), 0 = 호로. 캡처 docs/captures/c247/ (1배 844×390). 실행: node scripts/c247-proof.cjs
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c247');
const PORT = 5347;

async function startServer() {
  if (process.env.C244_URL) return { url: process.env.C244_URL, stop: () => {} };
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
  const FI = Number(process.env.C247_FI ?? 1);
  const TAG = FI === 0 ? 'hollow' : 'shinigami';
  const srv = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const proof = { faction: TAG, shots: [], errors, trace: [], infos: [], absorb: {} };
  const shot = async (name) => { await page.screenshot({ path: path.join(OUT, `${TAG}-${name}.png`) }); proof.shots.push(`${TAG}-${name}.png`); };
  const devBtn = (k) => page.locator(`.bha-dev__btn[aria-label="${k}"]`).first().click().catch(() => {});
  // 창이 LCD 화면 안에 다 들어오는지 + 스크롤 필요 여부 + 계산식 노출
  const popInfo = () => page.evaluate(() => {
    const pop = document.querySelector('.bha-pop');
    const lcd = document.querySelector('.bha-lcd');
    if (!pop || !lcd) return null;
    const r = pop.getBoundingClientRect();
    const l = lcd.getBoundingClientRect();
    const text = [...pop.querySelectorAll('li, p')].map((e) => e.textContent);
    return {
      title: pop.querySelector('.bha-pop__title')?.textContent,
      inside: r.top >= l.top - 1 && r.bottom <= l.bottom + 1 && r.left >= l.left - 1 && r.right <= l.right + 1,
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)], lcd: [Math.round(l.left), Math.round(l.top), Math.round(l.right), Math.round(l.bottom)],
      scroll: pop.scrollHeight > pop.clientHeight + 1, more: !!pop.querySelector('.bha-pop__more:not([hidden])'),
      formula: text.filter((t) => /×\s*\d|\[.*횟수\]|\(바퀴/.test(t)),
      lines: text,
    };
  });
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
    await page.locator('.bha-species__card').nth(FI).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '시작', exact: true }).click();
    await page.waitForTimeout(2000);
    await skipTut(page);
    await patchSave(page, `
      t.help.guides = { ...t.help.guides, 'first-run': 'done', 'home-intro': 'done', 'first-run-room': 'done', 'birth': 'done', 'recover': 'done' };
    `);
    await reopen(page);
    // ── 상태 화면 ⓘ 창 전부 ──
    await page.keyboard.press('g');
    await page.waitForTimeout(1200);
    const n = await page.locator('.bha-care-page button.bha-info').count();
    for (let i = 0; i < n; i++) {
      const b = page.locator('.bha-care-page button.bha-info').nth(i);
      if (!(await b.isVisible())) continue;
      await b.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(400);
      const info = await popInfo();
      if (info) proof.infos.push({ label: await b.getAttribute('data-info'), ...info, lines: undefined, lineCount: info.lines.length });
      const label = await b.getAttribute('data-info');
      if (info && /광기|호로화/.test(label ?? '')) {
        proof.riskLines = info.lines;
        await shot('3-risk-info');
        if (info.scroll) { for (let k = 0; k < 8; k++) await devBtn('아래'); await page.waitForTimeout(300); proof.riskAfterScroll = await popInfo(); await shot('3b-risk-info-end'); }
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    // ── 흡수 화면: 놓아주기 설명 칸 · 확인 창 ──
    await page.locator('.bha-prop--outside').first().click({ timeout: 4000 }).catch(() => proof.trace.push(['no-outside', 'x']));
    await page.waitForTimeout(1200);
    await page.locator('.bha-worldmap [data-place="adventure"]').click({ timeout: 4000 });
    await page.waitForTimeout(1500);
    for (let i = 0; i < 6 && (await page.locator('.bha-lcd [data-dev-layer]').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250); }
    await page.locator('.bha-lcd').getByRole('button', { name: '★1', exact: true }).click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(500);
    await page.locator('.bha-lcd').getByRole('button', { name: '출발' }).first().click({ timeout: 3000 }).catch(() => proof.trace.push(['no-depart']));
    await page.waitForTimeout(1200);
    const vis = (loc) => loc.filter({ visible: true });
    for (let t = 0; t < 600 && !(await page.locator('.bha-absorbpage').count()); t++) {
      const layerGo = vis(page.locator('.bha-lcd [data-dev-layer] button.bha-btn--primary'));
      const eat = vis(page.getByRole('button', { name: /하러 가기$/ }));
      if (await eat.count()) await eat.first().click({ timeout: 2000 }).catch(() => {});
      else if (await layerGo.count()) await layerGo.first().click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(800);
    await page.locator('.bha-absorbpage button[data-mode="none"]').click();
    await page.waitForTimeout(300);
    proof.absorb.desc = await page.evaluate(() => [...document.querySelectorAll('.bha-absorbpage .bha-absorb__desc p')].map((p) => p.textContent));
    proof.absorb.devNote = await page.evaluate(() => /기획|미정|임시 데이터/.test(document.querySelector('.bha-absorbpage')?.textContent ?? ''));
    await shot('1-release-desc');
    await devBtn('취소');
    await page.waitForTimeout(500);
    proof.absorb.confirm = await page.evaluate(() => document.querySelector('.bha-lcd [data-dev-layer]')?.textContent.replace(/\s+/g, ' ') ?? null);
    await shot('2-release-confirm');
  } finally {
    fs.writeFileSync(path.join(OUT, `proof-${TAG}.json`), JSON.stringify(proof, null, 2));
    await browser.close();
    srv.stop();
  }
  console.log(JSON.stringify(proof, null, 1));
  process.exit(0);
})();
