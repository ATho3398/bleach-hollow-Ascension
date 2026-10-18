import { describe, expect, it } from 'vitest';
import { FACTIONS } from '../src/data/factions';
import { CUTSCENE, CUTSCENE_LINE_COUNT, cutsceneLines, parseCutscene } from '../src/data/evolution/cutscene';
import { FORM_TABLE, formsOfTier } from '../src/data/evolution';
import { LINEAGES } from '../src/data/lineages';
import { TERRAIN_TILES } from '../src/data/tiles';
import { TITLES } from '../src/data/titles';
import { BALANCE } from '../src/config/balance';
import { lineageKey, LIN_KEYS } from '../src/ui/bha/lineage';
import { tileKindOf } from '../src/ui/bha/nest';
import { countText, formCardModel, linbarModel, sortFormsForDex, titleRowKind, toward, traitBadgeCount, unequippedOwned } from '../src/ui/bha/nestLogic';
import { evolutionEffectRows } from '../src/ui/evolutionPanel';

describe('특성 탭 배지·보유 목록', () => {
  it('빈 슬롯이 있을 때만 "슬롯에 없는 보유 특성 수"를 센다', () => {
    const build = { owned: ['a', 'b', 'c', 'd'], slots: ['a', 'b', null] };
    expect(traitBadgeCount(build)).toBe(2);
    expect(unequippedOwned(build)).toEqual(['c', 'd']);
  });
  it('슬롯이 가득 차면 배지 0 (교체는 배지 대상이 아니다)', () => {
    expect(traitBadgeCount({ owned: ['a', 'b', 'c'], slots: ['a', 'b', 'c'] })).toBe(0);
  });
  it('보유가 없거나 전부 장착 중이면 0', () => {
    expect(traitBadgeCount({ owned: [], slots: [null, null] })).toBe(0);
    expect(traitBadgeCount({ owned: ['a'], slots: ['a', null] })).toBe(0);
  });
});

describe('계통 누적 막대 모델', () => {
  const ids = ['x', 'y', 'z'];
  it('횟수 0 인 계통은 조각에서 빠지고 부족한 칸은 빈 자리가 된다', () => {
    const m = linbarModel({ x: 5, y: 0, z: 2 }, ids, 27);
    expect(m.segs).toEqual([{ id: 'x', n: 5 }, { id: 'z', n: 2 }]);
    expect(m.total).toBe(7);
    expect(m.empty).toBe(20);
    expect(m.lead).toBe('x');
  });
  it('희귀 가중으로 합계가 필요 횟수를 넘으면 빈 자리는 0', () => {
    expect(linbarModel({ x: 20, y: 10 }, ids, 27).empty).toBe(0);
  });
  it('전부 0 이면 1위 없음, 동점이면 먼저 나온 계통', () => {
    expect(linbarModel({}, ids, 27).lead).toBeNull();
    expect(linbarModel({ x: 3, y: 3 }, ids, 27).lead).toBe('x');
  });
  it('음수·누락 값은 0 으로 본다', () => {
    const m = linbarModel({ x: -4 }, ids, 10);
    expect(m.total).toBe(0);
    expect(m.segs).toEqual([]);
  });
});

describe('계통 마크 매핑', () => {
  it('계통 5개가 a~e 로 하나씩 대응한다', () => {
    const keys = LINEAGES.map((l) => lineageKey(l.id));
    expect(keys).toEqual([...LIN_KEYS].slice(0, LINEAGES.length));
    expect(new Set(keys).size).toBe(LINEAGES.length);
  });
  it('모르는 계통은 undefined', () => expect(lineageKey('nope')).toBeUndefined());
});

describe('진화체 도감 카드 상태', () => {
  const t2 = formsOfTier(2);
  const base = t2.find((f) => f.fallback)!;
  const other = t2.find((f) => !f.fallback)!;
  it('발견하지 않은 진화체는 unknown 이고 지금 표시도 없다', () => {
    const m = formCardModel(other, new Set(), other.id);
    expect(m.state).toBe('unknown');
    expect(m.current).toBe(false);
  });
  it('발견한 현재 진화체는 current, 기본형은 base', () => {
    const u = new Set([other.id, base.id]);
    expect(formCardModel(other, u, other.id)).toMatchObject({ state: 'found', current: true, base: false });
    expect(formCardModel(base, u, other.id)).toMatchObject({ state: 'found', current: false, base: true });
  });
  it('기본형은 목록 맨 뒤로 정렬한다', () => {
    const sorted = sortFormsForDex(t2);
    expect(sorted[sorted.length - 1]!.fallback).toBe(true);
    expect(sorted).toHaveLength(t2.length);
  });
  it('모든 단계에 기본형이 정확히 1개', () => {
    for (const t of [2, 3, 4, 5]) expect(formsOfTier(t).filter((f) => f.fallback)).toHaveLength(1);
    expect(FORM_TABLE.length).toBeGreaterThan(0);
  });
});

describe('칭호 행 종류', () => {
  it('해금 > 숨김 > 이름 공개 미해금 순으로 판정', () => {
    expect(titleRowKind({ hidden: true }, 1)).toBe('unlocked');
    expect(titleRowKind({ hidden: true }, null)).toBe('hidden');
    expect(titleRowKind({ hidden: false }, null)).toBe('locked');
  });
  it('실제 칭호 데이터로도 숨김 칭호만 hidden', () => {
    for (const d of TITLES) expect(titleRowKind(d, null)).toBe(d.hidden ? 'hidden' : 'locked');
  });
});

describe('표기 헬퍼', () => {
  it('방향 조사: 받침 없음·ㄹ 받침은 로, 그 밖은 으로', () => {
    expect(toward('둥지')).toBe('둥지로');
    expect(toward('대원실')).toBe('대원실로');
    expect(toward('집')).toBe('집으로');
    expect(toward('둥지 (A)')).toBe('둥지 (A)(으)로');
  });
  it('종족 설정의 둥지 이름 모두에 맞는 조사가 붙는다', () => {
    for (const f of FACTIONS) expect(toward(f.nestName)).toMatch(/(으)?로$/);
  });
  it('countText', () => expect(countText(2, 10)).toBe('2 / 10'));
});

describe('타일 종류 → 덱 행 모양', () => {
  it('모든 지형 타일 종류에 색·아이콘이 있다', () => {
    for (const t of TERRAIN_TILES) {
      const k = tileKindOf(t);
      expect(k.cls).toMatch(/^(prey|elite|env|rest)$/);
      expect(k.icon).toMatch(/^i-tile-/);
    }
  });
});

describe('진화 연출 문구 데이터', () => {
  const vars = { nest: '둥지', absorb: '포식', from: '호로' };
  it('공통 문구가 있고 모든 목록이 3줄', () => {
    expect(CUTSCENE.lines['*']).toBeDefined();
    for (const v of Object.values(CUTSCENE.lines)) expect(v).toHaveLength(CUTSCENE_LINE_COUNT);
  });
  it('등록된 종족마다 3줄이 나오고 자리 표시({})가 남지 않는다', () => {
    for (const f of FACTIONS) {
      const lines = cutsceneLines(f.id, { nest: f.nestName, absorb: f.absorbActionName, from: f.tierNames[0] });
      expect(lines).toHaveLength(3);
      for (const l of lines) expect(l).not.toMatch(/[{}]/);
    }
  });
  it('문구가 없는 종족은 공통 문구에 종족 설정 값을 끼워 쓴다', () => {
    const lines = cutsceneLines('third', vars);
    expect(lines[0]).toContain('둥지');
    expect(lines[1]).toContain('포식');
    expect(lines[2]).toContain('호로');
  });
  it('잘못된 데이터는 던진다', () => {
    expect(() => parseCutscene({ provisional: true, lines: { hollow: ['a', 'b', 'c'] } })).toThrow();
    expect(() => parseCutscene({ provisional: true, lines: { '*': ['a', 'b'] } })).toThrow();
    expect(() => parseCutscene({ provisional: true, lines: { '*': ['a', 'b', ''] } })).toThrow();
  });
});

describe('진화 후 달라진 점 행', () => {
  const faction = FACTIONS[0]!;
  const form = FORM_TABLE.find((f) => f.tier === 2 && !f.fallback)!;
  it('슬롯은 진화 전 → 후 칸 수, 그 밖의 행은 배율·패시브·외형', () => {
    const rows = evolutionEffectRows(faction, form, 4);
    const per = BALANCE.provisional.evolution.slotsPerEvolution;
    expect(rows[0]!.value).toBe(`${4 - per} → 4칸`);
    expect(rows.map((r) => r.label)).toEqual([faction.slotName, '체력 배율', '공격 배율', '패시브', '외형']);
    expect(rows[1]!.value).toBe(`×${form.effects.hpMultiplier.toFixed(2)}`);
  });
  it('칸 수를 모르면 +N칸만 보인다', () => {
    expect(evolutionEffectRows(faction, form)[0]!.value).toBe(`+${BALANCE.provisional.evolution.slotsPerEvolution}칸`);
  });
});
