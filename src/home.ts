// 홈 체력·회복 (GDD 123장 2·4, C.198): 세이브 쪽 API. 수치 계산은 src/engine/nest.ts(homeHpOf·passHomeHp·enterSpa·soakSpa·healHomeHp),
// 수치는 balance.ts provisional.nest.homeHp. 런 로그 homeHeals(온천·포션)를 여기서 남긴다. 종족 무관 — 온천 이름은 종족 설정 spaName.
// 튜토리얼(C.199 회복 안내)도 이 함수들을 부른다: spaEnter → spaSoak(분) → spaLeave, grantFood → feedNest, grantHpPotion → drinkHpPotion.
import { buildCombatParams } from './engine/absorb';
import { defaultCombatParams, playerStatsOf } from './engine/combat';
import { applyEvolutionToParams } from './engine/evolution';
import { addFood } from './engine/food';
import { applyGearToParams, gearCarry } from './engine/gear';
import type { FoodId } from './engine/faction';
import { enterSpa, healHomeHp, homeHpCap, homeHpOf, leaveSpa, setHomeHp, soakSpa, type SpaEnd } from './engine/nest';
import { logHomeHeal, logSpaEnd, statBonusOf, type SaveData } from './game';
import { storeConsumable } from './shop';

/** 체력 포션 품목 id (떠돌이 상인 영웅 품목, 보관함 소모품) */
export const HP_POTION_ID = 'w-hp-potion';

/** 지금 홈 체력: 비율(0~상한)·상한(빈사 10%)·빈사·온천에 있나 */
export interface HomeHp {
  fraction: number;
  cap: number;
  dying: boolean;
  inSpa: boolean;
}

export function homeHp(save: Pick<SaveData, 'nest'>): HomeHp {
  return { fraction: homeHpOf(save.nest), cap: homeHpCap(save.nest), dying: save.nest.collapsed, inSpa: save.nest.spa != null };
}

/** 원정에서의 최대 체력 (방 체력 막대 '현재 / 최대' 숫자): 원정 전투와 같은 식 — 빌드·진화·붕옥/초월체 보너스·수련·장비. 쇠약·빈사 축소는 빼고 본래 값 */
export function homeMaxHp(save: SaveData): number {
  const params = buildCombatParams(save.build, save.factionId);
  applyEvolutionToParams(params, save.evolution, save.factionId, statBonusOf(save).total, save.training.completed);
  applyGearToParams(params, gearCarry(save.shared.gear), false);
  const p = { ...defaultCombatParams(), ...params };
  return p.playerMaxHp * (playerStatsOf(p).hp / p.playerRefStat) * p.playerHpScale;
}

/** 온천 들어가기를 막는 이유 (화면 문구) */
export const SPA_BLOCK_TEXT: Record<'dead' | 'already' | 'full' | 'hungry' | 'expedition', string> = {
  dead: '사망 — 부활만 할 수 있다',
  already: '이미 온천에 있다',
  full: '체력과 컨디션이 이미 가득하다',
  hungry: '배가 고파 온천에 못 들어간다',
  expedition: '원정 중에는 못 들어간다',
};

/** 온천에 들어간다. 못 들어가면 이유 키, 들어가면 null */
export function spaEnter(save: SaveData, nowMs: number = Date.now()): keyof typeof SPA_BLOCK_TEXT | null {
  if (save.activeExpedition != null) return 'expedition';
  return enterSpa(save.nest, nowMs);
}

/** 온천에서 나온다 (뒤로). 런 로그 homeHeals 'spa'. 온천이 아니었으면 null */
export function spaLeave(save: SaveData, nowMs: number = Date.now(), tutorial = false): SpaEnd | null {
  const e = leaveSpa(save.nest, nowMs, 'left');
  logSpaEnd(save, e, tutorial);
  return e;
}

/** 온천 시간을 바로 minutes 분 흘린다 (튜토리얼 '쉬게 하기' — 예: 5분 = 체력 +50%·배부름 −50). 온천이 아니면 들어가서. 저절로 나오면 기록 */
export function spaSoak(save: SaveData, minutes: number, nowMs: number = Date.now(), tutorial = false): { hp: number; ended: SpaEnd | null } {
  if (save.activeExpedition != null) return { hp: 0, ended: null };
  const r = soakSpa(save.nest, minutes, nowMs);
  logSpaEnd(save, r.ended, tutorial);
  return r;
}

/** 체력 포션을 먹는다 (GDD 123장 4): 가방에 있어야 하고 하나 쓴다. 체력 상한(빈사 10%)까지 가득. 온천에 있었으면 나온다.
 *  toFraction = 튜토리얼 각본 값(123장 5 수정: 체력 50%) — 그 값까지만(상한 안). 못 먹으면(없음·원정 중·사망·이미 그 값 이상) null, 아무것도 안 바뀐다 */
export function drinkHpPotion(save: SaveData, id: string = HP_POTION_ID, nowMs: number = Date.now(), tutorial = false, toFraction = 1): { hpFrom: number; hpTo: number } | null {
  if ((save.shared.items[id] ?? 0) <= 0 || save.activeExpedition != null || save.nest.dead) return null;
  const hpFrom = homeHpOf(save.nest);
  const target = Math.min(homeHpCap(save.nest), Math.max(0, toFraction));
  if (hpFrom >= target - 1e-9) return null;
  healHomeHp(save.nest, target - hpFrom);
  const n = (save.shared.items[id] ?? 1) - 1;
  if (n <= 0) delete save.shared.items[id];
  else save.shared.items[id] = n;
  logSpaEnd(save, leaveSpa(save.nest, nowMs, 'full'), tutorial);
  const hpTo = homeHpOf(save.nest);
  logHomeHeal(save, { at: nowMs, kind: 'potion', hpFrom: Math.round(hpFrom * 100) / 100, hpTo: Math.round(hpTo * 100) / 100, ...(tutorial ? { tutorial: true } : {}) });
  return { hpFrom, hpTo };
}

/** 체력 포션을 가방에 넣는다 (튜토리얼 지급 등, 보관 상한까지). 넣은 개수 */
export function grantHpPotion(save: Pick<SaveData, 'shared'>, n = 1): number {
  return storeConsumable(save, HP_POTION_ID, n);
}

/** 먹이를 가방에 넣는다 (튜토리얼 지급 등, 종류별 상한까지). 넣은 개수. 먹이기는 game.ts feedNest */
export function grantFood(save: Pick<SaveData, 'shared'>, food: FoodId, n = 1): number {
  return addFood(save.shared.food, food, n);
}

/** 홈 체력을 그 값으로 맞춘다 (튜토리얼 연출 — 상한 안). 바뀐 뒤 값 */
export function setHomeHpOf(save: Pick<SaveData, 'nest'>, fraction: number): number {
  return setHomeHp(save.nest, fraction);
}
