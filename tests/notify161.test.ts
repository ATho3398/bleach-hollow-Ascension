// GDD 161장: 소모품·일반 장비·일반 물건은 얻어도 노란 알림(토스트)을 띄우지 않는다
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NOTIFY, gearToastWanted } from '../src/config/notify';
import { GEAR_GRADES } from '../src/data/gear';

describe('161장 물건 획득 알림 규칙', () => {
  it('장비 알림 최소 등급은 지금 없음 → 어떤 등급도 알리지 않는다', () => {
    expect(NOTIFY.gearToastMinGrade).toBeNull();
    for (const g of GEAR_GRADES) expect(gearToastWanted(g)).toBe(false);
  });

  it('최소 등급을 정하면 그 등급 이상만 알린다 (나중에 높은 등급용)', () => {
    expect(gearToastWanted('legendary', 'legendary')).toBe(true);
    expect(gearToastWanted('epic', 'legendary')).toBe(false);
    expect(gearToastWanted('epic', 'rare')).toBe(true);
    expect(gearToastWanted('normal', 'rare')).toBe(false);
  });

  it('튜토리얼 보상 알림은 끄고, 보상 알림에 소모품 줄을 적지 않는다', () => {
    expect(NOTIFY.tutorialGoalToast).toBe(false);
    expect(NOTIFY.consumablesInRewardToast).toBe(false);
  });

  it('화면 코드가 규칙을 거친다 (첫 모험 회복 물건 안내·장비 드롭·귀환 장비·튜토리얼 보상)', () => {
    const app = readFileSync('src/ui/app.ts', 'utf8');
    expect(app).not.toMatch(/eyebrow: '회복 물건'/);
    expect(app).toMatch(/gearFinds\?\.slice\(finds\) \?\? \[\]\)\.filter\(\(f\) => gearToastWanted\(f\.roll\.grade\)\)/);
    expect(app).toMatch(/r\.kind !== 'get' \|\| \(isGearGrade\(r\.grade\) && gearToastWanted\(r\.grade\)\)/);
    const goals = readFileSync('src/ui/tutorialGoalsView.ts', 'utf8');
    expect(goals).toMatch(/if \(!NOTIFY\.tutorialGoalToast\) return;/);
    expect(goals).toMatch(/NOTIFY\.consumablesInRewardToast \? items0 : items0\.map\(\(g\) => \(\{ \.\.\.g, food: \[\] \}\)\)/);
  });
});
