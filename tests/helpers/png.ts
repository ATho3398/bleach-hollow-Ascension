// PNG 픽셀 해독 (테스트용, 라이브러리 없이)
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

/** 8비트 RGB/RGBA·비인터레이스 PNG 를 읽는 작은 해독기 (C.153 걷기 이음새, C.194 발 높이 검사) */
export function decodePng(path: string): { w: number; h: number; px: Uint8Array } {
  const b = readFileSync(path);
  let o = 8;
  let w = 0;
  let h = 0;
  let ct = 0;
  const idat: Buffer[] = [];
  while (o < b.length) {
    const len = b.readUInt32BE(o);
    const type = b.toString('latin1', o + 4, o + 8);
    const d = b.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]!; }
    else if (type === 'IDAT') idat.push(d);
    o += 12 + len;
  }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : 0;
  if (!bpp) throw new Error(`${path}: RGB/RGBA PNG 만 지원`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = new Uint8Array(w * h * 4);
  const prev = new Uint8Array(stride);
  let cur = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]!;
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i]!;
      const a = i >= bpp ? cur[i - bpp]! : 0;
      const up = prev[i]!;
      const c = i >= bpp ? prev[i - bpp]! : 0;
      const pr = f === 0 ? 0 : f === 1 ? a : f === 2 ? up : f === 3 ? (a + up) >> 1 : (() => { const p = a + up - c; const pa = Math.abs(p - a); const pb = Math.abs(p - up); const pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? up : c; })();
      cur[i] = (x + pr) & 255;
    }
    for (let i = 0; i < w; i++) {
      out[(y * w + i) * 4] = cur[i * bpp]!;
      out[(y * w + i) * 4 + 1] = cur[i * bpp + 1]!;
      out[(y * w + i) * 4 + 2] = cur[i * bpp + 2]!;
      out[(y * w + i) * 4 + 3] = bpp === 4 ? cur[i * 4 + 3]! : 255;
    }
    prev.set(cur);
    cur = new Uint8Array(stride);
  }
  return { w, h, px: out };
}
