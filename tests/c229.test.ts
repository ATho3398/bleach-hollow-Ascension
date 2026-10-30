// C.229 (GDD 154장): 가방 '기타' 창 · 재료 22종 — 두 종족 공통 데이터, 보관함 shared.items 에 담아 세이브 형식 그대로. 주는 곳은 어디에도 없다(개발 메뉴 포함) — 테스트는 세이브에 직접 넣는다
import { describe, expect, it } from 'vitest';
import { loadSave, newSaveData, writeSave } from '../src/game';
import { getMaterial, MATERIAL_DESC, MATERIAL_IDS, MATERIALS, ownedMaterials } from '../src/data/materials';
import { testItemIds, TEST_ITEM_KINDS } from '../src/engine/testMode';
import { inventoryOf } from '../src/inventory';
import { getFaction } from '../src/data/factions';

const NAMES = ['두꺼운 가죽', '유연한 가죽', '가벼운 가죽', '질긴 가죽', '흑요석', '가벼운 금속', '강철', '유연한 금속', '무른 금속', '호로 이빨', '가면 조각', '온전한 가면', '금 조각', '은 조각', '염료', '반짝이는 보석', '연마제', '윤활제', '질긴 실', '천 조각', '아교', '호박'];

function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

describe('154장 재료 22종', () => {
  it('이름·순서 = 사용자 원문(띄어쓰기만 다듬음), id 중복 없음, 호박 = 보석', () => {
    expect(MATERIALS.map((m) => m.name)).toEqual(NAMES);
    expect(new Set(MATERIAL_IDS).size).toBe(22);
    expect(getMaterial('mat-amber')?.note).toBe('보석');
    expect(MATERIAL_DESC).toBe('쓰임은 아직 알려지지 않았다');
  });
  it('처음엔 하나도 없고, 물건 탭(inventoryOf)에는 섞이지 않는다', () => {
    for (const f of ['hollow', 'shinigami']) {
      const save = newSaveData(f, 0);
      expect(ownedMaterials(save.shared.items)).toEqual([]);
      save.shared.items['mat-steel'] = 3;
      expect(inventoryOf(save, getFaction(f)).some((e) => e.id === 'mat-steel')).toBe(false);
    }
  });
});

describe('154장 주는 곳 없음 · 세이브', () => {
  it('개발 메뉴 아이템 생성에도 재료가 없다', () => {
    for (const k of TEST_ITEM_KINDS) expect(testItemIds(k).some((id) => MATERIAL_IDS.includes(id))).toBe(false);
  });
  it('세이브 형식 그대로: 저장·불러오기에 재료 개수가 남고, 모르는 id·음수는 버린다', () => {
    const save = newSaveData('shinigami', 0);
    Object.assign(save.shared.items, { 'mat-hollow-fang': 4, 'mat-glue': 1, 'mat-nope': 3, 'mat-steel': -2 });
    const st = mem();
    writeSave(st, save);
    const back = loadSave(st)!;
    expect(back.shared.items['mat-hollow-fang']).toBe(4);
    expect(back.shared.items['mat-nope']).toBeUndefined();
    expect(ownedMaterials(back.shared.items).map((x) => x.def.id)).toEqual(['mat-hollow-fang', 'mat-glue']);
  });
});
