// C.332 proof (GDD 200장 보충): 적 도감 상세 — 흡수 줄 2칸 × 2줄 격자(한 칸이 쪼개지지 않음) · 머리 줄 칩 묶음(그림 아래로 안 떨어짐).
// 모드: pc-h/pc-s = 844×390 마우스(호로/사신) · ph-h/ph-s = 796×384 터치 · ph115 = 폰 사신 + 글자 1.15배. 캡처 1배 6장(pc-h·ph-s·ph115 × 강적·보스) docs/captures/c332/.
// 덤: 진화체 도감·칭호 도감 상세 머리 줄(칩 위치)·본문 줄 · 새 트랙 알림 띠와 제목 토글 버튼이 겹치는가. 실행: node scripts/c332-proof.cjs
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./c276-proof.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/captures/c332');
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PH = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true };
const MODES = [
  { id: 'pc-h', fi: 0, ctx: PC, shots: true },
  { id: 'pc-s', fi: 1, ctx: PC },
  { id: 'ph-h', fi: 0, ctx: PH },
  { id: 'ph-s', fi: 1, ctx: PH, shots: true },
  { id: 'ph115', fi: 1, ctx: PH, scale: 1.15, shots: true },
];
const SAVE_KEY = 'bha-save-test';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// 숫자 자리수가 다른 경우도 보이게(두 자리 수 하나)
const DEX = {
  'normal-basic': { seen: 7, kills: 5, absorbs: { both: 3, trait: 1, stat: 0, none: 1 }, where: 'ground:outskirts', firstAt: 1 },
  'water-swift': { seen: 2, kills: 0, absorbs: { both: 0, trait: 0, stat: 0, none: 0 }, where: 'ground:outskirts', firstAt: 1 },
  'fire-heavy-seal': { seen: 14, kills: 12, absorbs: { both: 10, trait: 0, stat: 1, none: 0 }, where: 'ground:canyon', firstAt: 1 },
  'sand-maw': { seen: 1, kills: 1, absorbs: { both: 1, trait: 0, stat: 0, none: 0 }, where: 'tower', firstAt: 1 },
};

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
  return page.evaluate(({ key, dex }) => {
    const s = JSON.parse(localStorage.getItem(key));
    s.enemyDex = dex;
    const out = { format: s.meta.format, trackNotice: s.trackNotice ?? null };
    localStorage.setItem(key, JSON.stringify(s));
    return out;
  }, { key: SAVE_KEY, dex: DEX });
}

async function continueGame(page, url) {
  await page.goto(`${url}?test=1`);
  await wait(1500);
  const cont = page.getByRole('button', { name: /이어|계속/ }).first();
  if (await cont.count()) { await cont.click(); await wait(400); }
  const slot = page.locator('.bha-slot').first();
  if (await slot.count()) { await slot.click(); await wait(200); const ok = page.getByRole('button', { name: '확인' }); if (await ok.count()) await ok.click(); }
  await wait(1200);
}

const openBook = async (page, label) => {
  await page.locator('.bha-viewtitle__btn').first().click();
  await wait(300);
  await page.locator('.bha-viewtitle__item', { hasText: label }).click();
  await wait(600);
};

// 상세 측정: 흡수 격자(칸 수·줄 수·칸 높이 = 한 줄인가·판 안) · 머리 줄(칩 묶음이 그림 오른쪽인가, 이름과 같은 줄인가) · 값 줄 줄바꿈
const measureEnemy = (page) => page.evaluate(() => {
  const r = (el) => el.getBoundingClientRect();
  const det = document.querySelector('.bha-mddetail');
  const d = det ? r(det) : null;
  const cells = [...document.querySelectorAll('.bha-edex__ab')];
  const tops = [...new Set(cells.map((c) => Math.round(r(c).top)))];
  const lefts = [...new Set(cells.map((c) => Math.round(r(c).left)))];
  const numRights = [0, 1].map((col) => [...new Set(cells.filter((_, i) => i % 2 === col).map((c) => Math.round(r(c.querySelector('.bha-edex__ab-num')).right)))]);
  const lineH = cells.length ? parseFloat(getComputedStyle(cells[0]).lineHeight) : 0;
  const art = document.querySelector('.bha-edex__art--hero');
  const title = document.querySelector('.bha-mddetail__title');
  const chips = document.querySelector('.bha-edex__chips');
  const ra = art && r(art), rt = title && r(title), rc = chips && r(chips);
  const chipTops = [...document.querySelectorAll('.bha-edex__chips .bha-chip')].map((c) => Math.round(r(c).top));
  const values = [...document.querySelectorAll('.bha-edex__value')].map((v) => ({ text: v.textContent, lines: Math.round(r(v).height / parseFloat(getComputedStyle(v).lineHeight)) }));
  return {
    title: title?.textContent,
    chips: [...document.querySelectorAll('.bha-edex__chips .bha-chip')].map((c) => c.textContent),
    absorbs: cells.map((c) => c.textContent),
    gridCols: lefts.length, gridRows: tops.length,
    cellOneLine: cells.every((c) => r(c).height <= lineH * 1.3),
    numsRightAligned: numRights.every((s) => s.length === 1),
    cellsInside: !!d && cells.every((c) => r(c).right <= d.right + 0.5),
    chipsRightOfArt: !!(ra && rc) && rc.left >= ra.right - 0.5,
    chipsOneLine: new Set(chipTops).size <= 1,
    chipsBesideTitle: !!(rt && rc) && Math.abs((rc.top + rc.bottom) / 2 - (rt.top + rt.bottom) / 2) < 6,
    chipsInside: !!(d && rc) && rc.right <= d.right + 0.5,
    values,
  };
});

// 진화체·칭호 도감 상세: 머리 줄 칩이 이름 옆/아래에 가지런한가 · 본문이 판 밖으로 나가지 않는가 · '·' 로 이은 값 줄이 칸 중간에서 쪼개지는가(글자로)
const measureOther = (page) => page.evaluate(() => {
  const r = (el) => el.getBoundingClientRect();
  const det = document.querySelector('.bha-mddetail');
  const d = det ? r(det) : null;
  const head = document.querySelector('.bha-mddetail__head');
  const title = document.querySelector('.bha-mddetail__title');
  const chip = head?.querySelector('.bha-chip');
  const body = document.querySelector('.bha-mddetail__body');
  return {
    title: title?.textContent,
    chip: chip?.textContent ?? null,
    chipBesideTitle: chip && title ? Math.abs((r(chip).top + r(chip).bottom) / 2 - (r(title).top + r(title).bottom) / 2) < 6 : null,
    bodyText: body?.textContent?.slice(0, 120),
    dotLines: body ? (body.textContent.match(/ · /g) ?? []).length : 0,
    pairs: document.querySelectorAll('.bha-mddetail__pair').length,
    pairsSplit: [...document.querySelectorAll('.bha-mddetail__pair')].filter((p) => p.getClientRects().length > 1).length,
    bodyLines: body ? Math.round(r(body).height / parseFloat(getComputedStyle(body).lineHeight)) : 0,
    inside: !!d && [...(det?.querySelectorAll('*') ?? [])].every((e) => r(e).right <= d.right + 1),
  };
});

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await startServer();
  const browser = await chromium.launch();
  const proof = { shots: [], checks: {}, errors: [] };
  try {
    for (const mode of MODES) {
      const ctx = await browser.newContext(mode.ctx);
      const page = await ctx.newPage();
      if (mode.scale) await page.addInitScript((k) => {
        const put = () => {
          const st = document.createElement('style');
          st.textContent = `:root{${[['xs', 12], ['sm', 13], ['md', 14], ['lg', 16], ['xl', 18], ['2xl', 22], ['3xl', 28], ['4xl', 36], ['5xl', 48]].map(([n, v]) => `--bha-fs-${n}:${(v * k).toFixed(2)}px !important;`).join('')}}`;
          document.head.append(st);
        };
        if (document.head) put(); else document.addEventListener('DOMContentLoaded', put);
      }, mode.scale);
      page.on('pageerror', (e) => proof.errors.push(`${mode.id}: ${e.message}`));
      const shot = async (name) => {
        if (!mode.shots) return;
        await wait(300);
        const file = `${mode.id}-${name}.png`;
        await page.screenshot({ path: path.join(OUT, file) });
        proof.shots.push(file);
      };
      await newGame(page, srv.url, mode.fi);
      const saved = await patchSave(page);
      await continueGame(page, srv.url);
      // 방 책장 → (알림 띠가 뜨는 시각 2.6초 뒤까지 기다려) 알림 띠와 제목 토글 버튼 겹침 측정
      await page.locator('.bha-prop--book').first().click();
      await wait(2600);
      proof.checks[`${mode.id}-toast`] = await page.evaluate((s) => {
        const r = (el) => el.getBoundingClientRect();
        const btn = document.querySelector('.bha-viewtitle__btn');
        const toasts = [...document.querySelectorAll('.bha-toast')];
        const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        return { trackNoticeInSave: s.trackNotice, toasts: toasts.map((t) => t.textContent), overlapsTitleBtn: !!btn && toasts.some((t) => hit(r(t), r(btn))), pointerEvents: toasts.map((t) => getComputedStyle(t).pointerEvents) };
      }, saved);
      // 알림 띠가 사라질 때까지(5.2초 유지) — 캡처에 안 섞이게
      await page.waitForFunction(() => !document.querySelector('.bha-toast'), null, { timeout: 12000 }).catch(() => {});
      // 진화체 도감(기본 탭) · 칭호 도감 상세 측정
      proof.checks[`${mode.id}-dex`] = await measureOther(page);
      await openBook(page, '칭호 도감');
      proof.checks[`${mode.id}-titles`] = await measureOther(page);
      await openBook(page, '적 도감');
      const eliteRow = page.locator('.bha-mdrow.bha-edex__row--elite').first();
      await eliteRow.scrollIntoViewIfNeeded().catch(() => {});
      await eliteRow.click();
      await wait(400);
      proof.checks[`${mode.id}-elite`] = await measureEnemy(page);
      await shot('1-elite');
      const bossRow = page.locator('.bha-mdrow.bha-edex__row--boss').first();
      await bossRow.scrollIntoViewIfNeeded().catch(() => {});
      await bossRow.click();
      await wait(400);
      proof.checks[`${mode.id}-boss`] = await measureEnemy(page);
      await shot('2-boss');
      await ctx.close();
    }
  } finally {
    await browser.close();
    srv.stop();
  }
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 1));
})();
