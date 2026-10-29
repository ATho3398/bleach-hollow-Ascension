// C.194 (GDD 120장 3): 페이지 안에서 그림 img 의 불투명 픽셀로 발(맨 아래)·머리(맨 위) 화면 y 와 그림자 중심 y 를 잰다. 숨긴 그림자(전투 걷기)는 잠깐 보이게 해서 잰다
// 페이지 안에서 실행: 그림 img 의 실제 불투명 픽셀 기준 발(가장 아래)·머리(가장 위) 화면 y
window.__measure = async (imgSel, shadowSel) => {
  const img = document.querySelector(imgSel);
  if (!img) return { err: 'no img ' + imgSel };
  await img.decode().catch(() => {});
  const c = document.createElement('canvas');
  const nw = img.naturalWidth, nh = img.naturalHeight;
  c.width = nw; c.height = nh;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, nw, nh).data;
  let top = -1, bot = -1, minX = nw, maxX = -1;
  for (let y = 0; y < nh; y++) for (let i = 0; i < nw; i++) if (d[(y * nw + i) * 4 + 3] > 40) { if (top < 0) top = y; bot = y; }
  // 발 = 맨 아래 줄 (칼끝이 더 아래면 오차 — 발 근처 가로 범위만 보고 싶으면 별도)
  const W = img.offsetWidth, H = img.offsetHeight;
  const cs = getComputedStyle(img);
  const fit = cs.objectFit;
  const sc = fit === 'contain' ? Math.min(W / nw, H / nh) : fit === 'fill' || !fit ? null : 1;
  const sx = sc ?? W / nw, sy = sc ?? H / nh;
  const dw = nw * sx, dh = nh * sy;
  const [px, py] = cs.objectPosition.split(' ').map((v) => v.endsWith('%') ? parseFloat(v) / 100 : null);
  const oy = (H - dh) * (py ?? 0.5);
  const r = img.getBoundingClientRect();
  const k = r.height / H;
  const foot = r.top + (oy + (bot + 1) * sy) * k;
  const head = r.top + (oy + top * sy) * k;
  const s = shadowSel && document.querySelector(shadowSel);
  const hidden = s && getComputedStyle(s).display === 'none';
  if (hidden) s.style.display = 'block';
  const sr = s && s.getBoundingClientRect();
  if (hidden) s.style.display = '';
  return { foot: Math.round(foot * 10) / 10, head: Math.round(head * 10) / 10, shadow: sr ? Math.round((sr.top + sr.height / 2) * 10) / 10 : null, shadowVisible: s ? !hidden && getComputedStyle(s).visibility !== 'hidden' && +getComputedStyle(s).opacity > 0 : false, cx: Math.round(r.left + r.width / 2), nw, nh, top, bot };
};
