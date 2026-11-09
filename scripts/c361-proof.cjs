// C.361 proof (GDD 217장 1·3·4·5, 코딩253): ① 튜토리얼 그림 강조 = 그림 모양 윤곽 ② 원정 결과 노력치 칩('힘 +3'·가득)
// ③ × 있는 창(물건 상세·도움말·설정·상점 물건) 첫 줄과 × 겹침 0 ④ 스토리 잠긴 장 = 흐린 [도전] + 여는 조건. PC 844×390 · 폰 796×384 터치, 1배.
// 쓰기: node scripts/c361-proof.cjs [저장 폴더]  (C276_URL=<주소> 이미 떠 있는 서버)
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer, newGame } = require('./c276-proof.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs/captures/c361'));
const VIEW = {
  pc: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 },
  ph: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
};
let BASE = '';

/** 페이지 안: 보이는 × (아이콘만 있는 '닫기…' 버튼)마다 같은 창 안 글이 × 와 겹치는지 */
function xCheckInPage() {
  const isX = (b) => b.offsetParent !== null && /^닫/.test(b.getAttribute('aria-label') || '') && !!b.querySelector('svg, .bha-icon') && !(b.textContent || '').trim();
  return [...document.querySelectorAll('button')].filter(isX).map((x) => {
    const xr = x.getBoundingClientRect();
    const box = x.closest('[role="dialog"], .bha-modal, .bha-win, .bha-lcdpage, .bha-app') || document.body;
    const hits = [];
    const w = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.textContent.trim() || x.contains(n)) continue;
      const pe = n.parentElement;
      if (!pe || pe.closest('[hidden]') || getComputedStyle(pe).visibility === 'hidden') continue;
      const r = document.createRange();
      r.selectNodeContents(n);
      for (const q of r.getClientRects()) {
        const ox = Math.min(q.right, xr.right) - Math.max(q.left, xr.left);
        const oy = Math.min(q.bottom, xr.bottom) - Math.max(q.top, xr.top);
        if (ox > 0.5 && oy > 0.5) { hits.push(n.textContent.trim().slice(0, 30)); break; }
      }
    }
    return { box: String(box.className).slice(0, 50), hits };
  });
}
async function skipTut(page) {
  for (let t = 0; t < 40 && (await page.locator('.bha-tut').count()); t++) {
    const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled])').filter({ visible: true });
    if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
    else await page.locator('.bha-lcd').first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
}
async function closeLayers(page) {
  for (let i = 0; i < 6 && (await page.locator('.bha-tut, .bha-lcd .bha-guide').count()); i++) {
    const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled]), .bha-lcd .bha-guide button.bha-btn--primary').filter({ visible: true });
    if (await go.count()) await go.first().click({ timeout: 1500 }).catch(() => {}); else await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
}
/** 세이브 고치기: 앱이 떠날 때 덮어쓰지 않게 정적 파일로 옮긴 뒤 */
async function patchAway(page, src) {
  await page.goto(`${BASE}manifest.webmanifest`); await page.waitForTimeout(300);
  await page.evaluate((code) => {
    const f = new Function('t', code);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const raw = localStorage.getItem(k);
      if (!raw || !raw.includes('"runLog"')) continue;
      const data = JSON.parse(raw);
      const walk = (o) => { if (!o || typeof o !== 'object') return; if (o.nest && o.help && o.runLog) f(o); for (const v of Object.values(o)) walk(v); };
      walk(data);
      localStorage.setItem(k, JSON.stringify(data));
    }
  }, src);
}
async function resume(page) {
  await page.goto(`${BASE}?test=1`); await page.waitForTimeout(1500);
  await page.getByRole('button', { name: '이어하기' }).click().catch(() => {}); await page.waitForTimeout(1500);
  await skipTut(page);
}
async function testGame(page) {
  const u = `${BASE}?test=1`;
  await page.goto(u); await page.evaluate(() => localStorage.clear()); await page.goto(u); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '새로 시작' }).click(); await page.waitForTimeout(300);
  await page.locator('.bha-slot').first().click(); await page.waitForTimeout(200);
  await page.getByRole('button', { name: '확인' }).click(); await page.waitForTimeout(300);
  await page.locator('.bha-species__card').nth(0).click(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: '시작', exact: true }).click(); await page.waitForTimeout(400);
  const nm = page.locator('[data-ident="name"]');
  if (await nm.count()) {
    await nm.fill('권영'); await page.locator('[data-ident="next"]').click(); await page.waitForTimeout(200);
    await page.locator('.bha-ident__gender').first().click(); await page.locator('[data-ident="done"]').click();
  }
  await page.waitForTimeout(1500);
  await skipTut(page);
}
const E = `const str = typeof t.activeExpedition === 'string'; const snap = str ? JSON.parse(t.activeExpedition) : t.activeExpedition; const e = snap && (snap.exp ?? snap); if (e) { `;
const END = ` } if (snap && str) t.activeExpedition = JSON.stringify(snap);`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  BASE = server.url;
  const browser = await chromium.launch();
  const facts = {};
  const errors = [];
  try {
    for (const mode of ['pc', 'ph']) {
      const page = await browser.newPage(VIEW[mode]);
      page.on('pageerror', (e) => errors.push(`${mode}: ${e.message.slice(0, 120)}`));
      const shot = async (name) => { await page.waitForTimeout(300); await page.screenshot({ path: path.join(OUT, `${mode}-${name}.png`) }); };
      const F = (facts[mode] = {});

      // ① 진짜 새 게임: 홈 안내 3/3 = [월드맵] 문 그림 강조 → 문을 누르면 월드맵 [모험] 장소 강조 (둘 다 그림 대상)
      await newGame(page, BASE, 0);
      await page.waitForTimeout(2500);
      for (let i = 0; i < 20 && !(await page.locator('.bha-tut__hole.is-shape').count()); i++) {
        const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled])').filter({ visible: true });
        if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {}); else await page.mouse.click(420, 200);
        await page.waitForTimeout(900);
      }
      const tutFacts = () => page.evaluate(() => {
        const hole = document.querySelector('.bha-tut__hole');
        const sh = [...document.querySelectorAll('.bha-tut-shape')];
        return { holeShape: hole?.classList.contains('is-shape') ?? false, holeOutline: hole ? getComputedStyle(hole).outlineStyle : null, shapes: sh.map((e) => e.closest('.bha-prop, .bha-char')?.className.match(/bha-prop--\w+|bha-char/)?.[0]), filter: sh[0] ? getComputedStyle(sh[0]).filter.slice(0, 60) : null };
      });
      F.tutDoor = await tutFacts();
      await page.locator('.bha-prop--outside').first().click().catch(() => {});
      await page.waitForTimeout(2200);
      F.tutMap = await tutFacts();
      await shot('1-tut-shape');

      // ② 테스트 모드 원정 → 바퀴 끝 [귀환] → 결과 화면 노력치 칩 (힘 +3 · 지능 +2 · 속도 +1 가득)
      await testGame(page);
      await page.locator('.bha-prop--outside').first().click(); await page.waitForTimeout(700);
      await page.locator('.bha-worldmap [data-place="adventure"]').first().click(); await page.waitForTimeout(1800);
      await closeLayers(page);
      await page.getByRole('button', { name: '출발', exact: true }).first().click(); await page.waitForTimeout(500);
      const yes = page.locator('.bha-lcd [data-dev-layer] .bha-btn').filter({ hasText: '출발' });
      if (await yes.count()) await yes.first().click();
      await page.waitForTimeout(1500);
      await patchAway(page, `${E} e.phase = 'moving'; e.pending = null; e.queuedBattle = null; e.wildCells = []; e.pos = e.slots.length - 1; e.evStart = { ...e.evolution.ev }; e.evolution.ev.atk += 3; e.evolution.ev.int += 2; e.evolution.ev.spd += 1; e.evBlocked = { spd: 2 }; ${END}`);
      await resume(page);
      for (let t = 0; t < 60; t++) {
        const ret = page.getByRole('button', { name: '귀환', exact: true }).filter({ visible: true });
        if (await ret.count()) { await ret.first().click().catch(() => {}); await page.waitForTimeout(1200); }
        if (await page.locator('.bha-resultv2').count()) break;
        const layerGo = page.locator('.bha-lcd [data-dev-layer] button.bha-btn--primary').filter({ visible: true });
        if (await layerGo.count()) await layerGo.first().click({ timeout: 1500 }).catch(() => {});
        await page.waitForTimeout(400);
      }
      await page.waitForTimeout(800);
      F.resultChips = await page.evaluate(() => ({
        chips: [...document.querySelectorAll('.bha-evchips .bha-evchips__item')].map((x) => x.textContent),
        inLeft: !!document.querySelector('.bha-result__left .bha-evchips'),
        clipped: (() => { const r = document.querySelector('.bha-evchips')?.getBoundingClientRect(); const l = document.querySelector('.bha-result__left')?.getBoundingClientRect(); return r && l ? r.bottom > l.bottom + 0.5 || r.right > l.right + 0.5 : null; })(),
      }));
      await shot('2-result-ev');
      await page.getByRole('button', { name: /로$/ }).filter({ visible: true }).last().click().catch(() => {});
      await page.waitForTimeout(1500);
      await closeLayers(page);

      // ③ × 있는 창: 가방 물건 상세 · 도움말 · 설정 · 상점 물건 상세 — × 와 첫 줄 겹침
      F.x = {};
      await page.locator('.bha-prop--chest').first().click(); await page.waitForTimeout(800);
      await page.locator('.bha-lcd .bha-itemtab').filter({ hasText: '기타' }).click(); await page.waitForTimeout(400);
      await page.locator('.bha-lcd .bha-itemcard').first().click(); await page.waitForTimeout(400);
      if (!(await page.locator('.bha-itemmodal').count())) { await page.locator('.bha-lcd .bha-itemcard').first().click(); await page.waitForTimeout(500); }
      F.x.item = await page.evaluate(xCheckInPage);
      await shot('3-item-detail');
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
      await page.keyboard.press('Escape'); await page.waitForTimeout(800);
      for (const [key, label] of [['help', '도움말'], ['settings', '설정']]) {
        await page.getByRole('button', { name: '더보기' }).click(); await page.waitForTimeout(400);
        await page.locator('.bha-homedock__tray').getByRole('button', { name: label }).click(); await page.waitForTimeout(900);
        F.x[key] = await page.evaluate(xCheckInPage);
        if (key === 'help') await shot('4-help');
        for (let i = 0; i < 4 && (await page.locator('.bha-layer[data-dev-layer], .bha-settings').count()); i++) {
          const x = page.locator('[data-dev-layer] button[aria-label^="닫"], [data-help-close]').filter({ visible: true });
          if (await x.count()) await x.first().click({ timeout: 3000 }).catch(() => {}); else await page.locator('.bha-dev__btn[aria-label="취소"]').first().click({ timeout: 3000 }).catch(() => {});
          await page.waitForTimeout(700);
        }
      }
      await resume(page); // 설정은 레이어가 아니라 화면 — 이어하기로 방에
      await page.locator('.bha-prop--outside').first().click(); await page.waitForTimeout(700);
      await page.locator('.bha-worldmap [data-place="market"]').first().click(); await page.waitForTimeout(1800);
      await closeLayers(page);
      await page.locator('.bha-market [data-spot="shop"]').first().click().catch(() => {}); await page.waitForTimeout(900);
      await page.locator('.bha-lcd .bha-itemcard').first().click().catch(() => {}); await page.waitForTimeout(500);
      if (!(await page.locator('.bha-itemmodal').count())) { await page.locator('.bha-lcd .bha-itemcard').first().click().catch(() => {}); await page.waitForTimeout(500); }
      F.x.shop = await page.evaluate(xCheckInPage);

      // ④ 스토리: 1단계 · 진행 없음 → 잠긴 3장 = 흐린 [도전] + 여는 조건 한 줄
      await patchAway(page, `t.evolution.tierIndex = 0; if (t.story) t.story = {};`);
      await resume(page);
      await page.locator('.bha-prop--outside').first().click(); await page.waitForTimeout(700);
      await page.locator('.bha-worldmap [data-place="adventure"]').first().click(); await page.waitForTimeout(1800);
      await closeLayers(page);
      await page.locator('.bha-depart-tabs').first().click(); await page.waitForTimeout(400);
      await page.getByText('스토리', { exact: true }).last().click(); await page.waitForTimeout(800);
      await closeLayers(page);
      const rows = page.locator('.bha-lcd .bha-mdrow');
      F.story = [];
      for (let i = 0; i < (await rows.count()); i++) {
        await rows.nth(i).click(); await page.waitForTimeout(300);
        F.story.push(await page.evaluate(() => {
          const d = document.querySelector('.bha-story .bha-mddetail')?.getBoundingClientRect();
          return {
            title: document.querySelector('.bha-story-ch__title')?.textContent,
            buttons: [...document.querySelectorAll('.bha-story-ep > .bha-btn')].map((b) => { const r = b.getBoundingClientRect(); return `${b.dataset.locked !== undefined ? '흐림' : '열림'}${r.width > 0 && d && r.right <= d.right + 1 ? '' : '(밖)'}`; }).join(' '),
            cond: document.querySelector('.bha-story-ep__cond')?.textContent ?? null,
          };
        }));
      }
      await shot('5-story-locked');
      await page.close();
    }
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify({ facts, errors }, null, 1));
    console.log(JSON.stringify({ facts, errors }, null, 1));
    await browser.close();
    server.stop();
  }
})();
