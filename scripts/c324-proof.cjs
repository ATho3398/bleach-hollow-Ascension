// C.324 proof (코딩232): 설정 화면 글·버튼 겹침/잘림 전수 점검 — 처음 화면 설정(공통) 4탭 + 둥지 설정(테스트 모드) 4탭.
// 줄(.bha-setrow)마다 글·버튼·스위치·고르기 칸이 서로 겹치는지, 줄 밖으로 나가는지, 설정 본문이 스크롤이면 스크롤 막대가 보이는지 잰다.
// 조건: pc = 844×390 마우스(호로) / ph = 796×384 터치(사신) / ph115 = ph + 글자 1.15배. 캡처 1배 docs/captures/c324/ (C324_OUT 로 바꿈)
// 실행: node scripts/c324-proof.cjs (C324_URL=<주소>)
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
if (process.env.C324_URL) process.env.C276_URL = process.env.C324_URL;
const { startServer, newGame } = require('./c276-proof.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, process.env.C324_OUT ?? 'docs/captures/c324');
const SHOTS = process.env.C324_SHOTS !== '0';
const MODES = [
  { id: 'pc', fi: 0, ctx: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 } },
  { id: 'ph', fi: 1, ctx: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true } },
  { id: 'ph115', fi: 1, scale: 1.15, ctx: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true } },
];
const TABS = ['screen', 'sound', 'battle', 'etc'];

/** 설정 본문 점검: 겹침·줄 밖·스크롤 */
function audit() {
  const grid = document.querySelector('.bha-settings__grid');
  if (!grid) return { missing: true };
  const R = (e) => e.getBoundingClientRect();
  const seen = (e) => { const r = R(e); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden'; };
  const name = (e) => (e.textContent || e.getAttribute('aria-label') || e.className).trim().replace(/\s+/g, ' ').slice(0, 24);
  const issues = [];
  const LEAF = '.bha-setrow__label, .bha-setrow__hint, .bha-setswitch__label, .bha-setswitch__track, .bha-setrow__ctl > .bha-btn, .bha-setrow__ctl > .bha-settings__choices, .bha-slider__head, .bha-slider__row, .bha-music__bar, .bha-bgmlist, .bha-testver';
  const g = R(grid);
  for (const row of grid.querySelectorAll('.bha-setrow')) {
    if (!seen(row)) continue;
    const rr = R(row);
    if (rr.left < g.left - 1 || rr.right > g.right + 1) issues.push({ kind: '줄이 판 밖(가로)', row: name(row) });
    const leaves = [...row.querySelectorAll(LEAF)].filter(seen);
    for (const a of leaves) {
      const ra = R(a);
      if (ra.left < rr.left - 1 || ra.right > rr.right + 1 || ra.top < rr.top - 1 || ra.bottom > rr.bottom + 1) issues.push({ kind: '줄 밖으로 나감', row: name(row), el: name(a) });
      if (a.matches('p') && a.scrollWidth > a.clientWidth + 1) issues.push({ kind: '글 가로 넘침', row: name(row), el: name(a) });
    }
    for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
      const a = leaves[i], b = leaves[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ra = R(a), rb = R(b);
      const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ox > 1 && oy > 1) issues.push({ kind: '겹침', row: name(row), a: name(a), b: name(b) });
    }
  }
  // 실제로 스크롤되는 칸 = 설정 본문(grid) 또는 그 바깥 쪽 칸(.bha-lcdpage__col)
  const sc = [grid, grid.closest('.bha-lcdpage__col')].find((e) => e && e.scrollHeight > e.clientHeight + 1) ?? null;
  const scrolls = !!sc;
  const rows = [...grid.querySelectorAll('.bha-setrow')].filter(seen);
  const last = rows[rows.length - 1];
  const box = R(sc ?? grid.closest('.bha-lcdpage__col') ?? grid);
  // 처음 열었을 때 맨 아래 줄이 판 아래로 잘려 보이는가 (잘리면 스크롤 표시가 있어야 한다)
  const cutAtOpen = last ? R(last).bottom > box.bottom + 1 : false;
  const cue = !!document.querySelector('.bha-settings-page .bha-settings__more:not([hidden])');
  if (cutAtOpen && !cue) issues.push({ kind: '맨 아래 줄이 잘려 보이는데 스크롤 표시 없음', row: name(last) });
  if (sc) {
    sc.scrollTop = sc.scrollHeight;
    if (last && R(last).bottom > R(sc).bottom + 1) issues.push({ kind: '맨 아래 줄이 끝까지 내려도 잘림', row: name(last) });
    sc.scrollTop = 0;
  }
  return { scrolls, scrollH: sc?.scrollHeight ?? 0, clientH: sc?.clientHeight ?? 0, cutAtOpen, cue, issues };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { runs: [], errors: [] };
  try {
    for (const m of MODES) {
      const ctx = await browser.newContext(m.ctx);
      const page = await ctx.newPage();
      if (m.scale) await page.addInitScript((k) => {
        const put = () => {
          const st = document.createElement('style');
          st.textContent = `:root{${[['xs', 12], ['sm', 13], ['md', 14], ['lg', 16], ['xl', 18], ['2xl', 22], ['3xl', 28], ['4xl', 36], ['5xl', 48]].map(([n, v]) => `--bha-fs-${n}:${(v * k).toFixed(2)}px !important;`).join('')}}`;
          document.head.append(st);
        };
        if (document.head) put(); else document.addEventListener('DOMContentLoaded', put);
      }, m.scale);
      page.on('pageerror', (e) => proof.errors.push(`${m.id}: ${e.message}`));
      const run = { mode: m.id, faction: m.fi === 0 ? 'hollow' : 'shinigami', title: {}, nest: {} };
      proof.runs.push(run);
      const tabs = async (where) => {
        for (const t of TABS) {
          await page.locator(`.bha-tab[data-tab="${t}"]`).click({ timeout: 5000 });
          await page.waitForTimeout(300);
          run[where][t] = await page.evaluate(audit);
          // 캡처 10장: 처음 화면 설정 4탭(pc·ph) + 기타 탭(둥지 pc · 글자 1.15 처음 화면)
          const want = where === 'title' ? (m.id !== 'ph115' || t === 'etc') : (m.id === 'pc' && t === 'etc');
          if (SHOTS && want) await page.screenshot({ path: path.join(OUT, `${m.id}-${where}-${t}.png`) });
        }
      };
      // ① 처음 화면 설정 (공통, 클라우드 로그인 줄 있음 — 가짜 클라우드)
      await newGame(page, srv.url, m.fi);
      await page.waitForTimeout(1500);
      await page.goto(`${srv.url}?cloudfake`); await page.waitForTimeout(1200);
      await page.getByRole('button', { name: '설정' }).first().click();
      await page.waitForTimeout(400);
      await tabs('title');
      // ② 둥지 설정 (테스트 모드: [테스트 모드 끄기]까지 나온다)
      await page.goto(`${srv.url}?test=1&cloudfake`); await page.waitForTimeout(1200);
      // 테스트 모드는 따로 된 세이브 — 새로 시작 (c290 과 같은 길)
      await page.getByRole('button', { name: '새로 시작' }).click();
      await page.waitForTimeout(300);
      await page.locator('.bha-slot').first().click();
      await page.waitForTimeout(200);
      await page.getByRole('button', { name: '확인' }).click();
      await page.waitForTimeout(300);
      await page.locator('.bha-species__card').nth(m.fi).click();
      await page.waitForTimeout(300);
      await page.getByRole('button', { name: '시작', exact: true }).click();
      await page.waitForTimeout(2500);
      await page.getByRole('button', { name: '더보기' }).first().click().catch(() => {});
      await page.waitForTimeout(300);
      await page.locator('.bha-homedock__tray').getByRole('button', { name: '설정' }).first().click().catch((e) => proof.errors.push(`${m.id} nest settings: ${e.message.split('\n')[0]}`));
      await page.waitForTimeout(900);
      try { await tabs('nest'); } catch (e) { proof.errors.push(`${m.id} nest: ${e.message.split('\n')[0]}`); await page.screenshot({ path: path.join(OUT, `err-${m.id}-nest.png`) }); }
      await ctx.close();
    }
  } finally {
    await browser.close();
    srv.stop();
  }
  let total = 0;
  for (const r of proof.runs) for (const w of ['title', 'nest']) for (const t of TABS) {
    const a = r[w][t];
    const n = a?.issues?.length ?? -1;
    total += Math.max(0, n);
    console.log(r.mode, w, t, n === 0 ? 'OK' : `NG ${n}`, a?.scrolls ? `scroll ${a.scrollH}/${a.clientH} cut=${a.cutAtOpen} cue=${a.cue}` : '', n > 0 ? JSON.stringify(a.issues.slice(0, 6)) : '');
  }
  proof.total = total;
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 1));
  console.log('issues', total, 'errors', proof.errors.length, proof.errors.slice(0, 3));
})();
