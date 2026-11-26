// C.539 (GDD 13-1·15-8 v6.204, 픽셀FX 담당): 탄생·진화 연출 도트판 — 종족 설정만 다르고 엔진은 같다.
// 사용자 2026-11-23 "그 캐릭첨 시작할 때, 사신 호로 애니메이션 있잖아. 그거 픽셀fx 기반으로 다시 만들어줄래?"
// 사용자 2026-11-25 "진화 연출은 기존 진화체였다가 이펙트 나오고 임팩트 나오는 타이밍 맞춰서 다음 진화체 모델이 나오게"
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { parseFactionConfig } from '../src/engine/faction';
import hollow from '../src/data/factions/hollow.json';
import shinigami from '../src/data/factions/shinigami.json';
import { PATCH_LABEL } from '../src/version';

const sheet = (name: string) => JSON.parse(readFileSync(`public/fx/${name}.json`, 'utf8')) as { frame: [number, number]; pivot: [number, number]; durations: number[]; loop: boolean };
const total = (s: { durations: number[] }) => s.durations.reduce((a, b) => a + b, 0);

describe('C.539 탄생·진화 연출 도트판', () => {
  it('두 종족 설정이 검사를 통과하고 시트가 public/fx 에 있다', () => {
    for (const raw of [hollow, shinigami]) {
      const f = parseFactionConfig(raw);
      expect(f.birthFx?.pixel).toBeTruthy();
      expect(f.evolveFx).toBeTruthy();
      for (const n of [f.birthFx!.pixel!.fx, f.evolveFx!.fx]) {
        expect(existsSync(`public/fx/${n}.png`)).toBe(true);
        const s = sheet(n);
        expect(s.loop).toBe(false);
        expect(s.frame).toEqual([212, 98]); // 화면 한 장(844×390 비율)
      }
    }
  });
  it('캐릭터 등장·진화체 교체 시각이 시트 안에 있다 (임팩트에 맞춰 바뀜)', () => {
    for (const raw of [hollow, shinigami]) {
      const f = parseFactionConfig(raw);
      const b = f.birthFx!.pixel!, e = f.evolveFx!;
      expect(b.revealMs).toBeLessThan(total(sheet(b.fx)));
      expect(e.swapMs).toBeLessThan(total(sheet(e.fx)));
      if (e.whiten) expect(e.whiten[0]).toBeLessThan(e.whiten[1]);
      if (e.whiten) expect(e.whiten[1]).toBeLessThanOrEqual(e.swapMs);
    }
    expect(hollow.evolveFx.swapMs).toBe(2900); // 호로 = 펑
    expect(shinigami.evolveFx.swapMs).toBe(2600); // 사신 = 반짝
  });
  it('호로 탄생은 시트가 화면을 직접 칠하고 걷는다(self), 사신은 연출 층 위 + 끝 페이드', () => {
    expect(hollow.birthFx.pixel).toMatchObject({ screen: 'self' });
    expect(shinigami.birthFx.pixel).toMatchObject({ screen: 'layer', fadeOutMs: 500 });
  });
  it('잘못된 설정은 막는다', () => {
    const bad = { ...hollow, evolveFx: { fx: 'x', swapMs: -1 } };
    expect(() => parseFactionConfig(bad)).toThrow(/evolveFx/);
    const bad2 = { ...hollow, birthFx: { ...hollow.birthFx, pixel: { fx: 'x', revealMs: 100, screen: 'both' } } };
    expect(() => parseFactionConfig(bad2)).toThrow(/birthFx\.pixel/);
  });
  it('엔진 코드에 종족 분기 없음 (탄생·진화 재생기)', () => {
    for (const p of ['src/ui/birthFx.ts', 'src/ui/evolutionPanel.ts']) expect(readFileSync(p, 'utf8')).not.toMatch(/=== ['"](hollow|shinigami)['"]/);
  });
  it('패치 번호', () => {
    expect(Number(PATCH_LABEL.slice(2))).toBeGreaterThanOrEqual(539);
  });
});
