// UI 코딩 에러 검수 (GDD 110장 2, C.182): 브라우저 안에서 도는 점검 함수들. audit.cjs 가 page.evaluate 로 부른다.
// 모두 순수 DOM 측정이라 종족·화면을 모른다. 결과는 { kind, key, detail } 목록.

/** 페이지 안: 보이는 조작 요소(버튼·탭·입력)에 data-audit 번호를 붙이고 위치를 잰다. 기기 옆 버튼·테스트 띠는 뺀다 */
function snapshotInPage() {
  const SEL = 'button, a[href], input, select, summary, [role="tab"], [role="button"]';
  const out = {};
  const seen = new Map();
  const label = (e) => (e.getAttribute('aria-label') || e.textContent || e.getAttribute('title') || '').replace(/\s+/g, ' ').trim().slice(0, 24);
  const cls = (e) => [...e.classList].filter((c) => c.startsWith('bha-') && c !== 'bha-sel').join('.');
  // 세로 회전 출력(C.183): 기기가 90° 돌아가 있으면 화면 사각형을 기기 안 좌표로 바꿔 잰다(가로와 같은 축 — 스크롤·잘림 판정이 맞게)
  const DEV = document.querySelector('.bha-dev.is-rotated');
  const M = DEV ? new DOMMatrix(getComputedStyle(DEV).transform) : null;
  const MI = M ? M.inverse() : null;
  const R = (x) => {
    const r = x.getBoundingClientRect();
    if (!MI) return r;
    const a = MI.transformPoint(new DOMPoint(r.left - DEV.offsetLeft, r.top - DEV.offsetTop));
    const b = MI.transformPoint(new DOMPoint(r.right - DEV.offsetLeft, r.bottom - DEV.offsetTop));
    const left = Math.min(a.x, b.x), top = Math.min(a.y, b.y), right = Math.max(a.x, b.x), bottom = Math.max(a.y, b.y);
    return { left, top, right, bottom, x: left, y: top, width: right - left, height: bottom - top };
  };
  /** 기기 안 점 → 화면 점 (가려짐 판정의 elementFromPoint 용) */
  const toScreen = (x, y) => {
    if (!M) return { x, y };
    const p = M.transformPoint(new DOMPoint(x, y));
    return { x: p.x + DEV.offsetLeft, y: p.y + DEV.offsetTop };
  };
  let n = Number(document.body.dataset.auditSeq || 0);
  for (const e of document.querySelectorAll(SEL)) {
    if (e.closest('.bha-dev__side, .bha-testband, [hidden]')) continue;
    const r = R(e);
    if (r.width < 1 || r.height < 1) continue;
    if (!e.dataset.audit) e.dataset.audit = String(++n);
    let key = `${e.tagName.toLowerCase()}.${cls(e)}|${label(e)}`;
    const k = seen.get(key) || 0;
    seen.set(key, k + 1);
    if (k) key += `#${k}`;
    out[e.dataset.audit] = { key, x: r.x, y: r.y, w: r.width, h: r.height };
  }
  document.body.dataset.auditSeq = String(n);
  return out;
}

/** 페이지 안: 지금 화면의 정적 점검 (가로 스크롤·잘림·넘침·겹침·가려짐·키보드로 못 고르는 칸) */
function staticInPage(reached) {
  // reached = ▼ 로 닿은 요소 표시(data-reach) 목록. 있으면 겹침·가려짐은 지금 고를 수 있는 칸만 본다(펼친 메뉴 뒤에 깔린 것 제외)
  // 세로 회전 출력(C.183): 기기가 90° 돌아가 있으면 화면 사각형을 기기 안 좌표로 바꿔 잰다(가로와 같은 축 — 스크롤·잘림 판정이 맞게)
  const DEV = document.querySelector('.bha-dev.is-rotated');
  const M = DEV ? new DOMMatrix(getComputedStyle(DEV).transform) : null;
  const MI = M ? M.inverse() : null;
  const R = (x) => {
    const r = x.getBoundingClientRect();
    if (!MI) return r;
    const a = MI.transformPoint(new DOMPoint(r.left - DEV.offsetLeft, r.top - DEV.offsetTop));
    const b = MI.transformPoint(new DOMPoint(r.right - DEV.offsetLeft, r.bottom - DEV.offsetTop));
    const left = Math.min(a.x, b.x), top = Math.min(a.y, b.y), right = Math.max(a.x, b.x), bottom = Math.max(a.y, b.y);
    return { left, top, right, bottom, x: left, y: top, width: right - left, height: bottom - top };
  };
  /** 기기 안 점 → 화면 점 (가려짐 판정의 elementFromPoint 용) */
  const toScreen = (x, y) => {
    if (!M) return { x, y };
    const p = M.transformPoint(new DOMPoint(x, y));
    return { x: p.x + DEV.offsetLeft, y: p.y + DEV.offsetTop };
  };
  const live = (e) => !reached || reached.length === 0 || reached.includes(e.dataset.reach || '');
  const issues = [];
  const push = (kind, el, detail) => {
    const lab = el ? (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30) : '';
    const c = el ? [...el.classList].filter((x) => x.startsWith('bha-') && x !== 'bha-sel').slice(0, 2).join('.') : '';
    issues.push({ kind, key: `${c}|${lab}`, detail });
  };
  const lcd = document.querySelector('.bha-lcd');
  if (!lcd) return issues;
  const L = R(lcd);
  const vw = DEV ? DEV.offsetWidth : innerWidth;
  const vh = DEV ? DEV.offsetHeight : innerHeight;
  // 1) 가로 스크롤 (페이지 전체)
  if (document.documentElement.scrollWidth > innerWidth + 1) push('가로 스크롤', document.body, `문서 폭 ${document.documentElement.scrollWidth} > ${vw}`);
  const shown = (e) => {
    // 알림 띠(토스트)는 잠깐 떴다 사라지고 누름을 막지 않는다 — 점검에서 뺀다
    if (e.closest('[hidden], .bha-dev__side, .bha-testband, [aria-hidden="true"], .bha-toast, .bha-toasts')) return false;
    const s = getComputedStyle(e);
    if (s.visibility === 'hidden' || s.display === 'none') return false;
    let p = e;
    while (p && p !== document.body) {
      if (Number(getComputedStyle(p).opacity) < 0.05) return false;
      p = p.parentElement;
    }
    return e.getClientRects().length > 0;
  };
  /** 조상 중 overflow 로 자르는 상자들로 잘라 낸 보이는 영역. 스크롤되는 상자는 스크롤로 닿으니 자르지 않는다(그 상자 자체가 잘리는지는 따로 본다) */
  const visibleRect = (e, r) => {
    let x1 = r.left, y1 = r.top, x2 = r.right, y2 = r.bottom;
    // 절대·고정 위치 요소는 담는 블록(위치가 정해진 조상) 밖의 조상에게만 잘린다 — 그 사이의 static 조상의 overflow 는 상관없다
    let mode = getComputedStyle(e).position;
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.display === 'contents') continue;
      const positioned = s.position !== 'static' || s.transform !== 'none' || s.contain.includes('paint');
      if (mode === 'absolute' && !positioned) continue;
      if (mode === 'fixed' && s.transform === 'none' && !s.contain.includes('paint')) continue;
      mode = s.position;
      const ox = s.overflowX, oy = s.overflowY;
      const pr = R(p);
      const scrollX = (ox === 'auto' || ox === 'scroll') && p.scrollWidth > p.clientWidth + 1;
      const scrollY = (oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 1;
      // 스크롤되는 상자 안의 것은 스크롤로 그 상자 창에 들어온다고 보고 창 자리로 옮긴다
      if (scrollX) { const w = Math.min(x2 - x1, pr.width); x1 = pr.left; x2 = pr.left + w; }
      else if (ox !== 'visible') { x1 = Math.max(x1, pr.left); x2 = Math.min(x2, pr.right); }
      if (scrollY) { const hh = Math.min(y2 - y1, pr.height); y1 = pr.top; y2 = pr.top + hh; }
      else if (oy !== 'visible') { y1 = Math.max(y1, pr.top); y2 = Math.min(y2, pr.bottom); }
    }
    x1 = Math.max(x1, 0); y1 = Math.max(y1, 0); x2 = Math.min(x2, vw); y2 = Math.min(y2, vh);
    return { w: Math.max(0, x2 - x1), h: Math.max(0, y2 - y1) };
  };
  /** 실제로 지금 화면에 보이는 상자 (스크롤 상자도 자른다) */
  const clipRect = (e) => {
    const r = R(e);
    let x1 = r.left, y1 = r.top, x2 = r.right, y2 = r.bottom;
    let mode = getComputedStyle(e).position;
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.display === 'contents') continue;
      const positioned = s.position !== 'static' || s.transform !== 'none' || s.contain.includes('paint');
      if (mode === 'absolute' && !positioned) continue;
      if (mode === 'fixed' && s.transform === 'none' && !s.contain.includes('paint')) continue;
      mode = s.position;
      const pr = R(p);
      if (s.overflowX !== 'visible') { x1 = Math.max(x1, pr.left); x2 = Math.min(x2, pr.right); }
      if (s.overflowY !== 'visible') { y1 = Math.max(y1, pr.top); y2 = Math.min(y2, pr.bottom); }
    }
    return { left: x1, top: y1, right: x2, bottom: y2, width: Math.max(0, x2 - x1), height: Math.max(0, y2 - y1) };
  };
  const SEL = 'button, a[href], input, select, summary, [role="tab"], [role="button"]';
  const inter = [...lcd.querySelectorAll(SEL)].filter(shown).filter((e) => {
    const r = R(e);
    return r.width >= 2 && r.height >= 2;
  });
  // 맨 위 층: 기기에 등록된 레이어(창·ⓘ·확인 창)가 열려 있으면 그것, 아니면 LCD 전체
  const layers = [...lcd.querySelectorAll('[data-dev-layer]')].filter(shown);
  const top = layers[layers.length - 1] || lcd;
  // 2) 조작 요소가 화면·창 밖으로 잘림
  for (const e of inter) {
    const r = R(e);
    const v = visibleRect(e, r);
    if (v.w * v.h < r.width * r.height * 0.9) push('버튼 잘림', e, `보이는 넓이 ${Math.round((100 * v.w * v.h) / (r.width * r.height))}%`);
  }
  // 3) 글자 잘림·넘침: 글자를 직접 가진 요소의 글자 상자가 잘리거나(조상 overflow) 자기 상자를 넘침
  const textEls = [...lcd.querySelectorAll('*')].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && shown(e));
  for (const e of textEls) {
    if (e.closest('svg, .bha-marquee, [data-audit-skip]')) continue;
    const er0 = R(e);
    if (er0.width <= 1 || er0.height <= 1) continue; // 화면 읽기 전용(1px·clip) 글자
    const s = getComputedStyle(e);
    const range = document.createRange();
    range.selectNodeContents(e);
    const rr = R(range);
    if (rr.width < 1 || rr.height < 1) continue;
    let ell = false;
    for (let p = e; p && p !== lcd; p = p.parentElement) if (getComputedStyle(p).textOverflow === 'ellipsis' || getComputedStyle(p).webkitLineClamp !== 'none') ell = true;
    if (ell) continue;
    const v = visibleRect(e, rr);
    // 자기 자신이 overflow 로 자르는 경우도 포함
    let vis = v.w * v.h;
    if (s.overflow !== 'visible' && !(e.scrollHeight > e.clientHeight + 1 && /auto|scroll/.test(s.overflowY))) {
      const er = R(e);
      const w = Math.max(0, Math.min(rr.right, er.right) - Math.max(rr.left, er.left));
      const h = Math.max(0, Math.min(rr.bottom, er.bottom) - Math.max(rr.top, er.top));
      vis = Math.min(vis, w * h);
    }
    if (vis < rr.width * rr.height * 0.9) push('글자 잘림', e, `보이는 글자 ${Math.round((100 * vis) / (rr.width * rr.height))}%`);
  }
  // 4) 조작 요소끼리 겹침 (부모·자식 관계는 빼고)
  for (let i = 0; i < inter.length; i++) for (let j = i + 1; j < inter.length; j++) {
    const a = inter[i], b = inter[j];
    if (a.contains(b) || b.contains(a)) continue;
    if (!top.contains(a) || !top.contains(b)) continue; // 열린 창 뒤에 깔린 것끼리는 보지 않는다
    if (!live(a) || !live(b)) continue;
    const ra = clipRect(a), rb = clipRect(b);
    if (ra.width < 2 || ra.height < 2 || rb.width < 2 || rb.height < 2) continue;
    const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
    const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (w <= 2 || h <= 2) continue;
    const small = Math.min(ra.width * ra.height, rb.width * rb.height);
    if (w * h > small * 0.15) push('겹침', a, `"${(b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 16)}" 와 ${Math.round((100 * w * h) / small)}%`);
  }
  // 5) 가려진 버튼: 맨 위 층(열린 창이 있으면 그 창) 안의 버튼 가운데를 다른 요소가 덮음
  for (const e of inter) {
    if (!top.contains(e) || !live(e)) continue;
    const r = clipRect(e);
    if (r.width < 4 || r.height < 4) continue; // 스크롤 밖이면 지금 안 보이는 게 맞다
    const c = toScreen(Math.min(Math.max(r.left + r.width / 2, 1), vw - 1), Math.min(Math.max(r.top + r.height / 2, 1), vh - 1));
    const hit = document.elementFromPoint(c.x, c.y);
    if (!hit || e.contains(hit) || hit.contains(e)) continue;
    if (getComputedStyle(hit).pointerEvents === 'none' || hit.closest('.bha-toast, .bha-toasts')) continue;
    // 스크롤 상자 안에서 붙박이(sticky) 머리 밑으로 지나가는 칸은 스크롤로 비켜 간다
    let sticky = false;
    for (let q = hit; q && q !== lcd; q = q.parentElement) if (getComputedStyle(q).position === 'sticky') sticky = true;
    if (sticky) continue;
    push('가려짐', e, `가운데를 ${hit.className && typeof hit.className === 'string' ? hit.className.split(' ')[0] : hit.tagName} 가 덮음`);
  }
  // 6) 누를 수 있어 보이는데(cursor:pointer·onclick) 버튼이 아닌 칸 → 키보드(▲▼·✓)로 못 고른다
  for (const e of top.querySelectorAll('*')) {
    if (e.matches(SEL) || e.closest(SEL)) continue;
    if (!shown(e)) continue;
    const s = getComputedStyle(e);
    if (s.cursor !== 'pointer' && !e.onclick) continue;
    if (e.querySelector(SEL)) continue;
    const r = R(e);
    if (r.width < 4 || r.height < 4) continue;
    push('키보드로 못 고름', e, '누를 수 있는 칸이 버튼이 아님');
  }
  return issues;
}

/**
 * 페이지 안: 카드 고르는 창 점검 (C.218, GDD 140장 3) — 드래프트·흡수 후보·종족 고르기 등 같은 줄에 놓인 고르기 카드.
 * ① 같은 부모·같은 줄(위쪽이 같은) 카드는 너비·높이가 같다 ② 카드 안 글은 잘리지 않는다(말줄임·줄 수 제한·넘침 숨김)
 * ③ 창(대화창·시트)이 처음 열렸을 때 안쪽 스크롤은 맨 위(0). audit.check 가 ▼ 돌리기 전에 부른다. 결과 = [{ kind, key, detail }]
 */
function cardsInPage() {
  const CARD = '.bha-draft__card, .bha-cand, .bha-species__card, .bha-pickcard';
  const lcd = document.querySelector('.bha-lcd') || document.body;
  const out = [];
  const shown = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const groups = new Map();
  for (const c of lcd.querySelectorAll(CARD)) {
    if (!shown(c)) continue;
    const r = c.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    const k = c.parentElement;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push({ c, r });
  }
  for (const list of groups.values()) {
    const rows = new Map();
    for (const it of list) {
      const top = Math.round(it.r.top / 4);
      if (!rows.has(top)) rows.set(top, []);
      rows.get(top).push(it);
    }
    for (const row of rows.values()) {
      if (row.length < 2) continue;
      const ws = row.map((x) => x.r.width), hs = row.map((x) => x.r.height);
      if (Math.max(...ws) - Math.min(...ws) > 1.5 || Math.max(...hs) - Math.min(...hs) > 1.5) {
        out.push({ kind: '카드 크기 다름', key: String(row[0].c.className).split(' ').filter((x) => x.startsWith('bha-')).slice(-1)[0] || '?', detail: row.map((x) => `${Math.round(x.r.width)}×${Math.round(x.r.height)}`).join(' / ') });
      }
    }
    for (const { c } of list) {
      for (const e of [c, ...c.querySelectorAll('*')]) {
        if (!shown(e) || e.closest('.bha-icon, svg')) continue;
        const s = getComputedStyle(e);
        const clamp = s.webkitLineClamp && s.webkitLineClamp !== 'none';
        const hid = /(hidden|clip)/.test(s.overflowX + s.overflowY) && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1);
        if (clamp || s.textOverflow === 'ellipsis' || hid) {
          if (!clamp && s.textOverflow === 'ellipsis' && e.scrollWidth <= e.clientWidth + 1) continue;
          out.push({ kind: '카드 글 잘림', key: (c.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 20), detail: `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]} ${clamp ? '줄 수 제한' : s.textOverflow === 'ellipsis' ? '말줄임' : '넘침 숨김'}` });
          break;
        }
      }
    }
  }
  for (const w of lcd.querySelectorAll('[role="dialog"], .bha-sheet')) {
    if (!shown(w)) continue;
    for (const e of [w, ...w.querySelectorAll('*')]) {
      if (e.scrollTop > 0 && /(auto|scroll)/.test(getComputedStyle(e).overflowY)) {
        out.push({ kind: '창 처음 스크롤', key: (w.getAttribute('aria-label') || String(w.className).split(' ')[0]).slice(0, 30), detail: `${String(e.className).split(' ')[0]} scrollTop ${Math.round(e.scrollTop)}` });
        break;
      }
    }
  }
  return out;
}

module.exports = { snapshotInPage, staticInPage, cardsInPage };
