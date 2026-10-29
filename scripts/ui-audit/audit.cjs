// UI 코딩 에러 전수 검수 (GDD 110장 2, C.182). `npm run ui-audit` (CI 에는 안 넣음).
// 두 종족 × 화면마다: ① 정적 점검(가로 스크롤·버튼/글자 잘림·겹침·가려짐·키보드로 못 고르는 칸) ② ▼ 를 돌려 모든 버튼에 닿는지
// ③ 상태 바꾸기(체크·토글·탭·선택·삭제·ⓘ 열기 …) 전후로 다른 버튼이 움직였는지(bounding box 비교).
// 테스트 모드(?test=1, 따로 된 테스트 세이브 칸)로 돈다. 뷰포트 = 게임 기준 가로 844×390, 1배.
// 옵션: UI_AUDIT_URL=<이미 떠 있는 주소> (없으면 vite 를 띄운다), UI_AUDIT_ONLY=<화면 이름 일부>, UI_AUDIT_SHOTS=<폴더> (화면마다 캡처),
//       UI_AUDIT_PORTRAIT=1 (세로 폰 390×844 터치 — 기기 화면 90° 회전 출력, C.183)
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { snapshotInPage, staticInPage } = require('./checks.cjs');
const { SCREENS } = require('./screens.cjs');

const ROOT = path.resolve(__dirname, '../..');
const PORT = 5199;
const MOVE_TOL = 1.5;
const PORTRAIT = !!process.env.UI_AUDIT_PORTRAIT;
/** 기기 버튼 기준 자리 (C.197, GDD 122장 1): 종족마다 처음 잰 ▲▼✓◀ 자리. 모든 화면·상태에서 같아야 한다 */
const DEV_BTN_REF = new Map();
/** 공간 화면 '방으로 돌아가기' 기준 자리 (C.203, GDD 129-1): 종족마다 처음 잰 장터·온천 버튼 자리. 공간 화면끼리 같아야 하고 왼쪽 위여야 한다 */
const SPACE_BACK_REF = new Map();

/** 페이지 안: 튜토리얼 안내 카드(.bha-tut) 중 회색 덮개가 있는 것 — 도움말에서 직접 연 다시 보기(data-replay)만 덮개가 있어도 된다 (GDD 129-1) */
function tutDimInPage() {
  return [...document.querySelectorAll('.bha-tut')].filter((t) => !t.hasAttribute('data-replay')).flatMap((t) => {
    const hole = t.querySelector('.bha-tut__hole');
    if (!hole) return [];
    const cs = getComputedStyle(hole);
    return cs.display !== 'none' && cs.boxShadow && cs.boxShadow !== 'none' ? [t.dataset.tutorial || '?'] : [];
  });
}

/** 페이지 안: 공간 화면 '방으로 돌아가기'([data-space-back]) 자리 — LCD 화면 기준 */
function spaceBackInPage() {
  const b = document.querySelector('.bha-lcd [data-space-back]');
  const scr = document.querySelector('.bha-lcd');
  if (!b || !scr || b.getClientRects().length === 0) return null;
  const r = b.getBoundingClientRect(), o = scr.getBoundingClientRect();
  return { x: Math.round(r.left - o.left), y: Math.round(r.top - o.top), w: Math.round(r.width), h: Math.round(r.height), lw: Math.round(o.width), lh: Math.round(o.height), text: b.textContent.trim() };
}

/** 페이지 안: 기기 버튼 4개(▲▼✓◀)의 자리와 보이는지 */
function devButtonsInPage() {
  return [...document.querySelectorAll('.bha-dev > .bha-dev__side .bha-dev__btn')].map((b) => {
    const r = b.getBoundingClientRect();
    const cs = getComputedStyle(b);
    let hidden = !!b.closest('[hidden]') || r.width < 1 || r.height < 1;
    for (let e = b; e && !hidden; e = e.parentElement) {
      const c = getComputedStyle(e);
      if (c.display === 'none' || c.visibility === 'hidden' || Number(c.opacity) < 0.2) hidden = true;
    }
    if (r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) hidden = true;
    return { label: b.getAttribute('aria-label') || '', x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), hidden, vis: cs.visibility };
  });
}

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
    report: (r, screen) => report.push({ faction, screen, ...r }),
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
    /** 시간이 흐르며 상태가 바뀌는 화면(전투): ms 동안 0.25초마다 재서 처음과 다른 자리·폭이 된 버튼 */
    async watch(screen, ms, until = null, ignore = null) {
      const first = await h.snap();
      const moved = new Map();
      for (let t = 0; t < ms; t += 250) {
        await page.waitForTimeout(250);
        if (until && !(await until())) break;
        const now = await h.snap();
        for (const [id, a] of Object.entries(first)) {
          const b = now[id];
          if (!b || moved.has(a.key) || (ignore && ignore.test(a.key))) continue;
          const dx = b.x - a.x, dy = b.y - a.y, dw = b.w - a.w;
          if (Math.abs(dx) > MOVE_TOL || Math.abs(dy) > MOVE_TOL || Math.abs(dw) > MOVE_TOL) moved.set(a.key, `${(t / 1000).toFixed(1)}초: (${Math.round(dx)}, ${Math.round(dy)})px 폭 ${Math.round(dw)}`);
        }
      }
      for (const [key, detail] of moved) report.push({ faction, screen, kind: '시간 흐름에 버튼 이동', key, detail });
    },
    /** 정적 점검 + ▼ 순환으로 모든 조작 요소에 닿는지 */
    async check(screen, opts = {}) {
      await h.devButtons(screen);
      await h.tutDim(screen);
      await h.spaceBack(screen);
      if (process.env.UI_AUDIT_DUMP) {
        const list = await page.evaluate(() => [...document.querySelectorAll('.bha-lcd button, .bha-lcd [role="tab"], .bha-lcd input')].filter((e) => e.getClientRects().length > 0).map((e) => `${[...e.classList].filter((c) => c.startsWith('bha-')).slice(0, 2).join('.')}|${(e.getAttribute('aria-label') || e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 18)}`));
        console.log(`\n## ${faction} ${screen}\n${list.join('\n')}`);
      }
      const reached = opts.keys !== false ? await h.reach(screen, opts) : [];
      // 잘림은 0.6초 뒤 한 번 더 재서 남아 있는 것만 (들어오는 애니메이션 중인 블록 등은 뺀다)
      const first = await page.evaluate(staticInPage, reached);
      const again = first.some((i) => /잘림/.test(i.kind)) ? await page.waitForTimeout(600).then(() => page.evaluate(staticInPage, reached)) : first;
      const keep = new Set(again.map((i) => `${i.kind}|${i.key}`));
      const issues = first.filter((i) => !/잘림/.test(i.kind) || keep.has(`${i.kind}|${i.key}`));
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
    /** 기기 버튼 상시 표시·자리 고정 (C.197, GDD 122장 1·5): 숨거나(전투 포함) 처음 잰 자리·크기와 다르면 보고 */
    /**
     * 뒤로 반응 (GDD 128장 4, C.202): 기기 ◀ 를 한 번 눌러 무언가 바뀌는지 — 창이 열리거나 닫힘 · 일시정지 · 화면 바뀜. 안내 띠(토스트)만 뜨면 '뒤로 = 안내만'.
     * 아무 변화가 없으면 '뒤로 무반응'. 돌려주는 값: 'layer'(창이 열림) · 'pause' · 'screen' · 'toast' · 'none' — 부른 쪽이 되돌린다(창 닫기·한 번 더 뒤로)
     */
    async backReacts(screen, opts = {}) {
      const sig = () => page.evaluate(() => {
        const lcd = document.querySelector('.bha-lcd');
        return {
          layers: lcd ? lcd.querySelectorAll('[data-dev-layer]').length : 0,
          paused: !!document.querySelector('.bha-lcd .is-paused, .bha-lcd .bha-battle .bha-overlay'),
          text: (lcd?.querySelector('.bha-app, .bha-lcdpage')?.textContent ?? lcd?.textContent ?? '').replace(/\s+/g, ' ').slice(0, 4000),
          toasts: document.querySelectorAll('.bha-toast').length,
        };
      });
      const a = await sig();
      await page.locator('.bha-dev__btn--back').first().click({ timeout: 3000 });
      await h.wait(opts.ms ?? 500);
      const b = await sig();
      const kind = b.layers > a.layers ? 'layer' : b.paused !== a.paused ? 'pause' : b.text !== a.text || b.layers < a.layers ? 'screen' : b.toasts > a.toasts ? 'toast' : 'none';
      if (kind === 'none') h.report({ kind: '뒤로 무반응', key: opts.key ?? '◀', detail: '뒤로를 눌러도 아무것도 안 바뀐다 (GDD 128장 4)' }, screen);
      else if (kind === 'toast' && !opts.toastOk) h.report({ kind: '뒤로 = 안내만', key: opts.key ?? '◀', detail: '창 닫기·일시정지·넘어가기 확인 중 아무것도 안 하고 안내만 뜬다' }, screen);
      return kind;
    },
    /** 튜토리얼 안내 카드 회색 덮개 없음 (C.203, GDD 129장 3·129-1): 저절로 뜬 안내·각본 카드는 카드·테두리만 */
    async tutDim(screen) {
      for (const name of await page.evaluate(tutDimInPage)) h.report({ kind: '튜토리얼 안내 회색 덮개', key: name, detail: '저절로 뜬 안내 카드가 뒤 화면을 어둡게 덮는다 (다시 보기만 허용)' }, screen);
    },
    /** 공간 화면 방으로 자리 같음 (C.203, GDD 129-1): 장터·온천 [방으로 돌아가기] = 왼쪽 위, 화면끼리 같은 자리·크기 */
    async spaceBack(screen) {
      const b = await page.evaluate(spaceBackInPage);
      if (!b) return;
      if (b.x > b.lw / 4 || b.y > b.lh / 4) h.report({ kind: '공간 화면 방으로 자리', key: b.text, detail: `왼쪽 위가 아님 (${b.x}, ${b.y})` }, screen);
      const refKey = `${faction}|${PORTRAIT}`;
      if (!SPACE_BACK_REF.has(refKey)) SPACE_BACK_REF.set(refKey, { screen, b });
      const ref = SPACE_BACK_REF.get(refKey);
      const a = ref.b;
      if (Math.abs(a.x - b.x) > MOVE_TOL || Math.abs(a.y - b.y) > MOVE_TOL || Math.abs(a.w - b.w) > MOVE_TOL || Math.abs(a.h - b.h) > MOVE_TOL || a.text !== b.text) {
        h.report({ kind: '공간 화면 방으로 자리 다름', key: b.text, detail: `${ref.screen} 기준 (${b.x - a.x}, ${b.y - a.y})px 크기 ${b.w}x${b.h} '${a.text}'→'${b.text}'` }, screen);
      }
    },
    async devButtons(screen) {
      const btns = await page.evaluate(devButtonsInPage);
      if (btns.length !== 4) return h.report({ kind: '기기 버튼 숨김', key: 'bha-dev__btn', detail: `기기 버튼 ${btns.length}개 (4개여야 함)` }, screen);
      const refKey = `${faction}|${PORTRAIT}`;
      if (!DEV_BTN_REF.has(refKey)) DEV_BTN_REF.set(refKey, { screen, btns });
      const ref = DEV_BTN_REF.get(refKey);
      for (const [i, b] of btns.entries()) {
        if (b.hidden) h.report({ kind: '기기 버튼 숨김', key: b.label, detail: '보이지 않음' }, screen);
        const a = ref.btns[i];
        if (Math.abs(a.x - b.x) > MOVE_TOL || Math.abs(a.y - b.y) > MOVE_TOL || Math.abs(a.w - b.w) > MOVE_TOL || Math.abs(a.h - b.h) > MOVE_TOL) {
          h.report({ kind: '기기 버튼 자리 바뀜', key: b.label, detail: `${ref.screen} 기준 (${b.x - a.x}, ${b.y - a.y})px 크기 ${b.w}x${b.h}` }, screen);
        }
      }
    },
    async reach(screen, opts = {}) {
      const res = await page.evaluate(() => {
        const lcd = document.querySelector('.bha-lcd');
        const sel = lcd.querySelector('.bha-sel');
        const layer = [...lcd.querySelectorAll('[data-dev-layer]')].pop();
        const scope = layer || (sel && sel.closest('.bha-overlay')) || lcd;
        const SEL = 'button, a[href], input, select, summary, [role="tab"], [data-dev-press]';
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
        const SEL = 'button, a[href], input, select, summary, [role="tab"], [data-dev-press]';
        // 전투(C.197, GDD 122장 3): 못 쓰는 대상(흐린 버튼·빈/잠긴 칸)은 ▲▼ 가 건너뛰는 게 맞다
        const off = (e) => !!e.closest('.bha-battle') && (e.hasAttribute('data-dev-off') || e.classList.contains('is-disabled') || e.getAttribute('aria-disabled') === 'true');
        const vis = (e) => !off(e) && !e.closest('[hidden], [inert], .bha-dev__side, [data-dev-skip]') && !e.disabled && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).pointerEvents !== 'none';
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
        if (only && !only.split(',').some((o) => sc.name.includes(o))) continue; // 쉼표로 여럿
        // 세로 회전 출력 (C.183): 세로 폰(390×844, 터치) — 기기 화면이 90° 돌아간 채로 같은 점검
        const page = await browser.newPage(PORTRAIT ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true } : { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
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
