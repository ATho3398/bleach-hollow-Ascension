// C.365 proof (GDD 222장 4·6·7·8·10, 코딩258): ① 원정 결과 요약 두 칸(넘침·덮임 0) ② 전투 도중 다시 켜기 = 전투 직전 상태(체력·소모품)로 재시작 + 런 로그
// ③ 바퀴 끝 '포식 n' ④ 체력 30% 이하 소모품 칸 깜빡임 ⑤ 첫 포식 '능력치 모두 +3'. PC 844×390 · 폰 796×384 터치, 1배.
// c356-proof 바탕. 쓰기: node scripts/c365-proof.cjs [저장 폴더]  (C276_URL=<주소> 이미 떠 있는 서버)
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer, newGame } = require('./c276-proof.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs/captures/c365'));
const VIEW = {
  pc: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 },
  ph: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
};
let BASE = '';
async function patch(page, src) {
  await page.evaluate((code) => {
    const f = new Function('t', 'shared', code);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const raw = localStorage.getItem(k);
      if (!raw || !raw.includes('"runLog"')) continue;
      const data = JSON.parse(raw);
      let sh = null;
      const find = (o) => { if (!o || typeof o !== 'object' || sh) return; if (o.food && o.items && o.wanderer) { sh = o; return; } for (const v of Object.values(o)) find(v); };
      find(data);
      const walk = (o) => { if (!o || typeof o !== 'object') return; if (o.nest && o.help && o.runLog) f(o, o.shared ?? sh); for (const v of Object.values(o)) walk(v); };
      walk(data);
      localStorage.setItem(k, JSON.stringify(data));
    }
  }, src);
}
/** 세이브에서 값 읽기 (t = 트랙, shared) */
async function peek(page, src) {
  return page.evaluate((code) => {
    const f = new Function('t', 'shared', code);
    for (let i = 0; i < localStorage.length; i++) {
      const raw = localStorage.getItem(localStorage.key(i));
      if (!raw || !raw.includes('"runLog"')) continue;
      const data = JSON.parse(raw);
      let sh = null, tr = null;
      const find = (o) => { if (!o || typeof o !== 'object') return; if (!sh && o.food && o.items && o.wanderer) sh = o; if (!tr && o.nest && o.help && o.runLog) tr = o; for (const v of Object.values(o)) find(v); };
      find(data);
      if (tr) return f(tr, tr.shared ?? sh);
    }
    return null;
  }, src);
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
async function depart(page, fi) {
  const u = `${BASE}?test=1`;
  await page.goto(u); await page.evaluate(() => localStorage.clear()); await page.goto(u); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '새로 시작' }).click(); await page.waitForTimeout(300);
  await page.locator('.bha-slot').first().click(); await page.waitForTimeout(200);
  await page.getByRole('button', { name: '확인' }).click(); await page.waitForTimeout(300);
  await page.locator('.bha-species__card').nth(fi).click(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: '시작', exact: true }).click(); await page.waitForTimeout(400);
  const nm = page.locator('[data-ident="name"]');
  if (await nm.count()) {
    await nm.fill('권영'); await nm.press('Enter'); await page.waitForTimeout(300);
    await page.locator('.bha-ident__gender[data-gender="male"]').click();
    await page.locator('.bha-ident .bha-btn--primary').last().click();
  }
  await page.waitForTimeout(1500);
  await skipTut(page);
  await patch(page, `t.nest.hpFraction = 0.9; shared.items = { 'heal-salve': 2, 'heal-patch': 3 }; shared.battleItem = 'heal-salve';`);
  await page.goto(u); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '이어하기' }).click().catch(() => {}); await page.waitForTimeout(1500);
  await skipTut(page);
  await page.locator('.bha-prop--outside').first().click(); await page.waitForTimeout(700);
  await page.locator('.bha-worldmap [data-place="adventure"]').first().click(); await page.waitForTimeout(1800);
  await closeLayers(page);
  await page.getByRole('button', { name: '출발', exact: true }).first().click(); await page.waitForTimeout(500);
  const yes = page.locator('.bha-lcd [data-dev-layer] .bha-btn').filter({ hasText: '출발' });
  if (await yes.count()) await yes.first().click();
  await page.waitForTimeout(1500);
}
const E = `const str = typeof t.activeExpedition === 'string'; const snap = str ? JSON.parse(t.activeExpedition) : t.activeExpedition; const e = snap && (snap.exp ?? snap); if (e) { `;
const END = ` } if (snap && str) t.activeExpedition = JSON.stringify(snap);`;
async function patchAway(page, src) {
  await page.goto(`${BASE}manifest.webmanifest`); await page.waitForTimeout(300);
  await patch(page, src);
}
async function resume(page) {
  await page.goto(`${BASE}?test=1`); await page.waitForTimeout(1500);
  await page.getByRole('button', { name: '이어하기' }).click().catch(() => {}); await page.waitForTimeout(1500);
}
const battleFacts = (page) => page.evaluate(() => {
  const item = document.querySelector('.bha-v2role--item');
  const ic = item?.querySelector('.bha-icon');
  const num = (q) => document.querySelector(q)?.textContent?.match(/\d+\s*\/\s*\d+/)?.[0] ?? null;
  return { urge: item?.classList.contains('is-urge') ?? null, anim: ic ? getComputedStyle(ic).animationName : null, itemTitle: item?.title ?? null, me: num('.bha-unit--me'), foe: num('.bha-unit--foe') };
});
const resultFacts = (page) => page.evaluate(() => {
  const L = document.querySelector('.bha-result__left');
  const S = document.querySelector('.bha-result__scroll');
  const more = document.querySelector('.bha-result__more');
  const sr = S.getBoundingClientRect();
  const rows = [...S.querySelectorAll('.bha-info__row')].map((r) => { const b = r.getBoundingClientRect(); return { label: r.querySelector('dt')?.textContent, visible: b.top >= sr.top - 0.5 && b.bottom <= sr.bottom + 0.5 }; });
  const side = [...document.querySelectorAll('.bha-result__side .bha-info__row')].map((r) => r.querySelector('dt')?.textContent + ' ' + r.querySelector('dd')?.textContent);
  const mr = more && !more.hidden ? more.getBoundingClientRect() : null;
  return { leftOverflow: L.scrollHeight - L.clientHeight, sumOverflow: S.scrollHeight - S.clientHeight, moreShown: !!mr, moreCoversRow: mr ? rows.length > 0 && mr.top < sr.bottom - 0.5 : false, rows, side };
});

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  BASE = server.url;
  const browser = await chromium.launch();
  const facts = {};
  const errors = [];
  try {
    for (const mode of (process.env.C365_MODES || 'pc,ph').split(',')) {
      const page = await browser.newPage(VIEW[mode]);
      page.on('pageerror', (e) => errors.push(`${mode}: ${e.message.slice(0, 120)}`));
      const shot = async (name) => { await page.waitForTimeout(300); await page.screenshot({ path: path.join(OUT, `${mode}-${name}.png`) }); };
      const F = (facts[mode] = {});
      await depart(page, mode === 'pc' ? 1 : 0); // PC = 사신, 폰 = 호로

      // ④ 체력 20% 로 전투 → 소모품 칸 깜빡임
      await patchAway(page, `${E} e.phase = 'moving'; e.pending = null; e.hpFraction = 0.2; e.wildCells = [2]; e.pos = 1; e.slots[2] = null; ${END}`);
      await resume(page);
      for (let i = 0; i < 40 && !(await page.locator('.bha-battle').count()); i++) await page.waitForTimeout(300);
      await page.waitForTimeout(2200);
      F.urge = await battleFacts(page);
      await shot('1-item-urge');
      // ② 전투 중 소모품 사용 → 다시 켜기 → 전투 처음부터 · 소모품 되돌림
      await page.locator('.bha-v2role--item').first().click().catch(() => {});
      await page.waitForTimeout(1500);
      F.afterUse = { ...(await battleFacts(page)), items: await peek(page, `return shared.items['heal-salve'] ?? 0;`) };
      await page.waitForTimeout(1500);
      F.beforeReload = await battleFacts(page);
      await resume(page);
      for (let i = 0; i < 40 && !(await page.locator('.bha-battle').count()); i++) await page.waitForTimeout(300);
      await page.waitForTimeout(600);
      F.restart = { ...(await battleFacts(page)), toast: await page.locator('.bha-toast, [role="status"]').filter({ hasText: '전투 재시작' }).count(), items: await peek(page, `return shared.items['heal-salve'] ?? 0;`), log: await peek(page, `return t.runLog.battleRestarts;`) };
      await shot('2-battle-restart');

      // ③ 바퀴 끝 창: 승리 2 · 포식/정화 흡수 1
      await patchAway(page, `${E} e.phase = 'moving'; e.pending = null; e.queuedBattle = null; e.wildCells = []; e.pos = e.slots.length - 1; e.hpFraction = 0.8; e.victoriesThisLap = 2; e.acquiredTraits = [{ traitId: 't-fire-a', lap: e.lap }]; ${END}`);
      await resume(page);
      for (let t = 0; t < 60; t++) {
        if (await page.getByRole('button', { name: '귀환', exact: true }).filter({ visible: true }).count()) break;
        const layerGo = page.locator('.bha-lcd [data-dev-layer] button.bha-btn--primary').filter({ visible: true });
        if (await layerGo.count()) await layerGo.first().click({ timeout: 1500 }).catch(() => {});
        await page.waitForTimeout(400);
      }
      await page.waitForTimeout(500);
      F.lapGain = await page.locator('.bha-lapend__gain').first().textContent().catch(() => null);
      await shot('3-lapend-absorb');

      // ① 결과: 폰 = 패배(마지막 바퀴 블록·먹이·골드 잃음), PC = 귀환(얻은 것 많음)
      if (mode === 'ph') {
        await patchAway(page, `${E} e.phase = 'moving'; e.pending = null; e.queuedBattle = null; e.hpFraction = 0.01; e.wildCells = [2]; e.pos = 1; e.slots[2] = null; e.acquiredTraits = [{ traitId: 't-fire-a', lap: e.lap }, { traitId: 't-water-b', lap: e.lap }, { traitId: 't-earth-c', lap: e.lap }]; e.foodLoot = [{ food: 'basic', lap: e.lap }, { food: 'snack', lap: e.lap }]; e.goldLoot = [{ amount: 40, lap: e.lap }]; ${END}`);
        await resume(page);
        for (let t = 0; t < 120 && !(await page.locator('.bha-resultv2').count()); t++) {
          const see = page.getByRole('button', { name: /결과 보기/ }).filter({ visible: true });
          if (await see.count()) await see.first().click({ timeout: 1500 }).catch(() => {});
          const layerGo = page.locator('.bha-lcd [data-dev-layer] button.bha-btn--primary').filter({ visible: true });
          if (await layerGo.count()) await layerGo.first().click({ timeout: 1500 }).catch(() => {});
          await page.waitForTimeout(500);
        }
      } else {
        await patchAway(page, `${E} e.acquiredTraits = [{ traitId: 't-fire-a', lap: 1 }, { traitId: 't-water-b', lap: e.lap }, { traitId: 't-earth-c', lap: e.lap }]; e.foodLoot = [{ food: 'basic', lap: 1 }, { food: 'snack', lap: e.lap }]; e.goldLoot = [{ amount: 40, lap: e.lap }]; ${END}`);
        await resume(page);
        for (let t = 0; t < 60; t++) {
          const ret = page.getByRole('button', { name: '귀환', exact: true }).filter({ visible: true });
          if (await ret.count()) { await ret.first().click().catch(() => {}); await page.waitForTimeout(1200); }
          if (await page.locator('.bha-resultv2').count()) break;
          const layerGo = page.locator('.bha-lcd [data-dev-layer] button.bha-btn--primary').filter({ visible: true });
          if (await layerGo.count()) await layerGo.first().click({ timeout: 1500 }).catch(() => {});
          await page.waitForTimeout(400);
        }
      }
      await page.waitForTimeout(1000);
      if (await page.locator('.bha-resultv2').count()) {
        F.result = await resultFacts(page);
        await shot('4-result-summary');
      } else { F.result = 'no result screen'; await shot('4-debug'); F.debug = await page.evaluate(() => ({ app: [...document.querySelectorAll('.bha-lcd .bha-app')].map((e) => e.className).join('|'), layer: [...document.querySelectorAll('[data-dev-layer]')].map((e) => e.textContent.slice(0, 80)) })); }
      await page.close();
    }

    // ⑤ 첫 포식 (진짜 새 게임 튜토리얼, PC 호로): 설명 칸 '능력치 모두 +3'
    if (!process.env.C365_SKIP_TUT) {
      const page = await browser.newPage(VIEW.pc);
      page.on('pageerror', (e) => errors.push(`tut: ${e.message.slice(0, 120)}`));
      await newGame(page, BASE, 0);
      const dev = (name) => page.locator(`.bha-dev__btn[aria-label="${name}"]`).first();
      const look = () => page.evaluate(() => {
        const l = [...document.querySelectorAll('.bha-tut')].pop() ?? null;
        const sel = document.querySelector('.bha-sel');
        const only = l?.dataset.devOnly ?? null;
        return { name: l?.dataset.tutorial ?? null, only, pass: !!l?.hasAttribute('data-dev-pass'), selSc: sel?.dataset.sc ?? null, selOnly: !!(sel && only && sel.matches(only)), screen: [...document.querySelectorAll('.bha-lcd .bha-app')].map((e) => e.className).join('|'), stat: document.querySelector('[data-line="stat"]')?.textContent ?? null };
      });
      let got = null;
      for (let t = 0; t < 700 && !got; t++) {
        const st = await look().catch(() => ({}));
        if (st.stat) { got = st; break; }
        if (await page.locator('.bha-battle').count()) {
          if (st.name === 'script') {
            const acting = st.pass && st.only;
            if (acting && !(st.selSc === 'guard' || String(st.selSc).startsWith('block.'))) await dev('아래').click().catch(() => {});
            else await dev('확정').click().catch(() => {});
            await page.waitForTimeout(acting ? 1500 : 300);
            continue;
          }
          await page.waitForTimeout(250);
          continue;
        }
        const go = page.locator('.bha-lcd [data-dev-layer] button.bha-btn--primary:not([disabled])').filter({ visible: true });
        if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
        else if (st.only) await dev(st.selOnly ? '확정' : '아래').click().catch(() => {});
        else if (t > 8 && st.screen?.includes('worldmap')) await page.locator('.bha-worldmap [data-place="adventure"]').click({ timeout: 2000 }).catch(() => {});
        else if (t > 8) await page.locator('.bha-prop--outside, .bha-prop--door').first().click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(400);
      }
      facts.firstAbsorb = got;
      if (got) { await page.waitForTimeout(500); await page.screenshot({ path: path.join(OUT, 'pc-5-first-absorb.png') }); }
      await page.close();
    }
  } finally {
    fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify({ facts, errors }, null, 1));
    console.log(JSON.stringify({ facts, errors }, null, 1));
    await browser.close();
    server.stop();
  }
})();
