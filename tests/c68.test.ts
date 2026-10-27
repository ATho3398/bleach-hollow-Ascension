// C.68 (Q-4): 전체 플레이 QA 에서 찾은 버그 회귀 테스트
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getFaction } from '../src/data/factions';
import { advance, chooseRelease, createExpedition, finishBattle, finishRest, startBattle, summarize, type ExpeditionState } from '../src/engine/expedition';
import { step } from '../src/engine/combat';
import { newSaveData, sanitizeDeck } from '../src/game';
import { applyExpeditionEnd, expeditionEndVitals, newNest } from '../src/engine/nest';
import { toward } from '../src/ui/bha/nestLogic';
import { hpNumbers } from '../src/ui/bha/battle';
import { rankLoseLine, rankStakeText } from '../src/ui/rankView';
import { gameRuleLines, signedText } from '../src/ui/trainingView';
import { PATCH_LABEL, STAGE_LABEL } from '../src/version';

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const NX = BALANCE.provisional.nest;
const DECK = ['prey-nest-a', 'prey-nest-a', 'elite-den-a', 'env-fog', 'rest-a', 'prey-nest-b', 'env-ruin', 'elite-den-b'];

function toBattle(exp: ExpeditionState): void {
  for (let i = 0; i < 200 && exp.phase !== 'battle'; i++) {
    if (exp.phase === 'moving') advance(exp);
    else if (exp.phase === 'rest') finishRest(exp);
    else break;
  }
}
function loseBattle(exp: ExpeditionState): void {
  const b = startBattle(exp);
  b.player.hp = 0;
  b.status = 'lost';
  b.lossReason = 'hp';
  finishBattle(exp, b);
}

describe('버전 (C.68)', () => {
  it('패치 번호 C.68 이상 (단계는 Q-4 였고 C.75 부터 S-20 — 뒤 패치가 올린다)', () => {
    expect(Number(PATCH_LABEL.slice(2))).toBeGreaterThanOrEqual(68);
    expect(STAGE_LABEL).toMatch(/^(Q-4|S-\d+)/);
  });
});

describe('결과 화면 버튼 조사 (둥지으로 → 둥지로)', () => {
  it('받침 없는 둥지·ㄹ 받침은 "로", 그 밖의 받침은 "으로"', () => {
    expect(toward(getFaction('hollow').nestName)).toBe('둥지로');
    expect(toward(getFaction('shinigami').nestName)).toBe('대원실로');
    expect(toward(getFaction('hollow').rankBattleName)).toBe('번호 쟁탈전으로');
    expect(toward(getFaction('shinigami').rankBattleName)).toBe('석차 도전으로');
  });
  it('결과·등급전 화면이 이름 뒤에 "으로"를 그대로 붙이지 않는다', () => {
    expect(src('src/ui/resultView.ts')).not.toMatch(/nestName\}으로/);
    expect(src('src/ui/rankView.ts')).not.toMatch(/rankBattleName\}으로/);
  });
});

describe('패배 결과 화면의 남은 배부름·컨디션 = 둥지에 돌아간 값', () => {
  it('패배하면 결과 표시값이 컨디션 급락·허기 가산 뒤의 값이고 둥지 갱신과 같다', () => {
    const e = createExpedition({ factionId: 'hollow', seed: 3, hunger: 5, condition: 72, deck: DECK });
    toBattle(e);
    loseBattle(e);
    expect(summarize(e).outcome).toBe('defeated');
    const v = expeditionEndVitals(e);
    expect(v.condition).toBe(Math.min(e.condition, NX.defeatCondition));
    expect(v.hunger).toBe(Math.min(100, e.hunger + NX.defeatHunger));
    const n = newNest(0);
    applyExpeditionEnd(n, e, 1);
    expect(n.condition).toBe(v.condition);
    expect(n.hunger).toBe(v.hunger);
    expect(n.collapsed).toBe(true); // C.175: 패배 = 쓰러짐 (GDD 102-3)
  });
  it('결과 화면은 원정 끝 값(exp.condition) 대신 expeditionEndVitals 를 표시한다', () => {
    const s = src('src/ui/resultView.ts');
    expect(s).toContain('expeditionEndVitals(exp)');
    expect(s).not.toMatch(/val\(`\$\{Math\.round\(exp\.condition\)\}`\)/);
  });
});

describe('스토리 목표를 바퀴 도중에 이루면 도달 바퀴 = 지금 바퀴 (0 이 아님)', () => {
  it('1장 1화(일반 적 3마리)를 1바퀴 안에 깨면 결과·런 로그의 바퀴가 1', () => {
    const save = newSaveData('hollow', 1);
    const e: ExpeditionState = createExpedition({ factionId: 'hollow', seed: 11, hunger: 20, condition: 80, deck: sanitizeDeck(save.tiles, 'hollow'), build: save.build, evolution: save.evolution, tileVariants: true, story: { chapterId: 'ch1', episodeId: 'ep1' } });
    const phase = (): string => e.phase;
    for (let k = 0; k < 3 && phase() !== 'ended'; k++) {
      for (let g = 0; g < 200 && phase() !== 'battle' && phase() !== 'ended'; g++) {
        if (e.phase === 'moving') advance(e);
        else if (e.phase === 'rest') finishRest(e);
        else if (e.phase === 'absorb') chooseRelease(e);
      }
      const b = startBattle(e);
      b.enemy.hp = 1e-9;
      for (let i = 0; i < 400 && b.status === 'playing'; i++) step(b);
      finishBattle(e, b);
      if (phase() === 'absorb') chooseRelease(e);
    }
    expect(e.endReason).toBe('story-clear');
    expect(e.lapsCompleted).toBe(0);
    expect(e.lap).toBe(1);
    expect(summarize(e).laps).toBe(1);
  });
});

describe('체력 표시: 남은 값이 최대를 넘지 않는다 (4107 / 4106)', () => {
  it('최대 체력이 소수면 남은·최대 모두 올림', () => {
    expect(hpNumbers(4106.4, 4106.4)).toEqual({ now: 4107, max: 4107 });
    expect(hpNumbers(0.2, 4106.4)).toEqual({ now: 1, max: 4107 });
    expect(hpNumbers(0, 154)).toEqual({ now: 0, max: 154 });
    expect(hpNumbers(154, 154)).toEqual({ now: 154, max: 154 });
  });
  it('전투 화면이 최대 체력을 Math.round 로 따로 반올림하지 않는다', () => {
    expect(src('src/ui/battleView.ts')).not.toMatch(/max: Math\.round\(s\.(enemy|player)\.maxHp\)/);
  });
});

describe('등급전: 무번호에서 지면 그대로 (번호가 한 칸 내려갔다 X)', () => {
  it('호로·사신 문구 모두 종족 설정의 무번호 이름을 쓴다', () => {
    const h = getFaction('hollow');
    const s = getFaction('shinigami');
    expect(rankLoseLine(h, { before: null, after: null })).toBe('패배… 무번호 그대로다.');
    expect(rankLoseLine(s, { before: null, after: null })).toBe('패배… 무석 그대로다.');
    expect(rankLoseLine(h, { before: 9, after: 10 })).toBe(h.rankLoseText);
    expect(rankStakeText(h, '에스파다 No.10', null)).toContain('지면 무번호 그대로다.');
    expect(rankStakeText(h, '에스파다 No.9', 10)).toContain('지면 한 칸 내려간다.');
  });
});

describe('수련 미니게임', () => {
  it('비용 줄의 컨디션도 배부름과 같은 − 기호 (하이픈 -10 아님)', () => {
    expect(signedText('컨디션', -10)).toBe('컨디션 −10');
    expect(signedText('컨디션', 5)).toBe('컨디션 +5');
    const line = gameRuleLines(getFaction('hollow'), 'hollow', 'duel').cost;
    expect(line).toContain('컨디션 −');
    expect(line).not.toMatch(/컨디션 -\d/);
  });
  it('"준비…" 동안의 입력은 버리고, 끝나면 조작 버튼을 꺼 [결과 보기] 만 남긴다', () => {
    const s = src('src/ui/trainingView.ts');
    expect(s).toMatch(/if \(s\.status === 'playing' && started\) queue\.push\(inp\)/);
    expect(s).toMatch(/for \(const b of app\.querySelectorAll\('button'\)\) b\.disabled = true;/);
  });
});

describe('등급전 도전 버튼 이름 겹침 (석차 도전 도전)', () => {
  it('버튼은 종족 등급전 이름 뒤에 "도전"을 붙이지 않는다 (사신 이름이 이미 "석차 도전")', () => {
    expect(getFaction('shinigami').rankBattleName.endsWith('도전')).toBe(true);
    expect(src('src/ui/rankView.ts')).not.toMatch(/rankBattleName\} 도전/);
    expect(src('src/ui/rankView.ts')).toContain('에 도전`');
  });
});

// 해방 잠김 문구(liberationButton)는 C.134 에 삭제 — 해금 조건 폐기 (GDD 83장)
describe('수련 화면에 호로 낱말 "번호" 가 섞이지 않는다', () => {
  it('수련 안내', () => {
    expect(src('src/ui/trainingView.ts')).not.toMatch(/번호를 한 번/);
  });
});
