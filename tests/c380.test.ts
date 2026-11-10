// C.380 (GDD 231장): 역관절 삭제, 외팔이(물리)·거미형(특수·혼합) = 아쥬커스 외형 + 아쥬커스 등급 강적, 게임 종이인형 뼈대 넷째(spider)
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { ART_MANIFEST, BEAST_ENEMIES, GILLIAN_ENEMIES, ONEARM_ENEMIES, ONEARM_SCALE, SERPENT_ENEMIES, SPIDER_ENEMIES, SPIDER_SCALE, charArt, enemyArt } from '../src/data/art/manifest';
import { RIG_PACKS, apply, boneMatrices, lookLayers, resolveMotions, rigPack, rigPackOfLook, samplePose, validateRig, type Vec2 } from '../src/data/art/rig/pose';
import { createRigPlayer } from '../src/ui/bha/rigAnim';
import { getFaction } from '../src/data/factions';
import { pickTierLook } from '../src/engine/evolution/tierLook';
import enemies from '../src/data/enemies/enemies.json';
import forms from '../src/data/evolution/forms.json';
import type { FormDef, Stats } from '../src/data/schema';

const hollow = getFaction('hollow');
const fb = hollow.room?.characterArt ?? '';
const ev = (o: Partial<Stats>): Stats => ({ atk: 0, int: 0, hp: 0, spr: 0, spd: 0, def: 0, ...o });
const t3 = (forms as FormDef[]).find((f) => f.tier === 3)!;
const E = enemies as { id: string; class: string; grade?: string; category?: string }[];

describe('C.380 역관절 삭제 (GDD 231장 1)', () => {
  it('게임·작업본 어디에도 역관절 외형·몸·동작 묶음·그림이 없다', () => {
    const p = rigPack('humanoid');
    expect(p.rig.looks['digitigrade-base']).toBeUndefined();
    expect(p.rig.bodies.dg).toBeUndefined();
    expect(p.sets.digitigrade).toBeUndefined();
    expect(existsSync('public/art/rig/humanoid/dg')).toBe(false);
    expect(existsSync('public/art/rig/humanoid/still/digitigrade-base.png')).toBe(false);
    expect(Object.values(ART_MANIFEST).some((e) => e.rig?.startsWith('digitigrade'))).toBe(false);
  });
});

describe('C.380 외팔이 = 물리 (GDD 231장 2)', () => {
  it('색 외형 4 = 보라(원래)·갈색·파랑·황토, 몸 ho·동작 하나, 그림 파일 있음', () => {
    const p = rigPack('humanoid');
    const looks = Object.entries(p.rig.looks).filter(([, l]) => l.body === 'ho');
    expect(looks.map(([id]) => id).sort()).toEqual(['onearm-base', 'onearm-blue', 'onearm-brown', 'onearm-yellow']);
    for (const [id, l] of looks) {
      expect(typeof l.color, id).toBe('string');
      expect(existsSync(`public/art/rig/humanoid/still/${id}.png`), id).toBe(true);
      for (const layer of lookLayers(p.rig, id)) expect(existsSync(`public/art/rig/humanoid/${layer.art}.png`), `${id} ${layer.art}`).toBe(true);
    }
    const ms = resolveMotions(p.rig, p.motions, p.sets, 'ho');
    for (const id of ['idle', 'move', 'attack', 'attack2', 'skill', 'hit', 'release1', 'headbutt']) expect(ms[id], id).toBeDefined();
  });
  it("아쥬커스 '갑충형'(힘 1위) = 외팔이 보라", () => {
    expect(pickTierLook(hollow, 3, ev({ atk: 5 }), t3)).toBe('carapace');
    const a = charArt('hollow', 2, fb, '/', undefined, [], 'carapace', undefined, 'male');
    expect(a.rig).toEqual({ look: 'onearm-base', partBase: '/art/rig/humanoid/', rigId: 'humanoid' });
    expect(a.scale).toBe(ONEARM_SCALE);
  });
  it('외팔이 강적 3 = 아쥬커스 등급 · 전부 물리', () => {
    expect(Object.keys(ONEARM_ENEMIES).length).toBe(3);
    for (const [id, look] of Object.entries(ONEARM_ENEMIES)) {
      const e = E.find((x) => x.id === id)!;
      expect(e.class, id).toBe('elite');
      expect(e.grade, id).toBe('adjuchas');
      expect(e.category, id).toBe('physical');
      const a = enemyArt(id, '/')!;
      expect(a.rig?.look, id).toBe(look);
      expect(a.scale, id).toBe(ONEARM_SCALE);
      expect(existsSync(`public${a.src}`), id).toBe(true);
    }
  });
});

describe('C.380 거미형 = 특수·혼합 (GDD 231장 3)', () => {
  it('게임 뼈대 spider: 검사 통과, 색 외형 5, 그림 칸 정사각·바닥 약 8% 위, 그림 파일 있음', () => {
    expect(RIG_PACKS.map((p) => p.id)).toContain('spider');
    const p = rigPack('spider');
    expect(validateRig(p.rig, p.motions, p.sets)).toEqual([]);
    expect(Object.keys(p.rig.looks).sort()).toEqual(['spider-base', 'spider-blue', 'spider-brown', 'spider-teal', 'spider-yellow']);
    const [, y, w, h] = p.rig.view!.rect;
    expect(w).toBe(h);
    expect((p.rig.ground! - y) / h).toBeCloseTo(0.92, 1);
    for (const l of Object.keys(p.rig.looks)) {
      expect(rigPackOfLook(l)!.id, l).toBe('spider');
      expect(existsSync(`public/art/rig/spider/still/${l}.png`), l).toBe(true);
      for (const layer of lookLayers(p.rig, l)) expect(existsSync(`public/art/rig/spider/${layer.art}.png`), `${l} ${layer.art}`).toBe(true);
    }
  });
  it("아쥬커스 '사슴형'(지능 1위 = 특수 공격) = 거미 보라, '새형'(속도+지능 1·2위) = 거미 청록", () => {
    expect(pickTierLook(hollow, 3, ev({ int: 5 }), t3)).toBe('stag');
    expect(pickTierLook(hollow, 3, ev({ spd: 5, int: 4 }), t3)).toBe('raptor');
    const a = charArt('hollow', 2, fb, '/', undefined, [], 'stag', undefined, 'male');
    expect(a.rig).toEqual({ look: 'spider-base', partBase: '/art/rig/spider/', rigId: 'spider' });
    expect(a.scale).toBe(SPIDER_SCALE);
    expect(charArt('hollow', 2, fb, '/', undefined, [], 'raptor', undefined, 'male').rig?.look).toBe('spider-teal');
  });
  it('거미형 강적 3 = 아쥬커스 등급 · 특수 또는 혼합(물리 없음), 다른 몸 강적과 안 겹친다', () => {
    expect(Object.keys(SPIDER_ENEMIES).length).toBe(3);
    const cats = new Set<string>();
    for (const [id, look] of Object.entries(SPIDER_ENEMIES)) {
      for (const other of [ONEARM_ENEMIES, BEAST_ENEMIES, SERPENT_ENEMIES, GILLIAN_ENEMIES]) expect(other[id], id).toBeUndefined();
      const e = E.find((x) => x.id === id)!;
      expect(e.class, id).toBe('elite');
      expect(e.grade, id).toBe('adjuchas');
      expect(['special', 'mixed'], id).toContain(e.category);
      cats.add(e.category!);
      const a = enemyArt(id, '/')!;
      expect(a.rig?.look, id).toBe(look);
      expect(a.rig?.rigId, id).toBe('spider');
      expect(a.scale, id).toBe(SPIDER_SCALE);
      expect(existsSync(`public${a.src}`), id).toBe(true);
    }
    expect([...cats].sort()).toEqual(['mixed', 'special']);
  });
  it('거미 동작이 게임 동작으로 돌고, 대기에서 발끝 넷은 제자리', () => {
    const p = rigPack('spider');
    const player = createRigPlayer(p.rig, p.motions, () => {}, () => 0);
    for (const a of ['idle', 'move', 'attack', 'skill', 'hit'] as const) expect(player.has(a), a).toBe(true);
    const local = (p.rig as unknown as { tips: { ref: Record<string, Vec2> } }).tips.ref;
    const rest = boneMatrices(p.rig, {}, 'ref');
    for (const t of [0, 450, 900, 1350]) {
      const m = boneMatrices(p.rig, samplePose(p.rig, p.motions.idle!, t), 'ref');
      for (const l of ['leg1b', 'leg2b', 'leg3b', 'leg4b']) expect(Math.abs(apply(m[l]!, local[l]!)[1] - apply(rest[l]!, local[l]!)[1]), `${l} t${t}`).toBeLessThan(0.6);
    }
  });
});
