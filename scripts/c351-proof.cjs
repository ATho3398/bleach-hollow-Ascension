// C.351 proof (GDD 211장 — 먹이 = 적힌 효과만, 코딩247): 방 먹이 카드 효과 줄 ↔ 먹인 직후 바뀐 값 칩 전수, 카드 넘침, 캡처 1배 2장 docs/captures/c351/.
// 실행: node scripts/c351-proof.cjs <주소> [저장 폴더]   (vite 서버는 따로 띄운다)
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PH = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function skipTut(page) {
  for (let t = 0; t < 40 && (await page.locator('.bha-tut').count()); t++) {
    const go = page.locator('.bha-tut button.bha-btn--primary:not([disabled])').filter({ visible: true });
    if (await go.count()) await go.first().click({ timeout: 2000 }).catch(() => {});
    else await page.locator('.bha-lcd').first().click({ timeout: 2000 }).catch(() => {});
    await wait(400);
  }
}
async function patchSave(page, src) {
  await page.evaluate((src) => {
    const f = new Function('t', 'shared', src);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const raw = localStorage.getItem(k);
      if (!raw || !raw.includes('"runLog"')) continue;
      const data = JSON.parse(raw);
      let sh = null;
      const find = (o) => { if (!o || typeof o !== 'object' || sh) return; if (o.food && o.items && o.wanderer) { sh = o; return; } for (const v of Object.values(o)) find(v); };
      find(data);
      const walk = (o) => {
        if (!o || typeof o !== 'object') return;
        if (o.nest && o.help && o.runLog) f(o, o.shared ?? sh);
        for (const v of Object.values(o)) walk(v);
      };
      walk(data);
      localStorage.setItem(k, JSON.stringify(data));
    }
  }, src);
}
async function reopen(page) {
  await page.reload();
  await wait(1500);
  const cont = page.getByRole('button', { name: /이어하기|불러오기/ });
  if (await cont.count()) { await cont.first().click().catch(() => {}); await wait(500); }
  const slot = page.locator('.bha-slot').first();
  if (await slot.count()) { await slot.click().catch(() => {}); await page.getByRole('button', { name: '확인' }).click().catch(() => {}); await wait(1500); }
  await skipTut(page);
}
async function newGame(page, url, fi) {
  const u = `${url}?test=1`;
  await page.goto(u);
  await page.evaluate(() => localStorage.clear());
  await page.goto(u);
  await wait(1200);
  await page.getByRole('button', { name: '새로 시작' }).click();
  await wait(300);
  await page.locator('.bha-slot').first().click();
  await page.getByRole('button', { name: '확인' }).click();
  await wait(300);
  await page.locator('.bha-species__card').nth(fi).click();
  await wait(300);
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await wait(400);
  const nm = page.locator('[data-ident="name"]');
  if (await nm.count()) {
    await nm.fill(fi === 0 ? '권영' : 'Rukia');
    await nm.press('Enter');
    await wait(300);
    await page.locator('.bha-ident__gender[data-gender="male"]').click();
    await page.locator('.bha-ident .bha-btn--primary').last().click();
  }
}


const MODES = [
  { id: 'ph-h', fi: 0, ctx: PH, shots: ['tray', 'fed'] },
  { id: 'ph-s', fi: 1, ctx: PH, shots: [] },
  { id: 'pc-h', fi: 0, ctx: PC, shots: [] },
  { id: 'ph115-s', fi: 1, ctx: PH, scale: 1.15, shots: [] },
];
const cards = (page) => page.evaluate(() => [...document.querySelectorAll('.bha-homedock__food')].map((b) => {
  const r = b.getBoundingClientRect();
  const fx = b.querySelector('.bha-homedock__foodfx');
  const fr = fx.getBoundingClientRect();
  const over = [...b.querySelectorAll('.bha-homedock__fx, .bha-homedock__foodname')].some((e) => { const q = e.getBoundingClientRect(); return q.left < r.left - 0.5 || q.right > r.right + 0.5 || q.top < r.top - 0.5 || q.bottom > r.bottom + 0.5; });
  return { food: b.dataset.food, fx: [...b.querySelectorAll('[data-fx]')].map((e) => `${e.dataset.fx}${e.textContent}`), text: fx.textContent, title: b.title, lines: Math.round(fr.height), w: Math.round(r.width), h: Math.round(r.height), overflow: over };
}));
const chipsNow = (page) => page.evaluate(() => [...document.querySelectorAll('.bha-room__change:not([hidden]) [data-change]')].map((c) => `${c.dataset.change}${c.dataset.dir === 'up' ? '▲' : '▼'}`));

async function run(url, out) {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const proof = { checks: {}, shots: [], errors: [] };
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
      page.on('pageerror', (e) => proof.errors.push(`${mode.id}: ${e.message.slice(0, 160)}`));
      const shot = async (name) => {
        if (!mode.shots.includes(name)) return;
        const file = `${mode.id}-${name}.png`;
        await page.screenshot({ path: path.join(out, file) });
        proof.shots.push(file);
      };
      const c = (proof.checks[mode.id] = { feeds: [] });
      await newGame(page, url, mode.fi);
      await wait(2500);
      await skipTut(page);
      await patchSave(page, `
        t.help.guides = { ...t.help.guides, 'first-run': 'done', 'home-intro': 'done', 'first-run-room': 'done', 'birth': 'done', 'recover': 'done' };
        t.nest.hpFraction = 0.4; t.nest.spa = null; t.nest.careRequest = null; t.nest.hunger = 70; t.nest.condition = 45; t.nest.risk = 30; t.nest.stability = 50;
        t.nest.collapsed = false; t.nest.collapsedAt = 0; t.nest.weakened = false; t.nest.tired = false; t.nest.dead = false; t.nest.feedLog = []; t.nest.feedCount = 0; t.nest.lastFedAt = 0;
        for (const k of Object.keys(shared.food)) shared.food[k] = 5;
      `);
      await reopen(page);
      await wait(1500);
      await page.locator('.bha-homedock [data-care="feed"]').first().click();
      await wait(400);
      c.cards = await cards(page);
      await shot('tray');
      // 먹이마다: 카드에 적힌 효과 ↔ 먹인 직후 바뀐 값 칩 (교감은 칩 없음). 10분 3개 한도라 매번 한도 초기화
      for (const food of ['snack', 'basic', 'hearty', 'tonic', 'feast']) {
        await patchSave(page, `t.nest.feedCount = 0; t.nest.lastFedAt = 0; t.nest.hunger = 70; t.nest.condition = 45; t.nest.hpFraction = 0.4; t.nest.careRequest = null;`);
        await reopen(page);
        await wait(1200);
        await page.locator('.bha-homedock [data-care="feed"]').first().click();
        await wait(300);
        const card = (await cards(page)).find((x) => x.food === food);
        await page.locator(`.bha-homedock__food[data-food="${food}"]`).first().click();
        await wait(350);
        const chips = await chipsNow(page);
        const want = card.fx.map((s) => s.match(/^[a-z]+/)[0]).filter((k) => k !== 'bond').map((k) => `${k}${card.fx.find((s) => s.startsWith(k)).includes('−') ? '▼' : '▲'}`);
        c.feeds.push({ food, card: card.fx, chips, match: JSON.stringify(chips) === JSON.stringify(want) });
        if (food === 'snack') await shot('fed');
        await wait(3000);
      }
      await ctx.close();
    }
  } catch (e) {
    proof.errors.push(String(e && e.stack || e).slice(0, 400));
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(proof, null, 1));
  console.log(JSON.stringify(proof, null, 1).slice(0, 6000));
}
run(process.argv[2], path.resolve(process.argv[3] || path.join(ROOT, 'docs/captures/c351')));
