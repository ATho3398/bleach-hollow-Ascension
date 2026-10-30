// C.149 (GDD 94장 A): 보관함 슬롯 화면 바둑판 — 칸 배치 규칙(끌어놓기·고르기 공용), 블록 이름·아이콘, 플레이어 화면 문구
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { getFaction } from '../src/data/factions';
import { gainTrait, newBuild, type BuildState } from '../src/engine/absorb';
import { canPlace, clearCell, placeTrait, traitBlockName, traitBrief, traitIconId } from '../src/ui/buildPanel';

const read = (p: string) => readFileSync(p, 'utf8');
const hollow = getFaction('hollow');
const make = (): BuildState => {
  const b = newBuild();
  for (const id of ['t-water-a', 't-fire-a', 't-water-b', 't-earth-c']) gainTrait(b, id, 0);
  return b;
};

describe('C.149 칸 배치', () => {
  it('끌어다 놓기: 보유 카드 → 빈 본체 칸에 장착, 칸 → 칸은 자리를 바꾼다', () => {
    const b = newBuild();
    for (const id of ['t-water-a', 't-fire-a']) gainTrait(b, id, 0);
    b.slots = ['t-water-a', 't-fire-a', null];
    expect(placeTrait(b, { area: 'body', index: 2 }, 't-water-a', { area: 'body', index: 0 }).ok).toBe(true);
    expect(b.slots).toEqual([null, 't-fire-a', 't-water-a']);
    placeTrait(b, { area: 'body', index: 1 }, 't-water-a', { area: 'body', index: 2 });
    expect(b.slots).toEqual([null, 't-water-a', 't-fire-a']);
  });
  it('칸 → 목록(빼기): 특성은 보유에 남고 칸만 빈다', () => {
    const b = make();
    const id = b.slots.find(Boolean)!;
    clearCell(b, { area: 'body', index: b.slots.indexOf(id) });
    expect(b.slots.includes(id)).toBe(false);
    expect(b.owned).toContain(id);
  });
  it('해방 칸은 없다 (C.167, GDD 98장 B): 놓을 수 있는 곳은 본체 칸뿐', () => {
    const b = make();
    expect(canPlace(b, { area: 'body', index: 0 })).toBe(true);
    expect(canPlace(b, { area: 'body', index: b.slots.length })).toBe(false);
    expect('liberation' in b).toBe(false);
  });
});

describe('C.149 블록 이름·아이콘·문구', () => {
  it('블록 이름 = 조·탄·교 / 막기·회복 (속성 이름 없음), 계열·역할 아이콘', () => {
    expect(traitBlockName(hollow, 't-water-a')).toBe(hollow.families.find((f) => f.id === 'family-a')!.abbr);
    expect(traitBlockName(hollow, 't-fire-a')).not.toContain('불');
    expect(traitIconId(hollow, 't-fire-a')).toMatch(/^i-fx-/);
    expect(traitBrief(hollow, 't-fire-a')).toContain('위력');
    expect(traitBrief(hollow, 't-fire-a')).not.toContain('[임시]');
  });
  it('슬롯 화면: 리스트·분류 줄·임시 문구는 플레이어 화면에 없다 (테스트 모드에서만), 빈 문구', () => {
    const src = read('src/ui/buildPanel.ts');
    expect(src).not.toContain('공격 분류');
    expect(src).not.toContain('bha-owned__row');
    expect(src).toContain('남는 특성이 없다');
    expect(src).toMatch(/devText\(\)\) right\.append[\s\S]*PROVISIONAL_NOTE/); // C.171: 개발용 문구 스위치 하나
    expect(src).toMatch(/if \(devText\(\)\) left\.querySelector/);
  });
  it('칸·카드에 속성 강화 n강 (C.176 GDD 106장 1, n/3 속성 칩 없음)', () => {
    const src = read('src/ui/buildPanel.ts');
    expect(src.match(/\$\{enhanceLevel\(build, [^}]*\}강/g)!.length).toBeGreaterThanOrEqual(2);
    expect(src).not.toContain('elementBonusCount');
  });
  it('위쪽 탭 [슬롯 · 타일 · 물건 · 펫] (드롭다운 대신), 물건 탭 분류에서 펫 제외', () => {
    const src = read('src/ui/lcdScreens.ts');
    // C.237 (GDD 159장 24): '물건' → '소모품', 스킨은 위쪽 탭
    for (const k of ["id: 'slots', label: '슬롯'", "id: 'tiles', label: '타일'", "id: 'items', label: ITEM_CATEGORY_NAMES.consumable", "id: 'skin', label: ITEM_CATEGORY_NAMES.skin", "id: 'pet', label: '펫'"]) expect(src).toContain(k);
    expect(src).not.toContain('viewTitle');
    expect(src).toContain("mode === 'pet' ? all.filter((e) => e.category === 'pet')");
  });
  it('끌어놓기는 공용 dragdrop, 장착·해제는 기존 엔진 함수만', () => {
    const src = read('src/ui/buildPanel.ts');
    expect(src).toContain("from './bha/dragdrop'");
    expect(src).toMatch(/setSlot\(b, to\.index, id\)/);
    expect(read('src/ui/bha/dragdrop.ts')).toContain('HOLD_MS = 200');
  });
});
