// C.374 (GDD 228장): 짐승형 = 아쥬커스 '표범형' 외형 + 아쥬커스 등급 강적 3 (종이인형 뼈대 beast), 대기·홈 대기·이동은 재생 속도 예외
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { ART_MANIFEST, BEAST_ENEMIES, BEAST_SCALE, SERPENT_ENEMIES, charArt, enemyArt } from '../src/data/art/manifest';
import { boneMatrices, lookLayers, rigPack, rigPackOfLook, samplePose, validateRig } from '../src/data/art/rig/pose';
import { createRigPlayer } from '../src/ui/bha/rigAnim';
import { getFaction } from '../src/data/factions';
import { pickTierLook } from '../src/engine/evolution/tierLook';
import enemies from '../src/data/enemies/enemies.json';
import forms from '../src/data/evolution/forms.json';
import type { FormDef, Stats } from '../src/data/schema';

const hollow = getFaction('hollow');
const fb = hollow.room?.characterArt ?? '';
const ev = (k: keyof Stats): Stats => ({ atk: 0, int: 0, hp: 0, spr: 0, aspd: 0, bspd: 0, def: 0, [k]: 5 });

describe('C.374 짐승형 (GDD 228장 2)', () => {
  it('게임 뼈대 beast: 검사 통과, 색 외형 4 = 청록(원래)·노랑·주황·보라, 몸·관절·동작은 하나, 그림 파일 있음', () => {
    const p = rigPack('beast');
    expect(p.id).toBe('beast');
    expect(validateRig(p.rig, p.motions, p.sets)).toEqual([]);
    expect(Object.keys(p.rig.looks).sort()).toEqual(['beast-base', 'beast-blue', 'beast-brown', 'beast-orange', 'beast-purple', 'beast-violet', 'beast-yellow']); // 속성 색 5 + 청록·진보라(C.392, GDD 240장)
    for (const [l, look] of Object.entries(p.rig.looks)) {
      expect(look.body, l).toBe('ref');
      expect(rigPackOfLook(l)!.id, l).toBe('beast');
      expect(existsSync(`public/art/rig/beast/still/${l}.png`), l).toBe(true);
      for (const layer of lookLayers(p.rig, l)) expect(existsSync(`public/art/rig/beast/${layer.art}.png`), `${l} ${layer.art}`).toBe(true);
    }
  });
  it('짐승 그림 칸 = 사람형·뱀형과 같은 규격(정사각, 바닥 = 아래에서 약 8% 위)', () => {
    const r = rigPack('beast').rig;
    const [, y, w, h] = r.view!.rect;
    expect(w).toBe(h);
    expect((r.ground! - y) / h).toBeCloseTo(0.92, 1);
  });
  it("아쥬커스 짐승형 외형 = 방어 1위(스킨 id scorpion — C.392, GDD 240장 2: 옛 속도 → 방어), 종이인형 짐승 보라(노멀)", () => {
    const t3 = (forms as FormDef[]).find((f) => f.tier === 3)!;
    expect(pickTierLook(hollow, 3, ev('def'), t3)).toBe('scorpion');
    const a = charArt('hollow', 2, fb, '/', undefined, [], 'scorpion', undefined, 'male');
    expect(a.rig).toEqual({ look: 'beast-purple', partBase: '/art/rig/beast/', rigId: 'beast' });
    expect(a.src).toBe('/art/rig/beast/still/beast-purple.png');
    expect(a.scale).toBe(BEAST_SCALE);
    expect(ART_MANIFEST['skin.scorpion']!.rig).toBe('beast-purple');
  });
  it('짐승형 강적 3 = 아쥬커스 등급 강적(스톰후프 노랑·브라세로 주황·나이트램 보라), 뱀형 강적과 안 겹친다', () => {
    expect(BEAST_ENEMIES).toEqual({ 'thunder-heavy-chain': 'beast-yellow', 'fire-heavy-chain': 'beast-orange', 'kyo-heavy-chain': 'beast-violet' });
    for (const [id, look] of Object.entries(BEAST_ENEMIES)) {
      expect(SERPENT_ENEMIES[id], id).toBeUndefined();
      const e = (enemies as { id: string; class: string; grade?: string }[]).find((x) => x.id === id)!;
      expect(e.class, id).toBe('elite');
      expect(e.grade, id).toBe('adjuchas');
      const a = enemyArt(id, '/')!;
      expect(a.rig?.look, id).toBe(look);
      expect(a.rig?.rigId, id).toBe('beast');
      expect(a.scale, id).toBe(BEAST_SCALE);
      expect(existsSync(`public${a.src}`), id).toBe(true);
    }
  });
  it('짐승 동작: 대기·이동·공격1·2·특수·맞음이 게임 동작으로 돈다', () => {
    const p = rigPack('beast');
    const player = createRigPlayer(p.rig, p.motions, () => {}, () => 0);
    for (const a of ['idle', 'move', 'attack', 'skill', 'hit'] as const) expect(player.has(a), a).toBe(true);
    expect(player.play('attack')!.durationMs).toBeCloseTo(p.motions.attack!.duration / 1.5, 6);
  });
  it('짐승 대기: 아랫마디(앞발·뒷발)는 제자리, 윗다리는 몸을 따라 (115-A 103)', () => {
    const { rig, motions } = rigPack('beast');
    const rest = boneMatrices(rig, {});
    const mid = boneMatrices(rig, samplePose(rig, motions.idle!, 800));
    for (const b of ['fleg_L2', 'fleg_R2', 'hleg_L2', 'hleg_R2']) expect(Math.abs(mid[b]![5]! - rest[b]![5]!), b).toBeLessThan(0.15);
    for (const b of ['fleg_L', 'fleg_R', 'hleg_L', 'hleg_R']) expect(mid[b]![5]! - rest[b]![5]!, b).toBeGreaterThan(0.5);
  });
});

describe('C.374 대기·홈 대기·이동은 재생 속도 예외 (GDD 228장 1)', () => {
  it('게임 재생기: 대기·이동(반복)은 1배, 공격은 1.5배', () => {
    const p = rigPack('humanoid');
    const player = createRigPlayer(p.rig, p.motions, () => {}, () => 0);
    player.setLoop('idle');
    player.advance(100);
    expect(player.pose().t).toBeCloseTo(100, 6);
    player.setLoop('move');
    player.advance(100);
    expect(player.pose().t).toBeCloseTo(100, 6);
    player.play('attack');
    player.advance(100);
    expect(player.pose().t).toBeCloseTo(150, 6);
  });
});
