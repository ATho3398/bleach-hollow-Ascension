// 적 도감 (GDD 200장, C.330): 만난 적·잡은 수. 기록은 슬롯 하나에 하나(두 트랙 공용 — 적 테이블이 두 종족 공용), 적 id 마다 { seen, kills }. 환생해도 지우지 않는다.
// 잡은 수 = 이긴 전투 수(흡수·놓아주기 모두 포함). 진 전투는 만남만 센다(200장 3). 세는 곳 = 원정 전투 전부(일반·강적·보스)·도전의 탑 층(game.ts recordExpedition·recordTowerBattle).
// 훈련 인형 연습·테스트 전투·등급전(상대 = 다른 보유자)·아란칼화 도전(다른 이름으로 나오는 보스)은 세지 않는다.
// 카드 = 적 테이블의 일반·강적(testOnly 제외) + 보스 테이블. 탑 층 보스는 모두 보스 테이블의 보스라 같은 칸(200장 2). 종족 분기 없음 — 이름·지역 이름·흡수 갈래 이름은 화면이 종족 설정으로 읽는다.
// 흡수 종류별 횟수(200장 9): 흡수 기록(AbsorbRecord)의 갈래 both·trait·stat + 놓아주기(none) — 전투 승리 뒤 흡수 화면에서 고른 것만(첫 원정 연습 흡수는 시스템상 흡수가 아니라 안 센다, 67장).
import { BOSSES } from '../data/bosses';
import { ELEMENT_IDS } from '../data/elements';
import { ENEMIES, enemyPatternKind } from '../data/enemies';
import { ENEMY_PATTERN_KINDS, type EnemyDef } from '../data/schema';
import { absorbModeOf, type RunLog } from './runLog';

/** 흡수 갈래 (엔진 AbsorbMode both·trait·stat) + 놓아주기 none — 표시 이름은 종족 설정 absorbModeNames */
export const ABSORB_KINDS = ['both', 'trait', 'stat', 'none'] as const;
export type AbsorbKind = (typeof ABSORB_KINDS)[number];

export interface EnemyDexEntry {
  /** 만난 수 = 치른 전투 수 (이김·짐 모두) */
  seen: number;
  /** 잡은 수 = 이긴 전투 수 */
  kills: number;
  /** 흡수 종류별 횟수 (200장 9): 둘 다·속성만·능력치만·놓아주기. 합 ≤ kills (흡수 화면 없이 끝난 승리가 있을 수 있다) */
  absorbs: Record<AbsorbKind, number>;
  /** 처음 만난 곳 키: `ground:<사냥터 id>` | `tower`. 표시 이름은 종족 설정(사냥터 이름·탑 이름). null = 모름(런 로그에서 채운 옛 기록) */
  where: string | null;
  /** 처음 만난 시각(ms). 옛 기록에서 채웠으면 0 */
  firstAt: number;
  /** 도감에서 아직 안 본 새 카드 (도감 안 '새' 점 하나, 200장 7 — 알림 없음). 상세를 보면 지운다 */
  fresh?: true;
}

/** 적 id → 기록 */
export type EnemyDex = Record<string, EnemyDexEntry>;

export const WHERE_TOWER = 'tower';
export const whereGround = (groundId: string): string => `ground:${groundId}`;

/** 처음 만난 곳 키 풀기: 사냥터면 { kind: 'ground', id }, 탑이면 { kind: 'tower' }, 모르면 null */
export function parseWhere(where: string | null | undefined): { kind: 'ground'; id: string } | { kind: 'tower' } | null {
  if (where === WHERE_TOWER) return { kind: 'tower' };
  if (typeof where === 'string' && where.startsWith('ground:') && where.length > 7) return { kind: 'ground', id: where.slice(7) };
  return null;
}

export type EnemyCardKind = 'normal' | 'elite' | 'boss';

export interface EnemyCard {
  id: string;
  kind: EnemyCardKind;
  def: EnemyDef;
}

export const ENEMY_CARD_KINDS: readonly EnemyCardKind[] = ['normal', 'elite', 'boss'];

const elementOrder = (id: string) => {
  const i = ELEMENT_IDS.indexOf(id);
  return i < 0 ? ELEMENT_IDS.length : i;
};
const patternOrder = (def: EnemyDef) => {
  const i = ENEMY_PATTERN_KINDS.indexOf(enemyPatternKind(def));
  return i < 0 ? ENEMY_PATTERN_KINDS.length : i;
};
/** 속성 순 → 패턴 순 (basic·swift·sturdy / heavy-seal·heavy-chain·stance) → 데이터 순 */
const byElementThenPattern = (a: EnemyDef, b: EnemyDef) => elementOrder(a.element) - elementOrder(b.element) || patternOrder(a) - patternOrder(b);

function buildCards(): EnemyCard[] {
  const real = ENEMIES.filter((e) => !e.testOnly);
  const normal = real.filter((e) => e.class === 'normal').slice().sort(byElementThenPattern);
  const elite = real.filter((e) => e.class === 'elite').slice().sort(byElementThenPattern);
  const bosses = BOSSES.slice().sort((a, b) => elementOrder(a.enemy.element) - elementOrder(b.enemy.element));
  return [
    ...normal.map((def): EnemyCard => ({ id: def.id, kind: 'normal', def })),
    ...elite.map((def): EnemyCard => ({ id: def.id, kind: 'elite', def })),
    ...bosses.map((b): EnemyCard => ({ id: b.id, kind: 'boss', def: b.enemy })),
  ];
}

/** 도감 카드 목록 (200장 2 순서: 일반 → 강적 → 보스, 속성 순) */
export const ENEMY_CARDS: readonly EnemyCard[] = buildCards();
const CARD_IDS: ReadonlySet<string> = new Set(ENEMY_CARDS.map((c) => c.id));

export function isEnemyCardId(id: unknown): id is string {
  return typeof id === 'string' && CARD_IDS.has(id);
}

export function enemyCard(id: string): EnemyCard | undefined {
  return ENEMY_CARDS.find((c) => c.id === id);
}

export const emptyAbsorbs = (): Record<AbsorbKind, number> => ({ both: 0, trait: 0, stat: 0, none: 0 });

/** 전투 하나를 도감에 더한다. 도감 카드가 아닌 적(테스트 적 등)은 무시. 처음 만난 카드는 '새' 표시 */
export function noteEnemyBattle(dex: EnemyDex, enemyId: string, won: boolean, where: string | null, nowMs: number): EnemyDexEntry | null {
  if (!CARD_IDS.has(enemyId)) return null;
  let e = dex[enemyId];
  if (!e) e = dex[enemyId] = { seen: 0, kills: 0, absorbs: emptyAbsorbs(), where, firstAt: nowMs, fresh: true };
  e.seen++;
  if (won) e.kills++;
  return e;
}

/** 흡수 화면의 선택 하나를 더한다 (200장 9): mode = 흡수 갈래, null = 놓아주기. 전투 기록이 아직 없으면(옛 기록 순서 등) 이긴 전투 하나로 친다 */
export function noteEnemyAbsorb(dex: EnemyDex, enemyId: string, mode: 'both' | 'trait' | 'stat' | null, nowMs: number): EnemyDexEntry | null {
  if (!CARD_IDS.has(enemyId)) return null;
  const e = dex[enemyId] ?? noteEnemyBattle(dex, enemyId, true, null, nowMs)!;
  e.absorbs ??= emptyAbsorbs();
  e.absorbs[mode ?? 'none']++;
  return e;
}

/** 도감에서 카드를 봤다 — '새' 점을 지운다. 지운 것이 있으면 true */
export function markEnemyCardSeen(dex: EnemyDex, enemyId: string): boolean {
  const e = dex[enemyId];
  if (!e?.fresh) return false;
  delete e.fresh;
  return true;
}

export function enemyKnown(dex: EnemyDex, enemyId: string): boolean {
  return (dex[enemyId]?.seen ?? 0) > 0;
}

/** 발견 수: 전체와 종류별 */
export function enemyDexCounts(dex: EnemyDex): { found: number; total: number; byKind: Record<EnemyCardKind, { found: number; total: number }> } {
  const byKind = { normal: { found: 0, total: 0 }, elite: { found: 0, total: 0 }, boss: { found: 0, total: 0 } };
  let found = 0;
  for (const c of ENEMY_CARDS) {
    byKind[c.kind].total++;
    if (enemyKnown(dex, c.id)) {
      found++;
      byKind[c.kind].found++;
    }
  }
  return { found, total: ENEMY_CARDS.length, byKind };
}

const nonNegInt = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

/** 저장된 도감 정리 (깨진 값 보정): 카드가 아닌 id·만난 적 없는 칸은 버린다, kills ≤ seen, 흡수 갈래 수는 0 이상 정수 */
export function sanitizeEnemyDex(raw: unknown): EnemyDex {
  const out: EnemyDex = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!CARD_IDS.has(id)) continue;
    const e = (typeof v === 'object' && v !== null ? v : {}) as Partial<Record<keyof EnemyDexEntry, unknown>>;
    const seen = nonNegInt(e.seen);
    if (seen <= 0) continue;
    const kills = Math.min(seen, nonNegInt(e.kills));
    const where = parseWhere(typeof e.where === 'string' ? e.where : null) ? (e.where as string) : null;
    const rawAb = (typeof e.absorbs === 'object' && e.absorbs !== null ? e.absorbs : {}) as Record<string, unknown>;
    const absorbs = emptyAbsorbs();
    for (const k of ABSORB_KINDS) absorbs[k] = nonNegInt(rawAb[k]);
    out[id] = { seen, kills, absorbs, where, firstAt: nonNegInt(e.firstAt), ...(e.fresh === true ? { fresh: true as const } : {}) };
  }
  return out;
}

/** 옛 세이브(형식 63 이하) 채우기 (200장 5): 런 로그에서 알 수 있는 만큼 — 원정 전투(battles, 일반·강적·보스 — runId 가 있는 것 = 원정; 연습·테스트·탑·아란칼화 제외)는 그 원정 기록의 사냥터를,
 *  탑 전투(towerBattles)는 탑을 처음 만난 곳으로, 흡수 기록(absorbs)은 갈래별 횟수로. 두 트랙 런 로그를 다 합친다. 시각은 모른다(0). 이미 다 만난 적이라 '새' 점은 없다 */
export function enemyDexFromLogs(logs: readonly RunLog[]): EnemyDex {
  const dex: EnemyDex = {};
  for (const log of logs) {
    const grounds = new Map<number, string>();
    for (const r of log.runs ?? []) if (r.groundId && !grounds.has(r.runId)) grounds.set(r.runId, r.groundId);
    for (const b of log.battles ?? []) {
      if (!b.runId || b.runId <= 0) continue;
      if (b.enemyClass !== 'normal' && b.enemyClass !== 'elite' && b.enemyClass !== 'boss') continue;
      const g = grounds.get(b.runId);
      noteEnemyBattle(dex, b.enemyId, b.won, g ? whereGround(g) : null, 0);
    }
    for (const t of log.towerBattles ?? []) noteEnemyBattle(dex, t.bossId ?? t.enemyId, t.won, WHERE_TOWER, 0);
    for (const a of log.absorbs ?? []) noteEnemyAbsorb(dex, a.enemyId, absorbModeOf(a), 0); // 흡수 종류별 횟수 (200장 9)
  }
  for (const e of Object.values(dex)) delete e.fresh;
  return dex;
}

/** 원정 기록용: 이긴 전투의 적 id → 수 (9장, RunRecord.kills) */
export function killsByEnemy(battles: readonly { enemyId: string; won: boolean }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of battles) if (b.won) out[b.enemyId] = (out[b.enemyId] ?? 0) + 1;
  return out;
}
