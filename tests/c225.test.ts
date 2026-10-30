// C.225 (GDD 147·148장): 특성 = 3·4단계 진화 때만 1개 · (같은 루트 강화는 C.226 149장에서 폐기 — tests/c226) · 같은 특성 두 번 없음 · 칸 꽉 차면 못 받음 ·
// 받으면 영구(바꿔 끼기 없음) · 환생해도 유지 · 환생 화면 '가지고 갈 블록 1개' · 세이브 형식 58 → 59 마이그레이션
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getForm } from '../src/data/evolution';
import { FACTIONS } from '../src/data/factions';
import { gainTrait, newBuild } from '../src/engine/absorb';
import * as evolutionApi from '../src/engine/evolution';
import {
  abilityIdLine, evolve, gainEvolutionAbility, newAbilityLoadout, newEvolution, sameRoute, setAbilitySlots, type AbilityLoadout,
} from '../src/engine/evolution';
import { migrateSave, MIN_LOADABLE_SAVE_FORMAT, newSaveData, performRebirth, SAVE_FORMAT_VERSION, SAVE_MIGRATIONS } from '../src/game';
import { abilityGainRow } from '../src/ui/evolutionPanel';
import { rebirthFinalText, rebirthLists } from '../src/ui/rebirthView';

const f = getForm;
const loadout = (slots = 1): AbilityLoadout => ({ ...newAbilityLoadout(), slots });

describe('특성 받는 때 = 3·4단계 진화 (GDD 148장 1)', () => {
  it('2단계 진화는 특성 없음 · 3단계 물 = 물 속성 특성 · 성향 특성은 받지 않는다', () => {
    const e = newEvolution(3);
    e.abilities = newAbilityLoadout();
    e.ev.def = 5;
    e.steps = 999;
    const b = newBuild();
    gainTrait(b, 't-water-a');
    const r2 = evolve(e, b, { factionId: 'hollow', hunger: 20, condition: 80 }, 0);
    expect(r2.ok && r2.abilityGain).toEqual({ kind: 'none' });
    expect(e.abilities.owned).toEqual({});
    e.steps = 999;
    gainTrait(b, 't-water-b');
    const r3 = evolve(e, b, { factionId: 'hollow', hunger: 20, condition: 80 }, 0);
    expect(e.formId).toBe('t3:water');
    expect(r3.ok && r3.abilityGain).toEqual({ kind: 'new', id: 'el:water' });
    expect(r3.ok && r3.record.abilityGain).toEqual({ kind: 'new', id: 'el:water' }); // 런 로그
    expect(e.abilities.owned).toEqual({ 'el:water': 1 });
    expect(e.abilities.equipped).toEqual(['el:water']);
    expect(Object.keys(e.abilities.owned).some((id) => id.startsWith('disp:'))).toBe(false);
  });
});

describe('같은 루트 판정 (GDD 148장 2 — C.226 부터 특성 규칙에는 안 씀)', () => {
  it('히든 통로 → 4단계 히든, 망한 진화체 → 실패형 = 같은 루트. 다른 속성은 다른 루트', () => {
    expect(sameRoute(f('h3:passage'), f('h4:complete'))).toBe(true);
    expect(sameRoute(f('h3:passage'), f('t4:water:mixed'))).toBe(false);
    expect(sameRoute(f('h3:fail'), f('h4:fail'))).toBe(true);
    expect(sameRoute(f('t3:fire'), f('t4:fire:mixed'))).toBe(true);
    expect(sameRoute(f('t3:fire'), f('t4:blood:physical'))).toBe(false);
    expect(sameRoute(f('t3:water'), f('h4:fusion:water+earth'))).toBe(false);
  });
  it('칸이 꽉 차면 못 받음(진화 화면 한 줄)', () => {
    const l = { ...loadout(1), tier4Ever: true }; // 4단계 칸 +1 은 이미 받음(151장 2)
    gainEvolutionAbility(l, f('t3:fire'), f('t2:base'));
    delete l.pending; // 전생 3단계 특성처럼 바뀌지 않는 자리
    expect(gainEvolutionAbility(l, f('t4:blood:physical'), f('t3:fire'))).toEqual({ kind: 'full', id: 'el4:blood' });
    expect(Object.keys(l.owned)).toEqual(['el:fire']);
    const row = abilityGainRow({ kind: 'full', id: 'el4:blood' }, 1.5, 'hollow')!;
    expect(row.value).toContain('특성 칸이 없어 받지 못했다');
  });
});

describe('같은 특성 두 번 없음 · 환생해도 유지 · 받으면 영구 (GDD 147장, 148장 3·5)', () => {
  it('환생 뒤 같은 루트로 3·4단계를 가면 다시 받지 않는다(4단계 특성 그대로), 칸만 늘어난다', () => {
    const s = newSaveData('hollow', 1);
    const l = s.evolution.abilities!;
    gainEvolutionAbility(l, f('t3:water'), f('t2:base'));
    gainEvolutionAbility(l, f('t4:water:physical'), f('t3:water'));
    Object.assign(s.evolution, { tierIndex: 3, formId: 't4:water:physical', formHistory: ['t2:base', 't3:water', 't4:water:physical'], ability: 'atk' });
    expect(performRebirth(s, null, 5).ok).toBe(true);
    const l2 = s.evolution.abilities!;
    expect(l2.slots).toBe(3); // 1 + 4단계 진화 1 + 환생 1 (C.226 151장 2)
    expect(l2.owned).toEqual({ 'el4:water': 1.5 });
    expect(gainEvolutionAbility(l2, f('t3:water'), f('t2:base'))).toEqual({ kind: 'owned', id: 'el4:water' });
    expect(gainEvolutionAbility(l2, f('t4:water:mixed'), f('t3:water'))).toEqual({ kind: 'owned', id: 'el4:water' });
    expect(l2.owned).toEqual({ 'el4:water': 1.5 });
    expect(abilityGainRow({ kind: 'owned', id: 'el4:water' }, 1.5, 'hollow')!.value).toContain('이미 가진 특성');
    // 다른 루트면 빈 칸에 새 특성
    expect(gainEvolutionAbility(l2, f('t3:fire'), f('t2:base'))).toEqual({ kind: 'new', id: 'el:fire' });
    expect(l2.equipped).toEqual(['el4:water', 'el:fire']);
  });
  it('바꿔 끼기 없음: 칸 수가 바뀌어도 받은 특성은 빠지지 않는다 · equipAbility 삭제', () => {
    const l = loadout(2);
    gainEvolutionAbility(l, f('t3:water'), f('t2:base'));
    setAbilitySlots(l, 3);
    expect(l.equipped).toEqual(['el:water']);
    expect('equipAbility' in evolutionApi).toBe(false);
  });
});

describe("환생 화면 '가지고 갈 블록 1개' (GDD 148장 6)", () => {
  it('남는 것에 받은 특성 · 초기화 줄·최종 확인은 블록', () => {
    for (const fac of FACTIONS) {
      const { resets, keeps } = rebirthLists(fac);
      expect(resets.some((t) => t.includes('블록 (고른 1개는 가지고 간다)'))).toBe(true);
      expect(keeps.some((t) => t.includes('진화 때 받은 특성'))).toBe(true);
      expect(rebirthFinalText(fac, null).body).toContain('블록 없이');
      expect([...resets, ...keeps].join(' ')).not.toContain('특성 (고른');
    }
  });
});

describe('세이브 형식 58 → 59 → 60 (GDD 148장 7·149장 7, 123장 6)', () => {
  it('문턱 54 고정 · 단계 표에 58', () => {
    expect(SAVE_FORMAT_VERSION).toBeGreaterThanOrEqual(59);
    expect(MIN_LOADABLE_SAVE_FORMAT).toBe(54);
    expect(typeof SAVE_MIGRATIONS[58]).toBe('function');
  });
  const old58 = (history: string[], owned: Record<string, number>, rebirths = 0) => {
    const s = JSON.parse(JSON.stringify(newSaveData('hollow', 1000))) as Record<string, any>;
    s.meta.format = 58;
    Object.assign(s.evolution, { tierIndex: history.length, formHistory: history, formId: history[history.length - 1] ?? null, ability: 'atk' });
    s.rebirth.count = rebirths;
    s.evolution.abilities = { owned, equipped: Object.keys(owned), slots: 1 + rebirths, ascendedEver: false };
    return s;
  };
  it('성향·물공·2단계 몫은 빼고, 3단계 특성 → 4단계 특성 1개', () => {
    const m = migrateSave(old58(['t2:base', 't3:water', 't4:water:physical'], { 'disp:atk': 1, 'el:water': 1.5, 'phys:water': 1 }))!;
    expect(m.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(m.evolution.abilities!.owned).toEqual({ 'el4:water': 1.5 });
    expect(m.evolution.abilities!.equipped).toEqual(['el4:water']);
  });
  it('다른 루트·융합 조각 정리 · 칸 넘치면 먼저 얻은 것부터 · 쉬는 트랙도', () => {
    const old = old58(['t2:base', 't3:fire', 't4:blood:physical'], { 'el:blood': 1.5, 'el:fire': 1, 'disp:hp': 1 });
    old.otherTracks = [old58(['t2:base', 't3:water', 'h4:fusion:water+earth'], { 'el:water': 0.75, 'el:earth': 0.75, 'disp:int': 1 }, 1)];
    old.otherTracks[0].factionId = 'shinigami';
    const m = migrateSave(old)!;
    expect(m.evolution.abilities!.owned).toEqual({ 'el4:blood': 1.5 }); // 불 3단계 특성 → 혈 4단계 특성
    const t = m.otherTracks![0]!;
    expect(t.evolution.abilities!.slots).toBe(3); // 1 + 4단계 진화 1 + 환생 1 (C.226 151장 2)
    expect(t.evolution.abilities!.owned).toEqual({ 'el4:water+earth': 0.75 });
  });
});
