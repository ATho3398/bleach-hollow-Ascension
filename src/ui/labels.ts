// 전투 화면 텍스트: 전부 종족 설정(FactionConfig)에서 읽는다. 종족 id 로 분기하지 않는다.
import type { TerrainTileDef } from '../data/schema';
import type { EndReason } from '../engine/expedition';
import { BLOCK_WORDS, familyOf, type BlockRole, type FactionConfig } from '../engine/faction';
import { elementName } from '../data/elements';
import type { SkillRole } from '../data/schema';

export { BLOCK_WORDS };

export interface BattleLabels {
  /** 블록 역할 이름 (공격/막기/회복) */
  role: Record<BlockRole, string>;
  skillBlock: string;
  /** 필살 블록 표시 이름 (GDD 20장 v5.4 `필살`) */
  specialBlock: string;
  /** 저장형 필살기 (GDD 14-6, v5.4 표시 `저장 필살`) */
  storedSkill: string;
  /** 해방 (GDD 22-5): 종족 설정 liberation (이름·컷인·풀릴 때 문구) */
  liberation: { name: string; cutin: string; endText: string };
  /** 공허 블록 표시 이름 (v5.4 `공허`) */
  voidBlock: string;
  chain: string;
  /** 공격 계열 이름·약어·단계 기술 이름 (GDD 17-3, 종족 설정 families) */
  families: FactionConfig['families'];
  sp: string;
  riskGauge: string;
  defeatState: string;
  huntingGround: string;
  factionName: string;
  /** 상성 문구 (GDD 20-2) */
  matchupText: FactionConfig['matchupText'];
}

export function battleLabels(f: FactionConfig): BattleLabels {
  return {
    role: { ...f.roleNames },
    skillBlock: f.skillBlockName,
    specialBlock: BLOCK_WORDS.special,
    storedSkill: BLOCK_WORDS.stored,
    liberation: { ...f.liberation },
    voidBlock: BLOCK_WORDS.void,
    chain: f.chainName,
    families: f.families,
    sp: f.spName,
    riskGauge: f.riskGaugeName,
    defeatState: f.defeatStateName,
    huntingGround: f.huntingGroundName,
    factionName: f.name,
    matchupText: { ...f.matchupText },
  };
}

/** 계열 단계 기술 이름 (계열·단계가 없으면 null): 예 호로 탄 계열 2단계 = "세로" */
export function familySkillName(labels: Pick<BattleLabels, 'families'>, familyId: string | null | undefined, chain: number): string | null {
  if (!familyId) return null;
  return familyOf(labels, familyId)?.tiers[chain - 1]?.name ?? null;
}

/** 계열 한 글자 약어 (없으면 undefined) */
export function familyAbbr(labels: Pick<BattleLabels, 'families'>, familyId: string | null | undefined): string | undefined {
  return familyId ? familyOf(labels, familyId)?.abbr : undefined;
}

/** 블록 이름에 쓰는 속성 이름: 괄호 한자 표기는 뺀다 (예 허(虛) → 허) */
export function blockElementName(elementId: string, factionId: string): string {
  return elementName(elementId, factionId).replace(/\s*\([^)]*\)/g, '').trim();
}

/**
 * 스킬 블록 표시 이름 (GDD 20장 v5.4): 공격 = `속성_계열`(예 불_조), 막기·회복 = `속성_막기`·`속성_회복`.
 * 속성은 데이터(elements), 계열 약어는 종족 설정 families 에서 읽는다. 속성이 없거나 공격인데 계열이 없으면 null
 */
export function skillBlockLabel(labels: Pick<BattleLabels, 'families'>, factionId: string, element: string | null, family: string | null | undefined, role: SkillRole | null): string | null {
  if (!element) return null;
  const tail = role === 'guard' ? BLOCK_WORDS.guard : role === 'heal' ? BLOCK_WORDS.heal : familyAbbr(labels, family);
  return tail ? `${blockElementName(element, factionId)}_${tail}` : null;
}

/** 해방 블록 표시 이름 (GDD 22-5 `속성_해방`): 내 캐릭터 속성. 속성을 모르면 `해방` */
export function liberationBlockLabel(factionId: string, element: string | null | undefined): string {
  return element ? `${blockElementName(element, factionId)}_${BLOCK_WORDS.liberation}` : BLOCK_WORDS.liberation;
}

/** 해방 버튼 설정 (GDD 22-5): 5단계 미만이면 없음(버튼 숨김), 자격이 모자라면 무엇이 부족한지 한 줄 */
export function liberationButton(f: Pick<FactionConfig, 'training' | 'rankBattleName'>, access: { visible: boolean; usable: boolean; missing: ('training' | 'rank')[] }): { note: string | null } | undefined {
  if (!access.visible) return undefined;
  if (access.usable) return { note: null };
  const parts = access.missing.map((m) => (m === 'training' ? `${f.training.title} 완료` : `${f.rankBattleName} 번호`));
  return { note: `잠김 — ${parts.join(' · ')} 필요` };
}

/** 콤보 블록 표시 이름 (v5.4 `콤보_계열`). 계열을 모르면 `콤보` */
export function comboBlockLabel(labels: Pick<BattleLabels, 'families'>, family: string | null | undefined): string {
  const abbr = familyAbbr(labels, family);
  return abbr ? `${BLOCK_WORDS.combo}_${abbr}` : BLOCK_WORDS.combo;
}

/** 지형 타일 효과 설명: 효과 종류는 엔진, 문구는 종족 무관 */
export function tileHint(t: TerrainTileDef): string {
  const e = t.effect;
  if (e.type === 'spawn') return e.enemyClass === 'elite' ? '강적 출현 + 좋은 보상' : '약한 적 출현';
  if (e.type === 'rest') return '허기·컨디션 회복 (시간 소모)';
  return {
    reshuffle: '전투 중 블록 바의 순서가 주기적으로 섞인다',
    power: '전투 공격 위력 ×1.3',
    shield: '전투에서 받는 피해 ↓',
    void: '전투 공허 블록 ↑',
  }[e.preset];
}

/** 원정이 끝난 이유 문구 */
export function endReasonText(reason: EndReason, f: FactionConfig): string {
  return {
    returned: '둥지 칸에서 귀환했다. 얻은 것은 모두 지킨다.',
    'forced-max-laps': '최대 바퀴를 채워 귀환했다. 얻은 것은 모두 지킨다.',
    'battle-lost': `전투에서 졌다. ${f.defeatStateName} 상태로 ${f.nestName}에 돌아왔다. 마지막 바퀴에서 얻은 것을 잃었다.`,
    exhausted: `허기로 쓰러졌다. ${f.defeatStateName} 상태로 ${f.nestName}에 돌아왔다. 마지막 바퀴에서 얻은 것을 잃었다.`,
  }[reason];
}
