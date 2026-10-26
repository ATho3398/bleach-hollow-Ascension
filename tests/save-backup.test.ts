import { BALANCE } from '../src/config/balance';
import { describe, expect, it } from 'vitest';
import { newSaveData, SAVE_FORMAT_VERSION, SAVE_KEY } from '../src/game';
import { applyImport, BACKUP_KEY, backupFileName, hasBackup, parseImport, serializeSave, swapWithBackup } from '../src/saveBackup';
import { canEvolve, newEvolution, recordEvolutionStep } from '../src/engine/evolution';
import { growthLines } from '../src/ui/bha/growthLogic';
import { useLegacyMigrations } from './helpers/legacyGate';

useLegacyMigrations(); // 옛 형식 마이그레이션 시험 (C.120, GDD 61장)

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

describe('진화 신호·성장 요약 (C.47: 걸음 수는 숨기고 임박 알림만)', () => {
  it('남은 걸음이 20%·10% 가 되는 순간 한 번씩 알림 번호 1·2 를 주고, 다 걸으면 진화할 수 있다', () => {
    const e = newEvolution();
    const need = BALANCE.provisional.evolution.stepsNeeded[0]!;
    const alerts: [number, number][] = [];
    for (let i = 1; i <= need; i++) {
      const a = recordEvolutionStep(e);
      if (a !== null) alerts.push([i, a]);
      expect(canEvolve(e)).toBe(i >= need);
    }
    expect(alerts).toEqual([[need - Math.floor(need * 0.2), 1], [need - Math.floor(need * 0.1), 2]]);
    // 기준을 넘겨 더 걸어도 알림은 더 없다
    expect(recordEvolutionStep(e)).toBeNull();
  });

  it('마지막 단계는 걸음을 세지 않고 알림도 없다', () => {
    const e = newEvolution();
    e.tierIndex = 4;
    expect(recordEvolutionStep(e)).toBeNull();
    expect(e.steps).toBe(0);
    expect(canEvolve(e)).toBe(false);
  });

  it('성장 요약은 사실만 적고 새 칭호는 있을 때만 둘째 줄', () => {
    expect(growthLines({ newTraits: 2, evolvedTo: null, newTitles: [] })).toEqual(['새 특성 2개']);
    expect(growthLines({ newTraits: 0, evolvedTo: '불 바스트로데', newTitles: ['가', '나'] })).toEqual(['새 특성 없음 · 진화! 불 바스트로데', '새 칭호 「가」 「나」']);
    expect(growthLines({ newTraits: 1, evolvedTo: null, newTitles: [] })).toEqual(['새 특성 1개']);
  });
});
