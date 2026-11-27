// 토벌전 작전 (GDD 6-16 v6.246, C.566 — 사용자 2026-11-27 "이건 토벌전이라고 만들어놔. 보스던전 모험 버전"): 엔진이 읽는 것만 — 끝 보스·사냥터·고정 길.
// 이름·문구는 종족 설정 specialDungeon.raids (엔진은 작전 id 로 분기하지 않는다). 전부 provisional
import { getBossRush } from '../bossRush';
import { isGroundId } from '../grounds';
import raw from './raids.json';

export type RaidCellClass = 'normal' | 'elite';

export interface RaidDef {
  id: string;
  /** 끝 보스 = 보스전 보스 id (br-…). 열림 = 보스전에서 이 보스를 한 번 이긴 뒤 */
  boss: string;
  /** 일반·강적 출현 풀 사냥터 */
  ground: string;
  /** 고정 길: 칸 번호(1~10) → 일반·강적. 마지막 칸(11) = 보스 */
  road: Readonly<Record<number, RaidCellClass>>;
}

function parseRaid(r: unknown): RaidDef {
  const o = (r ?? {}) as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof o.id !== 'string' || !o.id.startsWith('raid-')) errors.push('id: raid-…');
  if (typeof o.boss !== 'string' || !getBossRush(o.boss)) errors.push(`boss: 보스전 보스 id (${String(o.boss)})`);
  if (!isGroundId(o.ground)) errors.push(`ground: 없는 사냥터 ${String(o.ground)}`);
  const road: Record<number, RaidCellClass> = {};
  for (const [k, v] of Object.entries((o.road ?? {}) as Record<string, unknown>)) {
    const c = Number(k);
    if (!Number.isInteger(c) || c < 1 || c > 10 || (v !== 'normal' && v !== 'elite')) errors.push(`road.${k}: 칸 1~10 → normal | elite`);
    else road[c] = v;
  }
  if (Object.keys(road).length === 0) errors.push('road: 전투 칸 1개 이상');
  if (errors.length > 0) throw new Error(`토벌전 작전 데이터 오류 (${String(o.id ?? '?')}): ${errors.join(', ')}`);
  return { id: o.id as string, boss: o.boss as string, ground: o.ground as string, road };
}

export const RAIDS: readonly RaidDef[] = (raw as { raids: unknown[] }).raids.map(parseRaid);

export function getRaid(id: string): RaidDef | undefined {
  return RAIDS.find((r) => r.id === id);
}
