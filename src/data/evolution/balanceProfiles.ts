// 진화체 목표 모양 = 성장 곡선 × 전투 성향 (GDD 8-7 '진화체 밸런스 표기', v6.171 · C.523)
// 데이터 = balanceProfiles.json(진화체 id × 종족 → { curve, lean } 또는 null). 배정·조정은 마스터(GDD v6.173), 측정·가드는 scripts/lib/evoProfile.ts.
// **개발용 내부 표기 — 게임 화면·도감 등 플레이어에게 보이지 않는다**(사용자 2026-11-23): src/ui·화면 코드는 이 모듈을 import 하지 않는다(tests/c523 가 막음).
// 종족 분기 없음 — 종족 키는 factions/*.json id 를 그대로 쓰고, 곡선·성향 id 는 이 json 과 balance provisional.evoProfile 이 같은 목록을 가진다.
import { BALANCE } from '../../config/balance';
import { FACTIONS } from '../factions';
import { FORM_TABLE } from './index';
import { STAT_IDS, type StatId } from '../schema';
import raw from './balanceProfiles.json';

/** curve = null 이면 성향만 정한 몸(강제 배정 등), lean = null 이면 성향 없음.
 *  timed = 시간 제한 능력(GDD v6.178 — n초 스택·버프·'n초 안' 조건·재생 시간)의 한 줄 설명: 노력 곡선만, 가드가 고점(둘 다)도 본다 (C.525) */
/** investFocus = 그 진화체 능력이 요구하는 능력치(C.528, GDD v6.181 — 측정 '노력치만'·'둘 다' 칸이 이 능력치를 상한까지 몰아 찍음, 측정 전용·게임 규칙 아님).
 *  기준 = 능력이 켜지는 조건: 일반 공격 횟수·n초 창 안 일반 공격 → aspd / 블록 생성·체인 연속 → bspd / 블록·체인 위력 비례 → int / 일반 공격 피해 비례 → atk / 최대 체력 비례 → hp */
export interface BalanceProfile { curve: string | null; lean: string | null; timed?: string; investFocus?: StatId }
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
      if (keys.some((k) => k !== 'curve' && k !== 'lean' && k !== 'timed' && k !== 'investFocus')) errors.push(`${id}/${fid}: 모르는 칸 ${keys.join(',')}`);
      if (v.timed !== undefined && (typeof v.timed !== 'string' || v.timed === '' || v.curve !== 'effort')) errors.push(`${id}/${fid}: timed(시간 제한 능력)는 빈칸 아닌 글자 · 노력 곡선만 (GDD v6.178)`);
      if (v.investFocus !== undefined && !(STAT_IDS as readonly string[]).includes(v.investFocus)) errors.push(`${id}/${fid}: investFocus 는 능력치 id(${STAT_IDS.join('·')}) — ${String(v.investFocus)}`);
      if (v.curve !== null && !curveIds.includes(v.curve)) errors.push(`${id}/${fid}: 모르는 곡선 ${String(v.curve)}`);
      if (v.curve === null && v.lean === null) errors.push(`${id}/${fid}: 곡선·성향이 둘 다 null 이면 칸 자체를 null 로`);
      if (v.lean !== null && !leanIds.includes(v.lean)) errors.push(`${id}/${fid}: 모르는 성향 ${String(v.lean)}`);
    }
  }
  return errors;
}
