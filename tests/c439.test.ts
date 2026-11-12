// C.439 (GDD 12-2 v6.046, 코딩285): 합체 창 배치 다시 — 부모 둘 → 가운데 결과(여신전생 악마 합체·드퀘 몬스터즈 배합 배치) + 아래 조건 칩 띠
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FACTIONS } from '../src/data/factions';
import { checkTrackOpen, characterTracks, developHogyoku, fusionPreview, newSaveData, type SaveData } from '../src/game';
import { HOGYOKU_TRACK_IDS } from '../src/engine/transcend';
import { fusionConds } from '../src/ui/hogyokuView';
import { HOGYOKU_STAGE_NAMES } from '../src/data/hogyoku';
import { clearStory } from './helpers/storyClear';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/** 두 캐릭터 4단계(분류 forms) · 공명 · 개발 full 이면 세 트랙 50강 · top 이면 둘 다 등급 1위 */
function ready(forms: [string, string], o: { full?: boolean; top?: boolean } = {}): SaveData {
  const s = newSaveData(FACTIONS[0]!.id, 1);
  for (const f of FACTIONS) clearStory(s, f.id);
  checkTrackOpen(s, 10); checkTrackOpen(s, 11);
  characterTracks(s).forEach((t, i) => {
    t.evolution.tierIndex = 3; t.evolution.formId = forms[i]!; t.evolution.formHistory = ['t2:base', 't3:fire', forms[i]!];
    if (o.top !== false) { t.rank.ladder = ['player', ...t.rank.ladder.filter((x) => x !== 'player')]; t.rank.history.everRanked = true; }
  });
  s.shared.soulCrystals = 99999; s.shared.hogyokuShards = 99999; s.shared.resonanceEssence = 99999;
  if (o.full !== false) for (const id of HOGYOKU_TRACK_IDS) while (developHogyoku(s, id, 1)) { /* 50강 */ }
  return s;
}

describe('C.439 합체 조건 칩 (GDD 12-2 v6.046)', () => {
  it('칩 5개 순서·짧은 이름표 = 붕옥 100% · 공명 · 둘 다 1위 · 모험 없음 · 조합 미보유, 다 채우면 모두 ✓', () => {
    const c = fusionConds(ready(['t4:fire:physical', 't4:fire:mixed']));
    expect(c.map((x) => x.key)).toEqual(['develop', 'resonance', 'rank', 'expedition', 'owned']);
    expect(c.map((x) => x.short)).toEqual(['붕옥 100%', HOGYOKU_STAGE_NAMES.resonance, '둘 다 1위', '모험 없음', '조합 미보유']);
    expect(c.every((x) => x.ok)).toBe(true);
  });

  it('막힌 이유 첫 번째 = 칩 순서의 첫 ✗, 자세한 이유에 지금 값', () => {
    const s = ready(['t4:fire:mixed', 't4:earth:mixed'], { full: false, top: false });
    const c = fusionConds(s);
    const bad = c.filter((x) => !x.ok).map((x) => x.key);
    expect(bad).toEqual(['develop', 'rank']);
    expect(c.find((x) => !x.ok)!.detail).toMatch(/지금 0%/);
    expect(c.find((x) => x.key === 'rank')!.detail).toMatch(/두 캐릭터 모두 등급 1위/);
  });

  it('이미 가진 조합 = 조합 미보유 ✗ + 기존 막힘 문구', () => {
    const s = ready(['t4:fire:physical', 't4:earth:physical']);
    const def = fusionPreview(s).def!;
    s.transcendentDex.push({ id: def.id, at: 1, fusionIndex: 1 });
    const owned = fusionConds(s).find((x) => x.key === 'owned')!;
    expect(owned.ok).toBe(false);
    expect(owned.detail).toContain(`물리 + 물리 → ${def.name}`);
    expect(owned.detail).toContain('이 조합의 초월자는 이미 있다 — 다른 분류로 키워라.');
  });
});

describe('C.439 합체 창 화면 (코드 점검)', () => {
  const src = read('src/ui/hogyokuView.ts');
  const css = read('src/ui/bha/screens-lcd.css');
  const block = css.slice(css.indexOf('/* 합체 창 (GDD 12-2 v6.040'), css.indexOf('.bha-fusestrip__go:disabled'));
  it('부모 → 결과 → 부모 한 줄, 종족 순서는 설정 순서(종족 id 분기 없음), 되돌릴 수 없다 경고는 합체 창에 없음', () => {
    expect(src).toMatch(/stage\.append\(parents\[0\][^;]*fusionLink\('left'\), result, fusionLink\('right'\), parents\[1\]/);
    expect(src).not.toMatch(/factionId === '(hollow|shinigami)'/);
    const pick = src.slice(src.indexOf('export function fusionPickView'), src.indexOf('/** 초월자 그림 칸'));
    expect(pick).not.toContain('되돌릴 수 없다');
  });
  it('색은 토큰만(새 색 금지), 움직임 줄이기면 반짝임 정지, 글자 줄바꿈 대신 말줄임(세로 깨짐 방지)', () => {
    expect(block.length).toBeGreaterThan(500);
    expect(block).not.toMatch(/#[0-9a-f]{3,6}\b|rgba?\(/i);
    expect(block).toMatch(/prefers-reduced-motion: reduce\) \{ \.bha-fuse\.is-ready \.bha-fuse__link::before \{ animation: none/);
    expect(block).toMatch(/\.bha-fusestrip__why \{[^}]*white-space: nowrap[^}]*text-overflow: ellipsis/);
  });
});
