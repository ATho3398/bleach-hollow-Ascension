// 스킨 데이터 표 (GDD 25-1·26-5, C.55): 단계와 상관없이 외형 전체를 덮는 그림. 그림 키는 `skin-<id>` (id 는 영문 소문자로 고정, 표시 이름은 바뀔 수 있다).
// 종족 필드로 목록을 거르므로 코드에 종족 이름이 들어가지 않는다. 'all' = 모든 종족 공용.
// 성별 (GDD 114장, C.188): 여성 그림은 같은 키 뒤에 `-f` — 스킨 `skin-<id>-f.png`(폴더면 `skin-<id>-f/`), 진화체 `char-<종족>-<단계>-f.png`. 남성 = 지금 이름 그대로.
//   여성이고 종족 설정 genderLookFromTier 단계 이상일 때만 `-f` 를 먼저 찾고, 없으면 지금 그림(남성)으로 보인다. 그 전 단계는 남녀 같은 그림(`-f` 를 넣어도 안 쓴다).
import { getFaction } from '../factions'; // 히든 '폭주' 외형 이름 = 종족 설정 frenzyName (C.213, GDD 136장 2 — 옛 '한계 돌파')

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
}

const BASE_SKINS: readonly SkinDef[] = [
  { id: 'grandfisher', name: '그랜드피셔', factionId: 'hollow', tentativeName: true, provisional: true },
  { id: 'mantis', name: '사마귀', factionId: 'hollow', tentativeName: true, provisional: true, startOnly: true },
  { id: 'brute', name: '거구', factionId: 'hollow', tentativeName: true, provisional: true, startOnly: true },
  { id: 'ghoul', name: '망령', factionId: 'hollow', tentativeName: true, provisional: true, startOnly: true },
  { id: 'shackled', name: '속박자', factionId: 'hollow', tentativeName: true, provisional: true, startOnly: true },
  // 아쥬커스 외형 (GDD 53): 진화 순간 노력치 1위 능력치로 정해진다 (힘 갑충·지능 사슴·체력 코뿔소·정신력 뱀·속도 표범·방어 전갈, 속도+지능 1·2위 = 새)
  { id: 'carapace', name: '갑충형', factionId: 'hollow', tentativeName: true, provisional: true, startOnly: true, tierLook: true },
  { id: 'stag', name: '사슴형', factionId: 'hollow', tentativeName: true, provisional: true, startOnly: true, tierLook: true },
  { id: 'rhino', name: '코뿔소형', factionId: 'hollow', tentativeName: true, provisional: true, startOnly: true, tierLook: true },
  { id: 'wyrm', name: '뱀형', factionId: 'hollow', tentativeName: true, provisional: true, startOnly: true, tierLook: true },
  { id: 'panther', name: '표범형', factionId: 'hollow', tentativeName: true, provisional: true, startOnly: true, tierLook: true },
  { id: 'scorpion', name: '전갈형', factionId: 'hollow', tentativeName: true, provisional: true, startOnly: true, tierLook: true },
  { id: 'raptor', name: '새형', factionId: 'hollow', tentativeName: true, provisional: true, startOnly: true, tierLook: true },
];
/** 아란칼(5단계) 외형 (GDD 54, C.110): 속성 8 × 칸 4 + 히든 4. 종족 설정 formLooks 가 진화체 id → 이 id 로 잇는다(그림 `skin-arr<속성><칸 a~d>.png`, 예 `skin-arrwaterb.png` = 물 2번 칸). 상점·스킨 패널·시작 추첨에는 안 나온다.
 *  그림은 C.187(GDD 113)에 전부 지웠다 — 지금은 5단계 진화체 그림(char-hollow-5)으로 보이고, 새 그림은 `public/art/` 에 같은 이름 파일만 넣으면 코드 수정 없이 붙는다 */
const ARRANCAR_ELEMENTS: readonly (readonly [string, string])[] = [['normal', '노멀'], ['water', '물'], ['fire', '불'], ['earth', '흙'], ['thunder', '뇌'], ['blood', '혈'], ['poison', '독'], ['kyo', '허']];
const ARRANCAR_SKINS: readonly SkinDef[] = [
  ...ARRANCAR_ELEMENTS.flatMap(([id, name]) => [1, 2, 3, 4].map((n): SkinDef => ({ id: `arr${id}${'abcd'[n - 1]}`, name: `아란칼 ${name} ${n}`, factionId: 'hollow', tentativeName: true, provisional: true, startOnly: true, tierLook: true }))),
  ...([['limit', getFaction('hollow').frenzyName], ['restraint', '절제'], ['hunter', '강적 사냥꾼'], ['reborn', '환생']] as const).map(([_k, name], i): SkinDef => ({ id: `arrhidden${'abcd'[i]}`, name: `아란칼 ${name}`, factionId: 'hollow', tentativeName: true, provisional: true, startOnly: true, tierLook: true })),
];

export const SKINS: readonly SkinDef[] = [...BASE_SKINS, ...ARRANCAR_SKINS];


export function getSkin(id: string | null | undefined): SkinDef | undefined {
  return id ? SKINS.find((s) => s.id === id) : undefined;
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
