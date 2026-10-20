// 세이브 저장 압축 (H-1b, C.72): LZ 압축 왕복, 런 로그 덩어리 압축·풀기, 1000판 큰 세이브, 옛 비압축 세이브·가져오기 호환, 깨진 덩어리
import { describe, expect, it } from 'vitest';
import { playCombatBot } from '../src/engine/combat';
import { advance, botPickTrait, chooseAbsorb, chooseContinue, chooseReturn, createExpedition, finishBattle, finishRest, placeAll, startBattle, type ExpeditionState } from '../src/engine/expedition';
import { loadSave, migrateSave, newSaveData, recordExpedition, SAVE_FORMAT_VERSION, SAVE_KEY, writeSave, type SaveData } from '../src/game';
import { parseImport, serializeSave } from '../src/saveBackup';
import { CHUNK_PREFIX, chunkRefsOf, encodeSave, lzCompress, lzDecompress, PACK_BLOCK, PACK_KEY, parseSaveText } from '../src/saveCodec';
import { collectSlotChunks, slotBackupKey, slotKey, slotSummary, stashSlot, writeSlotSave } from '../src/saveSlots';
import { recoverFromBackup } from '../src/saveBackup';

const DECK = ['prey-nest-a', 'prey-nest-a', 'elite-den-a', 'env-fog', 'rest-a', 'prey-nest-b', 'env-ruin', 'elite-den-b'];
/** 저장소 흉내 (키 세기 가능). cap(글자 수)을 넘기는 쓰기는 QuotaExceededError 처럼 던진다 */
function memStore(init: Record<string, string> = {}, cap = Infinity) {
  const m = new Map(Object.entries(init));
  const used = () => [...m].reduce((n, [k, v]) => n + k.length + v.length, 0);
  return {
    m,
    used,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (used() - (m.has(k) ? k.length + m.get(k)!.length : 0) + k.length + v.length > cap) throw new DOMException('full', 'QuotaExceededError');
      m.set(k, v);
    },
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}
const chunks = (st: { m: Map<string, string> }) => [...st.m.keys()].filter((k) => k.startsWith(CHUNK_PREFIX));
function drive(exp: ExpeditionState): ExpeditionState {
  for (let g = 0; exp.phase !== 'ended' && g < 5000; g++) {
    if (exp.phase === 'moving') { placeAll(exp); advance(exp); }
    else if (exp.phase === 'battle') { const b = startBattle(exp); playCombatBot(b); finishBattle(exp, b); }
    else if (exp.phase === 'absorb') { const p = botPickTrait(exp); chooseAbsorb(exp, p.traitId, p.replaceSlot); }
    else if (exp.phase === 'rest') finishRest(exp);
    else if (exp.phase === 'nest-choice') { placeAll(exp); if (exp.lap >= 2) chooseReturn(exp); else chooseContinue(exp); }
  }
  return exp;
}
/** 실제 원정 n판을 다녀온 세이브 */
function played(n: number): SaveData {
  const save = newSaveData('hollow', 1_000);
  for (let i = 0; i < n; i++) recordExpedition(save, drive(createExpedition({ factionId: 'hollow', seed: i + 1, hunger: 10, condition: 100, deck: DECK })), 2_000 + i);
  return save;
}
const BASE = played(12);
/** 1000판 세이브: 실제 12판의 기록을 runId·시드·시간을 바꿔 가며 복제 (기록 모양·값 분포는 실제와 같다) */
function bigSave(runs = 1000): SaveData {
  const s = structuredClone(BASE);
  const per = Math.ceil(BASE.runLog.battles.length / BASE.runLog.runs.length);
  const log = s.runLog;
  log.battles = []; log.runs = []; log.absorbs = [];
  for (let r = 0; r < runs; r++) {
    const src = BASE.runLog.runs[r % BASE.runLog.runs.length]!;
    log.runs.push({ ...structuredClone(src), runId: r + 1, seed: (r * 2654435761) >>> 0 });
    for (let b = 0; b < per; b++) {
      const sb = BASE.runLog.battles[(r * per + b) % BASE.runLog.battles.length]!;
      log.battles.push({ ...structuredClone(sb), runId: r + 1, seed: (r * 7919 + b * 104729) >>> 0, durationSeconds: Math.round(((r * 13 + b * 7) % 900) + 200) / 10 });
    }
    for (const a of BASE.runLog.absorbs.filter((x) => x.runId === src.runId)) log.absorbs.push({ ...structuredClone(a), runId: r + 1 });
  }
  return s;
}

describe('LZ 압축', () => {
  it('왕복: 빈 글·한 글자·반복·한글·이모지(서로게이트)·제어 문자·JSON', () => {
    const cases = ['', 'a', 'aaaaaaaaaaaaaaaaaaaaaaaaa', '호로 사신 웨코문도 세군도 에타파 🌙🗡️', '\u0000\u0001\n\t"\\', JSON.stringify(BASE.runLog.battles)];
    let seed = 5;
    const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32;
    for (let i = 0; i < 30; i++) cases.push(Array.from({ length: Math.floor(rnd() * 3000) }, () => String.fromCharCode(Math.floor(rnd() * (rnd() < 0.5 ? 128 : 65536)))).join(''));
    for (const c of cases) {
      const z = lzCompress(c);
      for (const ch of z) expect(ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) < 0xd800).toBe(true);
      expect(lzDecompress(z) ?? (c === '' ? '' : null)).toBe(c);
    }
  });

  it('사전이 16비트를 넘는 큰 글(20만 자)도 왕복한다', () => {
    let seed = 9;
    const big = Array.from({ length: 200_000 }, () => String.fromCharCode(32 + ((seed = (seed * 1103515245 + 12345) >>> 0) % 5000))).join('');
    expect(lzDecompress(lzCompress(big))).toBe(big);
  });

  it('깨진 압축 글은 멈추지 않고 null 이나 다른 글을 돌려준다', () => {
    for (const z of ['', ' ', '翿翿翿', lzCompress('hello world').slice(0, 3)]) expect(() => lzDecompress(z)).not.toThrow();
  });
});

describe('런 로그 덩어리 압축', () => {
  it('짧은 세이브는 예전 JSON 그대로 (압축 영역 없음)', () => {
    const s = played(2);
    expect(encodeSave(s)).toBe(JSON.stringify(s));
  });

  it(`덩어리(${PACK_BLOCK}개)로 압축하고, 읽으면 같은 세이브 — 최근 기록은 평문으로 남는다`, () => {
    const text = encodeSave(BASE);
    const raw = JSON.parse(text);
    expect(raw[PACK_KEY]['runLog.battles'].length).toBe(Math.floor((BASE.runLog.battles.length - PACK_BLOCK) / PACK_BLOCK));
    expect(raw.runLog.battles.length).toBeGreaterThanOrEqual(PACK_BLOCK);
    expect(raw.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(parseSaveText(text)).toEqual(JSON.parse(JSON.stringify(BASE)));
  });

  it('쉬는 트랙의 런 로그도 압축·복원한다', () => {
    const s = structuredClone(BASE);
    s.otherTracks = [{ ...structuredClone(BASE), factionId: 'shinigami', parkedAt: 5 } as never];
    const text = encodeSave(s);
    expect(Object.keys(JSON.parse(text)[PACK_KEY])).toContain('otherTracks.0.runLog.battles');
    expect(parseSaveText(text)).toEqual(JSON.parse(JSON.stringify(s)));
    expect(s.otherTracks[0]!.runLog.battles).toHaveLength(BASE.runLog.battles.length); // 원본은 건드리지 않는다
  });

  it('기록을 더하거나, 최근 기록을 고치거나, 옛 기록을 새 객체로 바꿔도 저장 결과가 맞다 (캐시가 낡은 값을 쓰지 않는다)', () => {
    const s = structuredClone(BASE);
    encodeSave(s);
    s.runLog.battles.push({ ...s.runLog.battles[0]!, seed: 999 });
    s.runLog.battles[s.runLog.battles.length - 2]!.durationSeconds = 77.7;
    s.runLog.battles[3] = { ...s.runLog.battles[3]!, seed: 123456 };
    expect(parseSaveText(encodeSave(s))).toEqual(JSON.parse(JSON.stringify(s)));
  });

  it('loadSave·writeSave 왕복: 지금 형식 저장은 압축, 옛 비압축(형식 27) 세이브도 열린다', () => {
    const st = memStore();
    writeSave(st, BASE);
    expect(st.m.get(SAVE_KEY)!.includes(`"${PACK_KEY}"`)).toBe(true);
    expect(loadSave(st)!.runLog).toEqual(JSON.parse(JSON.stringify(BASE.runLog)));
    const old = { ...JSON.parse(JSON.stringify(BASE)), meta: { ...BASE.meta, format: 27 } };
    const r = loadSave(memStore({ [SAVE_KEY]: JSON.stringify(old) }))!;
    expect(r.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(r.runLog.battles).toHaveLength(BASE.runLog.battles.length);
  });

  it('가져오기는 압축·비압축 둘 다 받고, 내보내기는 압축된 JSON', () => {
    const packed = serializeSave(BASE);
    expect(JSON.parse(packed)[PACK_KEY]).toBeDefined();
    for (const text of [packed, JSON.stringify(BASE)]) {
      const r = parseImport(text);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.save.runLog.battles).toHaveLength(BASE.runLog.battles.length);
    }
  });

  it('깨진 덩어리: 가져오기는 손상, loadSave 는 null(→ 백업 복구), 슬롯 요약은 개수만 본다', () => {
    const raw = JSON.parse(encodeSave(BASE));
    raw[PACK_KEY]['runLog.battles'][0] = '翿!';
    const text = JSON.stringify(raw);
    expect(parseImport(text)).toEqual({ ok: false, reason: 'corrupt' });
    expect(loadSave(memStore({ [SAVE_KEY]: text }))).toBeNull();
    const bad = JSON.parse(encodeSave(BASE));
    bad[PACK_KEY] = 5;
    expect(loadSave(memStore({ [SAVE_KEY]: JSON.stringify(bad) }))).toBeNull();
    const sum = slotSummary(memStore({ [slotKey(1)]: encodeSave(BASE) }), 1);
    expect(sum).toMatchObject({ state: 'ok', expeditions: BASE.runLog.runs.length });
  });
});

describe('1000판 큰 세이브', () => {
  const big = bigSave(1000);
  const plain = JSON.stringify(big);
  const text = encodeSave(big);

  it('압축하면 1/4 이하, 슬롯 1개 + 백업이 저장 한도(약 500만 자의 절반 가정) 안', () => {
    expect(big.runLog.runs).toHaveLength(1000);
    expect(text.length).toBeLessThan(plain.length / 4);
    expect(2 * text.length).toBeLessThan(2_500_000);
  });

  it('읽으면 원래 세이브와 같고, 런 로그를 하나도 잃지 않는다', () => {
    const r = loadSave(memStore({ [SAVE_KEY]: text }))!;
    expect(r.runLog.runs).toHaveLength(1000);
    expect(r.runLog.battles).toEqual(JSON.parse(plain).runLog.battles);
    expect(r.runLog.absorbs).toEqual(JSON.parse(plain).runLog.absorbs);
  });

  it('읽은 뒤 한 판 더해 저장할 때는 다 찬 덩어리를 다시 압축하지 않는다 (같은 문자열 재사용)', () => {
    const r = migrateSave(parseSaveText(text))!;
    r.runLog.battles.push(...BASE.runLog.battles.slice(0, 7));
    r.runLog.runs.push(BASE.runLog.runs[0]!);
    const t0 = performance.now();
    const again = encodeSave(r);
    const ms = performance.now() - t0;
    const a = JSON.parse(text)[PACK_KEY]['runLog.battles'], b = JSON.parse(again)[PACK_KEY]['runLog.battles'];
    expect(b.slice(0, a.length)).toEqual(a);
    expect(ms).toBeLessThan(200); // 느슨한 상한 (실측은 dev-log C.72)
    expect(parseSaveText(again)).toEqual(JSON.parse(JSON.stringify(r)));
  });
});

describe('열 모양 덩어리', () => {
  it('키가 빠진 기록·undefined 값·null 값·객체 아닌 기록이 섞여도 JSON 왕복과 같다', () => {
    const s = structuredClone(BASE);
    s.runLog.battles = Array.from({ length: PACK_BLOCK * 3 }, (_, i) => ({ ...BASE.runLog.battles[i % BASE.runLog.battles.length]!, ...(i % 3 === 0 ? { crits: undefined } : {}), ...(i % 5 === 0 ? { lossReason: null } : {}) }));
    delete (s.runLog.battles[7] as Partial<typeof s.runLog.battles[0]>).seed;
    (s.runLog as unknown as Record<string, unknown>).rankChanges = Array.from({ length: PACK_BLOCK * 2 + 3 }, (_, i) => (i % 2 ? i : `x${i}`));
    expect(parseSaveText(encodeSave(s))).toEqual(JSON.parse(JSON.stringify(s)));
  });
});

describe('덩어리 키 저장 (저장소에 따로, 본문엔 해시)', () => {
  it('덩어리 키 앞부분 = 세이브 키 + .z.', () => {
    expect(CHUNK_PREFIX).toBe(`${SAVE_KEY}.z.`);
  });

  it('저장하면 덩어리는 해시 키에, 본문엔 숫자만 — 다시 읽으면 같다. 백업은 같은 덩어리를 같이 쓴다', () => {
    const st = memStore();
    writeSave(st, BASE);
    const text = st.m.get(SAVE_KEY)!;
    const refs = chunkRefsOf(text);
    expect(refs.length).toBe(JSON.parse(text)[PACK_KEY]['runLog.battles'].length + (JSON.parse(text)[PACK_KEY]['runLog.runs']?.length ?? 0) + (JSON.parse(text)[PACK_KEY]['runLog.absorbs']?.length ?? 0));
    expect(chunks(st).length).toBe(new Set(refs).size);
    expect(loadSave(st)!.runLog).toEqual(JSON.parse(JSON.stringify(BASE.runLog)));
    const before = chunks(st).length;
    stashSlot(st, 1, 'rank');
    expect(chunks(st).length).toBe(before);
    expect(loadSave(st, slotBackupKey(1))!.runLog.battles).toHaveLength(BASE.runLog.battles.length);
  });

  it('덩어리가 없어졌으면 그 세이브는 손상(null) — 백업이 읽히면 복구', () => {
    const st = memStore({ [slotBackupKey(1)]: JSON.stringify(BASE) });
    writeSave(st, BASE);
    st.m.delete(chunks(st)[0]!);
    expect(loadSave(st)).toBeNull();
    expect(slotSummary(st, 1)).toMatchObject({ state: 'ok' }); // 요약은 덩어리를 풀지 않는다
    expect(recoverFromBackup(st, 1)).toBe(true);
    expect(loadSave(st)!.runLog.battles).toHaveLength(BASE.runLog.battles.length);
  });

  it('정리: 어느 슬롯·백업도 안 가리키는 덩어리만 지우고, 지운 덩어리는 다음 저장 때 다시 쓴다', () => {
    const st = memStore();
    const other = bigSave(30);
    writeSave(st, other, slotKey(2));
    writeSave(st, BASE);
    const both = chunks(st).length;
    expect(collectSlotChunks(st)).toBe(0);
    st.m.delete(slotKey(2));
    const removed = collectSlotChunks(st);
    expect(removed).toBeGreaterThan(0);
    expect(chunks(st).length).toBe(both - removed);
    expect(loadSave(st)!.runLog.battles).toHaveLength(BASE.runLog.battles.length);
    // 같은 실행에서 지워진 덩어리(확인 기록이 있던 것)도 다시 저장하면 새로 쓴다
    writeSave(st, other, slotKey(3));
    st.m.delete(slotKey(3));
    collectSlotChunks(st);
    writeSave(st, other, slotKey(3));
    expect(loadSave(st, slotKey(3))!.runLog.battles).toHaveLength(other.runLog.battles.length);
  });

  it('저장 공간이 모자라면 먼저 버려진 덩어리를 치우고 쓴다 (백업은 그대로)', () => {
    const probe = memStore();
    writeSave(probe, BASE);
    const need = probe.used();
    const junk = 'x'.repeat(Math.ceil(need / 2));
    const st = memStore({ [`${CHUNK_PREFIX}zzzz`]: junk, [slotBackupKey(1)]: 'b' }, need + junk.length / 2);
    expect(writeSlotSave(st, BASE, 1)).toBe('ok');
    expect(st.m.has(`${CHUNK_PREFIX}zzzz`)).toBe(false);
    expect(st.m.get(slotBackupKey(1))).toBe('b');
    expect(loadSave(st)!.runLog.battles).toHaveLength(BASE.runLog.battles.length);
  });

  it('1000판: 슬롯 + 백업 + 덩어리 전체가 저장 한도 절반(250만 자) 안, 저장 본문은 작다', () => {
    const st = memStore();
    const big = bigSave(1000);
    writeSave(st, big);
    stashSlot(st, 1, 'rank');
    writeSave(st, big);
    expect(st.used()).toBeLessThan(1_250_000);
    expect(st.m.get(SAVE_KEY)!.length).toBeLessThan(250_000);
    expect(loadSave(st)!.runLog.runs).toHaveLength(1000);
  });
});
