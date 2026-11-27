// C.545 일반 적 이름 = 그림 모델(몸) 이름 + 호로(덩치 = 그냥 호로), 도감에서만 '<이름>(속성 속성)' (GDD 6-7 v6.212·v6.214·v6.215 → v6.217,
// 사용자 2026-11-27 "속공, 기본 이런건 빼;; 그 모델에 따라서, 거미형 호로, 부유형 호로 이런식으로 이름붙여. 적들.")
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ART_MANIFEST, BRUTE_ENEMY_KINDS, enemyArt } from '../src/data/art/manifest';
import { ART_FILES } from '../src/data/art/files';
import { ELEMENT_IDS, elementName } from '../src/data/elements';
import { ENEMIES, ENEMY_BODIES, ENEMY_DEX_NAMES, enemyDexName, getEnemy, normalEnemyBody, PRACTICE_DUMMY } from '../src/data/enemies';
import { FACTIONS } from '../src/data/factions';
import { pickFaction } from '../src/data/schema';
import { ENEMY_CARDS } from '../src/engine/enemyDex';
import { practiceArenaSource, testArenaSource } from '../src/ui/testModeArena';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const normals = ENEMIES.filter((e) => e.class === 'normal' && !e.testOnly);
const PATTERN_WORDS = /기본|속공|단단/;
const bodyName = (id: string) => ENEMY_BODIES.names[normalEnemyBody(getEnemy(id)) ?? ''];
/** 기대 이름: 몸 이름 + 호로, 몸 이름이 비면(덩치) 그냥 호로 */
const expectName = (id: string) => (bodyName(id) ? `${bodyName(id)} 호로` : '호로');

/** 그림 쪽에서 본 몸: 종이인형 외형 id 앞머리(brute-blue → brute), 종이인형이 아니면 한 장 그림 = lean */
function artBody(id: string): string | null {
  const rig = ART_MANIFEST[`enemy.${id}`]?.rig;
  if (rig) return rig.split('-')[0] ?? null;
  return ART_FILES.some((f) => f.startsWith(`enemy-${id}.`)) ? 'lean' : null;
}

describe('일반 적 24종 이름 = 몸 이름 + 호로 (그림과 같은 출처)', () => {
  it('24종(속성 8 × 패턴 3), 모든 종족에서 이름 = 몸 이름 + 호로(덩치 = 호로), 패턴 글자 없음', () => {
    expect(normals).toHaveLength(24);
    for (const el of ELEMENT_IDS) for (const p of ['basic', 'swift', 'sturdy']) expect(normals.some((e) => e.id === `${el}-${p}`), `${el}-${p}`).toBe(true);
    for (const f of FACTIONS) for (const e of normals) {
      const n = pickFaction(e.name, f.id);
      expect(n, `${f.id} ${e.id}`).toBe(expectName(e.id));
      expect(n).toMatch(/^(\S+형 )?호로$/);
      expect(n).not.toMatch(PATTERN_WORDS);
    }
  });

  it('몸 표의 몸 = 실제 그림 모델 (덩치 종이인형 = brute, 한 장 그림 = lean) — 24종 모두', () => {
    for (const e of normals) expect(artBody(e.id), e.id).toBe(normalEnemyBody(e));
    for (const e of normals) expect(enemyArt(e.id), e.id).not.toBeNull();
  });

  it('그림 목록의 덩치 적 종류는 몸 표에서 나온다 (몸 brute 인 일반 패턴 + 강적 3)', () => {
    const bruteKinds = Object.entries(ENEMY_BODIES.normal.byPattern).filter(([, b]) => b === 'brute').map(([k]) => k);
    expect([...BRUTE_ENEMY_KINDS].sort()).toEqual([...bruteKinds, 'heavy-chain', 'heavy-seal', 'stance'].sort());
    expect(read('src/data/art/manifest.ts')).toMatch(/import enemyBodies from '\.\.\/enemies\/bodies\.json'/);
  });

  it('지금 표(6-7 v6.214 · 15-5 v6.218): 기본·속공·단단 = 덩치 → 호로 · 몸 이름 = 6-7 표 · 앞말은 빈 글자이거나 \'~형\'', () => {
    expect(getEnemy('water-basic').name['*']).toBe('호로');
    expect(getEnemy('water-sturdy').name['*']).toBe('호로');
    expect(getEnemy('water-swift').name['*']).toBe('호로'); // C.548: 마른 몸·날쌘형 폐기
    expect(ENEMY_BODIES.names).toMatchObject({ brute: '', onearm: '괴력형', speed: '속공형', spiky: '강습형', serpent: '뱀형', beast: '짐승형', spider: '거미형', wraith: '부유형' });
    for (const n of Object.values(ENEMY_BODIES.names)) expect(n).toMatch(/^$|형$/);
  });

  it('강적·보스·훈련 인형·테스트 적 이름은 그대로', () => {
    expect(getEnemy('blood-heavy-seal').name['*']).toBe('만 명을 먹은 자');
    expect(PRACTICE_DUMMY.name['*']).toBe('훈련 인형');
    expect(getEnemy('test-a').name['*']).toBe('테스트 적 A');
    expect(normalEnemyBody(PRACTICE_DUMMY)).toBeNull();
  });
});

describe('도감 표기 = <이름>(속성 속성)', () => {
  it('규칙 데이터에 패턴 자리 없음', () => {
    expect(ENEMY_DEX_NAMES.normal.format).toBe('{name}({element} 속성)');
    expect(read('src/data/enemies/dexNames.json')).not.toMatch(/patterns|\{pattern\}/);
  });

  it('24종 모두 \'<이름>(<속성 표시 이름> 속성)\', 패턴 글자 없음 — 쿄는 허무', () => {
    for (const f of FACTIONS) for (const e of normals) {
      const d = enemyDexName(e, f.id);
      expect(d, e.id).toBe(`${expectName(e.id)}(${elementName(e.element, f.id)} 속성)`);
      expect(d).not.toMatch(PATTERN_WORDS);
    }
    expect(enemyDexName(getEnemy('water-swift'), 'hollow')).toBe('호로(물 속성)');
    expect(enemyDexName(getEnemy('kyo-basic'), 'shinigami')).toBe(`호로(${elementName('kyo', 'shinigami')} 속성)`);
  });

  it('강적·보스 도감 이름 = 이름 그대로', () => {
    for (const c of ENEMY_CARDS.filter((x) => x.kind !== 'normal')) expect(enemyDexName(c.def, 'hollow'), c.id).toBe(pickFaction(c.def.name, 'hollow'));
  });

  it('적 고르기 목록(수련장·테스트 모드) = 도감 표기, 훈련 인형·강적은 그대로', () => {
    const f = FACTIONS[0]!;
    const dex = { 'water-basic': { seen: 1, kills: 1, absorbs: { both: 0, trait: 0, stat: 0, none: 0 }, where: null, firstAt: 1 }, 'water-swift': { seen: 1, kills: 0, absorbs: { both: 0, trait: 0, stat: 0, none: 0 }, where: null, firstAt: 1 } };
    expect(practiceArenaSource(f, dex, 3, false).foes.map((x) => x.label)).toEqual(['훈련 인형', '호로(물 속성)', '호로(물 속성)']);
    const labels = testArenaSource(f, { foeId: '', star: 1, streak: 0, floor: null, hpAttacks: null, attackAttacks: null, attackSeconds: null, attacks: true, immortal: false }).foes.map((x) => x.label);
    expect(labels).toContain('호로(불 속성)');
    expect(labels).toContain('만 명을 먹은 자');
  });

  it('도감 화면만 enemyDexName (전투·흡수는 이름 그대로), 종족 분기 없음', () => {
    expect(read('src/ui/enemyDexView.ts')).toMatch(/enemyDexName\(card\.def, faction\.id\)/);
    for (const p of ['src/ui/battleView.ts', 'src/ui/absorbView.ts']) expect(read(p), p).not.toMatch(/enemyDexName/);
    expect(read('src/data/enemies/index.ts')).not.toMatch(/['"](hollow|shinigami)['"]/);
  });
});
