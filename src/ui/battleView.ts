// 전투 화면 v3 (GDD 3-5 v0.8, UI 디자인 U-2): 실시간 자동 전투 + 일자 8칸 스킬 블록 바. 원정과 연습이 같이 쓴다.
// 엔진 틱(0.1초)을 실시간 1x/2x 로 돌린다. 클릭(누른 뒤 0.3초 이내 떼기) = 블록 사용(붙은 같은 블록이 함께 발동해 체인),
// 드래그 = 놓은 칸에 끼워 넣어 순서 변경. 오래 누르면 사용되지 않는다. 클릭 판정은 여기(실시간)서, 엔진은 use/move 결과만 받는다.
// 텍스트는 FactionConfig·데이터에서 읽고 종족 id 로 분기하지 않는다.
// 화면 모양(DOM·클래스)은 디자인 패키지 battle.html 을 따른다. 전투는 고정 틱으로 계속 갱신되므로 DOM 을 통째로 다시 만들지 않고
// 바뀐 곳만 갱신한다(블록은 uid 로 같은 요소를 계속 쓰고, 묶음·삽입 막대는 달라졌을 때만 바꾼다).
import { enemyPatternKind } from '../data/enemies';
import { pickFaction } from '../data/schema';
import { traitAbbr, traitName } from '../data/traits';
import { absorbReasons } from '../engine/absorb';
import {
  BASIC_SKILL_ID, blockEffect, drainCombatEvents, elapsedSeconds, maxChain, runsOf, step, timeLeftSeconds,
  type Block, type CombatEvent, type CombatInput, type CombatState,
} from '../engine/combat';
import type { FactionConfig } from '../engine/faction';
import { frameTicks } from '../engine/tutorial';
import { button, el, icon, meter, mountApp, notice, provisionalTag, setMeter, tag } from './bha/dom';
import {
  blockEl, blockVisual, chainLevelAt, floatEl, floatSpot, foeEl, insertEl, insertMark, logLineEl, LOG_ICON, nudgeOf, PATTERN_VIEW, pickAbbr,
  playOnce, replayOnce, runEl, runSpecs, secondsText, setInsert, setText, trayEl,
  type BlockSpec, type BlockVisual, type FloatKind, type LogRole, type RunSpec,
} from './bha/battle';
import { lineageKey, linMarkShort } from './bha/lineage';
import { battleLabels, type BattleLabels } from './labels';
import { helpOverlay } from './helpView';
import { tutorialOverlay, type TutorialHandle } from './tutorialOverlay';
import { classifyRelease, loadPointerRules, releaseInput, slotAt } from './pointer';

export interface BattleViewOptions {
  /** 조우 연출 윗줄: 원정이면 바퀴·칸·타일 정보. 없으면 "전투 연습" */
  banner?: string;
  /** 있으면 화면 맨 위에 안내 한 줄(.bha-notice)을 보인다 (체험 전투 "기록되지 않음" 등) */
  notice?: string;
  /** 있으면 '그만두기' 버튼을 보인다 (원정 중에는 없다) */
  onQuit?: () => void;
  /** 있으면 전투 시작 직전에 첫 플레이 튜토리얼을 보여 준다 (GDD 14-2). 끝나거나 건너뛰면 한 번 불린다. 튜토리얼 동안 전투 시간은 멈춘다 */
  tutorial?: { onDone: () => void };
  /** 전투가 끝나고 결과 오버레이의 버튼을 누르면 한 번 불린다 */
  onEnd: (s: CombatState) => void;
}

/** 블록 이름: 스킬 블록은 특성 이름(기본 블록은 종족 기본 기술 이름), 필살·공허는 종족 표기 */
export function blockName(b: Block, labels: BattleLabels, factionId: string): string {
  if (b.kind === 'special') return labels.specialBlock;
  if (b.kind === 'void') return labels.voidBlock;
  return b.traitId === BASIC_SKILL_ID || !b.traitId ? labels.basicBlock : traitName(b.traitId, factionId);
}

/** 블록 약어: 특성 데이터의 abbr, 없으면 이름 앞 4글자. 기본·필살·공허는 종족 설정 이름에서 (종족 id 분기 없음) */
export function blockAbbr(b: Block, labels: BattleLabels, factionId: string): string {
  if (b.kind === 'special') return pickAbbr(undefined, labels.specialBlock);
  if (b.kind === 'void') return pickAbbr(undefined, labels.voidBlock);
  if (b.traitId === BASIC_SKILL_ID || !b.traitId) return pickAbbr(undefined, labels.basicBlock);
  return pickAbbr(traitAbbr(b.traitId, factionId), traitName(b.traitId, factionId));
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
      const name = e.block === 'skill'
        ? `${e.traitId === BASIC_SKILL_ID || !e.traitId ? labels.basicBlock : traitName(e.traitId, factionId)}${e.chain > 1 ? ` ${labels.chain}${e.chain}` : ''}`
        : e.block === 'special' ? labels.specialBlock : labels.voidBlock;
      const parts = [`${name}! ${n(e.damage)} 피해${e.weak ? ' (약점!)' : ''}`];
      if (e.heal > 0) parts.push(`${labels.role.heal} +${n(e.heal)}`);
      if (e.guardSeconds > 0) parts.push(`${labels.role.guard} ${e.guardSeconds.toFixed(1)}초`);
      if (e.bonus === 'stagger') parts.push('적 행동 지연');
      if (e.bonus === 'reflect') parts.push('반사 준비');
      if (e.bonus === 'cleanse') parts.push('봉인 해제');
      if (e.block === 'void') parts.push(`${labels.riskGauge} ↑`);
      const text = parts.join(' · ');
      if (e.block === 'void') return { role: 'void', icon: 'i-void', text };
      if (e.block === 'special') return { role: 'chain', icon: 'i-special', text };
      if (e.chain > 1) return { role: 'chain', icon: `i-chain-${Math.min(3, e.chain)}`, text };
      const role: LogRole = e.role ?? 'attack';
      return { role, icon: LOG_ICON[role], text };
    }
    case 'stored-use':
      return { role: 'chain', icon: 'i-stored', text: `${labels.storedSkill}! ${n(e.damage)} 피해 · ${labels.role.guard} ${e.guardSeconds}초 (남은 충전 ${e.charges})` };
    case 'stored-ready':
      return { role: 'chain', icon: 'i-stored', text: `${labels.storedSkill} 충전! (${e.charges}/${s.params.storedChargesMax})` };
    case 'heavy-cast':
      return { role: 'cast', icon: 'i-cast', text: `강공격 예고! ${e.seconds}초 안에 ${labels.role.guard} 블록으로 막아라` };
    case 'heavy-hit':
      return e.guarded
        ? { role: 'guard', icon: 'i-guard', text: `강공격을 막았다! ${n(e.damage)} 피해${e.reflected > 0 ? ` · ${n(e.reflected)} 반사` : ''}` }
        : { role: 'cast', icon: 'i-cast', text: `강공격 적중! ${n(e.damage)} 피해` };
    case 'seal':
      return { role: 'cast', icon: 'i-seal', text: `봉인! ${e.seconds}초 동안 ${labels.skillBlock} 생성 정지` };
    case 'stance':
      return { role: 'guard', icon: 'i-guard', text: `방어 자세! ${e.seconds}초 동안 내 블록 피해 감소 · 블록을 쓰면 반격` };
    case 'stance-end':
      return { role: 'guard', icon: 'i-guard', text: '방어 자세가 풀렸다' };
    case 'counter':
      return { role: 'cast', icon: 'i-cast', text: `반격! ${n(e.damage)} 피해${e.guarded ? ' (막기로 경감)' : ''}` };
    case 'shuffle':
      return { role: 'chain', icon: 'i-swap', text: '블록 바의 순서가 섞였다' };
    case 'end':
      return e.status === 'won' ? { role: 'chain', icon: 'i-flag-win', text: `${pickFaction(s.enemy.def.name, factionId)}을(를) 쓰러뜨렸다!` } : null;
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
function setMeterValue(root: HTMLElement, value: number): void {
  const t = root.querySelector('.bha-meter__value')?.firstChild;
  const text = String(value);
  if (t && t.nodeValue !== text) t.nodeValue = text;
}

export function battleView(root: HTMLElement, faction: FactionConfig, s: CombatState, opts: BattleViewOptions): void {
  const labels = battleLabels(faction);
  const p = s.params;
  const enemy = s.enemy.def;
  const enemyName = pickFaction(enemy.name, faction.id);
  const top = maxChain(p);
  const cap = p.trayCapacity;
  /** 설정 화면에서 바꾼 클릭 판정 시간·드래그 임계치 (전투 시작 때 읽는다) */
  const rules = loadPointerRules(safeStorage());
  const slug = lineageKey(enemy.weaknessLineageId);

  // ── 1. 적 영역 ──
  const foeName = el('div', 'bha-battle__foename');
  foeName.append(el('h1', 'bha-battle__name', enemyName));
  if (enemy.class === 'elite') foeName.append(tag('강적', 'elite'));
  if (enemy.provisional) foeName.append(provisionalTag());
  const weakChip = el('span', 'bha-chip bha-chip--weak');
  weakChip.append(icon('i-weak'), '약점 ', linMarkShort(enemy.weaknessLineageId, faction.id));
  const foeHead = el('header', 'bha-battle__foehead');
  foeHead.append(foeName, weakChip);

  const patternView = PATTERN_VIEW[enemyPatternKind(enemy)];
  const foeTags = el('div', 'bha-battle__foetags');
  const stanceChip = statusChip('guard', 'i-guard', '방어 자세');
  stanceChip.root.title = '내 블록 피해 감소 · 블록을 쓰면 반격';
  if (patternView) {
    const pc = el('span', 'bha-chip bha-chip--pattern');
    pc.append(icon(patternView.icon), patternView.label);
    foeTags.append(pc);
  }
  foeTags.append(stanceChip.root);

  const enemyMeter = meter({ kind: 'enemy', label: '적 체력', value: Math.ceil(s.enemy.hp - 1e-6), max: Math.round(s.enemy.maxHp), ghost: s.enemy.hp, compact: true, lg: true });

  // 강공격 예고 (항상 한 칸 자리를 차지한다: 평소엔 안내 점선, 예고 중엔 시전 바)
  const castSlot = el('div', 'bha-battle__castslot');
  castSlot.dataset.help = 'battle.cast';
  const castIdle = el('div', 'bha-battle__castidle');
  castIdle.append(icon('i-cast'), '강공격 예고가 뜨면 여기에 시전 바가 찬다');
  const castEl = el('div', 'bha-cast');
  castEl.setAttribute('role', 'alert');
  const castTitle = el('span', 'bha-cast__title');
  const castTitleText = el('span');
  const castTime = el('span');
  castTime.setAttribute('aria-hidden', 'true');
  const castTrack = el('span', 'bha-cast__track');
  castTrack.append(el('i'));
  const castHint = el('span', 'bha-cast__hint');
  castEl.append(castTitle, castTrack, castHint);
  castEl.hidden = true;
  castSlot.append(castIdle, castEl);
  let castMode: 'idle' | 'active' | 'blocked' = 'idle';
  let blockedUntil = 0;
  let blockedDamage = 0;
  const setCastMode = (mode: 'active' | 'blocked') => {
    castTitle.replaceChildren(icon(mode === 'blocked' ? 'i-guard' : 'i-cast'), castTitleText, castTime);
    castHint.replaceChildren(icon(mode === 'blocked' ? 'i-check' : 'i-guard'), mode === 'blocked' ? `피해 ${Math.round(blockedDamage)}` : labels.role.guard);
    castEl.classList.toggle('is-blocked', mode === 'blocked');
    setText(castTitleText, mode === 'blocked' ? '막았다!' : '강공격 예고!');
  };

  const enemySec = el('section', 'bha-battle__enemy');
  enemySec.setAttribute('aria-label', '적');
  enemySec.append(foeHead, foeTags, enemyMeter, castSlot);

  // ── 2. 무대: 실루엣 + 플로팅 숫자 + 사건 로그 3줄 ──
  const foe = foeEl(enemy.class === 'elite' ? 'foe-b' : 'foe-a', slug ? `var(--bha-lin-${slug})` : null);
  const floats = el('div', 'bha-battle__floats');
  const log = el('div', 'bha-log');
  log.setAttribute('aria-live', 'polite');
  log.dataset.help = 'battle.stage';
  const arena = el('section', 'bha-battle__arena');
  arena.setAttribute('aria-label', '전투 상황');
  arena.append(foe, floats, log);

  // ── 3. 내 영역 ──
  const playerMeter = meter({ kind: 'player', label: '내 체력', value: Math.ceil(s.player.hp - 1e-6), max: s.player.maxHp, ghost: s.player.hp, compact: true, lg: true });
  const guardChip = statusChip('guard', 'i-guard', labels.role.guard);
  const sealChip = statusChip('seal', 'i-seal', '봉인');
  const voidChip = statusChip(undefined, 'i-void', labels.voidBlock);
  const chain3Chip = statusChip(undefined, 'i-chain-3', `${labels.chain}${top}`);
  const calm = el('span', 'bha-faint', '상태 이상 없음');
  const meStatus = el('div', 'bha-battle__mestatus');
  meStatus.append(guardChip.root, sealChip.root, voidChip.root, chain3Chip.root, calm);
  const spMeter = meter({ kind: 'sp', label: labels.sp, icon: 'i-sp', value: Math.round(s.sp), max: p.spMax, compact: true });
  const spNoteText = el('span');
  const spNote = el('span', 'bha-battle__spnote');
  spNote.append(icon('i-special'), spNoteText);
  spNote.hidden = true;
  const spWrap = el('div', 'bha-battle__sp');
  spWrap.dataset.help = 'battle.sp';
  spWrap.append(spMeter, spNote);
  const meSec = el('section', 'bha-battle__me');
  meSec.setAttribute('aria-label', '나');
  meSec.append(playerMeter, meStatus, spWrap);

  // ── 4. 블록 바 ──
  const tray = trayEl(cap);
  tray.root.dataset.help = 'battle.tray';
  tray.grid.dataset.help = 'battle.runrow';
  const trayNote = el('p', 'bha-tray__note');
  // 범례: 역할 = 아이콘 + 색 (칸 안에는 이름 대신 약어와 아이콘)
  const legend = el('div', 'bha-legend');
  legend.dataset.help = 'battle.legend';
  legend.setAttribute('aria-label', '범례');
  const legendItem = (mod: string, iconId: string, text: string) => {
    const it = el('span', `bha-legend__item bha-legend__item--${mod}`);
    it.append(icon(iconId), el('span', '', text));
    return it;
  };
  legend.append(
    legendItem('attack', 'i-attack', labels.role.attack),
    legendItem('guard', 'i-guard', labels.role.guard),
    legendItem('heal', 'i-heal', labels.role.heal),
    legendItem('special', 'i-special', labels.specialBlock),
    legendItem('void', 'i-void', labels.voidBlock),
  );

  // 저장 필살기 버튼 (GDD 14-6): 블록과 같은 클릭 판정. 충전 칸 3개 + 게이지
  const storedBtn = el('button', 'bha-stored is-disabled');
  storedBtn.type = 'button';
  storedBtn.dataset.help = 'battle.stored';
  const storedMeta = el('span', 'bha-stored__meta');
  const storedGaugeFill = el('i');
  const storedGauge = el('span', 'bha-stored__gauge');
  storedGauge.append(storedGaugeFill);
  const storedName = el('span', 'bha-stored__name');
  storedName.append(el('span', '', labels.storedSkill), provisionalTag());
  const storedBody = el('span', 'bha-stored__body');
  storedBody.append(storedName, storedMeta, storedGauge);
  const storedIcon = el('span', 'bha-stored__icon');
  storedIcon.append(icon('i-stored'));
  const storedPipRow = el('span', 'bha-stored__pips');
  const storedPips = Array.from({ length: p.storedChargesMax }, () => el('i'));
  storedPipRow.append(...storedPips);
  storedBtn.append(storedIcon, storedBody, storedPipRow);

  const hint = el('p', 'bha-battle__hint');
  hint.append(
    el('b', '', `짧게 눌러 떼기(${rules.clickMaxSeconds}초 안)`),
    `=사용(${labels.storedSkill} 버튼도 같음) · 오래 누르면 사용 안 됨 · 끌어서 순서 바꾸기 · 같은 블록을 붙이면 ${labels.chain}(최대 ${top})`,
  );
  const controls = el('section', 'bha-battle__controls');
  controls.setAttribute('aria-label', '블록 조작');
  controls.append(tray.root, trayNote, storedBtn, legend, hint);

  // ── 7. 하단 컨트롤 ──
  let speed = 1;
  let paused = false;
  /** 튜토리얼·도움말·조우 연출이 열려 있는 동안 true: 엔진 시간이 흐르지 않고 입력도 받지 않는다 (결정성에 영향 없음, engine/tutorial frameTicks) */
  let overlayOpen = false;
  let tutorialOpen = false;
  let stopped = false;
  const halted = () => paused || overlayOpen;

  const speedBtn = button({ iconOnly: true, label: '배속 바꾸기' });
  const speedText = el('span', 'bha-num', '1x');
  speedText.style.fontWeight = '800';
  speedBtn.append(speedText);
  const pauseBtn = button({ iconOnly: true, label: '일시정지', icon: 'i-pause' });
  const helpBtn = button({ iconOnly: true, label: '도움말', icon: 'i-help' });
  const timeNum = el('b', '', String(Math.ceil(timeLeftSeconds(s))));
  const timeEl = el('span', 'bha-battle__time');
  timeEl.append(icon('i-timer'), el('span', 'bha-battle__timelabel', '남은 시간'), ' ', timeNum, '초');
  const bar = el('footer', 'bha-battle__bar');
  bar.append(speedBtn, pauseBtn, helpBtn);
  let quitBtn: HTMLButtonElement | null = null;
  if (opts.onQuit) {
    quitBtn = button({ label: '그만두기', variant: 'ghost', icon: 'i-quit' });
    quitBtn.classList.add('bha-btn--quit');
    quitBtn.onclick = () => quit();
    bar.append(quitBtn);
  } else {
    bar.append(el('span'));
  }
  bar.append(timeEl);

  const flashVoid = el('div', 'bha-edgeflash bha-edgeflash--void');
  const flashHit = el('div', 'bha-edgeflash bha-edgeflash--hit');

  const app = mountApp(
    root,
    { fixed: true, cls: 'bha-battle' },
    ...(opts.notice ? [notice('info', opts.notice)] : []),
    enemySec,
    arena,
    meSec,
    controls,
    bar,
    flashVoid,
    flashHit,
  );

  const quit = () => {
    stopped = true;
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
  const syncPausedLook = () => app.classList.toggle('is-paused', paused || tutorialOpen);
  const startTutorial = () => {
    if (tutorial) return;
    overlayOpen = true;
    tutorialOpen = true;
    syncPausedLook();
    tutorial = tutorialOverlay(faction, {
      onFinish: () => {
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

  // ── 일시정지·배속 ──
  const setPaused = (on: boolean) => {
    if (s.status !== 'playing' || overlayOpen) return;
    paused = on;
    pauseBtn.replaceChildren(icon(on ? 'i-play' : 'i-pause'));
    pauseBtn.setAttribute('aria-label', on ? '계속' : '일시정지');
    tray.root.classList.toggle('is-paused', on);
    syncPausedLook();
    if (!on) return hideOverlay();
    const inner = el('div', 'bha-battle-ov');
    const actions = el('div', 'bha-battle-ov__actions');
    actions.append(button({ label: '계속', variant: 'primary', size: 'lg', icon: 'i-play', onClick: () => setPaused(false) }));
    const row = el('div', 'bha-grid2');
    row.append(button({ label: '도움말', icon: 'i-help', onClick: openHelp }));
    if (opts.onQuit) row.append(button({ label: '그만두기', variant: 'danger', icon: 'i-quit', onClick: () => quit() }));
    actions.append(row);
    inner.append(ovMark('i-pause'), el('h2', 'bha-battle-ov__title', '일시정지'), el('p', 'bha-battle-ov__sub', '전투가 멈춰 있다. 블록 바와 시간도 멈춘다.'), actions);
    showOverlay(inner);
  };
  pauseBtn.onclick = () => setPaused(!paused);
  speedBtn.onclick = () => {
    speed = speed === 1 ? 2 : 1;
    setText(speedText, `${speed}x`);
    speedBtn.classList.toggle('is-on', speed === 2);
  };

  // ── 사건 로그 · 플로팅 숫자 · 번쩍임 ──
  const lines: HTMLElement[] = [];
  const say = (line: LogLine) => {
    const node = logLineEl(line.role, line.icon, line.text);
    log.append(node);
    lines.push(node);
    while (lines.length > 3) lines.shift()!.remove();
    playOnce(node, 'is-new');
  };
  let floatCount = 0;
  const spawnFloat = (kind: FloatKind, text: string, opt: { crit?: boolean; chain3?: boolean; iconId?: string } = {}) => {
    const node = floatEl(kind, text, floatSpot(floatCount++), opt);
    while (floats.children.length >= 8) floats.firstElementChild!.remove();
    floats.append(node);
    const done = () => node.remove();
    node.addEventListener('animationend', done);
    window.setTimeout(done, 1500);
  };
  const hitFoe = () => replayOnce(foe, 'is-hit', 600);
  const n0 = (v: number) => String(Math.round(v));
  let specialNoteUntil = 0;
  const react = (e: CombatEvent) => {
    switch (e.kind) {
      case 'player-attack':
        if (e.damage > 0) hitFoe();
        break;
      case 'block': {
        if (e.damage > 0) hitFoe();
        if (e.block === 'void') {
          spawnFloat('void', `−${n0(e.damage)}`, { iconId: 'i-void' });
          replayOnce(flashVoid, 'is-on', 900);
        } else if (e.block === 'skill' && e.role === 'guard') {
          spawnFloat('guard', secondsText(e.guardSeconds), { iconId: 'i-guard' });
        } else if (e.block === 'skill' && e.role === 'heal') {
          spawnFloat('heal', n0(e.heal));
        } else {
          spawnFloat('attack', `−${n0(e.damage)}`, { crit: e.weak || e.chain >= top });
        }
        if (e.chain > 1) spawnFloat('chain', `${labels.chain}${e.chain}!`, { chain3: e.chain >= top });
        break;
      }
      case 'stored-use':
        hitFoe();
        spawnFloat('attack', `−${n0(e.damage)}`, { crit: true });
        spawnFloat('guard', secondsText(e.guardSeconds), { iconId: 'i-guard' });
        break;
      case 'enemy-attack':
        if (e.guarded) spawnFloat('guard', labels.role.guard, { iconId: 'i-guard' });
        else if (e.damage > 0) replayOnce(flashHit, 'is-on', 600);
        break;
      case 'heavy-hit':
        if (e.guarded) {
          blockedUntil = performance.now() + 1200;
          blockedDamage = e.damage;
          spawnFloat('guard', labels.role.guard, { iconId: 'i-guard' });
        } else {
          replayOnce(flashHit, 'is-on', 600);
        }
        break;
      case 'counter':
        if (!e.guarded) replayOnce(flashHit, 'is-on', 600);
        break;
      case 'spawn':
        if (e.block === 'special') {
          specialNoteUntil = performance.now() + 1800;
          replayOnce(spMeter, 'is-burst', 900);
        }
        break;
      default:
        break;
    }
  };

  // ── 블록 바 그리기 (바뀐 곳만) ──
  /** 드래그 중인 블록: 누른 블록의 uid 로 추적한다 (그 사이 앞 블록이 쓰여 칸 번호가 바뀌어도 따라간다) */
  let drag: { uid: number; dx: number; dy: number; to: number } | null = null;
  let down: { uid: number; x: number; y: number; id: number; at: number; maxMoved: number; holdTimer: number; held: boolean } | null = null;
  const indexOfUid = (uid: number) => s.tray.findIndex((b) => b.uid === uid);
  const blockEls = new Map<number, HTMLElement>();
  const placedAt = new Map<number, number>();
  let seeded = false;
  let runSig = '';
  let runEls: { spec: RunSpec; node: HTMLElement }[] = [];
  let insertBar: HTMLElement | null = null;
  let noteKey = '';

  const makeBlock = (b: Block): HTMLElement => {
    const eff = blockEffect(s, b);
    const isBasic = b.kind === 'skill' && (b.traitId === BASIC_SKILL_ID || !b.traitId);
    const spec: BlockSpec = {
      visual: blockVisual(b.kind, isBasic, eff?.skill.role ?? null),
      abbr: blockAbbr(b, labels, faction.id),
      label: blockName(b, labels, faction.id),
      weak: eff?.weak ?? false,
      uid: b.uid,
    };
    return blockEl(spec);
  };
  const visualOf = (node: HTMLElement): BlockVisual => (node.dataset.visual as BlockVisual | undefined) ?? 'basic';

  /** 쓰여서 바에서 사라진 블록: 제자리에서 발동 연출(is-fire)을 하고 지운다 (엔진은 바로 오른쪽 블록을 당긴다) */
  const fireAway = (node: HTMLElement) => {
    const g = tray.grid.getBoundingClientRect();
    const r = node.getBoundingClientRect();
    node.classList.remove('is-pressed', 'is-dragging', 'is-popin', 'is-cue');
    node.style.cssText = `position:absolute;left:${r.left - g.left}px;top:${r.top - g.top}px;width:${r.width}px;height:${r.height}px;z-index:5;margin:0`;
    tray.grid.append(node);
    node.classList.add('is-fire');
    const done = () => node.remove();
    node.addEventListener('animationend', done);
    window.setTimeout(done, 700);
  };

  const drawTray = () => {
    const dragFrom = drag ? indexOfUid(drag.uid) : -1;
    const count = s.tray.length;
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
    // 묶음
    const specs = runSpecs(runsOf(s.tray), (i) => s.tray[i]?.kind === 'skill', top);
    const sig = specs.map((r) => `${r.start}:${r.len}`).join('|');
    if (sig !== runSig) {
      runSig = sig;
      for (const r of runEls) r.node.remove();
      runEls = specs.map((spec) => ({ spec, node: runEl(spec, labels.chain) }));
      for (const r of runEls) tray.grid.insertBefore(r.node, insertBar);
    }
    // 칸마다 블록 배치 + 상태 클래스
    const mark = drag && dragFrom >= 0 ? insertMark(dragFrom, drag.to, count, cap) : null;
    const casting = s.enemy.cast !== null;
    tray.cells.forEach((cell, i) => {
      const b = s.tray[i];
      const dragging = !!b && !!drag && b.uid === drag.uid;
      cell.classList.toggle('is-origin', dragging);
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
      node.classList.toggle('is-chain2', level === 2);
      node.classList.toggle('is-chain3', level >= 3);
      node.classList.toggle('is-cue', casting && visualOf(node) === 'guard');
      node.classList.toggle('is-pressed', !!down && down.uid === b.uid && !down.held && !drag);
      node.classList.toggle('is-dragging', dragging);
      const nudge = drag && dragFrom >= 0 ? nudgeOf(i, dragFrom, drag.to, count) : null;
      node.classList.toggle('is-nudge-l', nudge === 'l');
      node.classList.toggle('is-nudge-r', nudge === 'r');
      if (dragging && drag) {
        node.style.setProperty('--drag-x', `${Math.round(drag.dx)}px`);
        node.style.setProperty('--drag-y', `${Math.round(drag.dy)}px`);
      } else if (node.style.getPropertyValue('--drag-x')) {
        node.style.removeProperty('--drag-x');
        node.style.removeProperty('--drag-y');
      }
    });
    seeded = true;
    // 삽입 막대
    if (mark) {
      if (!insertBar) {
        insertBar = insertEl();
        tray.grid.append(insertBar);
      }
      setInsert(insertBar, mark);
    } else if (insertBar) {
      insertBar.remove();
      insertBar = null;
    }
    // 안내 줄: 드래그 > 오래 누름 > 봉인
    const sealed = s.sealTicks > 0;
    tray.root.classList.toggle('is-sealed', sealed);
    tray.root.classList.toggle('is-held', !!down?.held && !drag);
    let key = '';
    let build: (() => void) | null = null;
    if (drag && mark) {
      key = `drag:${mark.at}`;
      build = () => trayNote.replaceChildren(wrapNote('i-grip', `${Math.min(count - 1, drag!.to) + 1}번 칸으로 끼워 넣기 — 놓으면 순서가 바뀐다`));
    } else if (down?.held) {
      key = 'held';
      build = () => trayNote.replaceChildren(wrapNote('i-grip', '오래 눌러서 사용되지 않아요 — 그냥 놓으면 제자리'));
    } else if (sealed) {
      key = 'sealed';
      build = () => trayNote.replaceChildren(wrapNote('i-seal', `봉인 중: 새 ${labels.skillBlock}이(가) 생기지 않는다. 있는 블록은 쓸 수 있다`));
    }
    if (key !== noteKey) {
      noteKey = key;
      if (build) build();
      else trayNote.replaceChildren();
      trayNote.classList.toggle('is-held', key === 'held');
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
      setMeter(enemyMeter, s.enemy.hp, s.enemy.maxHp, s.enemy.hp);
      setMeterValue(enemyMeter, Math.ceil(s.enemy.hp - 1e-6));
    }
    const pRatio = `${Math.round(s.player.hp * 10)}`;
    if (meterCache.player !== pRatio) {
      meterCache.player = pRatio;
      setMeter(playerMeter, s.player.hp, s.player.maxHp, s.player.hp);
      setMeterValue(playerMeter, Math.ceil(s.player.hp - 1e-6));
      playerMeter.classList.toggle('is-danger', s.player.hp / s.player.maxHp < 0.3);
    }
    const spKey = `${Math.round(s.sp * 10)}`;
    if (meterCache.sp !== spKey) {
      meterCache.sp = spKey;
      setMeter(spMeter, s.sp, p.spMax);
      setMeterValue(spMeter, Math.round(s.sp));
    }
    const spFull = s.sp >= p.spMax;
    spMeter.classList.toggle('is-full', spFull);
    const noteText = spFull ? `${labels.specialBlock} 대기 (빈 칸 필요)` : now < specialNoteUntil ? `${labels.specialBlock} 블록 생성!` : '';
    spNote.hidden = noteText === '';
    if (noteText) setText(spNoteText, noteText);

    setText(timeNum, String(Math.ceil(timeLeftSeconds(s))));
    timeEl.classList.toggle('is-urgent', timeLeftSeconds(s) <= 10);

    // 강공격 예고
    const cast = s.enemy.cast;
    const wantBlocked = !cast && now < blockedUntil;
    const mode = cast ? 'active' : wantBlocked ? 'blocked' : 'idle';
    if (mode !== castMode) {
      castMode = mode;
      castEl.hidden = mode === 'idle';
      castIdle.hidden = mode !== 'idle';
      if (mode !== 'idle') setCastMode(mode);
    }
    if (cast) {
      castEl.style.setProperty('--fill', ((cast.total - cast.ticks) / cast.total).toFixed(3));
      setText(castTime, ` ${secondsText(cast.ticks * p.tickSeconds)}`);
    } else if (wantBlocked) {
      castEl.style.setProperty('--fill', '1');
      setText(castTime, '');
    }
    foe.classList.toggle('is-casting', cast !== null);
    foe.classList.toggle('is-guard', s.enemy.stance !== null);

    // 상태 칩
    stanceChip.root.hidden = s.enemy.stance === null;
    if (s.enemy.stance) setText(stanceChip.value, secondsText(s.enemy.stance.ticks * p.tickSeconds));
    guardChip.root.hidden = s.guard.ticks <= 0;
    if (s.guard.ticks > 0) setText(guardChip.value, secondsText(s.guard.ticks * p.tickSeconds));
    sealChip.root.hidden = s.sealTicks <= 0;
    if (s.sealTicks > 0) setText(sealChip.value, secondsText(s.sealTicks * p.tickSeconds));
    voidChip.root.hidden = s.voidUsed <= 0;
    if (s.voidUsed > 0) setText(voidChip.value, `${s.voidUsed}회`);
    chain3Chip.root.hidden = s.chain3Count <= 0;
    if (s.chain3Count > 0) setText(chain3Chip.value, `${s.chain3Count}회`);
    calm.hidden = !(s.guard.ticks <= 0 && s.sealTicks <= 0 && s.voidUsed <= 0 && s.chain3Count <= 0);
    setText(tray.veilText, `봉인 — ${labels.skillBlock} 생성 정지 ${secondsText(s.sealTicks * p.tickSeconds)}`);

    // 저장 필살기
    storedPips.forEach((pip, i) => pip.classList.toggle('is-on', i < s.storedCharges));
    storedBtn.style.setProperty('--fill', (Math.min(1, (s.storedCharges >= p.storedChargesMax ? p.storedGaugeMax : s.storedGauge) / p.storedGaugeMax)).toFixed(3));
    const ready = s.storedCharges > 0;
    storedBtn.classList.toggle('is-ready', ready);
    storedBtn.classList.toggle('is-full', s.storedCharges >= p.storedChargesMax);
    storedBtn.classList.toggle('is-disabled', !ready);
    storedBtn.setAttribute('aria-disabled', String(!ready));
    storedBtn.setAttribute('aria-label', `${labels.storedSkill}, 충전 ${s.storedCharges}칸`);
    const metaText = ready
      ? `${s.enemy.cast ? '강공격 예고! ' : ''}${Math.round(p.storedPowerInAttacks)}회분 피해 · ${p.storedGuardSeconds}초 ${labels.role.guard}`
      : `${Math.floor(s.storedGauge)} / ${p.storedGaugeMax} — 블록을 쓸수록 충전`;
    setText(storedMeta, metaText);
  };

  // ── 입력: 포인터 이벤트(터치·마우스 공통). 판정은 pointer.ts, 시각은 performance.now(실시간)이라 배속·일시정지와 무관 ──
  const queue: CombatInput[] = [];
  const slotOf = (x: number) => {
    const r = tray.grid.getBoundingClientRect();
    return slotAt(x, r.left, r.width, cap);
  };
  // 저장 필살기 버튼: 블록과 같은 판정 (누른 지 clickMaxSeconds 이내에 떼면 사용, 오래 누르거나 끌면 사용 안 됨)
  let storedDown: { id: number; x: number; y: number; at: number; maxMoved: number } | null = null;
  storedBtn.addEventListener('pointerdown', (e) => {
    if (storedDown || s.status !== 'playing') return;
    storedBtn.setPointerCapture(e.pointerId);
    storedDown = { id: e.pointerId, x: e.clientX, y: e.clientY, at: performance.now(), maxMoved: 0 };
    storedBtn.classList.add('is-pressed');
  });
  storedBtn.addEventListener('pointermove', (e) => {
    if (!storedDown || e.pointerId !== storedDown.id) return;
    storedDown.maxMoved = Math.max(storedDown.maxMoved, Math.hypot(e.clientX - storedDown.x, e.clientY - storedDown.y));
  });
  storedBtn.addEventListener('pointercancel', () => {
    storedDown = null;
    storedBtn.classList.remove('is-pressed');
  });
  storedBtn.addEventListener('pointerup', (e) => {
    if (!storedDown || e.pointerId !== storedDown.id) return;
    const kind = classifyRelease(performance.now() - storedDown.at, storedDown.maxMoved, rules);
    storedDown = null;
    storedBtn.classList.remove('is-pressed');
    if (kind === 'use' && s.status === 'playing' && !halted()) queue.push({ type: 'stored' });
  });
  const endPress = () => {
    if (down) window.clearTimeout(down.holdTimer);
    down = null;
    drag = null;
    drawTray();
  };
  tray.root.addEventListener('pointerdown', (e) => {
    if (down || s.status !== 'playing' || halted()) return;
    const i = slotOf(e.clientX);
    const b = s.tray[i];
    if (!b) return;
    tray.root.setPointerCapture(e.pointerId);
    const holdTimer = window.setTimeout(() => {
      // 제한 시간을 넘겼다: 놓아도 사용되지 않는다는 것을 보여 준다 (드래그 중이면 상관없다)
      if (down && down.maxMoved < rules.dragThresholdPx) {
        down.held = true;
        drawTray();
      }
    }, rules.clickMaxSeconds * 1000);
    down = { uid: b.uid, x: e.clientX, y: e.clientY, id: e.pointerId, at: performance.now(), maxMoved: 0, holdTimer, held: false };
    drawTray();
  });
  tray.root.addEventListener('pointermove', (e) => {
    if (!down || e.pointerId !== down.id) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    down.maxMoved = Math.max(down.maxMoved, Math.hypot(dx, dy));
    if (down.maxMoved >= rules.dragThresholdPx) {
      down.held = false;
      drag = { uid: down.uid, dx, dy, to: slotOf(e.clientX) };
      drawTray();
    }
  });
  tray.root.addEventListener('pointercancel', endPress);
  tray.root.addEventListener('pointerup', (e) => {
    if (!down || e.pointerId !== down.id) return;
    const from = indexOfUid(down.uid); // 누르는 사이 앞 블록이 쓰여 번호가 바뀌었을 수 있다. 블록이 사라졌으면 -1
    const kind = classifyRelease(performance.now() - down.at, down.maxMoved, rules);
    if (from >= 0 && s.status === 'playing' && !halted()) {
      const input = releaseInput(kind, from, slotOf(e.clientX), s.tray.length);
      if (input) queue.push(input);
    }
    endPress();
  });
  // 키보드: 블록에 초점을 두고 Enter/Space = 사용
  tray.root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
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
      const go = button({ label: canAbsorb ? `${faction.absorbActionName} 가능` : '계속', variant: 'primary', size: 'lg', icon: canAbsorb ? 'i-absorb' : undefined, onClick: finish });
      go.append(icon('i-chevron-right'));
      actions.append(go);
      inner.append(
        ovMark('i-flag-win'),
        el('span', 'bha-battle-ov__eyebrow', `전투 시간 ${Math.round(elapsedSeconds(s))}초 · ${labels.chain}${top} ${s.chain3Count}회`),
        el('h2', 'bha-battle-ov__title', '승리'),
        el('p', 'bha-battle-ov__sub', `${enemyName}을(를) 쓰러뜨렸다.`),
        actions,
      );
    } else {
      const timeout = s.lossReason === 'timeout';
      const go = button({ label: '결과 보기', size: 'lg', onClick: finish });
      go.append(icon('i-chevron-right'));
      actions.append(go);
      const sub = el('p', 'bha-battle-ov__sub', timeout ? `남은 시간 안에 쓰러뜨리지 못했다. 적 체력 ${Math.ceil(s.enemy.hp - 1e-6)} / ${Math.round(s.enemy.maxHp)}` : '체력이 0이 되었다.');
      inner.append(
        ovMark(timeout ? 'i-timer' : 'i-broken', timeout ? 'var(--bha-warn)' : 'var(--bha-danger)'),
        el('span', 'bha-battle-ov__eyebrow', timeout ? '시간 초과 패배' : '패배'),
        el('h2', 'bha-battle-ov__title', timeout ? '시간이 다 됐다' : labels.defeatState),
        sub,
        actions,
      );
    }
    showOverlay(inner);
    actions.querySelector<HTMLElement>('button')?.focus();
  };

  // ── 실시간 루프: 화면 프레임마다 쌓인 시간만큼 엔진 틱을 돌린다 (1x/2x) ──
  const tickMs = p.tickSeconds * 1000;
  let acc = 0;
  let last = performance.now();
  const frame = (now: number) => {
    if (stopped) return;
    const dt = Math.min(250, now - last);
    last = now;
    if (s.status === 'playing') {
      const f = frameTicks(acc, dt, speed, tickMs, halted());
      acc = f.acc;
      for (let n = 0; n < f.ticks && s.status === 'playing'; n++) step(s, queue.splice(0, queue.length));
    }
    if (halted()) queue.length = 0;
    for (const ev of drainCombatEvents(s)) {
      const line = eventLine(ev, s, labels, faction.id);
      if (line) say(line);
      react(ev);
    }
    drawHud();
    drawTray();
    if (s.status !== 'playing') {
      stopped = true;
      if (s.status === 'lost') say({ role: 'cast', icon: 'i-broken', text: s.lossReason === 'timeout' ? '시간 제한을 넘겼다…' : `${labels.defeatState}…` });
      endPress();
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
  const encounter = el('div', 'bha-battle-ov bha-battle-ov--encounter');
  const stats = el('div', 'bha-battle-ov__stats');
  if (enemy.class === 'elite') stats.append(tag('강적', 'elite'));
  const encWeak = el('span', 'bha-chip bha-chip--weak');
  encWeak.append(icon('i-weak'), '약점 ', linMarkShort(enemy.weaknessLineageId, faction.id));
  stats.append(encWeak);
  if (patternView) {
    const pc = el('span', 'bha-chip bha-chip--pattern');
    pc.append(icon(patternView.icon), patternView.label);
    stats.append(pc);
  }
  encounter.append(
    el('span', 'bha-battle-ov__eyebrow', opts.banner ?? '전투 연습'),
    el('span', 'bha-battle-ov__line'),
    el('h2', 'bha-battle-ov__title', `${enemyName}과(와) 조우!`),
    el('span', 'bha-battle-ov__line'),
    stats,
  );
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
  window.setTimeout(endEncounter, 1500);
}
