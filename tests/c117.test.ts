import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FACTIONS } from '../src/data/factions';
import { MIN_LOADABLE_SAVE_FORMAT, newSaveData, SAVE_FORMAT_VERSION, saveFormatStatus, writeSave, type SaveData } from '../src/game';
import { exportRawSlot, IMPORT_FAILURE_TEXT, parseImport, serializeSave } from '../src/saveBackup';
import { parseSaveText } from '../src/saveCodec';
import { allSlotSummaries, slotKey, slotSummary, type SlotSummary } from '../src/saveSlots';

function memStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

const withFormat = (f: number): SaveData => {
  const s = newSaveData(FACTIONS[0]!.id);
  s.meta.format = f;
  return s;
};

describe('C.117 옛 형식 세이브는 열지 않는다 (GDD 61장)', () => {
  it('지금 문턱은 1 — 현재 형식·기존 마이그레이션 대상은 그대로 열린다', () => {
    expect(MIN_LOADABLE_SAVE_FORMAT).toBe(1);
    expect(saveFormatStatus(SAVE_FORMAT_VERSION)).toBe('ok');
    expect(saveFormatStatus(1)).toBe('ok');
    expect(saveFormatStatus(SAVE_FORMAT_VERSION + 1)).toBe('newer');
    expect(saveFormatStatus(0)).toBe('invalid');
    expect(saveFormatStatus(1.5)).toBe('invalid');
    expect(saveFormatStatus('36')).toBe('invalid');
  });

  it('문턱 미만 → 이전 버전(incompatible/old), 문턱과 같음 → 정상, 더 새 형식 → incompatible/newer', () => {
    const st = memStore();
    writeSave(st, withFormat(30), slotKey(1));
    writeSave(st, withFormat(37), slotKey(2));
    writeSave(st, withFormat(36), slotKey(3));
    // 문턱 37, 현재 형식 37 이라고 가정(앞으로 형식을 올린 패치)
    const s = (n: number): SlotSummary => slotSummary(st, n, 37, 37);
    expect(s(1)).toMatchObject({ state: 'incompatible', reason: 'old', format: 30 });
    expect(s(3)).toMatchObject({ state: 'incompatible', reason: 'old', format: 36 });
    // 문턱 36 이면 36 은 그대로 열림
    expect(slotSummary(st, 3, 36, 37).state).toBe('ok');
    // 현재 형식 36 일 때 37(미래 버전) 세이브
    expect(slotSummary(st, 2, 1, 36)).toMatchObject({ state: 'incompatible', reason: 'newer', format: 37 });
  });

  it('지금 값으로는 옛 형식(예: 30)도 계속 열린다 — 슬롯 요약이 ok', () => {
    const st = memStore();
    writeSave(st, withFormat(30), slotKey(1));
    expect(allSlotSummaries(st)[0]!.state).toBe('ok');
  });

  it('옛 세이브 내보내기: 압축 덩어리를 풀어 원문(형식 번호 포함)을 그대로 돌려준다', () => {
    const st = memStore();
    const save = withFormat(30);
    // 런 로그를 길게 만들어 압축 덩어리($z)가 생기게 한다
    for (let i = 0; i < 130; i++) {
      save.runLog.absorbs.push({ ...(save.runLog.absorbs[0] ?? ({} as never)), n: i } as never);
    }
    save.runLog.runs.push(...Array.from({ length: 130 }, (_, i) => ({ id: i }) as never));
    writeSave(st, save, slotKey(1));
    const stored = st.getItem(slotKey(1))!;
    const out = exportRawSlot(st, 1);
    expect(out).not.toBeNull();
    expect(out!.format).toBe(30);
    const back = JSON.parse(out!.text) as SaveData;
    expect(back.meta.format).toBe(30);
    expect(back.runLog.runs).toHaveLength(130);
    expect(back.factionId).toBe(save.factionId);
    expect(stored.includes('"$z"') || back.runLog.runs.length === 130).toBe(true);
    // 내보내기는 저장소를 바꾸지 않는다
    expect(st.getItem(slotKey(1))).toBe(stored);
    expect(parseSaveText(stored, false, st)).toMatchObject({ meta: { format: 30 } });
  });

  it('비었거나 깨진 슬롯은 내보낼 것이 없다(null)', () => {
    const st = memStore();
    expect(exportRawSlot(st, 1)).toBeNull();
    st.setItem(slotKey(1), '{깨짐');
    expect(exportRawSlot(st, 1)).toBeNull();
  });

  it('가져오기: 문턱 미만은 old 로 거부 문구가 있다(지금 문턱 1 에서는 형식 0 은 corrupt)', () => {
    expect(IMPORT_FAILURE_TEXT.old).toMatch(/이전 버전/);
    const next = JSON.parse(serializeSave(withFormat(SAVE_FORMAT_VERSION + 1))) as SaveData;
    expect(parseImport(JSON.stringify(next))).toEqual({ ok: false, reason: 'newer' });
    const zero = JSON.parse(serializeSave(newSaveData(FACTIONS[0]!.id))) as SaveData;
    zero.meta.format = 0;
    expect(parseImport(JSON.stringify(zero))).toEqual({ ok: false, reason: 'corrupt' });
  });

  it('시작 화면: 알림 문구·[옛 세이브 내보내기]·[새로 시작], 슬롯 줄 문구', () => {
    const v = readFileSync('src/ui/startView.ts', 'utf8');
    expect(v).toContain('이전 버전 세이브라 이어서 할 수 없습니다 — 새로 시작합니다');
    expect(v).toContain('옛 세이브 내보내기');
    expect(v).toContain("sum.state === 'incompatible'");
    const app = readFileSync('src/ui/app.ts', 'utf8');
    expect(app).toContain('onExportOld');
    expect(app).toContain('exportRawSlot(store, n)');
  });

  it('형식을 올리는 패치 규칙이 코드 주석에 남아 있다', () => {
    const g = readFileSync('src/game.ts', 'utf8');
    expect(g).toContain('이 값도 같이 올리고 마이그레이션은 만들지 않는다');
  });
});
