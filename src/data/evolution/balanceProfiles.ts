// 진화체 목표 모양 = 성장 곡선 × 전투 성향 (GDD 8-7 '진화체 밸런스 표기', v6.171 · C.523)
// 데이터 = balanceProfiles.json(진화체 id × 종족 → { curve, lean } 또는 null). 배정은 기획A 가 사용자와 정하고, 측정·가드는 scripts/lib/evoProfile.ts.
// 종족 분기 없음 — 종족 키는 factions/*.json id 를 그대로 쓰고, 곡선·성향 id 는 이 json 과 balance provisional.evoProfile 이 같은 목록을 가진다.
import { BALANCE } from '../../config/balance';
import { FACTIONS } from '../factions';
import { FORM_TABLE } from './index';
import raw from './balanceProfiles.json';

export interface BalanceProfile { curve: string; lean: string | null }
export interface BalanceProfileFile {
  curves: { id: string; name: string }[];
  leans: { id: string; name: string }[];
  forms: Record<string, Record<string, BalanceProfile | null>>;
}

const DATA = raw as unknown as BalanceProfileFile;

export const PROFILE_CURVES: readonly { id: string; name: string }[] = DATA.curves;
export const PROFILE_LEANS: readonly { id: string; name: string }[] = DATA.leans;

export const curveName = (id: string): string => PROFILE_CURVES.find((c) => c.id === id)?.name ?? id;
export const leanName = (id: string | null): string => (id === null ? '성향 없음' : PROFILE_LEANS.find((c) => c.id === id)?.name ?? id);

/** 그 진화체 × 종족의 목표 모양. 칸이 없거나 아직 안 정했으면 null */
export function balanceProfileOf(formId: string, factionId: string, d: BalanceProfileFile = DATA): BalanceProfile | null {
  return d.forms[formId]?.[factionId] ?? null;
}

/** 데이터 검사: 4단계 진화체(retired 제외) × 종족마다 칸이 있고, 값은 null 또는 { curve: 곡선 id, lean: 성향 id | null }.
 *  곡선·성향 목록은 balance provisional.evoProfile(원형·문턱)과 같아야 측정이 빠짐없이 돈다 */
export function validateBalanceProfiles(d: BalanceProfileFile = DATA, factionIds: readonly string[] = FACTIONS.map((f) => f.id)): string[] {
  const errors: string[] = [];
  const P = BALANCE.provisional.evoProfile;
  const curveIds = d.curves.map((c) => c.id);
  const leanIds = d.leans.map((c) => c.id);
  const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));
  if (!same(curveIds, Object.keys(P.curve.prototypes))) errors.push(`곡선 목록 ${curveIds.join(',')} 이 balance evoProfile.curve.prototypes 와 다르다`);
  if (!same(curveIds, Object.keys(P.guard))) errors.push(`곡선 목록 ${curveIds.join(',')} 이 balance evoProfile.guard 와 다르다`);
  if (!same(leanIds, Object.keys(P.lean.thresholds))) errors.push(`성향 목록 ${leanIds.join(',')} 이 balance evoProfile.lean.thresholds 와 다르다`);
  const t4 = FORM_TABLE.filter((f) => f.tier === 4 && !f.retired).map((f) => f.id);
  for (const id of t4) if (!d.forms[id]) errors.push(`${id}: balanceProfiles.json 에 칸이 없다 (4단계 진화체는 모두 칸을 둔다 — 정하지 않았으면 null)`);
  for (const [id, byFaction] of Object.entries(d.forms)) {
    if (!t4.includes(id)) { errors.push(`${id}: 4단계 진화체가 아니다(없는 id 또는 retired)`); continue; }
    for (const fid of factionIds) if (!(fid in byFaction)) errors.push(`${id}: 종족 ${fid} 칸이 없다`);
    for (const [fid, v] of Object.entries(byFaction)) {
      if (!factionIds.includes(fid)) errors.push(`${id}: 모르는 종족 ${fid}`);
      if (v === null) continue;
      const keys = Object.keys(v);
      if (keys.some((k) => k !== 'curve' && k !== 'lean')) errors.push(`${id}/${fid}: 모르는 칸 ${keys.join(',')}`);
      if (!curveIds.includes(v.curve)) errors.push(`${id}/${fid}: 모르는 곡선 ${String(v.curve)}`);
      if (v.lean !== null && !leanIds.includes(v.lean)) errors.push(`${id}/${fid}: 모르는 성향 ${String(v.lean)}`);
    }
  }
  return errors;
}
