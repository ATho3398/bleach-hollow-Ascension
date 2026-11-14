// C.458 (GDD v6.084 8절·17-4, 사용자 2026-11-15): 수련장 보스·강적 처치 뒤 흡수 버튼(눌러도 결과만) 수리 · 상태 화면 능력치 칸 = 숫자 + 실제 값 + 상세(노력치 10당) ·
// 테스트 패널 능력치 = 능력치 ↔ 실제 값 양방향 · 적 설정 창 수치 = 내 기본 공격 n회 분량·공격 간격 초
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { shownAtStat, statForShown, statusStatDisplay, statusStatSteps } from '../src/home';
import { currentStats } from '../src/engine/evolution';
import { newTestSave } from '../src/engine/testMode';
import { BALANCE } from '../src/config/balance';

const NOW = Date.UTC(2026, 10, 15, 4);

describe('C.458 수련장 보스·강적 처치 → 흡수 없이 수련장 (사용자 2026-11-15 "수련장인데 흡수 버튼 뜨는 것도 수정")', () => {
  const app = readFileSync('src/ui/app.ts', 'utf8');
  const bv = readFileSync('src/ui/battleView.ts', 'utf8');
  it('승리 창 [포식하러 가기]는 absorb 를 켠 전투만 — 원인: 모든 승리에 떠서 수련장에서 눌러도 결과 화면만 나왔다', () => {
    expect(bv).toContain('const canAbsorb = opts.absorb === true && absorbReasons(s).length > 0;');
    // absorb: true 는 원정 전투(beginBattle) 한 곳만 — 수련장(runPractice)·탑·특수던전·등급전·테스트 전투는 '계속'
    expect(app.match(/absorb: true/g)?.length).toBe(1);
    const begin = app.slice(app.indexOf('function beginBattle'), app.indexOf('function beginBattle') + 4000);
    expect(begin).toContain('absorb: true');
    const practice = app.slice(app.indexOf('function runPractice'), app.indexOf('function practiceResult('));
    expect(practice).not.toContain('absorb');
    expect(practice).toContain('practiceResult(faction, enemy, done)'); // 이기면 수련장 결과 → [연습 메뉴로] = 수련장
  });
  it('수련장 결과 화면에 포식 줄·흡수 규칙 안내가 없다', () => {
    const pv = readFileSync('src/ui/practiceView.ts', 'utf8');
    expect(pv).not.toContain('연습에서는 쓰지 않음');
    expect(pv).not.toContain('absorbRuleText');
  });
});

describe('C.458 능력치 칸 = 숫자 + 실제 값 + 상세 보기 (GDD v6.081 8절)', () => {
  const s = newTestSave('hollow', NOW);
  it('상세 = 지금 값 기준 노력치 +10 의 실제 값 (체력 ↑, 공격 간격 ↓, 받는 피해 ↓)', () => {
    const now = statusStatDisplay(s);
    const hp = statusStatSteps(s, 'hp', [0, 10]);
    expect(hp[0]!.shown.value).toBeCloseTo(now.hp.value);
    expect(hp[1]!.shown.value).toBeGreaterThan(hp[0]!.shown.value);
    const as = statusStatSteps(s, 'aspd', [0, 10, 100]);
    expect(as[1]!.shown.value).toBeLessThanOrEqual(as[0]!.shown.value);
    expect(as[0]!.shown.value - as[1]!.shown.value).toBeGreaterThanOrEqual(0);
    const df = statusStatSteps(s, 'def', [0, 10]);
    expect(df[1]!.shown.value).toBeLessThan(df[0]!.shown.value);
  });
  it('화면: 칸에 능력치 숫자 + 실제 값(.bha-statrow__real), 칸을 누르면 상세(statStepLines)', () => {
    const nest = readFileSync('src/ui/bha/nest.ts', 'utf8');
    expect(nest).toContain("const row = statRow(statName(k, factionId), `${v}${capped}`);");
    expect(nest).toContain("'bha-statrow__real'");
    const lcd = readFileSync('src/ui/lcdScreens.ts', 'utf8');
    expect(lcd).toContain('cellTip(row as HTMLElement, statName(id, faction.id), () => statStepLines(save, id))');
    expect(lcd).toContain('노력치 10 더 넣으면');
  });
});

describe('C.458 테스트 패널 능력치 = 능력치 ↔ 실제 값', () => {
  const s = newTestSave('hollow', NOW);
  it('실제 값 → 능력치 → 실제 값 왕복 (체력·공격속도·방어)', () => {
    const cur = currentStats(s.evolution, s.factionId);
    for (const k of ['hp', 'aspd', 'def'] as const) {
      const real = shownAtStat(s, k, cur[k]).value;
      const back = statForShown(s, k, real);
      expect(Math.abs(back - cur[k])).toBeLessThanOrEqual(1);
    }
  });
  it('속도 상한: 0.3초·1초보다 빠르게는 못 간다 — 닿는 가장 작은 능력치(없으면 상한 999)', () => {
    const C = BALANCE.provisional.combat;
    for (const [k, cap] of [['aspd', C.attackSecondsMin], ['bspd', C.spawnSecondsMin]] as const) {
      const v = statForShown(s, k, cap);
      const at = shownAtStat(s, k, v).value;
      expect(at).toBeGreaterThanOrEqual(cap - 1e-9);
      if (at > cap + 0.005) expect(v).toBe(BALANCE.provisional.stats.statMax); // 이 몸은 999 로도 못 닿음 → 999
      else if (v > 0) expect(shownAtStat(s, k, v - 1).value).toBeGreaterThan(cap);
    }
  });
  it('패널: 원값 999 기준(0~999 칸) 대신 양방향 입력 + 프리셋 [이 단계 최대]·[속도 상한]', () => {
    const tp = readFileSync('src/ui/testModePanel.ts', 'utf8');
    expect(tp).not.toContain("aside: `0~${max}`");
    expect(tp).toContain("label: '이 단계 최대'");
    expect(tp).toContain("label: '속도 상한'");
    expect(tp).toContain('statForShown(save, k, Number(ri.value))');
  });
});
