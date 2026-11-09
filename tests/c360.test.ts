// C.360 (GDD 217장): 길리안 = 호로 2단계 외형, 뱀형 = 아쥬커스 '뱀형' 외형 + 아쥬커스 등급 강적 2 — 종이인형 뼈대 여럿(사람형·뱀형)
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { ART_MANIFEST, GILLIAN_SCALE, SERPENT_ENEMIES, SERPENT_SCALE, charArt, enemyArt } from '../src/data/art/manifest';
import { RIG_PACKS, lookLayers, resolveMotions, rigPack, rigPackOfLook, samplePose, validateRig } from '../src/data/art/rig/pose';
import { createRigPlayer } from '../src/ui/bha/rigAnim';
import { getFaction } from '../src/data/factions';
import { pickTierLook } from '../src/engine/evolution/tierLook';
import { getSkin } from '../src/data/skins';
import enemies from '../src/data/enemies/enemies.json';
import forms from '../src/data/evolution/forms.json';
import type { FormDef, Stats } from '../src/data/schema';

const hollow = getFaction('hollow');
const fb = hollow.room?.characterArt ?? '';
const ev = (k: keyof Stats): Stats => ({ atk: 0, int: 0, hp: 0, spr: 0, spd: 0, def: 0, [k]: 5 });

describe('C.360 종이인형 뼈대 여럿 (GDD 217장 3)', () => {
  it('게임 뼈대 = 사람형·뱀형, 둘 다 검사 통과, 외형 id 는 뼈대끼리 안 겹치고 시험 외형(-test)은 없다', () => {
    expect(RIG_PACKS.map((p) => p.id)).toEqual(['humanoid', 'serpent']);
    const seen = new Set<string>();
    for (const p of RIG_PACKS) {
      expect(validateRig(p.rig, p.motions, p.sets), p.id).toEqual([]);
      for (const l of Object.keys(p.rig.looks)) {
        expect(seen.has(l), l).toBe(false);
        expect(l.endsWith('-test'), l).toBe(false);
        seen.add(l);
      }
    }
    expect(rigPack('serpent').rig.looks['serpent-base']).toBeDefined();
    expect(rigPack(undefined).id).toBe('humanoid');
    expect(rigPack('nope').id).toBe('humanoid');
  });
  it('외형마다 정지 그림·부위 그림 파일이 그 뼈대 폴더에 있다', () => {
    for (const p of RIG_PACKS) for (const l of Object.keys(p.rig.looks)) {
      expect(existsSync(`public/art/rig/${p.id}/still/${l}.png`), `${p.id}/${l}`).toBe(true);
      for (const layer of lookLayers(p.rig, l)) expect(existsSync(`public/art/rig/${p.id}/${layer.art}.png`), `${l} ${layer.art}`).toBe(true);
    }
  });
  it('뱀 그림 칸 = 사람형과 같은 규격(정사각, 바닥 = 아래에서 약 8% 위)', () => {
    const r = rigPack('serpent').rig;
    const [, y, w, h] = r.view!.rect;
    expect(w).toBe(h);
    expect((r.ground! - y) / h).toBeCloseTo(0.92, 1);
  });
});

describe('C.360 길리안 = 호로 2단계 외형 (GDD 217장 1)', () => {
  it('2단계 그림 = 종이인형 길리안, 시작 외형을 입어도 2단계 외형 표(tierLooks "2")가 길리안', () => {
    const a = charArt('hollow', 1, fb, '/', undefined, [], null, undefined, 'male');
    expect(a.rig?.look).toBe('gillian-base');
    expect(a.rig?.rigId).toBe('humanoid');
    expect(a.scale).toBe(GILLIAN_SCALE);
    const t2 = (forms as FormDef[]).find((f) => f.tier === 2)!;
    for (const k of ['atk', 'int', 'hp', 'spr', 'spd', 'def'] as const) expect(pickTierLook(hollow, 2, ev(k), t2), k).toBe('gillian');
    expect(getSkin('gillian')).toMatchObject({ factionId: 'hollow', tierLook: true, startOnly: true });
    expect(charArt('hollow', 1, fb, '/', undefined, [], 'gillian', undefined, 'male').rig?.look).toBe('gillian-base');
    expect(ART_MANIFEST['skin.gillian']!.rig).toBe('gillian-base');
  });
  it('길리안 동작: 대기·이동·빈사·박치기·빔(특수1)·포효, 공격 = 박치기(공격1·2 없음), 쓰러짐 없음, 필살기 = 해방1', () => {
    const p = rigPack('humanoid');
    const ms = resolveMotions(p.rig, p.motions, p.sets, 'hd');
    for (const id of ['idle', 'homeIdle', 'move', 'dying', 'headbutt', 'skill', 'release1', 'ultimate']) expect(ms[id], id).toBeDefined();
    for (const id of ['attack', 'attack2', 'down', 'hit']) expect(ms[id], id).toBeUndefined();
    expect(ms.ultimate!.tracks).toEqual(ms.release1!.tracks);
    const player = createRigPlayer(p.rig, ms, () => {}, () => 0);
    expect(player.has('attack')).toBe(true);
    expect(player.play('attack')!.durationMs).toBe(ms.headbutt!.duration);
    expect(player.pose().motion).toBe(ms.headbutt);
    expect(player.has('lose')).toBe(false); // 쓰러짐 없음 → 기존 연출
  });
});

describe('C.360 뱀형 (GDD 217장 2)', () => {
  it('색 외형 3 = 진홍(원래)·초록·파랑, 몸·관절·동작은 하나', () => {
    const r = rigPack('serpent').rig;
    expect(Object.keys(r.looks).sort()).toEqual(['serpent-base', 'serpent-blue', 'serpent-green']);
    for (const l of Object.values(r.looks)) expect(l.body).toBe('ref');
    expect(rigPackOfLook('serpent-green')!.id).toBe('serpent');
    expect(rigPackOfLook('brute-base')!.id).toBe('humanoid');
  });
  it('아쥬커스 뱀형 외형(정신력 1위) = 종이인형 뱀 진홍', () => {
    const t3 = (forms as FormDef[]).find((f) => f.tier === 3)!;
    expect(pickTierLook(hollow, 3, ev('spr'), t3)).toBe('wyrm');
    const a = charArt('hollow', 2, fb, '/', undefined, [], 'wyrm', undefined, 'male');
    expect(a.rig).toEqual({ look: 'serpent-base', partBase: '/art/rig/serpent/', rigId: 'serpent' });
    expect(a.src).toBe('/art/rig/serpent/still/serpent-base.png');
    expect(a.scale).toBe(SERPENT_SCALE);
    expect(a.headTop).toBeGreaterThan(0);
  });
  it('뱀형 강적 2 = 아쥬커스 등급 강적(롯팽 초록·마레하다 파랑), 그림 = 뱀 색 외형', () => {
    expect(SERPENT_ENEMIES).toEqual({ 'poison-heavy-chain': 'serpent-green', 'water-heavy-chain': 'serpent-blue' });
    for (const [id, look] of Object.entries(SERPENT_ENEMIES)) {
      const e = (enemies as { id: string; class: string; grade?: string }[]).find((x) => x.id === id)!;
      expect(e.class, id).toBe('elite');
      expect(e.grade, id).toBe('adjuchas');
      const a = enemyArt(id, '/')!;
      expect(a.rig?.look, id).toBe(look);
      expect(a.rig?.rigId, id).toBe('serpent');
      expect(a.scale, id).toBe(SERPENT_SCALE);
      expect(existsSync(`public${a.src}`), id).toBe(true);
    }
  });
  it('뱀 동작: 대기·이동·공격1·2·특수·맞음이 게임 동작으로 돈다, 공격2 = 밑에서 위로 쳐올리기', () => {
    const p = rigPack('serpent');
    const ms = resolveMotions(p.rig, p.motions, p.sets, 'ref');
    const player = createRigPlayer(p.rig, ms, () => {}, () => 0);
    for (const a of ['idle', 'move', 'attack', 'skill', 'hit'] as const) expect(player.has(a), a).toBe(true);
    const a2 = ms.attack2!;
    const chain = (t: number) => ['body1', 'body2', 'neck1', 'neck2', 'head'].reduce((s, id) => s + samplePose(p.rig, a2, t)[id]!.rot, 0);
    expect(chain(220)).toBeLessThan(-20);
    expect(chain(a2.hit!)).toBeGreaterThan(20);
  });
});
