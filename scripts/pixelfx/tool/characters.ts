// 이펙트 배치 도구의 치는 쪽 캐릭터 (사용자 2026-11-04 "종이인형 세션에서 캐릭터 도트랑 모션 가져와서 구현할 수 있게 수정(아란칼 남, 녀, 사신 남, 녀, 호로 각 하나씩만 있으면 됨) 맞는 쪽은 필요 없음")
// 종이인형 = 게임 humanoid.json 외형 id(게임과 같은 재생기 bindRigAnim), 호로 = 게임 프레임 애니(charArt) — 공격 동작이 있는 단계(char.hollow.2 = 단계 1)
export interface ToolChar {
  id: string;
  label: string;
  /** 종이인형 외형 id */
  rig?: string;
  /** 프레임 애니 캐릭터: 종족·단계(0부터)·기본 그림 키 */
  faction?: string;
  tier?: number;
  fallback?: string;
}
export const CHARACTERS: readonly ToolChar[] = [
  { id: 'arrancar-m', label: '아란칼 남', rig: 'arrancar-base' },
  { id: 'arrancar-f', label: '아란칼 여', rig: 'arrancar-base-f' },
  { id: 'shinigami-m', label: '사신 남', rig: 'shinigami-base' },
  { id: 'shinigami-f', label: '사신 여', rig: 'shinigami-base-f' },
  { id: 'hollow', label: '호로', faction: 'hollow', tier: 1, fallback: 'char.hollow' },
];
/** 게임 전투의 내 그림 자리 (1배 844×390 실측, scripts/c268-proof.cjs C268_NOHERO): 기본 상자 150 × (fieldScale ?? scale), 변형 기준점 */
export const HERO_BOX = { x: 512, y: 78, size: 150, originX: 587, originY: 216 };
