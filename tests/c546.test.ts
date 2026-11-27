// C.546 적 길리안 눈동자 = 그 적 속성 색 (GDD 15-5 v6.215, 사용자 2026-11-27 "적 길리안도 속성에 따라서 눈동자색 바꿔")
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ART_MANIFEST, ENEMY_TINT_BODIES, enemyArt, enemyTintOf, charArt } from '../src/data/art/manifest';
import { rigPackOfLook } from '../src/data/art/rig/pose';
import { ELEMENTS } from '../src/data/elements';
import { ENEMIES, getEnemy } from '../src/data/enemies';
import { parseCssColor, replaceColors } from '../src/ui/bha/artTint';
import { decodePng } from './helpers/png';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const bodyOf = (look: string) => rigPackOfLook(look)?.rig.looks[look]?.body;
/** 그림 목록에서 길리안 몸(hd)으로 그리는 적 */
const gillianFoes = ENEMIES.filter((e) => {
  const rig = ART_MANIFEST[`enemy.${e.id}`]?.rig;
  return !!rig && bodyOf(rig) === 'hd';
});

describe('표 = 몸 단위 (enemyTint.json)', () => {
  it('길리안 몸 hd = 눈동자 색 #e21014 하나', () => {
    expect(Object.keys(ENEMY_TINT_BODIES)).toEqual(['hd']);
    expect(ENEMY_TINT_BODIES.hd).toEqual({ part: '눈동자', from: ['#e21014'] });
  });

  it('그 색은 길리안 부위 그림(기본·외눈)의 머리에만 — 눈동자 픽셀(기본 2·외눈 4), 몸 다른 부위에는 없음', () => {
    const rgb = parseCssColor(ENEMY_TINT_BODIES.hd!.from[0]!)!;
    const count = (path: string) => {
      const { px } = decodePng(path);
      let n = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i + 3] && px[i] === rgb[0] && px[i + 1] === rgb[1] && px[i + 2] === rgb[2]) n++;
      return n;
    };
    for (const dir of ['hd', 'hd-cyclops']) {
      const base = `public/art/rig/humanoid/${dir}`;
      for (const f of readdirSync(base).filter((x) => x.endsWith('.png'))) expect(count(`${base}/${f}`), `${dir}/${f}`).toBe(f === 'head.png' ? (dir === 'hd' ? 2 : 4) : 0);
    }
  });
});

describe('길리안 몸 적 = 속성 색 토큰으로 바꾸기', () => {
  it('지금 길리안 몸 적 = normal-heavy-seal(스티치마우스) 1종, 외눈 길리안', () => {
    expect(gillianFoes.map((e) => e.id)).toEqual(['normal-heavy-seal']);
    expect(ART_MANIFEST['enemy.normal-heavy-seal']?.rig).toBe('gillian-cyclops');
  });

  it('enemyArt 에 tint = 눈동자 색 → 그 적 속성의 elements.json color 토큰', () => {
    const a = enemyArt('normal-heavy-seal');
    expect(a?.tint).toEqual({ from: ['#e21014'], token: ELEMENTS.find((x) => x.id === getEnemy('normal-heavy-seal').element)!.color });
  });

  it('몸 단위: 길리안 몸이면 어느 적이든 그 적 속성 토큰 (8속성 모두 다른 토큰)', () => {
    const tokens = new Set<string>();
    for (const el of ELEMENTS) {
      const foe = ENEMIES.find((e) => e.element === el.id && e.class === 'normal' && !e.testOnly)!;
      for (const look of ['gillian-base', 'gillian-cyclops']) {
        const t = enemyTintOf(foe.id, look);
        expect(t, `${foe.id} ${look}`).toEqual({ from: ['#e21014'], token: el.color });
        tokens.add(t!.token);
      }
    }
    expect(tokens.size).toBe(8);
  });

  it('길리안 몸이 아닌 적·적 테이블에 없는 것은 tint 없음', () => {
    expect(enemyArt('water-basic')?.tint).toBeUndefined();
    expect(enemyArt('water-heavy-seal')?.tint).toBeUndefined();
    expect(enemyTintOf('no-such-enemy', 'gillian-base')).toBeUndefined();
    expect(enemyTintOf('water-basic', 'brute-blue')).toBeUndefined();
  });

  it('내 캐릭터 2단계 길리안 외형(char.hollow.2·skin.gillian)은 바꾸지 않는다', () => {
    expect(charArt('hollow', 1, 'char.hollow')?.tint).toBeUndefined();
    expect(ART_MANIFEST['skin.gillian']).not.toHaveProperty('tint');
    expect(ART_MANIFEST['skin.gilliancyclops']).not.toHaveProperty('tint');
  });

  it('새 색 없음: 토큰은 elements.json color(디자인 토큰)', () => {
    for (const el of ELEMENTS) expect(el.color).toMatch(/^--bha-el-/);
    expect(read('src/data/art/enemyTint.json')).not.toMatch(/--bha-/);
  });
});

describe('색 바꾸기 함수', () => {
  it('replaceColors: 불투명한 from 색 픽셀만 to 로, 알파·다른 색 그대로', () => {
    const d = [226, 16, 20, 255, 226, 16, 20, 0, 1, 2, 3, 255, 226, 16, 20, 128];
    expect(replaceColors(d, [[226, 16, 20]], [10, 20, 30])).toBe(2);
    expect(d).toEqual([10, 20, 30, 255, 226, 16, 20, 0, 1, 2, 3, 255, 10, 20, 30, 128]);
  });

  it('parseCssColor: #rgb · #rrggbb · rgb()', () => {
    expect(parseCssColor(' #6f9fd8')).toEqual([111, 159, 216]);
    expect(parseCssColor('#abc')).toEqual([170, 187, 204]);
    expect(parseCssColor('rgb(1, 2, 3)')).toEqual([1, 2, 3]);
    expect(parseCssColor('var(--x)')).toBeNull();
  });

  it('화면 연결: 종이인형(bindRigAnim tint) · 정지 그림(artImg·도감) 이 tint 를 쓴다, 종족 분기 없음', () => {
    expect(read('src/ui/bha/animPlayer.ts')).toMatch(/pack\.sets, art\.tint\)/);
    expect(read('src/ui/bha/rigAnim.ts')).toMatch(/applyTint\(\)/);
    expect(read('src/ui/bha/battle.ts')).toMatch(/tintStillImg\(img, art\.tint\)/);
    expect(read('src/ui/enemyDexView.ts')).toMatch(/tintStillImg\(img, art\.tint\)/);
    for (const p of ['src/ui/bha/artTint.ts', 'src/data/art/enemyTint.json']) expect(read(p), p).not.toMatch(/['"](hollow|shinigami)['"]/);
  });
});
