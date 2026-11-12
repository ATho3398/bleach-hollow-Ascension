// 스킨 데이터 표 (GDD 25-1·26-5, C.55): 단계와 상관없이 외형 전체를 덮는 그림. 그림 키는 `skin-<id>` (id 는 영문 소문자로 고정, 표시 이름은 바뀔 수 있다).
// 종족 필드로 목록을 거르므로 코드에 종족 이름이 들어가지 않는다. 'all' = 모든 종족 공용.
// 성별 (GDD 114장, C.188): 여성 그림은 같은 키 뒤에 `-f` — 스킨 `skin-<id>-f.png`(폴더면 `skin-<id>-f/`), 진화체 `char-<종족>-<단계>-f.png`. 남성 = 지금 이름 그대로.
//   여성이고 종족 설정 genderLookFromTier 단계 이상일 때만 `-f` 를 먼저 찾고, 없으면 지금 그림(남성)으로 보인다. 그 전 단계는 남녀 같은 그림(`-f` 를 넣어도 안 쓴다).
import { getFaction } from '../factions'; // 히든 '폭주' 외형 이름 = 종족 설정 frenzyName (C.213, GDD 136장 2 — 옛 이름 폐기)

export interface SkinDef {
  /** 파일 이름에 쓰는 고정 id (영문 소문자) */
  id: string;
  /** 표시 이름 (가칭이면 목록에 "(가칭)"이 붙는다) */
  name: string;
  /** 입을 수 있는 종족 id, 또는 'all' */
  factionId: string;
  /** 이름이 가칭인가 (바뀔 수 있다) */
  tentativeName: boolean;
  /** 임시 데이터 (이름·종족 provisional). 열림은 상점 보유(GDD 25-9, shared.cosmetics)로 정한다 */
  provisional: true;
  /** 시작 전용 (GDD 51): 새 세이브 뽑기(종족 설정 startLooks)로만 얻고 상점에서 팔지 않는다 */
  startOnly?: true;
  /** 단계 외형 (GDD 53, 종족 설정 tierLooks): 진화 때 정해져 자동으로 입혀진다. 상점·스킨 패널에는 안 나온다 */
  tierLook?: true;
  /** 없앤 모델 (GDD 246장 2): 옛 세이브에 남은 id 를 읽을 때만 쓴다 — 고르는 목록·도감·편집기·상점 품목에는 안 나온다(이름은 대신 보이는 모델 이름) */
  retired?: true;
}

// GDD 243장 9-7: 화면에 '(가칭)'이 보이던 시작 외형·스킨 이름 = 지금 이름을 정식으로(tentativeName false) — 그림·수치는 provisional 그대로
const BASE_SKINS: readonly SkinDef[] = [
  { id: 'grandfisher', name: '그랜드피셔', factionId: 'hollow', tentativeName: false, provisional: true },
  { id: 'mantis', name: '사마귀', factionId: 'hollow', tentativeName: false, provisional: true, startOnly: true },
  { id: 'brute', name: '거구', factionId: 'hollow', tentativeName: false, provisional: true, startOnly: true },
  { id: 'ghoul', name: '망령', factionId: 'hollow', tentativeName: false, provisional: true, startOnly: true },
  { id: 'shackled', name: '속박자', factionId: 'hollow', tentativeName: false, provisional: true, startOnly: true },
  // 아쥬커스 외형 (GDD 53 → 240장, 사용자 2026-11-12): 진화 순간 노력치 1위 능력치로 모델이 정해지고(힘 가시형·지능 뱀형·체력 외팔형·정신력 거미형·속도 속도형·방어 짐승형),
  // 히든 진화체는 부유형. 진화체 속성(물·불·흙·뇌)이면 같은 모델의 속성 색 외형(id 뒤에 속성 id — 예 wyrmwater, 아래 AJUCHAS_ELEMENT_SKINS) — 노멀은 보라.
  // id 는 옛 세이브에 저장된 값이라 그대로 두고 이름·그림만 바꿨다(옛 이름: 갑충·사슴·코뿔소·뱀·표범·전갈). 새형(raptor, 옛 속도+지능 쌍)은 표에서 빠졌고 옛 세이브용으로 속도형 그림
  { id: 'carapace', name: '가시형', factionId: 'hollow', tentativeName: false, provisional: true, startOnly: true, tierLook: true },
  { id: 'stag', name: '뱀형', factionId: 'hollow', tentativeName: false, provisional: true, startOnly: true, tierLook: true },
  { id: 'rhino', name: '외팔형', factionId: 'hollow', tentativeName: false, provisional: true, startOnly: true, tierLook: true },
  { id: 'wyrm', name: '거미형', factionId: 'hollow', tentativeName: false, provisional: true, startOnly: true, tierLook: true },
  { id: 'panther', name: '속도형', factionId: 'hollow', tentativeName: false, provisional: true, startOnly: true, tierLook: true },
  { id: 'scorpion', name: '짐승형', factionId: 'hollow', tentativeName: false, provisional: true, startOnly: true, tierLook: true },
  { id: 'wraith', name: '부유형', factionId: 'hollow', tentativeName: false, provisional: true, startOnly: true, tierLook: true },
  // 옛 새형 (GDD 246장 2, 사용자 2026-11-12 "모델중에 옛 새형 이거 없애"): 목록에서 삭제. id 는 옛 세이브용으로 남아 불러오면 속도형(그림·이름 그대로 속도형)으로 보인다
  { id: 'raptor', name: '속도형', factionId: 'hollow', tentativeName: false, provisional: true, startOnly: true, tierLook: true, retired: true },
  // 길리안 외형 (GDD 219장 1, 사용자 2026-11-10 "길리안은, 길리안 단계 진화체로 게임에 넣고"): 2단계(길리안)에 닿으면 능력치와 상관없이 이 외형 — 종이인형 길리안(몸 hd)
  { id: 'gillian', name: '길리안', factionId: 'hollow', tentativeName: false, provisional: true, startOnly: true, tierLook: true },
  // 길리안 외눈형 (GDD 241-C 4, C.406): 숨은 모습 — 종족 설정 specialLooks 조건을 채우고 2단계로 진화하면 이 외형(종이인형 길리안 외눈 가면)
  { id: 'gilliancyclops', name: '길리안 외눈형', factionId: 'hollow', tentativeName: false, provisional: true, startOnly: true, tierLook: true },
];
/** 아란칼(5단계) 외형 (GDD 54, C.110): 속성 8 × 칸 4 + 히든 4. 종족 설정 formLooks 가 진화체 id → 이 id 로 잇는다(그림 `skin-arr<속성><칸 a~d>.png`, 예 `skin-arrwaterb.png` = 물 2번 칸). 상점·스킨 패널·시작 추첨에는 안 나온다.
 *  그림은 C.187(GDD 113)에 전부 지웠다 — 지금은 5단계 진화체 그림(char-hollow-5)으로 보이고, 새 그림은 `public/art/` 에 같은 이름 파일만 넣으면 코드 수정 없이 붙는다 */
const ARRANCAR_ELEMENTS: readonly (readonly [string, string])[] = [['normal', '노멀'], ['water', '물'], ['fire', '불'], ['earth', '흙'], ['thunder', '뇌'], ['blood', '혈'], ['poison', '독'], ['kyo', '허']];
const ARRANCAR_SKINS: readonly SkinDef[] = [
  ...ARRANCAR_ELEMENTS.flatMap(([id, name]) => [1, 2, 3, 4].map((n): SkinDef => ({ id: `arr${id}${'abcd'[n - 1]}`, name: `아란칼 ${name} ${n}`, factionId: 'hollow', tentativeName: true, provisional: true, startOnly: true, tierLook: true }))),
  ...([['limit', getFaction('hollow').frenzyName], ['restraint', '절제'], ['hunter', '강적 사냥꾼'], ['reborn', '환생']] as const).map(([_k, name], i): SkinDef => ({ id: `arrhidden${'abcd'[i]}`, name: `아란칼 ${name}`, factionId: 'hollow', tentativeName: true, provisional: true, startOnly: true, tierLook: true })),
];

/** 아쥬커스 모델의 속성 색 외형 (GDD 240장): `<모델 id><속성 id>`(예 wyrmwater) — 종족 설정 tierLooks 의 elementSuffix 가 진화체 속성으로 고른다 */
export const AJUCHAS_MODEL_SKINS = ['carapace', 'stag', 'rhino', 'wyrm', 'panther', 'scorpion', 'wraith'] as const;
export const AJUCHAS_ELEMENT_NAMES: readonly (readonly [string, string])[] = [['water', '물'], ['fire', '불'], ['earth', '흙'], ['thunder', '뇌']];
const AJUCHAS_ELEMENT_SKINS: readonly SkinDef[] = AJUCHAS_MODEL_SKINS.flatMap((id) => {
  const base = BASE_SKINS.find((x) => x.id === id)!;
  return AJUCHAS_ELEMENT_NAMES.map(([el, name]): SkinDef => ({ ...base, id: `${id}${el}`, name: `${base.name}(${name})` }));
});

/** 스킨 표 전부 (옛 세이브 읽기용 retired 포함 — getSkin 이 쓴다) */
const ALL_SKINS: readonly SkinDef[] = [...BASE_SKINS, ...AJUCHAS_ELEMENT_SKINS, ...ARRANCAR_SKINS];
/** 목록에 나오는 스킨 (없앤 모델 retired 제외 — GDD 246장 2) */
export const SKINS: readonly SkinDef[] = ALL_SKINS.filter((s) => !s.retired);


export function getSkin(id: string | null | undefined): SkinDef | undefined {
  return id ? ALL_SKINS.find((s) => s.id === id) : undefined;
}

/** 이 종족이 입을 수 있는 스킨 (공용 포함) */
export function skinsFor(factionId: string): SkinDef[] {
  return SKINS.filter((s) => s.factionId === 'all' || s.factionId === factionId);
}

/** 이 종족이 입을 수 있는 스킨 id 인가 */
export function canWear(factionId: string, skinId: string | null | undefined): boolean {
  return !!skinId && skinsFor(factionId).some((s) => s.id === skinId);
}

export function skinLabel(s: SkinDef): string {
  return s.tentativeName ? `${s.name}(가칭)` : s.name;
}

/** 스킨의 그림 키 (files.ts 의 키 규칙: skin.<id> → skin-<id>) */
export function skinArtKey(id: string): string {
  return `skin.${id}`;
}
