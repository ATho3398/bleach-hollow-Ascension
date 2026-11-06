// 블록마다 다른 점 한 줄 (GDD 193장 5, C.312): 같은 속성 안에서 설명이 글자까지 같던 블록(흙 조 / 흙 교 / 흙 탄, 불 참 / 불 권 / 불 귀)을 실제 데이터 차이로 가른다.
// 공격 블록 = 계열(종족 설정 families: 계열 이름 · 체인 1→2→3단계 기술 이름 · 3단계 추가 효과) / 막기·회복 = 역할 + 체인 추가 효과 / 패시브 = 오르는 능력치 종류 / 외형 파츠 = 표시만.
// 수치(위력 회분·배율·강화 %)는 흡수 화면에 안 보인다(158장 4 — 가방 블록 상세에서). 종족 분기 없음: 전부 종족 설정·특성 데이터에서 읽는다. 한 줄(마침표 없음, text-style 2장).
import { getTrait } from '../data/traits';
import type { ChainBonus, PassiveStat } from '../data/schema';
import { fixParticles } from '../engine/josa';
import { familyOf, type FactionConfig } from '../engine/faction';

/** 패시브가 건드리는 능력치 이름 (데이터 passive.stat → 플레이어 말) */
export const PASSIVE_STAT_TEXT: Record<PassiveStat, string> = {
  attackPower: '기본 공격 위력',
  attackSpeed: '기본 공격 속도',
  damageTaken: '받는 피해',
  blockSpawn: '블록 생성 속도',
};

/** 체인 추가 효과 한 토막 (엔진 applyChainBonus 와 같은 뜻): 경직 = 적 행동 n초 지연, 반사, 정화 = 봉인 해제 */
export function chainBonusText(bonus: ChainBonus | undefined | null): string | null {
  if (!bonus) return null;
  if (bonus.kind === 'stagger') return `적 행동 ${bonus.value}초 지연`;
  if (bonus.kind === 'reflect') return '피해 반사';
  if (bonus.kind === 'cleanse') return '봉인 해제';
  return null;
}

export type TraitDiffFaction = Pick<FactionConfig, 'families' | 'roleNames'>;

/** 그 블록만의 차이 한 줄. 같은 속성·같은 종류 블록끼리 서로 다른 글이 나온다(tests/c312).
 *  short = 좁은 줄(넣을 곳 슬롯 줄)용: 공격 블록의 1→2→3단계 기술 이름을 뺀다(계열 이름 · 3단계 추가 효과만) */
export function traitDiffLine(faction: TraitDiffFaction, id: string, o: { short?: boolean } = {}): string {
  const t = getTrait(id);
  const parts: string[] = [];
  if (t.kind === 'skill') {
    if (t.role === 'attack') {
      const f = t.family ? familyOf(faction, t.family) : undefined;
      if (f) {
        parts.push(`${f.name} 계열`);
        if (!o.short) parts.push(f.tiers.map((x) => x.name).join(' → '));
        const last = f.tiers[f.tiers.length - 1];
        const b = chainBonusText(last?.bonus);
        if (b) parts.push(`${f.tiers.length}단계 ${b}`);
      } else parts.push(faction.roleNames.attack);
    } else if (t.role) {
      parts.push(faction.roleNames[t.role]);
      const b = chainBonusText(t.chainBonus);
      if (b) parts.push(`체인 ${b}`);
    }
  } else if (t.kind === 'passive' && t.passive) {
    // 받는 피해는 배율이 1 아래일 때가 좋은 쪽(준다), 나머지는 1 위가 오르는 쪽
    const good = t.passive.stat === 'damageTaken' ? t.passive.multiplier < 1 : t.passive.multiplier > 1;
    const verb = t.passive.stat === 'damageTaken' ? (good ? '준다' : '늘어난다') : good ? '오른다' : '떨어진다';
    parts.push(`${PASSIVE_STAT_TEXT[t.passive.stat]}이(가) ${verb}`);
  } else if (t.kind === 'part') parts.push('외형만 바뀐다');
  if (t.critChance) parts.push('치명타 확률이 오른다');
  return fixParticles(parts.join(' · '));
}
