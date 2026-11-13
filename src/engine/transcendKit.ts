// 초월자 전용 블록·성장 (GDD 12-4 v6.048 '초월자 블록·성장'·'아이젠', C.441 — 수치 전부 provisional).
// 데이터(src/data/transcendents/transcendents.json 의 kit = 이름·장치) + 수치(BALANCE.provisional.transcendentKits) → 전투 파라미터 kit.
// 엔진은 장치(반격 창·스택·해방 치환·되살아나기·회피)만 보고 초월자·블록 id 로 분기하지 않는다.

import { BALANCE } from '../config/balance';
import { tryGetTranscendent, type TranscendentKitDef } from '../data/transcendents';
import type { CombatKit, CombatKitBlock } from './combat/combat';

const GROW = BALANCE.provisional.transcendentGrowth;

/** 진화 상태에 넣는 초월자 전용 블록 상태 (형식 85): 초월자 id + 블록마다 강화 단계(0 = 강화 없음) */
export interface KitState {
  id: string;
  levels: Record<string, number>;
}

/** 이 초월자의 전용 블록 데이터 (없으면 null — 블록 [미정]인 초월자) */
export function kitDefOf(transcendentId: string | null | undefined): TranscendentKitDef | null {
  if (!transcendentId) return null;
  const def = tryGetTranscendent(transcendentId)?.kit;
  return def && BALANCE.provisional.transcendentKits[transcendentId] ? def : null;
}

/** 강화 단계를 매기는 블록들 (upgradeAs 가 없는 블록 — 프라고르는 경화수월 단계를 같이 쓴다) */
export function upgradableBlocks(transcendentId: string): { id: string; name: string }[] {
  const def = kitDefOf(transcendentId);
  return def ? def.blocks.filter((b) => !b.upgradeAs).map((b) => ({ id: b.id, name: b.name })) : [];
}

export function kitLevelOf(k: Pick<KitState, 'levels'>, blockId: string): number {
  const v = k.levels[blockId];
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(GROW.maxLevel, Math.max(0, Math.floor(v))) : 0;
}

/** 강화 배율: 1 + 강마다 perLevel */
export function kitLevelMultiplier(level: number): number {
  return 1 + GROW.perLevel * Math.max(0, level);
}

/** 다음 강(n강) 비용 = costPerLevel × n 조각. 이미 최대면 null */
export function kitUpgradeCost(k: Pick<KitState, 'levels'>, blockId: string): number | null {
  const lv = kitLevelOf(k, blockId);
  return lv >= GROW.maxLevel ? null : GROW.costPerLevel * (lv + 1);
}

export type KitUpgradeResult = { ok: true; level: number; cost: number } | { ok: false; reason: string };

/** 전용 블록 1강 올리기: 조각을 cost 만큼 쓴다 (shards = 슬롯 공유 보유 — 부르는 쪽이 빼고 기록한다) */
export function upgradeKitBlock(k: KitState, blockId: string, shards: number): KitUpgradeResult {
  if (!upgradableBlocks(k.id).some((b) => b.id === blockId)) return { ok: false, reason: '강화할 수 없는 블록이다' };
  const cost = kitUpgradeCost(k, blockId);
  if (cost === null) return { ok: false, reason: '이미 최대 강화다' };
  if (shards < cost) return { ok: false, reason: `초월 조각이 모자란다 (${cost}개 필요)` };
  const level = kitLevelOf(k, blockId) + 1;
  k.levels[blockId] = level;
  return { ok: true, level, cost };
}

/** 이긴 전투에서 나오는 초월 조각 (일반 1·강적 3·보스 8) */
export function transcendShardsFor(cls: 'normal' | 'elite' | 'boss'): number {
  return GROW.drops[cls];
}

/** 전투 기록들에서 조각 합 (이긴 전투만, 보스 = enemyId 가 보스 목록에 있는가는 부르는 쪽이 class 로 넘긴다) */
export function transcendShardsOfBattles(battles: readonly { won: boolean; enemyClass: string; boss?: boolean }[]): number {
  let n = 0;
  for (const b of battles) {
    if (!b.won) continue;
    n += transcendShardsFor(b.boss ? 'boss' : b.enemyClass === 'elite' ? 'elite' : 'normal');
  }
  return n;
}

/** 전투 파라미터 kit (데이터 + 수치 + 강화 단계). 데이터·수치가 없으면 null */
export function combatKitOf(k: KitState | null | undefined): CombatKit | null {
  if (!k) return null;
  const def = kitDefOf(k.id);
  const num = BALANCE.provisional.transcendentKits[k.id];
  if (!def || !num) return null;
  const blocks: CombatKitBlock[] = [];
  for (const b of def.blocks) {
    const n = num.blocks[b.id];
    if (!n) continue;
    const mult = kitLevelMultiplier(kitLevelOf(k, b.upgradeAs ?? b.id));
    const tierNames = n.tiers.map((_, i) => b.tierNames?.[i] ?? b.name);
    blocks.push({
      id: b.id, name: b.name, short: b.short, fx: b.fx, tierNames, weight: n.weight, power: n.power, tiers: [...n.tiers], mult,
      ...(n.maxOnRail !== undefined ? { maxOnRail: n.maxOnRail } : {}),
      ...(b.solo ? { solo: true } : {}),
      ...(b.releaseOnly ? { releaseOnly: true } : {}),
      ...(b.releaseSwap ? { releaseSwap: b.releaseSwap } : {}),
      ...(b.counter && n.counter ? { counter: { ...n.counter, line: b.counter.line } } : {}),
      ...(b.stack && n.stack && n.finisher ? { stack: { ...n.stack, finisherName: b.stack.finisherName, finisherPower: n.finisher.power, enemyStunSeconds: n.finisher.enemyStunSeconds } } : {}),
    });
  }
  if (!blocks.some((b) => !b.releaseOnly)) return null;
  return {
    id: k.id,
    liberationName: def.liberationName,
    stackName: def.stackName ?? '',
    blocks,
    evadeChance: def.evade ? num.evadeChance ?? 0 : 0,
    ...(def.riskRelease && num.riskRelease ? { riskRelease: { minRisk: num.riskRelease.minRisk, costPerUse: num.riskRelease.costPerUse, limit: BALANCE.provisional.risk.limit } } : {}),
    ...(def.riskPenaltyFree ? { riskPenaltyFree: true } : {}),
    ...(def.revive && num.revive ? { revive: { hpFraction: num.revive.hpFraction, line: def.revive.line } } : {}),
  };
}

/** 이 초월자 트랙의 리스크 게이지 이름 덮어쓰기 (GDD 12-4 v6.050 — 아이젠 '호로화'). 전투 기반·종족과 상관없음. 없으면 null */
export function kitRiskGaugeNameOf(transcendentId: string | null | undefined): string | null {
  return kitDefOf(transcendentId)?.riskGaugeName ?? null;
}

/** 이 초월자 트랙은 리스크 패널티(폭주 돌파·그 뒤 손해)를 받지 않는가 (GDD 12-4 v6.050 — 쌓이기만 한다). 전투 기반과 상관없음 */
export function kitRiskPenaltyFree(transcendentId: string | null | undefined): boolean {
  return kitDefOf(transcendentId)?.riskPenaltyFree === true;
}

/** 종족 설정의 리스크 게이지 이름을 초월자 데이터로 덮은 사본 (덮을 게 없으면 그대로) — 화면이 트랙 종족 설정 대신 쓴다 */
export function withKitRiskName<F extends { riskGaugeName: string }>(f: F, transcendentId: string | null | undefined): F {
  const name = kitRiskGaugeNameOf(transcendentId);
  return name && name !== f.riskGaugeName ? { ...f, riskGaugeName: name } : f;
}
