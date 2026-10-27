// UI 코딩 에러 검수 (GDD 110장 2, C.182): 브라우저 안에서 도는 점검 함수들. audit.cjs 가 page.evaluate 로 부른다.
// 모두 순수 DOM 측정이라 종족·화면을 모른다. 결과는 { kind, key, detail } 목록.

/** 페이지 안: 보이는 조작 요소(버튼·탭·입력)에 data-audit 번호를 붙이고 위치를 잰다. 기기 옆 버튼·테스트 띠는 뺀다 */
function snapshotInPage() {
  const SEL = 'button, a[href], input, select, summary, [role="tab"], [role="button"]';
  const out = {};
  const seen = new Map();
  const label = (e) => (e.getAttribute('aria-label') || e.textContent || e.getAttribute('title') || '').replace(/\s+/g, ' ').trim().slice(0, 24);
  const cls = (e) => [...e.classList].filter((c) => c.startsWith('bha-') && c !== 'bha-sel').join('.');
  let n = Number(document.body.dataset.auditSeq || 0);
  for (const e of document.querySelectorAll(SEL)) {
    if (e.closest('.bha-dev__side, .bha-testband, [hidden]')) continue;
    const r = e.getBoundingClientRect();
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
  const live = (e) => !reached || reached.length === 0 || reached.includes(e.dataset.reach || '');
  const issues = [];
  const push = (kind, el, detail) => {
    const lab = el ? (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30) : '';
    const c = el ? [...el.classList].filter((x) => x.startsWith('bha-') && x !== 'bha-sel').slice(0, 2).join('.') : '';
    issues.push({ kind, key: `${c}|${lab}`, detail });
  };
  const lcd = document.querySelector('.bha-lcd');
  if (!lcd) return issues;
  const L = lcd.getBoundingClientRect();
  const vw = innerWidth;
  const vh = innerHeight;
  // 1) 가로 스크롤 (페이지 전체)
  if (document.documentElement.scrollWidth > vw + 1) push('가로 스크롤', document.body, `문서 폭 ${document.documentElement.scrollWidth} > ${vw}`);
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
      const pr = p.getBoundingClientRect();
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
    const r = e.getBoundingClientRect();
    let x1 = r.left, y1 = r.top, x2 = r.right, y2 = r.bottom;
    let mode = getComputedStyle(e).position;
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.display === 'contents') continue;
      const positioned = s.position !== 'static' || s.transform !== 'none' || s.contain.includes('paint');
      if (mode === 'absolute' && !positioned) continue;
      if (mode === 'fixed' && s.transform === 'none' && !s.contain.includes('paint')) continue;
      mode = s.position;
      const pr = p.getBoundingClientRect();
      if (s.overflowX !== 'visible') { x1 = Math.max(x1, pr.left); x2 = Math.min(x2, pr.right); }
      if (s.overflowY !== 'visible') { y1 = Math.max(y1, pr.top); y2 = Math.min(y2, pr.bottom); }
    }
    return { left: x1, top: y1, right: x2, bottom: y2, width: Math.max(0, x2 - x1), height: Math.max(0, y2 - y1) };
  };
  const SEL = 'button, a[href], input, select, summary, [role="tab"], [role="button"]';
  const inter = [...lcd.querySelectorAll(SEL)].filter(shown).filter((e) => {
    const r = e.getBoundingClientRect();
    return r.width >= 2 && r.height >= 2;
  });
  // 맨 위 층: 기기에 등록된 레이어(창·ⓘ·확인 창)가 열려 있으면 그것, 아니면 LCD 전체
  const layers = [...lcd.querySelectorAll('[data-dev-layer]')].filter(shown);
  const top = layers[layers.length - 1] || lcd;
  // 2) 조작 요소가 화면·창 밖으로 잘림
  for (const e of inter) {
    const r = e.getBoundingClientRect();
    const v = visibleRect(e, r);
    if (v.w * v.h < r.width * r.height * 0.9) push('버튼 잘림', e, `보이는 넓이 ${Math.round((100 * v.w * v.h) / (r.width * r.height))}%`);
  }
  // 3) 글자 잘림·넘침: 글자를 직접 가진 요소의 글자 상자가 잘리거나(조상 overflow) 자기 상자를 넘침
  const textEls = [...lcd.querySelectorAll('*')].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && shown(e));
  for (const e of textEls) {
    if (e.closest('svg, .bha-marquee, [data-audit-skip]')) continue;
    const er0 = e.getBoundingClientRect();
    if (er0.width <= 1 || er0.height <= 1) continue; // 화면 읽기 전용(1px·clip) 글자
    const s = getComputedStyle(e);
    const range = document.createRange();
    range.selectNodeContents(e);
    const rr = range.getBoundingClientRect();
    if (rr.width < 1 || rr.height < 1) continue;
    let ell = false;
    for (let p = e; p && p !== lcd; p = p.parentElement) if (getComputedStyle(p).textOverflow === 'ellipsis' || getComputedStyle(p).webkitLineClamp !== 'none') ell = true;
    if (ell) continue;
    const v = visibleRect(e, rr);
    // 자기 자신이 overflow 로 자르는 경우도 포함
    let vis = v.w * v.h;
    if (s.overflow !== 'visible' && !(e.scrollHeight > e.clientHeight + 1 && /auto|scroll/.test(s.overflowY))) {
      const er = e.getBoundingClientRect();
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
    const cx = Math.min(Math.max(r.left + r.width / 2, 1), vw - 1), cy = Math.min(Math.max(r.top + r.height / 2, 1), vh - 1);
    const hit = document.elementFromPoint(cx, cy);
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
    const r = e.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    push('키보드로 못 고름', e, '누를 수 있는 칸이 버튼이 아님');
  }
  return issues;
}

module.exports = { snapshotInPage, staticInPage };
