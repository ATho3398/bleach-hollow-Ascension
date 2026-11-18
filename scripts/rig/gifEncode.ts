// 작은 GIF 인코더 (사용자 2026-11-18 "이거 애니메이션 완성된거 나한테 gif로 내어줄 수 있는 기능 추가해볼래?") — 편집기 'GIF 받기' 용, 외부 라이브러리 없음.
// 모든 장의 색을 15비트(채널 5비트)로 모아 많이 쓰인 255색 + 투명 없음 팔레트 하나(전역), 장마다 LZW. 무한 반복.
export interface GifFrame { data: Uint8ClampedArray; delayCs: number }

export function encodeGif(w: number, h: number, frames: GifFrame[]): Uint8Array {
  // 팔레트: 15비트 색 빈도 → 상위 256
  const count = new Map<number, number>();
  for (const f of frames) for (let i = 0; i < f.data.length; i += 4) {
    const k = ((f.data[i]! >> 3) << 10) | ((f.data[i + 1]! >> 3) << 5) | (f.data[i + 2]! >> 3);
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  const pal = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 256).map(([k]) => k);
  while (pal.length < 256) pal.push(0);
  const rgb = pal.map((k) => [((k >> 10) & 31) * 255 / 31, ((k >> 5) & 31) * 255 / 31, (k & 31) * 255 / 31].map(Math.round) as [number, number, number]);
  const near = new Map<number, number>();
  const idxOf = (k: number): number => {
    let v = near.get(k);
    if (v !== undefined) return v;
    const r = ((k >> 10) & 31) * 255 / 31, g = ((k >> 5) & 31) * 255 / 31, b = (k & 31) * 255 / 31;
    let best = 0, bd = Infinity;
    for (let i = 0; i < 256; i++) { const c = rgb[i]!; const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2; if (d < bd) { bd = d; best = i; } }
    near.set(k, best);
    return best;
  };
  const out: number[] = [];
  const u16 = (v: number) => out.push(v & 255, (v >> 8) & 255);
  const str = (s: string) => { for (const ch of s) out.push(ch.charCodeAt(0)); };
  str('GIF89a'); u16(w); u16(h); out.push(0xf7, 0, 0); // 전역 팔레트 256색
  for (const c of rgb) out.push(c[0], c[1], c[2]);
  out.push(0x21, 0xff, 11); str('NETSCAPE2.0'); out.push(3, 1, 0, 0, 0); // 무한 반복
  for (const f of frames) {
    out.push(0x21, 0xf9, 4, 0x04, f.delayCs & 255, (f.delayCs >> 8) & 255, 0, 0); // 그래픽 제어: 그대로 둠, 지연
    out.push(0x2c); u16(0); u16(0); u16(w); u16(h); out.push(0);
    const px = new Uint8Array(w * h);
    for (let i = 0, j = 0; i < f.data.length; i += 4, j++) px[j] = idxOf(((f.data[i]! >> 3) << 10) | ((f.data[i + 1]! >> 3) << 5) | (f.data[i + 2]! >> 3));
    lzw(px, 8, out);
  }
  out.push(0x3b);
  return Uint8Array.from(out);
}

function lzw(px: Uint8Array, minCode: number, out: number[]) {
  out.push(minCode);
  const clear = 1 << minCode, eoi = clear + 1;
  let size = minCode + 1, next = eoi + 1;
  let dict = new Map<number, number>();
  const bytes: number[] = [];
  let acc = 0, bits = 0;
  const emit = (code: number) => { acc |= code << bits; bits += size; while (bits >= 8) { bytes.push(acc & 255); acc >>= 8; bits -= 8; } };
  emit(clear);
  let prefix = px[0]!;
  for (let i = 1; i < px.length; i++) {
    const c = px[i]!;
    const key = (prefix << 8) | c;
    const hit = dict.get(key);
    if (hit !== undefined) { prefix = hit; continue; }
    emit(prefix);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > (1 << size) && size < 12) size++;
    } else {
      emit(clear); dict = new Map(); size = minCode + 1; next = eoi + 1;
    }
    prefix = c;
  }
  emit(prefix); emit(eoi);
  if (bits > 0) bytes.push(acc & 255);
  for (let i = 0; i < bytes.length; i += 255) { const n = Math.min(255, bytes.length - i); out.push(n, ...bytes.slice(i, i + n)); }
  out.push(0);
}
