// 등급전 번호 보유자 NPC 10명 (GDD 21장, 양쪽 종족 공유). 이름·속성·능력치·강공격 패턴은 자리 표시 임시 데이터(provisional), 위 번호일수록 강하다.
// 번호(1~10)만 데이터에 있고, 화면 표시 이름(에스파다 No.n / n석 등)은 종족 설정 rankNames 에서 읽는다.
import { parseEnemy } from '../enemies';
import type { EnemyDef } from '../schema';
import raw from './holders.json';

/** 등급 번호 수 (No.1 ~ No.10) */
export const RANK_COUNT = 10;

/** 번호 보유자 = 적 데이터 + 처음 보유한 번호. 원정 출현 풀에는 들어가지 않는다 (ENEMIES 와 별도 파일) */
export interface RankHolderDef extends EnemyDef {
  /** 처음 보유한 번호 (1 = 맨 위). 번호는 등급전으로 바뀌지만 이 NPC 의 강함(데이터)은 그대로다 */
  rank: number;
  /** 이 보유자의 난이도 ★ (GDD 32-1 7번, C.75): 아래 번호일수록 낮고 No.1 = ★5. 적 기준 능력치·체력·공격 배율 */
  difficulty: number;
}

export function parseHolder(r: unknown): RankHolderDef {
  const e = parseEnemy(r) as RankHolderDef;
  if (!Number.isInteger(e.rank) || e.rank < 1 || e.rank > RANK_COUNT) throw new Error(`번호 보유자 데이터 오류 (${e.id}): rank 1~${RANK_COUNT}`);
  if (!Number.isInteger(e.difficulty) || e.difficulty < 1) throw new Error(`번호 보유자 데이터 오류 (${e.id}): difficulty 1 이상`);
  return e;
}

/** 처음 번호 순서(No.1 → No.10) */
export const RANK_HOLDERS: readonly RankHolderDef[] = (raw as unknown[]).map(parseHolder).sort((a, b) => a.rank - b.rank);

if (new Set(RANK_HOLDERS.map((h) => h.rank)).size !== RANK_COUNT || RANK_HOLDERS.length !== RANK_COUNT) throw new Error(`번호 보유자는 번호 1~${RANK_COUNT} 에 한 명씩이어야 한다`);

export function tryGetHolder(id: string): RankHolderDef | undefined {
  return RANK_HOLDERS.find((h) => h.id === id);
}

export function getHolder(id: string): RankHolderDef {
  const h = tryGetHolder(id);
  if (!h) throw new Error(`없는 번호 보유자: ${id}`);
  return h;
}
