// 튜토리얼 원정 뒤 회복 안내 (GDD 123장 5 수정 v5.280, C.199): 세이브 쪽 순수 함수 — 화면은 ui/app.ts runRecover.
// 시작(빈사로 복귀 + 안내 차례)은 recordExpedition(game.ts). 순서 고정: ① 빈사로 복귀(설명) ② 가방 — 구급상자 지급 ③ 구급상자 → 빈사 해제 (④ 체력 포션은 GDD 144장 4 에서 삭제) ⑤ 온천 → 쉬기(체력 ↑·배부름 ↓) ⑥ 먹이 1개 → 배부름·체력 가득 ⑦ 기존 '다음 할 일' 안내.
// 진행 상태는 저장하지 않고 세이브 값에서 다시 읽는다(앱을 껐다 켜도 이어짐): 빈사 → ①, 체력 < spaTo → ⑤, 아니면 ⑥.
// 홈 체력·온천은 C.198 API(src/home.ts), 빈사·구급상자는 102장 엔진(cureNest). 종족 분기 없음.
import { BALANCE } from './config/balance';
import type { FoodId } from './engine/faction';
import { guidePending, markGuideDone, queueGuide } from './engine/tutorial';
import { cureNest, feedNest, tickIdle, type SaveData } from './game';
import { grantFood, homeHp, setHomeHpOf, spaEnter, spaLeave, spaSoak } from './home';
import { storeConsumable } from './shop';

const TR = BALANCE.provisional.tutorialRecover;
const SPA = BALANCE.provisional.nest.homeHp.tutorialSpa; // 튜토리얼 온천 = 10초 (GDD 145장 1)
/** 빈사 구급상자 품목 id (GDD 102-4) */
export const CURE_ITEM_ID = 'med-cure';
const EPS = 1e-6;

export type RecoverStep = 'dying' | 'spa' | 'feed';

export function recoverPending(save: Pick<SaveData, 'help'>): boolean {
  return guidePending(save.help, 'recover');
}

/** 지금 어느 단계부터인가 (세이브 값에서). 안내 차례가 아니면 null */
export function recoverStep(save: SaveData): RecoverStep | null {
  if (!recoverPending(save) || save.nest.dead) return null;
  if (save.nest.collapsed) return 'dying';
  const hp = homeHp(save).fraction;
  if (hp < TR.spaTo - EPS) return 'spa';
  return 'feed';
}

/** ② 가방: 안내용 구급상자 1개는 시작 구급상자(GDD 134장 1)와 따로 한 번만 넣는다(빈사 중에만, 다 썼으면 다시). 체력 포션 지급은 삭제 (GDD 144장 4) */
export function recoverGrantBag(save: SaveData): void {
  const cures = save.shared.items[CURE_ITEM_ID] ?? 0;
  if (save.nest.collapsed && (save.help.guides['recover-cure'] !== 'done' || cures <= 0)) {
    storeConsumable(save, CURE_ITEM_ID, 1);
    markGuideDone(save.help, 'recover-cure');
  }
}

/** ③ 구급상자 → 빈사 해제 (구급상자 1개 사용) */
export function recoverCure(save: SaveData, nowMs: number): boolean {
  recoverGrantBag(save);
  if (!cureNest(save, 'collapsed', nowMs)) return false;
  const n = (save.shared.items[CURE_ITEM_ID] ?? 1) - 1;
  if (n <= 0) delete save.shared.items[CURE_ITEM_ID];
  else save.shared.items[CURE_ITEM_ID] = n;
  return true;
}

/** ⑤ 온천에서 쉬기: spaTo 까지 걸리는 온천 시간을 바로 흘리고 나온다 (배부름이 그만큼 준다) */
export function recoverSpa(save: SaveData, nowMs: number): boolean {
  if (homeHp(save).fraction >= TR.spaTo - EPS) return false;
  if (!save.nest.spa && spaEnter(save, nowMs)) return false;
  tickIdle(save, nowMs); // 지금까지 흘린 뒤 남은 만큼만 (C.214 — 온천이 빨라 앞선 시간도 크게 잡힘)
  const from = homeHp(save).fraction;
  spaSoak(save, (TR.spaTo - from) / (SPA.hpPerSecond * 60), nowMs, true);
  spaLeave(save, nowMs, true);
  setHomeHpOf(save, Math.max(homeHp(save).fraction, TR.spaTo)); // 배부름이 먼저 바닥나 저절로 나왔어도 각본 값까지
  return true;
}

/** ⑤ 온천에 들어간 순간 (GDD 129-2 2, C.206): spaTo 까지 걸리는 온천 시간을 바로 흘린다 — 온천에서 나오지는 않는다(쉬기 설명 뒤 방으로) */
export function recoverSpaSoak(save: SaveData, nowMs: number): boolean {
  if (save.nest.spa) tickIdle(save, nowMs); // 지금까지 흘린 뒤 남은 만큼만 (C.214)
  const from = homeHp(save).fraction;
  if (!save.nest.spa || from >= TR.spaTo - EPS) return false;
  spaSoak(save, (TR.spaTo - from) / (SPA.hpPerSecond * 60), nowMs, true);
  if (homeHp(save).fraction < TR.spaTo - EPS) setHomeHpOf(save, TR.spaTo); // 배부름이 먼저 바닥났어도 각본 값까지
  return true;
}

/** ⑥ 먹이 카드가 뜰 때 먹이 1개 지급 (GDD 129-2 2: 먹이는 사용자가 독 [먹이]로 직접 준다) */
export function grantRecoverFood(save: SaveData): void {
  grantFood(save, TR.food as FoodId, 1);
}

/** ⑥ 사용자가 먹이를 준 뒤: 배부름·체력 가득(튜토리얼 각본 값) · 안내를 마친다 → 다음 안내('다음 할 일') 차례 */
export function recoverFeedDone(save: SaveData): void {
  save.nest.hunger = 0;
  setHomeHpOf(save, 1);
  markGuideDone(save.help, 'recover');
  queueGuide(save.help, 'first-run-room');
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
