// 원정 화면 (GDD 1장, 2-1, 6장): 12칸 원형 길, 캐릭터 자동 이동, 타일 배치, 둥지 칸에서 귀환 선택. (U-4 새 디자인)
// 시간(칸당 5초, 1x/2x/4x)은 여기서 돌리고, 규칙은 engine/expedition 이 정한다.
// 화면 DOM 은 한 번 만들고 상태가 바뀔 때마다 제자리에서 고친다: 표식은 링의 --pos 만 바꿔 transform 보간으로 걷는다.
import { BALANCE } from '../config/balance';
import { getTile, tileName } from '../data/tiles';
import { getTrait, traitName } from '../data/traits';
import {
  advance, chooseContinue, chooseReturn, drainEvents, finishRest, placeTile, riskBonus, type ExpeditionState, type PendingBattle,
  type StepEvent,
} from '../engine/expedition';
import type { FactionConfig } from '../engine/faction';
import { button, el, icon, meter, mountApp, notice } from './bha/dom';
import {
  canPlaceAt, MSG_ICON, msgKind, needsWalkerSnap, ringDisplayPos, ringState, tileCss, tileIconId,
} from './bha/expedition';
import { lineageClass, lineageIconId } from './bha/lineage';
import { tileHint } from './labels';

export interface ExpeditionViewHandlers {
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
  let selected: string | null = null;
  let msg = startMsg;
  let shownPos = ringDisplayPos(exp.pos, exp.phase);
  const tn = (id: string) => tileName(id, faction.id);

  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const later = (ms: number, fn: () => void) => {
    clear();
    timer = setTimeout(fn, ms);
  };
  const stepMs = () => (EX.secondsPerTile * 1000) / speed;

  function schedule(): void {
    clear();
    if (exp.phase === 'moving' && !paused) later(stepMs(), tick);
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
        msg = `${ev.lap}바퀴 완주! ${got > 0 ? `타일 획득: ${tn(ev.rewardTile!)}` : ''} ${faction.nestName} 칸에서 귀환할지 고른다.`;
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
  const lapLine = el('small');
  const helpBtn = button({ label: '도움말', icon: 'i-help', iconOnly: true, variant: 'ghost' });
  const where = el('div', 'bha-exp__where');
  where.append(el('b', '', faction.huntingGroundName), lapLine);
  const head = el('div', 'bha-exp__head');
  head.append(where, helpBtn);

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

  const top = el('section', 'bha-exp__top');
  top.append(head, meters, slotsLine);

  // 원형 길: 칸 12 + 타일 슬롯 11 + 표식
  const ring = el('div', 'bha-ring');
  const done = el('span', 'bha-ring__done');
  const cells: HTMLElement[] = [];
  const slotBtns: HTMLButtonElement[] = [];
  ring.append(el('span', 'bha-ring__track'), done);
  for (let i = 0; i < EX.loopTiles; i++) {
    const cell = el('span', i === 0 ? 'bha-ring__cell bha-ring__cell--nest' : 'bha-ring__cell');
    cell.style.setProperty('--i', String(i));
    if (i === 0) cell.append(icon('i-nest'), el('span', '', faction.nestName));
    else cell.textContent = String(i);
    cells.push(cell);
    ring.append(cell);
  }
  for (let i = 1; i < EX.loopTiles; i++) {
    const slot = el('button', 'bha-ring__slot');
    slot.type = 'button';
    slot.style.setProperty('--i', String(i));
    slot.onclick = () => onSlot(i);
    slotBtns[i] = slot;
    ring.append(slot);
  }
  const walker = el('span', 'bha-ring__walker');
  const lapNo = el('span', 'bha-ring__lap');
  const stateEl = el('span', 'bha-ring__state');
  const hub = el('div', 'bha-ring__hub');
  hub.append(lapNo, stateEl);
  ring.append(walker, hub);
  const ringWrap = el('section', 'bha-exp__ringwrap');
  ringWrap.append(ring);

  const msgEl = el('p', 'bha-exp__msg');
  msgEl.setAttribute('aria-live', 'polite');

  const hand = el('div', 'bha-exp__hand');
  const handBox = el('div');
  handBox.append(el('p', 'bha-exp__handcap', '보유 타일 — 고른 뒤 앞쪽 빈 슬롯을 누르면 놓인다. 한 번 놓으면 원정 동안 유지'), hand);

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
  const pauseBtn = el('button', 'bha-btn bha-btn--icon');
  pauseBtn.type = 'button';
  pauseBtn.onclick = () => {
    paused = !paused;
    schedule();
    render();
  };
  const handCount = el('span', 'bha-faint bha-num');
  const bar = el('footer', 'bha-exp__bar');
  bar.append(speedSeg, pauseBtn, el('span'), handCount);

  const sheetBox = el('div');
  const main = mountApp(root, { fixed: true, cls: 'bha-exp' }, top, ringWrap, msgEl, handBox, bar, sheetBox);

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

  function onSlot(i: number): void {
    const id = exp.slots[i];
    if (id) {
      msg = `${tn(id)}: ${tileHint(getTile(id))}`;
    } else if (selected) {
      const r = placeTile(exp, selected, i);
      msg = r.ok ? `${tn(selected)}을(를) ${i}번 칸에 놓았다` : r.reason;
      if (r.ok) h.onSave();
      if (r.ok && !exp.hand.includes(selected)) selected = null;
    } else msg = '아래 보유 타일을 먼저 고른다';
    render();
  }

  // ── 상태에 맞춰 제자리 갱신 ──
  function render(): void {
    const spike = exp.lap >= PX.hungerSpikeLap;
    const hungerDanger = spike || exp.hunger >= PX.hungerMax * 0.8;
    const bonus = riskBonus(exp);

    lapLine.textContent = `원정 · ${exp.lap}바퀴째 / 기본 ${EX.defaultLaps}바퀴 · 전투 ${exp.battlesByLap[exp.lap - 1] ?? 0}회`;
    meters.replaceChildren(
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

    // 링: 표식 위치는 --pos 만 바꾼다 (transform 보간). 12 → 0 으로 돌아갈 때는 전환 없이 옮긴다
    const pos = ringDisplayPos(exp.pos, exp.phase);
    if (needsWalkerSnap(shownPos, pos)) {
      walker.style.transition = 'none';
      ring.style.setProperty('--pos', String(pos));
      void walker.offsetWidth;
      walker.style.transition = '';
    } else ring.style.setProperty('--pos', String(pos));
    shownPos = pos;
    cells.forEach((c, i) => {
      c.classList.toggle('is-past', i > 0 && i < exp.pos);
      c.classList.toggle('is-current', i === 0 ? pos === 0 || pos === 12 : i === exp.pos);
      c.classList.toggle('is-event', i > 0 && i === exp.pos && exp.phase === 'battle');
    });
    for (let i = 1; i < EX.loopTiles; i++) {
      const id = exp.slots[i];
      const can = canPlaceAt({ slot: id ?? null, index: i, pos: exp.pos, phase: exp.phase, hasSelected: selected !== null });
      const b = slotBtns[i]!;
      const css = id ? tileCss(getTile(id).kind) : null;
      b.className = `bha-ring__slot${css ? ` is-has bha-ring__slot--${css}` : ''}${can ? ' is-can' : ''}${i < exp.pos ? ' is-past' : ''}`;
      b.replaceChildren(icon(css ? tileIconId(css) : 'i-plus'), el('span', 'bha-ring__slotnum', String(i)));
      b.title = id ? `${tn(id)} — ${tileHint(getTile(id))}` : '빈 슬롯';
      b.setAttribute('aria-label', `타일 슬롯 ${i}${id ? ` (${tn(id)})` : can ? ' (놓을 수 있음)' : ' (비어 있음)'}`);
    }
    lapNo.replaceChildren(String(exp.lap), el('small', '', `/${exp.maxLaps}바퀴`));
    const st = ringState(exp.phase, paused, selected !== null);
    stateEl.replaceChildren(icon(st.icon), st.label);

    // 메시지 줄
    const kind = msgKind(exp.phase, msg, spike);
    let text = msg;
    if (!text) {
      if (kind === 'warn') text = '허기 급상승 중! 귀환을 서두르자';
      else if (exp.phase === 'moving') text = paused ? '일시정지 — 다시 누르면 이어서 걷는다' : `길을 따라 걷는 중… 다음 칸: ${exp.pos + 1 >= EX.loopTiles ? faction.nestName : exp.pos + 1}`;
      else if (exp.phase === 'nest-choice') text = `${faction.nestName} 칸에 도착했다`;
    }
    msgEl.className = `bha-exp__msg${kind ? ` bha-exp__msg--${kind}` : ''}`;
    msgEl.replaceChildren(icon(paused && exp.phase === 'moving' && !msg ? 'i-pause' : MSG_ICON[kind]), el('span', '', text));

    // 보유 타일
    fillHand(hand);

    // 배속·일시정지
    SPEEDS.forEach((sp, i) => {
      speedBtns[i]!.classList.toggle('is-active', speed === sp);
      speedBtns[i]!.setAttribute('aria-checked', String(speed === sp));
    });
    pauseBtn.replaceChildren(icon(paused ? 'i-play' : 'i-pause'));
    pauseBtn.classList.toggle('is-on', paused);
    pauseBtn.setAttribute('aria-label', paused ? '재개' : '일시정지');
    handCount.textContent = `보유 타일 ${exp.hand.length}장`;
    main.classList.toggle('is-paused', paused);

    // 둥지 칸 도착: 귀환 / 한 바퀴 더
    if (exp.phase === 'nest-choice') sheetBox.replaceChildren(...nestSheet());
    else sheetBox.replaceChildren();
  }

  /** 보유 타일 칩들 (원정 아래쪽 + 둥지 칸 선택 시트 안에서 같이 쓴다) */
  function fillHand(box: HTMLElement): void {
    box.replaceChildren();
    if (exp.hand.length === 0) box.append(el('span', 'bha-faint', '획득한 타일이 없다 (전투 승리·바퀴 완주로 얻는다)'));
    for (const id of new Set(exp.hand)) {
      const n = exp.hand.filter((x) => x === id).length;
      const css = tileCss(getTile(id).kind);
      const chip = el('button', `bha-tilechip bha-tilechip--${css}${selected === id ? ' is-selected' : ''}`);
      chip.type = 'button';
      chip.setAttribute('aria-pressed', String(selected === id));
      const ic = el('span', 'bha-tilechip__icon');
      ic.append(icon(tileIconId(css)));
      chip.append(ic, tn(id), el('span', 'bha-tilechip__count', String(n)));
      chip.onclick = () => {
        selected = selected === id ? null : id;
        msg = selected ? `${tn(id)}: ${tileHint(getTile(id))}. 빈 슬롯(＋)을 눌러 놓는다` : '';
        render();
      };
      box.append(chip);
    }
  }

  function nestSheet(): HTMLElement[] {
    const over = exp.lap >= EX.defaultLaps;
    const title = el('h2', 'bha-sheet__title');
    title.append(icon('i-nest'), `${faction.nestName} 칸에 도착했다`);
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
        msg = `${exp.lap}바퀴째 출발`;
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
    sheet.append(title, el('p', 'bha-sheet__body', `${exp.lap}바퀴를 돌았다. 지금 돌아가면 얻은 것을 모두 지킨다.`));
    if (over) sheet.append(notice('warn', `기본 ${EX.defaultLaps}바퀴를 넘겼다. 바퀴를 더 돌수록 보상도 위험도 커진다.`));
    if (exp.hand.length > 0) {
      // 둥지 칸에서도 다음 바퀴 슬롯에 타일을 놓을 수 있다 (엔진 규칙 그대로): 시트 안에 보유 타일을 보인다
      const row = el('div', 'bha-exp__hand');
      fillHand(row);
      sheet.append(row);
    }
    sheet.append(grid);
    return [el('div', 'bha-sheet__scrim'), sheet];
  }

  render();
  schedule();
}
