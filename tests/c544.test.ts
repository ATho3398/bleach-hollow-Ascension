// C.544 일반 적 이름 = '호로', 도감에서만 '호로(속성 속성·패턴)' (GDD 6-7 v6.210, 사용자 2026-11-27 "보이는건 그냥 호로로 하고, 도감에 호로(수 속성) 뭐 이런식으로")
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ELEMENT_IDS, elementName } from '../src/data/elements';
import { ENEMIES, ENEMY_DEX_NAMES, enemyDexName, getEnemy } from '../src/data/enemies';
import { FACTIONS } from '../src/data/factions';
import { pickFaction } from '../src/data/schema';
import { ENEMY_CARDS } from '../src/engine/enemyDex';
import { practiceArenaSource } from '../src/ui/testModeArena';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const PATTERN_WORD: Record<string, string> = { basic: '기본', swift: '속공', sturdy: '단단' };
const normals = ENEMIES.filter((e) => e.class === 'normal' && !e.testOnly);

describe('일반 적 24종 = 보이는 이름 호로', () => {
  it('속성 8 × 패턴 3 = 24종, id <속성>-<패턴>, 이름은 모든 종족에서 \'호로\'', () => {
    expect(normals).toHaveLength(24);
    const ids = new Set(normals.map((e) => e.id));
    for (const el of ELEMENT_IDS) for (const p of Object.keys(PATTERN_WORD)) expect(ids.has(`${el}-${p}`), `${el}-${p}`).toBe(true);
    for (const f of FACTIONS) for (const e of normals) expect(pickFaction(e.name, f.id), `${f.id} ${e.id}`).toBe('호로');
  });

  it('옛 이름(짐승형·부유형·갑각형 호로)이 적 데이터·화면 코드에 없다', () => {
    expect(read('src/data/enemies/enemies.json')).not.toMatch(/(짐승형|부유형|갑각형) 호로/);
    for (const p of ['src/ui/enemyDexView.ts', 'src/ui/battleView.ts', 'src/ui/absorbView.ts']) expect(read(p), p).not.toMatch(/(짐승형|부유형|갑각형) 호로/);
  });
});

describe('도감 표기 = 호로(속성 속성·패턴)', () => {
  it('규칙은 데이터(dexNames.json): 형식 + 패턴 글자', () => {
    expect(ENEMY_DEX_NAMES.normal.format).toBe('{name}({element} 속성·{pattern})');
    expect(ENEMY_DEX_NAMES.normal.patterns).toEqual(PATTERN_WORD);
  });

  it('예: 호로(물 속성·기본)·호로(물 속성·속공)·호로(물 속성·단단), 허무(쿄)도 같은 규칙', () => {
    for (const f of FACTIONS) {
      expect(enemyDexName(getEnemy('water-basic'), f.id)).toBe('호로(물 속성·기본)');
      expect(enemyDexName(getEnemy('water-swift'), f.id)).toBe('호로(물 속성·속공)');
      expect(enemyDexName(getEnemy('water-sturdy'), f.id)).toBe('호로(물 속성·단단)');
      expect(enemyDexName(getEnemy('kyo-sturdy'), f.id)).toBe(`호로(${elementName('kyo', f.id)} 속성·단단)`);
    }
  });

  it('24종 모두 도감 이름이 서로 다르고 속성 표시 이름·패턴 글자를 담는다', () => {
    for (const f of FACTIONS) {
      const names = normals.map((e) => enemyDexName(e, f.id));
      expect(new Set(names).size).toBe(24);
      for (const e of normals) expect(enemyDexName(e, f.id), e.id).toBe(`호로(${elementName(e.element, f.id)} 속성·${PATTERN_WORD[e.pattern?.kind ?? 'basic']})`);
    }
  });

  it('강적·보스는 도감에서도 이름 그대로', () => {
    for (const c of ENEMY_CARDS.filter((x) => x.kind !== 'normal')) expect(enemyDexName(c.def, 'hollow'), c.id).toBe(pickFaction(c.def.name, 'hollow'));
  });

  it('도감 화면만 enemyDexName 을 쓴다 (전투·흡수는 이름 그대로), 종족 분기 없음', () => {
    expect(read('src/ui/enemyDexView.ts')).toMatch(/enemyDexName\(card\.def, faction\.id\)/);
    for (const p of ['src/ui/battleView.ts', 'src/ui/absorbView.ts']) expect(read(p), p).not.toMatch(/enemyDexName/);
    const src = read('src/data/enemies/index.ts');
    expect(src).not.toMatch(/['"](hollow|shinigami)['"]/);
    expect(read('src/ui/enemyDexView.ts')).not.toMatch(/=== ['"](hollow|shinigami)['"]/);
  });

  it('적을 고르는 목록(수련장 적 설정 창)은 도감 표기로 가른다, 훈련 인형은 이름 그대로', () => {
    const f = FACTIONS[0]!;
    const dex = { 'water-basic': { seen: 1, kills: 1, absorbs: { both: 0, trait: 0, stat: 0, none: 0 }, where: null, firstAt: 1 }, 'water-sturdy': { seen: 1, kills: 0, absorbs: { both: 0, trait: 0, stat: 0, none: 0 }, where: null, firstAt: 1 } };
    const labels = practiceArenaSource(f, dex, 3, false).foes.map((x) => x.label);
    expect(labels).toEqual(['훈련 인형', '호로(물 속성·기본)', '호로(물 속성·단단)']);
  });
});
