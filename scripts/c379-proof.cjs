// C.379 proof (GDD 229장, 코딩262): 튜토리얼 카드 [이전] 버튼 · [이전]/[다음] 한 줄 — 두 종족 튜토리얼 전체 카드 전수 실측.
// 조건 2벌: pc = 844×390 마우스 / ph = 796×384 터치. 1배. 카드마다 [이전] 유무(규칙: 첫 장·행동 대기 카드 = 없음, 그 밖 = 있음)·버튼 한 줄·화면 안,
// [이전]이 있으면 눌러 앞 장으로 갔다가(행동 대기 카드는 건너뜀) [다음]으로 돌아오는지까지. 결과 docs/captures/c379/proof.json.
// 흐름: A) 새 게임 첫 플레이 (홈 안내 → 첫 모험 안내 → 각본 전투 → 첫 흡수 → 치명상 → 회복 안내 → 다음 할 일)
//       B) 도움말 '안내 다시 보기' (홈 안내 · 첫 모험 안내 · 타일 안내 — 타일은 세이브에서 열어 둠)
// 쓰기: node scripts/c379-proof.cjs <주소> [저장 폴더]   (vite 서버는 따로 띄운다)  C379_MODES=pc,ph  C379_FACTIONS=0,1
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const BASE = process.argv[2] || 'http://localhost:5462/';
const OUT = path.resolve(process.argv[3] || path.join(ROOT, 'docs/captures/c379'));
const MODES = (process.env.C379_MODES ?? 'pc,ph').split(',');
const FACTIONS = (process.env.C379_FACTIONS ?? '0,1').split(',').map(Number);
const SHOTS = (process.env.C379_SHOTS ?? '1') === '1';
const FNAME = ['hollow', 'shinigami'];
const VIEW = {
  pc: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 },
  ph: { viewport: { width: 796, height: 384 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
};

/** 맨 위 튜토리얼 카드 실측 */
const readCard = (page) => page.evaluate(() => {
  const layers = [...document.querySelectorAll('.bha-tut')].filter((l) => l.querySelector('.bha-tut__card'));
  const L = layers.pop();
  if (!L) return null;
  const c = L.querySelector('.bha-tut__card');
  if (!c.firstChild || getComputedStyle(c).visibility === 'hidden') return { hidden: true };
  const r = c.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  const row = c.querySelector('.bha-tut__actions');
  const btns = [...(row?.querySelectorAll('button') ?? [])].map((b) => {
    const q = b.getBoundingClientRect();
    const lab = b.querySelector('.bha-tut__label');
    return { label: b.getAttribute('aria-label') || b.textContent.trim(), disabled: b.disabled, top: Math.round(q.top), bottom: Math.round(q.bottom), left: Math.round(q.left), right: Math.round(q.right), h: Math.round(q.height), labelLines: lab && getComputedStyle(lab).display !== 'none' ? Math.round(lab.getBoundingClientRect().height / parseFloat(getComputedStyle(lab).lineHeight || '20') || 1) : 0 };
  });
  const tops = btns.map((b) => b.top);
  const oneRow = btns.length <= 1 || Math.max(...tops) - Math.min(...tops) <= 1;
  const noWrap = btns.every((b) => b.h <= 44);
  const btnInCard = btns.every((b) => b.left >= r.left - 0.5 && b.right <= r.right + 0.5);
  const inView = r.left >= -0.5 && r.top >= -0.5 && r.right <= vw + 0.5 && r.bottom <= vh + 0.5;
  const step = c.querySelector('.bha-tut__step')?.textContent ?? '';
  return {
    tut: L.dataset.tutorial, step, title: c.querySelector('.bha-tut__title')?.textContent ?? '', wait: c.dataset.wait === '1', prev: c.dataset.prev === '1',
    devOnly: L.dataset.devOnly ?? null, sel: (() => { const b = row?.querySelector('button.bha-sel'); return b ? b.getAttribute('aria-label') || b.textContent.trim() : null; })(), iconic: !!row?.classList.contains('is-iconic'),
    buttons: btns.map((b) => b.label), nextOn: btns.some((b) => /다음|시작|알겠어요|닫기|배치하기|걷기|안내/.test(b.label) && !/이전|건너뛰기/.test(b.label) && !b.disabled),
    oneRow, noWrap, btnInCard, inView, card: { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }, vw, vh,
  };
});
const keyOf = (c) => `${c.tut}|${c.step}|${c.title}`;
/** 규칙 (GDD 229장 1): 첫 장 · 행동 대기 카드 = [이전] 없음, 그 밖 = 있음 */
const isFirst = (c) => /(^|\s)1 \/ \d+/.test(c.step);

async function run(browser, mode, fi, out, errors) {
  const tag = `${mode}-${FNAME[fi]}`;
  const page = await browser.newPage(VIEW[mode]);
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message.slice(0, 160)}`));
  const tap = async (loc) => { if (mode === 'ph') await loc.tap({ timeout: 2500 }); else await loc.click({ timeout: 2500 }); };
  const rows = [];
  out[tag] = rows;
  const seen = new Set();
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(OUT, `${tag}-${name}.png`) }); };
  const actBtn = (re) => page.locator('.bha-tut .bha-tut__actions button').filter({ hasText: re }).filter({ visible: true }).last();
  const clickNext = async () => {
    const b = page.locator('.bha-tut .bha-tut__actions button.bha-btn--primary:not([disabled])').filter({ visible: true }).last();
    if (await b.count()) await tap(b).catch(() => {});
  };
  const waitCardChange = async (from) => {
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(150);
      const c = await readCard(page);
      if (c && !c.hidden && keyOf(c) !== from) return c;
    }
    return readCard(page);
  };

  /** 카드 하나 기록 (+ [이전] 왕복) */
  const record = async (c, phase) => {
    const k = `${phase}|${keyOf(c)}`;
    if (seen.has(k)) return;
    seen.add(k);
    await page.waitForTimeout(250);
    c = (await readCard(page)) ?? c;
    const expectPrev = !c.wait && !isFirst(c);
    const row = { phase, tut: c.tut, step: c.step, title: c.title, wait: c.wait, prev: c.prev, deviceCursor: c.sel, expectPrev, prevOk: c.prev === expectPrev, buttons: c.buttons, iconic: c.iconic, oneRow: c.oneRow, noWrap: c.noWrap, btnInCard: c.btnInCard, inView: c.inView, card: c.card };
    if (c.prev) {
      // [이전] → 앞 장 (행동 대기 카드가 아니어야) → [다음]으로 원래 카드까지
      const from = keyOf(c);
      await tap(actBtn(/이전/)).catch((e) => errors.push(`${tag} prev: ${e.message.slice(0, 120)}`));
      const back = await waitCardChange(from);
      row.back = back && !back.hidden ? { step: back.step, title: back.title, wait: back.wait, oneRow: back.oneRow, inView: back.inView, prev: back.prev } : null;
      if (back && !back.hidden && !seenShot.has(`back-${c.tut}`)) { seenShot.add(`back-${c.tut}`); await shot(`back-${c.tut}`); }
      let cur = back;
      for (let i = 0; i < 5 && cur && keyOf(cur) !== from; i++) {
        await clickNext();
        cur = await waitCardChange(keyOf(cur));
      }
      row.returned = !!cur && keyOf(cur) === from;
    }
    rows.push(row);
    const bad = !row.prevOk || !row.oneRow || !row.noWrap || !row.btnInCard || !row.inView;
    const sk = `${c.tut}-${c.prev ? 'prev' : c.wait ? 'wait' : 'first'}`;
    if (bad) await shot(`BAD-${rows.length}`);
    else if (!seenShot.has(sk)) { seenShot.add(sk); await shot(`${String(rows.length).padStart(2, '0')}-${sk}`); }
  };
  const seenShot = new Set();

  /** 카드·화면을 사람처럼 진행 (limit ms 동안, stop() 이 참이면 끝) */
  const drive = async (phase, limit, stop) => {
    const t0 = Date.now();
    let idle = 0;
    while (Date.now() - t0 < limit) {
      if (stop && (await stop())) return true;
      const c = await readCard(page);
      if (c && !c.hidden) {
        idle = 0;
        await record(c, phase);
        const now = await readCard(page);
        if (!now || now.hidden) continue;
        if (now.nextOn) { await clickNext(); await page.waitForTimeout(300); continue; }
        // 행동 대기: 각본 블록은 bha-press, 그 밖은 강조 대상을 누른다
        if (now.devOnly && /data-sc\^="block\.|battle\.tray/.test(now.devOnly)) {
          await page.evaluate(() => document.querySelector('[data-sc="block.1"]')?.dispatchEvent(new Event('bha-press')));
        } else if (now.devOnly) {
          const t = page.locator(now.devOnly).filter({ visible: true }).first();
          if (await t.count()) await (mode === 'ph' ? t.tap({ force: true, timeout: 2000 }) : t.click({ force: true, timeout: 2000 })).catch(() => {});
          // 물건 창이 열렸으면 [사용]
          const use = page.locator('.bha-itemdialog button').filter({ hasText: /^사용/ }).filter({ visible: true });
          if (await use.count()) await tap(use.first()).catch(() => {});
        }
        await page.waitForTimeout(400);
        continue;
      }
      // 카드 없음: 화면 진행 버튼
      const go = page.locator('.bha-lcd button:not([disabled])').filter({ hasText: /^(계속|흡수|출발|확인|돌아가기|귀환|방으로|둥지로|대원실로|다음)$/ }).filter({ visible: true });
      if (await go.count()) { if (process.env.C379_DEBUG) console.log(phase, 'go', await go.last().textContent()); await tap(go.last()).catch(() => {}); await page.waitForTimeout(500); continue; }
      const absorbPick = page.locator('.bha-lcd [data-absorb-go]').filter({ visible: true });
      if (await absorbPick.count()) { if (process.env.C379_DEBUG) console.log(phase, 'pick'); await tap(absorbPick.first()).catch(() => {}); await page.waitForTimeout(400); continue; }
      idle++;
      if (idle === 40) {
        const btns = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => b.offsetParent).map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 20)));
        errors.push(`${tag} ${phase} idle: ${JSON.stringify(btns).slice(0, 400)}`);
        return false;
      }
      await page.waitForTimeout(250);
    }
    return false;
  };

  // A) 새 게임 첫 플레이
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE);
  await page.waitForTimeout(1200);
  await tap(page.getByRole('button', { name: '새로 시작' }));
  await page.waitForTimeout(300);
  await tap(page.locator('.bha-slot').first());
  await tap(page.getByRole('button', { name: '확인' }));
  await page.waitForTimeout(300);
  await tap(page.locator('.bha-species__card').nth(fi));
  await page.waitForTimeout(300);
  await tap(page.getByRole('button', { name: '시작', exact: true }));
  await page.waitForTimeout(600);
  const nm = page.locator('[data-ident="name"]');
  await nm.waitFor({ timeout: 5000 }).catch(() => {});
  if (await nm.count()) {
    await nm.fill('시험');
    await nm.press('Enter');
    await page.waitForTimeout(300);
    await tap(page.locator('.bha-ident__gender').first());
    await tap(page.locator('.bha-ident .bha-btn--primary').last());
  }
  await page.waitForTimeout(1500);
  const inRoomFree = () => page.evaluate(() => !!document.querySelector('.bha-prop--outside') && !document.querySelector('.bha-tut .bha-tut__card') && !document.querySelector('[data-tutorial="recover-wait"]'));
  let roomCount = 0;
  const backHome = async () => (await inRoomFree()) && ++roomCount >= 2; // 처음 방(홈 안내 전) 말고, 회복·다음 할 일 뒤 방
  await drive('A', 240_000, async () => {
    // 회복 안내까지 끝나고 방에 카드가 없으면 끝 (다음 할 일 카드 = first-run-room 까지 본 뒤)
    const done = await page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const raw = localStorage.getItem(localStorage.key(i));
        if (raw && raw.includes('"first-run-room":"done"')) return true;
      }
      return false;
    });
    return done && (await inRoomFree());
  });
  void backHome;

  // B) 안내 다시 보기 (타일 안내는 세이브에서 타일을 열어 둔다)
  await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const raw = localStorage.getItem(k);
      if (!raw || !raw.includes('"runLog"')) continue;
      const data = JSON.parse(raw);
      const walk = (o) => { if (!o || typeof o !== 'object') return; if (o.tiles && o.help && o.runLog && typeof o.tiles === 'object') o.tiles.unlocked = true; for (const v of Object.values(o)) walk(v); };
      walk(data);
      localStorage.setItem(k, JSON.stringify(data));
    }
  });
  await page.goto(BASE);
  await page.waitForTimeout(1200);
  await tap(page.getByRole('button', { name: '이어하기' })).catch(() => {});
  await page.waitForTimeout(1500);
  await drive('B0', 8000, async () => inRoomFree());
  for (const label of ['홈 안내', '첫 모험 안내', '타일 안내']) {
    await tap(page.locator('.bha-lcd').getByRole('button', { name: '더보기' })).catch(() => {});
    await page.waitForTimeout(500);
    await tap(page.locator('.bha-homedock__tray').getByRole('button', { name: '도움말' })).catch(() => {});
    await page.waitForTimeout(700);
    await tap(page.getByRole('button', { name: '다시 보기' }).first()).catch(() => {});
    await page.waitForTimeout(500);
    const b = page.getByRole('button', { name: label }).filter({ visible: true });
    if (!(await b.count())) { errors.push(`${tag} replay '${label}' 없음`); await page.keyboard.press('Escape'); continue; }
    await tap(b.first());
    await page.waitForTimeout(600);
    await drive(`B:${label}`, 60_000, async () => !(await page.locator('.bha-tut .bha-tut__card').count()));
  }
  // C) 전투 도움말 '튜토리얼 다시 보기' (블록 바·직접 해 보기·체인·해방 4장): 체험 전투(각본)에서 첫 카드 뒤 전투 도움말을 연다
  await page.goto(BASE);
  await page.waitForTimeout(1200);
  await tap(page.getByRole('button', { name: '이어하기' })).catch(() => {});
  await page.waitForTimeout(1500);
  await drive('C0', 8000, async () => inRoomFree());
  await tap(page.locator('.bha-lcd').getByRole('button', { name: '더보기' })).catch(() => {});
  await page.waitForTimeout(500);
  await tap(page.locator('.bha-homedock__tray').getByRole('button', { name: '도움말' })).catch(() => {});
  await page.waitForTimeout(700);
  await tap(page.getByRole('button', { name: '다시 보기' }).first()).catch(() => {});
  await page.waitForTimeout(500);
  await tap(page.getByRole('button', { name: '튜토리얼 다시 보기' }).first()).catch((e) => errors.push(`${tag} demo: ${e.message.slice(0, 100)}`));
  await page.locator('.bha-battle').waitFor({ timeout: 20_000 }).catch(() => {});
  // 첫 각본 카드('일반 공격은 자동') [다음] 뒤 = 카드 없이 전투가 흐르는 동안
  await drive('C:각본', 30_000, async () => seen.has('C:각본|script|튜토리얼 1 / 6|' + ((await readCard(page))?.title ?? '')) === false && [...seen].some((k) => k.startsWith('C:각본|script|')) && !(await page.locator('.bha-tut .bha-tut__card').count()));
  await tap(page.locator('[data-sc="help"]').first()).catch((e) => errors.push(`${tag} help: ${e.message.slice(0, 100)}`));
  await page.waitForTimeout(600);
  await tap(page.getByRole('button', { name: '다시 보기' }).filter({ visible: true }).first()).catch(() => {});
  await page.waitForTimeout(500);
  await tap(page.getByRole('button', { name: '튜토리얼 다시 보기' }).filter({ visible: true }).first()).catch((e) => errors.push(`${tag} battle replay: ${e.message.slice(0, 100)}`));
  await page.waitForTimeout(600);
  await drive('C:전투 튜토리얼', 60_000, async () => page.evaluate(() => !document.querySelector('.bha-tut[data-tutorial="true"]')));
  await page.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const out = {};
  const errors = [];
  try {
    for (const mode of MODES) for (const fi of FACTIONS) await run(browser, mode, fi, out, errors).catch((e) => errors.push(`${mode}-${FNAME[fi]}: ${String(e && e.stack || e).slice(0, 300)}`));
  } finally {
    await browser.close();
  }
  const summary = Object.fromEntries(Object.entries(out).map(([k, rows]) => [k, {
    cards: rows.length,
    withPrev: rows.filter((r) => r.prev).length,
    waitCards: rows.filter((r) => r.wait).length,
    prevRuleOk: rows.every((r) => r.prevOk),
    oneRow: rows.every((r) => r.oneRow && r.noWrap && r.btnInCard),
    inView: rows.every((r) => r.inView),
    prevRoundTrip: rows.filter((r) => r.prev).every((r) => r.returned && r.back && !r.back.wait),
    iconic: rows.filter((r) => r.iconic).length,
  }]));
  fs.writeFileSync(path.join(OUT, 'proof.json'), JSON.stringify({ summary, rows: out, errors }, null, 2));
  console.log(JSON.stringify({ summary, errors }, null, 2));
})();
