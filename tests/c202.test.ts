// C.202 (GDD 128장 2·3·4·7·9): 조우 연출(적이 앞쪽에서 다가옴) · 휴식 칸 장소 · 잠긴 화면 뒤로 · 흡수 [내 상태] · 타일 칸 비율
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ART_MANIFEST } from '../src/data/art/manifest';
import { ENCOUNTER_DELAY_MS, ENCOUNTER_WATCHDOG_MS } from '../src/ui/bha/expedition';
import { AHEAD_APPROACH_MS, foeAheadKind, placeArtKeys, placeArtOf } from '../src/ui/bha/walkAhead';
import { onScreenBack } from '../src/ui/bha/screenBack';
import { runCancelHooks } from '../src/ui/bha/shortcuts';
import { leanRows } from '../src/ui/absorbStatus';
import { ScreenStack } from '../src/ui/bha/select';

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('조우 연출 (128장 2)', () => {
  it('보스 > 강적 > 일반 순으로 앞쪽 모양을 고른다', () => {
    expect(foeAheadKind({ boss: 'sand-maw', elite: true })).toBe('boss');
    expect(foeAheadKind({ boss: null, elite: true })).toBe('elite');
    expect(foeAheadKind({ elite: false })).toBe('foe');
  });
  it('적이 다 다가온 뒤에 전투가 열리고, 감시 타이머보다 짧다', () => {
    expect(ENCOUNTER_DELAY_MS).toBeGreaterThan(AHEAD_APPROACH_MS);
    expect(ENCOUNTER_DELAY_MS).toBeLessThan(ENCOUNTER_WATCHDOG_MS);
  });
  it('원정 화면이 조우·휴식 때 앞쪽을 세우고, 다가오는 동안 걷기를 이어 간다', () => {
    const v = src('src/ui/expeditionView.ts');
    expect(v).toMatch(/ahead\.foe\(/);
    expect(v).toMatch(/ahead\.place\(/);
    expect(v).toMatch(/ahead\.leave\(\)/);
    expect(v).toMatch(/approaching && !paused/);
    // 회복 빛은 장소에 닿은 뒤에만
    expect(v).toMatch(/healFx\.hidden = exp\.phase !== 'rest' \|\| !restArrived/);
  });
});

describe('휴식 칸 장소 그림 (128장 3)', () => {
  it('그림 키 = place.<타일>.<종족> → place.<타일>, 두 종족 휴식 타일 자리가 비어 있다(사용자 그림 대기)', () => {
    expect(placeArtKeys('rest-a', 'hollow')).toEqual(['place.rest-a.hollow', 'place.rest-a']);
    for (const f of ['hollow', 'shinigami']) for (const t of ['rest-a', 'rest-spring']) {
      expect(ART_MANIFEST[`place.${t}.${f}`]).toEqual({});
      expect(placeArtOf(t, f)).toBeNull(); // 파일이 없으면 임시 그림
    }
  });
});

describe('잠긴 화면 뒤로 (128장 4)', () => {
  it('화면 처리기: 화면을 떠나면 지워지고, 레이어가 열려 있거나 다른 화면이 덮으면 건드리지 않는다', () => {
    let alive = true;
    let mine = true;
    let ran = 0;
    const off = onScreenBack({ alive: () => alive, mine: () => mine, run: () => { ran++; } });
    expect(runCancelHooks(null, true)).toBe(true);
    expect(ran).toBe(1);
    expect(runCancelHooks({} as Element, true)).toBe(false); // 창이 열려 있으면 창이 먼저
    mine = false;
    expect(runCancelHooks(null, true)).toBe(false);
    mine = true;
    alive = false;
    expect(runCancelHooks(null, true)).toBe(false);
    alive = true;
    expect(runCancelHooks(null, true)).toBe(false); // 'gone' 으로 이미 지워졌다
    expect(ran).toBe(1);
    off();
  });
  it('run 이 false 면 처리 안 한 것', () => {
    const off = onScreenBack({ alive: () => true, run: () => false });
    expect(runCancelHooks(null, true)).toBe(false);
    off();
  });
  it('잠긴 화면은 스택 뒤로가 none 이어도 앱이 lockedBack 으로 이어 받고, 뒤로 버튼은 늘 켜져 있다', () => {
    const nav = new ScreenStack();
    nav.reset({ id: 'expedition', locked: true, render: () => undefined });
    expect(nav.cancel()).toBe('none');
    const app = src('src/ui/app.ts');
    expect(app).toMatch(/if \(r !== 'none'\) return true;\s*lockedBack\(\);/);
    expect(app).toMatch(/canCancel: \(\) => true/);
    expect(app).toMatch(/\[data-back\]/);
  });
  it('흡수 화면: 2·3단계는 한 단계 앞으로, 첫 단계는 넘어가기 확인(기본 아니오)', () => {
    const v = src('src/ui/absorbView.ts');
    expect(v).toMatch(/onScreenBack\(/);
    expect(v).toMatch(/if \(step === 'replace'\) step = 'pick';\s*else if \(step === 'pick'\) step = 'choose';/);
    expect(v).toMatch(/안 하고 넘어가기`[\s\S]{0,200}focusNo: true/);
  });
  it('원정 걷기: 바퀴 끝 창 = 귀환 확인(기본 아니오) · 이벤트 = 지나가기 · 걷기 = 일시정지', () => {
    const v = src('src/ui/expeditionView.ts');
    expect(v).toMatch(/title: '지금 귀환', body: '지금 돌아가면[\s\S]{0,120}focusNo: true/);
    expect(v).toMatch(/else pauseBtn\.click\(\);/);
  });
  it('결과·연출·수련·탑·연습·등급전 결과의 [확인]류 버튼에 뒤로 표시가 있다', () => {
    for (const f of ['resultView', 'breakthroughView', 'rebirthView', 'hogyokuView', 'evolutionPanel', 'trainingView', 'towerView', 'practiceView', 'rankView']) {
      expect(src(`src/ui/${f}.ts`), f).toMatch(/asBack\(button\(/);
    }
  });
  it('ui-audit 에 뒤로 반응 검사가 있다', () => {
    expect(src('scripts/ui-audit/audit.cjs')).toMatch(/뒤로 무반응/);
    expect(src('scripts/ui-audit/screens.cjs')).toMatch(/backReacts\(/);
  });
});

describe('흡수 [내 상태] 진화 쏠림 (128장 7)', () => {
  it('막대 비율·순위만 — 가장 쏠린 속성이 맨 위, 같은 개수는 같은 순위', () => {
    const rows = leanRows({ fire: 2, bolt: 1, ice: 2, normal: 0 }, 'ice');
    expect(rows.map((r) => r.element)).toEqual(['ice', 'fire', 'bolt']);
    expect(rows.map((r) => r.rank)).toEqual([1, 1, 3]);
    expect(rows[0]!.top).toBe(true);
    expect(rows[2]!.ratio).toBeCloseTo(0.5);
    expect(leanRows({}, 'normal')).toEqual([]);
  });
});

describe('타일 칸 비율 (128장 9)', () => {
  it('바퀴 끝 창 길 칸 = 세로 카드꼴, 드래프트·손 카드 = 한 줄 가로 밀기', () => {
    const css = src('src/ui/bha/expedition.css');
    expect(css).toMatch(/\.bha-sheet \.bha-road__cell, \.bha-lcd \.bha-plan \.bha-road__cell \{ flex: 0 0 60px; min-height: 0; height: 80px;/);
    expect(css).not.toMatch(/flex: 0 0 72px; min-height: 48px/);
    // 드래프트 카드는 C.218 (GDD 140장 2) 부터 같은 너비·높이 격자 (가로 밀기 대체) — tests/c218.test.ts
    expect(css).toMatch(/\.bha-draft__row \{ display: grid; grid-template-columns: minmax\(0, 1fr\); grid-auto-rows: 1fr;/);
    expect(css).toMatch(/\.bha-sheet \.bha-road__hand \{ flex-wrap: nowrap; overflow-x: auto/);
  });
});
