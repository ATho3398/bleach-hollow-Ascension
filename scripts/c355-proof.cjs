// C.355 proof (GDD 210장, 코딩246): ① 걷기 휴식 칸(영혼 웅덩이) 1바퀴·3바퀴 — 배부름·컨디션·체력 회복이 15% → 9.6% 로 줄고 리스크(광기)는 그대로(폰)
// ② 바퀴 끝 임시 타일 — 고르기 창 없이 받은 1장을 한 줄 알림으로(PC). 캡처 1배 3장 docs/captures/c355/, 수치는 proof.json.
// 실행: node scripts/c355-proof.cjs <주소> [저장 폴더]   (vite 서버는 따로 띄운다)
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const PC = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 };
const PH = { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const MODES = [
  { id: 'ph-h', fi: 0, ctx: PH, shots: ['rest-lap1', 'rest-lap3'] },
  { id: 'pc-h', fi: 0, ctx: PC, shots: ['lapend'] },
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
/** 세이브 고치기: f(t, shared) — t = 종족 트랙(nest·help·runLog·activeExpedition), 돌려준 값을 모아 준다.
 *  앱 페이지는 닫힐 때(pagehide) 지금 상태를 저장해 패치를 덮어쓰므로, 앱 페이지를 먼저 닫고 같은 출처의 앱 아닌 주소에서 고친 뒤 새 페이지로 앱을 연다 → { page, result } */
async function patchSave(ctx, url, page, src, onError) {
  await page.close();
  const blank = await ctx.newPage();
  await blank.goto(`${url}robots.txt`).catch(() => {});
  const result = await patchStorage(blank, src);
  if (process.env.TRACE) result.push(await dumpAll(blank));
  await blank.close();
  const next = await ctx.newPage();
  if (onError) next.on('pageerror', onError);
  await next.goto(`${url}?test=1`);
  return { page: next, result };
}
async function patchStorage(page, src) {
  return page.evaluate((src) => {
    const f = new Function('t', 'shared', src);
    const out = [];
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
        if (o.nest && o.help && o.runLog) out.push(f(o, o.shared ?? sh));
        for (const v of Object.values(o)) walk(v);
      };
      walk(data);
      localStorage.setItem(k, JSON.stringify(data));
    }
    return out;
  }, src);
}
async function reopen(page) {
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
/** 걷기 화면 판 막대 값(글자) + 말풍선 */
const walkState = (page) => page.evaluate(() => {
  const g = {};
  for (const e of document.querySelectorAll('.bha-lcd [data-gauge]')) g[e.dataset.gauge] = (e.querySelector('.bha-meter__value')?.textContent ?? e.textContent).trim();
  return { gauges: g, msg: document.querySelector('.bha-lcd .bha-exp__msg')?.textContent?.trim() ?? '', changing: [...document.querySelectorAll('.bha-lcd .is-changing[data-gauge]')].map((e) => e.dataset.gauge), resting: !!document.querySelector('.bha-lcd .bha-walker__heal:not([hidden])') };
});
/** 디버그: 모든 저장 키의 원정 요약 */
const dumpAll = (page) => page.evaluate(() => {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i); const raw = localStorage.getItem(k);
    if (!raw || !raw.includes('"activeExpedition"')) continue;
    const walk = (o, path) => { if (!o || typeof o !== 'object') return; if (o.activeExpedition && o.activeExpedition.exp) { const e = o.activeExpedition.exp; out.push({ k, path, pos: e.pos, lap: e.lap, phase: e.phase, hunger: e.hunger, savedAt: o.activeExpedition.savedAtMs, left: o.activeExpedition.leftAtMs }); return; } for (const [kk, v] of Object.entries(o)) walk(v, path + '.' + kk); };
    walk(JSON.parse(raw), '');
  }
  return out;
});
/** 저장된 원정 상태 읽기 */
const readExp = (page) => page.evaluate(() => {
  for (let i = 0; i < localStorage.length; i++) {
    const raw = localStorage.getItem(localStorage.key(i));
    if (!raw || !raw.includes('"activeExpedition"')) continue;
    let found = null;
    const walk = (o) => { if (!o || typeof o !== 'object' || found) return; if (o.activeExpedition && o.activeExpedition.exp) { found = o.activeExpedition.exp; return; } for (const v of Object.values(o)) walk(v); };
    walk(JSON.parse(raw));
    if (found) return { lap: found.lap, pos: found.pos, phase: found.phase, hunger: found.hunger, condition: found.condition, risk: found.risk, hp: found.hpFraction, slots: found.slots, tempLog: found.tempLog ?? [], hand: found.hand, draft: found.draft };
  }
  return null;
});
/** 저장된 원정을 '휴식 칸 바로 앞, 야생 전투 없음, 값 낮음'으로 고친다 (lap 바퀴째) */
const restPatch = (lap) => `
  const a = t.activeExpedition; if (!a || !a.exp) return 'no-exp';
  const e = a.exp; const rc = e.slots.indexOf('rest-a'); if (rc < 1) return 'no-rest-cell';
  e.lap = ${lap}; e.lapsCompleted = ${lap} - 1; while (e.battlesByLap.length < ${lap}) e.battlesByLap.push(0); // 저장 검사: battlesByLap 길이 ≥ lap e.pos = rc - 1; e.phase = 'moving'; e.wildCells = []; e.pending = null; e.queuedBattle = null; e.eventPending = null; e.draft = null;
  e.hunger = 55; e.condition = 50; e.hpFraction = 0.6; e.risk = 30; e.restMult = 1; e.restSpring = false;
  return 'ok:' + rc;`;
/** 저장된 원정을 '둥지 칸 바로 앞(pos 11), 길 비움'으로 고친다 → 다음 걸음 = 바퀴 끝 */
const lapEndPatch = `
  const a = t.activeExpedition; if (!a || !a.exp) return 'no-exp';
  const e = a.exp; e.pos = e.slots.length - 1; e.phase = 'moving'; e.wildCells = []; e.pending = null; e.queuedBattle = null; e.eventPending = null; e.draft = null;
  e.slots = e.slots.map(() => null); e.tempCells = []; e.hpFraction = 0.8; e.hunger = 30;
  return 'ok';`;

async function depart(page, c) {
  await page.locator('.bha-lcd .bha-prop--outside').first().click({ timeout: 4000 }).catch(() => {});
  await wait(900);
  await page.locator('.bha-worldmap [data-place="adventure"]').first().click({ timeout: 4000 }).catch(() => {});
  await wait(1800);
  await skipTut(page);
  const placeTab = page.locator('.bha-lcd [data-plan-side="place"]');
  if (await placeTab.count()) { await placeTab.click(); await wait(300); }
  c.restCard = await page.locator('.bha-lcd .bha-tilecard[data-tile="rest-a"]').count();
  if (c.restCard) {
    await page.locator('.bha-lcd .bha-tilecard[data-tile="rest-a"]').first().click();
    await wait(200);
    await page.locator('.bha-lcd .bha-road__cell.is-can').first().click().catch(() => {});
    await wait(200);
  }
  const prepTab = page.locator('.bha-lcd [data-plan-side="prep"]');
  if (await prepTab.count()) { await prepTab.click(); await wait(300); }
  await page.getByRole('button', { name: '★1', exact: true }).first().click().catch(() => {});
  await wait(300);
  await page.getByRole('button', { name: '출발', exact: true }).first().click({ timeout: 4000 }).catch(() => {});
  await wait(700);
  // 출발 확인 창(체력 낮음)이면 [출발]
  const yes = page.locator('.bha-confirm button, [role="dialog"] button').filter({ hasText: '출발' });
  if (await yes.count()) { await yes.first().click().catch(() => {}); await wait(700); }
  // 첫 저장(전투 직전·휴식 뒤·둥지 칸)까지 기다린다 — 걷기 중 autosave 가 없으면 첫 칸 이벤트에서 저장된다
  for (let i = 0; i < 100; i++) {
    const s = await readExp(page);
    if (s) return s;
    await wait(300);
  }
  return null;
}

async function run(url, out) {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const proof = { checks: {}, shots: [], errors: [] };
  try {
    for (const mode of MODES.filter((m) => !process.env.ONLY || process.env.ONLY.split(',').includes(m.id))) {
      const ctx = await browser.newContext(mode.ctx);
      let page = await ctx.newPage();
      const onError = (e) => proof.errors.push(`${mode.id}: ${e.message.slice(0, 160)}`);
      page.on('pageerror', onError);
      const patch = async (src) => { const r = await patchSave(ctx, url, page, src, onError); page = r.page; return r.result; };
      const shot = async (name) => {
        const file = `${mode.id}-${name}.png`;
        await page.screenshot({ path: path.join(out, file) });
        proof.shots.push(file);
      };
      const c = (proof.checks[mode.id] = {});
      /** 새 게임 → 방 값 → 모험 출발(휴식 칸 1장 놓고 ★1) → 첫 원정 저장 */
      const fresh = async (tag) => {
        await newGame(page, url, mode.fi);
        await wait(2500);
        await skipTut(page);
        await patch(`
          t.help.guides = { ...t.help.guides, 'first-run': 'done', 'home-intro': 'done', 'first-run-room': 'done', 'birth': 'done', 'recover': 'done' };
          t.nest.hpFraction = 0.9; t.nest.spa = null; t.nest.careRequest = null; t.nest.hunger = 40; t.nest.condition = 70;
          t.nest.collapsed = false; t.nest.collapsedAt = 0; t.nest.weakened = false; t.nest.tired = false; t.nest.dead = false; t.nest.feedLog = [];
          t.tiles.unlocked = true; t.tiles.collection = { ...(t.tiles.collection || {}), 'rest-a': 2, 'prey-nest-a': 2, 'elite-den-a': 1 };
        `);
        await reopen(page);
        await wait(1500);
        c[`departed${tag}`] = await depart(page, c);
        if (!c[`departed${tag}`]) proof.errors.push(`${mode.id}: 원정 저장이 없다 (${tag})`);
        return !!c[`departed${tag}`];
      };
      if (mode.shots.includes('rest-lap1')) {
        // ① 휴식 칸: 1바퀴·3바퀴 — 각각 새 게임의 출발 직후 저장을 '휴식 칸 바로 앞, n바퀴째'로 고쳐 이어하기 (걷던 원정을 고치면 닫히는 페이지의 저장과 섞인다)
        for (const lap of [1, 3]) {
          if (!(await fresh(`-lap${lap}`))) continue;
          c[`patch${lap}`] = await patch(restPatch(lap));
          await reopen(page);
          await wait(800);
          // 휴식 시작(회복 빛) → 끝(말풍선 '회복됐다') 을 기다린다
          let start = null, end = null;
          if (process.env.TRACE) { c[`trace${lap}`] = []; for (let i = 0; i < 16; i++) { await wait(500); const w = await walkState(page); const sv = await readExp(page); c[`trace${lap}`].push({ t: i * 0.5, msg: w.msg, resting: w.resting, g: w.gauges.hunger, pos: sv?.pos, phase: sv?.phase, lap: sv?.lap, screen: await page.evaluate(() => document.querySelector('.bha-lcd > *')?.className ?? ''), all: i === 0 ? await dumpAll(page) : undefined }); } }
          for (let i = 0; i < 150 && !end; i++) {
            await wait(100);
            const s = await walkState(page);
            if (!start && s.resting) start = s;
            if (/회복됐다/.test(s.msg)) end = s;
          }
          await wait(1100); // 차오름 0.8초 끝난 뒤
          const after = await walkState(page);
          if (!end) c[`debug${lap}`] = await page.evaluate(() => ({ screen: document.querySelector('.bha-lcd')?.className ?? null, text: (document.querySelector('.bha-lcd')?.textContent ?? '').replace(/\s+/g, ' ').slice(0, 300) }));
          const saved = await readExp(page);
          c[`rest${lap}`] = { start: start?.gauges ?? null, end: end?.gauges ?? null, after: after.gauges, msg: after.msg, changing: end?.changing ?? [], saved: saved && { lap: saved.lap, hunger: saved.hunger, condition: saved.condition, risk: saved.risk, hp: saved.hp } };
          await shot(`rest-lap${lap}`);
          // 바로 다음 조우 전에 멈춘다 (저장이 휴식 뒤에 되어 있다)
        }
      }
      if (mode.shots.includes('lapend')) {
        if (!(await fresh(''))) { await ctx.close(); continue; }
        // ② 바퀴 끝: 둥지 칸 직전으로 돌려 이어하기 → 70% 로 임시 타일 1장 — 받을 때까지(최대 8번) 다시 굴린다(저장된 RNG 가 매번 앞으로 간다)
        c.lapTries = [];
        for (let t = 0; t < 8; t++) {
          await patch(lapEndPatch);
          await reopen(page);
          let sheet = false;
          for (let i = 0; i < 80 && !sheet; i++) { await wait(100); sheet = (await page.locator('.bha-lcd .bha-lapend').count()) > 0; }
          await wait(600);
          const info = await page.evaluate(() => ({
            sheet: !!document.querySelector('.bha-lcd .bha-lapend'),
            title: document.querySelector('.bha-lcd .bha-lapend .bha-sheet__title')?.textContent?.trim() ?? '',
            lapTemp: document.querySelector('.bha-lcd [data-lap-temp]')?.textContent?.trim() ?? null,
            lapTempId: document.querySelector('.bha-lcd [data-lap-temp]')?.dataset.lapTemp ?? null,
            draft: !!document.querySelector('.bha-lcd .bha-draft'),
            msg: document.querySelector('.bha-lcd .bha-exp__msg')?.textContent?.trim() ?? '',
            handTemp: document.querySelectorAll('.bha-lcd .bha-lapend .i-timer, .bha-lcd .bha-lapend [data-temp]').length,
          }));
          const saved = await readExp(page);
          c.lapTries.push({ ...info, lap: saved?.lap, tempLog: saved?.tempLog, draft: saved?.draft });
          if (info.lapTemp) { await shot('lapend'); break; }
          if (!info.sheet) break;
        }
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(out, 'proof.json'), JSON.stringify(proof, null, 1));
  console.log(JSON.stringify(proof, null, 0).slice(0, 6000));
}

run(process.argv[2], path.resolve(process.argv[3] || path.join(ROOT, 'docs/captures/c355')));
