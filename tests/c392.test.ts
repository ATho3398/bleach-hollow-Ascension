// C.392 (GDD 240장): 아쥬커스 모델 7 = 능력치 1위(힘 가시형·지능 뱀형·체력 외팔형·정신력 거미형·속도 속도형·방어 짐승형) + 히든 부유형, 진화체 속성으로 색(노멀 보라·물 파랑·불 주황·흙 갈색·뇌 황토)
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { AJUCHAS_MODELS, ART_MANIFEST, SPEED_ENEMIES, SPIKY_ENEMIES, WRAITH_ENEMIES, charArt, enemyArt } from '../src/data/art/manifest';
import { RIG_PACKS, lookLayers, resolveMotions, rigPack, rigPackOfLook, validateRig } from '../src/data/art/rig/pose';
import { RIG_ACTIONS, createRigPlayer } from '../src/ui/bha/rigAnim';
import { getFaction } from '../src/data/factions';
import { pickTierLook, tierLookIds } from '../src/engine/evolution/tierLook';
import { AJUCHAS_ELEMENT_NAMES, AJUCHAS_MODEL_SKINS, getSkin } from '../src/data/skins';
import { tryGetForm } from '../src/data/evolution';
import enemies from '../src/data/enemies/enemies.json';
import type { Stats } from '../src/data/schema';

const hollow = getFaction('hollow');
const fb = hollow.room?.characterArt ?? '';
const ev = (o: Partial<Stats>): Stats => ({ atk: 0, int: 0, hp: 0, spr: 0, aspd: 0, bspd: 0, def: 0, ...o });
const ELS = ['water', 'fire', 'earth', 'thunder'] as const;

describe('C.392 아쥬커스 모델 = 능력치 1위 (GDD 240장 2)', () => {
  it('힘 가시형 · 지능 뱀형 · 체력 외팔형 · 정신력 거미형 · 속도 속도형 · 방어 짐승형 (스킨 id 는 옛 값 그대로, 이름·그림만)', () => {
    const want = { atk: ['carapace', '가시형', 'spiky-base'], int: ['stag', '뱀형', 'serpent-purple'], hp: ['rhino', '외팔형', 'onearm-base'], spr: ['wyrm', '거미형', 'spider-base'], aspd: ['panther', '속도형', 'speed-base'], def: ['scorpion', '짐승형', 'beast-purple'] } as const;
    const t3 = tryGetForm('t3:normal')!;
    for (const [stat, [id, name, look]] of Object.entries(want)) {
      expect(pickTierLook(hollow, 3, ev({ [stat]: 5 }), t3), stat).toBe(id);
      expect(getSkin(id)!.name, id).toBe(name);
      expect(charArt('hollow', 2, fb, '/', undefined, [], id, undefined, 'male').rig?.look, id).toBe(look);
    }
  });
  it('히든 진화체(h3:fail·h3:passage) = 능력치와 상관없이 부유형', () => {
    for (const f of ['h3:fail', 'h3:passage']) {
      expect(pickTierLook(hollow, 3, ev({ atk: 9 }), tryGetForm(f)!), f).toBe('wraith');
      expect(pickTierLook(hollow, 3, ev({ aspd: 9 }), tryGetForm(f)!), f).toBe('wraith');
    }
    expect(getSkin('wraith')!.name).toBe('부유형');
    expect(charArt('hollow', 2, fb, '/', undefined, [], 'wraith', undefined, 'male').rig).toEqual({ look: 'wraith-base', partBase: '/art/rig/wraith/', rigId: 'wraith' });
  });
});

describe('C.392 속성 색 (GDD 240장 3)', () => {
  it('진화체 속성이 물·불·흙·뇌면 같은 모델의 속성 색 스킨(id 뒤에 속성 id), 노멀은 그대로', () => {
    expect(pickTierLook(hollow, 3, ev({ atk: 5 }), tryGetForm('t3:normal')!)).toBe('carapace');
    for (const el of ELS) {
      expect(pickTierLook(hollow, 3, ev({ atk: 5 }), tryGetForm(`t3:${el}`)!), el).toBe(`carapace${el}`);
      expect(pickTierLook(hollow, 3, ev({ spr: 5 }), tryGetForm(`t3:${el}`)!), el).toBe(`wyrm${el}`);
    }
  });
  it('모델 7 × 색 5 = 스킨 35 전부 스킨 표·그림 목록에 있고 그림 파일이 있다 — 색 이름 규칙: 물 blue · 불 orange · 흙 brown · 뇌 yellow', () => {
    expect(Object.keys(AJUCHAS_MODELS).sort()).toEqual([...AJUCHAS_MODEL_SKINS].sort());
    expect(AJUCHAS_ELEMENT_NAMES.map(([el]) => el)).toEqual([...ELS]);
    const color = { water: 'blue', fire: 'orange', earth: 'brown', thunder: 'yellow' } as const;
    const ids = tierLookIds({ tierLooks: hollow.tierLooks });
    for (const [id, m] of Object.entries(AJUCHAS_MODELS)) {
      for (const [el, look] of Object.entries(m.looks)) {
        const skin = el === 'normal' ? id : `${id}${el}`;
        expect(ids, skin).toContain(skin);
        expect(getSkin(skin), skin).toMatchObject({ factionId: 'hollow', tierLook: true, startOnly: true });
        expect(/^[a-z]+$/.test(skin), skin).toBe(true);
        expect(ART_MANIFEST[`skin.${skin}`]!.rig, skin).toBe(look);
        if (el !== 'normal') expect(look.endsWith(`-${color[el as keyof typeof color]}`), `${skin} ${look}`).toBe(true);
        const pack = rigPackOfLook(look)!;
        expect(pack, look).toBeDefined();
        expect(existsSync(`public/art/rig/${pack.id}/still/${look}.png`), look).toBe(true);
        for (const layer of lookLayers(pack.rig, look)) expect(existsSync(`public/art/rig/${pack.id}/${layer.art}.png`), `${look} ${layer.art}`).toBe(true);
        const a = charArt('hollow', 2, fb, '/', undefined, [], skin, undefined, 'male');
        expect(a.rig?.look, skin).toBe(look);
        expect(a.scale, skin).toBe(m.scale);
      }
    }
  });
});

describe('C.392 새 모델 (GDD 240장 1)', () => {
  it('게임 뼈대 5(사람형·뱀형·짐승형·거미형·부유형) 모두 검사 통과', () => {
    expect(RIG_PACKS.map((p) => p.id)).toEqual(['humanoid', 'serpent', 'beast', 'spider', 'wraith']);
    for (const p of RIG_PACKS) expect(validateRig(p.rig, p.motions, p.sets), p.id).toEqual([]);
  });
  it('가시형(hk)·속도형(hv) = 사람형 뼈대의 새 몸(손 따로, 속도형은 골반·꼬리 3마디), 동작 묶음이 돈다', () => {
    const p = rigPack('humanoid');
    expect(p.rig.looks['spiky-base']!.body).toBe('hk');
    expect(p.rig.looks['speed-base']!.body).toBe('hv');
    for (const s of ['pelvis', 'cape', 'cape2', 'cape3', 'hand_L', 'hand_R']) expect(p.rig.bodies.hv![s], s).toBeDefined();
    for (const body of ['hk', 'hv']) {
      const ms = resolveMotions(p.rig, p.motions, p.sets, body);
      for (const id of ['idle', 'move', 'attack', 'attack2', 'skill', 'hit', 'release1']) expect(ms[id], `${body} ${id}`).toBeDefined();
    }
    expect(resolveMotions(p.rig, p.motions, p.sets, 'hv').move!.duration).toBeLessThan(resolveMotions(p.rig, p.motions, p.sets, 'hk').move!.duration); // 속도형은 더 빨리 걷는다
  });
  it('공격3(거미·부유형)도 게임 공격 동작으로 나온다 — 없는 몸은 공격1·2만', () => {
    expect(RIG_ACTIONS.attack).toEqual(['attack', 'attack2', 'attack3']);
    for (const id of ['spider', 'wraith']) expect(rigPack(id).motions.attack3, id).toBeDefined();
    const p = rigPack('serpent');
    const player = createRigPlayer(p.rig, p.motions, () => {}, () => 0);
    expect(player.play('attack')).not.toBeNull();
  });
});

describe('C.392 새 모델 강적 (GDD 240장 4)', () => {
  it('가시형 2·속도형 2·부유형 1 = 아쥬커스 등급 강적, 속성 색(노멀·혈 = 보라)', () => {
    const E = enemies as { id: string; class: string; grade?: string; element: string }[];
    const all = { ...SPIKY_ENEMIES, ...SPEED_ENEMIES, ...WRAITH_ENEMIES };
    expect(Object.keys(all).length).toBe(5);
    const color: Record<string, string> = { normal: 'base', blood: 'base', water: 'blue', fire: 'orange', earth: 'brown', thunder: 'yellow' };
    for (const [id, look] of Object.entries(all)) {
      const e = E.find((x) => x.id === id)!;
      expect(e.class, id).toBe('elite');
      expect(e.grade, id).toBe('adjuchas');
      expect(look.endsWith(`-${color[e.element]}`), `${id} ${e.element} ${look}`).toBe(true);
      const a = enemyArt(id, '/')!;
      expect(a.rig?.look, id).toBe(look);
      expect(existsSync(`public${a.src}`), id).toBe(true);
    }
  });
});
