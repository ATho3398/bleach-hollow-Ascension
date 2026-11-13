// C.363 (GDD 220장 1~4): 도감 바둑판 + 상세 창 · 정렬(세이브 형식 68 dexSort) · 4단계 진화체 이름 = 레스렉시온/참백도 이름 · '속성 잇기' → '특'
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FORM_TABLE, formName, getForm, placeholderName } from '../src/data/evolution';
import { FORM_RELEASES } from '../src/data/evolution/releases';
import { FACTIONS, getFaction } from '../src/data/factions';
import { DEX_SORT_LABEL, ENEMY_DEX_SORTS, FORM_DEX_SORTS, nextDexSort, sanitizeDexSort, sortDex, type DexSortFacts } from '../src/engine/dexSort';
import { newEvolution, formDisplayName } from '../src/engine/evolution';
import { migrateSave, newSaveData, SAVE_FORMAT_VERSION, SAVE_MIGRATIONS } from '../src/game';

const read = (p: string) => readFileSync(p, 'utf8');

describe('220장 3: 4단계 진화체 이름 = 레스렉시온 이름(호로) / 참백도 이름(사신)', () => {
  it('releases.json 28종 모두 두 종족 이름이 표시 이름 (종족 설정 liberation.formNameKey 칸)', () => {
    const ids = Object.keys(FORM_RELEASES);
    expect(ids).toHaveLength(28);
    for (const fac of FACTIONS) {
      expect(fac.liberation.formNameKey).toBe('name');
      for (const id of ids) {
        const f = getForm(id);
        expect(f.tier).toBe(4);
        expect(formName(f, fac.id)).toBe(FORM_RELEASES[id]![fac.id]!.name);
        expect(formName(f, fac.id, ['fire'])).toBe(FORM_RELEASES[id]![fac.id]!.name); // 행동 히든도 '_불' 꼬리 없이
      }
    }
    expect(formName(getForm('t4:normal:physical'), 'hollow')).toBe('마르티요');
    expect(formName(getForm('t4:normal:physical'), 'shinigami')).toBe('백련');
  });
  it('198장 표에 이름이 없는 진화체(2·3단계)는 지금 이름 그대로', () => {
    for (const f of FORM_TABLE.filter((x) => !FORM_RELEASES[x.id])) {
      for (const fac of FACTIONS) expect(formName(f, fac.id)).toBe(f.name ? formName(f, fac.id) : placeholderName(f, fac.id));
    }
    expect(formName(getForm('t3:fire'), 'hollow')).toBe('아쥬커스_불');
  });
  it('이름표(formDisplayName)도 같은 이름 — 아란칼화 전후 같다. 실패형 줄기는 1단계 이름 그대로(49-8)', () => {
    const e = newEvolution(1);
    e.tierIndex = 3;
    e.formId = 't4:water:mixed';
    e.formHistory = ['t2:base', 't3:water', 't4:water:mixed'];
    expect(formDisplayName(e, 'hollow')).toBe('바라쿠다');
    expect(formDisplayName(e, 'shinigami')).toBe(FORM_RELEASES['t4:water:mixed']!.shinigami!.name);
  });
  it('언령(command)은 이름이 아니다 — 이름에 언령이 섞이지 않는다', () => {
    for (const [id, r] of Object.entries(FORM_RELEASES)) for (const fac of FACTIONS) {
      const cmd = r[fac.id]?.command;
      if (cmd) expect(formName(getForm(id), fac.id)).not.toContain(cmd);
    }
  });
});

describe('220장 2: 정렬', () => {
  type T = { id: string } & DexSortFacts;
  const items: T[] = [
    { id: 'a', known: true, name: '다', element: 2, kind: 0, kills: 1, found: 2, group: 1 },
    { id: 'b', known: false, name: '?', element: 0, kind: 0, kills: 0, group: 1 },
    { id: 'c', known: true, name: '가', element: 1, kind: 1, kills: 9, found: 0, group: 2 },
    { id: 'd', known: true, name: '나', element: Infinity, kind: 2, kills: 3, found: 1, group: 2 },
    { id: 'e', known: false, name: '?', element: 0, kind: 2, kills: 0, group: 2 },
  ];
  const ids = (k: Parameters<typeof sortDex>[1]) => sortDex(items, k, (t) => t).map((t) => t.id).join('');
  it('기본 = 묶음 순서, 미발견은 묶음 안 맨 뒤 / 그 밖의 기준은 미발견이 전체 맨 뒤', () => {
    expect(ids('default')).toBe('abcde');
    expect(ids('name')).toBe('cdabe');
    expect(ids('element')).toBe('cadbe'); // 속성 없음('특')은 속성 있는 것 뒤
    expect(ids('kind')).toBe('acdbe');
    expect(ids('kills')).toBe('cdabe');
    expect(ids('found')).toBe('cdabe');
  });
  it('버튼은 누를 때마다 다음 기준, 끝 다음은 처음 · 기준 이름', () => {
    expect(FORM_DEX_SORTS).toEqual(['default', 'name', 'element', 'found']);
    expect(ENEMY_DEX_SORTS).toEqual(['default', 'name', 'element', 'kind', 'kills']);
    expect(nextDexSort(FORM_DEX_SORTS, 'found')).toBe('default');
    expect(nextDexSort(ENEMY_DEX_SORTS, 'kind')).toBe('kills');
    for (const k of [...FORM_DEX_SORTS, ...ENEMY_DEX_SORTS]) expect(DEX_SORT_LABEL[k].length).toBeGreaterThan(0);
  });
  it('세이브 형식 68: 새 세이브 기본 정렬, 67 → 68 마이그레이션, 저장·불러오기로 남고 깨진 값은 기본', () => {
    expect(SAVE_FORMAT_VERSION).toBe(86); // C.406 쇠약 시계·터치·숨은 모습
    expect(typeof SAVE_MIGRATIONS[67]).toBe('function');
    const s = newSaveData('hollow', 7);
    expect(s.dexSort).toEqual({ forms: 'default', enemies: 'default' });
    const old = JSON.parse(JSON.stringify(s));
    delete old.dexSort;
    old.meta.format = 67;
    const m = migrateSave(old);
    expect(m!.meta.format).toBe(86);
    expect(m!.dexSort).toEqual({ forms: 'default', enemies: 'default' });
    s.dexSort = { forms: 'name', enemies: 'kills' };
    expect(migrateSave(JSON.parse(JSON.stringify(s)))!.dexSort).toEqual({ forms: 'name', enemies: 'kills' });
    const broken = JSON.parse(JSON.stringify(s));
    broken.dexSort = { forms: 'kills', enemies: 'x' };
    expect(migrateSave(broken)!.dexSort).toEqual({ forms: 'default', enemies: 'default' });
    expect(sanitizeDexSort(null)).toEqual({ forms: 'default', enemies: 'default' });
  });
});

describe('220장 1·4: 화면', () => {
  const dex = read('src/ui/dexView.ts');
  const edex = read('src/ui/enemyDexView.ts');
  it('두 도감 = 바둑판 카드(dexCard) + 상세 창(itemDialog 공용 창 틀) + 머리 정렬 버튼, 목록·상세 두 칸(masterDetail) 없음', () => {
    for (const v of [dex, edex]) {
      expect(v).toContain('dexCard(');
      expect(v).toContain('itemDialog(');
      expect(v).toContain('dexSortButton(');
      expect(v).not.toContain('masterDetail(');
      expect(v).not.toMatch(/factionId === '|faction\.id === '/); // 종족 분기 없음
    }
  });
  it("'속성 잇기' 글자는 화면에서 사라지고 '특' 칩(강조색 토큰)", () => {
    for (const f of readdirSync('src/ui').filter((x) => x.endsWith('.ts'))) expect(read(`src/ui/${f}`), f).not.toContain('속성 잇기');
    expect(dex).toContain("'bha-eldot bha-eldot--special', '특'");
    expect(read('src/ui/bha/screens-lcd.css')).toMatch(/\.bha-eldot--special \{ background: var\(--bha-accent\);/);
  });
  it('도감 바둑판 CSS 는 토큰만 (새 색 값 없음)', () => {
    const css = read('src/ui/bha/screens-lcd.css').split('도감 바둑판 (.bha-dexgrid-page')[1]!.split('═════ 진화 제단')[0]!;
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i);
  });
  it('종족 설정 검증: liberation.formNameKey 는 name | final', () => {
    expect(getFaction('hollow').liberation.formNameKey).toBe('name');
  });
});
