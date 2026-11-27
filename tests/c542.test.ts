// C.542 (GDD 8-9 v6.205, 사용자 2026-11-26 "그 훈련인형도 특수던전마냥, 왼쪽에 리스트로 훈련인형, 무슨훈련? 그거 리스트로 띄우고, 오른쪽에 그림이랑 설면 넣고 시작 누르게 바꿔라"):
// 방 수련장 → 특수던전식 목록 화면(왼쪽 훈련 인형·수련, 오른쪽 그림·이름·설명·[시작]). 훈련 인형 [시작] = 전투 + 적 설정 창, 수련 [시작] = 수련 화면.
// 뒤로·그만두기(v6.194 C.534)는 그대로, 설정 창 [나가기] = 목록, 목록 뒤로 = 방.
// C.561(GDD 8-9 v6.242): 목록 화면은 카드 3장(본능 수련·아란칼화·훈련 인형) + 본능 수련 종목 목록으로 대체 — 아래 기대값은 바뀐 화면에 맞춰 고치고 옛 값은 주석으로 남긴다
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getFaction } from '../src/data/factions';
import { ScreenStack } from '../src/ui/bha/select';
import { hallArt, trainingHallCards } from '../src/ui/trainingHallView';
import { trainingLockedText } from '../src/ui/trainingView';

const read = (p: string) => readFileSync(p, 'utf8');
const app = read('src/ui/app.ts');
const hall = read('src/ui/trainingHallView.ts');
const st = (trainLocked: boolean) => ({ altarName: '수련장', trainLocked, points: 12, pointsMax: 60, practiceCount: 3, ascend: trainLocked ? 'tier' as const : 'open' as const });
const noop = { onPractice: () => undefined, onTrain: () => undefined, onAscend: () => undefined };

describe('수련장 진입 = 목록 화면 (훈련 인형 골라짐)', () => {
  it('방 수련장 물건 → 목록 화면(곧장 전투로 가지 않음), 들어올 때 고른 항목 = 훈련 인형', () => {
    // 옛 값: "... askDying(s, () => { resetTrainingHallPick(); open('practice', ...); }); }," (훈련 인형 골라짐) — C.561 카드 화면은 고른 항목 없음
    expect(app).toContain("onTraining: () => { if (careBlocked(s)) return; askDying(s, () => open('practice', () => practiceScreen(faction))); },");
    const body = app.slice(app.indexOf('function practiceScreen('), app.indexOf('function practiceArena('));
    expect(body).toContain('trainingHallView(root, faction, {');
    expect(body).not.toContain('practiceArena(faction); }'); // 들어오자마자 전투를 열지 않는다
    // 옛 값: expect(hall).toContain("const pick: { id: TrainingScreenId } = { id: 'practice' };") + resetTrainingHallPick()
    expect(hall).toContain("app.dataset.screen = 'training-hall';");
  });
  it('목록 = 훈련 인형 → 수련 순, 이름은 데이터(적 테이블 훈련 인형 · 종족 설정 training.title)', () => {
    for (const fid of ['hollow', 'shinigami']) {
      const f = getFaction(fid);
      // 옛 값(C.542): ['practice', 'train'] 목록 — C.561: 카드 본능 수련 · 아란칼화 · 훈련 인형
      const items = trainingHallCards(f, st(false), noop);
      expect(items.map((x) => x.id)).toEqual(['train', 'ascend', 'practice']);
      expect(items[2]!.name).toBe('훈련 인형');
      expect(items[0]!.name).toBe(f.training.title);
      expect(items[1]!.name).toBe(f.ascension.name);
      expect(items[2]!.line).toBe(f.training.hall!.practiceDesc);
      expect(items[0]!.line).toBe(f.training.hall!.trainDesc);
      expect(items[0]!.sub).toBe('수련치 12/60');
    }
    expect(getFaction('hollow').training.title).toBe('본능 수련');
    expect(getFaction('shinigami').training.title).toBe('참백도 수련');
  });
  it('설명 1~2줄·개발자 말 없음, 그림 없는 항목 = 방 수련장 물건 그림', () => {
    for (const fid of ['hollow', 'shinigami']) {
      const H = getFaction(fid).training.hall!;
      for (const d of [H.practiceDesc, H.trainDesc]) {
        expect(d.length).toBeLessThan(60);
        expect(d).not.toMatch(/provisional|임시|C\.\d|GDD/);
      }
    }
    expect(hallArt('practice')).toMatch(/prop-altar\.webp$/);
    expect(hallArt('train')).toMatch(/prop-altar\.webp$/);
  });
  it('특수던전 화면 틀(bha-sdg)·컴포넌트 재사용, 종족 분기 없음', () => {
    // 옛 값: 수련장 목록 = trainingHallView 의 bha-sdg 틀 — C.561: 본능 수련 종목 목록(trainingView)이 같은 틀을 쓴다
    const list = read('src/ui/trainingView.ts');
    for (const c of ['bha-sdg__list', 'bha-sdg__item', 'bha-sdg__stage', 'bha-sdg__art', 'bha-sdg__lock', 'bha-sdg__go', 'enableDragScrollY(list)']) expect(list).toContain(c);
    expect(hall).not.toMatch(/'hollow'|'shinigami'/);
    const css = read('src/ui/bha/story.css');
    const mine = css.slice(css.indexOf('.bha-thall__cards'));
    expect(mine).not.toMatch(/#[0-9a-f]{3,6}\b|rgba?\(/i); // 새 색 없음
  });
});

describe('4단계 전 수련 잠김', () => {
  it('잠긴 수련 = 자물쇠·흐린 글자, 고르면 오른쪽에 여는 조건 + [시작] 흐리게', () => {
    const f = getFaction('hollow');
    const [train, ascend, dummy] = trainingHallCards(f, st(true), noop);
    expect(dummy!.open).toBe(true);
    expect(train!.open).toBe(false);
    expect(ascend!.open).toBe(false);
    // 옛 값: train.sub '잠김' + 목록 행 자물쇠 — C.561: 카드 그림 위 자물쇠 + 조건 한 줄, 카드는 눌리지 않음
    expect(train!.lockText).toBe(trainingLockedText(f));
    expect(train!.lockText).toBe('바스트로데가 되면 본능 수련이 열린다.');
    expect(ascend!.lockText).toBe('바스트로데가 되면 아란칼화가 열린다.');
    expect(hall).toContain("`bha-thall__card${c.open ? '' : ' is-locked'}");
    expect(hall).toContain("b.disabled = !c.open;");
    expect(app).toContain('onTrain: () => { if (!trainLocked(s) && !careBlocked(s)) open(\'training\', () => renderTraining(faction, s)); },');
  });
  it('기기 ✓: 고른 행을 한 번 더 = 하이라이트를 [시작]으로 (잠긴 항목은 그대로)', () => {
    // 옛 값: 수련장 목록(trainingHallView) — C.561: 본능 수련 종목 목록(trainingView)이 같은 규칙
    expect(read('src/ui/trainingView.ts')).toContain("if (go && !go.disabled) go.dispatchEvent(new CustomEvent('bha-goto', { bubbles: true }));");
  });
});

describe('훈련 인형 [시작] = 설정 창, 뒤로·나가기', () => {
  it('훈련 인형 [시작] = 기존 적 설정 창 전투(practiceArena), 그만두기·뒤로 규칙(C.534) 그대로', () => {
    expect(app).toContain('onPractice: () => practiceArena(faction),');
    const arena = app.slice(app.indexOf('function arenaBattle('), app.indexOf('function practiceScreen('));
    expect(arena).toContain('onExit: () => nav.pop()'); // 설정 창 [나가기] = 밑의 목록 화면
    expect(arena).toContain('...(run.practice ? { onBack: leaveHome } : {})'); // 설정 창 뒤로 = 방
    expect(arena).toContain('if (run.practice) round(null); else nav.pop();'); // [그만두기] = 설정 창
  });
  it('화면 스택: 방 → 목록 → [시작] 전투 → [나가기] = 목록, 목록 뒤로 = 방, 설정 창 뒤로 = 방', () => {
    const drawn: string[] = [];
    const nav = new ScreenStack();
    const screen = (id: string, locked = false, home = false) => ({ id, locked, home, render: () => { drawn.push(id); } });
    nav.reset(screen('room', false, true));
    nav.push(screen('practice')); // 수련장 목록
    expect(drawn.at(-1)).toBe('practice');
    nav.push(screen('practice-battle', true)); // 훈련 인형 [시작]
    nav.pop(); // 설정 창 [나가기]
    expect(drawn.at(-1)).toBe('practice');
    nav.cancel(); // 목록 뒤로
    expect(drawn.at(-1)).toBe('room');
    nav.push(screen('practice'));
    nav.push(screen('practice-battle', true));
    expect(nav.popToHome()).toBe(true); // 설정 창 뒤로 = leaveHome
    expect(drawn.at(-1)).toBe('room');
  });
  it('수련 [시작] = 수련 화면(위에 쌓임 — 뒤로 = 목록), 수련 화면 머리 = 수련 이름(토글 없음)', () => {
    // 옛 값: 'title: faction.training.title,'(lcdHead) — C.561: 종목 목록 화면 머리 h2
    expect(read('src/ui/trainingView.ts')).toContain("el('h2', 'bha-plan__title', faction.training.title)");
    expect(read('src/ui/trainingView.ts')).not.toContain('viewTitle(');
    expect(app).not.toContain('switchTraining(');
  });
  it('테스트 모드 전투(testModeArena)·다른 화면 토글은 안 바뀜', () => {
    expect(read('src/ui/bookView.ts')).toContain('viewTitle(');
    const arena = app.slice(app.indexOf('function arenaBattle('), app.indexOf('function practiceScreen('));
    expect(arena).toContain('onQuit: () => { closeDialog?.(); if (run.practice) round(null); else nav.pop(); }');
  });
});
