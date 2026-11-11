// 241-D 화면 게이트 (가방 장비 탭·장신구 칸·펫·출정품 칸·상점 장비/출정품 줄): 해금 판정은 세션 C 의 src/engine/unlocks.ts(featureUnlocked·unlockHintText, GDD 241-0)가 맡는다.
// 그 모듈이 main 에 오기 전까지 같은 뜻의 임시 판정(provisional) — 241-0 수정 표(사용자 04:0x): 장비(무기·방어구·신발) = 3단계, 장신구 3칸 = 해방 클리어,
// 펫·출정품 = 첫 환생. 이미 쓰던 것(가진 장비·장신구·펫, 끼운 출정품)은 열린 것으로 (옛 세이브는 닫지 않음).
import type { FactionConfig } from './engine/faction';
import type { SaveData } from './game';

export type GateId = 'gear' | 'battleItem' | 'accessory' | 'sortie' | 'pet';
const GEAR_AT_TIER = 2;
const NAMES: Record<GateId, string> = { gear: '장비', battleItem: '전투 소모품', accessory: '장신구', sortie: '출정품', pet: '펫' };

export function gateOpen(save: Pick<SaveData, 'evolution' | 'rebirth' | 'shared'>, id: GateId): boolean {
  if (save.rebirth.count > 0) return true;
  const sh = save.shared;
  switch (id) {
    case 'gear': return save.evolution.tierIndex >= GEAR_AT_TIER || sh.gear.items.length > 0;
    case 'battleItem': return save.evolution.tierIndex >= GEAR_AT_TIER || sh.battleItem !== null;
    case 'accessory': return save.evolution.ascended === true || sh.gear.items.some((i) => i.kind === 'accessory');
    case 'pet': return Object.keys(sh.pets.owned).length > 0;
    case 'sortie': return (sh.sortie ?? []).some((x) => x !== null);
  }
}

/** 잠김 한 줄 — 종족 단계 이름으로 ("아쥬커스가 되면 장비가 열린다") */
export function gateHint(faction: Pick<FactionConfig, 'tierNames' | 'ascension'>, id: GateId): string {
  if (id === 'pet' || id === 'sortie') return `첫 환생 후 ${NAMES[id]}${josa(NAMES[id], '이', '가')} 열린다`;
  if (id === 'accessory') return `${faction.ascension.name} 클리어 후 장신구 칸이 열린다`;
  const name = faction.tierNames[GEAR_AT_TIER] ?? `${GEAR_AT_TIER + 1}단계`;
  return `${name}${josa(name, '이', '가')} 되면 ${NAMES[id]}${josa(NAMES[id], '이', '가')} 열린다`;
}

function josa(word: string, withBatchim: string, without: string): string {
  const c = word.charCodeAt(word.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0 ? withBatchim : without;
}
