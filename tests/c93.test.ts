// C.93 (GDD 41장 1번 QA 2차): 찾은 버그 고침 확인
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FACTIONS } from '../src/data/factions';
import { GLOSSARY, SCREEN_HELPS, TUTORIAL_SCENES, helpVars, renderHelpText } from '../src/data/help';
import { fixParticles } from '../src/engine/josa';
import { pinScroll, type PinnableBox } from '../src/ui/bha/viewport';

const DOUBLE = /이\(가\)|을\(를\)|은\(는\)|과\(와\)|\(으\)로/;

describe('C.93 #1 조사 두 가지 표기 → 받침에 맞게', () => {
  it('받침 있음·없음·ㄹ 받침', () => {
    expect(fixParticles('기술 블록이(가) 생겨요')).toBe('기술 블록이 생겨요');
    expect(fixParticles('호로화이(가) 올라가요')).toBe('호로화가 올라가요');
    expect(fixParticles('포식과(와) 놓아주기')).toBe('포식과 놓아주기');
    expect(fixParticles('정화과(와) 놓아주기')).toBe('정화와 놓아주기');
    expect(fixParticles('기술 블록(으)로 마무리')).toBe('기술 블록으로 마무리');
    expect(fixParticles('재우기(으)로 회복')).toBe('재우기로 회복');
    expect(fixParticles('대원실(으)로')).toBe('대원실로');
    expect(fixParticles('공허 블록은(는) 큰 피해')).toBe('공허 블록은 큰 피해');
  });
  it('숫자는 읽는 소리, 따옴표·대괄호 뒤도', () => {
    expect(fixParticles('혈 일반 1을(를) 쓰러뜨렸다')).toBe('혈 일반 1을 쓰러뜨렸다');
    expect(fixParticles('독 일반 2과(와) 조우!')).toBe('독 일반 2와 조우!');
    expect(fixParticles('체인3을(를) 3회')).toBe('체인3을 3회');
    expect(fixParticles('[저장 필살]은(는) 블록을')).toBe('[저장 필살]은 블록을');
    expect(fixParticles('‘물 교’을(를) 넣을 슬롯')).toBe('‘물 교’를 넣을 슬롯');
  });
  it('한글·숫자가 아니면 그대로', () => {
    expect(fixParticles('BOSS이(가) 나타났다')).toBe('BOSS이(가) 나타났다');
    expect(fixParticles('조건 없음')).toBe('조건 없음');
  });
  for (const f of Object.values(FACTIONS)) {
    it(`${f.id}: 튜토리얼·도움말·용어에 두 가지 표기 조사와 "공격(공격)" 이 남지 않는다`, () => {
      const vars = helpVars(f);
      const all = [...TUTORIAL_SCENES.flatMap((s) => [s.title, s.body]), ...GLOSSARY.flatMap((g) => [g.title, g.body]), ...SCREEN_HELPS.flatMap((s) => [s.title, s.body])];
      for (const t of all) {
        const out = renderHelpText(t, vars);
        expect(out, out).not.toMatch(DOUBLE);
        expect(out).not.toMatch(/([가-힣]+)\(\1\)/);
      }
    });
  }
});

describe('C.93 #2 기기 틀·LCD 는 밀리지 않는다', () => {
  it('scroll 이 생기면 0 으로 되돌린다', () => {
    let fn: (() => void) | null = null;
    const box: PinnableBox = {
      scrollTop: 0,
      scrollLeft: 0,
      scrollTo(x, y) { this.scrollLeft = x; this.scrollTop = y; },
      addEventListener(_t, f) { fn = f; },
    };
    pinScroll(box);
    box.scrollTop = 186;
    fn!();
    expect([box.scrollLeft, box.scrollTop]).toEqual([0, 0]);
  });
});

describe('C.93 #3 결과 요약 표: 짧은 줄끼리 짝지어 빈 반쪽이 없다', () => {
  it('2칸 격자는 dense 로 채운다', () => {
    const css = readFileSync(new URL('../src/ui/bha/screens-lcd.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.bha-resultpage \.bha-info \{[^}]*grid-auto-flow: row dense/);
  });
});

describe('C.93 #4 결과 표 반쪽 칸: 이름표는 한 줄, 긴 값이 줄을 바꾼다 (등급전 "보유자 J" 세로 깨짐)', () => {
  it('줄 격자 = 이름표 제 너비 + 값 남은 폭, 이름표 nowrap', () => {
    const css = readFileSync(new URL('../src/ui/bha/screens-lcd.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.bha-resultpage \.bha-info__row \{[^}]*grid-template-columns: auto minmax\(0, 1fr\)/);
    expect(css).toMatch(/\.bha-resultpage \.bha-info dt \{ white-space: nowrap; \}/);
  });
});

describe('C.93 #5 상태 화면 특성 줄: 성향이 비어도 진화체 속성 특성은 보인다', () => {
  it('formId 가 있고 ability 가 null 이면 속성 특성 줄만, 1단계는 null', async () => {
    const { newEvolution } = await import('../src/engine/evolution');
    const { statusAbilityLines } = await import('../src/ui/lcdScreens');
    const evo = { ...newEvolution(), tierIndex: 3, formId: 't3:water', formHistory: ['t2:base', 't3:normal', 't3:water'], ability: null };
    const lines = statusAbilityLines(evo, 'hollow')!;
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((l) => l.slot !== '성향')).toBe(true);
    expect(statusAbilityLines(newEvolution(), 'hollow')).toBeNull();
  });
});
