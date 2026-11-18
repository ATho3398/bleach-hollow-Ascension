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

/** 압축 없는 ZIP (여러 GIF 를 한 파일로 — 저장 창은 한 번에 하나만 뜬다) */
export function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  const crc32 = (d: Uint8Array) => { let c = 0xffffffff; for (let i = 0; i < d.length; i++) c = table[(c ^ d[i]!) & 255]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const enc = new TextEncoder();
  const parts: number[] = [];
  const central: number[] = [];
  const u16 = (a: number[], v: number) => a.push(v & 255, (v >> 8) & 255);
  const u32 = (a: number[], v: number) => a.push(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255);
  const chunks: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data);
    const head: number[] = [];
    u32(head, 0x04034b50); u16(head, 20); u16(head, 0x0800); u16(head, 0); u16(head, 0); u16(head, 0x21); u32(head, crc); u32(head, f.data.length); u32(head, f.data.length); u16(head, name.length); u16(head, 0);
    const h = Uint8Array.from([...head, ...name]);
    chunks.push(h, f.data);
    u32(central, 0x02014b50); u16(central, 20); u16(central, 20); u16(central, 0x0800); u16(central, 0); u16(central, 0); u16(central, 0x21); u32(central, crc); u32(central, f.data.length); u32(central, f.data.length); u16(central, name.length); u16(central, 0); u16(central, 0); u16(central, 0); u16(central, 0); u32(central, 0); u32(central, offset);
    central.push(...name);
    offset += h.length + f.data.length;
  }
  const end: number[] = [];
  u32(end, 0x06054b50); u16(end, 0); u16(end, 0); u16(end, files.length); u16(end, files.length); u32(end, central.length); u32(end, offset); u16(end, 0);
  void parts;
  const total = offset + central.length + end.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  out.set(central, p); p += central.length; out.set(end, p);
  return out;
}
