// 홈 하단 독의 순수 계산 (GDD 18-2, tests/dock.test.ts)
import type { FoodId, NestAction } from '../../engine/faction';
import type { FactionConfig } from '../../engine/faction';

/** 독이 위로 펼친 칸: 없음 / 먹이 종류 줄 / 소모품 빠른 사용 줄(GDD 14-3, v6.004) / 더보기 줄. 한 번에 하나만 열린다 */
export type DockPanel = 'none' | 'food' | 'items' | 'more';

/** 같은 버튼을 다시 누르면 닫고, 다른 칸이 열려 있으면 그것을 닫고 새로 연다 */
export function togglePanel(cur: DockPanel, which: Exclude<DockPanel, 'none'>): DockPanel {
  return cur === which ? 'none' : which;
}

/** 돌보기·먹이 선택·메뉴 실행·바깥 누름 뒤에는 닫는다 */
export const CLOSED: DockPanel = 'none';

export interface CareDelta {
  hunger: number;
  condition: number;
  risk: number;
}

/**
 * 돌보기 결과 한 줄(방 말풍선): 줄어든 수치(와 리스크가 오른 비용)만 "짐승 고기: 컨디션 −3" (GDD 201장 2·5).
 * numbers = false 면(바뀐 값 알림이 뜬 때, 209장 4) 줄어든 수치도 빼고 행동 이름만.
 * 회복(배부름·컨디션이 오름)은 글자로 쓰지 않는다 — 머리 위 상태창 막대가 차오르고 숫자가 따라 오른다. 줄어든 것이 없으면 행동 이름만, 아무것도 안 바뀌면 '변화 없음'
 */
export function careFeedback(faction: FactionConfig, action: NestAction, food: FoodId | null, d: CareDelta, numbers = true): string {
  const name = action === 'feed' && food ? faction.foodNames[food] : faction.nestActions[action];
  const parts: string[] = [];
  let rose = false;
  /** good = 오르면 회복인 값 (배부름·컨디션). 리스크는 오르는 쪽이 비용이라 글로 남긴다 */
  const add = (label: string, v: number, good = true) => {
    const r = Math.round(v);
    if (r > 0 && good) rose = true;
    else if (r !== 0) parts.push(`${label} ${r > 0 ? '+' : '−'}${Math.abs(r)}`);
  };
  add(faction.fullnessName, -d.hunger); // 배부름 = 허기를 뒤집어 표시 (C.63)
  add('컨디션', d.condition);
  add(faction.riskGaugeName, d.risk, false);
  // numbers = false: 바뀐 값 알림(상태창 아래 칩, GDD 209장 4)이 떴다 — 수치 변화 문장은 빼고 행동 이름만
  if (parts.length > 0) return numbers ? `${name}: ${parts.join(' · ')}` : name;
  return rose ? name : `${name}: 변화 없음`;
}
