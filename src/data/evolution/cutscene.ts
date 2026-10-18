// 진화 연출 줄 (UI 적용 U-3, 디자인의 "제안 문구" evo1~3): 종족 id 를 키로 조회만 하고 코드에서 분기하지 않는다.
// 키가 없는 종족은 '*' 공통 문구(종족 설정 값을 끼워 쓴다)로 나온다. 문구는 모두 임시(provisional).
import { pickFaction, type PerFaction } from '../schema';
import raw from './cutscene.json';

export const CUTSCENE_LINE_COUNT = 3;

export interface CutsceneData {
  provisional: boolean;
  lines: PerFaction<string[]>;
}

/** 모르는 JSON 을 검증한다: '*' 공통 문구가 있고, 모든 목록이 비어 있지 않은 문자열 3줄 */
export function parseCutscene(r: unknown): CutsceneData {
  const d = (r ?? {}) as Record<string, unknown>;
  const lines = (d.lines ?? {}) as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof d.provisional !== 'boolean') errors.push('provisional');
  if (!Array.isArray(lines['*'])) errors.push("lines['*'] (공통 문구)");
  for (const [k, v] of Object.entries(lines)) {
    if (!Array.isArray(v) || v.length !== CUTSCENE_LINE_COUNT || !v.every((s) => typeof s === 'string' && s.length > 0)) {
      errors.push(`lines.${k}: 비어 있지 않은 문자열 ${CUTSCENE_LINE_COUNT}줄`);
    }
  }
  if (errors.length > 0) throw new Error(`진화 연출 데이터 오류: ${errors.join(', ')}`);
  return r as CutsceneData;
}

export const CUTSCENE: CutsceneData = parseCutscene(raw);
export const CUTSCENE_PROVISIONAL: boolean = CUTSCENE.provisional;

export interface CutsceneVars {
  nest: string;
  absorb: string;
  from: string;
}

/** 연출 줄 3개. {nest} {absorb} {from} 을 종족 설정 값으로 바꾼다 */
export function cutsceneLines(factionId: string, vars: CutsceneVars, data: CutsceneData = CUTSCENE): string[] {
  return pickFaction(data.lines, factionId).map((t) => t.replace(/\{(nest|absorb|from)\}/g, (_, k: keyof CutsceneVars) => vars[k]));
}
