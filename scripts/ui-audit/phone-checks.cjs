// 폰 조건 점검 (GDD 189장, 코딩208): 사용자 폰(안드로이드 가로, LCD 가 646 보다 좁아짐)에서 생긴 글자 문제를 잡는다.
// audit.cjs 가 UI_AUDIT_PHONE_CHECKS=1 일 때 page.evaluate 로 부른다. 순수 DOM 측정이라 종족·화면을 모른다. 결과 = [{ kind, key, detail }]
// ① 말줄임(…): text-overflow: ellipsis 인데 글자가 칸보다 길다
// ② 세로로 꺾인 글자: 2글자 이상 낱말이 한 줄에 한두 글자씩 여러 줄로 꺾였다 (예: '능력치' → 능/력/치)
// ③ 판 밖으로 나감: 버튼·글자가 자기를 담은 판(테두리·배경이 있는 조상, 또는 LCD)의 테두리를 넘어 그려진다
function phoneInPage() {
  const out = [];
  const lcd = document.querySelector('.bha-lcd');
  if (!lcd) return out;
  const seen = new Set();
  const push = (kind, key, detail) => {
    const k = `${kind}|${key}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ kind, key, detail });
  };
  const vis = (e) => {
    if (e.getClientRects().length === 0) return false;
    for (let x = e; x && x !== document.body; x = x.parentElement) {
      const c = getComputedStyle(x);
      if (c.display === 'none' || c.visibility === 'hidden' || Number(c.opacity) < 0.05) return false;
    }
    return true;
  };
  const label = (e) => (e.getAttribute('aria-label') || e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24);
  const cls = (e) => `${e.tagName.toLowerCase()}.${[...e.classList].filter((c) => c.startsWith('bha-')).slice(0, 1).join('') || '-'}`;
  const all = [...lcd.querySelectorAll('*')].filter((e) => !e.closest('.bha-testpanel, [data-test-panel], .bha-toast'));
  // ① 말줄임
  for (const e of all) {
    const cs = getComputedStyle(e);
    if (cs.textOverflow !== 'ellipsis' && !(cs.webkitLineClamp && cs.webkitLineClamp !== 'none')) continue;
    if (!vis(e)) continue;
    const cut = e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 2;
    if (cut && label(e)) push('말줄임', label(e), `${cls(e)} 폭 ${e.clientWidth}px 에 글자 ${e.scrollWidth}px`);
  }
  // ② 세로로 꺾인 글자
  for (const e of all) {
    for (const n of e.childNodes) {
      if (n.nodeType !== 3) continue;
      const t = n.textContent.replace(/\s+/g, '');
      if (t.length < 2 || !vis(e)) continue;
      const r = document.createRange();
      r.selectNodeContents(n);
      const rects = [...r.getClientRects()].filter((x) => x.width > 0.5);
      const tops = new Map();
      for (const x of rects) {
        const k = Math.round(x.top / 3);
        tops.set(k, Math.max(tops.get(k) || 0, x.width));
      }
      const lines = tops.size;
      const fs = parseFloat(getComputedStyle(e).fontSize) || 14;
      const maxW = Math.max(...tops.values(), 0);
      if (lines >= 2 && maxW < fs * 2.3 && lines >= Math.ceil(t.length / 2)) push('세로로 꺾인 글자', t.slice(0, 16), `${cls(e)} ${lines}줄 · 줄 폭 최대 ${Math.round(maxW)}px (글자 ${Math.round(fs)}px)`);
    }
  }
  // ③ 판 밖으로 나감
  const L = lcd.getBoundingClientRect();
  const framed = (x) => {
    const c = getComputedStyle(x);
    const bg = c.backgroundColor && c.backgroundColor !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(c.backgroundColor);
    const bd = parseFloat(c.borderTopWidth) > 0 && c.borderTopStyle !== 'none';
    return bg || bd || c.backgroundImage !== 'none';
  };
  const targets = all.filter((e) => (e.matches('button, [role="button"], [role="tab"]') || [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) && vis(e));
  for (const e of targets) {
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    // 스크롤 상자 안에서 스크롤로 밖에 있는 것은 정상
    let scroller = null;
    for (let x = e.parentElement; x && x !== lcd; x = x.parentElement) {
      const c = getComputedStyle(x);
      if (/(auto|scroll)/.test(c.overflowX + c.overflowY)) { scroller = x; break; }
    }
    if (scroller) {
      const s = scroller.getBoundingClientRect();
      if (r.bottom <= s.top || r.top >= s.bottom || r.right <= s.left || r.left >= s.right) continue;
    }
    const pos = getComputedStyle(e).position;
    if (pos === 'fixed') continue;
    if (r.right > L.right + 2 || r.left < L.left - 2 || r.bottom > L.bottom + 2) {
      push('LCD 밖으로 나감', label(e) || cls(e), `${cls(e)} 오른쪽 ${Math.round(r.right - L.right)}px · 아래 ${Math.round(r.bottom - L.bottom)}px 넘침`);
      continue;
    }
    // 테두리·배경 있는 가장 가까운 조상(버튼 자신 제외) — 그 판 밖으로 넘치는가
    for (let x = e.parentElement; x && x !== lcd; x = x.parentElement) {
      if (!framed(x)) continue;
      const p = x.getBoundingClientRect();
      if (p.width < 20 || p.height < 12) break;
      const over = Math.max(r.right - p.right, p.left - r.left, r.bottom - p.bottom, p.top - r.top);
      // 판 안에서 스크롤되는 것은 위에서 걸렀다. 절대 위치 배지(모서리 숫자 등)는 6px 까지 봐준다
      if (over > (pos === 'absolute' ? 6 : 2)) push('판 밖으로 나감', label(e) || cls(e), `${cls(e)} 가 ${cls(x)} 밖으로 ${Math.round(over)}px`);
      break;
    }
  }
  return out;
}

module.exports = { phoneInPage };
