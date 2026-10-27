// 전투 화면 v3 (GDD 3-5, UI 디자인 U-2, R-2): 실시간 자동 전투 + 일자 8칸 스킬 블록 바. 원정과 연습이 같이 쓴다.
// 엔진 틱(0.1초)을 실시간 1배 고정으로 돌린다(배속은 C.118 에 삭제, GDD 62장). 클릭(같은 블록 위에서 누르고 뗌) = 블록 사용(붙은 같은 블록이 함께 발동해 체인).
// 블록 순서는 바꿀 수 없다(GDD 17-2): 나온 순서대로 쓴다. 클릭 판정은 여기서, 엔진은 use 결과만 받는다.
// 텍스트는 FactionConfig·데이터에서 읽고 종족 id 로 분기하지 않는다.
// 화면 모양(DOM·클래스)은 디자인 패키지 battle.html 을 따른다. 전투는 고정 틱으로 계속 갱신되므로 DOM 을 통째로 다시 만들지 않고
// 바뀐 곳만 갱신한다(블록은 uid 로 같은 요소를 계속 쓰고, 묶음·삽입 막대는 달라졌을 때만 바꾼다).
import { enemyPatternKind } from '../data/enemies';
import { comboName, physBlockName } from '../data/evolution';
import { pickFaction } from '../data/schema';
import { traitAbbr, traitName } from '../data/traits';
import { absorbReasons } from '../engine/absorb';
import {
  BASIC_SKILL_ID, blockEffect, blockElementOf, isBasicBlockId, canLiberate, chainGroupsOf, comboOf, sourceOf, drainCombatEvents, elapsedSeconds, LIBERATION_GAUGE_MAX, liberationActive, maxChain, runsOf, step, timeLeftSeconds,
  type Block, type CombatEvent, type ElemHit, type CombatInput, type CombatParams, type CombatState,
  canGuard, canUseGear, canUseItem, halted as combatHalted, voidChanceOf,
} from '../engine/combat';
import { getGearSpecial } from '../data/gear';
import { riskText } from '../data/help/riskText';
import { infoTip } from './bha/infoTip';
import { statusInfo } from './bha/statusInfo';
import { consumableName } from '../inventory';
import { battleItemText } from '../shop';
import { FAMILY_TIERS, familyOf, roomOf, type FactionConfig } from '../engine/faction';
import { frameTicks } from '../engine/tutorial';
import { button, el, icon, tag } from './bha/dom';
import { mountV2Root } from './bha/v2/root';
import { setV2Gauge, v2Button, v2Chip, v2Gauge, v2IconButton, v2Notice, v2Svg, v2TempChip } from './bha/v2/components';
import { V2_GLYPH, V2_PATH, setHpBar, setV2Locked, setV2Pips, v2AttackKind, v2BlockEl, v2ChainEl, v2CutEl, v2FamilyPath, v2StatusChip, v2TrayEl, type HpBar } from './bha/v2/battle';
import { animOf } from './bha/animPlayer';
import { onHold } from './bha/hold';
import {
  blockEl, blockVisual, heroEl, chainLevelAt, cutEl, floatPool, groupCuts, floatSpot, foeArtOf, foeEl, heroArtOf, HURT_SPOTS, logLineEl, LOG_ICON, PATTERN_VIEW, pickAbbr, ABBR_LINE_CHARS,
  playOnce, replayOnce, runEl, runSpecs, secondsText, setHidden, setText, trayEl, gaugeFill, gaugeSlots, headGaugeEl, trackTotal, type HeadGauge,
  type BlockSpec, type BlockVisual, damageTier, BATTLE_LOG_MAX, hpNumbers, type FloatKind, type FloatOpts, type LogRole, type RunSpec,
} from './bha/battle';
import { elementColor, elementDamageAbbr, elementDamagePct, elementDot, elementMark } from './bha/element';
import { elementName, NORMAL_ELEMENT, weaknessesOf } from '../data/elements';
import { elementLocalRect, pointerLocal } from './bha/viewport';
import { battleLabels, comboBlockLabel, familyAbbr, familySkillName, liberationBlockLabel, liberationHint, skillBlockLabel, type BattleLabels } from './labels';
import { helpOverlay } from './helpView';
import { settingsOverlay } from './settingsView';
import { confirmDialog } from './confirmDialog';
import { registerLayer } from './bha/overlayHost';
import { tutorialOverlay, type TutorialHandle } from './tutorialOverlay';
import { releaseUse, slotAt } from './pointer';
import { registerCancelHook, registerShortcutHandlers } from './bha/shortcuts';
import { currentViewState } from './viewScale';
import { cueOf, emitFeedback, hookAudioUnlock, strongestCue, type FxCue } from './fx';
import { locoOf, setLoco } from './bha/loco';
import { loadFxSettings, prefersReducedMotion } from './fxSettings';
import { attackFx, fxModeOf } from './attackFx';
import { FX_REACH_FIELD } from './attackFxConfig';
import { playCosmeticFx } from './bha/cosmeticFx';
import { sceneBgEl } from './bha/sceneBg';
import type { SceneBg } from '../data/art/backgrounds';
import { testSpeedMul } from './testMode';
import { abilityProcText } from './evolutionPanel';
import { shownName } from './displayName';

export interface BattleViewOptions {
  /** 조우 연출 윗줄: 원정이면 바퀴·칸·타일 정보. 없으면 "전투 연습" */
  banner?: string;
  /** 있으면 필드 가운데 칩 줄 맨 위에 안내(.bha-notice)를 보인다 (체험 전투 "기록되지 않음" 등, C.160) */
  notice?: string;
  /** 폭주 중이면 그 이름 (GDD 23-2, 종족 설정 frenzyName): 위 막대에 상태 칩, 화면 테두리 */
  frenzy?: string;
  /** 이 원정의 현재 공허(리스크 게이지) 수치 (C.131, GDD 77장 ⑥). 있으면 위 막대에 `이름 값` 칩: 원정 수치 + 이번 전투에서 오른 만큼 (실시간). 원정 밖 전투는 없음 */
  risk?: number;
  /** 있으면 '그만두기' 버튼을 보인다 (원정 중에는 없다) */
  onQuit?: () => void;
  /** 있으면 일시정지 창에 [귀환] (원정 전투, GDD 100장 v5.220): 확인 창(기본 = 귀환하기) 뒤 전투를 패배 없이 끝내고 한 번 불린다 */
  onReturn?: () => void;
  /** 있으면 전투 시작 직전에 첫 플레이 튜토리얼을 보여 준다 (GDD 14-2). 끝나거나 건너뛰면 한 번 불린다. 튜토리얼 동안 전투 시간은 멈춘다 */
  tutorial?: { onDone: () => void };
  /** 육성 단계(0부터): 단계별 캐릭터 그림 파일(char-<종족>-<번호>)을 고른다. 없으면 1단계 취급 */
  tierIndex?: number;
  /** 입고 있는 스킨 id (GDD 26-5) */
  skinId?: string | null;
  /** 현재 진화체 id (이동 방식 GDD 18-11). 1단계는 null */
  formId?: string | null;
  /** 보스전 (GDD 25-3·25-7): 등장 이름 띠 위 줄 문구 ("보스"). 있으면 강적 표시 대신 보스 표시·페이즈 칩을 보인다 */
  boss?: { eyebrow: string };
  /** 등급전처럼 내 등장 연출(상점 꾸밈, GDD 25-11)을 보이는 전투. 보스전(boss)도 보인다 */
  enter?: boolean;
  /** 장면 배경 그림 (GDD 34-1): 원정이면 그 사냥터, 등급전·보스전이면 무대. 정지 배경. 없으면 지금 모습 */
  bg?: SceneBg | null;
  /** 전투 [소모품] (GDD 108장 3번): 소모품 칸에 든 것의 보관 개수와, 썼을 때 한 번 불리는 함수(보관 개수 −1). 없으면 칸이 빈 것 — 버튼은 자리 그대로 비활성 */
  battleItem?: { count: number; onUse: () => void };
  /** 전투가 끝나고 결과 오버레이의 버튼을 누르면 한 번 불린다 */
  onEnd: (s: CombatState) => void;
}

/** 장비 발동 이름·효과 한 줄 (GDD 105장 수정 4) */
function gearActiveText(p: CombatParams): string {
  const g = p.activeGear;
  if (!g) return '발동 장비 없음';
  const name = getGearSpecial(g.id)?.name ?? '장비';
  return g.effect === 'shield' ? `${name} — ${g.seconds}초 받는 피해 −${Math.round(g.reduction * 100)}%` : `${name} — 기본 공격 ${g.powerInAttacks}회분 피해`;
}

/** 블록 이름 (GDD 84장 4번, C.138): 스킬 = 계열 약어(조·탄·교)·`막기`·`회복`(속성은 색으로만), 공허 = `공허`, 콤보 = `콤보_계열` */
export function blockName(b: Block, labels: BattleLabels, factionId: string, p: CombatParams): string {
  if (b.kind === 'void') return labels.voidBlock;
  if (b.kind === 'combo') return comboBlockLabel(labels, comboOf(p, b.traitId)?.family);
  if (b.kind === 'liberation') return liberationBlockLabel(factionId, p.playerElements[0]);
  const src = sourceOf(p, b.traitId);
  // 물공 특수 블록 (GDD 49장): 기본 공격 블록이 물공 블록인 몸은 표의 이름(종족별 데이터)
  if (p.physBlock && isBasicBlockId(src?.id) && src?.role === 'attack') return physBlockName(p.physBlock.element, factionId) ?? labels.skillBlock;
  const name = skillBlockLabel(labels, b.family ?? src?.family, src?.role ?? 'attack');
  return name ?? (b.traitId && !isBasicBlockId(b.traitId) ? traitName(b.traitId, factionId) : labels.skillBlock);
}

/** 블록 약어 = 블록 이름. 한 줄(4자)을 넘으면 `_` 뒤에서 줄을 나눈다 (예 노멀_ 막기) */
export function blockAbbr(b: Block, labels: BattleLabels, factionId: string, p: CombatParams): string {
  const name = blockName(b, labels, factionId, p);
  return pickAbbr(undefined, Array.from(name).length > ABBR_LINE_CHARS ? name.replace('_', '_ ') : name);
}

/** 사건의 스킬 블록 표시 이름 (계열 약어·막기·회복, 84장 4번) */
function eventBlockLabel(e: Extract<CombatEvent, { kind: 'block' }>, s: CombatState, labels: BattleLabels, factionId: string): string {
  if (s.params.physBlock && isBasicBlockId(e.traitId) && e.role === 'attack') return physBlockName(s.params.physBlock.element, factionId) ?? labels.skillBlock;
  return skillBlockLabel(labels, e.family, e.role) ?? (e.traitId && !isBasicBlockId(e.traitId) ? traitName(e.traitId, factionId) : labels.skillBlock);
}

/** 피해 줄의 속성 피해 표시 (GDD 48장 4·7번): 0 이 아닐 때만 " (불 +50%)", 융합은 " (물·흙 +15%)" */
function elemText(elem: ElemHit | undefined, factionId: string): string {
  return elem && elem.pct !== 0 ? ` (${elem.ids.map((id) => elementDamageAbbr(id, factionId)).join('·')} ${elementDamagePct(elem.pct)})` : '';
}

interface LogLine {
  role: LogRole;
  icon: string;
  text: string;
}

/** 사건 한 줄 (전투 연출 텍스트) */
function eventLine(e: CombatEvent, s: CombatState, labels: BattleLabels, factionId: string): LogLine | null {
  const n = (v: number) => Math.round(v);
  switch (e.kind) {
    case 'block': {
      // 블록 이름은 `속성_계열`(GDD 20장 v5.4), 계열 공격은 단계 기술 이름(17-3)을 뒤에 붙인다
      const skillName = e.block === 'skill' ? familySkillName(labels, e.family, e.chain) : null;
      const name = e.block === 'skill'
        ? `${eventBlockLabel(e, s, labels, factionId)}${e.chain > 1 ? ` ${labels.chain}${e.chain}` : ''}${skillName ? ` 「${skillName}」` : ''}`
        : e.block === 'combo' ? comboBlockLabel(labels, comboOf(s.params, e.traitId)?.family) : e.block === 'liberation' ? liberationBlockLabel(factionId, e.element) : labels.voidBlock;
      const parts = [`${name}! ${n(e.damage)} 피해${elemText(e.elem, factionId)}${e.crit ? ' (치명!)' : ''}${e.matchup === 'strong' ? ` (${labels.matchupText.strong})` : e.matchup === 'weak' ? ` (${labels.matchupText.weak})` : ''}`];
      if (e.heal > 0) parts.push(`${labels.role.heal} +${n(e.heal)}`);
      if (e.guardSeconds > 0) {
        // 막기 (GDD 105장 수정 v5.233): 강공격만 완전히 막는다 — 막기 버튼은 피해 줄 없이 이 줄만
        const g = `${labels.role.guard} ${e.guardSeconds}초 (강공격 완전 막기)`;
        if (e.damage <= 0) return { role: 'guard', icon: 'i-guard', text: `${g}!` };
        parts.push(g);
      }
      if (e.bonus === 'stagger') parts.push('적 행동 지연');
      if (e.bonus === 'reflect') parts.push('반사 준비');
      if (e.bonus === 'cleanse') parts.push('봉인 해제');
      if (e.block === 'void') parts.push(`${labels.riskGauge} ↑`);
      const text = parts.join(' · ');
      if (e.block === 'void') return { role: 'void', icon: 'i-void', text };
      if (e.block === 'combo' || e.block === 'liberation') return { role: 'chain', icon: 'i-special', text };
      if (e.chain > 1) return { role: 'chain', icon: `i-chain-${Math.min(3, e.chain)}`, text };
      const role: LogRole = e.role ?? 'attack';
      return { role, icon: LOG_ICON[role], text };
    }
    case 'combo':
      return { role: 'chain', icon: 'i-special', text: `콤보! ${comboBlockLabel(labels, comboOf(s.params, e.comboId)?.family)} 블록이 생겼다 (${comboName(e.comboId, factionId)})` };
    case 'liberation-ready':
      return { role: 'chain', icon: 'i-special', text: `${labels.liberation.name} 게이지가 가득 찼다! [${labels.liberation.name}]을(를) 눌러라` };
    case 'heavy-cast':
      return { role: 'cast', icon: 'i-cast', text: `강공격 예고! ${e.seconds}초 안에 ${labels.role.guard} 버튼으로 막아라` };
    case 'heavy-hit':
      return e.guarded
        ? { role: 'guard', icon: 'i-guard', text: `강공격을 막았다! ${n(e.damage)} 피해${e.reflected > 0 ? ` · ${n(e.reflected)} 반사` : ''}` }
        : { role: 'cast', icon: 'i-cast', text: `강공격 적중! ${n(e.damage)} 피해` };
    case 'seal':
      return { role: 'cast', icon: 'i-seal', text: `봉인! ${e.seconds}초 동안 ${labels.skillBlock} 생성 정지` };
    case 'cell-seal':
      return { role: 'cast', icon: 'i-lock', text: `블록 봉인! ${labels.skillBlock} 1칸을 ${e.seconds}초 동안 쓸 수 없다` };
    case 'boss-phase':
      return { role: 'cast', icon: 'i-warn', text: `페이즈 ${e.phase}! ${shownName(pickFaction(s.enemy.def.name, factionId))}의 공격이 빨라졌다` };
    case 'boss-summon':
      return { role: 'cast', icon: 'i-warn', text: `졸개가 앞을 막아선다! 내 공격을 먼저 받는다 (체력 ${n(e.hp)})` };
    case 'minion-attack':
      return { role: 'cast', icon: 'i-cast', text: `졸개의 공격 ${n(e.damage)} 피해${e.guarded ? ' (막기로 경감)' : ''}` };
    case 'minion-down':
      return { role: 'chain', icon: 'i-chain-3', text: '졸개를 쓰러뜨렸다!' };
    case 'evade':
      // 폭주 중 회피 (GDD 101장 4번)
      return { role: 'guard', icon: 'i-guard', text: '회피! 적의 공격을 통째로 피했다' };
    case 'boss-element':
      return { role: 'cast', icon: 'i-weak', text: `${shownName(pickFaction(s.enemy.def.name, factionId))}의 속성이 ${elementName(e.element, factionId)}(으)로 바뀌었다!` };
    case 'stance':
      return { role: 'guard', icon: 'i-guard', text: `방어 자세! ${e.seconds}초 동안 내 블록 피해 감소 · 블록을 쓰면 반격` };
    case 'stance-end':
      return { role: 'guard', icon: 'i-guard', text: '방어 자세가 풀렸다' };
    case 'counter':
      return { role: 'cast', icon: 'i-cast', text: `반격! ${n(e.damage)} 피해${e.guarded ? ' (막기로 경감)' : ''}` };
    case 'shuffle':
      return { role: 'chain', icon: 'i-swap', text: '블록 바의 순서가 섞였다' };
    case 'ability':
      // 진화체 특성 발동 (C.89, GDD 39장 5번)
      return { role: 'chain', icon: 'i-rare', text: `${abilityProcText(e.effect, factionId)}${e.damage > 0 ? ` ${n(e.damage)} 피해` : ''}` };
    case 'liberate':
      return { role: 'chain', icon: 'i-special', text: `${labels.liberation.cutin} ${e.seconds}초 동안 블록이 빠르게 나온다${e.unique ? ' · 공격 속도·체인 속도 ↑' : ''}` };
    case 'item':
      return { role: 'heal', icon: 'i-heal', text: `${consumableName(e.id)}! ${e.effect === 'heal' ? `체력 +${n(e.heal)}` : `${battleItemText(e.id)}`}` };
    case 'gear':
      return { role: 'chain', icon: e.effect === 'shield' ? 'i-guard' : 'i-attack', text: e.effect === 'shield' ? `장비 발동! ${gearActiveText(s.params)}` : `장비 발동! ${n(e.damage)} 피해` };
    case 'liberation-end':
      return { role: 'void', icon: 'i-risk', text: `${labels.liberation.endText} ${labels.riskGauge} +${Math.round(e.risk * 10) / 10}` };
    case 'end':
      return e.status === 'won' ? { role: 'chain', icon: 'i-flag-win', text: `${shownName(pickFaction(s.enemy.def.name, factionId))}을(를) 쓰러뜨렸다!` } : null;
    default:
      return null;
  }
}

function safeStorage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/** 상태 칩 하나: 아이콘 + 이름 + 값(시간·횟수) */
function statusChip(mod: 'guard' | 'seal' | undefined, iconId: string, label: string): { root: HTMLElement; value: HTMLElement } {
  const root = el('span', mod ? `bha-chip bha-chip--${mod}` : 'bha-chip');
  const value = el('span', 'bha-chip__time');
  root.append(icon(iconId), label, ' ', value);
  root.hidden = true;
  return { root, value };
}

/** 상태 바 값 글자(첫 글자 노드)만 바꾼다 */
function setMeterValue(root: HTMLElement, value: number, max?: number): void {
  const t = root.querySelector('.bha-meter__value')?.firstChild;
  const text = String(value);
  if (t && t.nodeValue !== text) t.nodeValue = text;
  // 최대값이 바뀌는 경우(해방 중 최대 체력, GDD 22-5)
  const small = max === undefined ? null : root.querySelector('.bha-meter__value small');
  if (small && max !== undefined && small.textContent !== ` / ${max}`) {
    small.textContent = ` / ${max}`;
    root.setAttribute('aria-valuemax', String(max));
  }
}

export function battleView(root: HTMLElement, faction: FactionConfig, s: CombatState, opts: BattleViewOptions): void {
  const labels = battleLabels(faction, opts.tierIndex ?? 0);
  const p = s.params;
  const enemy = s.enemy.def;
  const enemyName = shownName(pickFaction(enemy.name, faction.id));
  const top = maxChain(p);
  const cap = p.trayCapacity;
  /** 설정 화면 '전투 효과' (피해 숫자·진동·효과음·흔들림). 전투 시작 때 읽는다 */
  const fx = loadFxSettings(safeStorage());
  if (fx.sound) hookAudioUnlock();
  /** 적 속성 칩 (GDD 20-2): 속성 + 약점 속성(원소만). 약점은 그 속성 블록이 ×1.2 */
  // 보스 기믹 element 는 전투 중 속성이 바뀐다 (GDD 35장) — 칩은 지금 속성(s.enemy.def)으로 다시 그린다
  const fillElementChip = (c: HTMLElement): HTMLElement => {
    const elId = s.enemy.def.element;
    const weakIds = weaknessesOf([elId]);
    c.replaceChildren(elementMark(elId, faction.id));
    if (weakIds.length > 0) {
      c.append(' · ', icon('i-weak'), '약점 ');
      weakIds.forEach((w) => c.append(elementDot(w, faction.id)));
    }
    return c;
  };
  const elementChip = (): HTMLElement => fillElementChip(el('span', 'bha-chip bha-chip--attr'));

  // ── 1. 적 이름·약점 (필드 위 한 줄 왼쪽, v2 칩) ──
  const foeName = el('div', 'bha-v2foename');
  const foeTitle = el('h1', 'bha-display bha-lg bha-v2foename__text', enemyName);
  foeTitle.title = enemyName; // 칩에 밀려 말줄임이 되어도 전체 이름 (C.160)
  foeName.append(foeTitle);
  if (opts.boss || s.boss) foeName.append(v2Chip('보스', 'danger')); // 보스 기믹이 있으면 보스 (테스트 바로 전투는 opts.boss 없이 들어온다, C.160)
  else if (enemy.class === 'elite') foeName.append(v2Chip('강적', 'danger'));
  const weakChip = elementChip();
  const foeHead = el('header', 'bha-v2foehead');
  foeHead.append(foeName);
  // 필드 가운데 칩 줄 (C.160, 핸드오프 Battle.dc.html 의 '강공격·봉인' 칩 자리 left 290·top 45): 알림·임시·패턴·페이즈·졸개 칩을 나·적 그림 사이에 세로로 쌓는다.
  // 위 한 줄에 다 넣으면 적 이름이 말줄임으로 사라지고 칩끼리 겹쳤다 (GDD 98장 A5)
  const fieldTags = el('div', 'bha-v2fieldtags');
  if (opts.notice) fieldTags.append(v2Notice('', opts.notice, 'i-info'));
  if (enemy.provisional) fieldTags.append(v2TempChip()); // 임시 데이터 표시도 여기 (위 한 줄에서는 원정 광기·폭주 칩과 함께면 반쯤 잘렸다)

  const patternView = PATTERN_VIEW[enemyPatternKind(enemy)];
  const patternChipEl = (): HTMLElement => v2Chip(patternView!.label, 'default', { icon: patternView!.icon });
  if (patternView) fieldTags.append(patternChipEl());
  // 보스 페이즈 칩 (GDD 25-3): 지금 페이즈 / 전체 페이즈
  const phaseChip = v2Chip('', 'danger', { icon: 'i-warn' });
  phaseChip.classList.add('bha-battle__phase');
  const phaseText = () => `페이즈 ${s.boss?.phase ?? 1}/${(s.boss?.setup.phases.length ?? 0) + 1}`;
  if (s.boss) {
    phaseChip.append(el('span', '', phaseText()));
    fieldTags.append(phaseChip);
  }
  // 졸개 칩 (보스 기믹 summon, GDD 35장): 졸개가 서 있는 동안 체력 표시
  const minionText = el('span');
  const minionChip = v2Chip('', 'danger', { icon: 'i-guard' });
  minionChip.classList.add('bha-battle__minion');
  minionChip.append(minionText);
  minionChip.hidden = true;
  if (s.boss?.setup.gimmick === 'summon') fieldTags.append(minionChip);

  // ── 2. 유닛 두 칸: 머리 위 게이지 / 그림 / 체력 바 (GDD 18-6, 핸드오프 필드 200px) ──
  // 머리 위 게이지: 적 = 강공격 예고(시전 바, 항상 한 칸 자리를 지킨다) + 방어 자세, 나 = 봉인 + 막기. 엔진 이벤트·상태에서 읽기만 한다
  const castGauge = headGaugeEl('cast', 'i-cast', '강공격 예고');
  const stanceGauge = headGaugeEl('stance', 'i-guard');
  const sealGauge = headGaugeEl('seal', 'i-seal');
  const guardGauge = headGaugeEl('guard', 'i-guard');
  const weakenGauge = headGaugeEl('weaken', 'i-heal');
  let blockedUntil = 0;
  let blockedDamage = 0;
  const heads = (...gauges: HeadGauge[]): HTMLElement => {
    const h = el('div', 'bha-unit__heads');
    h.append(...gauges.map((g) => g.root));
    return h;
  };
  const foeHeads = heads(castGauge, stanceGauge);
  foeHeads.dataset.help = 'battle.cast';
  const meHeads = heads(sealGauge, guardGauge, weakenGauge);
  const totals = { seal: 0, guard: 0, stance: 0, weaken: 0 };

  const foe = foeEl(enemy.class === 'elite' ? 'foe-b' : 'foe-a', elementColor(enemy.element), foeArtOf(enemy.id));
  // 내 그림 한 장 (몸통박치기 연출 대상, GDD 17-4). 그림 파일이 없으면 자리표시 도형
  const heroArt = heroArtOf(roomOf(faction), faction.id, opts.tierIndex ?? 0, opts.skinId);
  const heroLoco = locoOf(faction, opts.formId, heroArt);
  const hero = heroEl(heroArt, heroLoco);
  const heroAnim = animOf(hero.root); // 프레임 애니 (GDD 26장): 있는 동작만. 없으면 null / 없는 동작은 기존 연출
  const foeAnim = animOf(foe);

  // 체력 바 (핸드오프 게이지 hp·foe + 숫자 "78 / 108"): 값만 제자리에서 바꾼다
  const hpBar = (kind: 'hp' | 'foe', label: string, now: number, max: number): HpBar => {
    const root = el('div', 'bha-v2hp');
    const gauge = v2Gauge(kind, 100, { width: '130px', label });
    const num = el('span', 'bha-num bha-sm bha-b');
    const nowEl = el('span', '', String(now));
    const maxEl = el('span', 'bha-t2', ` / ${max}`);
    maxEl.style.fontWeight = '500';
    num.append(nowEl, maxEl);
    root.append(gauge, num);
    return { root, gauge, nowEl, maxEl };
  };
  const enemyHp = hpBar('foe', '적 체력', hpNumbers(s.enemy.hp, s.enemy.maxHp).now, hpNumbers(s.enemy.hp, s.enemy.maxHp).max);
  const playerHp = hpBar('hp', '내 체력', hpNumbers(s.player.hp, s.player.maxHp).now, hpNumbers(s.player.hp, s.player.maxHp).max);
  setHpBar(enemyHp, s.enemy.hp, s.enemy.maxHp);
  setHpBar(playerHp, s.player.hp, s.player.maxHp);
  const unit = (cls: string, headsEl: HTMLElement, fig: HTMLElement, hp: HTMLElement): HTMLElement => {
    const u = el('div', `bha-unit ${cls}`);
    if (cls.includes('--me')) setLoco(u, heroLoco); // 유닛 틀에도 붙여 그림 크기(떠오를 여유)를 CSS 가 잡는다
    const figBox = el('div', 'bha-unit__fig');
    figBox.append(fig);
    const hpBox = el('div', 'bha-unit__hp');
    hpBox.append(hp);
    u.append(headsEl, figBox, hpBox);
    return u;
  };
  const units = el('div', 'bha-v2units');
  units.append(unit('bha-unit--me', meHeads, hero.root, playerHp.root), unit('bha-unit--foe', foeHeads, foe, enemyHp.root));

  const floats = el('div', 'bha-battle__floats');
  // 사건 로그 (C.63, GDD 28장 3번): 가운데 실시간 안내 대신 [로그] 버튼으로 여는 목록. 닫혀 있으면 안 보인다(일시정지 없이 겹쳐 본다)
  const log = el('div', 'bha-log bha-battle__logpanel');
  log.setAttribute('role', 'log');
  log.setAttribute('aria-label', '전투 기록');
  log.hidden = true;
  // 필드 (핸드오프 `.bha-field`, 위 200px): 위 한 줄 / 나·적 그림 / 체력 바 / 강공격 예고 띠 / 피해 숫자. 그 위에 UI 패널을 띄우지 않는다
  const arena = el('section', 'bha-field bha-battle__arena');
  arena.setAttribute('aria-label', '전투 필드');
  // 효과 레이어: 번쩍임 한 장(투명도만 애니메이션). 조작을 막지 않는다
  const fxFlash = el('div', 'bha-fxflash');
  fxFlash.setAttribute('aria-hidden', 'true');
  // 계열 공격 효과·기술 이름 레이어 (GDD 19-2): 자국·투사체·광선·이름이 여기 뜬다. 조작을 막지 않는다
  const fxLayer = el('div', 'bha-afx-layer');
  fxLayer.setAttribute('aria-hidden', 'true');

  // ── 3. 내 상태 칩 (스킬창 맨 윗줄 오른쪽). 영력(SP) 바·필살 블록은 C.118 에 삭제 (GDD 66장: 필살기는 저장형만) ──
  const voidChip = v2StatusChip('i-void', labels.voidBlock);
  const chain3Chip = v2StatusChip('i-chain-3', `${labels.chain}${top}`);
  // 전투 상태 칩 ⓘ (GDD 104장 2 — C.176 이 미룬 전투 칩, 공용 infoTip): 폰 = 누르면, PC = 올리면 설명 창
  voidChip.root.append(infoTip(labels.voidBlock, () => [
    `쓸 때마다 ${labels.riskGauge} +${p.riskPerVoidBlock}`,
    `쓰면 ${p.voidStunSeconds}초 경직 — 내 공격·블록 생성·블록 사용 멈춤 (${labels.role.guard}만 누를 수 있음)`,
    `블록이 생길 때 ${Math.round(voidChanceOf(p) * 100)}% 확률로 ${labels.voidBlock}(으)로 바뀐다`,
  ]));
  chain3Chip.root.append(infoTip(`${labels.chain}${top}`, [`같은 블록 ${top}개를 붙여 한 번에 쓴 횟수`, `${labels.chain}${top}은(는) 추가 효과가 붙는다`]));
  const meStatus = el('div', 'bha-v2status');
  meStatus.append(voidChip.root, chain3Chip.root);

  // ── 4. 블록 바 (스킬창, 핸드오프 각인 컷) ──
  const tray = v2TrayEl(cap);
  tray.root.dataset.help = 'battle.tray';
  tray.grid.dataset.help = 'battle.runrow';
  const trayNote = el('p', 'bha-tray__note');
  // 범례 (핸드오프 `.bha-legend`): 역할 = 색 점 + 글자
  const legend = el('div', 'bha-legend');
  legend.dataset.help = 'battle.legend';
  legend.setAttribute('aria-label', '범례');
  const legendItem = (color: string, text: string) => {
    const it = el('span');
    it.style.setProperty('--c', color);
    it.style.color = color;
    it.append(el('i'), text);
    return it;
  };
  // 막기·회복은 블록이 아니라 버튼 (GDD 105장): 범례는 블록 바에 나오는 것만
  legend.append(
    legendItem('var(--bha-atk)', labels.role.attack),
    legendItem('var(--bha-void)', labels.voidBlock),
    ...(p.combos.length > 0 ? [legendItem('var(--bha-rare)', '콤보 블록')] : []),
  );

  // 해방 카드 (GDD 83장, 핸드오프 영력 해방 카드: 스킬창 오른쪽 128px 세로): 블록과 같은 클릭 판정. 게이지가 차면 눌러 해방(한 전투 여러 번), 해방 중에는 남은 시간
  const libOn = p.liberationEnabled;
  // 오오라 색 = 내 속성 색 토큰 (GDD 83장 4번: 진화체 속성에 따라)
  const auraEl = p.playerElements[0];
  const libBtn = el('button', `bha-panel bha-v2rel is-disabled${labels.liberation.unique ? ' is-unique' : ''}`);
  libBtn.type = 'button';
  libBtn.dataset.help = 'battle.liberation';
  const libSeal = el('span', 'bha-release__seal');
  libSeal.append(v2Svg('i-special'));
  const libName = el('span', 'bha-display bha-md bha-v2rel__name', labels.liberation.name);
  const libTemp = v2TempChip();
  libTemp.style.height = '18px';
  const libMeta = el('span', 'bha-xs bha-t2 bha-v2rel__meta');
  const libGauge = v2Gauge('release', 0, { width: '100%', label: labels.liberation.name });
  libBtn.append(libSeal, libName, libTemp, libMeta, libGauge);
  // 무엇으로 차는지·해방 중 나오는 블록 한 줄 (GDD 95장 B2 ③, C.154): C.171(GDD 100장 #37) 범례 줄에서 빼고 해방 버튼 툴팁으로 (자세한 것은 도움말 battle.liberation)
  const hintFull = liberationHint();
  const hintDuring = hintFull.slice(hintFull.lastIndexOf(' · ') + 3); // 해방 중에는 나오는 블록만 ('해방 중 장착 탄·조')
  libBtn.title = hintFull;
  libBtn.hidden = !libOn;
  const libChip = v2Chip('', 'default', { icon: 'i-special' });
  libChip.classList.add('bha-v2libchip');
  const libChipValue = el('span');
  libChip.append(labels.liberation.name, ' ', libChipValue);
  libChip.hidden = true;
  const libChipRoot = { root: libChip, value: libChipValue };
  // 해방 컷인 (공통 연출 하나, 11-5 변주는 미정): 장면 위에 한 줄
  const libCut = el('div', 'bha-libcut');
  libCut.setAttribute('aria-hidden', 'true');
  libCut.append(el('span', 'bha-libcut__text', labels.liberation.cutin));

  // 막기 게이지·[소모품]·[장비] (GDD 105장 수정 v5.233 6번): 해방 알약 버튼 모양, 범례 줄 오른쪽 해방 옆. 못 쓸 때도 자리 그대로(흐리게)
  const actBtn = (kind: 'guard' | 'item' | 'gear', iconId: string, name: string) => {
    const b = el('button', `bha-panel bha-v2role bha-v2role--${kind} is-disabled`);
    b.type = 'button';
    const nameEl = el('span', 'bha-v2role__name', name);
    const meta = el('span', 'bha-v2role__meta');
    b.append(icon(iconId), nameEl, meta);
    b.dataset.sc = kind;
    return { root: b, meta };
  };
  const guardBtn = actBtn('guard', 'i-guard', labels.role.guard);
  // 막기 게이지 (0 → 100%): 다 차야 누를 수 있다
  const guardBar = el('span', 'bha-v2role__bar');
  const guardFill = el('i');
  guardBar.append(guardFill);
  guardBtn.meta.replaceWith(guardBar);
  const itemBtn = actBtn('item', 'i-heal', '소모품');
  const gearBtn = actBtn('gear', 'i-attack', '장비');
  const roles = el('div', `bha-v2roles${libOn ? '' : ' is-alone'}`);
  roles.append(guardBtn.root, itemBtn.root, gearBtn.root);

  // 스킬창 (핸드오프 `.bha-skillpanel`, 아래 130px): 맨 윗줄 범례(+해방 중 표시) → 블록 바 8칸(왼쪽) → 해방 카드(오른쪽)
  const legendRow = el('div', 'bha-v2legendrow');
  legendRow.append(libChip, legend, meStatus);
  // 범례·칩은 줄어들지 않게
  for (const n of [libChip, legend, meStatus]) n.style.flexShrink = '0';
  const controls = el('section', 'bha-skillpanel');
  controls.setAttribute('aria-label', '스킬창');
  controls.append(legendRow, roles, tray.root, ...(libOn ? [libBtn] : []));

  // ── 7. 하단 컨트롤 ──
  // 배속 버튼은 C.118 에 삭제 — 1배 고정 (GDD 62장). 테스트 모드 속도 배율(GDD 38-4)만 남는다
  let paused = false;
  /** 튜토리얼·도움말·조우 연출이 열려 있는 동안 true: 엔진 시간이 흐르지 않고 입력도 받지 않는다 (결정성에 영향 없음, engine/tutorial frameTicks) */
  let overlayOpen = false;
  let tutorialOpen = false;
  let stopped = false;
  /** C.139 (GDD 88장 4): 전투가 끝나거나(승패·포기·떠남) 화면을 떠날 때 hold 구독을 바로 푼다 */
  let unhold = (): void => undefined;
  const stop = (): void => {
    stopped = true;
    unhold();
  };
  const halted = () => paused || overlayOpen;

  const pauseBtn = v2IconButton({ label: '일시정지', icon: 'i-pause' });
  pauseBtn.dataset.devConfirm = ''; // 기기 [확정] 버튼 = 일시정지 (전투는 터치 위주, dev-log C.25)
  const helpBtn = v2IconButton({ label: '도움말', icon: 'i-help' });
  const timeNum = el('b', '', String(Math.ceil(timeLeftSeconds(s))));
  const timeEl = el('span', 'bha-num bha-v2time');
  timeEl.append(v2Svg('i-timer'), timeNum, el('span', 'bha-sm bha-t2', ' 초'));
  // 위 오른쪽: 남은 시간 + 그만두기·로그·일시정지·도움말
  const bar = el('div', 'bha-v2bar');
  bar.append(timeEl);
  let quitBtn: HTMLButtonElement | null = null;
  if (opts.onQuit) {
    quitBtn = v2IconButton({ label: '그만두기', icon: 'i-quit' });
    quitBtn.onclick = () => quit();
    bar.append(quitBtn);
  }
  const logBtn = v2Button({ label: '로그', small: true });
  logBtn.style.minWidth = '44px';
  logBtn.setAttribute('aria-expanded', 'false');
  logBtn.dataset.help = 'battle.stage';
  logBtn.onclick = () => {
    log.hidden = !log.hidden;
    logBtn.classList.toggle('is-focus', !log.hidden);
    logBtn.setAttribute('aria-expanded', String(!log.hidden));
    if (!log.hidden) log.scrollTop = log.scrollHeight;
  };
  bar.append(logBtn, pauseBtn, helpBtn);
  if (opts.frenzy) {
    const fc = v2Chip(opts.frenzy, 'danger', { icon: 'i-risk' });
    fc.classList.add('bha-frenzychip');
    fc.append(infoTip(opts.frenzy, riskText(faction).riskTip));
    bar.prepend(fc);
  }

  // 공허 수치 칩 (C.131, GDD 77장 ⑥): 원정 중 전투만. 값 = 원정 수치 + 이번 전투 공허 블록으로 오른 만큼 (실시간)
  let riskChipValue: HTMLElement | null = null;
  if (opts.risk !== undefined) {
    const rc = v2Chip('', 'danger', { icon: 'i-risk' });
    rc.classList.add('bha-riskchip');
    riskChipValue = el('b', 'bha-num', String(Math.round(opts.risk)));
    rc.append(labels.riskGauge, ' ', riskChipValue, infoTip(labels.riskGauge, () => statusInfo('risk', faction, Number(riskChipValue?.textContent ?? 0))));
    rc.setAttribute('aria-label', labels.riskGauge);
    bar.prepend(rc);
  }

  const flashVoid = el('div', 'bha-edgeflash bha-edgeflash--void');
  const flashHit = el('div', 'bha-edgeflash bha-edgeflash--hit');

  // 필드 위 한 줄: 왼쪽 = 적 이름·칩, 가운데 = 약점 칩, 오른쪽 = 시간·버튼
  const topRow = el('div', 'bha-v2toprow');
  topRow.append(foeHead, weakChip, bar);
  if (opts.bg) {
    arena.classList.add('has-bg');
    arena.append(sceneBgEl(opts.bg, false));
  }
  arena.append(units, fieldTags, topRow, fxLayer, floats, fxFlash, libCut, log);
  const v2 = mountV2Root(root, faction, arena, controls, flashVoid, flashHit);
  const app = v2.root;
  app.classList.add('bha-battle'); // 해방 오오라·광기 테두리 같은 효과 CSS 가 이 클래스를 본다
  if (auraEl) app.style.setProperty('--bha-aura', elementColor(auraEl));
  app.classList.toggle('is-frenzy', !!opts.frenzy);
  if (opts.boss || opts.enter) window.setTimeout(() => playCosmeticFx('enter', hero.root), 0); // 등장 연출 (GDD 25-11): 보스·등급전 입장

  const quit = () => {
    stop();
    opts.onQuit?.();
  };

  // ── 오버레이 (조우 · 일시정지 · 결과) ──
  let overlayEl: HTMLElement | null = null;
  const showOverlay = (inner: HTMLElement): HTMLElement => {
    overlayEl?.remove();
    const ov = el('div', 'bha-overlay bha-overlay--in-app');
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    const ovTitle = inner.querySelector('h2');
    if (ovTitle) {
      ovTitle.id = 'bha-battle-ov-title';
      ov.setAttribute('aria-labelledby', ovTitle.id);
    }
    ov.append(inner);
    app.append(ov);
    overlayEl = ov;
    return ov;
  };
  const hideOverlay = () => {
    overlayEl?.remove();
    overlayEl = null;
  };
  const ovMark = (iconId: string, color?: string) => {
    const m = el('span', 'bha-battle-ov__mark');
    m.append(icon(iconId));
    if (color) m.style.color = color;
    return m;
  };

  // ── 튜토리얼·도움말 ──
  let tutorial: TutorialHandle | null = null;
  let tutorialPractice = false;
  const syncPausedLook = () => app.classList.toggle('is-paused', paused || (tutorialOpen && !tutorialPractice));
  const startTutorial = () => {
    if (tutorial) return;
    overlayOpen = true;
    tutorialOpen = true;
    syncPausedLook();
    tutorial = tutorialOverlay(faction, {
      // 직접 해 보기 장면: 전투가 다시 흐르고 블록 바를 만질 수 있다. 장면을 나가면 다시 멈춘다
      onPractice: (on) => {
        tutorialPractice = on;
        overlayOpen = !on;
        syncPausedLook();
      },
      onFinish: () => {
        tutorialPractice = false;
        tutorial = null;
        overlayOpen = false;
        tutorialOpen = false;
        syncPausedLook();
        opts.tutorial?.onDone();
      },
    });
  };
  const openHelp = () => {
    if (overlayOpen) return;
    overlayOpen = true; // 열려 있는 동안 전투를 멈춘다
    helpOverlay(faction, { screen: 'battle', onClose: () => (overlayOpen = false), onReplayTutorial: () => { overlayOpen = false; startTutorial(); } });
  };
  helpBtn.onclick = openHelp;
  pauseBtn.dataset.sc = 'pause';
  helpBtn.dataset.sc = 'help';
  libBtn.dataset.sc = 'liberate';
  tray.cells.forEach((c, i) => (c.dataset.sc = `block.${i + 1}`));

  // ── 일시정지 ──
  /** 일시정지 창의 기기 레이어 등록을 푼다 (닫힐 때·그만둘 때) */
  let unregPause = (): void => undefined;
  const setPaused = (on: boolean) => {
    if (s.status !== 'playing' || overlayOpen) return;
    paused = on;
    attack.setPaused(halted());
    pauseBtn.replaceChildren(v2Svg(on ? 'i-play' : 'i-pause'));
    pauseBtn.setAttribute('aria-label', on ? '계속' : '일시정지');
    tray.root.classList.toggle('is-paused', on);
    syncPausedLook();
    unregPause();
    if (!on) return hideOverlay();
    // C.170 (GDD 100장 #7·#41): 버튼 한 줄 [계속][설정][그만두기] — 도움말은 머리 ? 아이콘. 뒤로(◀)·Esc = 계속 (기기 레이어로 등록)
    const inner = el('div', 'bha-battle-ov');
    const actions = el('div', 'bha-battle-ov__actions bha-battle-ov__actions--row');
    actions.append(button({ label: '계속', variant: 'primary', icon: 'i-play', onClick: () => setPaused(false) }));
    actions.append(button({ label: '설정', icon: 'i-settings', onClick: () => {
      if (overlayOpen) return;
      overlayOpen = true; // 설정 레이어가 열려 있는 동안도 전투는 멈춰 있다
      settingsOverlay(() => (overlayOpen = false));
    } }));
    if (opts.onQuit) actions.append(button({ label: '그만두기', variant: 'danger', icon: 'i-quit', onClick: () => { unregPause(); quit(); } }));
    // C.172 (GDD 100장 v5.220): 원정 전투는 [귀환] — 걷기 중간 귀환과 같은 확인 창(기본 선택 = 귀환하기), 아니오면 일시정지 그대로
    if (opts.onReturn) actions.append(button({ label: '귀환', icon: 'i-return', onClick: () => {
      if (overlayOpen) return;
      overlayOpen = true;
      confirmDialog({
        title: '지금 귀환할까요?',
        body: '이 전투는 패배로 치지 않아요 · 이번 바퀴 완주 보상은 없어요',
        yes: '귀환하기',
        no: '계속 싸우기',
        onYes: () => {
          overlayOpen = false;
          unregPause();
          stop();
          opts.onReturn?.();
        },
        onNo: () => (overlayOpen = false),
      });
    } }));
    inner.append(ovMark('i-pause'), el('h2', 'bha-battle-ov__title', '일시정지'), el('p', 'bha-battle-ov__sub', '전투가 멈춰 있다. 블록 바와 시간도 멈춘다.'), actions);
    const ov = showOverlay(inner);
    const off = registerLayer(ov, () => setPaused(false));
    unregPause = () => {
      unregPause = () => undefined;
      off();
    };
  };
  pauseBtn.onclick = () => setPaused(!paused);
  // 뒤로(◀·Esc·폰 뒤로) = 일시정지 (C.176, GDD 104장 7: 잠긴 화면에서 처음 화면 확인 대신). 일시정지 창이 열리면 그 창의 뒤로 = 계속
  registerCancelHook((top) => {
    if (stopped) return 'gone';
    if (top || paused || overlayOpen || s.status !== 'playing') return false;
    setPaused(true);
    return true;
  }, { button: true });
  // 처음 화면 복귀 확인창(Q-3)이 열리면 전투를 멈추고, 아니오로 닫히면 우리가 멈춘 것만 풀어 준다
  let heldByApp = false;
  unhold = onHold((sig) => {
    if (!app.isConnected || stopped) return stop();
    if (sig === 'hold') {
      if (!paused && !overlayOpen && s.status === 'playing') {
        setPaused(true);
        heldByApp = true;
      }
    } else if (sig === 'release') {
      if (heldByApp && paused) setPaused(false);
      heldByApp = false;
    } else {
      stop();
      tutorial?.dismiss(); // 튜토리얼은 본 것으로 치지 않는다 (다음 첫 전투에서 다시)
      tutorial = null;
    }
  });
  // ── 사건 로그 · 플로팅 숫자 · 번쩍임 ──
  const lines: HTMLElement[] = [];
  const say = (line: LogLine) => {
    const node = logLineEl(line.role, line.icon, line.text);
    log.append(node);
    lines.push(node);
    while (lines.length > BATTLE_LOG_MAX) lines.shift()!.remove();
    if (!log.hidden) log.scrollTop = log.scrollHeight;
  };
  let floatCount = 0;
  let hurtCount = 0;
  const pool = floatPool(floats);
  /** 피해 숫자(내가 준 것·받은 것·공허)는 설정에서 끌 수 있다. 막기·회복·체인 표시는 그대로 */
  const spawnFloat = (kind: FloatKind, text: string, opt: FloatOpts = {}) => {
    if (!fx.damageNumbers && (kind === 'attack' || kind === 'hurt' || kind === 'void')) return;
    const onMe = kind === 'hurt' || kind === 'void' || kind === 'guard' || kind === 'heal'; // 맞은 쪽 머리 위 (GDD 100장 #38)
    pool.show(kind, text, onMe ? HURT_SPOTS[hurtCount++ % HURT_SPOTS.length]! : floatSpot(floatCount++), opt);
  };
  /** 번쩍임: 한 번에 한 종류만 */
  const FLASH_CLASSES = ['is-chain2', 'is-chain3', 'is-guard', 'is-cast', 'is-special', 'is-win', 'is-lose'];
  const flash = (cls: string, ms = 500) => {
    fxFlash.classList.remove(...FLASH_CLASSES);
    replayOnce(fxFlash, cls, ms);
  };
  /** 화면 흔들림은 무대(블록 바 밖)만, 짧게. 블록 판정 좌표에는 영향이 없다 */
  const shake = () => {
    if (fx.shake) replayOnce(arena, 'is-shake', 320);
  };
  const cues: FxCue[] = [];
  /** 공격 연출 (GDD 17-4): 사건이 난 뒤 연출만 얹는다. 모션 줄이기·화면 흔들림 끔이면 돌진 없이 번쩍임만 */
  const attack = attackFx({
    player: { root: hero.root, body: hero.body, dir: 1, loco: heroLoco, anim: heroAnim },
    enemy: { root: foe, body: foe.querySelector<HTMLElement>('.bha-foe__body')!, dir: -1, anim: foeAnim },
    top,
    mode: fxModeOf(prefersReducedMotion(), fx.shake),
    unit: () => 1.6, // 장면이 커졌으므로 물러남·밀림 거리도 함께 키운다
    maxReach: () => arena.offsetWidth * FX_REACH_FIELD, // 몸통박치기는 필드 폭의 18% 만 앞으로 (적까지 가지 않는다, GDD 99장 4)
    // 계열별 공격 (GDD 19-2): 연출 종류는 종족 설정 계열 데이터(fx)에서, 기술 이름은 17-3 단계 기술 이름
    layer: fxLayer,
    // 단계 고유 연출 (C.63): 종족 설정 tiers[].fx·fxLook 이 있으면 그 단계만 다르게 (예 세로 오스큐라스 = 검은 빔 + 녹색 테두리)
    familyFx: (id, stage) => {
      const f = familyOf(faction, id);
      if (!f) return null;
      const t = f.tiers[stage - 1];
      return { fx: t?.fx ?? f.fx, look: t?.fxLook ?? null };
    },
    nameOf: (e) => {
      if (e.kind !== 'block' || e.damage <= 0) return null;
      if (e.block === 'combo') return { name: e.traitId ? comboName(e.traitId, faction.id) : '콤보', ult: true };
      if (e.block !== 'skill' || e.role !== 'attack') return null;
      const name = familySkillName(labels, e.family, Math.min(e.chain, FAMILY_TIERS));
      return name ? { name } : null;
    },
    shake,
  });
  if (testSpeedMul() !== 1) attack.setSpeed(testSpeedMul());
  const n0 = (v: number) => String(Math.round(v));
  /** 피해 크기 기준 (C.63): 내 기본 공격 1회 피해(육성·환경 반영) / 적 쪽은 기본 공격 피해 단위 */
  const myUnit = p.playerAttackDamage * p.growthMultiplier * p.playerPowerMultiplier * p.attackPowerMultiplier;
  const hurtUnit = p.playerAttackDamage;
  const react = (e: CombatEvent) => {
    const cue = cueOf(e, top);
    if (cue) cues.push(cue);
    attack.react(e);
    if (e.kind === 'block' || e.kind === 'liberate') tutorial?.blockUsed();
    switch (e.kind) {
      case 'player-attack':
        // 기본 공격 숫자는 평소 띄우지 않는다(화면이 붐빈다). 치명타만 크게
        if (e.crit) spawnFloat('attack', `−${n0(e.damage)}`, { critical: true });
        break;
      case 'block': {
        if (e.block === 'void') {
          spawnFloat('void', `−${n0(e.damage)}`, { iconId: 'i-void' });
          replayOnce(flashVoid, 'is-on', 900);
        } else if (e.block === 'skill' && e.role === 'guard') {
          spawnFloat('guard', secondsText(e.guardSeconds), { iconId: 'i-guard' });
        } else if (e.block === 'skill' && e.role === 'heal') {
          spawnFloat('heal', n0(e.heal));
        } else {
          const ult = e.block === 'combo' || e.block === 'liberation';
          spawnFloat('attack', `−${n0(e.damage)}`, { weak: e.matchup === 'strong', chained: e.chain > 1, size: damageTier(e.damage, myUnit, { chain: e.chain, ult }), critical: !!e.crit, element: e.element });
        }
        // 상성 문구 (GDD 20-2, 종족 설정 matchupText)
        if (e.matchup === 'strong') spawnFloat('strong', labels.matchupText.strong);
        else if (e.matchup === 'weak') spawnFloat('dull', labels.matchupText.weak);
        if (e.chain > 1) {
          // 계열 공격은 단계 기술 이름을 공격 연출이 장면 위쪽에 크게 띄운다(GDD 19-2). 그 밖(막기·회복·기본 블록)은 체인 N
          if (!familySkillName(labels, e.family, e.chain)) spawnFloat('chain', `${labels.chain}${e.chain}!`, { chain3: e.chain >= top });
          flash(e.chain >= top ? 'is-chain3' : 'is-chain2');
        }
        if (e.block === 'combo') flash('is-special', 600);
        break;
      }
      case 'ability':
        // 진화체 특성 발동 글자 (GDD 39장 5번): 연타! / 되갚기! / 다시 일어남! / 연쇄!
        spawnFloat('chain', abilityProcText(e.effect, faction.id), { chain3: e.effect !== 'chainHaste' });
        if (e.effect === 'thorns') spawnFloat('attack', `−${n0(e.damage)}`, { size: 'big' });
        break;
      case 'combo':
        spawnFloat('chain', `콤보! ${comboName(e.comboId, faction.id)}`, { chain3: true });
        flash('is-special', 600);
        break;
      case 'liberate':
        // 해방 변신 애니(release)가 있으면 그것이 변신 연출이다 — 공통 컷인은 없을 때만 (GDD 26-3)
        if (!heroAnim?.play('release', { onEnd: () => heroAnim.stop() })) replayOnce(libCut, 'is-on', 1400);
        flash('is-special', 700);
        shake();
        break;
      case 'liberation-end':
        replayOnce(flashVoid, 'is-on', 900);
        break;
      case 'enemy-attack':
        if (e.guarded) {
          spawnFloat('guard', labels.role.guard, { iconId: 'i-guard' });
          flash('is-guard');
        } else if (e.damage > 0) {
          replayOnce(flashHit, 'is-on', 600);
          spawnFloat('hurt', `−${n0(e.damage)}`, { size: damageTier(e.damage, hurtUnit), critical: !!e.crit });
        }
        break;
      case 'heavy-hit':
        if (e.guarded) {
          blockedUntil = performance.now() + 1200;
          blockedDamage = e.damage;
          spawnFloat('guard', labels.role.guard, { iconId: 'i-guard' });
          flash('is-guard', 600);
        } else {
          replayOnce(flashHit, 'is-on', 600);
          spawnFloat('hurt', `−${n0(e.damage)}`, { size: 'big', critical: !!e.crit });
          shake();
        }
        break;
      case 'heavy-cast':
        flash('is-cast', 600);
        break;
      case 'evade':
        spawnFloat('guard', '회피');
        break;
      case 'counter':
        if (e.guarded) {
          flash('is-guard');
        } else {
          replayOnce(flashHit, 'is-on', 600);
          spawnFloat('hurt', `−${n0(e.damage)}`, { size: damageTier(e.damage, hurtUnit), critical: !!e.crit });
        }
        break;
      case 'end':
        flash(e.status === 'won' ? 'is-win' : 'is-lose', 900);
        // 승리: 나는 기뻐하고 적은 쓰러진다 / 패배: 나는 쓰러지고 적이 기뻐한다. 마지막 장을 유지. 동작이 없으면 위 번쩍임만 (GDD 26-3)
        heroAnim?.play(e.status === 'won' ? 'win' : 'lose');
        foeAnim?.play(e.status === 'won' ? 'lose' : 'win');
        break;
      default:
        break;
    }
  };

  // ── 블록 바 그리기 (바뀐 곳만) ──
  /** 누르고 있는 블록: uid 로 추적한다 (그 사이 앞 블록이 쓰여 칸 번호가 바뀌어도 따라간다) */
  let down: { uid: number; id: number } | null = null;
  const indexOfUid = (uid: number) => s.tray.findIndex((b) => b.uid === uid);
  const blockEls = new Map<number, HTMLElement>();
  const placedAt = new Map<number, number>();
  let seeded = false;
  let runSig = '';
  let runEls: { spec: RunSpec; node: HTMLElement }[] = [];
  let cutEls: HTMLElement[] = [];
  let noteKey = '';

  const makeBlock = (b: Block): HTMLElement => {
    const eff = blockEffect(s, b);
    const isBasic = b.kind === 'skill' && (b.traitId === BASIC_SKILL_ID || !b.traitId);
    const visual = blockVisual(b.kind, isBasic, eff?.skill.role ?? null);
    const label = blockName(b, labels, faction.id, s.params);
    const weak = eff?.matchup === 'strong';
    // 각인 컷 (핸드오프 README 5): 공격 = 속성 색 + 계열 글자·아이콘, 막기·회복·공허·콤보·해방 = 고정 색 + 역할 글자·아이콘
    if (visual === 'guard') return v2BlockEl({ kind: 'guard', path: V2_PATH.guard, glyph: V2_GLYPH.guard, label, uid: b.uid, weak });
    if (visual === 'heal') return v2BlockEl({ kind: 'heal', path: V2_PATH.heal, glyph: V2_GLYPH.heal, label, uid: b.uid, weak });
    if (visual === 'void') return v2BlockEl({ kind: 'void', path: V2_PATH.void, glyph: V2_GLYPH.void, label, uid: b.uid, weak });
    if (b.kind === 'liberation') return v2BlockEl({ kind: 'release', path: V2_PATH.release, glyph: V2_GLYPH.release, label, uid: b.uid, weak });
    if (b.kind === 'combo') return v2BlockEl({ kind: 'combo', path: V2_PATH.combo, glyph: V2_GLYPH.combo, label, uid: b.uid, weak });
    // 블록 색 = 그 블록의 실제 속성 (C.131, GDD 77장 ⑦·79장): 기본 블록은 내 속성이 아니라 노말
    const elId = isBasic ? NORMAL_ELEMENT : (b.element ?? blockElementOf(s.params, b));
    return v2BlockEl({
      kind: v2AttackKind(elId),
      path: v2FamilyPath(faction.families.find((f) => f.id === b.family)?.fx),
      glyph: familyAbbr(labels, b.family) ?? V2_GLYPH.combo,
      label, uid: b.uid, weak,
    });
  };

  /** 쓰여서 바에서 사라진 블록: 제자리에서 발동 연출(is-fire)을 하고 지운다 (엔진은 바로 오른쪽 블록을 당긴다) */
  const fireAway = (node: HTMLElement) => {
    const g = elementLocalRect(tray.grid);
    const r = elementLocalRect(node);
    node.classList.remove('is-pressed', 'is-popin', 'is-cue');
    node.style.cssText = `position:absolute;left:${r.left - g.left}px;top:${r.top - g.top}px;width:${r.width}px;height:${r.height}px;z-index:5;margin:0`;
    tray.grid.append(node);
    node.classList.add('is-fire');
    const done = () => node.remove();
    node.addEventListener('animationend', done);
    window.setTimeout(done, 700);
  };

  const drawTray = () => {
    const count = s.tray.length;
    tutorial?.trayCount(count);
    // 사라진 블록
    const present = new Set(s.tray.map((b) => b.uid));
    const gone: number[] = [];
    for (const [uid, node] of blockEls) {
      if (present.has(uid)) continue;
      gone.push(placedAt.get(uid) ?? -1);
      blockEls.delete(uid);
      placedAt.delete(uid);
      fireAway(node);
    }
    // 체인 묶음 연출: 두 개 이상 한꺼번에 사라졌으면 그 묶음 표시도 발동
    if (gone.length >= 2) {
      const hit = runEls.find((r) => gone.some((i) => i + 1 >= r.spec.start && i + 1 < r.spec.start + r.spec.len));
      if (hit) {
        const ghost = hit.node.cloneNode(true) as HTMLElement;
        ghost.classList.add('is-fire');
        tray.grid.append(ghost);
        const done = () => ghost.remove();
        ghost.addEventListener('animationend', done);
        window.setTimeout(done, 900);
      }
    }
    // 묶음 (GDD 19-2): 같은 계열 덩어리를 앞에서부터 최대 체인 개씩 나눈 발동 묶음 + 덩어리 안 묶음 경계 표시
    const groups = chainGroupsOf(s.tray, top);
    const specs = runSpecs(groups, (i) => s.tray[i]?.kind === 'skill', top);
    const cuts = groupCuts(runsOf(s.tray), groups).filter((i) => s.tray[i]?.kind === 'skill');
    const sig = `${specs.map((r) => `${r.start}:${r.len}`).join('|')}/${cuts.join(',')}`;
    if (sig !== runSig) {
      runSig = sig;
      for (const r of runEls) r.node.remove();
      for (const c of cutEls) c.remove();
      runEls = specs.map((spec) => ({ spec, node: v2ChainEl(spec, labels.chain) }));
      cutEls = cuts.map(v2CutEl);
      for (const r of runEls) tray.grid.append(r.node);
      for (const c of cutEls) tray.grid.append(c);
    }
    // 칸마다 블록 배치 + 상태 클래스
    const casting = s.enemy.cast !== null;
    tray.cells.forEach((cell, i) => {
      const b = s.tray[i];
      if (!b) {
        if (cell.firstChild) cell.replaceChildren();
        return;
      }
      let node = blockEls.get(b.uid);
      if (!node) {
        node = makeBlock(b);
        blockEls.set(b.uid, node);
        if (seeded) playOnce(node, 'is-popin');
      }
      placedAt.set(b.uid, i);
      if (node.parentElement !== cell) cell.replaceChildren(node);
      const level = chainLevelAt(specs, i);
      setV2Pips(node, level);
      node.classList.toggle('is-cue', casting && node.dataset.kind === 'guard');
      // 보스 기믹 칸 봉인 (GDD 25-3): 글자가 '봉'으로 바뀌고 회색, 누를 수 없다
      // 막기·공허 경직 중(공격 불가)에는 블록을 쓸 수 없다 (GDD 105장 1번): 같은 잠금 표시
      const locked = (b.sealTicks ?? 0) > 0 || combatHalted(s);
      setV2Locked(node, locked);
      node.setAttribute('aria-disabled', String(locked));
      node.classList.toggle('is-pressed', !!down && down.uid === b.uid);
    });
    seeded = true;
    // 안내 줄: 봉인
    const sealed = s.sealTicks > 0;
    tray.root.classList.toggle('is-sealed', sealed);
    let key = '';
    let build: (() => void) | null = null;
    if (sealed) {
      key = 'sealed';
      build = () => trayNote.replaceChildren(wrapNote('i-seal', `봉인 중: 새 ${labels.skillBlock}이(가) 생기지 않는다. 있는 블록은 쓸 수 있다`));
    }
    if (key !== noteKey) {
      noteKey = key;
      if (build) build();
      else trayNote.replaceChildren();
    }
  };
  const wrapNote = (iconId: string, text: string): HTMLElement => {
    const w = el('span');
    w.append(icon(iconId, 'sm'), text);
    return w;
  };

  const meterCache = { enemy: '', player: '', sp: '' };
  const drawHud = () => {
    const now = performance.now();
    // 체력·SP
    const eRatio = `${Math.round(s.enemy.hp * 10)}`;
    if (meterCache.enemy !== eRatio) {
      meterCache.enemy = eRatio;
      setHpBar(enemyHp, s.enemy.hp, s.enemy.maxHp);
      if (riskChipValue) {
        const rv = String(Math.round((opts.risk ?? 0) + s.riskGained));
        if (riskChipValue.textContent !== rv) riskChipValue.textContent = rv;
      }
    }
    const pRatio = `${Math.round(s.player.hp * 10)}/${Math.round(s.player.maxHp)}`;
    if (meterCache.player !== pRatio) {
      meterCache.player = pRatio;
      setHpBar(playerHp, s.player.hp, s.player.maxHp);
      playerHp.root.classList.toggle('is-danger', s.player.hp / s.player.maxHp < 0.3);
    }

    const mn = s.boss?.minion;
    setHidden(minionChip, !mn);
    if (mn) setText(minionText, `졸개 ${hpNumbers(mn.hp, mn.maxHp).now}/${hpNumbers(mn.hp, mn.maxHp).max}`);
    setText(timeNum, String(Math.ceil(timeLeftSeconds(s))));
    timeEl.classList.toggle('is-urgent', timeLeftSeconds(s) <= 10);

    // 머리 위 게이지: 강공격 예고(시전 바)·방어 자세 (적), 봉인·막기 (나). 엔진 상태에서 읽기만 한다
    const cast = s.enemy.cast;
    const wantBlocked = !cast && now < blockedUntil;
    const stanceSec = s.enemy.stance ? s.enemy.stance.ticks * p.tickSeconds : 0;
    const sealSec = s.sealTicks * p.tickSeconds;
    // 공허 경직 (GDD 101장 추가 결정 2번)도 막기처럼 공격·생성이 멈춰 같은 게이지에 보인다
    const stunSec = s.guard.ticks > 0 ? 0 : (s.stunTicks ?? 0) * p.tickSeconds;
    const guardSec = s.guard.ticks * p.tickSeconds + stunSec;
    totals.stance = trackTotal(totals.stance, stanceSec);
    totals.seal = trackTotal(totals.seal, sealSec);
    totals.guard = trackTotal(totals.guard, guardSec);
    // 장비 발동 방패·소모품 각성 (GDD 105장 수정 3·4): 내 머리 위 세 번째 게이지
    const buffSec = (s.gearShieldTicks > 0 ? s.gearShieldTicks : s.hasteTicks) * p.tickSeconds;
    totals.weaken = trackTotal(totals.weaken, buffSec);
    const foeSlots = gaugeSlots([true, stanceSec > 0]);
    const meSlots = gaugeSlots([sealSec > 0, guardSec > 0, buffSec > 0]);
    castGauge.set(
      cast
        ? { on: true, fill: (cast.total - cast.ticks) / cast.total, label: `강공격 예고! ${secondsText(cast.ticks * p.tickSeconds)}`, slot: foeSlots[0]! }
        : wantBlocked
          ? { on: true, fill: 1, label: `막았다! 피해 ${Math.round(blockedDamage)}`, slot: foeSlots[0]!, done: true }
          : { on: false, fill: 0, label: '', slot: foeSlots[0]! },
    );
    stanceGauge.set({ on: stanceSec > 0, fill: gaugeFill(stanceSec, totals.stance), label: `방어 자세 ${secondsText(stanceSec)}`, slot: foeSlots[1]! });
    sealGauge.set({ on: sealSec > 0, fill: gaugeFill(sealSec, totals.seal), label: `봉인 ${secondsText(sealSec)}`, slot: meSlots[0]! });
    // 막기 대가 (GDD 84장 2번): 막기 동안 내 자동 공격·블록 생성이 멈춘다. 막기 = 강공격 완전 막기 (105장 수정), 시간은 게이지 채움
    const guardLabel = stunSec > 0 ? `경직 ${secondsText(guardSec)} · 공격·생성 멈춤` : `${labels.role.guard} · 강공격 막기`;
    guardGauge.set({ on: guardSec > 0, fill: gaugeFill(guardSec, totals.guard), label: guardLabel, slot: meSlots[1]! });
    const buffLabel = s.gearShieldTicks > 0 && p.activeGear?.effect === 'shield' ? `받는 피해 −${Math.round(p.activeGear.reduction * 100)}% ${secondsText(buffSec)}` : `블록 생성 ↑ ${secondsText(buffSec)}`;
    weakenGauge.set({ on: buffSec > 0, fill: gaugeFill(buffSec, totals.weaken), label: buffLabel, slot: meSlots[2]! });
    foe.classList.toggle('is-casting', cast !== null);
    foe.classList.toggle('is-guard', s.enemy.stance !== null);

    // 상태 칩
    setHidden(voidChip.root, s.voidUsed <= 0);
    if (s.voidUsed > 0) setText(voidChip.value, `${s.voidUsed}회`);
    setHidden(chain3Chip.root, s.chain3Count <= 0);
    if (s.chain3Count > 0) setText(chain3Chip.value, `${s.chain3Count}회`);
    setText(tray.veilText, `봉인 — ${labels.skillBlock} 생성 정지 ${secondsText(s.sealTicks * p.tickSeconds)}`);

    // 막기 게이지·[소모품]·[장비] (GDD 105장 수정): 쓸 수 있으면 강조, 못 쓰면 흐리게 — 자리는 그대로
    const setAct = (btn: { root: HTMLElement }, ready: boolean, label: string) => {
      btn.root.classList.toggle('is-ready', ready);
      btn.root.classList.toggle('is-disabled', !ready);
      btn.root.setAttribute('aria-disabled', String(!ready));
      if (btn.root.getAttribute('aria-label') !== label) {
        btn.root.setAttribute('aria-label', label);
        btn.root.title = label;
      }
    };
    // 폰 폭(루트 논리 폭 760 아래)이면 소모품·장비는 아이콘만 (GDD 105장 수정 6)
    const compact = Number(app.style.getPropertyValue('--v2-w') || 640) < 760;
    if (roles.classList.contains('is-compact') !== compact) roles.classList.toggle('is-compact', compact);
    // 범례 줄은 버튼 줄 왼쪽 끝까지만 (버튼 폭이 이름·남은 개수·쿨다운 글자로 바뀌어도 겹치지 않게)
    const legendRight = `${Math.max(0, controls.clientWidth - roles.offsetLeft + 6)}px`;
    if (roles.offsetWidth > 0 && legendRow.style.right !== legendRight) legendRow.style.right = legendRight;
    const gPct = Math.round(Math.min(1, s.guardGauge) * 100);
    guardFill.style.width = `${gPct}%`;
    guardBtn.root.classList.toggle('is-full', s.guardGauge >= 1);
    setAct(guardBtn, canGuard(s), s.guard.ticks > 0 ? `${labels.role.guard} 중` : s.guardGauge >= 1 ? `${labels.role.guard} 준비됨 — 눌러 ${p.guardSeconds}초 강공격 막기` : `${labels.role.guard} 게이지 ${gPct}%`);
    const it = p.battleItem;
    const itemLeft = opts.battleItem && it ? opts.battleItem.count - (s.itemUsed ? 1 : 0) : 0;
    setText(itemBtn.meta, it ? (s.itemUsed ? '씀' : `×${itemLeft}`) : '');
    setAct(itemBtn, canUseItem(s), !it ? '소모품 칸이 비었어요 (장비 화면에서 넣기)' : s.itemUsed ? `${consumableName(it.id)} — 이번 전투에 씀` : it.effect === 'heal' && p.noHealSpawn ? `${consumableName(it.id)} — 한계 돌파 중 못 씀` : `${consumableName(it.id)} — ${battleItemText(it.id)} (전투당 1번, 남은 ${itemLeft}개)`);
    const cdSec = s.gearCooldown * p.tickSeconds;
    setText(gearBtn.meta, p.activeGear && cdSec > 0 ? `${Math.ceil(cdSec)}` : '');
    setAct(gearBtn, canUseGear(s), !p.activeGear ? '발동 장비 없음 (발동 효과가 있는 장비를 끼면 쓸 수 있어요)' : `${gearActiveText(p)}${cdSec > 0 ? ` · ${Math.ceil(cdSec)}초 뒤` : ' · 준비됨'}`);

    // 해방 (GDD 83장): 버튼 = 게이지(해방 중에는 남은 시간), 장면 = 오오라
    const libActive = liberationActive(s);
    app.classList.toggle('is-liberated', libActive);
    app.classList.toggle('is-unique', libActive && labels.liberation.unique);
    setHidden(libChipRoot.root, !libActive);
    const tip = libActive ? hintDuring : hintFull;
    if (libBtn.title !== tip) libBtn.title = tip;
    if (libActive) setText(libChipRoot.value, secondsText(s.liberation.ticksLeft * p.tickSeconds));
    if (libOn) {
      const lb = s.liberation;
      const ready = canLiberate(s);
      setV2Gauge(libGauge, (libActive ? lb.ticksLeft / Math.max(1, Math.round(p.liberationSeconds / p.tickSeconds)) : lb.gauge / LIBERATION_GAUGE_MAX) * 100);
      libBtn.classList.toggle('is-ready', ready);
      libBtn.classList.toggle('is-disabled', !ready);
      libBtn.classList.toggle('is-on', libActive);
      libBtn.setAttribute('aria-disabled', String(!ready));
      const libText = libActive ? `해방 중 ${secondsText(lb.ticksLeft * p.tickSeconds)}` : ready ? '준비됨 — 눌러 해방' : `게이지 ${Math.floor(lb.gauge)}%`;
      setText(libMeta, libText);
      libBtn.title = libText;
      libBtn.setAttribute('aria-label', `${labels.liberation.name}, ${libText}`);
    }
  };

  // ── 입력: 포인터 이벤트(터치·마우스 공통). 클릭 = 같은 블록 위에서 누르고 뗀 것. 시간·거리 제한은 없다 ──
  const queue: CombatInput[] = [];
  // 칸 찾기는 기기 안 좌표(가로 방향)로: 세로 폰에서는 기기를 돌려 놓았으므로 화면 좌표를 바꿔 쓴다 (GDD 16-6)
  const slotOf = (e: { clientX: number; clientY: number }) => {
    const r = elementLocalRect(tray.grid);
    return slotAt(pointerLocal(e).x, r.left, r.width, cap);
  };
  // 해방 버튼: 블록과 같은 판정 (버튼 위에서 누르고 버튼 위에서 떼면 사용 — 옛 저장 필살기 버튼 판정)
  let libDown: number | null = null;
  const overLib = (e: PointerEvent) => {
    const r = libBtn.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  };
  libBtn.addEventListener('pointerdown', (e) => {
    if (libDown !== null || s.status !== 'playing') return;
    libBtn.setPointerCapture(e.pointerId);
    libDown = e.pointerId;
    libBtn.classList.add('is-pressed');
  });
  libBtn.addEventListener('pointercancel', () => {
    libDown = null;
    libBtn.classList.remove('is-pressed');
  });
  libBtn.addEventListener('pointerup', (e) => {
    if (libDown !== e.pointerId) return;
    libDown = null;
    libBtn.classList.remove('is-pressed');
    if (overLib(e) && canLiberate(s) && !halted()) queue.push({ type: 'liberate' });
  });
  // 막기·소모품·장비: 누르면 바로 (엔진이 게이지·쿨다운·잠김을 판정)
  const canAct = { guard: canGuard, item: canUseItem, gear: canUseGear } as const;
  const pressAct = (kind: 'guard' | 'item' | 'gear'): boolean => {
    if (!app.isConnected || stopped || s.status !== 'playing' || halted() || !canAct[kind](s)) return false;
    queue.push({ type: kind });
    return true;
  };
  for (const [kind, btn] of [['guard', guardBtn], ['item', itemBtn], ['gear', gearBtn]] as const) btn.root.addEventListener('click', () => void pressAct(kind));
  const endPress = () => {
    down = null;
    drawTray();
  };
  tray.root.addEventListener('pointerdown', (e) => {
    if (down || s.status !== 'playing' || halted() || combatHalted(s)) return;
    const b = s.tray[slotOf(e)];
    if (!b) return;
    tray.root.setPointerCapture(e.pointerId);
    down = { uid: b.uid, id: e.pointerId };
    drawTray();
  });
  tray.root.addEventListener('pointercancel', endPress);
  tray.root.addEventListener('pointerup', (e) => {
    if (!down || e.pointerId !== down.id) return;
    const input = releaseUse(down.uid, slotOf(e), s.tray);
    if (input && s.status === 'playing' && !halted()) queue.push(input);
    endPress();
  });
  // PC 단축키 (GDD 18-5): 숫자 N = N번 칸 블록, R = 해방 (저장 필살기 Q 는 C.134 에 삭제). 클릭과 같은 판정(releaseUse)을 쓴다
  const offKeys = registerShortcutHandlers({
    ...Object.fromEntries(Array.from({ length: p.trayCapacity }, (_, i) => [`block.${i + 1}`, () => {
      const blk = s.tray[i];
      if (!app.isConnected || stopped || !blk || s.status !== 'playing' || halted()) return false;
      const input = releaseUse(blk.uid, i, s.tray);
      if (input) queue.push(input);
      return !!input;
    }])),
    liberate: () => {
      if (!app.isConnected || stopped || !canLiberate(s) || halted()) return false;
      queue.push({ type: 'liberate' });
      return true;
    },
    guard: () => pressAct('guard'),
    item: () => pressAct('item'),
    gear: () => pressAct('gear'),
  });
  void offKeys;
  // 키보드: 블록에 초점을 두고 Enter/Space = 사용 (PC 모드의 Space 는 일시정지 단축키라 Enter 만)
  tray.root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && !(e.key === ' ' && !currentViewState().pc)) return;
    const uid = Number((e.target as HTMLElement).dataset.uid);
    const from = Number.isFinite(uid) ? indexOfUid(uid) : -1;
    if (from < 0 || s.status !== 'playing' || halted()) return;
    e.preventDefault();
    queue.push({ type: 'use', cell: from });
  });

  // ── 끝: 결과 오버레이 (버튼을 누르면 다음 화면) ──
  let ended = false;
  const showResult = () => {
    const finish = () => {
      if (ended) return;
      ended = true;
      opts.onEnd(s);
    };
    const inner = el('div', s.status === 'won' ? 'bha-battle-ov bha-battle-ov--win' : 'bha-battle-ov bha-battle-ov--lose');
    const actions = el('div', 'bha-battle-ov__actions');
    if (s.status === 'won') {
      const canAbsorb = absorbReasons(s).length > 0;
      // 버튼 글자는 상태가 아니라 행동으로 (GDD 100장 #42)
      const go = button({ label: canAbsorb ? `${faction.absorbActionName}하러 가기` : '계속', variant: 'primary', size: 'lg', icon: canAbsorb ? 'i-absorb' : undefined, onClick: finish });
      go.append(icon('i-chevron-right'));
      actions.append(go);
      inner.append(
        ovMark('i-flag-win'),
        el('span', 'bha-battle-ov__eyebrow', `${Math.round(elapsedSeconds(s))}초${s.chain3Count > 0 ? ` · ${labels.chain}${top} ${s.chain3Count}` : ''}`),
        el('h2', 'bha-battle-ov__title', '승리'),
        el('p', 'bha-battle-ov__sub', `${enemyName}을(를) 쓰러뜨렸다.`),
        actions,
      );
    } else {
      const timeout = s.lossReason === 'timeout';
      const go = button({ label: '결과 보기', size: 'lg', onClick: finish });
      go.append(icon('i-chevron-right'));
      actions.append(go);
      const sub = el('p', 'bha-battle-ov__sub', timeout ? `남은 시간 안에 쓰러뜨리지 못했다. 적 체력 ${hpNumbers(s.enemy.hp, s.enemy.maxHp).now} / ${hpNumbers(s.enemy.hp, s.enemy.maxHp).max}` : '체력이 0이 되었다.');
      inner.append(
        ovMark(timeout ? 'i-timer' : 'i-broken', timeout ? 'var(--bha-warn)' : 'var(--bha-danger)'),
        el('span', 'bha-battle-ov__eyebrow', timeout ? '시간 초과 패배' : '패배'),
        el('h2', 'bha-battle-ov__title', timeout ? '시간이 다 됐다' : labels.defeatState),
        sub,
        actions,
      );
    }
    showOverlay(inner);
    if (s.status === 'won') playCosmeticFx('win', inner.parentElement ?? inner); // 승리 연출 꾸밈 (GDD 25-11)
    actions.querySelector<HTMLElement>('button')?.focus();
  };

  // ── 실시간 루프: 화면 프레임마다 쌓인 시간만큼 엔진 틱을 돌린다 (1x/2x) ──
  const tickMs = p.tickSeconds * 1000;
  let acc = 0;
  let fxHalted = false;
  let last = performance.now();
  const frame = (now: number) => {
    if (stopped) return;
    const dt = Math.min(250, now - last);
    last = now;
    if (s.status === 'playing') {
      if (halted() !== fxHalted) attack.setPaused((fxHalted = halted()));
      const f = frameTicks(acc, dt, testSpeedMul(), tickMs, halted()); // 1배 고정 (GDD 62장, C.118) × 테스트 모드 속도 배율 (GDD 38-4, 평소 1)
      acc = f.acc;
      for (let n = 0; n < f.ticks && s.status === 'playing'; n++) {
        const usedBefore = s.itemUsed;
        step(s, queue.splice(0, queue.length));
        // 소모품을 썼으면 보관 개수 −1 (GDD 108장 3번, 부르는 쪽이 세이브에 반영)
        if (!usedBefore && s.itemUsed) opts.battleItem?.onUse();
      }
    }
    if (halted()) queue.length = 0;
    for (const ev of drainCombatEvents(s)) {
      const line = eventLine(ev, s, labels, faction.id);
      if (line) say(line);
      react(ev);
      if (ev.kind === 'boss-phase') {
        setText(phaseChip.lastElementChild as HTMLElement, phaseText());
        app.classList.add('is-boss-phase');
        playOnce(phaseChip, 'is-flash');
      }
      if (ev.kind === 'boss-element') {
        fillElementChip(weakChip);
        playOnce(weakChip, 'is-flash');
        showElementBand();
      }
      if (ev.kind === 'boss-summon') playOnce(minionChip, 'is-flash');
    }
    if (cues.length) {
      const c = strongestCue(cues);
      cues.length = 0;
      if (c) emitFeedback(c, fx);
    }
    drawHud();
    drawTray();
    if (s.status !== 'playing') {
      stop();
      if (s.status === 'lost') say({ role: 'cast', icon: 'i-broken', text: s.lossReason === 'timeout' ? '시간 제한을 넘겼다…' : `${labels.defeatState}…` });
      endPress();
      if (tutorialOpen) tutorial?.close(); // 직접 해 보기 중에 끝나면 튜토리얼도 마무리
      window.setTimeout(showResult, 700);
      return;
    }
    requestAnimationFrame(frame);
  };

  drawHud();
  drawTray();
  say({ role: 'cast', icon: 'i-cast', text: `${enemyName}과(와) 조우! 블록을 눌러 쓰고, 붙여 놓아 ${labels.chain}!` });
  requestAnimationFrame(frame);

  // 조우 연출 (전투 시간은 멈춰 있다): 눌러서 넘기거나 잠시 뒤 사라진 다음 튜토리얼이 있으면 시작한다
  const encounter = el('div', `bha-battle-ov bha-battle-ov--encounter${opts.boss ? ' bha-battle-ov--boss' : ''}`);
  const stats = el('div', 'bha-battle-ov__stats');
  if (opts.boss) stats.append(tag('보스', 'elite'));
  else if (enemy.class === 'elite') stats.append(tag('강적', 'elite'));
  stats.append(elementChip());
  if (patternView) {
    const pc = el('span', 'bha-chip bha-chip--pattern');
    pc.append(icon(patternView.icon), patternView.label);
    stats.append(pc);
  }
  encounter.append(
    el('span', 'bha-battle-ov__eyebrow', opts.boss ? `${opts.boss.eyebrow} · ${opts.banner ?? ''}` : opts.banner ?? '전투 연습'),
    el('span', 'bha-battle-ov__line'),
    el('h2', 'bha-battle-ov__title', opts.boss ? enemyName : `${enemyName}과(와) 조우!`),
    el('span', 'bha-battle-ov__line'),
    stats,
  );
  // 보스 속성이 바뀔 때 이름 띠 (GDD 35장): 보스 이름 + 새 속성 칩. 잠시 전투 시간이 멈춘다
  function showElementBand(): void {
    if (overlayOpen || overlayEl || s.status !== 'playing') return;
    const band = el('div', 'bha-battle-ov bha-battle-ov--encounter bha-battle-ov--boss');
    const row = el('div', 'bha-battle-ov__stats');
    row.append(tag('속성 변화', 'elite'), elementChip());
    band.append(el('span', 'bha-battle-ov__eyebrow', `페이즈 ${s.boss?.phase ?? 1}`), el('span', 'bha-battle-ov__line'), el('h2', 'bha-battle-ov__title', enemyName), el('span', 'bha-battle-ov__line'), row);
    overlayOpen = true;
    const ov = showOverlay(band);
    let done = false;
    const close = () => {
      if (done) return;
      done = true;
      if (overlayEl === ov) hideOverlay();
      overlayOpen = false;
    };
    ov.addEventListener('pointerdown', close);
    window.setTimeout(close, 1400);
  }

  overlayOpen = true;
  const encounterOverlay = showOverlay(encounter);
  let encounterDone = false;
  const endEncounter = () => {
    if (encounterDone) return;
    encounterDone = true;
    hideOverlay();
    overlayOpen = false;
    if (opts.tutorial) startTutorial();
  };
  encounterOverlay.addEventListener('pointerdown', endEncounter);
  window.setTimeout(endEncounter, opts.boss ? 2600 : 1500); // 보스 이름 띠는 조금 더 오래
}
