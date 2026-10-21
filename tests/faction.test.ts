import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FACTIONS, getFaction } from '../src/data/factions';
import { BLOCK_ROLES, parseFactionConfig } from '../src/engine/faction';
import { emptyRunLog } from '../src/engine/runLog';
import { newSaveData } from '../src/game';
import enemies from '../src/data/enemies/enemies.json';
import traits from '../src/data/traits/traits.json';
import tiles from '../src/data/tiles/tiles.json';
import titles from '../src/data/titles/titles.json';

describe('종족 설정', () => {
  it('호로와 사신 설정이 스키마를 통과한다', () => {
    expect(FACTIONS.map((f) => f.id).sort()).toEqual(['hollow', 'shinigami']);
  });

  it('두 종족의 설정 키 구성이 같다 (종족 추가가 config 하나로 가능)', () => {
    const keys = (id: string) => Object.keys(getFaction(id)).sort();
    expect(keys('hollow')).toEqual(keys('shinigami'));
    for (const f of FACTIONS) expect(Object.keys(f.roleNames).sort()).toEqual([...BLOCK_ROLES].sort());
  });

  it('기획서 표 값이 들어 있다', () => {
    expect(getFaction('hollow').tierNames[4]).toBe('아란칼');
    expect(getFaction('shinigami').tierNames[4]).toBe('수석 대원');
    // 등급표 (GDD 21-1): 번호 1~10 이름, 무번호 이름. 오르는 방식은 양쪽 동일이라 rankMode 는 없앴다
    expect(getFaction('hollow').rankNames).toHaveLength(10);
    expect(getFaction('hollow').rankNames[0]).toBe('에스파다 No.1');
    expect(getFaction('hollow').rankNames[9]).toBe('에스파다 No.10');
    expect(getFaction('shinigami').rankNames[0]).toBe('대장');
    expect(getFaction('shinigami').rankNames[2]).toBe('부대장');
    expect(getFaction('shinigami').rankNames[9]).toBe('9석');
    expect('rankMode' in getFaction('hollow')).toBe(false);
  });

  it('타일 이름(tileNames)은 폐기되고 블록 표시 이름이 있다 (GDD 3-5)', () => {
    for (const f of FACTIONS) {
      expect('tileNames' in f).toBe(false);
      for (const k of ['skillBlockName', 'specialBlockName', 'voidBlockName', 'chainName', 'spName'] as const) expect(f[k].length).toBeGreaterThan(0);
    }
    const { skillBlockName: _drop, ...noBlock } = getFaction('hollow');
    expect(() => parseFactionConfig(noBlock)).toThrow(/skillBlockName/);
    expect(() => parseFactionConfig({ ...getFaction('hollow'), roleNames: { attack: '파괴' } })).toThrow(/roleNames.guard/);
  });

  it('잘못된 설정은 이유와 함께 거부한다', () => {
    expect(() => parseFactionConfig({ id: 'x' })).toThrow(/tierNames/);
    expect(() => parseFactionConfig(null)).toThrow();
  });

  it('UI 테마(theme)가 있고 검증된다 (U-1, 종족 id 분기 없이 data-bha-theme 에 쓰인다)', () => {
    expect(getFaction('hollow').theme).toBe('hollow');
    expect(getFaction('shinigami').theme).toBe('shinigami');
    for (const f of FACTIONS) expect(f.theme.length).toBeGreaterThan(0);
    const { theme: _drop, ...noTheme } = getFaction('hollow');
    expect(() => parseFactionConfig(noTheme)).toThrow(/theme/);
    expect(() => parseFactionConfig({ ...getFaction('hollow'), theme: '' })).toThrow(/theme/);
  });

  it('테마 CSS 가 등록된 모든 종족 theme 을 정의한다', () => {
    const css = ['theme-hollow.css', 'theme-shinigami.css'].map((f) => readFileSync(join(__dirname, '../src/ui/bha/design-system', f), 'utf8')).join('\n');
    for (const f of FACTIONS) expect(css).toContain(`[data-bha-theme="${f.theme}"]`);
  });

  it('알 수 없는 종족 id 는 던진다', () => {
    expect(() => getFaction('quincy')).toThrow();
  });
});

describe('데이터 폴더와 저장 구조', () => {
  it('적·계통·특성·지형 타일은 모두 임시(provisional) 데이터다', () => {
    expect(enemies.length).toBeGreaterThanOrEqual(2);
    expect(enemies.every((e) => e.provisional === true)).toBe(true);
    expect(traits.length).toBeGreaterThanOrEqual(9);
    expect(traits.every((t) => t.provisional === true)).toBe(true);
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.every((t) => t.provisional === true)).toBe(true);
  });

  it('등급·히든·태그 정의 18개(C.54 수련 완료 칭호, C.58 스토리 칭호 2개, C.59 붕옥 완성, C.84 스토리 2·3장·보스 칭호 4개 추가): 조건은 임시(provisional)로 일부에만 있고 나머지는 null 이다 (11-6, 11-7 미정)', () => {
    expect(titles.filter((t) => (t as { kind?: string }).kind !== 'tower')).toHaveLength(19); // C.106: tag-1 을 호로·사신 전용 2개로 나눔. 탑 칭호 5개(C.85)는 tests/c85.test.ts
    expect(titles.filter((t) => t.condition !== null).every((t) => (t as { provisional?: boolean }).provisional === true)).toBe(true);
    expect(titles.filter((t) => t.condition === null).length).toBeGreaterThan(0);
    expect(titles.filter((t) => t.hidden)).toHaveLength(7);
  });

  it('새 세이브에는 빈 런 로그가 처음부터 들어 있다', () => {
    const s = newSaveData('hollow');
    expect(s.runLog).toEqual(emptyRunLog());
    expect(s.factionId).toBe('hollow');
  });
});
