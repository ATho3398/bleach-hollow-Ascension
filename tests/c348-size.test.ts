// C.348 (GDD 206장 보충): 적 덩치와 내 덩치는 걷기 필드(조우 전·조우)·전투·도감 어디서나 같은 도트 한 칸.
// 규칙 하나 = ① 그림 배율은 그림 목록(ART_MANIFEST) 한 값을 적·나가 같이 쓴다(덩치 몸 = HOLLOW_BRUTE_SCALE, 필드 배율 따로 없음)
//            ② 같은 화면에서 적 칸 키 = 내 칸 키 (걷기 = --bha-fig-h 하나, 전투 = 같은 .bha-unit__fig). 실측은 scripts/c348-size.cjs.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ART_MANIFEST, BRUTE_ELEMENT_LOOKS, BRUTE_ENEMY_KINDS, BRUTE_FOE_SCALE, HOLLOW_BRUTE_SCALE, charArt, enemyArt } from '../src/data/art/manifest';

const css = (f: string) => readFileSync(`src/ui/bha/${f}`, 'utf8');
/** 화면이 실제로 쓰는 배율: 걷기·전투 내 그림 = fieldScale ?? scale, 적 그림 = scale (walk.ts·battle.ts) */
const fieldOf = (a: { scale: number; fieldScale?: number }) => a.fieldScale ?? a.scale;

describe('C.348 적·나 공용 크기 규칙', () => {
  it('덩치 몸 종이인형(brute-*)은 적·나 모두 같은 배율, 필드 배율 따로 없음', () => {
    const brutes = Object.entries(ART_MANIFEST).filter(([, e]) => e.rig?.startsWith('brute-'));
    expect(brutes.length).toBeGreaterThanOrEqual(40 + 4);
    for (const [k, e] of brutes) {
      expect(e.scale, k).toBe(HOLLOW_BRUTE_SCALE);
      expect(e.fieldScale, k).toBeUndefined();
    }
    expect(BRUTE_FOE_SCALE).toBe(HOLLOW_BRUTE_SCALE);
  });

  it('필드(걷기·전투)와 도감: 덩치 적 그림 배율 = 내 덩치(기본·거구·망령·속박자) 필드 배율', () => {
    const mine = [null, 'brute', 'ghoul', 'shackled'].map((s) => charArt('hollow', 0, '', '/', undefined, undefined, s, undefined, 'male'));
    for (const a of mine) expect(a.rig?.look.startsWith('brute-')).toBe(true);
    const myField = new Set(mine.map(fieldOf));
    expect([...myField]).toEqual([HOLLOW_BRUTE_SCALE]);
    for (const el of Object.keys(BRUTE_ELEMENT_LOOKS)) for (const k of BRUTE_ENEMY_KINDS) {
      const f = enemyArt(`${el}-${k}`, '/');
      expect(f?.rig?.look.startsWith('brute-'), `${el}-${k}`).toBe(true);
      expect(f!.scale, `${el}-${k} 전투·걷기·도감`).toBe(HOLLOW_BRUTE_SCALE);
      expect(fieldOf(f!), `${el}-${k}`).toBe(HOLLOW_BRUTE_SCALE);
    }
  });

  it('걷기: 다가오는 적 칸(일반·강적·보스) 키 = 내 캐릭터 칸 키 (--bha-fig-h 하나)', () => {
    const enc = css('encounter.css');
    const walk = css('walk-scene.css');
    expect(enc).toMatch(/\.bha-walk \{ --bha-fig-h: 53; --bha-fig-gap: 0\.4; \}/); // 53 = C.345 걷기 적 46·나 60 의 중간 (사용자)
    expect(enc).toMatch(/--ahead-h: calc\(var\(--bha-fig-h\) \* 1cqh\)/);
    // 적 종류별로 칸 키를 따로 두지 않는다 (휴식 장소만 따로)
    const own = [...enc.matchAll(/\.bha-ahead--(\w+)[^{]*\{[^}]*--ahead-h:/g)].map((m) => m[1]);
    expect(own).toEqual(['rest']);
    expect(walk).toMatch(/\.bha-lcd \.bha-walker \{[^}]*height: calc\(var\(--bha-fig-h, 53\) \* 1%\)/);
  });

  it('전투·도감: 적 그림과 내 그림 모두 --art-scale(그림 목록 배율)로 키운다', () => {
    expect(css('components/components.css')).toMatch(/\.bha-foe__img \{[^}]*scale\(var\(--art-scale, 1\)\)/);
    expect(css('battle-scene.css')).toMatch(/\.bha-hero__img \{[^}]*scale\(var\(--art-scale, 1\)\)/);
    expect(css('battle-scene.css')).toMatch(/\.bha-unit__fig > \.bha-hero, \.bha-unit__fig > \.bha-foe \{ height: 100%; aspect-ratio: 1;/);
    expect(css('screens-lcd.css')).toMatch(/\.bha-edex__img \{[^}]*scale\(var\(--art-scale, 1\)\)/);
  });
});
