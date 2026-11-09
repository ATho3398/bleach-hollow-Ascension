// C.346·C.347 proof (GDD 209장 + 마스터 결정 14:3x — 자리는 상태창 아래 한 곳, 상태창 묶음을 올림, 코딩243): 상태창 아래 ~ 머리 위 '무엇이 바뀌나' 칩 — 바뀐 값만 · ▲/▼ · 좋음/나쁨 색 · 깜빡임 끝(최소 1초)에 사라짐 · 겹침 0 · 행동 글은 칩 위 줄(4-1, 말풍선 없음).
// 모드: pc/ph/ph115 × 호로 덩치(h)·아란칼(ha)·사신(s) 실측, 캡처 1배 6장 docs/captures/c347/. 실행: node scripts/c346-proof.cjs <주소> [저장 폴더]
// 실행: node scripts/c344-proof.cjs <주소> [저장 폴더]   (vite 서버는 따로 띄운다)
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PH = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
// 호로 기본 = 덩치 종이인형(C.345), 사신 = 사람 종이인형. pc-ha = 호로 아란칼화(사람 종이인형, 실측만)
const MODES = [
  { id: 'pc-h', fi: 0, ctx: PC, shots: ['feed'] },
  { id: 'pc-ha', fi: 0, tier: 'arr', ctx: PC, shots: [] },
  { id: 'pc-s', fi: 1, ctx: PC, shots: [] },
  { id: 'ph-h', fi: 0, ctx: PH, shots: ['feed'], food: 'basic' }, // 폰 먹이 → 짐승 고기 (209장 4-1 지적 장면)
  { id: 'ph-ha', fi: 0, tier: 'arr', ctx: PH, shots: [] },
  { id: 'ph-s', fi: 1, ctx: PH, shots: ['sleep', 'bag'], sleep: true, bag: true },
  { id: 'ph115-h', fi: 0, ctx: PH, scale: 1.15, shots: [] },
  { id: 'ph115-ha', fi: 0, tier: 'arr', ctx: PH, scale: 1.15, shots: [] },
  { id: 'ph115-s', fi: 1, ctx: PH, scale: 1.15, shots: ['feed'], spa: true },
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

/** 방·온천: 알림 칩 · 자리 · 겹침(상태창·ⓘ·이름표·버튼·그린 머리) · 말풍선 */
const noteState = (page) => page.evaluate(() => {
  const R = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return r.width && r.height ? { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) } : null; };
  const hit = (a, b) => a && b && a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
  const lcd = document.querySelector('.bha-lcd');
  const note = document.querySelector('.bha-lcd .bha-room__change:not([hidden]), .bha-actfx .bha-room__change:not([hidden])');
  const nr = note ? R(note) : null;
  const status = document.querySelector('.bha-lcd .bha-room__chips .bha-room__status');
  const info = document.querySelector('.bha-lcd .bha-room__chips .bha-room__statusinfo');
  const name = document.querySelector('.bha-lcd .bha-room__chips .bha-room__name');
  const scene = document.querySelector('.bha-lcd .bha-room__scene, .bha-lcd .bha-spa__scene') || lcd;
  // 그린 머리 윗변: 캐릭터 몸 안 보이는 그림 조각들 중 가장 위 (종이인형 조각 · 그림 한 장)
  const art = document.querySelector('.bha-lcd .bha-char__body canvas, .bha-lcd .bha-char__body img');
  let headTop = null;
  if (art) {
    const ar = art.getBoundingClientRect();
    const w = art.width || art.naturalWidth, h = art.height || art.naturalHeight;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.drawImage(art, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    outer: for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 24) { headTop = Math.round(ar.top + (y / h) * ar.height); break outer; }
  }
  const buttons = [...document.querySelectorAll('.bha-lcd .bha-prop, .bha-lcd .bha-homedock button, .bha-lcd .bha-room__hud button, .bha-lcd .bha-spa button:not(.bha-char)')].map((b) => ({ name: (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 12), r: R(b) })).filter((b) => b.r);
  const overlaps = [];
  if (nr) {
    for (const [k, r] of Object.entries({ status: R(status), info: R(info), name: R(name) })) if (hit(nr, r)) overlaps.push(`note×${k}`);
    for (const b of buttons) if (hit(nr, b.r)) overlaps.push(`note×${b.name}`);
    const cb = R(document.querySelector('.bha-lcd .bha-char'));
    if (cb && headTop !== null && hit(nr, { l: cb.l, r: cb.r, t: headTop, b: 1e9 })) overlaps.push('note×머리');
    const sr = R(scene);
    if (sr && (nr.l < sr.l || nr.r > sr.r || nr.t < sr.t)) overlaps.push('note×scene-edge');
  }
  // 상태창 묶음(이름표·박스·ⓘ) × 알림 띠·장면 위 끝 · 상태창 × 그린 머리 (올린 뒤에도)
  for (const t of document.querySelectorAll('.bha-toast')) for (const [k, r] of Object.entries({ status: R(status), name: R(name), info: R(info) })) if (hit(R(t), r)) overlaps.push(`${k}×알림띠`);
  const scr = R(scene);
  if (scr && R(name) && R(name).t < scr.t) overlaps.push('name×장면위');
  const sceneEl = document.querySelector('.bha-lcd .bha-room__scene, .bha-lcd .bha-room__body > *');
  const lift = sceneEl ? getComputedStyle(sceneEl).getPropertyValue('--note-lift') : '';
  const bubble = document.querySelector('.bha-lcd .bha-room__bubble');
  const br = bubble && !bubble.hidden ? R(bubble) : null;
  if (br && nr && hit(br, nr)) overlaps.push('bubble×note');
  return {
    note: nr ? { rect: nr, place: note.dataset.place, compact: note.classList.contains('is-compact'), say: note.querySelector('.bha-room__changesay:not([hidden])')?.textContent ?? null, chips: [...note.querySelectorAll('[data-change]')].map((c) => `${c.dataset.change}${c.dataset.dir === 'up' ? '▲' : '▼'}${c.classList.contains('bha-chip--guard') ? '+' : '-'}:${c.textContent}`) } : null,
    lift: (document.querySelector('.bha-lcd .bha-room__chips')?.parentElement?.style.getPropertyValue('--note-lift') || '0') + ' need/room ' + (document.querySelector('.bha-lcd .bha-room__chips')?.parentElement?.dataset.noteRoom ?? ''), statusBottom: R(status)?.b ?? null, headTop, gap: nr && headTop !== null ? headTop - nr.b : null,
    space: R(status) && headTop !== null ? headTop - R(status).b : null,
    bubble: br ? bubble.textContent : null,
    toast: [...document.querySelectorAll('.bha-toast')].map((t) => t.textContent.trim()),
    blinking: [...document.querySelectorAll('.is-changing[data-gauge]')].map((e) => e.dataset.gauge),
    overlaps,
  };
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
        ${mode.tier ? "t.evolution.tierIndex = 3; t.evolution.formId = 't4:normal:physical'; t.evolution.formHistory = ['t4:normal:physical']; t.evolution.ascended = true;" : ''}
      `);
      await reopen(page);
      await wait(1500);
      c.before = await noteState(page);
      // ① 먹이 직후 0.35초
      await page.locator('.bha-homedock [data-care="feed"]').first().click();
      await wait(300);
      await page.locator(mode.food ? `.bha-homedock__food[data-food="${mode.food}"]` : '.bha-homedock__food:not([disabled])').first().click();
      await wait(350);
      c.feedMid = await noteState(page);
      await shot('feed');
      await wait(3200); // 차오름 0.8 + 깜빡임 3번(0.75초 주기, 1초 이상) + 사라짐 0.2 지난 뒤
      c.feedAfter = await noteState(page);
      // ② 재우기 (요청 응답) — 폰 사신
      if (mode.sleep) {
        await patchSave(page, `t.nest.careRequest = { action: 'sleep', until: Date.now() + 600000 }; t.nest.condition = 55; t.nest.tired = false; t.nest.feedLog = [];`);
        await reopen(page);
        await wait(2600);
        await page.locator('.bha-homedock [data-care="sleep"]').first().click();
        await wait(350);
        c.sleepMid = await noteState(page);
        await shot('sleep');
        await wait(3200);
        c.sleepAfter = await noteState(page);
      }
      // ③ 방 가방 정화제 (광기·리스크 ▼ = 좋음 색)
      if (mode.bag) {
        await patchSave(page, `t.nest.feedLog = []; t.nest.risk = 40; shared.items = { ...(shared.items || {}), calm: 2 };`);
        await reopen(page);
        await wait(1500);
        await page.locator('.bha-lcd .bha-prop--chest').first().click({ timeout: 4000 }).catch(() => {});
        await wait(900);
        await page.locator('.bha-lcd [role="tab"]').filter({ hasText: '소모품' }).first().click().catch(() => {});
        await wait(300);
        await page.locator('.bha-lcd [role="tab"]').filter({ hasText: '약' }).first().click().catch(() => {});
        await wait(300);
        const card = page.locator('.bha-lcd [data-item="calm"]');
        c.bagUsed = false;
        if (await card.count()) {
          await card.first().click().catch(() => {});
          await wait(400);
          const use = page.getByRole('button', { name: '사용', exact: true });
          if (await use.count()) { await use.first().click().catch(() => {}); c.bagUsed = true; }
        }
        await wait(350);
        c.bag = await page.evaluate(() => ({
          fx: !!document.querySelector('.bha-actfx'),
          chips: [...document.querySelectorAll('.bha-actfx [data-change]')].map((c) => `${c.dataset.change}${c.dataset.dir === 'up' ? '▲' : '▼'}${c.classList.contains('bha-chip--guard') ? '+' : '-'}:${c.textContent}`),
          blinking: [...document.querySelectorAll('.bha-actfx .is-changing[data-gauge]')].map((e) => e.dataset.gauge),
          toast: [...document.querySelectorAll('.bha-toast')].map((t) => t.textContent.trim()),
        }));
        await shot('bag');
        await wait(2000);
      }
      // ④ 온천: 월드맵 → 온천, 앉아서 오르는 중
      if (mode.spa) {
        await patchSave(page, `t.nest.feedLog = []; t.nest.hpFraction = 0.3; t.nest.condition = 30; t.nest.hunger = 40; t.nest.spa = null; t.nest.careRequest = null;`);
        await reopen(page);
        await wait(1500);
        await page.locator('.bha-lcd .bha-prop--outside').first().click({ timeout: 4000 }).catch(() => {});
        await wait(900);
        await page.locator('.bha-worldmap [data-place="spa"]').first().click({ timeout: 4000 }).catch(() => {});
        await wait(300);
        await page.getByRole('button', { name: /확인|들어간다|쉰다/ }).first().click({ timeout: 1500 }).catch(() => {});
        let seen = null;
        for (let i = 0; i < 150 && !seen; i++) {
          await wait(100);
          const s = await noteState(page);
          if (s.note && (await page.locator('.bha-spa__actor.is-seated').count())) seen = s;
        }
        await wait(1200);
        c.spa = await noteState(page);
        c.spaSeen = !!seen;
        mode.shots.push('spa');
        await shot('spa');
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(proof, null, 1));
  console.log(JSON.stringify(proof, null, 0).slice(0, 9000));
}

run(process.argv[2], path.resolve(process.argv[3] || path.join(ROOT, 'docs/captures/c347')));
