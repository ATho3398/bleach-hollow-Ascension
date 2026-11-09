// C.349 proof (GDD 209장 보충, 코딩243): 방·온천에서는 위 가장자리 공용 알림 띠('새 트랙 … 열렸다'·'체력이 가득 찼다')가 장면 아래쪽(하단 버튼 줄 바로 위)에 뜬다.
// 띠 × 이름표·상태창·ⓘ·물건 버튼(이름표)·하단 버튼·바뀐 값 알림·장면 밖 겹침 0 (발밑 체력 막대를 덮는지는 hpCover 로 따로 기록). 모드: pc/ph/ph115 × 호로 덩치(h)·사신(s). 캡처 1배 2장 docs/captures/c349/.
// 실행: node scripts/c349-proof.cjs <주소> [저장 폴더]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PH = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
// 호로 기본 = 덩치 종이인형(C.345), 사신 = 사람 종이인형. pc-ha = 호로 아란칼화(사람 종이인형, 실측만)
const MODES = [
  { id: 'pc-h', fi: 0, ctx: PC, shots: ['toast'] },
  { id: 'pc-s', fi: 1, ctx: PC, shots: [], spa: true },
  { id: 'ph-h', fi: 0, ctx: PH, shots: [] },
  { id: 'ph-s', fi: 1, ctx: PH, shots: ['toast'], spa: true },
  { id: 'ph115-h', fi: 0, ctx: PH, scale: 1.15, shots: [] },
  { id: 'ph115-s', fi: 1, ctx: PH, scale: 1.15, shots: [], spa: true },
];
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


const toastState = (page) => page.evaluate(() => {
  const R = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return r.width && r.height ? { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) } : null; };
  const hit = (a, b) => a && b && a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
  const q = (s) => [...document.querySelectorAll(`.bha-lcd ${s}`)];
  const toasts = q('.bha-toast').map((t) => ({ text: t.textContent.trim(), low: t.classList.contains('is-low'), r: R(t) }));
  const things = {
    status: q('.bha-room__status'), name: q('.bha-room__name'), info: q('.bha-room__statusinfo'), note: q('.bha-room__change:not([hidden])'),
    prop: q('.bha-prop'), dock: q('.bha-homedock button'), btn: q('.bha-spa button:not(.bha-char), .bha-room__hud button'),
  };
  const overlaps = [];
  for (const t of toasts) for (const [k, els] of Object.entries(things)) for (const e of els) if (hit(t.r, R(e))) overlaps.push(`toast×${k}:${(e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 8)}`);
  const scene = R(document.querySelector('.bha-lcd .bha-room__scene, .bha-lcd .bha-spa__scene') || document.querySelector('.bha-lcd'));
  for (const t of toasts) if (scene && (t.r.t < scene.t || t.r.b > scene.b)) overlaps.push('toast×장면밖');
  const hpCover = toasts.some((t) => q('.bha-room__hp').some((e) => hit(t.r, R(e))));
  return { toasts, overlaps, hpCover };
});

async function run(url, out) {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const proof = { checks: {}, shots: [], errors: [] };
  try {
    for (const mode of MODES.filter((m) => !process.env.ONLY || process.env.ONLY.split(',').includes(m.id))) {
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
      const c = (proof.checks[mode.id] = {});
      await newGame(page, url, mode.fi);
      await wait(2500);
      await skipTut(page);
      await patchSave(page, `
        t.help.guides = { ...t.help.guides, 'first-run': 'done', 'home-intro': 'done', 'first-run-room': 'done', 'birth': 'done', 'recover': 'done' };
        t.nest.hpFraction = 0.4; t.nest.spa = null; t.nest.careRequest = null; t.nest.hunger = 70; t.nest.condition = 45; t.nest.risk = 30;
        t.nest.collapsed = false; t.nest.collapsedAt = 0; t.nest.weakened = false; t.nest.tired = false; t.nest.dead = false; t.nest.feedLog = [];
        for (const k of Object.keys(shared.food)) shared.food[k] = 5;
      `);
      await reopen(page);
      await wait(1500);
      // 먹이 → '새 트랙 … 열렸다' 띠 (테스트 세이브에서 이때 뜬다)
      await page.locator('.bha-homedock [data-care="feed"]').first().click();
      await wait(300);
      await page.locator('.bha-homedock__food:not([disabled])').first().click();
      let seen = null;
      for (let i = 0; i < 30 && !seen; i++) {
        await wait(100);
        const s = await toastState(page);
        if (s.toasts.length) seen = s;
      }
      await wait(400);
      c.room = await toastState(page);
      c.roomSeen = !!seen;
      await shot('toast');
      // 온천 '체력이 가득 찼다' 띠
      if (mode.spa) {
        await wait(3000);
        await patchSave(page, `t.nest.feedLog = []; t.nest.hpFraction = 0.995; t.nest.condition = 99.6; t.nest.hunger = 40; t.nest.spa = null; t.nest.careRequest = null;`);
        await reopen(page);
        await wait(1500);
        await page.locator('.bha-lcd .bha-prop--outside').first().click({ timeout: 4000 }).catch(() => {});
        await wait(900);
        await page.locator('.bha-worldmap [data-place="spa"]').first().click({ timeout: 4000 }).catch(() => {});
        let s2 = null;
        for (let i = 0; i < 200 && !s2; i++) {
          await wait(100);
          const s = await toastState(page);
          if (s.toasts.some((t) => t.text.includes('가득'))) s2 = s;
        }
        await wait(500); // 들어오는 연출(아래에서 올라옴) 끝난 뒤
        c.spa = s2 ? await toastState(page) : null;
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(proof, null, 1));
  console.log(JSON.stringify(proof.checks, null, 0).slice(0, 8000), proof.errors);
}

run(process.argv[2], path.resolve(process.argv[3] || path.join(ROOT, 'docs/captures/c349')));
