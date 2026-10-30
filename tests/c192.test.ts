// C.192 (GDD 118장): 홈 크기 원래대로 · 사신 권/참/귀 재정의 · 귀도 이름
import { describe, expect, it } from 'vitest';
import type { CombatEvent } from '../src/engine/combat';
import { parseFactionConfig } from '../src/engine/faction';
import { getFaction } from '../src/data/factions';
import { familyCategory } from '../src/engine/absorb/build';
import { attackCueOf, animActionOf } from '../src/ui/attackFx';
import { createRigPlayer, FAMILY_RIG_MOTIONS } from '../src/ui/bha/rigAnim';
import { HUMANOID, MOTIONS } from '../src/data/art/rig/pose';
import { charArt } from '../src/data/art/manifest';
import { TRAITS, traitDescription } from '../src/data/traits';
import shinigami from '../src/data/factions/shinigami.json';
import hollow from '../src/data/factions/hollow.json';

const block = (o: Partial<Extract<CombatEvent, { kind: 'block' }>> = {}): CombatEvent => ({
  kind: 'block', block: 'skill', traitId: 'x', family: null, element: null, matchup: 'neutral', role: 'attack', chain: 1, damage: 10, weak: false, heal: 0, guardSeconds: 0, bonus: null, ...o,
});
const fam = (abbr: string) => getFaction('shinigami').families.find((f) => f.abbr === abbr)!;

describe('118장 2: 사신 권 = 물리 · 참 = 혼합 · 귀 = 특공', () => {
  it('분류·몸동작은 종족 설정에서, 호로는 그대로', () => {
    expect([fam('권').category, fam('참').category, fam('귀').category]).toEqual(['physical', 'mixed', 'special']);
    expect([fam('권').motion, fam('참').motion, fam('귀').motion]).toEqual(['strike', 'slash', 'cast']);
    expect(familyCategory('shinigami', fam('권').id)).toBe('physical');
    expect(getFaction('hollow').families.map((f) => [f.category, f.motion])).toEqual([['physical', undefined], ['mixed', undefined], ['special', undefined]]);
    expect(() => parseFactionConfig(shinigami)).not.toThrow();
    expect(() => parseFactionConfig(hollow)).not.toThrow();
    expect(() => parseFactionConfig({ ...shinigami, families: shinigami.families.map((f) => ({ ...f, motion: 'dance' })) })).toThrow(/motion/);
  });
  it('배수·stagger 는 블록 단계 기준 그대로(계열 따라 옮기지 않음)', () => {
    expect(fam('참').tiers.map((t) => [t.multiplier, t.bonus?.value])).toEqual([[1, undefined], [2.2, undefined], [3.6, 1.5]]);
    expect(fam('권').tiers.map((t) => [t.multiplier, t.bonus?.value])).toEqual([[1, undefined], [2.2, undefined], [3.6, 2.0]]);
    expect(fam('귀').tiers.map((t) => [t.multiplier, t.bonus?.value])).toEqual([[1, undefined], [2.2, undefined], [3.6, 1.5]]);
  });
  it('원인 수정: 계열 블록 연출이 계열 몸동작을 싣고, 종이인형은 그 묶음에서만 고른다(권 = 주먹·발차기, 귀도 안 나감)', () => {
    const familyFx = (id: string) => {
      const f = getFaction('shinigami').families.find((x) => x.id === id)!;
      return { fx: f.fx, motion: f.motion ?? null };
    };
    const cue = attackCueOf(block({ family: fam('권').id }), 3, familyFx)!;
    expect(cue.motion).toBe('strike');
    expect(animActionOf(cue, () => true)).toBe('skill');
    expect(FAMILY_RIG_MOTIONS).toEqual({ strike: ['punch', 'kick'], slash: ['attack', 'attack2', 'skill2'], cast: ['skill'] });
    let k = 0;
    const p = createRigPlayer(HUMANOID, MOTIONS, () => {}, () => [0, 0.99][k++ % 2]!);
    const seen = (motion: 'strike' | 'slash' | 'cast', n: number) => Array.from({ length: n }, () => {
      const r = p.play('skill', { motion, fromHit: true })!;
      const m = p.pose().motion;
      p.advance(r.durationMs + 1);
      return Object.keys(MOTIONS).find((id) => MOTIONS[id] === m);
    });
    expect(new Set(seen('strike', 4))).toEqual(new Set(['punch', 'kick']));
    expect(new Set(seen('cast', 3))).toEqual(new Set(['skill']));
    expect(seen('slash', 6).every((id) => FAMILY_RIG_MOTIONS.slash.includes(id!))).toBe(true);
    // 몸동작 없음(호로·필살) = 특수 동작 skill·skill2 그대로
    expect(['skill', 'skill2']).toContain(Object.keys(MOTIONS).find((id) => { p.play('skill'); return MOTIONS[id] === p.pose().motion; }));
  });
  it('특성 설명에 공격 분류는 안 보인다 (C.215: GDD 137장 1 — 분류는 데이터 category 로만)', () => {
    const a = TRAITS.find((t) => t.family === fam('참').id && t.kind === 'skill')!;
    const b = TRAITS.find((t) => t.family === fam('권').id && t.kind === 'skill')!;
    for (const id of [a.id, b.id]) for (const f of ['hollow', 'shinigami']) expect(traitDescription(id, f)).not.toMatch(/물리|혼합|특수/);
  });
});

describe('118장 3: 귀 블록 이름·연출', () => {
  it('파도 1 충 = 에너지볼(탄) · 파도 2 백뢰 = 하얀 번개(빔) · 파도 금강폭 = 큰 폭발', () => {
    expect(fam('귀').tiers.map((t) => [t.name, t.fx, t.fxLook])).toEqual([
      ['파도 1 충', 'shot', undefined],
      ['파도 2 백뢰', 'beam', 'byakurai'],
      ['파도 금강폭', 'shot', 'kongobaku'],
    ]);
  });
});

describe('118장 1: 방은 C.189 크기, 걷기·전투는 C.190 크기', () => {
  it('사신·학생·아란칼 종이인형: 방 1.78 · 필드 1.33', () => {
    for (const [f, t, key] of [['shinigami', 2, 'char.shinigami'], ['shinigami', 0, 'char.shinigami'], ['hollow', 4, 'char.hollow']] as const) {
      const a = charArt(f, t, key, '/', undefined, []);
      expect(a.rig, `${f} ${t}`).toBeTruthy();
      expect([a.scale, a.fieldScale]).toEqual([1.78, 1.33]);
    }
  });
});
