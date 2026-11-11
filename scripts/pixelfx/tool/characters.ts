import { AJUCHAS_MODELS } from '../../../src/data/art/manifest';
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
  /** 캐릭터 탭 분류 (사용자 2026-11-12 "치는 모델, 종이인형 세션 참고해서, 사신, 아란칼, 호로로 대분류, 성별 중분류, 디테일 소분류로"):
   *  대분류 = 종족 · 중분류 = 성별(사신·아란칼만 — 호로는 성별 외형이 없다, 종이인형 편집기와 같게) · 소분류 = label(단계·진화체) */
  group?: 'shinigami' | 'arrancar' | 'hollow';
  gender?: 'm' | 'f';
}
/** 아쥬커스 모델 이름 (게임 스킨 이름과 같게, GDD 240장) */
const AJUCHAS_NAMES: Record<string, string> = { carapace: '가시형(힘)', stag: '뱀형(지능)', rhino: '외팔형(체력)', wyrm: '거미형(정신력)', panther: '속도형(속도)', scorpion: '짐승형(방어력)', wraith: '부유형(히든)' }; // 종이인형 편집기 진화체 단추 이름 = ~형(능력치)
export const CHARACTERS: readonly ToolChar[] = [
  // 사신 (종이인형 편집기 단계 줄과 같은 순서: 혼백 · 영술원 학생 · 사신)
  { id: 'shinigami-soul', label: '혼백', rig: 'shinigami-soul', group: 'shinigami', gender: 'm' },
  { id: 'shinigami-student', label: '영술원 학생', rig: 'shinigami-student', group: 'shinigami', gender: 'm' },
  { id: 'shinigami-m', label: '사신', rig: 'shinigami-base', group: 'shinigami', gender: 'm' },
  { id: 'shinigami-soul-f', label: '혼백', rig: 'shinigami-soul-f', group: 'shinigami', gender: 'f' },
  { id: 'shinigami-student-f', label: '영술원 학생', rig: 'shinigami-student-f', group: 'shinigami', gender: 'f' },
  { id: 'shinigami-f', label: '사신', rig: 'shinigami-base-f', group: 'shinigami', gender: 'f' },
  // 아란칼 (기본형, 여성은 해방 외형도)
  { id: 'arrancar-m', label: '아란칼 기본형', rig: 'arrancar-base', group: 'arrancar', gender: 'm' },
  { id: 'arrancar-f', label: '아란칼 기본형', rig: 'arrancar-base-f', group: 'arrancar', gender: 'f' },
  { id: 'arrancar-f-released', label: '아란칼 해방', rig: 'arrancar-base-f-released', group: 'arrancar', gender: 'f' },
  // 호로 = 게임 그림 그대로(charArt): 1단계 덩치·2단계 길리안 (GDD 226장) + 아쥬커스 모델 7(게임 표 AJUCHAS_MODELS, 노멀 색, GDD 240장). 종이인형 편집기 진화체 줄 순서
  { id: 'hollow-brute', label: '덩치', rig: 'brute-base', faction: 'hollow', tier: 0, fallback: 'char.hollow', group: 'hollow' },
  { id: 'hollow-gillian', label: '길리안', rig: 'gillian-base', faction: 'hollow', tier: 1, fallback: 'char.hollow', group: 'hollow' },
  ...['rhino', 'carapace', 'panther', 'scorpion', 'stag', 'wyrm', 'wraith'].filter((k) => AJUCHAS_MODELS[k]).map((skin): ToolChar => ({ id: `hollow-${skin}`, label: AJUCHAS_NAMES[skin] ?? skin, rig: AJUCHAS_MODELS[skin]!.looks.normal, faction: 'hollow', tier: 2, fallback: 'char.hollow', skin, group: 'hollow' })),
  ...Object.keys(AJUCHAS_MODELS).filter((k) => !['rhino', 'carapace', 'panther', 'scorpion', 'stag', 'wyrm', 'wraith'].includes(k)).map((skin): ToolChar => ({ id: `hollow-${skin}`, label: AJUCHAS_NAMES[skin] ?? skin, rig: AJUCHAS_MODELS[skin]!.looks.normal, faction: 'hollow', tier: 2, fallback: 'char.hollow', skin, group: 'hollow' })),
  // 강적 몸 (GDD 227장, 사용자 2026-11-10 "강적 강공격 … 세로" + "위치 파악해서 반영"): 강적 강공격 세로를 몸마다 맞춘다 — 게임 적 그림 그대로(enemyArt)
  { id: 'elite-brute', kind: 'monster', label: '덩치', rig: 'brute-orange', enemy: 'fire-heavy-seal' },
  { id: 'elite-gillian', kind: 'monster', label: '외눈 길리안', rig: 'gillian-cyclops', enemy: 'normal-heavy-seal' },
  { id: 'elite-serpent', kind: 'monster', label: '뱀형', rig: 'serpent-green', enemy: 'poison-heavy-chain' },
  // 짐승형 (C.374 게임 넣기, 사용자 "짐승형 fx에도 반영시켜"): 강적 스톰후프(thunder-heavy-chain) = beast-yellow
  { id: 'elite-beast', kind: 'monster', label: '짐승형', rig: 'beast-yellow', enemy: 'thunder-heavy-chain' },
  { id: 'elite-onearm', kind: 'monster', label: '외팔형', rig: 'onearm-brown', enemy: 'earth-heavy-seal' },
  { id: 'elite-spider', kind: 'monster', label: '거미형', rig: 'spider-blue', enemy: 'water-heavy-seal' },
  // 가시형·속도형·부유형 강적 (C.392, GDD 240장 4)
  { id: 'elite-spiky', kind: 'monster', label: '가시형', rig: 'spiky-base', enemy: 'normal-heavy-chain' },
  { id: 'elite-speed', kind: 'monster', label: '속도형', rig: 'speed-base', enemy: 'normal-stance' },
  { id: 'elite-wraith', kind: 'monster', label: '부유형', rig: 'wraith-base', enemy: 'blood-stance' },
];
/** 게임 전투의 내 그림 자리 (1배 844×390 실측, scripts/c268-proof.cjs C268_NOHERO): 기본 상자 150 × (fieldScale ?? scale), 변형 기준점 */
export const HERO_BOX = { x: 512, y: 78, size: 150, originX: 587, originY: 216 };
