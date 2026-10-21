// 스킨 데이터 표 (GDD 25-1·26-5, C.55): 단계와 상관없이 외형 전체를 덮는 그림. 그림 키는 `skin-<id>` (id 는 영문 소문자로 고정, 표시 이름은 바뀔 수 있다).
// 종족 필드로 목록을 거르므로 코드에 종족 이름이 들어가지 않는다. 'all' = 모든 종족 공용.

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
}

export const SKINS: readonly SkinDef[] = [
  { id: 'grandfisher', name: '그랜드피셔', factionId: 'hollow', tentativeName: true, provisional: true },
  { id: 'stalker', name: '추적자', factionId: 'hollow', tentativeName: true, provisional: true, startOnly: true },
  { id: 'brute', name: '거구', factionId: 'hollow', tentativeName: true, provisional: true, startOnly: true },
  { id: 'ghoul', name: '망령', factionId: 'hollow', tentativeName: true, provisional: true, startOnly: true },
  { id: 'shackled', name: '속박자', factionId: 'hollow', tentativeName: true, provisional: true, startOnly: true },
];

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
