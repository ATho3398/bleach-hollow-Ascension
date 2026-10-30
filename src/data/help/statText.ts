// 능력치가 무엇에 쓰이는지 (GDD 141장 2): 상태 화면 능력치 ⓘ 창 문구. 이름은 종족 설정 표기(statName), 수치 공식은 도움말 '능력치'(glossary.json)
// 평타 = {stat.atk} ÷ 적 {stat.def}, 블록 공격 전부 = {stat.int} ÷ 적 {stat.spr} (126-1 확정 ③). 블록 타입(물리/특수/혼합)은 말하지 않는다(137장 1)
import { STAT_IDS, type StatId } from '../schema';
import { statName } from '../elements';
import { fixParticles } from '../../engine/josa';
import type { FactionConfig } from '../../engine/faction';

type Names = Pick<FactionConfig, 'id' | 'skillBlockName'>;

/** 능력치 한 줄씩 '이름 = 하는 일' */
export function statUseLines(f: Names): string[] {
  const n = (id: StatId): string => statName(id, f.id);
  const use: Record<StatId, string> = {
    hp: '최대 체력',
    atk: `일반 공격(평타) 피해 — 상대 ${n('def')}과(와) 맞선다`,
    int: `블록 공격 피해(${f.skillBlockName}·기본 공격 블록·콤보 등 전부) — 상대 ${n('spr')}과(와) 맞선다`,
    def: `적의 ${n('atk')}이(가) 실린 공격을 막는다`,
    spr: `적의 ${n('int')}이(가) 실린 공격을 막는다`,
    spd: '평타가 나가는 빠르기',
  };
  return STAT_IDS.map((id) => fixParticles(`${n(id)} = ${use[id]}`));
}

/** ⓘ 창 한 줄 요약 */
export function statUseLead(f: Pick<FactionConfig, 'id'>): string {
  return fixParticles(`평타는 ${statName('atk', f.id)}, 블록 공격은 ${statName('int', f.id)}을(를) 따라간다.`);
}
