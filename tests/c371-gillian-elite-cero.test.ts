// C.371 (GDD 227장): 외눈 길리안 = 강적 스티치마우스 그림 · 강적 강공격 = 빨간 세로(Cero, 불투명도 70%)
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { ART_MANIFEST, GILLIAN_ENEMIES, GILLIAN_SCALE, enemyArt } from '../src/data/art/manifest';
import { rigPack, rigPackOfLook } from '../src/data/art/rig/pose';
import { attackCueOf, cueHitMs, heavyCue, hitDelaysOf } from '../src/ui/attackFx';
import { ELITE_HEAVY_CERO, ELITE_HEAVY_ELEMENT } from '../src/ui/attackFxConfig';
import { fxSheetName } from '../src/ui/bha/pixelFx';
import { createRigPlayer } from '../src/ui/bha/rigAnim';
import { resolveMotions } from '../src/data/art/rig/pose';
import enemies from '../src/data/enemies/enemies.json';
import type { CombatEvent } from '../src/engine/combat';

describe('C.371 외눈 길리안 = 강적 스티치마우스 (GDD 227장 1)', () => {
  it('스티치마우스(유일한 길리안 등급 강적) 그림 = 종이인형 외눈 길리안, 배율 = 내 2단계 길리안', () => {
    expect(GILLIAN_ENEMIES).toEqual({ 'normal-heavy-seal': 'gillian-cyclops' });
    const e = (enemies as { id: string; class: string; grade?: string }[]).find((x) => x.id === 'normal-heavy-seal')!;
    expect([e.class, e.grade]).toEqual(['elite', 'gillian']);
    const a = enemyArt('normal-heavy-seal', '/')!;
    expect(a.rig?.look).toBe('gillian-cyclops');
    expect(a.scale).toBe(GILLIAN_SCALE);
    expect(existsSync(`public${a.src}`)).toBe(true);
    expect(ART_MANIFEST['char.hollow.2']!.rig).toBe('gillian-base'); // 내 2단계는 원래 부리 길리안 그대로
    const look = rigPack('humanoid').rig.looks['gillian-cyclops']!;
    expect([look.body, look.artFolder]).toEqual(['hd', 'hd-cyclops']);
    expect(rigPackOfLook('gillian-cyclops')!.id).toBe('humanoid');
  });
});

describe('C.371 강적 강공격 = 빨간 세로 (GDD 227장 2)', () => {
  const heavy = { kind: 'heavy-hit', damage: 10, guarded: false } as unknown as CombatEvent;
  it('세로 한 겹: 빨강(혈 속성 시트)·불투명도 0.7·치는 쪽에서 오른쪽(적 → 나)으로', () => {
    const L = ELITE_HEAVY_CERO.layers[0]!;
    expect([L.fx, L.anchor, L.opacity]).toEqual(['custom/cero', 'attacker', 0.7]);
    // 자리는 도구 기준(치는 쪽이 왼쪽을 향함, dx < 0) — 적 쪽은 pixelInst 가 좌우를 뒤집어 오른쪽으로 (GDD 227장, C.372)
    expect(L.dx).toBeLessThan(0);
    expect(existsSync(`public/fx/${fxSheetName(L.fx, ELITE_HEAVY_ELEMENT)}.png`)).toBe(true);
  });
  it('강공격 신호: 강적이면 세로 도트 연출, 아니면(보스) 옛 돌진', () => {
    expect(attackCueOf(heavy, 3, undefined, ELITE_HEAVY_CERO)?.pixel).toEqual({ stage: ELITE_HEAVY_CERO, element: 'blood' });
    expect(attackCueOf(heavy, 3)?.pixel).toBeUndefined();
    expect(heavyCue(true, ELITE_HEAVY_CERO).guarded).toBe(true);
  });
  it('엔진 강공격 지연 = 화면과 같은 신호(세로가 다 뻗은 뒤 맞음 — 동작 타격 + 60ms)', () => {
    const p = rigPack('humanoid');
    const ms = resolveMotions(p.rig, p.motions, p.sets, 'hd');
    const foe = createRigPlayer(p.rig, ms, () => {}, () => 0);
    const base = cueHitMs({ tier: 'special' }, foe, 'male');
    expect(cueHitMs(heavyCue(false, ELITE_HEAVY_CERO), foe, 'male')).toBeCloseTo(base + 60, 6);
    const fb = { basic: 0.3, block: 0.3, enemy: 0.3, heavy: 0.3, counter: 0.3 };
    const t0 = hitDelaysOf({ player: null, enemy: foe, slot: 'male', familyIds: [], fallback: fb });
    const t1 = hitDelaysOf({ player: null, enemy: foe, slot: 'male', familyIds: [], fallback: fb, heavyPixel: ELITE_HEAVY_CERO });
    expect(t1.heavy).toBeCloseTo(t0.heavy + 0.06, 3);
  });
});
