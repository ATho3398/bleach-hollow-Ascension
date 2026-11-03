// 코딩189 (GDD 176장 3·6·9·11·12·13·15~22): 마스터 플레이 점검 — 문구·표시
import { describe, expect, it } from 'vitest';
import { getFaction } from '../src/data/factions';
import { endReasonText } from '../src/ui/labels';
import { dyingClock } from '../src/ui/bha/roomLogic';
import { roomStatusInfo } from '../src/ui/bha/statusInfo';
import { statusChips } from '../src/ui/bha/roomLogic';
import { EVOLVE_HINT, growthLines } from '../src/ui/bha/growthLogic';
import { GEAR_GRADE_NAMES } from '../src/data/gear';
import { traitNameWithElement } from '../src/data/traits';
import { shopBlurb } from '../src/ui/shopView';
import { DETACH_TRAITS } from '../src/engine/traitShop';
import { traitItemId } from '../src/shop';
import { RECOVER_SCENES } from '../src/data/help';

const H = getFaction('hollow');
const S = getFaction('shinigami');

describe('3 종족 말: 화면 글자는 종족 설정에서', () => {
  it('foodGroupName = 호로 먹이 / 사신 식량, 귀환 문구에 둥지 칸 없음', () => {
    expect(H.foodGroupName).toBe('먹이');
    expect(S.foodGroupName).toBe('식량');
    expect(endReasonText('returned', S)).toContain(S.nestName);
    expect(endReasonText('returned', S)).not.toContain('둥지');
  });
});

describe('6 결과 진화 줄', () => {
  it('성장 요약에 진화체 이름이 없다, 결과 진화 안내는 이름 없는 한 줄', () => {
    expect(growthLines({ newTraits: 1, evolvedTo: '길리안', newTitles: [] }).join(' ')).not.toContain('길리안');
    expect(EVOLVE_HINT).toContain('몸에 변화가 일어난다');
  });
});

describe('9 회복 안내 5/7', () => {
  it('"이제 방으로 돌아가자" → 돌아왔다, 방 = {nestName}', () => {
    const t = JSON.stringify(RECOVER_SCENES);
    expect(t).not.toContain('방으로 돌아가자');
    expect(t).not.toContain('"방에서');
    expect(RECOVER_SCENES.find((s) => s.id === 'spa-rest')!.body).toContain('{nestName}(으)로 돌아왔다');
  });
});

describe('13 피곤', () => {
  it('피곤 혼잣말은 재우기 요청처럼 들리지 않는다 (두 종족)', () => {
    for (const f of [H, S]) for (const l of f.room?.talk?.tired ?? []) expect(l).not.toMatch(/눈을 붙|쉬겠다|쉬어야/);
  });
  it('방 상태 창 피곤 줄 = 손해 + 풀리는 법', () => {
    const chips = statusChips({ hunger: 10, condition: 10, risk: 0, weakened: false, tired: true }, H);
    const g = (roomStatusInfo(chips, H) as { groups: { title: string; lines: string[] }[] }).groups.find((x) => x.title === chips.find((c) => c.kind === 'tired')!.label)!;
    expect(g.lines.some((l) => l.startsWith('풀리는 법'))).toBe(true);
  });
});

describe('15 빈사 남은 시간', () => {
  it('"5시간 59분", 1시간 미만이면 "59분"', () => {
    expect(dyingClock((5 * 60 + 59) * 60_000)).toBe('5시간 59분');
    expect(dyingClock(59 * 60_000)).toBe('59분');
  });
});

describe('17·19·22 표기', () => {
  it('얻은 특성 = 속성까지', () => {
    expect(traitNameWithElement('t-water-a', 'hollow')).toMatch(/^물 \S/);
  });
  it('특성 상점 카드 한 줄 = 효과 요약(카드마다 다름)', () => {
    const lines = DETACH_TRAITS.map((t) => shopBlurb({ id: traitItemId(t.id) }, H));
    expect(new Set(lines).size).toBe(lines.length);
    expect(lines.every((l) => l !== '끼우는 특성')).toBe(true);
  });
  it('장비 등급 노멀 = 속성 노멀과 같은 표기', () => {
    expect(GEAR_GRADE_NAMES.normal).toBe('노멀');
  });
});
