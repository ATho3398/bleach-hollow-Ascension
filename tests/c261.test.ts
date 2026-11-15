// C.261 (GDD 178장): 전투 블록 생성 게이지 · 봉인 덮개 삭제 · 강조는 그림 모양대로
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getEnemy } from '../src/data/enemies';
import { createCombat, spawnGaugeOf, step, type CombatParams } from '../src/engine/combat/combat';

const quiet = (p: Partial<CombatParams> = {}) => createCombat(7, { enemy: getEnemy('test-a'), params: { voidChance: 0, timeLimitSeconds: 1e9, ...p } });
const css = (f: string) => readFileSync(new URL(`../src/ui/bha/${f}`, import.meta.url), 'utf8');

describe('블록 생성 게이지 = 엔진의 실제 생성 타이머 (178장 1)', () => {
  it('차오르다가 블록이 나오면 다시 0 부근으로', () => {
    const s = quiet();
    const a = spawnGaugeOf(s);
    expect(a.state).toBe('filling');
    let prev = a.fill;
    let reset = false;
    for (let i = 0; i < 400 && !reset; i++) {
      const n0 = s.tray.length;
      step(s);
      const g = spawnGaugeOf(s);
      if (s.tray.length > n0) { reset = g.fill < prev; break; }
      expect(g.fill).toBeGreaterThanOrEqual(prev);
      prev = g.fill;
    }
    expect(reset).toBe(true);
  });
  it('생성 간격은 보정이 다 든 값: 각성(전투 소모품) 중이면 그 배율만큼 짧다', () => {
    const haste = { id: 'battle-haste', effect: 'haste' as const, seconds: 5, spawnMult: 2 };
    const s = quiet({ battleItem: haste });
    const base = spawnGaugeOf(s).intervalSeconds;
    step(s, { type: 'item' });
    expect(s.hasteTicks).toBeGreaterThan(0);
    expect(spawnGaugeOf(s).intervalSeconds).toBeCloseTo(base / 2, 1); // C.446: 간격은 0.01초 반올림 뒤 값
    // 생성 속도 배율(장비·특성·피곤·빈사 등이 모이는 값)이 바뀌면 간격도 바로 바뀐다
    expect(spawnGaugeOf(quiet({ blockSpawnMultiplier: 2 })).intervalSeconds).toBeLessThan(base);
  });
  it('블록 바가 가득 = full(가득), 봉인 = sealed, 막기·경직 = paused', () => {
    const s = quiet();
    for (let i = 0; i < 5000 && s.tray.length < s.params.trayCapacity; i++) step(s);
    expect(spawnGaugeOf(s)).toMatchObject({ state: 'full', fill: 1 });
    const t = quiet();
    t.sealTicks = 30;
    expect(spawnGaugeOf(t).state).toBe('sealed');
    t.sealTicks = 0;
    t.stunTicks = 10;
    expect(spawnGaugeOf(t).state).toBe('paused');
  });
  it('엔진 규칙은 그대로: 게이지를 읽어도 상태가 바뀌지 않는다', () => {
    const a = quiet();
    const b = quiet();
    for (let i = 0; i < 300; i++) { spawnGaugeOf(a); step(a); step(b); }
    expect(a.tray.map((x) => x.uid)).toEqual(b.tray.map((x) => x.uid));
    expect(a.spawnTimer).toBe(b.spawnTimer);
  });
});

describe('봉인 덮개 삭제 (178장 2)', () => {
  it('v2 블록 바에 봉인 덮개가 없다', () => {
    expect(css('v2/bha.css')).not.toMatch(/\.bha-v2tray__veil\s*\{/);
    expect(readFileSync(new URL('../src/ui/bha/v2/battle.ts', import.meta.url), 'utf8')).not.toMatch(/bha-v2tray__veil/);
  });
  it('봉인 표시는 생성 게이지에만', () => {
    expect(css('v2/bha.css')).toMatch(/\.bha-v2role--spawn\[data-state=sealed\]/);
  });
});

describe('강조는 그림 모양대로 (178장 3)', () => {
  it('해방 오오라·해방 준비 = 몸 그림 drop-shadow, 그림 칸 타원 빛·고리 없음', () => {
    const all = css('battle-scene.css') + css('v2/bha.css');
    expect(all).not.toMatch(/is-(liberated|unique|lib-ready) \.bha-unit--me \.bha-unit__fig(::before|::after)?\s*\{/);
    expect(all).toMatch(/is-liberated \.bha-unit--me \.bha-hero__body \{ filter: drop-shadow/);
    // 해방 준비는 GDD 215장(C.353)에서 몸 테두리 빛 → 발밑에서 솟구치는 기운(.bha-libaura)으로 바뀜 (기기 초점과 구분)
    expect(all).toMatch(/is-lib-ready \.bha-unit--me \.bha-libaura \{ display: block; \}/);
    // 투명 해방 버튼(그림 칸 네모)은 눌림·초점 상자를 그리지 않는다
    expect(css('v2/bha.css')).toMatch(/\.bha-v2herolib\.bha-sel[^{]*\{outline:0;box-shadow:none;background:none\}/);
  });
  it('적: 몸 뒤 타원 빛·방어 자세 고리 대신 몸 윤곽', () => {
    const c = css('components/components.css');
    expect(c).toMatch(/\.bha-foe__aura \{ display: none; \}/);
    expect(c).not.toMatch(/is-guard \.bha-foe__body::after/);
    expect(c).toMatch(/is-casting \.bha-foe__body \{ filter: drop-shadow/);
  });
  it('꾸미기 오라: 캐릭터 뒤 타원(::before) 대신 그림 모양 drop-shadow', () => {
    const c = css('cosmetics.css');
    expect(c).not.toMatch(/data-cos-aura[^\n{]*::before/);
    expect(c).toMatch(/@keyframes bha-cos-aura \{ from \{ filter: var\(--cos-aura-pre, brightness\(1\)\) drop-shadow/);
  });
});
