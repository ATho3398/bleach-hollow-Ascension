// 튜토리얼 원정 뒤 회복 안내 (GDD 123장 5 수정 v5.280, C.199): 세이브 쪽 순수 함수 — 화면은 ui/app.ts runRecover.
// 시작(빈사로 복귀 + 안내 차례)은 recordExpedition(game.ts). 순서 고정: ① 빈사로 복귀(설명) ② 가방 — 치료제·체력 포션 지급 ③ 치료제 → 빈사 해제 ④ 체력 포션 → 체력 50% ⑤ 온천 → 쉬기(체력 ↑·배부름 ↓) ⑥ 먹이 1개 → 배부름·체력 가득 ⑦ 기존 '다음 할 일' 안내.
// 진행 상태는 저장하지 않고 세이브 값에서 다시 읽는다(앱을 껐다 켜도 이어짐): 빈사 → ①, 체력 < potionTo → ④, 체력 < spaTo → ⑤, 아니면 ⑥.
// 홈 체력·온천·포션은 C.198 API(src/home.ts), 빈사·치료제는 102장 엔진(cureNest). 종족 분기 없음.
import { BALANCE } from './config/balance';
import type { FoodId } from './engine/faction';
import { guidePending, markGuideDone, queueGuide } from './engine/tutorial';
import { cureNest, feedNest, type SaveData } from './game';
import { drinkHpPotion, grantFood, grantHpPotion, homeHp, HP_POTION_ID, setHomeHpOf, spaEnter, spaLeave, spaSoak } from './home';
import { storeConsumable } from './shop';

const TR = BALANCE.provisional.tutorialRecover;
const SPA = BALANCE.provisional.nest.homeHp.spa;
/** 빈사 치료제 품목 id (GDD 102-4) */
export const CURE_ITEM_ID = 'med-cure';
const EPS = 1e-6;

export type RecoverStep = 'dying' | 'potion' | 'spa' | 'feed';

export function recoverPending(save: Pick<SaveData, 'help'>): boolean {
  return guidePending(save.help, 'recover');
}

/** 지금 어느 단계부터인가 (세이브 값에서). 안내 차례가 아니면 null */
export function recoverStep(save: SaveData): RecoverStep | null {
  if (!recoverPending(save) || save.nest.dead) return null;
  if (save.nest.collapsed) return 'dying';
  const hp = homeHp(save).fraction;
  if (hp < TR.potionTo - EPS) return 'potion';
  if (hp < TR.spaTo - EPS) return 'spa';
  return 'feed';
}

/** ② 가방: 치료제·체력 포션이 없으면 1개씩 넣는다 */
export function recoverGrantBag(save: SaveData): void {
  if ((save.shared.items[CURE_ITEM_ID] ?? 0) <= 0) storeConsumable(save, CURE_ITEM_ID, 1);
  if ((save.shared.items[HP_POTION_ID] ?? 0) <= 0) grantHpPotion(save, 1);
}

/** ③ 치료제 → 빈사 해제 (치료제 1개 사용) */
export function recoverCure(save: SaveData, nowMs: number): boolean {
  recoverGrantBag(save);
  if (!cureNest(save, 'collapsed', nowMs)) return false;
  const n = (save.shared.items[CURE_ITEM_ID] ?? 1) - 1;
  if (n <= 0) delete save.shared.items[CURE_ITEM_ID];
  else save.shared.items[CURE_ITEM_ID] = n;
  return true;
}

/** ④ 체력 포션 → 체력 potionTo (튜토리얼 각본 값, 평소 포션은 가득) */
export function recoverPotion(save: SaveData, nowMs: number): boolean {
  recoverGrantBag(save);
  return drinkHpPotion(save, HP_POTION_ID, nowMs, true, TR.potionTo) !== null;
}

/** ⑤ 온천에서 쉬기: spaTo 까지 걸리는 온천 시간을 바로 흘리고 나온다 (배부름이 그만큼 준다) */
export function recoverSpa(save: SaveData, nowMs: number): boolean {
  const from = homeHp(save).fraction;
  if (from >= TR.spaTo - EPS) return false;
  if (!save.nest.spa && spaEnter(save, nowMs)) return false;
  spaSoak(save, (TR.spaTo - from) / SPA.hpPerMinute, nowMs, true);
  spaLeave(save, nowMs, true);
  setHomeHpOf(save, Math.max(homeHp(save).fraction, TR.spaTo)); // 배부름이 먼저 바닥나 저절로 나왔어도 각본 값까지
  return true;
}

/** ⑥ 먹이 1개 지급 → 먹임 → 배부름·체력 가득 (튜토리얼 각본 값). 안내를 마친다 → 다음 안내('다음 할 일') 차례 */
export function recoverFeed(save: SaveData, nowMs: number): void {
  const food = TR.food as FoodId;
  grantFood(save, food, 1);
  feedNest(save, food, nowMs);
  save.nest.hunger = 0;
  setHomeHpOf(save, 1);
  markGuideDone(save.help, 'recover');
  queueGuide(save.help, 'first-run-room');
}
