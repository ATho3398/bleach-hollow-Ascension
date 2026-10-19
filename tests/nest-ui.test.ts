import { describe, expect, it } from 'vitest';
import { FACTIONS } from '../src/data/factions';
import { CUTSCENE, CUTSCENE_LINE_COUNT, cutsceneLines, parseCutscene } from '../src/data/evolution/cutscene';
import { FORM_TABLE, formsOfTier } from '../src/data/evolution';
import { ELEMENTS, getElement } from '../src/data/elements';
import { TERRAIN_TILES } from '../src/data/tiles';
import { TITLES } from '../src/data/titles';
import { BALANCE } from '../src/config/balance';
import { tileKindOf } from '../src/ui/bha/nest';
import { countText, formCardModel, sortFormsForDex, titleRowKind, toward, unequippedOwned } from '../src/ui/bha/nestLogic';
import { evolutionEffectRows, statsLine } from '../src/ui/evolutionPanel';

describe('보유 목록', () => {
  it('슬롯에 장착되지 않은 보유 특성만 센다', () => {
    const build = { owned: ['a', 'b', 'c', 'd'], slots: ['a', 'b', null] };
    expect(unequippedOwned(build)).toEqual(['c', 'd']);
  });
  it('보유가 없거나 전부 장착 중이면 비어 있다', () => {
    expect(unequippedOwned({ owned: [], slots: [null, null] })).toEqual([]);
    expect(unequippedOwned({ owned: ['a'], slots: ['a', null] })).toEqual([]);
  });
});

describe('속성 표시 데이터 (C.47)', () => {
  it('속성 8종이 모두 겹치지 않는 한 글자 약자와 기존 토큰 색을 가진다', () => {
    expect(ELEMENTS).toHaveLength(8);
    const abbrs = ELEMENTS.map((e) => e.abbr['*']);
    expect(new Set(abbrs).size).toBe(ELEMENTS.length);
    for (const e of ELEMENTS) {
      expect(Array.from(e.abbr['*']!)).toHaveLength(1);
      expect(getElement(e.id).color).toMatch(/^--bha-/);
    }
  });
});

describe('진화체 도감 카드 상태', () => {
  const t4 = formsOfTier(4);
  const hiddenForm = t4.find((f) => f.hidden)!;
  const other = t4.find((f) => !f.hidden)!;
  it('발견하지 않은 진화체는 unknown 이고 지금 표시도 없다', () => {
    const m = formCardModel(other, new Set(), other.id);
    expect(m.state).toBe('unknown');
    expect(m.current).toBe(false);
  });
  it('발견한 현재 진화체는 current, 히든은 hidden, 카드 색은 첫 속성', () => {
    const u = new Set([other.id, hiddenForm.id]);
    expect(formCardModel(other, u, other.id)).toMatchObject({ state: 'found', current: true, hidden: false, element: other.label.elements[0] });
    expect(formCardModel(hiddenForm, u, other.id)).toMatchObject({ state: 'found', current: false, hidden: true });
  });
  it('속성을 잇는 아란칼 히든은 카드 색 속성이 없다', () => {
    const limit = formsOfTier(5).find((f) => f.label.kind === 'limit')!;
    expect(formCardModel(limit, new Set([limit.id]), null).element).toBeUndefined();
  });
  it('히든은 목록 맨 뒤로 정렬한다 (안정 정렬)', () => {
    const sorted = sortFormsForDex(t4);
    const firstHidden = sorted.findIndex((f) => f.hidden);
    expect(sorted.slice(firstHidden).every((f) => f.hidden)).toBe(true);
    expect(sorted.slice(0, firstHidden)).toEqual(t4.filter((f) => !f.hidden));
    expect(sorted).toHaveLength(t4.length);
  });
  it('모든 단계에 일반 진화체가 있고, 히든은 4·5단계에만', () => {
    for (const t of [2, 3, 4, 5]) expect(formsOfTier(t).filter((f) => !f.hidden).length).toBeGreaterThan(0);
    for (const t of [2, 3]) expect(formsOfTier(t).filter((f) => f.hidden)).toHaveLength(0);
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
  const form = FORM_TABLE.find((f) => f.tier === 2 && !f.hidden)!;
  it('슬롯은 진화 전 → 후 칸 수, 그 밖의 행은 종족값·외형 (속성·고유 특성은 extra 가 있을 때만)', () => {
    const rows = evolutionEffectRows(faction, form, 4);
    const per = BALANCE.provisional.evolution.slotsPerEvolution;
    expect(rows[0]!.value).toBe(`${4 - per} → 4칸`);
    expect(rows.map((r) => r.label)).toEqual([faction.slotName, '종족값', '외형']);
    expect(rows[1]!.value).toBe(statsLine(faction.id, form.stats));
  });
  it('종족값 한 줄은 능력치 6개를 이름과 함께 적는다', () => {
    const line = statsLine(faction.id, form.stats);
    expect(line.split(' · ')).toHaveLength(6);
    expect(line).toContain(`체력 ${form.stats.hp}`);
  });
  it('칸 수를 모르면 +N칸만 보인다', () => {
    expect(evolutionEffectRows(faction, form)[0]!.value).toBe(`+${BALANCE.provisional.evolution.slotsPerEvolution}칸`);
  });
});
