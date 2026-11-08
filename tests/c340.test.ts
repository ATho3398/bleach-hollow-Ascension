// C.340 (GDD 205장 · 115-A 85): 적 덩치(<속성>-basic) = 종이인형 덩치(지금 그림 색), 덩치 색 외형은 모두 몸 hb·동작 하나
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { enemyArt, ART_MANIFEST } from '../src/data/art/manifest';
import { HUMANOID, MOTIONS, MOTION_SETS, lookArt, lookLayers, resolveMotions } from '../src/data/art/rig/pose';
import enemies from '../src/data/enemies/enemies.json';

const BASIC = (enemies as { id: string }[]).map((e) => e.id).filter((id) => id.endsWith('-basic'));

describe('205장: 적 덩치 종이인형 (사용자 2026-11-09 "적으로 나오는 덩치도 이 모션 넣으면 된다잉")', () => {
  it('덩치 적 8종(속성마다) 모두 종이인형 덩치 외형 — 정지 그림·부위 그림이 게임본에 있다', () => {
    expect(BASIC.length).toBe(8);
    for (const id of BASIC) {
      const a = enemyArt(id, '/')!;
      expect(a.rig, id).toBeDefined();
      const look = HUMANOID.looks[a.rig!.look]!;
      expect(look.body, id).toBe('hb');
      expect(a.src).toBe(`/art/rig/humanoid/still/${a.rig!.look}.png`);
      expect(existsSync(`public${a.src}`), a.src!).toBe(true);
      for (const l of lookLayers(HUMANOID, a.rig!.look)) expect(existsSync(`public/art/rig/humanoid/${l.art}.png`), `${id} ${l.art}`).toBe(true);
      expect(a.scale).toBe(1.78);
    }
    expect(new Set(BASIC.map((id) => enemyArt(id, '/')!.rig!.look)).size).toBe(8); // 속성마다 다른 색
  });
  it('다른 적은 그대로(종이인형 없음)', () => {
    for (const k of Object.keys(ART_MANIFEST).filter((k) => k.startsWith('enemy.') && !k.endsWith('-basic'))) expect(ART_MANIFEST[k]!.rig, k).toBeUndefined();
    expect(enemyArt('normal-swift', '/')?.rig).toBeUndefined();
  });
  it('덩치 색 외형은 모두 같은 몸·같은 동작(모션 통일), 그림만 색 폴더', () => {
    const brutes = Object.entries(HUMANOID.looks).filter(([, l]) => l.body === 'hb');
    expect(brutes.length).toBe(10);
    const base = resolveMotions(HUMANOID, MOTIONS, MOTION_SETS, 'hb');
    for (const [id, l] of brutes) {
      expect(typeof l.color, id).toBe('string');
      expect(resolveMotions(HUMANOID, MOTIONS, MOTION_SETS, l.body)).toEqual(base);
    }
    for (const a of ['attack', 'attack2', 'hit', 'down', 'idle', 'move']) expect(base[a], a).toBeDefined(); // 전투 동작(공격·맞음·쓰러짐)
  });
  it('lookArt: artFolder 가 있으면 같은 이름 그림을 그 폴더에서', () => {
    expect(lookArt({ body: 'hb', artFolder: 'hb-red' }, 'hb/torso')).toBe('hb-red/torso');
    expect(lookArt({ body: 'hb' }, 'hb/torso')).toBe('hb/torso');
  });
});
