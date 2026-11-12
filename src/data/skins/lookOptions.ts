// 모델 고르기 목록 (GDD 17절 '테스트 모드 보강' v6.036, C.434): 상태 화면 스킨 칸·테스트 패널 스킨 탭이 같이 쓴다.
// 순서 = 단계 모델(테스트 모드) → 초월자 외형(얻은 것 / 테스트 모드 전부) → 스킨(가진 것, 그림 있는 것). 그림 없는 스킨은 [그림 대기]로 따로.
// 단계 이름은 종족 설정(tierNames·ascension.lookName), 초월자 목록은 transcendents.json — 종족·초월자 id 로 나누지 않는다.
import { charArt, skinHasArt } from '../art/manifest';
import { skinLabel, skinsFor, tierLookId, tierLookTiers, transcendentLookId, transcendentLooks } from './index';
import { skinItemId } from '../shop';

export type ModelLookGroup = 'tier' | 'transcendent' | 'skin' | 'waiting';

export interface ModelLookOption {
  id: string;
  label: string;
  group: ModelLookGroup;
  /** 단계 모델의 단계 번호 (1부터) */
  tier?: number;
}

export const MODEL_LOOK_GROUP_NAMES: Record<ModelLookGroup, string> = { tier: '단계 모델', transcendent: '초월자', skin: '스킨', waiting: '그림 대기' };

/** 같은 그림인가 (정지 그림 주소 + 종이인형 외형) */
const sameArt = (a: ReturnType<typeof charArt>, b: ReturnType<typeof charArt>): boolean => a.src === b.src && a.rig?.look === b.rig?.look;

/** 단계 모델: 그 단계에서 남녀 그림이 다르면 (남)·(여) 두 칸, 같으면 한 칸 */
export function tierLookOptions(factionId: string): ModelLookOption[] {
  return tierLookTiers(factionId).flatMap(({ tier, name }) => {
    const label = `${tier}단계 ${name}`;
    const m = charArt(factionId, tier - 1, '', '/', undefined, undefined, null, undefined, 'male');
    const f = charArt(factionId, tier - 1, '', '/', undefined, undefined, null, undefined, 'female');
    if (sameArt(m, f)) return [{ id: tierLookId(tier), label, group: 'tier' as const, tier }];
    return [
      { id: tierLookId(tier, 'male'), label: `${label} (남)`, group: 'tier' as const, tier },
      { id: tierLookId(tier, 'female'), label: `${label} (여)`, group: 'tier' as const, tier },
    ];
  });
}

/** 모델 고르기 목록. test = 테스트 모드(단계 모델·초월자 전부·스킨 보유 무시), owned = 가진 꾸밈 id, dex = 이 슬롯이 얻은 초월자 id */
export function modelLookOptions(factionId: string, o: { test: boolean; owned: readonly string[]; dex: readonly string[]; waiting?: boolean }): ModelLookOption[] {
  const out: ModelLookOption[] = [];
  if (o.test) out.push(...tierLookOptions(factionId));
  for (const t of transcendentLooks()) if (o.test || o.dex.includes(t.id)) out.push({ id: transcendentLookId(t.id), label: t.name, group: 'transcendent' });
  for (const sk of skinsFor(factionId)) {
    if (!o.test && !o.owned.includes(skinItemId(sk.id))) continue;
    if (skinHasArt(sk.id)) out.push({ id: sk.id, label: skinLabel(sk), group: 'skin' });
    else if (o.waiting) out.push({ id: sk.id, label: skinLabel(sk), group: 'waiting' });
  }
  return out;
}
