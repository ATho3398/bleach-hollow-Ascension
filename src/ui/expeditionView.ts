// 원정 화면 (GDD 1장, 2-1, 6장, 17-1): 캐릭터가 왼쪽을 향해 걷는 화면 + 위에 얹는 상태 줄·조우 알림, 둥지 칸에서 귀환 선택·타일 배치 팝업. (U-4 → R-1)
// 시간(칸당 5초, 1x/2x/4x)은 여기서 돌리고, 규칙은 engine/expedition 이 정한다. 12칸 길·칸 번호·바퀴는 엔진 안에만 있고 걷는 화면에는 보이지 않는다.
// 화면 DOM 은 한 번 만들고 상태가 바뀔 때마다 제자리에서 고친다.
import { BALANCE } from '../config/balance';
import { charArt } from '../data/art/manifest';
import { tileName } from '../data/tiles';
import { getTrait, traitName } from '../data/traits';
import {
  advance, chooseContinue, chooseReturn, drainEvents, finishRest, riskBonus, type ExpeditionState, type PendingBattle,
  type StepEvent,
} from '../engine/expedition';
import { roomOf, type FactionConfig } from '../engine/faction';
import { button, el, icon, meter, mountApp, notice } from './bha/dom';
import { onHold } from './bha/hold';
import { bubbleText, MSG_ICON, msgKind } from './bha/expedition';
import { lineageClass, lineageIconId } from './bha/lineage';
import { roadPlanner } from './bha/road';
import { locoOf } from './bha/loco';
import { isWalking, walkScene } from './bha/walk';

const WALK_ART_BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

export interface ExpeditionViewHandlers {
  /** 육성 단계(0부터): 걷는 캐릭터 그림 파일(char-<종족>-<번호>)을 고른다 */
  tierIndex?: number;
  /** 현재 진화체 id (이동 방식 GDD 18-11 을 고른다). 1단계는 null */
  formId?: string | null;
  /** 전투가 시작될 때: 전투 화면으로 넘어간다. 끝나면 호출자가 expeditionView 를 다시 부른다 */
  onBattle: (p: PendingBattle) => void;
  onEnded: () => void;
  /** 한계 돌파가 일어났을 때: 연출 화면을 보여주고 끝나면 resume 을 부른다 */
  onBreakthrough: (resume: () => void) => void;
  /** 자동 저장 시점(GDD 14-1): 전투 시작 직전, 둥지 칸 도착, 타일 배치, 휴식 후, 한 바퀴 더, 배속 변경 */
  onSave: () => void;
  /** [?] 도움말 (C.19): 열려 있는 동안 원정 시간은 멈추고, 닫으면 onClose 로 이어간다 */
  openHelp: (onClose: () => void) => void;
}

const SPEEDS = [1, 2, 4] as const;
const EX = BALANCE.expedition;
const PX = BALANCE.provisional.expedition;
const RX = BALANCE.provisional.risk;

let speed: (typeof SPEEDS)[number] = 1;

/** 배속 설정은 원정 중간 저장에 같이 들어간다 (이어하기에서 유지) */
export function getSpeed(): number {
  return speed;
}
export function setSpeed(v: number): void {
  speed = (SPEEDS as readonly number[]).includes(v) ? (v as (typeof SPEEDS)[number]) : 1;
}

export function expeditionView(root: HTMLElement, faction: FactionConfig, exp: ExpeditionState, h: ExpeditionViewHandlers, startMsg = ''): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let paused = false;
  let msg = startMsg;
  const tn = (id: string) => tileName(id, faction.id);

  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  /** 처음 화면 복귀 확인창(Q-3)이 열려 있으면 true: 예약된 일은 풀릴 때까지 미뤄진다. dead = 이 화면을 떠났다 */
  let held = false;
  let dead = false;
  const later = (ms: number, fn: () => void) => {
    clear();
    const run = () => {
      if (dead) return;
      if (held) {
        timer = setTimeout(run, 150);
        return;
      }
      fn();
    };
    timer = setTimeout(run, ms);
  };
  const stepMs = () => (EX.secondsPerTile * 1000) / speed;

  function schedule(): void {
    clear();
    if (exp.phase !== 'moving') return;
    if (!paused) later(stepMs(), tick);
  }

  function tick(): void {
    const before = exp.hand.length;
    const ev = advance(exp);
    if (!ev) return;
    const got = exp.hand.length - before;
    if (drainEvents(exp).length > 0) {
      clear();
      h.onBreakthrough(() => handle(ev, got));
      return;
    }
    handle(ev, got);
  }

  function handle(ev: StepEvent, got: number): void {
    switch (ev.kind) {
      case 'move':
        msg = '';
        break;
      case 'battle':
        msg = `${tn_enemy(ev.battle)} 조우!`;
        h.onSave(); // 전투 시작 직전 상태 (전투 중 새로고침하면 여기서 다시 시작한다)
        render();
        later(700 / speed, () => {
          clear();
          h.onBattle(ev.battle);
        });
        return;
      case 'rest':
        msg = `${tn(exp.slots[ev.cell]!)}에서 쉰다…`;
        render();
        later((EX.secondsPerTile * 1000 * PX.restTimeTiles) / speed, () => {
          finishRest(exp);
          h.onSave();
          msg = '허기·컨디션이 회복됐다';
          render();
          schedule();
        });
        return;
      case 'lap-complete':
        planner.reset();
        msg = `${got > 0 ? `타일 획득: ${tn(ev.rewardTile!)} · ` : ''}${faction.nestName}에 도착했다`;
        h.onSave();
        break;
      case 'ended':
        clear();
        h.onEnded();
        return;
    }
    render();
    schedule();
  }

  const tn_enemy = (p: PendingBattle) => `${p.elite ? '강적 ' : ''}${p.tileId ? `(${tn(p.tileId)}) ` : ''}`;

  // ── 고정 DOM (한 번만 만든다) ──
  // 걷는 화면 (GDD 18-7): 캐릭터가 장면 가득 걷고, 정보는 배경 위에 떠 있는 작은 칩(왼쪽 위), 캐릭터 머리 위 말풍선(조우·획득·안내),
  // 모서리 작은 버튼(오른쪽 위), 귀환·선택 말풍선(장면 위 오버레이)으로 띄운다. 별도 상태 줄·패널은 없다.
  const helpBtn = button({ label: '도움말', icon: 'i-help', iconOnly: true, variant: 'ghost', size: 'small' });
  const where = el('div', 'bha-exp__where');
  where.append(el('b', '', faction.huntingGroundName));

  const meters = el('div', 'bha-stack bha-stack--tight');

  const slotsLine = el('div', 'bha-exp__slots');
  slotsLine.append(icon('i-slot', 'sm'), el('span', '', faction.slotName));
  let empty = 0;
  for (const id of exp.build.slots) {
    if (!id) {
      empty++;
      continue;
    }
    const m = el('span', ['bha-lin', lineageClass(getTrait(id).lineageId)].filter(Boolean).join(' '));
    m.append(icon(lineageIconId(getTrait(id).lineageId)), traitName(id, faction.id));
    slotsLine.append(m);
  }
  if (empty > 0) slotsLine.append(el('span', 'bha-faint', `빈칸 ${empty}`));

  const chips = el('section', 'bha-exp__chips');
  chips.append(where, meters, slotsLine);

  const walkArt = charArt(faction.id, h.tierIndex ?? 0, roomOf(faction).characterArt, WALK_ART_BASE);
  const walk = walkScene(faction.walkAnim, faction.huntingGroundName, walkArt, locoOf(faction, h.formId, walkArt));
  const msgEl = el('p', 'bha-exp__msg');
  msgEl.setAttribute('aria-live', 'polite');
  walk.walker.append(msgEl); // 머리 위 말풍선
  const sceneWrap = el('section', 'bha-exp__scene');
  sceneWrap.append(walk.el);

  // 타일 배치판: 바퀴 끝 팝업에서만 쓴다 (원정 시작 전 배치는 placementView)
  const planner = roadPlanner({ exp, tileName: tn, onPlaced: () => h.onSave() });

  const speedSeg = el('div', 'bha-seg bha-seg--sm');
  speedSeg.setAttribute('role', 'radiogroup');
  speedSeg.setAttribute('aria-label', '배속');
  const speedBtns = SPEEDS.map((sp) => {
    const b = el('button', 'bha-seg__item', `${sp}x`);
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.onclick = () => {
      speed = sp;
      h.onSave();
      schedule();
      render();
    };
    return b;
  });
  speedSeg.append(...speedBtns);
  const pauseBtn = el('button', 'bha-btn bha-btn--icon bha-btn--small');
  pauseBtn.type = 'button';
  pauseBtn.onclick = () => {
    paused = !paused;
    schedule();
    render();
  };
  const handCount = el('span', 'bha-exp__hand-count');
  // 오른쪽 위 모서리: 일시정지·배속·도움말을 작게 (+ 손에 든 타일 수)
  const corner = el('div', 'bha-exp__corner');
  const cornerRow = el('div', 'bha-exp__cornerrow');
  cornerRow.append(speedSeg, pauseBtn);
  corner.append(cornerRow, handCount);

  // 둥지 칸 도착 선택은 장면 위 말풍선 오버레이 (타일 배치판은 안에 있다)
  const sheetBox = el('div', 'bha-exp__sheetbox');
  sceneWrap.append(chips, corner, sheetBox);
  const main = mountApp(root, { fixed: true, cls: 'bha-exp' }, sceneWrap);

  helpBtn.onclick = () => {
    const wasPaused = paused;
    paused = true;
    schedule();
    h.openHelp(() => {
      paused = wasPaused;
      schedule();
      render();
    });
  };

  // ── 상태에 맞춰 제자리 갱신 ──
  function render(): void {
    const spike = exp.lap >= PX.hungerSpikeLap;
    const hungerDanger = spike || exp.hunger >= PX.hungerMax * 0.8;
    const bonus = riskBonus(exp);

    meters.replaceChildren(
      meter({ kind: 'sp', label: '바퀴', icon: 'i-loop', value: exp.pos, max: EX.loopTiles, compact: true, valueText: `${exp.lap}바퀴` }),
      meter({ kind: 'hunger', label: '허기', icon: 'i-hunger', value: Math.round(exp.hunger), max: PX.hungerMax, compact: true, zone: 0.8, danger: hungerDanger }),
      meter({
        kind: 'cond', label: '컨디션', icon: 'i-cond', value: Math.round(exp.condition), max: PX.conditionMax, compact: true,
        valueText: `${Math.round(exp.condition)}${bonus > 0 ? ` · 공허 +${Math.round(bonus * 100)}%` : ''}`,
      }),
      meter({
        kind: 'risk', label: faction.riskGaugeName, icon: 'i-risk', value: Math.round(exp.risk), max: RX.limit, compact: true, zone: 0.6, danger: Boolean(exp.breakthrough) || exp.risk >= 60,
        valueText: exp.breakthrough ? `한계 돌파! 공허 ↑ (${Math.round(exp.risk)})` : `${Math.round(exp.risk)} / ${RX.limit}`,
      }),
    );

    walk.update({ walking: isWalking(exp.phase, paused), speed });

    // 머리 위 말풍선: 조우·획득·휴식·경고·일시정지·도착 때만 뜬다 (그냥 걷는 중에는 감춘다)
    const kind = msgKind(exp.phase, msg, spike);
    const text = bubbleText({ phase: exp.phase, paused, msg, kind, nestName: faction.nestName });
    msgEl.hidden = text === '';
    msgEl.className = `bha-exp__msg${kind ? ` bha-exp__msg--${kind}` : ''}`;
    msgEl.replaceChildren(icon(paused && exp.phase === 'moving' && !msg ? 'i-pause' : MSG_ICON[kind]), el('span', '', text));

    // 배속·일시정지
    SPEEDS.forEach((sp, i) => {
      speedBtns[i]!.classList.toggle('is-active', speed === sp);
      speedBtns[i]!.setAttribute('aria-checked', String(speed === sp));
    });
    pauseBtn.replaceChildren(icon(paused ? 'i-play' : 'i-pause'));
    pauseBtn.classList.toggle('is-on', paused);
    pauseBtn.setAttribute('aria-label', paused ? '재개' : '일시정지');
    handCount.textContent = exp.hand.length > 0 ? `손에 든 타일 ${exp.hand.length}장` : '';
    handCount.hidden = exp.hand.length === 0;
    main.classList.toggle('is-paused', paused);

    // 둥지 칸 도착: 귀환 / 한 바퀴 더
    main.classList.toggle('has-sheet', exp.phase === 'nest-choice');
    if (exp.phase === 'nest-choice') sheetBox.replaceChildren(...nestSheet());
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
        schedule();
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
    if (exp.hand.length > 0 || planner.canEdit()) {
      // 획득한 타일은 지금 다음 바퀴 칸에 놓는다 (GDD 17-1). 안 놓으면 다음 원정 덱으로 보관된다. 이 팝업이 길 순서가 보이는 유일한 곳
      info.append(el('p', 'bha-sheet__body', '얻은 타일을 다음 바퀴 길에 놓는다 (안 놓으면 덱 보관). 계속하기 전에는 놓은 타일을 눌러 고친다: 선택 → 빈 칸은 이동, 다른 놓은 타일은 교체, 같은 칸을 다시 누르면 손으로 돌아온다'), planner.el);
      planner.refresh();
    }
    sheet.append(info, grid);
    return [el('div', 'bha-sheet__scrim'), sheet];
  }

  render();
  schedule();

  let wasPaused = false;
  const offHold = onHold((sig) => {
    if (!main.isConnected || dead) return offHold();
    if (sig === 'hold') {
      if (held) return;
      held = true;
      wasPaused = paused;
      paused = true; // 모양만 일시정지로: 타이머는 건드리지 않고 later 가 미룬다
      render();
    } else if (sig === 'release') {
      if (!held) return;
      held = false;
      paused = wasPaused;
      render();
    } else {
      dead = true;
      clear();
      offHold();
    }
  });
}
