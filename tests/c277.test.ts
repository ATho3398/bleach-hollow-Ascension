// C.277 (GDD 181장): 블록 단계별 종이인형 동작 고정 — 사신 참 1단계 = 공격1, 호로 탄 2단계 = 특수1 · 3단계 = 특수2
import { describe, expect, it } from 'vitest';
import type { CombatEvent } from '../src/engine/combat';
import { parseFactionConfig } from '../src/engine/faction';
import { getFaction } from '../src/data/factions';
import { attackCueOf } from '../src/ui/attackFx';
import { createRigPlayer } from '../src/ui/bha/rigAnim';
import { HUMANOID, MOTIONS } from '../src/data/art/rig/pose';
import shinigami from '../src/data/factions/shinigami.json';
import hollow from '../src/data/factions/hollow.json';

const block = (o: Partial<Extract<CombatEvent, { kind: 'block' }>> = {}): CombatEvent => ({
  kind: 'block', block: 'skill', traitId: 'x', family: null, element: null, matchup: 'neutral', role: 'attack', chain: 1, damage: 10, weak: false, heal: 0, guardSeconds: 0, bonus: null, ...o,
});
const fam = (faction: string, abbr: string) => getFaction(faction).families.find((f) => f.abbr === abbr)!;
/** battleView 의 familyFx 와 같은 조회 (종족 설정 단계 → 연출·몸동작·고정 동작) */
const familyFx = (faction: string) => (id: string, stage: number) => {
  const f = getFaction(faction).families.find((x) => x.id === id)!;
  const t = f.tiers[stage - 1];
  return { fx: t?.fx ?? f.fx, look: t?.fxLook ?? null, motion: f.motion ?? null, rigMotion: t?.rigMotion ?? null };
};
const idOf = (m: unknown) => Object.keys(MOTIONS).find((id) => MOTIONS[id] === m);

describe('181장: 블록 단계별 종이인형 동작 고정 (사용자 2026-11-04 03:1x)', () => {
  it('종족 설정: 참 1단계 = attack, 탄 2단계 = skill · 3단계 = skill2, 나머지 단계는 고정 없음', () => {
    expect(fam('shinigami', '참').tiers.map((t) => t.rigMotion)).toEqual(['attack', undefined, undefined]);
    expect(fam('hollow', '탄').tiers.map((t) => t.rigMotion)).toEqual([undefined, 'skill', 'skill2']);
    for (const abbr of ['권', '귀']) expect(fam('shinigami', abbr).tiers.every((t) => t.rigMotion === undefined)).toBe(true);
    for (const abbr of ['조', '교']) expect(fam('hollow', abbr).tiers.every((t) => t.rigMotion === undefined)).toBe(true);
  });
  it('고정 동작은 게임 종이인형 동작에 있다, 잘못된 id 는 설정 검사에서 막는다', () => {
    for (const f of ['hollow', 'shinigami']) for (const x of getFaction(f).families) for (const t of x.tiers) if (t.rigMotion) expect(MOTIONS[t.rigMotion], t.rigMotion).toBeDefined();
    expect(() => parseFactionConfig(shinigami)).not.toThrow();
    expect(() => parseFactionConfig(hollow)).not.toThrow();
    const bad = { ...hollow, families: hollow.families.map((f) => ({ ...f, tiers: f.tiers.map((t) => ({ ...t, rigMotion: 'skill 2' })) })) };
    expect(() => parseFactionConfig(bad)).toThrow(/rigMotion/);
  });
  it('연출 큐가 단계의 고정 동작을 싣는다 (체인 = 단계)', () => {
    expect(attackCueOf(block({ family: fam('shinigami', '참').id, chain: 1 }), 3, familyFx('shinigami'))!.rigMotion).toBe('attack');
    expect(attackCueOf(block({ family: fam('shinigami', '참').id, chain: 2 }), 3, familyFx('shinigami'))!.rigMotion).toBeUndefined();
    expect(attackCueOf(block({ family: fam('hollow', '탄').id, chain: 1 }), 3, familyFx('hollow'))!.rigMotion).toBeUndefined();
    expect(attackCueOf(block({ family: fam('hollow', '탄').id, chain: 2 }), 3, familyFx('hollow'))!.rigMotion).toBe('skill');
    expect(attackCueOf(block({ family: fam('hollow', '탄').id, chain: 3 }), 3, familyFx('hollow'))!.rigMotion).toBe('skill2');
  });
  it('종이인형은 고정 동작만 튼다(무작위 없음), 고정이 없으면 예전대로 계열 묶음·게임 동작에서 고른다', () => {
    let k = 0;
    const p = createRigPlayer(HUMANOID, MOTIONS, () => {}, () => [0, 0.99][k++ % 2]!);
    const seen = (o: Parameters<typeof p.play>[1], n: number) => Array.from({ length: n }, () => {
      const r = p.play('skill', { fromHit: true, ...o })!;
      const id = idOf(p.pose().motion);
      p.advance(r.durationMs + 1);
      return id;
    });
    expect(new Set(seen({ motion: 'slash', rigMotion: 'attack' }, 6))).toEqual(new Set(['attack']));
    expect(new Set(seen({ rigMotion: 'skill' }, 6))).toEqual(new Set(['skill']));
    expect(new Set(seen({ rigMotion: 'skill2' }, 6))).toEqual(new Set(['skill2']));
    // 고정 없음(참 2·3단계, 탄 1단계): 예전 그대로 — 참 = 공격1·2, 호로 = 특수1·2 무작위
    expect(new Set(seen({ motion: 'slash' }, 6))).toEqual(new Set(['attack', 'attack2']));
    expect(new Set(seen({}, 6))).toEqual(new Set(['skill', 'skill2']));
    // 게임 데이터에 없는 동작이면 고정 무시
    expect(new Set(seen({ motion: 'cast', rigMotion: 'nope' }, 4))).toEqual(new Set(['skill', 'skill2']));
  });
});
