// GDD 193장 2·3·11·12·19 (코딩219): 출발 체력 · 바퀴 끝 창 · 준비 설명 말로 · 프리셋 판 자리 · 놓을 수 있는 수 다 놓으면 빈 칸 흐리게
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { GROUNDS } from '../src/data/grounds';
import { lapRewardMult, lapScale, winHealOf } from '../src/engine/expedition';
import { getFaction } from '../src/data/factions';
import { continueDetail, continueWords, lapGainLine } from '../src/ui/bha/lapEnd';
import { difficultyDetail, difficultyInfo, groundDetail, groundInfo, lowDepartHp } from '../src/ui/planView';

const src = (p: string) => readFileSync(p, 'utf8');
const FACTIONS = ['hollow', 'shinigami'].map((id) => getFaction(id));

describe('193장 2 출발 체력', () => {
  it('문턱은 balance 값, 아래면 경고 · 같거나 위면 그대로 · 모르면 경고 없음', () => {
    const k = BALANCE.provisional.nest.care.departWarnHp;
    expect(k).toBe(0.5);
    expect(lowDepartHp(k - 0.01)).toBe(true);
    expect(lowDepartHp(k)).toBe(false);
    expect(lowDepartHp(undefined)).toBe(false);
  });
  it('[출발] 띠에 체력 n% + 확인 창 [출발][그만], 스토리 출발도 같은 확인', () => {
    const pv = src('src/ui/planView.ts');
    expect(pv).toContain('bha-plan__hp');
    expect(pv).toMatch(/yes: '출발', no: '그만'/);
    expect(src('src/ui/app.ts')).toMatch(/askLowHp\(save!, \(\) => startStory/);
  });
});

describe('193장 11 준비 설명 칸 = 말, 숫자는 ⓘ', () => {
  it('두 종족 모든 ★·연속: 한 줄에 % · ×·"기준" 없음, ⓘ 에는 % 가 있다', () => {
    for (const f of FACTIONS) for (let star = 1; star <= 4; star++) for (const n of [0, 3]) {
      const line = difficultyInfo(f, star, star - 1, n);
      expect(line).not.toMatch(/%|×|기준/);
      if (star > 1 || n > 0) expect(difficultyDetail(f, star, n).lines.join(' ')).toMatch(/\+\d+%/);
    }
  });
  it('사냥터 줄에 적 체력·공격 % 없음 → ⓘ', () => {
    for (const f of FACTIONS) for (const g of GROUNDS) {
      expect(groundInfo(f, g)).not.toMatch(/%/);
      expect(groundDetail(f, g).lines[0]).toMatch(/체력 \d+% · 공격 \d+%/);
    }
  });
});

describe('193장 3 바퀴 끝 창', () => {
  const base = { lap: 2, victoriesThisLap: 3, acquiredTraits: [{ traitId: 'a', lap: 2 }, { traitId: 'b', lap: 1 }], foodLoot: [{ food: 'snack' as const, lap: 2 }, { food: 'snack' as const, lap: 2 }], goldLoot: [{ amount: 40, lap: 2 }, { amount: -10, lap: 2 }, { amount: 99, lap: 1 }], acquired: [], gearFinds: [], petFinds: [] };
  it('이번 바퀴 것만 한 줄 (0 인 것은 빼고, 쓴 골드는 안 셈)', () => {
    expect(lapGainLine(base, '먹이', '골드')).toBe('이번 바퀴: 승리 3 · 흡수 1 · 먹이 2 · 골드 +40');
    expect(lapGainLine({ ...base, victoriesThisLap: 0, acquiredTraits: [], foodLoot: [], goldLoot: [] }, '먹이', '골드')).toBe('이번 바퀴: 얻은 것 없음');
  });
  it('다음 바퀴는 말로(× 없음), 숫자는 ⓘ — balance 값 그대로', () => {
    for (const nx of [2, 3, 5]) {
      expect(continueWords(nx)).not.toMatch(/×|%/);
      const d = continueDetail(nx).lines.join(' ');
      expect(d).toContain(`×${Math.round(lapRewardMult(nx) * 100) / 100}`);
      expect(d).toContain(`×${Math.round(lapScale(nx).attack * 100) / 100}`);
      if (winHealOf(nx) > 0) expect(continueWords(nx)).toContain('이기면 조금 회복');
    }
    const ev = src('src/ui/expeditionView.ts');
    expect(ev).toContain("'bha-lapend__hp'");
    expect(ev).not.toMatch(/다음 바퀴 보상 ×/);
  });
});

describe('193장 12·19 타일 배치 탭', () => {
  it('프리셋 판은 [타일 배치] 탭에서만 보이고, 준비 탭 줄은 전체 폭', () => {
    expect(src('src/ui/planView.ts')).toContain("presetEl.hidden = k !== 'place'");
    const css = src('src/ui/bha/expedition.css');
    expect(css).toMatch(/\.bha-plan > \.bha-plan__desc \{ position: absolute; left: 10px; right: 10px;/);
    expect(css).toMatch(/\.bha-plan__side \{ position: absolute; left: 418px; right: 10px; top: 128px;/);
  });
  it('놓을 수 있는 수를 다 놓으면 남은 빈 칸 is-full(흐리게), 두 탭 같은 말 "놓은 타일"', () => {
    const road = src('src/ui/bha/road.ts');
    expect(road).toMatch(/placedCount\(exp\) >= exp\.planLimit/);
    expect(road).toContain("' is-full'");
    expect(src('src/ui/bha/expedition.css')).toMatch(/\.bha-road__cell\.is-full \{ opacity/);
    expect(src('src/ui/planView.ts')).not.toContain('놓은 칸 ');
  });
});
