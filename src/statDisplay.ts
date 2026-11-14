// 능력치 표시 (GDD 245장 4): 화면에 보이는 값만 바꾼다 — 엔진 수치는 그대로.
//  체력 = 최대 체력(전투 체력과 같은 숫자) · 공격속도 = 'n.n초에 1번'(일반 공격 간격) · 블록속도 = 'n.n초에 1개'(블록 생성 간격) · 힘·지능 = 능력치 그대로
//  방어·정신력 = 받는 피해 배율(권장 단계 적 기준, 1.00 = 기준 적과 같은 능력치). 받는 피해 = 적 공격 능력치 ÷ 내 방어 능력치에 비례.
// 종족 무관: 능력치 이름은 부르는 쪽이 종족 설정(statName)으로 붙인다.
import { STAT_IDS, type StatId, type Stats } from './data/schema';
import { baseSpawnSecondsOf, defaultCombatParams, playerAttackSecondsOf, type CombatParams } from './engine/combat';

export interface StatDisplay {
  /** 화면 값 글자 (예 '115', '1.2초에 1번', '×0.83') */
  text: string;
  /** 숫자만 (정렬·시험용) */
  value: number;
}

/** 받는 피해 배율 글자 '×0.83' (소수 둘째 자리) */
export const takenText = (m: number): string => `×${m.toFixed(2)}`;
/** 공격 간격 글자 '0.78초에 1번' (소수 둘째 자리 — GDD v6.055 8절 최소 단위·표시 0.01초, C.446) */
export const intervalText = (sec: number): string => `${sec.toFixed(2)}초에 1번`;
/** 블록 생성 간격 글자 '2.54초에 1개' (소수 둘째 자리, C.446) */
export const spawnText = (sec: number): string => `${sec.toFixed(2)}초에 1개`;

/**
 * 능력치 7개 → 화면 값. params = 실제 전투와 같은 식으로 만든 전투 수치(빌드·진화·장비 반영, 없으면 기본값), enemyRef = 권장 단계 적의 능력치(그 단계 기준 능력치).
 * 체력: playerMaxHp × (체력 ÷ 세계 기준) × 체력 배율 — 전투 시작 체력과 같은 식(combat createCombat · home homeMaxHp)
 * 공격속도: playerAttackSecondsOf — 전투의 일반 공격 간격 그대로(상한 0.3초)
 * 블록속도: baseSpawnSecondsOf — 평소 블록 생성 간격(출현표 평균 × 블록속도 배율, 상한 1초) (C.446)
 * 방어·정신력: 기준 적 공격 능력치(enemyRef) ÷ 내 방어·정신력
 */
export function statDisplay(stats: Stats, enemyRef: number, params: Partial<CombatParams> = {}): Record<StatId, StatDisplay> {
  const p: CombatParams = { ...defaultCombatParams(), ...params, playerStats: stats };
  const maxHp = p.playerMaxHp * (stats.hp / p.playerRefStat) * p.playerHpScale;
  const sec = playerAttackSecondsOf(p);
  const spawnSec = baseSpawnSecondsOf(p);
  const taken = (d: number) => enemyRef / Math.max(1e-6, d);
  const out = {} as Record<StatId, StatDisplay>;
  for (const k of STAT_IDS) {
    if (k === 'hp') out[k] = { text: String(Math.ceil(maxHp - 1e-6)), value: maxHp }; // 체력 막대 숫자와 같은 올림 (bha/battle hpNumbers)
    else if (k === 'aspd') out[k] = { text: intervalText(sec), value: sec };
    else if (k === 'bspd') out[k] = { text: spawnText(spawnSec), value: spawnSec };
    else if (k === 'def' || k === 'spr') out[k] = { text: takenText(taken(stats[k])), value: taken(stats[k]) };
    else out[k] = { text: String(Math.round(stats[k])), value: stats[k] };
  }
  return out;
}

/** 표시 값 이름 (방어·정신력은 '받는 물리 피해'·'받는 특수 피해' 를 능력치 이름 옆 작은 글자로) */
export const STAT_DISPLAY_NOTE: Readonly<Partial<Record<StatId, string>>> = {
  hp: '최대 체력',
  def: '받는 피해',
  spr: '받는 피해',
};
