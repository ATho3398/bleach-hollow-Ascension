// UI 코딩 에러 전수 검수 (GDD 110장 2, C.182). `npm run ui-audit` (CI 에는 안 넣음).
// 두 종족 × 화면마다: ① 정적 점검(가로 스크롤·버튼/글자 잘림·겹침·가려짐·키보드로 못 고르는 칸) ② ▼ 를 돌려 모든 버튼에 닿는지
// ③ 상태 바꾸기(체크·토글·탭·선택·삭제·ⓘ 열기 …) 전후로 다른 버튼이 움직였는지(bounding box 비교).
// 테스트 모드(?test=1, 따로 된 테스트 세이브 칸)로 돈다. 뷰포트 = 게임 기준 가로 844×390, 1배.
// 옵션: UI_AUDIT_URL=<이미 떠 있는 주소> (없으면 vite 를 띄운다), UI_AUDIT_ONLY=<화면 이름 일부>, UI_AUDIT_SHOTS=<폴더> (화면마다 캡처)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { snapshotInPage, staticInPage } = require('./checks.cjs');
const { SCREENS } = require('./screens.cjs');

const ROOT = path.resolve(__dirname, '../..');
const PORT = 5199;
const MOVE_TOL = 1.5;

async function startServer() {
  if (process.env.UI_AUDIT_URL) return { url: process.env.UI_AUDIT_URL, stop: () => {} };
  const p = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe' });
  const url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return { url, stop: () => p.kill() };
    } catch { /* 아직 */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  p.kill();
  throw new Error('vite 서버가 뜨지 않았다');
}

/** 화면 하나를 다루는 손잡이: 클릭·키·대기 + 점검 기록 */
function makeHelper(page, faction, report) {
  const h = {
    page,
    faction,
    wait: (ms = 350) => page.waitForTimeout(ms),
    async click(target, opts = {}) {
      const loc = typeof target === 'string' ? page.locator(target) : target;
      await loc.first().click({ timeout: opts.timeout ?? 4000, force: opts.force });
      await h.wait(opts.ms ?? 350);
    },
    async btn(name, opts = {}) {
      const scope = opts.within ? page.locator(opts.within) : page.locator('.bha-lcd');
      await h.click(scope.getByRole(opts.role ?? 'button', { name, exact: opts.exact ?? false }), opts);
    },
    async key(k, n = 1) {
      for (let i = 0; i < n; i++) {
        await page.keyboard.press(k);
        await page.waitForTimeout(60);
      }
      await h.wait(250);
    },
    back: () => h.key('Escape'),
    /** 열린 레이어(창·확인 창·ⓘ)를 뒤로로 모두 닫는다 */
    async closeLayers() {
      for (let i = 0; i < 4 && (await h.has('.bha-lcd [data-dev-layer]')); i++) await h.back();
    },
    has: async (sel) => (await page.locator(sel).count()) > 0,
    snap: () => page.evaluate(snapshotInPage),
    /** 상태 바꾸기 전후 버튼 위치 비교. ignore = 움직여도 되는 요소(정규식, key 에 대해) */
    async stable(screen, action, fn, ignore = null, target = null) {
      // 누를 요소를 먼저 화면 안으로 스크롤해 둔다 — 클릭이 스크롤을 일으켜 모든 버튼이 움직인 것처럼 보이지 않게
      if (target) await target.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
      if (target) await h.wait(150);
      const before = await h.snap();
      await page.evaluate(() => {
        // 원인 찾기용: LCD 안 모든 요소의 크기
        window.__auditSizes = new Map([...document.querySelectorAll('.bha-lcd *')].map((e) => { const r = e.getBoundingClientRect(); return [e, `${Math.round(r.width)}x${Math.round(r.height)}`]; }));
      });
      try {
        await fn();
      } catch (e) {
        report.push({ faction, screen, kind: '조작 실패', key: action, detail: process.env.UI_AUDIT_DEBUG ? String(e.message).slice(0, 900) : String(e.message).split('\n')[0] });
        return false;
      }
      await h.wait(250);
      const after = await h.snap();
      // 다시 그려져 요소가 바뀐 화면은 같은 이름(key)으로 짝짓는다
      const byKey = new Map(Object.values(after).map((v) => [v.key, v]));
      let cause = null;
      const why = async () => {
        if (cause !== null) return cause;
        cause = await page.evaluate(() => {
          // 크기가 바뀐 요소 중 자식 중에는 바뀐 게 없는 가장 안쪽 것 (새로 생긴 요소도)
          const m = window.__auditSizes;
          const changed = [];
          for (const e of document.querySelectorAll('.bha-lcd *')) {
            const r = e.getBoundingClientRect();
            const now = `${Math.round(r.width)}x${Math.round(r.height)}`;
            const was = m.get(e);
            if (was === now) continue;
            if (was === undefined && (r.width === 0 || e.parentElement && !m.has(e.parentElement))) continue;
            changed.push([e, was ?? 'new', now]);
          }
          const inner = changed.filter(([e]) => !changed.some(([f]) => f !== e && e.contains(f)));
          return inner.slice(0, 3).map(([e, w, n]) => `${e.tagName.toLowerCase()}.${[...e.classList].slice(0, 2).join('.')} ${w}→${n}`).join(', ');
        });
        return cause;
      };
      for (const [id, a] of Object.entries(before)) {
        const b = after[id] ?? byKey.get(a.key);
        if (!b) continue;
        if (ignore && ignore.test(a.key)) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        if (Math.abs(dx) > MOVE_TOL || Math.abs(dy) > MOVE_TOL) {
          report.push({ faction, screen, kind: '상태 바꿈에 버튼 이동', key: a.key, detail: `${action}: (${Math.round(dx)}, ${Math.round(dy)})px · 크기 바뀐 곳: ${await why()}` });
        }
      }
      return true;
    },
    /** 정적 점검 + ▼ 순환으로 모든 조작 요소에 닿는지 */
    async check(screen, opts = {}) {
      if (process.env.UI_AUDIT_DUMP) {
        const list = await page.evaluate(() => [...document.querySelectorAll('.bha-lcd button, .bha-lcd [role="tab"], .bha-lcd input')].filter((e) => e.getClientRects().length > 0).map((e) => `${[...e.classList].filter((c) => c.startsWith('bha-')).slice(0, 2).join('.')}|${(e.getAttribute('aria-label') || e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 18)}`));
        console.log(`\n## ${faction} ${screen}\n${list.join('\n')}`);
      }
      const reached = opts.keys !== false ? await h.reach(screen, opts) : [];
      const issues = await page.evaluate(staticInPage, reached);
      for (const i of issues) {
        if (opts.ignore && opts.ignore.test(`${i.kind}|${i.key}`)) continue;
        report.push({ faction, screen, ...i });
      }
      if (process.env.UI_AUDIT_SHOTS) {
        const dir = process.env.UI_AUDIT_SHOTS;
        fs.mkdirSync(dir, { recursive: true });
        await page.screenshot({ path: path.join(dir, `${faction}-${screen.replace(/[^\w가-힣-]+/g, '_')}.png`) });
      }
    },
    /**
     * 공용 탐색: 정적 점검 → 탭(탭·제목 토글)마다 눌러 전후 비교·점검 → ⓘ 마다 열어 비교·점검·닫기 → 목록 칸 하나 고르기 전후 비교.
     * opts.tabs=false·opts.infos=false·opts.pick=<선택자> 로 조절
     */
    async explore(screen, opts = {}) {
      await h.check(screen, opts);
      if (opts.tabs !== false) {
        // 탭을 누르면 화면이 다시 그려지므로 매번 다시 찾는다(순서 번호로)
        const TABS = '.bha-lcd [role="tab"], .bha-lcd .bha-itemtab, .bha-lcd .bha-viewtitle__btn';
        const tabsNow = () => page.evaluate((sel) => [...document.querySelectorAll(sel)].filter((e) => e.getClientRects().length > 0).map((e) => (e.getAttribute('aria-label') || e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 16)), TABS);
        const first = await tabsNow();
        for (const lab of first.slice(0, opts.maxTabs ?? 12)) {
          const i = (await tabsNow()).indexOf(lab);
          if (i < 0) continue;
          const loc = page.locator(TABS).filter({ visible: true }).nth(i);
          const ok = await h.stable(screen, `탭 '${lab}'`, () => loc.click({ timeout: 3000 }), opts.tabIgnore ?? null, loc);
          if (ok) await h.check(`${screen}/탭 ${lab}`, { ...opts, keys: opts.tabKeys ?? false });
          if (ok && opts.onTab) await opts.onTab(lab, `${screen}/탭 ${lab}`);
          // 제목 토글(펼침 목록)은 열기만 했으니 닫는다
          if (await h.has('.bha-viewtitle__list:not([hidden])')) await h.back();
        }
      }
      if (opts.infos !== false) {
        // 맨 위 층(열린 창이 있으면 그 안)의 ⓘ 만
        const scopeSel = (await h.has('.bha-lcd [data-dev-layer]')) ? '.bha-lcd [data-dev-layer]:last-of-type .bha-info:visible' : '.bha-lcd .bha-info:visible';
        const n = await page.locator(scopeSel).count();
        for (let i = 0; i < Math.min(n, 8); i++) {
          const loc = page.locator(scopeSel).nth(i);
          const lab = (await loc.getAttribute('aria-label')) || `ⓘ${i}`;
          const ok = await h.stable(screen, `${lab} 열기`, () => loc.click({ timeout: 3000 }), null, loc);
          if (ok) await h.check(`${screen}/${lab}`, { keys: false });
          await h.back();
        }
      }
      // 제목 토글(▾)의 다른 보기마다 열어 같은 탐색 (보기 전환 = 상태 바꿈: 제목·머리 버튼이 안 움직여야 한다)
      if (opts.views && (await h.has('.bha-lcd .bha-viewtitle__btn'))) {
        await h.click('.bha-lcd .bha-viewtitle__btn');
        const labels = await page.locator('.bha-lcd .bha-viewtitle__item').allTextContents();
        await h.back();
        for (const [i, lab] of labels.entries()) {
          if (i === 0 && !opts.viewsFirst) continue;
          await h.closeLayers();
          await h.click('.bha-lcd .bha-viewtitle__btn');
          const item = page.locator('.bha-lcd .bha-viewtitle__item').nth(i);
          const ok = await h.stable(screen, `보기 '${lab.trim()}'`, () => item.click({ timeout: 3000 }), /viewtitle__item/);
          if (ok) await h.explore(`${screen}/${lab.trim()}`, { ...opts, views: false, ...(opts.viewOpts?.[lab.trim()] ?? {}) });
        }
        // 첫 보기로 돌아온다(뒤 단계가 처음 보기를 전제로)
        await h.closeLayers();
        await h.click('.bha-lcd .bha-viewtitle__btn');
        await page.locator('.bha-lcd .bha-viewtitle__item').first().click({ timeout: 3000 }).catch(() => {});
        await h.wait(500);
      }
      if (opts.pick) {
        const loc = page.locator(opts.pick);
        const cnt = await loc.count();
        if (cnt > 1) await h.stable(screen, '목록 칸 고르기', () => loc.nth(Math.min(1, cnt - 1)).click({ timeout: 3000 }), opts.pickIgnore ?? null, loc.nth(Math.min(1, cnt - 1)));
        if (cnt > 1) await h.check(`${screen}/고른 뒤`, { ...opts, keys: false });
      }
    },
    async reach(screen, opts = {}) {
      const res = await page.evaluate(() => {
        const lcd = document.querySelector('.bha-lcd');
        const sel = lcd.querySelector('.bha-sel');
        const layer = [...lcd.querySelectorAll('[data-dev-layer]')].pop();
        const scope = layer || (sel && sel.closest('.bha-overlay')) || lcd;
        const SEL = 'button, a[href], input, select, summary, [role="tab"]';
        const vis = (e) => !e.closest('[hidden], [inert], .bha-dev__side') && !e.disabled && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
        return { n: [...scope.querySelectorAll(SEL)].filter(vis).length };
      });
      const reached = new Set();
      const steps = Math.min(res.n * 2 + 4, 140); // 고르면 오른쪽 상세가 바뀌어 칸 수가 늘 수 있어 넉넉히
      for (let i = 0; i < steps; i++) {
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(25);
        const id = await page.evaluate(() => {
          const s = document.querySelector('.bha-lcd .bha-sel');
          if (!s) return null;
          if (!s.dataset.reach) s.dataset.reach = String(Math.random()).slice(2);
          return s.dataset.reach;
        });
        if (id) reached.add(id);
      }
      const missed = await page.evaluate((ids) => {
        const lcd = document.querySelector('.bha-lcd');
        const sel = lcd.querySelector('.bha-sel');
        const layer = [...lcd.querySelectorAll('[data-dev-layer]')].pop();
        const scope = layer || (sel && sel.closest('.bha-overlay')) || lcd;
        const SEL = 'button, a[href], input, select, summary, [role="tab"]';
        const vis = (e) => !e.closest('[hidden], [inert], .bha-dev__side, [data-dev-skip]') && !e.disabled && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).pointerEvents !== 'none';
        // 펼친 메뉴·창에 덮인 칸은 그동안 못 고르는 게 맞다
        const uncovered = (e) => {
          const r = e.getBoundingClientRect();
          const hit = document.elementFromPoint(Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1), Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1));
          return !hit || e.contains(hit) || hit.contains(e) || !!hit.closest('.bha-toast, .bha-toasts');
        };
        return [...scope.querySelectorAll(SEL)].filter(vis).filter((e) => !ids.includes(e.dataset.reach || '')).filter(uncovered).map((e) => (e.closest('.bha-mddetail') ? 'MD|' : '') + [...e.classList].filter((c) => c.startsWith('bha-')).slice(0, 2).join('.') + '|' + (e.getAttribute('aria-label') || e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24));
      }, [...reached]);
      // 목록-상세 화면: 상세 칸 버튼은 '고른 행에서 ✓ 한 번 더' 로 들어간다 — 그 길이 되면 상세 칸 것은 닿는 것으로 친다
      let mdOk = false;
      if (missed.some((m) => m.startsWith('MD|'))) {
        mdOk = await page.evaluate(() => {
          const row = document.querySelector('.bha-lcd .bha-mdrow.is-active');
          if (!row) return false;
          row.click();
          const s = document.querySelector('.bha-lcd .bha-sel');
          return !!s && !!s.closest('.bha-mddetail');
        });
        if (!mdOk) report.push({ faction, screen, kind: '키보드로 못 고름', key: 'bha-mddetail', detail: '고른 행에서 ✓ 를 눌러도 상세 칸으로 못 들어감' });
      }
      for (const raw of missed) {
        if (raw.startsWith('MD|') && mdOk) continue;
        const m = raw.replace(/^MD\|/, '');
        if (opts.reachIgnore && opts.reachIgnore.test(m)) continue;
        report.push({ faction, screen, kind: '키보드로 못 고름', key: m, detail: `▼ ${steps}번 돌려도 선택 안 됨` });
      }
      return [...reached];
    },
  };
  return h;
}

async function newGame(page, url, factionIndex) {
  await page.goto(`${url}?test=1`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${url}?test=1`);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: '새로 시작' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-slot').first().click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: '확인' }).click();
  await page.waitForTimeout(300);
  await page.locator('.bha-species__card').nth(factionIndex).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await page.waitForTimeout(1400);
}

(async () => {
  const server = await startServer();
  console.log('server', server.url);
  const browser = await chromium.launch();
  const report = [];
  const only = process.env.UI_AUDIT_ONLY;
  try {
    for (const [fi, faction] of (process.env.UI_AUDIT_FACTION === '0' ? [[0, 'hollow']] : [[0, 'hollow'], [1, 'shinigami']])) {
      for (const sc of SCREENS) {
        if (only && !sc.name.includes(only)) continue;
        const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
        page.on('pageerror', (e) => report.push({ faction, screen: sc.name, kind: '스크립트 오류', key: '', detail: e.message.slice(0, 120) }));
        const h = makeHelper(page, faction, report);
        try {
          if (sc.fresh) {
            await page.goto(`${server.url}?test=1`);
            await page.evaluate(() => localStorage.clear());
            await page.goto(`${server.url}?test=1`);
            await page.waitForTimeout(1200);
          } else await newGame(page, server.url, fi);
          // 화면 하나가 멈춰도 전체가 서지 않게 4분 제한
          await Promise.race([sc.run(h, sc.name), new Promise((_, rej) => setTimeout(() => rej(new Error('4분 넘김')), 240_000))]);
        } catch (e) {
          report.push({ faction, screen: sc.name, kind: '검수 스크립트 실패', key: '', detail: process.env.UI_AUDIT_DEBUG ? String(e.message).slice(0, 900) : String(e.message).split('\n')[0].slice(0, 160) });
        }
        await page.close().catch(() => {});
        process.stdout.write(`[${faction} ${sc.name}]`);
      }
    }
  } finally {
    await browser.close();
    server.stop();
  }
  // 같은 화면·증상·요소는 한 줄로 (종족 합침)
  const merged = new Map();
  for (const r of report) {
    const k = `${r.screen}|${r.kind}|${r.key}`;
    const m = merged.get(k);
    if (m) {
      if (!m.factions.includes(r.faction)) m.factions.push(r.faction);
    } else merged.set(k, { ...r, factions: [r.faction] });
  }
  const rows = [...merged.values()];
  console.log(`\nUI 검수: ${rows.length}건`);
  for (const r of rows) console.log(`- [${r.screen}] ${r.kind} · ${r.key} · ${r.detail} (${r.factions.join(',')})`);
  const out = process.env.UI_AUDIT_OUT;
  if (out) fs.writeFileSync(out, JSON.stringify(rows, null, 1));
  process.exitCode = rows.length > 0 ? 1 : 0;
})();
