// 화면 게이트 (GDD 241-0·241-D): 가방 장비 탭·장신구 칸·전투 소모품 칸·펫·출정품 칸·상점 장비/출정품 줄이 열렸나.
// 판정·문구는 src/engine/unlocks.ts(featureUnlocked·unlockHintText)에 맡긴다 (C.403 — C.397·C.400·C.401 의 임시 판정을 대신한다)
// — 조건 수치는 BALANCE.provisional.unlocks, 저장은 save.shared.unlocks(한 번 열리면 영구, 옛 세이브는 마이그레이션에서 이미 쓰던 것을 열어 둔다).
import type { FactionConfig } from './engine/faction';
import { featureUnlocked, unlockHintText, type FeatureId } from './engine/unlocks';
import type { SaveData } from './game';

export type GateId = FeatureId;

export function gateOpen(save: Pick<SaveData, 'shared'>, id: GateId): boolean {
  return featureUnlocked(save, id);
}

/** 잠김 한 줄 — 종족 단계·해방 이름으로 ("아쥬커스가 되면 장비가 열린다") */
export function gateHint(faction: Pick<FactionConfig, 'tierNames' | 'ascension'> & Partial<Pick<FactionConfig, 'rankBattleName' | 'training' | 'gearScreen'>>, id: GateId): string {
  return unlockHintText(faction, id);
}
