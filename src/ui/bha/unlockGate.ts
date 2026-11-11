// 241-D 화면 게이트 (가방 장비 탭 펫·출정품 칸): 해금 판정은 세션 C 의 src/engine/unlocks.ts(featureUnlocked·unlockHintText, GDD 241-0)가 맡는다.
// 그 모듈이 main 에 오기 전까지 같은 뜻의 임시 판정(provisional): 장비 = 2단계, 출정품 = 3단계, 펫 = 첫 환생 — 이미 쓰던 것(가진 펫·끼운 출정품)은 열린 것으로.
import type { FactionConfig } from '../../engine/faction';
import type { SaveData } from '../../game';

export type GateId = 'gear' | 'sortie' | 'pet';
const AT_TIER: Record<Exclude<GateId, 'pet'>, number> = { gear: 1, sortie: 2 };
const NAMES: Record<GateId, string> = { gear: '장비', sortie: '출정품', pet: '펫' };

export function gateOpen(save: Pick<SaveData, 'evolution' | 'rebirth' | 'shared'>, id: GateId): boolean {
  if (id === 'pet') return save.rebirth.count > 0 || Object.keys(save.shared.pets.owned).length > 0;
  if (id === 'gear') return save.evolution.tierIndex >= AT_TIER.gear || save.rebirth.count > 0 || save.shared.gear.items.length > 0;
  const sortie = (save.shared as { sortie?: (string | null)[] }).sortie;
  return save.evolution.tierIndex >= AT_TIER.sortie || save.rebirth.count > 0 || (sortie ?? []).some((x) => x !== null);
}

/** 잠김 한 줄 — 종족 단계 이름으로 ("아쥬커스가 되면 출정품이 열린다") */
export function gateHint(faction: Pick<FactionConfig, 'tierNames'>, id: GateId): string {
  if (id === 'pet') return '첫 환생 후 펫이 열린다';
  const name = faction.tierNames[AT_TIER[id]] ?? `${AT_TIER[id] + 1}단계`;
  return `${name}${hasBatchim(name) ? '이' : '가'} 되면 ${NAMES[id]}${id === 'gear' ? '가' : '이'} 열린다`;
}

function hasBatchim(word: string): boolean {
  const c = word.charCodeAt(word.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
}
