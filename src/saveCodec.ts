// 세이브 저장 압축 (H-1b, C.72, GDD 24-5): 런 로그(원정마다 늘어나는 목록)를 덩어리로 잘라 압축해 localStorage 한도 안에 오래 남긴다.
// 런 로그는 줄이거나 버리지 않는다(CLAUDE.md 규칙 4) — 저장할 때 압축, 읽을 때 그대로 풀어 같은 객체가 된다.
//
// 저장 모양 = 지금 세이브 JSON 그대로 + 키 `$z` 하나. 각 런 로그 목록의 앞쪽 다 찬 덩어리(BLOCK 개씩)는 `$z[경로]` 에 압축 문자열로,
// 뒤쪽(최근 BLOCK~2·BLOCK-1 개)은 원래 자리에 평문으로 남는다. 목록이 짧으면 `$z` 가 없어 예전 세이브와 똑같다.
// 다 찬 덩어리는 한 번 압축하면 그 기록 객체들이 그대로인 동안 다시 압축하지 않는다(저장 한 번이 빠르게) — 런 로그는 덧붙이기만 하는 기록이라서다.
// 제자리에서 고쳐지는 목록(lineages: 속성 완성 표시)은 압축하지 않는다.
//
// 저장소(localStorage)에 쓸 때는 덩어리를 내용 해시 키(`<세이브 키>.z.<해시>`, 한 번 쓰면 안 바뀜)에 따로 두고 본문 `$z` 에는 해시 숫자만 넣는다
// → 저장 한 번은 본문(최근 기록 + 나머지)만 쓰고, 슬롯 백업·다른 슬롯이 같은 덩어리를 같이 쓴다. 내보내기 파일은 덩어리를 글로 품는다(숫자 대신 문자열).
// 아무 세이브도 가리키지 않는 덩어리 키는 collectChunks 가 지운다(앱 시작·저장 공간 부족 때).

export const PACK_KEY = '$z';
/** 덩어리 하나의 기록 수 */
export const PACK_BLOCK = 40;
/** 고쳐질 수 있어 압축하지 않는 런 로그 목록 */
const UNPACKED = new Set(['lineages']);

// ── LZ 압축 (LZW 계열, 15비트씩 UTF-16 글자 하나에 담는다: 글자 코드 32~32799 — 제어 문자·서로게이트 없음) ──

export function lzCompress(input: string): string {
  const dict = new Map<string, number>();
  const pending = new Set<string>();
  const out: string[] = [];
  let w = '';
  let enlargeIn = 2, dictSize = 3, numBits = 2;
  let val = 0, pos = 0;
  const bit = (b: number) => {
    val = (val << 1) | b;
    if (pos === 14) {
      out.push(String.fromCharCode(val + 32));
      val = 0;
      pos = 0;
    } else pos++;
  };
  const bits = (n: number, v: number) => {
    for (let i = 0; i < n; i++) {
      bit(v & 1);
      v >>= 1;
    }
  };
  const grow = () => {
    if (--enlargeIn === 0) {
      enlargeIn = 2 ** numBits;
      numBits++;
    }
  };
  const emit = () => {
    if (pending.has(w)) {
      const code = w.charCodeAt(0);
      if (code < 256) {
        bits(numBits, 0);
        bits(8, code);
      } else {
        bits(numBits, 1);
        bits(16, code);
      }
      grow();
      pending.delete(w);
    } else bits(numBits, dict.get(w)!);
    grow();
  };
  for (let i = 0; i < input.length; i++) {
    const c = input.charAt(i);
    if (!dict.has(c)) {
      dict.set(c, dictSize++);
      pending.add(c);
    }
    const wc = w + c;
    if (dict.has(wc)) w = wc;
    else {
      emit();
      dict.set(wc, dictSize++);
      w = c;
    }
  }
  if (w !== '') emit();
  bits(numBits, 2);
  for (;;) {
    val <<= 1;
    if (pos === 14) {
      out.push(String.fromCharCode(val + 32));
      break;
    }
    pos++;
  }
  return out.join('');
}

/** 16비트 뒤집기 표 (풀 때 여러 비트를 한 번에 읽으려고: 글자 안 비트는 높은 쪽부터, 값은 낮은 비트부터 쌓인다) */
let REV16: Uint16Array | null = null;
function rev16(): Uint16Array {
  if (REV16) return REV16;
  const t = new Uint16Array(65536);
  for (let i = 0; i < 65536; i++) {
    let x = i, r = 0;
    for (let b = 0; b < 16; b++) {
      r = (r << 1) | (x & 1);
      x >>= 1;
    }
    t[i] = r;
  }
  return (REV16 = t);
}

/** 풀기. 깨진 문자열이면 null */
export function lzDecompress(input: string): string | null {
  if (input.length === 0) return null;
  const REV = rev16();
  const len = input.length;
  const dict: string[] = ['', '', ''];
  const out: string[] = [];
  let enlargeIn = 4, dictSize = 4, numBits = 3;
  let buf = 0, bufLen = 0, index = 0;
  const read = (n: number): number => {
    if (n > 16) return read(16) | (read(n - 16) << 16);
    while (bufLen < n) {
      buf = ((buf << 15) | (index < len ? input.charCodeAt(index) - 32 : 0)) >>> 0;
      index++;
      bufLen += 15;
    }
    bufLen -= n;
    const v = (buf >>> bufLen) & ((1 << n) - 1);
    buf &= bufLen === 0 ? 0 : (1 << bufLen) - 1;
    return REV[v]! >>> (16 - n);
  };
  let w: string;
  switch (read(2)) {
    case 0: w = String.fromCharCode(read(8)); break;
    case 1: w = String.fromCharCode(read(16)); break;
    default: return '';
  }
  dict[3] = w;
  out.push(w);
  for (;;) {
    if (index > len + 2) return null;
    let cc = read(numBits);
    if (cc === 0 || cc === 1) {
      dict[dictSize++] = String.fromCharCode(read(cc === 0 ? 8 : 16));
      cc = dictSize - 1;
      enlargeIn--;
    } else if (cc === 2) return out.join('');
    if (enlargeIn === 0) {
      enlargeIn = 2 ** numBits;
      numBits++;
    }
    let entry: string;
    const known = cc < dictSize ? dict[cc] : undefined;
    if (known !== undefined) entry = known;
    else if (cc === dictSize) entry = w + w.charAt(0);
    else return null;
    out.push(entry);
    dict[dictSize++] = w + entry.charAt(0);
    enlargeIn--;
    w = entry;
    if (enlargeIn === 0) {
      enlargeIn = 2 ** numBits;
      numBits++;
    }
  }
}

// ── 세이브 덩어리 압축 ──

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 덩어리 저장소에 필요한 것 (localStorage 와 같은 모양). key·length 가 없으면 정리(collectChunks)는 건너뛴다 */
export interface ChunkStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
  key?(index: number): string | null;
  readonly length?: number;
}

/** 덩어리 키 앞부분 (세이브 키는 game.ts SAVE_KEY 와 같다 — 순환 import 를 피해 글로 둔다) */
export const CHUNK_PREFIX = 'bleach-hollow-ascension.save.z.';
const chunkKey = (h: number) => `${CHUNK_PREFIX}${h.toString(36)}`;

/** 53비트 해시 (FNV-1a 32비트 두 갈래) */
export function hash53(text: string): number {
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x5bd1e995);
    b ^= b >>> 13;
  }
  return (a >>> 0) % 0x200000 * 0x100000000 + (b >>> 0);
}

interface Packed { refs: readonly unknown[]; z: string; h: number }
/** 다 찬 덩어리 캐시: 덩어리 첫 기록 → (그때의 기록들, 압축 문자열, 해시). 기록들이 같은 객체 그대로면 다시 압축하지 않는다 */
const blockCache = new WeakMap<object, Packed>();
/** 저장소마다 이번 실행에서 확인한(내용이 같은 것을 본·직접 쓴) 덩어리 해시 */
const confirmed = new WeakMap<object, Set<number>>();
const confirmedOf = (st: object) => {
  let set = confirmed.get(st);
  if (!set) confirmed.set(st, (set = new Set()));
  return set;
};
/** C.139: 다른 창이 저장소의 덩어리를 바꿨다(storage 이벤트) — 이 저장소에 대해 확인해 둔 해시를 잊는다. 다음 저장은 덩어리가 실제로 있는지 다시 본다(GDD 88장 1) */
export function forgetConfirmedChunks(st: object): void {
  confirmed.delete(st);
}
/** storage 이벤트의 키가 압축 덩어리(또는 전체 비우기 null)인가 */
export const isChunkStorageKey = (key: string | null): boolean => key === null || key.startsWith(CHUNK_PREFIX);

/** 덩어리 → 열 모양 JSON: 키 이름을 한 번만 쓰고 같은 키 값끼리 모은다(압축이 훨씬 잘 된다). 객체가 아닌 기록이 섞이면 배열 그대로.
 *  { k: 키 목록, c: 키별 값 목록, m: 키별 그 키가 없던 기록 번호 } */
function toColumns(items: readonly unknown[]): string {
  if (!items.every(isRec)) return JSON.stringify(items);
  const recs = items as readonly Rec[];
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const o of recs) for (const k of Object.keys(o)) if (!seen.has(k)) { seen.add(k); keys.push(k); }
  const m: Record<string, number[]> = {};
  const c = keys.map((k) => recs.map((o, i) => {
    if (o[k] !== undefined) return o[k]; // undefined 값은 JSON 에 안 남으므로 '없음'으로
    (m[k] ??= []).push(i);
    return 0;
  }));
  return JSON.stringify(Object.keys(m).length > 0 ? { k: keys, c, m } : { k: keys, c });
}

function fromColumns(v: unknown): unknown[] | null {
  if (Array.isArray(v)) return v;
  if (!isRec(v) || !Array.isArray(v.k) || !Array.isArray(v.c) || v.k.length !== v.c.length) return null;
  const keys = v.k as string[], cols = v.c as unknown[][];
  const n = cols.length > 0 && Array.isArray(cols[0]) ? cols[0].length : 0;
  const miss = isRec(v.m) ? (v.m as Record<string, number[]>) : {};
  const out: Rec[] = Array.from({ length: n }, () => ({}));
  keys.forEach((k, ki) => {
    const col = cols[ki];
    if (!Array.isArray(col) || col.length !== n) throw new Error('세이브 압축 열이 깨졌다');
    const skip = new Set(Array.isArray(miss[k]) ? miss[k] : []);
    for (let i = 0; i < n; i++) if (!skip.has(i)) out[i]![k] = col[i];
  });
  return out;
}

function packBlock(items: readonly unknown[]): Packed {
  const head = items[0];
  if (typeof head === 'object' && head !== null) {
    const hit = blockCache.get(head);
    if (hit && hit.refs.length === items.length && hit.refs.every((r, i) => r === items[i])) return hit;
  }
  const z = lzCompress(toColumns(items));
  const p: Packed = { refs: items.slice(), z, h: hash53(z) };
  if (typeof head === 'object' && head !== null) blockCache.set(head, p);
  return p;
}

/** 덩어리를 저장소에 두고 해시 숫자를 돌려준다. 같은 해시 키에 다른 내용이 있으면(해시 충돌) 글 그대로. 쓰기가 막히면 예외(부르는 쪽이 저장 실패로) */
function storeBlock(st: ChunkStorage, p: Packed): number | string {
  const ok = confirmedOf(st);
  if (ok.has(p.h)) return p.h;
  const k = chunkKey(p.h);
  const cur = st.getItem(k);
  if (cur === null) st.setItem(k, p.z);
  else if (cur !== p.z) return p.z;
  ok.add(p.h);
  return p.h;
}

/** 런 로그 객체들과 그 경로 (지금 트랙 + 쉬는 트랙) */
function runLogsOf(s: Rec): { path: string; log: Rec; set: (log: Rec) => void }[] {
  const out: { path: string; log: Rec; set: (log: Rec) => void }[] = [];
  if (isRec(s.runLog)) out.push({ path: 'runLog', log: s.runLog, set: (l) => { s.runLog = l; } });
  if (Array.isArray(s.otherTracks)) {
    s.otherTracks.forEach((t, i) => {
      if (isRec(t) && isRec(t.runLog)) {
        const track = { ...t };
        (s.otherTracks as unknown[])[i] = track;
        out.push({ path: `otherTracks.${i}.runLog`, log: t.runLog, set: (l) => { track.runLog = l; } });
      }
    });
  }
  return out;
}

/** 저장할 문자열 (JSON). 짧은 세이브는 JSON.stringify 그대로.
 *  storage 를 주면 덩어리를 그 저장소의 해시 키에 쓰고 본문엔 해시만(쓰기가 막히면 예외), 안 주면 덩어리를 글로 품는다(내보내기) */
export function encodeSave(save: object, storage?: ChunkStorage): string {
  const s: Rec = { ...(save as Rec) };
  if (Array.isArray(s.otherTracks)) s.otherTracks = [...s.otherTracks];
  delete s[PACK_KEY];
  const packs: Record<string, (number | string)[]> = {};
  for (const { path, log, set } of runLogsOf(s)) {
    let copy: Rec | null = null;
    for (const [k, v] of Object.entries(log)) {
      if (UNPACKED.has(k) || !Array.isArray(v) || v.length < PACK_BLOCK * 2) continue;
      // 마지막 덩어리 하나 분량은 늘 평문으로 둔다(최근 기록이 혹시 고쳐져도 다시 압축된다)
      const frozen = Math.floor((v.length - PACK_BLOCK) / PACK_BLOCK);
      const blocks: (number | string)[] = [];
      for (let b = 0; b < frozen; b++) {
        const p = packBlock(v.slice(b * PACK_BLOCK, (b + 1) * PACK_BLOCK));
        blocks.push(storage ? storeBlock(storage, p) : p.z);
      }
      packs[`${path}.${k}`] = blocks;
      copy ??= { ...log };
      copy[k] = v.slice(frozen * PACK_BLOCK);
    }
    if (copy) set(copy);
  }
  if (Object.keys(packs).length > 0) s[PACK_KEY] = packs;
  return JSON.stringify(s);
}

/** 읽은 JSON 값을 평범한 세이브 객체로 (압축 덩어리를 풀어 목록 앞에 붙인다). 압축이 없으면 그대로.
 *  덩어리가 해시 숫자면 storage 에서 읽는다. countsOnly: 덩어리를 풀지 않고 개수만 맞춘 빈 기록으로 채운다(슬롯 목록 요약용 — 저장에 쓰면 안 된다).
 *  덩어리가 깨졌거나 없으면 예외 (부르는 쪽이 손상으로 처리) */
export function expandSave(raw: unknown, countsOnly = false, storage?: ChunkStorage | null): unknown {
  if (!isRec(raw) || !(PACK_KEY in raw)) return raw;
  const packs = raw[PACK_KEY];
  delete raw[PACK_KEY];
  if (!isRec(packs)) throw new Error('세이브 압축 영역이 깨졌다');
  for (const [path, blocks] of Object.entries(packs)) {
    const parts = path.split('.');
    const key = parts.pop()!;
    let log: unknown = raw;
    for (const p of parts) log = Array.isArray(log) ? log[Number(p)] : isRec(log) ? log[p] : undefined;
    if (!isRec(log) || !Array.isArray(blocks)) throw new Error(`세이브 압축 경로가 깨졌다: ${path}`);
    const tail = Array.isArray(log[key]) ? (log[key] as unknown[]) : [];
    const items: unknown[] = [];
    for (const ref of blocks) {
      if (countsOnly) {
        for (let i = 0; i < PACK_BLOCK; i++) items.push({});
        continue;
      }
      const z = typeof ref === 'string' ? ref : typeof ref === 'number' ? storage?.getItem(chunkKey(ref)) ?? null : null;
      const text = z === null ? null : lzDecompress(z);
      const part = text === null ? null : fromColumns(JSON.parse(text));
      if (!Array.isArray(part) || z === null) throw new Error(`세이브 압축 덩어리가 깨졌거나 없다: ${path}`);
      // 읽은 덩어리는 캐시해 두어, 다음 저장 때 다시 압축하지 않는다
      const h = typeof ref === 'number' ? ref : hash53(z);
      if (typeof ref === 'number' && storage) confirmedOf(storage).add(h);
      if (part.length === PACK_BLOCK && typeof part[0] === 'object' && part[0] !== null) blockCache.set(part[0], { refs: part.slice(), z, h });
      items.push(...part);
    }
    log[key] = [...items, ...tail];
  }
  return raw;
}

/** 저장 원문 → 세이브 값 (JSON 파싱 + 압축 풀기). 깨졌으면 예외 */
export function parseSaveText(text: string, countsOnly = false, storage?: ChunkStorage | null): unknown {
  return expandSave(JSON.parse(text), countsOnly, storage);
}

/** 세이브 원문들이 가리키는 덩어리 해시 (JSON 을 다 풀지 않고 `$z` 부분만) */
export function chunkRefsOf(text: string | null): number[] {
  if (!text) return [];
  const at = text.lastIndexOf(`"${PACK_KEY}":`);
  if (at < 0) return [];
  const out: number[] = [];
  for (const m of text.slice(at).matchAll(/[\[,](\d+)(?=[,\]])/g)) out.push(Number(m[1]));
  return out;
}

/** 아무 세이브도 가리키지 않는 덩어리 키를 지운다. keepTexts = 지금 저장소에 있는 모든 세이브·백업 원문.
 *  지운 덩어리는 '확인함'에서도 빼서, 저장 중이던 세이브가 다시 쓸 때 덩어리를 새로 쓴다. 지운 개수를 돌려준다 */
export function collectChunks(storage: ChunkStorage, keepTexts: readonly (string | null)[]): number {
  if (typeof storage.key !== 'function' || typeof storage.length !== 'number' || !storage.removeItem) return 0;
  const keep = new Set<number>();
  for (const t of keepTexts) for (const h of chunkRefsOf(t)) keep.add(h);
  const dead: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && k.startsWith(CHUNK_PREFIX) && !keep.has(parseInt(k.slice(CHUNK_PREFIX.length), 36))) dead.push(k);
  }
  const ok = confirmedOf(storage);
  for (const k of dead) {
    storage.removeItem(k);
    ok.delete(parseInt(k.slice(CHUNK_PREFIX.length), 36));
  }
  return dead.length;
}
