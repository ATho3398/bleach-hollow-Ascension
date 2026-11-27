// C.548 마른 몸 폐기 — 속공(swift) 일반 적도 덩치 종이인형·이름 '호로' (GDD 15-5 v6.218,
// 사용자 2026-11-27 "마른 몸은 종이인형으로 움직임 구현이 안돼서 아예 드랍. 게임에서도 다 빼버려.")
import './helpers/rigMotions'; // 종이인형 동작 데이터 채우기 (C.509)
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ART_MANIFEST, BRUTE_ELEMENT_LOOKS, BRUTE_ENEMY_KINDS, enemyArt } from '../src/data/art/manifest';
import { HUMANOID, MOTIONS, MOTION_SETS, resolveMotions } from '../src/data/art/rig/pose';
import { ELEMENT_IDS } from '../src/data/elements';
import { ENEMIES, ENEMY_BODIES, enemyDexName, getEnemy } from '../src/data/enemies';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const swifts = ENEMIES.filter((e) => e.class === 'normal' && !e.testOnly && e.id.endsWith('-swift'));

describe('속공 적 8종 = 덩치 종이인형', () => {
  it('8속성 모두 덩치 몸(hb)·그 속성 색 외형 — 같은 속성 basic 과 같은 외형', () => {
    expect(swifts).toHaveLength(8);
    for (const e of swifts) {
      const a = enemyArt(e.id, '/');
      expect(a?.rig?.look, e.id).toBe(BRUTE_ELEMENT_LOOKS[e.element]);
      expect(HUMANOID.looks[a!.rig!.look]!.body).toBe('hb');
      expect(a!.rig!.look).toBe(enemyArt(e.id.replace('-swift', '-basic'), '/')!.rig!.look);
    }
    expect(BRUTE_ENEMY_KINDS).toContain('swift');
    expect(ENEMY_BODIES.normal.byPattern).toEqual({ basic: 'brute', swift: 'brute', sturdy: 'brute' });
  });

  it('덩치 동작(대기·걷기·공격1·2·맞음·쓰러짐)이 swift 에도 그대로 붙는다', () => {
    const motions = resolveMotions(HUMANOID, MOTIONS, MOTION_SETS, 'hb');
    for (const m of ['idle', 'move', 'attack', 'attack2', 'hit', 'down']) expect(motions[m], m).toBeTruthy();
  });

  it('마른 몸 한 장 그림 enemy-<속성>-swift.png 삭제, 참조 없음', () => {
    for (const el of ELEMENT_IDS) expect(existsSync(`public/art/enemy-${el}-swift.png`), el).toBe(false);
    expect(readdirSync('public/art').filter((f) => /swift/.test(f))).toEqual([]);
    for (const p of ['src/ui/bha/fxLab.ts', 'src/data/art/manifest.ts']) expect(read(p), p).not.toMatch(/enemy-[a-z]+-swift\.png['"]/);
    for (const k of Object.keys(ART_MANIFEST).filter((k) => k.endsWith('-swift'))) expect(ART_MANIFEST[k]!.rig, k).toMatch(/^brute-/);
  });
});

describe('이름 = 호로, 날쌘형 폐기', () => {
  it('속공 적 이름 = 호로, 도감 = 호로(<속성> 속성)', () => {
    for (const e of swifts) {
      expect(e.name['*'], e.id).toBe('호로');
      expect(enemyDexName(e, 'hollow')).toMatch(/^호로\(.+ 속성\)$/);
    }
    expect(Object.keys(ENEMY_BODIES.names)).not.toContain('lean');
    expect(read('src/data/enemies/bodies.json')).not.toMatch(/"lean"|"날쌘형"|provisional/);
  });

  it('도감 이름 겹침(지금은 그대로): 속성마다 basic·swift·sturdy 3종이 같은 \'호로(<속성> 속성)\'', () => {
    for (const el of ELEMENT_IDS) {
      const names = ['basic', 'swift', 'sturdy'].map((p) => enemyDexName(getEnemy(`${el}-${p}`), 'hollow'));
      expect(new Set(names).size, el).toBe(1);
    }
  });
});
