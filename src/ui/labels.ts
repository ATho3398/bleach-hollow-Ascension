// 전투 화면 텍스트: 전부 종족 설정(FactionConfig)에서 읽는다. 종족 id 로 분기하지 않는다.
import type { TerrainTileDef, TileEvent } from '../data/schema';
import type { EndReason, VariantMods } from '../engine/expedition';
import { BALANCE } from '../config/balance';
import { BLOCK_WORDS, familyOf, type BlockRole, type FactionConfig } from '../engine/faction';
import { elementName } from '../data/elements';
import type { SkillRole } from '../data/schema';
import type { CombatParams } from '../engine/combat';
import { fixParticles } from '../engine/josa';

export { BLOCK_WORDS };

const TV = BALANCE.provisional.tileVariants;

export interface BattleLabels {
  /** 블록 역할 이름 (공격/막기/회복) */
  role: Record<BlockRole, string>;
  skillBlock: string;
  /** 해방 (GDD 83장): 종족 설정 liberation 중 지금 단계의 이름·컷인·풀릴 때 문구 (저장형 필살기는 C.134 에 삭제) */
  liberation: LiberationLabels;
  /** 공허 블록 표시 이름 (v5.4 `공허`) */
  voidBlock: string;
  chain: string;
  /** 공격 계열 이름·약어·단계 기술 이름 (GDD 17-3, 종족 설정 families) */
  families: FactionConfig['families'];
  riskGauge: string;
  defeatState: string;
  huntingGround: string;
  factionName: string;
  /** 상성 문구 (GDD 20-2) */
  matchupText: FactionConfig['matchupText'];
}

/** 해방 표시 (GDD 83장): unique = 고유 효과가 있는 단계(레스렉시온/만해) */
export interface LiberationLabels {
  name: string;
  cutin: string;
  endText: string;
  unique: boolean;
}

/** 지금 단계의 해방 이름·문구: 5단계(BALANCE liberation.minTierIndex) 전은 영력 해방, 그 뒤는 종족 이름(레스렉시온/만해) */
export function liberationLabels(f: Pick<FactionConfig, 'liberation'>, tierIndex: number): LiberationLabels {
  const lb = f.liberation;
  return tierIndex >= BALANCE.provisional.liberation.minTierIndex
    ? { name: lb.name, cutin: lb.cutin, endText: lb.endText, unique: true }
    : { name: lb.baseName, cutin: lb.baseCutin, endText: lb.baseEndText, unique: false };
}

export function battleLabels(f: FactionConfig, tierIndex = 0): BattleLabels {
  return {
    role: { ...f.roleNames },
    skillBlock: f.skillBlockName,
    liberation: liberationLabels(f, tierIndex),
    voidBlock: BLOCK_WORDS.void,
    chain: f.chainName,
    families: f.families,
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
 * 스킬 블록 표시 이름 (GDD 84장 4번, C.138): 공격 = 계열 약어만(조·탄·교 / 참·권·귀), 막기·회복 = `막기`·`회복`.
 * 속성은 이름에 넣지 않고 색으로만 보인다(79장). 계열 약어는 종족 설정 families 에서 읽는다. 공격인데 계열이 없으면 null
 */
export function skillBlockLabel(labels: Pick<BattleLabels, 'families'>, family: string | null | undefined, role: SkillRole | null): string | null {
  return role === 'guard' ? BLOCK_WORDS.guard : role === 'heal' ? BLOCK_WORDS.heal : familyAbbr(labels, family) ?? null;
}

/** 옛 해방 블록 표시 이름 (GDD 22-5 `속성_해방`, C.134 부터 생기지 않는다 — 옛 기록 표시용): 내 캐릭터 속성. 속성을 모르면 `해방` */
export function liberationBlockLabel(factionId: string, element: string | null | undefined): string {
  return element ? `${blockElementName(element, factionId)}_${BLOCK_WORDS.liberation}` : BLOCK_WORDS.liberation;
}

/** 해방 설명 한 줄 (GDD 95장 B2 ③·106장 4 확정): 게이지가 무엇으로 차는지 + 해방 중 블록이 빠르게 나옴(평소 출현표 그대로) */
export function liberationHint(): string {
  return '블록·주고받은 피해로 찬다 · 해방 중 블록이 빠르게 나온다';
}

/** 콤보 블록 표시 이름 (v5.4 `콤보_계열`). 계열을 모르면 `콤보` */
export function comboBlockLabel(labels: Pick<BattleLabels, 'families'>, family: string | null | undefined): string {
  const abbr = familyAbbr(labels, family);
  return abbr ? `${BLOCK_WORDS.combo}_${abbr}` : BLOCK_WORDS.combo;
}

/** 지형 타일 효과 설명: 효과 종류는 엔진, 문구는 종족 무관 */
export function tileHint(t: TerrainTileDef): string {
  const e = t.effect;
  let base: string;
  const T = BALANCE.provisional.tiles;
  if (e.type === 'spawn' && e.hunter) base = `강적보다 센 사냥꾼 1마리 (체력 ×${T.hunter.hpMult}·공격 ×${T.hunter.attackMult}) · 이기면 흡수 후보 ×${T.hunter.absorbCandidateMult}`;
  else if (e.type === 'spawn') base = e.enemyClass === 'elite' ? '강적 출현 + 좋은 보상' : '약한 적 출현';
  else if (e.type === 'rest' && e.spring) base = `회복 없음 · 리스크를 휴식의 ${T.spring.riskReliefMult}배 깎는다 · 시간 소모`;
  else if (e.type === 'rest') base = '배부름·컨디션 회복 · 시간 소모';
  else if (e.type === 'event') return eventHint(e.event);
  else if (e.type === 'echo') return '바로 앞 칸 타일의 효과를 한 번 더 · 앞 칸이 빈 칸·메아리면 효과 없음';
  else {
    base = {
      reshuffle: '전투 중 블록 바의 순서가 주기적으로 섞인다',
      power: '전투 공격 위력 ×1.3',
      shield: '전투에서 받는 피해 ↓',
      void: '전투 공허 블록 ↑',
      training: `약한 적 · 이기면 노력치 +${T.training.ev} (그 적의 능력치 하나, 상한 안)`,
    }[e.preset];
  }
  return t.upgradeOf ? `${base} · 상위: ${variantModsText(TV.upgrade[t.kind] as VariantMods).join(' · ')}` : base;
}

/** 이벤트 타일 한 줄 설명 (GDD 25-5 ③, 수치는 BALANCE 에서) */
export function eventHint(ev: TileEvent): string {
  const E = TV.events;
  return {
    merchant: '골드로 먹이·타일 1개를 산다 · 한 번 밟으면 사라진다',
    altar: `리스크 +${E.altar.risk} 대신 장착 특성 하나 위력 +${Math.round(E.altar.traitPower * 100)}% (이번 원정) · 한 번`,
    treasure: `희귀 먹이 1개 또는 골드 ${E.treasure.gold[0]}~${E.treasure.gold[1]} · 한 번`,
    trap: `다음 전투 시작 체력 −${Math.round((1 - E.trap.startHpFraction) * 100)}%, 이기면 보상 ×${E.trap.rewardMult} · 한 번`,
    crossroads: `둘 중 하나: 다음 전투 보호막 ${Math.round(E.crossroads.shield * 100)}% / 골드 ${E.crossroads.gold} · 한 번`,
  }[ev];
}

const pct = (k: number) => `${k >= 1 ? '+' : '−'}${Math.round(Math.abs(k - 1) * 100)}%`;

/** 효과 묶음(시너지·바퀴 변이·상위 타일) → 짧은 문구 목록 (수치는 BALANCE 에서, 종족 무관) */
export function variantModsText(m: VariantMods, factionId = ''): string[] {
  const out: string[] = [];
  if (m.enemyFirstStrike) out.push('적이 먼저 공격');
  if (m.extraBattle) out.push('일반 적 2연전');
  if (m.rewardMult !== undefined) out.push(`보상 ×${m.rewardMult}`);
  if (m.goldMult !== undefined) out.push(m.goldMult >= 1 ? `골드 ×${m.goldMult}` : `골드 ${pct(m.goldMult)}`);
  if (m.foodMult !== undefined) out.push(`먹이 드롭 ×${m.foodMult}`);
  if (m.foodChanceBonus) out.push(`먹이 드롭 +${Math.round(m.foodChanceBonus * 100)}%p`);
  if (m.enemyAttackMult !== undefined) out.push(`적 공격 ${pct(m.enemyAttackMult)}`);
  if (m.enemyHpMult !== undefined) out.push(`적 체력 ${pct(m.enemyHpMult)}`);
  if (m.eliteHpMult !== undefined) out.push(`강적 체력 ${pct(m.eliteHpMult)}`);
  if (m.voidMult !== undefined) out.push(`공허 블록 ×${m.voidMult}`);
  if (m.voidBonus) out.push('공허 블록 ↑');
  if (m.elementBias) out.push(`${elementName(m.elementBias, factionId)} 속성 적 ↑`);
  if (m.absorbBonus) out.push(`흡수 후보 +${m.absorbBonus}`);
  if (m.restMult !== undefined) out.push(`휴식 회복 ×${m.restMult}`);
  if (m.nextShield) out.push(`다음 전투 보호막 ${Math.round(m.nextShield * 100)}%`);
  if (m.riskOnce) out.push(`리스크 ${m.riskOnce > 0 ? '+' : '−'}${Math.abs(m.riskOnce)}`);
  if (m.hungerMult !== undefined) out.push(`배고파지는 속도 ×${m.hungerMult}`);
  if (m.eliteSoulBonus) out.push(`강적 처치 영혼 결정 +${m.eliteSoulBonus}`);
  if (m.envMult !== undefined) out.push(`효과 ×${m.envMult}`);
  return out;
}

/** 원정이 끝난 이유 문구 */
export function endReasonText(reason: EndReason, f: FactionConfig): string {
  return {
    returned: '둥지 칸에서 귀환했다. 얻은 것은 모두 지킨다.',
    'forced-max-laps': '최대 바퀴를 채워 귀환했다. 얻은 것은 모두 지킨다.',
    // C.175 (GDD 102-3·102장 수정): 원정 패배 = 빈사(이미 빈사였으면 사망) — 남은 시간 안에 치료제
    'battle-lost': `전투에서 졌다(${f.defeatStateName}). 빈사 상태로 ${f.nestName}에 돌아왔다 — 시간 안에 치료제를 먹여야 산다. 마지막 바퀴에서 얻은 것을 잃었다.`,
    exhausted: fixParticles(`${f.fullnessName}이(가) 바닥나 쓰러졌다. 빈사 상태로 ${f.nestName}에 돌아왔다 — 시간 안에 치료제를 먹여야 산다. 마지막 바퀴에서 얻은 것을 잃었다.`),
    'story-clear': '목표를 이뤄 귀환했다. 얻은 것은 모두 지킨다.',
    'tutorial-clear': `첫 원정을 마치고 ${f.nestName}에 돌아왔다. 얻은 것은 모두 지킨다.`,
    abort: `원정 도중 ${f.nestName}에 귀환했다. 얻은 것은 지키지만 이번 바퀴 완주 보상은 없다.`,
  }[reason];
}
