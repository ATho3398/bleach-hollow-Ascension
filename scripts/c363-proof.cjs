// C.363 proof (GDD 220장 1~4, 코딩255): 진화체 도감·적 도감 바둑판 + 상세 창 · 정렬 버튼(세이브 기억) · 4단계 진화체 이름 = 레스렉시온/참백도 이름 · '특' 칩.
// 모드: pc-h/pc-s = 844×390 마우스(호로/사신) · ph-h/ph-s = 796×384 터치. 실측 = 카드 잘림·겹침 0, 상세 창 화면 안·× 겹침 0, 기기 ▲▼✓◀ 로 열고 닫기, 정렬 기억.
// 캡처 1배 10장 이내 docs/captures/c363/. 실행: node scripts/c363-proof.cjs  (C276_URL=<주소> 이미 떠 있는 서버)
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer, press } = require('./c276-proof.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c363');
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PH = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true };
const MODES = [
  { id: 'pc-h', fi: 0, ctx: PC, shots: ['dex', 'dexDetail', 'enemy', 'enemyDetail', 'home'] },
  { id: 'pc-s', fi: 1, ctx: PC, shots: [] },
  { id: 'ph-h', fi: 0, ctx: PH, shots: [] },
  { id: 'ph-s', fi: 1, ctx: PH, shots: ['dex', 'special', 'sorted', 'home'] },
];
const SAVE_KEY = 'bha-save-test';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const DEX = {
  'normal-basic': { seen: 7, kills: 5, absorbs: { both: 3, trait: 1, stat: 0, none: 1 }, where: 'ground:outskirts', firstAt: 1 },
  'water-swift': { seen: 2, kills: 0, absorbs: { both: 0, trait: 0, stat: 0, none: 0 }, where: 'ground:outskirts', firstAt: 1 },
  'fire-heavy-seal': { seen: 14, kills: 12, absorbs: { both: 10, trait: 0, stat: 1, none: 0 }, where: 'ground:canyon', firstAt: 1, fresh: true },
  'sand-maw': { seen: 1, kills: 1, absorbs: { both: 1, trait: 0, stat: 0, none: 0 }, where: 'tower', firstAt: 1 },
};
const FORMS = ['t2:base', 't3:fire', 't3:water', 't4:fire:special', 't4:normal:physical', 't4:water:mixed', 'h4:awakened', 'h4:fusion:water+earth', 'h4:void'];

async function newGame(page, url, fi) {
  await page.goto(`${url}?test=1`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${url}?test=1`);
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
  await wait(400);
  const input = page.locator('[data-ident="name"]');
  if (await input.count()) {
    await input.fill('시험');
    await page.locator('[data-ident="next"]').click();
    await wait(200);
    await page.locator('.bha-ident__gender').first().click();
    await page.locator('[data-ident="done"]').click();
  }
  await wait(2500);
}

async function patchSave(page) {
  return page.evaluate(({ key, dex, forms }) => {
    const s = JSON.parse(localStorage.getItem(key));
    s.enemyDex = dex;
    s.formDex = forms;
    s.evolution.formId = 't4:fire:special';
    s.evolution.tierIndex = 3;
    s.evolution.formHistory = ['t2:base', 't3:fire', 't4:fire:special'];
    s.help = { ...s.help, guides: Object.fromEntries(Object.keys(s.help.guides ?? {}).map((k) => [k, 'done'])) };
    localStorage.setItem(key, JSON.stringify(s));
    return s.meta.format;
  }, { key: SAVE_KEY, dex: DEX, forms: FORMS });
}

async function continueGame(page, url) {
  await page.goto(`${url}?test=1`);
  await wait(1500);
  const cont = page.getByRole('button', { name: /이어|계속/ }).first();
  if (await cont.count()) { await cont.click(); await wait(400); }
  const slot = page.locator('.bha-slot').first();
  if (await slot.count()) { await slot.click(); await wait(200); const ok = page.getByRole('button', { name: '확인' }); if (await ok.count()) await ok.click(); }
  await wait(1500);
  for (let i = 0; i < 20 && (await page.locator('.bha-tut').count()); i++) {
    const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled])').filter({ visible: true });
    if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
    else await page.keyboard.press('Escape');
    await wait(300);
  }
}

const openBook = async (page, label) => {
  await page.locator('.bha-viewtitle__btn').first().click();
  await wait(300);
  await page.locator('.bha-viewtitle__item', { hasText: label }).click();
  await wait(600);
};

/** 격자 실측: 카드가 격자 칸 밖으로 잘리는가 · 카드끼리 겹치는가 · 이름 글자가 카드 밖으로 넘치는가 · 칸 수 */
const measureGrid = (page) => page.evaluate(() => {
  const r = (el) => el.getBoundingClientRect();
  const grid = document.querySelector('.bha-dexgrid');
  if (!grid) return { missing: true };
  const g = r(grid);
  const cards = [...grid.querySelectorAll('.bha-dexcard')];
  const rects = cards.map(r);
  let overlap = 0;
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5) overlap++;
  }
  const clippedX = rects.filter((c) => c.left < g.left - 0.5 || c.right > g.right + 0.5).length;
  const textOverflow = cards.filter((c) => [...c.querySelectorAll('.bha-dexcard__name, .bha-dexcard__marks, .bha-dexcard__art')].some((e) => { const q = r(e); const k = r(c); return q.left < k.left - 0.5 || q.right > k.right + 0.5 || q.bottom > k.bottom + 0.5; })).length;
  const cols = new Set(rects.filter((c) => Math.abs(c.top - rects[0].top) < 1).map((c) => Math.round(c.left))).size;
  const sort = document.querySelector('.bha-dexsort');
  const head = document.querySelector('.bha-lcdpage__head');
  const sr = sort && r(sort), hr = head && r(head);
  return {
    cards: cards.length, cols, overlap, clippedX, textOverflow,
    gridW: Math.round(g.width), cardW: rects[0] ? Math.round(rects[0].width) : 0, cardH: rects[0] ? Math.round(rects[0].height) : 0,
    names: cards.slice(0, 40).map((c) => c.querySelector('.bha-dexcard__name')?.textContent),
    special: cards.filter((c) => c.querySelector('.bha-eldot--special')).map((c) => c.querySelector('.bha-dexcard__name')?.textContent),
    inheritText: document.body.textContent.includes('속성 잇기'),
    captions: [...grid.querySelectorAll('.bha-dexgrid__cap')].map((c) => c.textContent),
    sort: sort?.dataset.sort ?? null,
    sortInHead: !!(sr && hr) && sr.right <= hr.right + 0.5 && sr.top >= hr.top - 0.5 && sr.bottom <= hr.bottom + 0.5,
    more: !![...document.querySelectorAll('.bha-itemmore')].some((m) => !m.hidden),
  };
});

/** 상세 창 실측: 창이 화면 안 · × 와 첫 줄 겹침 · 본문 내용 */
const measureDialog = (page) => page.evaluate(() => {
  const r = (el) => el.getBoundingClientRect();
  const m = document.querySelector('.bha-dexmodal');
  if (!m) return { open: false };
  const q = r(m);
  const x = m.querySelector('.bha-itemmodal__close');
  const xr = x && r(x);
  const head = m.querySelector('.bha-itemmodal__titles');
  const hr = head && r(head);
  const desc = m.querySelector('.bha-itemmodal__desc');
  const inside = [...m.querySelectorAll('*')].filter((e) => e.tagName !== 'IMG' && (!e.closest('.bha-itemmodal__desc') || e === desc)).every((e) => { const k = r(e); return k.width === 0 || (k.left >= q.left - 1 && k.right <= q.right + 1); });
  return {
    open: true,
    name: m.querySelector('.bha-itemmodal__name')?.textContent,
    heading: m.querySelector('.bha-itemmodal__heading')?.textContent,
    inViewport: q.left >= 0 && q.top >= 0 && q.right <= innerWidth && q.bottom <= innerHeight,
    xOverlap: !!(xr && hr) && hr.right > xr.left + 0.5,
    inside,
    body: desc?.textContent?.replace(/\s+/g, ' ').slice(0, 160),
    special: !!m.querySelector('.bha-eldot--special'),
  };
});

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) if (f.endsWith('.png')) fs.unlinkSync(path.join(OUT, f));
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { shots: [], checks: {}, errors: [] };
  try {
    for (const mode of MODES) {
      const ctx = await browser.newContext(mode.ctx);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => proof.errors.push(`${mode.id}: ${e.message}`));
      const shot = async (name) => {
        if (!mode.shots.includes(name)) return;
        await wait(300);
        const file = `${mode.id}-${mode.shots.indexOf(name) + 1}-${name}.png`;
        await page.screenshot({ path: path.join(OUT, file) });
        proof.shots.push(file);
      };
      const C = (proof.checks[mode.id] = {});
      C.format = await (async () => { await newGame(page, srv.url, mode.fi); return patchSave(page); })();
      await continueGame(page, srv.url);
      // 홈 이름표: 4단계 진화체 이름 = 레스렉시온/참백도 이름
      C.homeText = await page.evaluate(() => document.querySelector('.bha-lcd, .bha-app')?.textContent?.replace(/\s+/g, ' ').slice(0, 300));
      await shot('home');
      // 책장 → 진화체 도감
      await page.locator('.bha-prop--book').first().click();
      await wait(800);
      await page.waitForFunction(() => !document.querySelector('.bha-toast'), null, { timeout: 12000 }).catch(() => {});
      C.dex = await measureGrid(page);
      await shot('dex');
      // 4단계 카드 → 상세
      await page.locator('.bha-dexcard', { hasText: mode.fi === 0 ? '루시에르나가' : '석양홍' }).first().click();
      await wait(500);
      C.dexDetail = await measureDialog(page);
      await shot('dexDetail');
      await page.locator('.bha-dexmodal .bha-itemmodal__closebtn').click();
      await wait(300);
      // '특' 카드 (속성을 잇는 히든)
      const sp = page.locator('.bha-dexcard:has(.bha-eldot--special)').first();
      await sp.scrollIntoViewIfNeeded().catch(() => {});
      await sp.click();
      await wait(500);
      C.special = await measureDialog(page);
      await shot('special');
      await page.locator('.bha-dexmodal .bha-itemmodal__close').click();
      await wait(300);
      C.dexClosed = !(await page.locator('.bha-dexmodal').count());
      // 정렬 한 바퀴: 기본 → 이름 → 속성 → 발견 순
      C.dexSorts = [];
      for (let i = 0; i < 4; i++) {
        await page.locator('.bha-dexsort').click();
        await wait(250);
        const g = await measureGrid(page);
        C.dexSorts.push({ sort: g.sort, first: g.names.slice(0, 6), unknownLast: g.names.indexOf('???') === -1 || g.names.slice(g.names.indexOf('???')).every((n) => n === '???'), overlap: g.overlap, clippedX: g.clippedX });
      }
      // 적 도감
      await openBook(page, '적 도감');
      C.enemy = await measureGrid(page);
      await shot('enemy');
      await page.locator('.bha-dexcard.bha-edex__row--elite:not(.is-unknown)').first().click();
      await wait(500);
      C.enemyDetail = await measureDialog(page);
      C.freshCleared = await page.evaluate(() => !document.querySelector('.bha-dexcard__new'));
      await shot('enemyDetail');
      // 기기 ◀ 로 닫기, ▼ ✓ 로 열기 (기기 버튼이 있는 화면에서만)
      const hasDev = await page.locator('.bha-dev__btn').count();
      if (hasDev) {
        await press(page, 'back', 300);
        C.devBackClosed = !(await page.locator('.bha-dexmodal').count());
        await press(page, 'down');
        await press(page, 'ok', 400);
        C.devOkOpened = !!(await page.locator('.bha-dexmodal').count()) || (await page.evaluate(() => document.querySelector('.bha-sel')?.className ?? ''));
        await press(page, 'back', 300);
        C.devBackClosed2 = !(await page.locator('.bha-dexmodal').count());
      } else {
        await page.locator('.bha-dexmodal .bha-itemmodal__closebtn').click();
        await wait(300);
      }
      // 정렬: 많이 잡은 순까지 (기본 → 이름 → 속성 → 종류 → 많이 잡은 순)
      C.enemySorts = [];
      for (let i = 0; i < 4; i++) {
        await page.locator('.bha-dexsort').click();
        await wait(250);
        const g = await measureGrid(page);
        C.enemySorts.push({ sort: g.sort, first: g.names.slice(0, 5), overlap: g.overlap, clippedX: g.clippedX });
      }
      await shot('sorted');
      // 정렬 기억: 세이브에 남았는가 (다시 열어도 같은 기준)
      C.savedSort = await page.evaluate((key) => JSON.parse(localStorage.getItem(key))?.dexSort ?? null, SAVE_KEY);
      await openBook(page, '진화체 도감');
      C.dexSortAfterReopen = await page.evaluate(() => document.querySelector('.bha-dexsort')?.dataset.sort);
      await ctx.close();
    }
  } finally {
    await browser.close();
    srv.stop();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify({ shots: proof.shots, errors: proof.errors }, null, 1));
})();
