// 원정 화면 (GDD 1장, 2-1, 6장, 17-1): 캐릭터가 왼쪽을 향해 걷는 화면 + 위에 얹는 상태 줄·조우 알림, 둥지 칸에서 귀환 선택·타일 배치 팝업. (U-4 → R-1)
// 시간(칸당 5초, 1x/2x/4x)은 여기서 돌리고, 규칙은 engine/expedition 이 정한다. 12칸 길·칸 번호·바퀴는 엔진 안에만 있고 걷는 화면에는 보이지 않는다.
// 화면 DOM 은 한 번 만들고 상태가 바뀔 때마다 제자리에서 고친다.
import { petBuddy } from './bha/pet';
import { petName } from '../inventory';
import { fullnessOf } from './bha/fullness';
import { BALANCE } from '../config/balance';
import { charArt } from '../data/art/manifest';
import { getTile, mutationName, synergyName, tileName } from '../data/tiles';
import { TRADE_CURRENCY_NAME } from '../data/economy';
import { getTrait, traitName } from '../data/traits';
import {
  abortExpedition, advance, canAbort, chooseContinue, chooseDraft, chooseReturn, drainEvents, finishRest, goldAvailable, hpFractionOf, inFrenzy, mutationMods, pendingFreeBoss, resolveEvent, riskBonus, type ExpeditionState,
  type PendingBattle, type StepEvent,
} from '../engine/expedition';
import { eventHint, tileHint, variantModsText } from './labels';
import { tileCss, tileIconId } from './bha/expedition';
import { groundName, roomOf, type FactionConfig } from '../engine/faction';
import { GROUNDS } from '../data/grounds';
import { button, chip, el, icon, meter, mountApp, notice } from './bha/dom';
import { confirmDialog } from './confirmDialog';
import { onHold } from './bha/hold';
import { isAppAway, onAppAway } from './bha/appAway';
import { bossOmenSub, bubbleText, ENCOUNTER_DELAY_MS, MSG_ICON, msgKind, WATCHDOG_POLL_MS, watchdogAction } from './bha/expedition';
import { createExpClock, monoNow } from './bha/expClock';
import { elementDot, paintElement } from './bha/element';
import { roadPlanner } from './bha/road';
import { locoOf } from './bha/loco';
import { playCosmeticFx, takeEnterFx } from './bha/cosmeticFx';
import { isWalking, walkScene } from './bha/walk';
import { groundSceneBg } from './bha/sceneBg';
import { nextCellIsElite } from './warningLogic';
import { storyGoalLine } from './storyView';
import { bossName } from '../data/bosses';
import { statName } from '../data/elements';
import { floatEl } from './bha/battle';

const WALK_ART_BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

export interface ExpeditionViewHandlers {
  /** 육성 단계(0부터): 걷는 캐릭터 그림 파일(char-<종족>-<번호>)을 고른다 */
  tierIndex?: number;
  /** 입고 있는 스킨 id (GDD 26-5). 없으면 진화체 그림 */
  skinId?: string | null;
  /** 현재 진화체 id (이동 방식 GDD 18-11 을 고른다). 1단계는 null */
  formId?: string | null;
  /** 전투가 시작될 때: 전투 화면으로 넘어간다. 끝나면 호출자가 expeditionView 를 다시 부른다 */
  onBattle: (p: PendingBattle) => void;
  onEnded: () => void;
  /** 한계 돌파가 일어났을 때: 연출 화면을 보여주고 끝나면 resume 을 부른다 */
  onBreakthrough: (resume: () => void) => void;
  /** 자동 저장 시점(GDD 14-1): 전투 시작 직전, 둥지 칸 도착, 타일 배치, 휴식 후, 한 바퀴 더 */
  onSave: () => void;
  /** [?] 도움말 (C.19): 열려 있는 동안 원정 시간은 멈추고, 닫으면 onClose 로 이어간다 */
  openHelp: (onClose: () => void) => void;
}

const EX = BALANCE.expedition;
const PX = BALANCE.provisional.expedition;
const RX = BALANCE.provisional.risk;

/** 원정 걷기 속도 배율. 배속 버튼(1x·2x·4x)은 C.118 에 삭제 — 1배 고정 (GDD 62장). 세이브의 옛 배속 값은 무시한다. 테스트 모드(GDD 38-4)만 setSpeed 로 바꾼다 */
let speed = 1;

/** 테스트 모드 전용 (GDD 38-4). 일반 플레이는 늘 1 */
export function setSpeed(v: number): void {
  speed = Number.isFinite(v) && v > 0 ? v : 1;
}

export function expeditionView(root: HTMLElement, faction: FactionConfig, exp: ExpeditionState, h: ExpeditionViewHandlers, startMsg = ''): void {
  let paused = false;
  let msg = startMsg;
  const tn = (id: string) => tileName(id, faction.id);

  /** 처음 화면 복귀 확인창(Q-3)·세로 전환이 열려 있으면 true: 시간이 멈춘다. dead = 이 화면을 떠났다(전투·결과로 넘어감). away = 한계 돌파 연출이 덮고 있다 */
  let held = false;
  let dead = false;
  let away = false;
  // 다음 할 일(한 칸 이동·전투 진입·휴식 끝)은 시계가 들고 있다: 일시정지·도움말은 남은 시간만 다시 셈하고 할 일을 지우지 않는다 (19-1)
  const clock = createExpClock({ speed: () => speed, blocked: () => paused || held || dead || away || isAppAway() }); // 앱 이탈도 멈춤 (GDD 119장 2)
  const stepMs = EX.secondsPerTile * 1000;

  /** 한 칸 이동을 새로 예약 */
  function nextStep(): void {
    if (exp.phase === 'moving') clock.set('step', stepMs, tick);
    else clock.cancel();
  }

  /** 배속·일시정지·멈춤이 바뀐 뒤: 들고 있는 일을 남은 시간으로 다시 건다. 지금 단계에 맞는 일이 없으면 만든다 */
  function resumeClock(): void {
    if (dead) return;
    const want = exp.phase === 'moving' ? 'step' : exp.phase === 'battle' || exp.phase === 'rest' ? 'phase' : null;
    if (want && clock.pending() !== want) {
      if (exp.phase === 'moving') clock.set('step', stepMs, tick);
      else if (exp.phase === 'battle') clock.set('phase', 0, enterBattle);
      else clock.set('phase', PX.restTimeTiles * EX.restSecondsPerTile * 1000, endRest);
    } else clock.rearm();
  }

  // ── 감시 타이머 (19-1 안전장치): 조우 뒤 멈추지 않은 시간이 ENCOUNTER_WATCHDOG_MS 를 넘도록 전투가 안 열리면 바로 진입,
  //    할 일이 사라졌거나 타이머가 안 걸려 있으면 다시 건다 ──
  let encounterWait = 0;
  let lastWatch = monoNow();
  const watch = setInterval(() => {
    const t = monoNow();
    const dt = Math.max(0, t - lastWatch); // C.139: 단조 시계 + 음수 방어
    lastWatch = t;
    if (dead) return clearInterval(watch);
    if (away || isAppAway()) return;
    if (!main.isConnected) return dispose();
    const blocked = paused || held;
    if (exp.phase === 'battle' && !blocked) encounterWait += dt;
    const act = watchdogAction({ phase: exp.phase, blocked, pending: clock.pending(), armed: clock.armed(), encounterWaitMs: encounterWait });
    if (act === 'enter-battle') enterBattle();
    else if (act === 'resume') resumeClock();
  }, WATCHDOG_POLL_MS);

  /** C.139 (GDD 88장 4): 화면 종료(전투로·끝·취소·귀환·떠남) 때 한 곳에서 시계·감시·hold 구독을 모두 푼다 */
  let unhold = (): void => undefined;
  // 앱 이탈 (GDD 119장 2): 떠나면 남은 시간을 셈해 멈추고, 돌아오면 그 남은 시간부터 그대로 이어 간다 (몰아서 진행하지 않는다)
  const unaway = onAppAway(() => {
    if (dead) return;
    resumeClock();
  });
  function dispose(): void {
    dead = true;
    clock.cancel();
    clearInterval(watch);
    unhold();
    unaway();
  }

  let battleRef: PendingBattle | null = exp.phase === 'battle' ? exp.pending ?? null : null;
  function enterBattle(): void {
    if (dead || exp.phase !== 'battle') return;
    dispose();
    h.onBattle(battleRef ?? exp.pending!);
  }

  function endRest(): void {
    if (exp.phase !== 'rest') return;
    const spring = exp.restSpring === true;
    const before = { full: fullnessOf(exp.hunger, PX.hungerMax), cond: exp.condition, risk: exp.risk };
    finishRest(exp);
    h.onSave();
    // 회복 숫자 떠오름 (C.176, GDD 106장 2): 전투 회복 숫자(.bha-float--heal)와 같은 모양, 캐릭터 머리 위
    const gain = spring
      ? `${faction.riskGaugeName} −${Math.round(before.risk - exp.risk)}`
      : [`${faction.fullnessName} ${Math.round(fullnessOf(exp.hunger, PX.hungerMax) - before.full)}`, `컨디션 ${Math.round(exp.condition - before.cond)}`].join(' · ');
    const fx = floatEl('heal', gain, { left: 50, top: 8 });
    fx.classList.add('bha-walker__healnum');
    if (spring) fx.classList.add('is-spring');
    fx.addEventListener('animationend', () => fx.remove());
    walk.walker.append(fx);
    msg = spring ? `${faction.riskGaugeName}이(가) 가라앉았다` : `${faction.fullnessName}·컨디션이 회복됐다`;
    render();
    nextStep();
  }

  /** 진화 임박 알림 (GDD 20-5 v4.1): 다음 그냥 걷는 칸에서 말풍선으로 (문구는 종족 설정, 수치는 보이지 않는다) */
  let nearMsg: string | null = null;

  function tick(): void {
    const before = exp.hand.length;
    const ev = advance(exp);
    if (!ev) return resumeClock();
    const got = exp.hand.length - before;
    const events = drainEvents(exp);
    for (const e of events) {
      if (e.kind === 'evolution-near') nearMsg = faction.evolutionNearText[e.level - 1] ?? faction.evolutionNearText[0];
      // 뼈 표식/수련 말뚝 승리 노력치 (C.124): 다음 걷는 칸 말풍선
      else if (e.kind === 'tile-ev') nearMsg = e.amount > 0 ? `${statName(e.stat, faction.id)} 노력치 +${e.amount}` : `${statName(e.stat, faction.id)} 노력치가 상한이다`;
    }
    if (events.some((e) => e.kind === 'breakthrough')) {
      // 한계 돌파 연출이 화면을 덮는다. [계속]을 누르면 이 원정 화면을 다시 붙이고 이어간다
      away = true;
      clock.cancel();
      const stage = main.parentElement!;
      h.onBreakthrough(() => {
        if (dead) return;
        root.replaceChildren(stage);
        away = false;
        lastWatch = monoNow();
        handle(ev, got);
      });
      return;
    }
    handle(ev, got);
  }

  function handle(ev: StepEvent, got: number): void {
    switch (ev.kind) {
      case 'move':
        msg = nearMsg ?? '';
        nearMsg = null;
        break;
      case 'battle':
        msg = `${tn_enemy(ev.battle)} 조우!`;
        battleRef = ev.battle;
        encounterWait = 0;
        h.onSave(); // 전투 시작 직전 상태 (전투 중 새로고침하면 여기서 다시 시작한다)
        render();
        clock.set('phase', ENCOUNTER_DELAY_MS, enterBattle);
        return;
      case 'event':
        // 이벤트 타일 (GDD 25-5 ③): 장면 위 창에서 고른다. 시간은 멈춘다
        msg = `${tn(exp.eventPending?.tileId ?? exp.slots[ev.cell]!)}!`;
        eventNote = '';
        h.onSave();
        render();
        return;
      case 'rest':
        msg = `${tn(exp.slots[ev.cell]!)}에서 쉰다…`;
        render();
        clock.set('phase', PX.restTimeTiles * EX.restSecondsPerTile * 1000, endRest);
        return;
      case 'lap-complete':
        planner.reset();
        msg = `${got > 0 ? `타일 획득: ${tn(ev.rewardTile!)} · ` : ''}${faction.nestName}에 도착했다`;
        // 펫 (GDD 90장): 바퀴 끝 보상 펫 · pet-seek 타일 +1장
        if (ev.petFound) msg = `펫 발견: ${petName(ev.petFound, faction)}! · ${msg}`;
        if (ev.petTile) msg = `${msg} · 펫이 타일을 물어 왔다: ${tn(ev.petTile)}`;
        h.onSave();
        break;
      case 'ended':
        dispose();
        h.onEnded();
        return;
    }
    render();
    nextStep();
  }

  const tn_enemy = (p: PendingBattle) => p.boss ? `보스 ${bossName(p.boss, faction.id)}` : `${p.elite ? '강적 ' : ''}${p.tileId ? `(${tn(p.tileId)}) ` : ''}`;

  // ── 고정 DOM (한 번만 만든다) ──
  // 걷는 화면 (GDD 18-7): 캐릭터가 장면 가득 걷고, 정보는 배경 위에 떠 있는 작은 칩(왼쪽 위), 캐릭터 머리 위 말풍선(조우·획득·안내),
  // 모서리 작은 버튼(오른쪽 위), 귀환·선택 말풍선(장면 위 오버레이)으로 띄운다. 별도 상태 줄·패널은 없다.
  const helpBtn = button({ label: '도움말', icon: 'i-help', iconOnly: true, variant: 'ghost', size: 'small' });
  const where = el('div', 'bha-exp__where');
  // 지금 고른 사냥터 이름 (GDD 24-2). 종족 전체 지역 이름(huntingGroundName)이 아니라 사냥터별 이름
  const groundLabel = groundName(faction, exp.groundId, Math.max(0, GROUNDS.findIndex((g) => g.id === exp.groundId)));
  where.append(el('b', '', groundLabel));
  // 폭주 상태 칩 (GDD 23-2): 한계 돌파한 원정의 남은 동안 보인다. 문구는 종족 설정 frenzyName
  const frenzyChip = chip(faction.frenzyName, 'danger');
  frenzyChip.classList.add('bha-frenzychip');
  frenzyChip.prepend(icon('i-risk', 'sm'));
  where.append(frenzyChip);
  // 다음 칸이 강적 칸이면 작은 ⚠ (GDD 76장 3번): 걷는 화면에는 길이 안 보여 칸 위가 아니라 이 칩으로 미리 알린다
  const aheadChip = chip('다음 칸 강적', 'danger');
  aheadChip.classList.add('bha-exp__ahead');
  aheadChip.prepend(icon('i-warn', 'sm'));
  aheadChip.hidden = true;
  where.append(aheadChip);

  const meters = el('div', 'bha-stack bha-stack--tight');

  const slotsLine = el('div', 'bha-exp__slots');
  slotsLine.append(icon('i-slot', 'sm'), el('span', '', faction.slotName));
  let empty = 0;
  for (const id of exp.build.slots) {
    if (!id) {
      empty++;
      continue;
    }
    const m = paintElement(el('span', 'bha-lin'), getTrait(id).element);
    m.append(elementDot(getTrait(id).element, faction.id), traitName(id, faction.id));
    slotsLine.append(m);
  }
  if (empty > 0) slotsLine.append(el('span', 'bha-faint', `빈칸 ${empty}`));

  const chips = el('section', 'bha-exp__chips');
  // 스토리 화 목표 (GDD 25-7): 진행도와 함께 칩 묶음 맨 위
  const goal = el('span', 'bha-exp__goal');
  goal.setAttribute('role', 'status');
  chips.append(goal, where, meters, slotsLine);

  const walkArt = charArt(faction.id, h.tierIndex ?? 0, roomOf(faction).characterArt, WALK_ART_BASE, undefined, undefined, h.skinId);
  const walk = walkScene(faction.walkAnim, groundLabel, walkArt, locoOf(faction, h.formId, walkArt), groundSceneBg(faction, exp.groundId));
  const msgEl = el('p', 'bha-exp__msg');
  msgEl.setAttribute('aria-live', 'polite');
  walk.walker.append(msgEl); // 머리 위 말풍선
  // 휴식 회복 빛 (C.176, GDD 106장 2): 꾸밈 오라(.bha-walker::before)와 겹치지 않게 따로 둔 칸
  const healFx = el('span', 'bha-walker__heal');
  healFx.setAttribute('aria-hidden', 'true');
  healFx.hidden = true;
  walk.walker.append(healFx);
  // 데리고 간 펫 (GDD 90장): 걷는 캐릭터 뒤에 작게
  const buddy = petBuddy(exp.pet?.id ?? null, petName(exp.pet?.id ?? '', faction));
  if (buddy) walk.walker.append(buddy);
  if (takeEnterFx()) window.setTimeout(() => playCosmeticFx('enter', walk.walker), 0); // 등장 연출 (GDD 25-11): 출발 직후 한 번
  const sceneWrap = el('section', 'bha-exp__scene');
  sceneWrap.append(walk.el);

  // 타일 배치판: 바퀴 끝 팝업에서만 쓴다 (원정 시작 전 배치는 placementView)
  const planner = roadPlanner({ exp, tileName: tn, onPlaced: () => h.onSave(), synergyName: (id) => synergyName(id, faction.id) });
  // 바퀴 변이 배너 (GDD 25-5 ④): 걷는 장면 위 가운데. C.170 의 위 가운데 길 칸 줄은 C.176 에 삭제(GDD 104장 3: 왼쪽 위 진행 막대와 겹침)
  const banner = el('div', 'bha-exp__banner');
  banner.setAttribute('role', 'status');
  /** 이벤트 창 안내 한 줄 (골드 부족 등) */
  let eventNote = '';

  // 배속 묶음(1x·2x·4x)은 C.118 에 삭제 (GDD 62장: 1배 고정)
  const pauseBtn = el('button', 'bha-btn bha-btn--icon bha-btn--small');
  pauseBtn.type = 'button';
  pauseBtn.onclick = () => {
    paused = !paused;
    resumeClock();
    render();
  };
  // 원정 도중 [귀환하기] (GDD 81장, C.132): 걷기·휴식 중만, 첫 원정 튜토리얼은 숨김. 확인창이 열린 동안 시간은 멈춘다
  const abortBtn = button({ label: '귀환하기', icon: 'i-return', variant: 'ghost', size: 'small' });
  abortBtn.classList.add('bha-exp__abort');
  abortBtn.onclick = () => {
    if (!canAbort(exp)) return;
    const wasPaused = paused;
    paused = true;
    resumeClock();
    render();
    confirmDialog({
      title: '지금 귀환',
      body: '이번 바퀴 완주 보상은 없다',
      yes: '귀환하기',
      no: '계속 가기',
      onYes: () => {
        if (dead || !canAbort(exp)) return;
        abortExpedition(exp);
        dispose();
        h.onEnded();
      },
      onNo: () => {
        paused = wasPaused;
        resumeClock();
        render();
      },
    });
  };
  const handCount = el('span', 'bha-exp__hand-count');
  // 오른쪽 위 모서리: 귀환하기·일시정지·도움말을 작게 (+ 손에 든 타일 수)
  const corner = el('div', 'bha-exp__corner');
  const cornerRow = el('div', 'bha-exp__cornerrow');
  cornerRow.append(abortBtn, pauseBtn);
  corner.append(cornerRow, handCount);

  // 둥지 칸 도착 선택은 장면 위 말풍선 오버레이 (타일 배치판은 안에 있다)
  const sheetBox = el('div', 'bha-exp__sheetbox');
  sceneWrap.append(chips, corner, banner, sheetBox);
  const main = mountApp(root, { fixed: true, cls: 'bha-exp' }, sceneWrap);

  helpBtn.onclick = () => {
    const wasPaused = paused;
    paused = true;
    resumeClock();
    h.openHelp(() => {
      paused = wasPaused;
      resumeClock();
      render();
    });
  };

  // ── 상태에 맞춰 제자리 갱신 ──
  function render(): void {
    // 휴식 칸 회복 모션 (C.176, GDD 106장 2): 머무는 동안 캐릭터 위로 초록 빛이 오른다
    healFx.hidden = exp.phase !== 'rest';
    const spike = exp.lap >= PX.hungerSpikeLap;
    const hungerDanger = spike || exp.hunger >= PX.hungerMax * 0.8;
    const bonus = riskBonus(exp);

    meters.replaceChildren(
      meter({ kind: 'sp', label: '바퀴', icon: 'i-loop', value: exp.pos, max: EX.loopTiles, compact: true, valueText: `${exp.lap}바퀴` }),
      // 이어 오는 체력 (GDD 107장 4번): 진행 막대 바로 아래, 낮으면(30% 아래) 위험 색
      meter({ kind: 'player', label: '체력', icon: 'i-heal', value: Math.round(hpFractionOf(exp) * 100), max: 100, compact: true, zoneLow: 0.3, danger: hpFractionOf(exp) < 0.3, valueText: `${Math.round(hpFractionOf(exp) * 100)}%` }),
      meter({ kind: 'hunger', label: faction.fullnessName, icon: 'i-hunger', value: Math.round(fullnessOf(exp.hunger, PX.hungerMax)), max: PX.hungerMax, compact: true, zoneLow: 0.2, danger: hungerDanger }),
      meter({
        kind: 'cond', label: '컨디션', icon: 'i-cond', value: Math.round(exp.condition), max: PX.conditionMax, compact: true,
        valueText: `${Math.round(exp.condition)}${bonus > 0 ? ` · 공허 +${Math.round(bonus * 100)}%` : ''}`,
      }),
      meter({
        kind: 'risk', label: faction.riskGaugeName, icon: 'i-risk', value: Math.round(exp.risk), max: RX.limit, compact: true, zone: 0.6, danger: Boolean(exp.breakthrough) || exp.risk >= 60,
        valueText: exp.breakthrough ? `${faction.frenzyName}! (${Math.round(exp.risk)})` : `${Math.round(exp.risk)} / ${RX.limit}`,
      }),
    );
    frenzyChip.hidden = !inFrenzy(exp);
    aheadChip.hidden = !(exp.phase === 'moving' && nextCellIsElite(exp));
    const goalText = storyGoalLine(exp);
    goal.hidden = goalText === null;
    if (goalText !== null) goal.replaceChildren(icon('i-flag-win'), goalText);
    // 보스 기척 (GDD 37장 2번): 자유 원정에 보스가 나온 바퀴, 보스 칸을 지나기 전까지. 걷기 화면에는 길이 안 보이므로 칸 번호·남은 칸으로 표시
    const omen = pendingFreeBoss(exp);
    banner.hidden = !exp.mutation && !omen;
    banner.classList.toggle('bha-exp__banner--boss', omen !== null);
    const bannerKids: HTMLElement[] = [];
    if (omen) {
      const c = chip(`보스 기척 · ${bossName(omen.bossId, faction.id)}`, 'danger');
      c.prepend(icon('i-warn', 'sm'));
      const den = exp.slots[omen.cell];
      bannerKids.push(c, el('span', 'bha-exp__bannersub', bossOmenSub(omen.cell, exp.pos, den ? tn(den) : null)));
    }
    if (exp.mutation) {
      const c = chip(`${exp.lap}바퀴 변이 · ${mutationName(exp.mutation, faction.id)}`, 'rare');
      c.prepend(icon('i-warn', 'sm'));
      bannerKids.push(c, el('span', 'bha-exp__bannersub', variantModsText(mutationMods(exp.mutation), faction.id).join(' · ')));
    }
    banner.replaceChildren(...bannerKids);
    main.classList.toggle('is-frenzy', inFrenzy(exp));

    walk.update({ walking: isWalking(exp.phase, paused), speed });

    // 머리 위 말풍선: 조우·획득·휴식·경고·일시정지·도착 때만 뜬다 (그냥 걷는 중에는 감춘다)
    const kind = msgKind(exp.phase, msg, spike);
    const text = bubbleText({ phase: exp.phase, paused, msg, kind, nestName: faction.nestName });
    msgEl.hidden = text === '';
    msgEl.className = `bha-exp__msg${kind ? ` bha-exp__msg--${kind}` : ''}`;
    msgEl.replaceChildren(icon(paused && exp.phase === 'moving' && !msg ? 'i-pause' : MSG_ICON[kind]), el('span', '', text));

    // 일시정지
    pauseBtn.replaceChildren(icon(paused ? 'i-play' : 'i-pause'));
    pauseBtn.classList.toggle('is-on', paused);
    pauseBtn.setAttribute('aria-label', paused ? '재개' : '일시정지');
    abortBtn.hidden = !canAbort(exp);
    handCount.textContent = exp.hand.length > 0 ? `손에 든 타일 ${exp.hand.length}장` : '';
    handCount.hidden = exp.hand.length === 0;
    main.classList.toggle('is-paused', paused);

    // 둥지 칸 도착: 귀환 / 한 바퀴 더. 이벤트 타일: 고르기 창
    main.classList.toggle('has-sheet', exp.phase === 'nest-choice' || exp.phase === 'event');
    if (exp.phase === 'nest-choice') sheetBox.replaceChildren(...nestSheet());
    else if (exp.phase === 'event') sheetBox.replaceChildren(...eventSheet());
    else {
      sheetBox.replaceChildren();
      if (helpBtn.parentElement !== cornerRow) cornerRow.append(helpBtn);
    }
  }

  function nestSheet(): HTMLElement[] {
    const over = exp.lap >= EX.defaultLaps;
    const title = el('h2', 'bha-sheet__title');
    title.append(icon('i-nest'), `${faction.nestName}에 도착했다`, helpBtn); // 시트가 머리 줄을 대신하므로 [?] 도 시트 제목 줄로 옮긴다 (T-2)
    const ret = button({
      label: '귀환', icon: 'i-return', variant: 'primary', size: 'lg',
      onClick: () => {
        chooseReturn(exp);
        dispose();
        h.onEnded();
      },
    });
    const more = button({
      icon: 'i-loop', size: 'lg',
      onClick: () => {
        chooseContinue(exp);
        h.onSave();
        msg = '다시 출발!';
        render();
        nextStep();
      },
    });
    const label = el('span', 'bha-btn__label');
    label.append('한 바퀴 더', el('span', 'bha-btn__sub', `(${exp.lap + 1}바퀴)`));
    more.append(label);
    const grid = el('div', 'bha-grid2');
    grid.append(ret, more);
    const sheet = el('div', 'bha-sheet');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', `${faction.nestName}에 도착했다`);
    // 설명 영역(낮은 LCD 에서는 이 안만 스크롤)과 버튼 줄을 나눈다: 귀환/한 바퀴 더 버튼은 항상 보인다
    const info = el('div', 'bha-sheet__scroll');
    info.append(title, el('p', 'bha-sheet__body', `${exp.lap}바퀴를 돌았다. 지금 돌아가면 얻은 것을 모두 지킨다.`));
    if (over) info.append(notice('warn', `기본 ${EX.defaultLaps}바퀴를 넘겼다. 바퀴를 더 돌수록 보상도 위험도 커진다.`));
    // 드래프트 (GDD 25-5 ①): 3장 중 1장 → 이번 바퀴 길에 바로 놓는다(보관함에는 안 들어감, 안 놓고 계속하면 사라진다)
    const d = exp.draft;
    if (d) {
      const box = el('div', 'bha-draft');
      box.dataset.draft = d.picked === null ? 'open' : 'picked';
      const head = el('p', 'bha-sheet__body bha-draft__head');
      head.append(el('b', '', `드래프트 — ${d.options.length}장 중 1장`), d.picked === null ? ' 고른 타일은 이번 바퀴 길에 바로 놓는다 (가방에는 안 들어간다)' : ` ${tn(d.options[d.picked]!)}을(를) 골랐다. 아래 길에 놓는다 (안 놓고 계속하면 사라진다)`);
      const row = el('div', 'bha-draft__row');
      d.options.forEach((id, i) => {
        const t = getTile(id);
        const css = tileCss(t.kind);
        const card = el('button', `bha-tilechip bha-tilechip--${css} bha-draft__card${d.picked === i ? ' is-selected' : ''}`);
        card.type = 'button';
        card.disabled = d.picked !== null;
        card.setAttribute('aria-pressed', String(d.picked === i));
        const ic = el('span', 'bha-tilechip__icon');
        ic.append(icon(tileIconId(css)));
        const txt = el('span', 'bha-draft__text');
        txt.append(el('b', '', tn(id)), el('small', '', tileHint(t)));
        card.append(ic, txt);
        if (t.kind === 'event' || !exp.deck.includes(id)) card.append(el('span', 'bha-chip bha-chip--rare bha-draft__tag', t.kind === 'event' ? '이벤트' : '새 타일'));
        card.onclick = () => {
          const r = chooseDraft(exp, i);
          if (!r.ok) return;
          h.onSave();
          render();
        };
        row.append(card);
      });
      box.append(head, row);
      info.append(box);
    }
    if (exp.hand.length > 0 || planner.canEdit() || d) {
      // 획득한 타일은 지금 다음 바퀴 칸에 놓는다 (GDD 17-1). 안 놓으면 다음 원정 덱으로 보관된다. 이 팝업이 길 순서가 보이는 유일한 곳
      info.append(el('p', 'bha-sheet__body', '얻은 타일을 다음 바퀴 길에 놓는다 (안 놓으면 가방에 남는다). 계속하기 전에는 놓은 타일을 눌러 고친다: 선택 → 빈 칸은 이동, 다른 놓은 타일은 교체, 같은 칸을 다시 누르면 손으로 돌아온다'), planner.el);
      planner.refresh();
    }
    sheet.append(info, grid);
    return [el('div', 'bha-sheet__scrim'), sheet];
  }

  /** 이벤트 타일 창 (GDD 25-5 ③): 상인(골드로 1개)·제단(특성 하나 위력↑ 대신 리스크↑)·보물·함정·갈림길(둘 중 하나) */
  function eventSheet(): HTMLElement[] {
    const ev = exp.eventPending!;
    const E = BALANCE.provisional.tileVariants.events;
    const title = el('h2', 'bha-sheet__title');
    title.append(icon('i-tile-combo'), tn(ev.tileId), helpBtn);
    const info = el('div', 'bha-sheet__scroll');
    info.append(title, el('p', 'bha-sheet__body', eventHint(ev.event)));
    const choices = el('div', 'bha-event__choices');
    const act = (choice: number | null) => {
      const r = resolveEvent(exp, choice);
      if (!r.ok) {
        eventNote = r.reason;
        render();
        return;
      }
      msg = r.text;
      eventNote = '';
      h.onSave();
      render();
      nextStep();
    };
    const gold = goldAvailable(exp);
    let leave: HTMLElement | null = null;
    if (ev.event === 'merchant') {
      info.append(el('p', 'bha-sheet__body', `가진 ${TRADE_CURRENCY_NAME} ${gold}`));
      (ev.offers ?? []).forEach((o, i) => {
        const name = o.kind === 'food' ? faction.foodNames[o.id as keyof typeof faction.foodNames] : `타일 ${tn(o.id)}`;
        const b = button({ label: `${name} — ${o.price} ${TRADE_CURRENCY_NAME}`, icon: o.kind === 'food' ? 'i-care-feed' : 'i-deck', disabled: gold < o.price, onClick: () => act(i) });
        b.dataset.offer = String(i);
        choices.append(b);
      });
      leave = button({ label: '그냥 지나간다', icon: 'i-chevron-right', variant: 'ghost', onClick: () => act(null) });
    } else if (ev.event === 'altar') {
      info.append(el('p', 'bha-sheet__body', `${faction.riskGaugeName} ${Math.round(exp.risk)} → ${Math.min(BALANCE.provisional.risk.limit, Math.round(exp.risk + E.altar.risk))}`));
      const traits = ev.traits ?? [];
      if (traits.length === 0) info.append(el('p', 'bha-faint', '장착한 특성이 없다'));
      traits.forEach((id, i) => {
        const b = button({ label: `${traitName(id, faction.id)} 위력 +${Math.round(E.altar.traitPower * 100)}%`, icon: 'i-slot', onClick: () => act(i) });
        b.prepend(elementDot(getTrait(id).element, faction.id));
        choices.append(b);
      });
      leave = button({ label: '바치지 않는다', icon: 'i-close', variant: 'ghost', onClick: () => act(null) });
    } else if (ev.event === 'treasure') {
      const t = ev.treasure ?? {};
      info.append(el('p', 'bha-sheet__body bha-event__loot', t.food ? `${faction.foodNames[t.food]} 1개` : `${TRADE_CURRENCY_NAME} ${t.gold ?? 0}`));
      choices.append(button({ label: '챙긴다', icon: 'i-check', variant: 'primary', onClick: () => act(null) }));
    } else if (ev.event === 'trap') {
      choices.append(button({ label: '각오하고 지나간다', icon: 'i-warn', variant: 'danger', onClick: () => act(null) }));
    } else {
      choices.append(
        button({ label: `보호막 ${Math.round(E.crossroads.shield * 100)}% (다음 전투)`, icon: 'i-guard', onClick: () => act(0) }),
        button({ label: `${TRADE_CURRENCY_NAME} +${E.crossroads.gold}`, icon: 'i-rare', onClick: () => act(1) }),
      );
    }
    if (eventNote) info.append(notice('warn', eventNote));
    const sheet = el('div', 'bha-sheet bha-event');
    sheet.dataset.event = ev.event;
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', tn(ev.tileId));
    const grid = el('div', 'bha-event__foot');
    grid.append(choices);
    if (leave) grid.append(leave);
    sheet.append(info, grid);
    return [el('div', 'bha-sheet__scrim'), sheet];
  }

  render();
  resumeClock();

  let wasPaused = false;
  if (!dead) unhold = onHold((sig) => {
    if (dead || (!main.isConnected && !away)) return dispose();
    if (sig === 'hold') {
      if (held) return;
      held = true;
      wasPaused = paused;
      paused = true; // 모양도 일시정지로
      resumeClock();
      render();
    } else if (sig === 'release') {
      if (!held) return;
      held = false;
      paused = wasPaused;
      resumeClock();
      render();
    } else {
      dispose();
    }
  });
}
