import { describe, expect, it } from 'vitest';
import { newSaveData, SAVE_FORMAT_VERSION, SAVE_KEY } from '../src/game';
import { applyImport, BACKUP_KEY, backupFileName, hasBackup, parseImport, serializeSave, swapWithBackup } from '../src/saveBackup';
import { newEvolution, recordEvolutionAbsorb } from '../src/engine/evolution';
import { evolutionHint, growthLines, hintText } from '../src/ui/bha/growthLogic';

function memStore(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe('세이브 내보내기·불러오기', () => {
  it('직렬화한 세이브를 그대로 읽어 온다 (형식 버전 포함)', () => {
    const save = newSaveData('hollow', 1000);
    const text = serializeSave(save);
    expect(JSON.parse(text).meta.format).toBe(SAVE_FORMAT_VERSION);
    const r = parseImport(text);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.migrated).toBe(false);
      expect(r.save.factionId).toBe('hollow');
    }
  });

  it('빈 글·JSON 아님·세이브 아님·손상·새 버전·모르는 종족을 거부한다', () => {
    const good = JSON.parse(serializeSave(newSaveData('shinigami', 1)));
    const why = (v: unknown) => {
      const r = parseImport(typeof v === 'string' ? v : JSON.stringify(v));
      return r.ok ? 'ok' : r.reason;
    };
    expect(why('  ')).toBe('empty');
    expect(why('{abc')).toBe('not-json');
    expect(why({ hello: 1 })).toBe('not-save');
    expect(why([1, 2])).toBe('not-save');
    expect(why({ ...good, meta: { ...good.meta, format: SAVE_FORMAT_VERSION + 1 } })).toBe('newer');
    expect(why({ ...good, meta: { ...good.meta, format: 0 } })).toBe('corrupt');
    expect(why({ ...good, nest: 'x' })).toBe('corrupt');
    expect(why({ ...good, runLog: { ...good.runLog, battles: 3 } })).toBe('corrupt');
    expect(why({ ...good, factionId: 'nobody' })).toBe('faction');
    expect(why(good)).toBe('ok');
  });

  it('이전 형식은 기존 마이그레이션으로 올려 받는다', () => {
    const old = JSON.parse(serializeSave(newSaveData('hollow', 1)));
    old.meta.format = 10;
    delete old.help;
    const r = parseImport(JSON.stringify(old));
    expect(r.ok && r.migrated).toBe(true);
    if (r.ok) expect(r.save.meta.format).toBe(SAVE_FORMAT_VERSION);
  });

  it('적용하면 현재 세이브를 백업 키에 보관하고, 맞바꾸면 되돌린다', () => {
    const cur = serializeSave(newSaveData('hollow', 1));
    const store = memStore({ [SAVE_KEY]: cur });
    expect(hasBackup(store)).toBe(false);
    const incoming = newSaveData('shinigami', 2);
    expect(applyImport(store, incoming)).toBe(true);
    expect(store.m.get(BACKUP_KEY)).toBe(cur);
    expect(JSON.parse(store.m.get(SAVE_KEY)!).factionId).toBe('shinigami');
    expect(swapWithBackup(store)).toBe(true);
    expect(store.m.get(SAVE_KEY)).toBe(cur);
    expect(JSON.parse(store.m.get(BACKUP_KEY)!).factionId).toBe('shinigami');
  });

  it('세이브가 없던 기기에서도 가져오고, 쓰기가 막히면 false 로 현재 세이브를 건드리지 않는다', () => {
    const empty = memStore();
    expect(applyImport(empty, newSaveData('hollow', 1))).toBe(true);
    expect(empty.m.has(BACKUP_KEY)).toBe(false);
    const blocked = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    expect(applyImport(blocked, newSaveData('hollow', 1))).toBe(false);
    expect(swapWithBackup(memStore())).toBe(false);
  });

  it('파일 이름에 형식과 시각이 들어간다', () => {
    const name = backupFileName(newSaveData('hollow'), new Date(2026, 9, 18, 22, 5));
    expect(name).toBe(`bha-save-f${SAVE_FORMAT_VERSION}-20261018-2205.json`);
  });
});

describe('진화 예고·성장 요약', () => {
  const nameOf = (id: string) => `<${id}>`;
  it('누적이 없으면 방향이 뚜렷하지 않다고만 한다', () => {
    const h = evolutionHint(newEvolution())!;
    expect(h.leads).toEqual([]);
    expect(hintText(h, nameOf)).toContain('아직 방향이 뚜렷하지 않다');
  });

  it('상위 계통은 최대 2개 — 둘째는 첫째의 절반 이상일 때만, 남은 수가 같이 나온다', () => {
    const e = newEvolution();
    for (let i = 0; i < 6; i++) recordEvolutionAbsorb(e, 'lineage-a', false);
    expect(evolutionHint(e)).toEqual({ leads: ['lineage-a'], remaining: 28 });
    for (let i = 0; i < 4; i++) recordEvolutionAbsorb(e, 'lineage-b', false);
    recordEvolutionAbsorb(e, 'lineage-c', false);
    const h = evolutionHint(e)!;
    expect(h.leads).toEqual(['lineage-a', 'lineage-b']);
    expect(hintText(h, nameOf)).toBe('지금 흐름이면 <lineage-a>·<lineage-b> 쪽 · 진화까지 23회');
  });

  it('마지막 단계는 예고가 없다', () => {
    const e = newEvolution();
    e.tierIndex = 4;
    expect(evolutionHint(e)).toBeNull();
  });

  it('성장 요약은 사실만 적고 새 칭호는 있을 때만 둘째 줄', () => {
    expect(growthLines({ newTraits: 2, remaining: 5, newTitles: [] })).toEqual(['새 특성 2개 · 진화까지 5회']);
    expect(growthLines({ newTraits: 0, remaining: 0, newTitles: ['가', '나'] })).toEqual(['새 특성 없음 · 진화 가능', '새 칭호 「가」 「나」']);
    expect(growthLines({ newTraits: 1, remaining: null, newTitles: [] })).toEqual(['새 특성 1개']);
  });
});
