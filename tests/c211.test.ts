// C.211 (GDD 134장 1·2·3): 시작 구급상자 3개 · 튜토리얼 치명상 장면 → 빈사 설명 · 단계별 진화 이유 문구
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { FACTIONS } from '../src/data/factions';
import { RECOVER_SCENES } from '../src/data/help';
import { createExpedition, playExpedition } from '../src/engine/expedition';
import { parseFactionConfig } from '../src/engine/faction';
import { newSaveData, nextRunId, recordExpedition } from '../src/game';
import { enterSpa, newNest, passNestTime, soakSpa } from '../src/engine/nest';
import { statusInfo } from '../src/ui/bha/statusInfo';
import { recoverCure, recoverGrantBag, CURE_ITEM_ID } from '../src/recoverTutorial';
import hollowRaw from '../src/data/factions/hollow.json';

const START = BALANCE.provisional.startItems[CURE_ITEM_ID]!;

describe('134장 1: 새 세이브 = 가방에 구급상자 3개, 안내용 구급상자는 따로', () => {
  it('시작 수는 balance provisional 3개', () => {
    expect(START).toBe(3);
    for (const f of FACTIONS) expect(newSaveData(f.id, 1000).shared.items[CURE_ITEM_ID]).toBe(START);
  });
  it('튜토리얼 원정 → 회복 안내 구급상자 사용 뒤에도 3개 남는다', () => {
    for (const f of FACTIONS) {
      const save = newSaveData(f.id, 1000);
      const exp = createExpedition({
        factionId: f.id, seed: 5, runId: nextRunId(save), hunger: save.nest.hunger, condition: save.nest.condition, deck: [], risk: save.nest.risk, stability: save.nest.stability,
        build: save.build, evolution: save.evolution, tutorial: true,
      });
      playExpedition(exp, { returnAfterLap: 1, absorb: 'absorb' });
      recordExpedition(save, exp, 2000);
      expect(save.nest.collapsed).toBe(true);
      recoverGrantBag(save);
      expect(save.shared.items[CURE_ITEM_ID]).toBe(START + 1);
      expect(recoverCure(save, 3000)).toBe(true);
      recoverGrantBag(save); // 빈사가 풀린 뒤에는 더 넣지 않는다
      expect(save.shared.items[CURE_ITEM_ID]).toBe(START);
    }
  });
  it('진행 중 세이브(시작 구급상자 없음)에는 소급하지 않는다: 안내용 1개만', () => {
    const save = newSaveData('hollow', 1000);
    save.shared.items = {};
    save.nest.collapsed = true;
    recoverGrantBag(save);
    recoverGrantBag(save);
    expect(save.shared.items[CURE_ITEM_ID]).toBe(1);
  });
});

describe('134장 2: 튜토리얼 흡수 직후 치명상 카드 → 귀환 → 빈사 설명', () => {
  it('종족 설정 tutorialWound 1~2장, 치명상·위험 문구, 본문 2줄 이내', () => {
    for (const f of FACTIONS) {
      expect(f.tutorialWound.length).toBeGreaterThanOrEqual(1);
      expect(f.tutorialWound.length).toBeLessThanOrEqual(2);
      const all = f.tutorialWound.map((c) => c.body).join('\n');
      expect(all).toContain('치명상');
      expect(all).toContain('위험');
      for (const c of f.tutorialWound) expect(c.body.split('\n').length).toBeLessThanOrEqual(2);
    }
  });
  it('회복 안내 첫 카드 = 빈사 설명 2줄(사망·구급상자)', () => {
    const first = RECOVER_SCENES[0]!;
    expect(first.id).toBe('dying');
    expect(first.title).toBe('빈사');
    const lines = first.body.split('\n');
    expect(lines).toHaveLength(2);
    expect(first.body).toContain('사망');
    expect(first.body).toContain('구급상자');
  });
  it('흡수 → 원정 끝이면 치명상 장면을 거쳐 endExpedition (종족 분기 없음)', () => {
    const app = readFileSync('src/ui/app.ts', 'utf8');
    expect(app).toContain("if (exp.phase === 'ended' && exp.tutorial) {");
    expect(app).toMatch(/tutorialWoundView\(root, faction, art, hpFractionOf\(exp\), [^)]*\.hpFraction, \(\) => endExpedition\(faction, exp\)\)/);
    const view = readFileSync('src/ui/guideView.ts', 'utf8');
    expect(view).toContain('faction.tutorialWound');
    expect(view).not.toMatch(/'hollow'|'shinigami'/);
  });
});

describe('134장 3: 진화 이유 문구 (종족 설정)', () => {
  const sh = FACTIONS.find((f) => f.tierNames[1] === '영술원 학생')!;
  it('사신: 혼백 → 영술원 학생 = 진앙영술원 합격, 학생 → 다음 = 경쟁을 뚫고 정식 사신', () => {
    expect(sh.evolutionReasons[1]!.join(' ')).toMatch(/평범한 영혼.*뛰어난 능력.*진앙영술원에 합격/);
    expect(sh.evolutionReasons[2]!.join(' ')).toMatch(/진앙영술원의 치열한 경쟁을 뚫.*정식 사신/);
  });
  it('모든 종족·모든 진화 단계에 1~2줄, 문장마다 마침표, 1단계는 비어 있음', () => {
    for (const f of FACTIONS) {
      expect(f.evolutionReasons).toHaveLength(5);
      expect(f.evolutionReasons[0]).toEqual([]);
      for (let i = 1; i < 5; i++) {
        const r = f.evolutionReasons[i]!;
        expect(r.length).toBeGreaterThanOrEqual(1);
        expect(r.length).toBeLessThanOrEqual(2);
        for (const l of r) expect(l).toMatch(/다\.$/);
      }
    }
  });
  it('진화 화면은 도착 단계 이유를 읽는다(코드에 종족 분기 없음)', () => {
    const src = readFileSync('src/ui/evolutionPanel.ts', 'utf8');
    expect(src).toContain('faction.evolutionReasons[to]');
    expect(src).not.toMatch(/=== '(hollow|shinigami)'/);
  });
  it('잘못된 데이터는 거른다', () => {
    const bad = { ...hollowRaw, evolutionReasons: [[], ['a'], [], ['b'], ['c']] };
    expect(() => parseFactionConfig(bad)).toThrow(/evolutionReasons/);
    const bad2 = { ...hollowRaw, tutorialWound: [] };
    expect(() => parseFactionConfig(bad2)).toThrow(/tutorialWound/);
  });
});

describe('135장: 배부르면 컨디션이 저절로 참 · 온천 컨디션', () => {
  const CP = BALANCE.provisional.nest.care;
  const SP = BALANCE.provisional.nest.homeHp.tutorialSpa; // C.223: 1초 +10 은 튜토리얼 온천만 (GDD 145장 1)
  const nestAt = (fullness: number, condition: number) => {
    const n = newNest(0);
    n.hunger = 100 - fullness;
    n.condition = condition;
    return n;
  };
  it('1 홈 대기: 컨디션은 저절로 안 찬다 (GDD 135장 수정 v5.315) — 30 초과는 그대로, 30 이하는 −4', () => {
    expect(CP).not.toHaveProperty('conditionRegenAtFullness');
    expect(CP).not.toHaveProperty('conditionRegenPerHour');
    const hi = nestAt(100, 50);
    passNestTime(hi, 1, false, 3_600_000);
    expect(hi.condition).toBeCloseTo(50, 6);
    const mid = nestAt(60, 50);
    passNestTime(mid, 1, true, 3_600_000);
    expect(mid.condition).toBeCloseTo(50, 6);
    const lo = nestAt(20, 50);
    passNestTime(lo, 1, false, 3_600_000);
    expect(lo.condition).toBeCloseTo(46, 6);
    const off = nestAt(100, 99);
    passNestTime(off, 2, true, 7_200_000);
    expect(off.condition).toBeCloseTo(99, 6);
  });
  it('2 온천: 1초에 컨디션 +10 (C.214 139장 2), 체력이 가득이어도 컨디션이 덜 차면 안 나온다 · 둘 다 가득이면 못 들어간다', () => {
    expect(SP.conditionPerSecond).toBe(10);
    const n = nestAt(100, 40);
    n.hpFraction = 0.95;
    expect(enterSpa(n, 0, true)).toBeNull();
    const r = soakSpa(n, 5 / 60, 0); // 체력은 0.5초면 가득, 컨디션은 5초 → +50
    expect(r.ended).toBeNull();
    expect(n.condition).toBeCloseTo(90, 6);
    expect(n.hpFraction).toBe(1);
    const r2 = soakSpa(n, 20, 300_000);
    expect(r2.ended?.reason).toBe('full');
    expect(n.condition).toBe(100);
    expect(n.spa).toBeNull();
    expect(enterSpa(n, 0)).toBe('full');
    n.condition = 80;
    n.hunger = 0;
    expect(enterSpa(n, 0)).toBeNull(); // 체력 가득이어도 컨디션이 덜 차면 들어간다
  });
  it('2 온천 시간은 온천 규칙만 (1초에 +10)', () => {
    const n = nestAt(100, 50);
    n.hpFraction = 0.5;
    enterSpa(n, 0, true);
    passNestTime(n, 3 / 3600, false, 3_000); // 온천 3초: 컨디션 +30, 체력 +30%
    expect(n.spa).not.toBeNull();
    expect(n.condition).toBeCloseTo(80, 6);
    expect(n.hpFraction).toBeCloseTo(0.8, 6);
  });
  it('3 컨디션 ⓘ·온천 ⓘ 에 온천 회복 문구, 배부름 홈 대기 회복 문구는 없음 (수정 v5.315)', () => {
    for (const f of FACTIONS) {
      const cond = statusInfo('cond', f).groups.flatMap((g) => g.lines).join('\n');
      expect(cond).not.toContain('쉬는 동안');
      expect(cond).not.toContain('70 이상');
      expect(cond).toMatch(/1분에 \+20/); // 평소 온천 (C.223, GDD 145장 1)
      const hunger = statusInfo('hunger', f).groups.flatMap((g) => g.lines).join('\n');
      expect(hunger).not.toContain('쉬는 동안');
      expect(hunger).not.toContain('컨디션이 시간당 +');
    }
    expect(readFileSync('src/ui/spaView.ts', 'utf8')).toContain('컨디션 +${fmt(r.conditionPerSecond * k)}');
  });
});
