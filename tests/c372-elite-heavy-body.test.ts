// C.372 (GDD 227장 보충): 강적 강공격 빨간 세로 — 몸마다 입 자리(적 데이터 eliteHeavyFx.json byBody), 자리는 도구 기준(dx < 0)
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import raw from '../src/data/enemies/eliteHeavyFx.json';
import { enemyArt } from '../src/data/art/manifest';
import { rigPackOfLook } from '../src/data/art/rig/pose';
import { ELITE_HEAVY_BODIES, ELITE_HEAVY_CERO, ELITE_HEAVY_ELEMENT, eliteHeavyFor } from '../src/ui/attackFxConfig';
import { fxSheetName } from '../src/ui/bha/pixelFx';

const bodyKeyOf = (enemyId: string): string | null => {
  const look = enemyArt(enemyId)?.rig?.look;
  const pack = look ? rigPackOfLook(look) : undefined;
  return pack && look ? `${pack.id}/${pack.rig.looks[look]!.body}` : null;
};

describe('C.372 강적 강공격 세로 몸마다', () => {
  it('덩치·외눈 길리안·뱀 세 몸, 기본 = 덩치, 색 = 혈, 불투명도 0.7', () => {
    expect([...ELITE_HEAVY_BODIES].sort()).toEqual(["beast/ref", "humanoid/hb", "humanoid/hd", "serpent/ref"]);
    expect(ELITE_HEAVY_CERO).toBe(eliteHeavyFor('humanoid/hb'));
    expect(eliteHeavyFor(null)).toBe(ELITE_HEAVY_CERO);
    expect(eliteHeavyFor('nope/x')).toBe(ELITE_HEAVY_CERO);
    expect(ELITE_HEAVY_ELEMENT).toBe('blood');
    for (const k of ELITE_HEAVY_BODIES) {
      const L = eliteHeavyFor(k).layers[0]!;
      expect([L.fx, L.anchor, L.opacity]).toEqual(['custom/cero', 'attacker', 0.7]);
      expect(L.dx).toBeLessThan(0); // 도구 기준 — 적 쪽은 pixelInst 가 뒤집는다
    }
    expect(existsSync(`public/fx/${fxSheetName('custom/cero', ELITE_HEAVY_ELEMENT)}.png`)).toBe(true);
    expect((raw as { fallback: string }).fallback).toBe('humanoid/hb');
  });
  it('강적 그림 → 몸: 스모크 위도우 = 덩치, 스티치마우스 = 외눈 길리안(hd), 롯팽 = 뱀', () => {
    expect(bodyKeyOf('fire-heavy-seal')).toBe('humanoid/hb');
    expect(bodyKeyOf('normal-heavy-seal')).toBe('humanoid/hd');
    expect(bodyKeyOf('poison-heavy-chain')).toBe('serpent/ref');
    expect(bodyKeyOf('thunder-heavy-chain')).toBe('beast/ref'); // C.375 짐승형
    expect(eliteHeavyFor(bodyKeyOf('normal-heavy-seal')).layers[0]!.dy).not.toBe(eliteHeavyFor('humanoid/hb').layers[0]!.dy);
  });
});
