// 이펙트 배치 도구의 치는 쪽 캐릭터 (사용자 2026-11-04 "종이인형 세션에서 캐릭터 도트랑 모션 가져와서 구현할 수 있게 수정(아란칼 남, 녀, 사신 남, 녀, 호로 각 하나씩만 있으면 됨) 맞는 쪽은 필요 없음")
// 종이인형 = 게임 humanoid.json 외형 id(게임과 같은 재생기 bindRigAnim), 호로 = 게임 프레임 애니(charArt) — 공격 동작이 있는 단계(char.hollow.2 = 단계 1)
export interface ToolChar {
  id: string;
  label: string;
  /** 종이인형 외형 id */
  rig?: string;
  /** 게임 그림(charArt)으로 불러올 때: 종족·단계(0부터)·기본 그림 키 — 종이인형이면 rig 도 같이 적는다(배율·자리는 게임 값) */
  faction?: string;
  tier?: number;
  fallback?: string;
  /** 적 그림(enemyArt)으로 불러올 때: 적 id — 강적 강공격 맞추기용 (GDD 227장) */
  enemy?: string;
  /** 스킨 그림(charArt skinId)으로 불러올 때: 스킨 id (예 wyrm 뱀형·panther 표범형) */
  skin?: string;
  /** 탭 (사용자 2026-11-11 "이펙트 배치도구를 캐릭터, 몬스터로 최상단 탭에서 나누고"): 없으면 캐릭터 */
  kind?: 'char' | 'monster';
}
export const CHARACTERS: readonly ToolChar[] = [
  { id: 'arrancar-m', label: '아란칼 남', rig: 'arrancar-base' },
  { id: 'arrancar-f', label: '아란칼 여', rig: 'arrancar-base-f' },
  { id: 'shinigami-m', label: '사신 남', rig: 'shinigami-base' },
  { id: 'shinigami-f', label: '사신 여', rig: 'shinigami-base-f' },
  // 호로 = 게임 그림 그대로(charArt): 1단계 덩치·2단계 길리안 종이인형 (사용자 2026-11-10 "호로 중 덩치랑 길리안 새로 불러와", GDD 226장). 옛 프레임 호로는 게임에서 안 써서 뺌.
  // 몸동작 칸 = 게임과 같이 'male'(종이인형이고 여성 외형이 아님) — 아란칼 남과 같은 칸
  { id: 'hollow-brute', label: '호로 덩치', rig: 'brute-base', faction: 'hollow', tier: 0, fallback: 'char.hollow' },
  { id: 'hollow-gillian', label: '호로 길리안', rig: 'gillian-base', faction: 'hollow', tier: 1, fallback: 'char.hollow' },
  // 호로 뱀형·표범형(짐승) 외형 (GDD 230장 — 몸마다 이펙트 자리가 달라 따로 맞춘다)
  { id: 'hollow-serpent', label: '호로 뱀', rig: 'serpent-base', faction: 'hollow', tier: 2, fallback: 'char.hollow', skin: 'wyrm' },
  { id: 'hollow-beast', label: '호로 짐승', rig: 'beast-base', faction: 'hollow', tier: 2, fallback: 'char.hollow', skin: 'panther' },
  // 강적 몸 (GDD 227장, 사용자 2026-11-10 "강적 강공격 … 세로" + "위치 파악해서 반영"): 강적 강공격 세로를 몸마다 맞춘다 — 게임 적 그림 그대로(enemyArt)
  { id: 'elite-brute', kind: 'monster', label: '덩치', rig: 'brute-orange', enemy: 'fire-heavy-seal' },
  { id: 'elite-gillian', kind: 'monster', label: '외눈 길리안', rig: 'gillian-cyclops', enemy: 'normal-heavy-seal' },
  { id: 'elite-serpent', kind: 'monster', label: '뱀', rig: 'serpent-green', enemy: 'poison-heavy-chain' },
  // 짐승형 (C.374 게임 넣기, 사용자 "짐승형 fx에도 반영시켜"): 강적 스톰후프(thunder-heavy-chain) = beast-yellow
  { id: 'elite-beast', kind: 'monster', label: '짐승', rig: 'beast-yellow', enemy: 'thunder-heavy-chain' },
];
/** 게임 전투의 내 그림 자리 (1배 844×390 실측, scripts/c268-proof.cjs C268_NOHERO): 기본 상자 150 × (fieldScale ?? scale), 변형 기준점 */
export const HERO_BOX = { x: 512, y: 78, size: 150, originX: 587, originY: 216 };
