// 붕옥 재료 보유·증감 (GDD 12-3 v6.015, C.425): 세 재료 = 강화 트랙 id. 세이브 키는 옛 이름 그대로(soulCrystals = 고순도 윤활제 · hogyokuShards = 혼백 여과기 ·
// resonanceEssence = 영압 결정 — 이름만 data/hogyoku 에서 바꿈, 1:1 이전이라 변환 없음). game.ts·shop.ts 가 같이 쓰려고 따로 둔다(import 순환 방지)
import type { SaveData } from '../game';
import { HOGYOKU_TRACK_IDS, type HogyokuTrackId } from './transcend';
import type { HogyokuMaterialRecord } from './runLog';

type Shared = Pick<SaveData['shared'], 'soulCrystals' | 'hogyokuShards' | 'resonanceEssence'>;
const KEY: Record<HogyokuTrackId, keyof Shared> = { soul: 'soulCrystals', shard: 'hogyokuShards', essence: 'resonanceEssence' };

/** 트랙 하나(= 재료)의 지금 보유 수 */
export function materialHave(save: { shared: Shared }, track: HogyokuTrackId): number {
  return save.shared[KEY[track]] ?? 0;
}

/** 재료를 쓴다 (음수면 더한다). 확인은 부르는 쪽이 한다 */
export function spendMaterial(save: { shared: Shared }, track: HogyokuTrackId, n: number): void {
  save.shared[KEY[track]] = (save.shared[KEY[track]] ?? 0) - n;
}

/** 붕옥 재료를 얻는다 (GDD 12-3 v6.015: 사냥 드롭 'hunt' · 우라하라 'wanderer'): 붕옥 등장 전에도 쌓인다. 런 로그(slotLog.hogyokuMaterials)에 남긴다 */
export function gainHogyokuMaterial(save: Pick<SaveData, 'shared' | 'slotLog' | 'factionId'>, kind: HogyokuTrackId, amount: number, source: HogyokuMaterialRecord['source'], nowMs: number = Date.now()): number {
  const n = Math.max(0, Math.floor(amount));
  if (n <= 0 || !HOGYOKU_TRACK_IDS.includes(kind)) return 0;
  spendMaterial(save, kind, -n);
  (save.slotLog.hogyokuMaterials ??= []).push({ at: nowMs, kind, amount: n, source, factionId: save.factionId });
  return n;
}
