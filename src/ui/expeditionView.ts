// 원정 화면 (GDD 1장, 2-1, 6장): 12칸 원형 길, 캐릭터 자동 이동, 타일 배치, 둥지 칸에서 귀환 선택.
// 시간(칸당 5초, 1x/2x/4x)은 여기서 돌리고, 규칙은 engine/expedition 이 정한다.
import { BALANCE } from '../config/balance';
import { getTile, tileName } from '../data/tiles';
import { traitName } from '../data/traits';
import {
  advance, chooseContinue, chooseReturn, drainEvents, finishRest, placeTile, riskBonus, type ExpeditionState, type PendingBattle,
  type StepEvent,
} from '../engine/expedition';
import type { FactionConfig } from '../engine/faction';
import { barOf, el, mountScreen, pct, rowOf } from './dom';
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
        later((EX.secondsPerTile * 1000 * BALANCE.provisional.expedition.restTimeTiles) / speed, () => {
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

  function render(): void {
    const hungerFill = el('i');
    hungerFill.style.width = pct(exp.hunger, BALANCE.provisional.expedition.hungerMax);
    const condFill = el('i');
    condFill.style.width = pct(exp.condition, BALANCE.provisional.expedition.conditionMax);
    const spike = exp.lap >= BALANCE.provisional.expedition.hungerSpikeLap;
    const riskFill = el('i');
    riskFill.style.width = pct(exp.risk, BALANCE.provisional.risk.limit);
    const equipped = exp.build.slots.map((id) => (id ? traitName(id, faction.id) : '—')).join(' / ');

    const top = rowOf(
      el('b', '', `${exp.lap} / ${exp.maxLaps}바퀴`),
      el('span', 'dim', `기본 ${EX.defaultLaps}바퀴 · 전투 ${exp.battlesByLap[exp.lap - 1] ?? 0}회`),
    );
    const hunger = rowOf(el('span', '', '허기'), el('span', spike ? 'warn' : 'dim', spike ? '급상승 중! 귀환을 서두르자' : `${Math.round(exp.hunger)}`));

    // 원형 길
    const ring = el('div', 'ring');
    const pos = (i: number, radius: number) => {
      const a = ((-90 + (360 / EX.loopTiles) * i) * Math.PI) / 180;
      return { x: 50 + radius * Math.cos(a), y: 50 + radius * Math.sin(a) };
    };
    for (let i = 0; i < EX.loopTiles; i++) {
      const c = pos(i, 36);
      const cell = el('div', `rcell${i === 0 ? ' nest' : ''}${i < exp.pos ? ' past' : ''}`, i === 0 ? faction.nestName : String(i));
      cell.style.left = `${c.x}%`;
      cell.style.top = `${c.y}%`;
      ring.append(cell);
      if (i === 0) continue;
      const s = pos(i, 46.5);
      const id = exp.slots[i];
      const canPlace = !id && selected !== null && (exp.phase === 'moving' || exp.phase === 'nest-choice') && i > exp.pos;
      const slot = el('button', `slot${id ? ` has ${getTile(id).kind}` : ''}${canPlace ? ' can' : ''}`, id ? [...tn(id)][0]! : '＋');
      slot.style.left = `${s.x}%`;
      slot.style.top = `${s.y}%`;
      slot.title = id ? `${tn(id)} — ${tileHint(getTile(id))}` : '빈 슬롯';
      slot.onclick = () => {
        if (id) {
          msg = `${tn(id)}: ${tileHint(getTile(id))}`;
        } else if (selected) {
          const r = placeTile(exp, selected, i);
          msg = r.ok ? `${tn(selected)}을(를) ${i}번 칸에 놓았다` : r.reason;
          if (r.ok) h.onSave();
          if (r.ok && !exp.hand.includes(selected)) selected = null;
        } else msg = '아래 보유 타일을 먼저 고른다';
        render();
      };
      ring.append(slot);
    }
    const me = pos(exp.pos, 36);
    const walker = el('div', 'walker', '●');
    walker.style.left = `${me.x}%`;
    walker.style.top = `${me.y}%`;
    ring.append(walker);

    // 보유 타일(손)
    const hand = el('div', 'hand');
    if (exp.hand.length === 0) hand.append(el('span', 'dim', '획득한 타일이 없다 (전투 승리·바퀴 완주로 얻는다)'));
    for (const id of new Set(exp.hand)) {
      const n = exp.hand.filter((x) => x === id).length;
      const b = el('button', `chip-btn${selected === id ? ' on' : ''}`, `${tn(id)} ×${n}`);
      b.onclick = () => {
        selected = selected === id ? null : id;
        msg = selected ? `${tn(id)}: ${tileHint(getTile(id))}. 빈 슬롯(＋)을 눌러 놓는다` : '';
        render();
      };
      hand.append(b);
    }

    // 속도·일시정지
    const speeds = el('div', 'speeds');
    for (const sp of SPEEDS) {
      const b = el('button', `small${speed === sp ? ' on' : ''}`, `${sp}x`);
      b.onclick = () => {
        speed = sp;
        h.onSave();
        schedule();
        render();
      };
      speeds.append(b);
    }
    const pause = el('button', `small${paused ? ' on' : ''}`, paused ? '▶ 재개' : '❚❚');
    pause.onclick = () => {
      paused = !paused;
      schedule();
      render();
    };
    speeds.append(pause);
    const helpBtn = el('button', 'small', '?');
    helpBtn.setAttribute('aria-label', '도움말');
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
    speeds.append(helpBtn);

    const nodes: HTMLElement[] = [
      top,
      hunger,
      barOf('hunger', hungerFill),
      rowOf(el('span', '', '컨디션'), el('span', 'dim', `${Math.round(exp.condition)}${riskBonus(exp) > 0 ? ` · 공허 +${Math.round(riskBonus(exp) * 100)}%` : ''}`)),
      barOf('cond', condFill),
      rowOf(
        el('span', '', faction.riskGaugeName),
        el('span', exp.breakthrough ? 'warn' : 'dim', exp.breakthrough ? `한계 돌파! 공허 ↑ (${Math.round(exp.risk)})` : `${Math.round(exp.risk)} / ${BALANCE.provisional.risk.limit}`),
      ),
      barOf('risk', riskFill),
      el('div', 'mini', `${faction.slotName}: ${equipped}`),
      ring,
      el('div', 'msg', msg),
    ];
    if (exp.phase === 'nest-choice') {
      const ret = el('button', 'primary', '귀환');
      ret.onclick = () => {
        chooseReturn(exp);
        h.onEnded();
      };
      const more = el('button', '', `한 바퀴 더 (${exp.lap + 1}바퀴)`);
      more.onclick = () => {
        chooseContinue(exp);
        h.onSave();
        msg = `${exp.lap}바퀴째 출발`;
        render();
        schedule();
      };
      const choice = el('div', 'grid2');
      choice.append(ret, more);
      nodes.push(choice);
      if (exp.lap >= EX.defaultLaps) nodes.push(el('small', 'dim', `기본 ${EX.defaultLaps}바퀴를 넘겼다. 바퀴를 더 돌수록 보상도 위험도 커진다.`));
    }
    nodes.push(el('small', 'dim', '보유 타일 (고른 뒤 앞쪽 빈 슬롯에 놓는다. 한 번 놓으면 원정 동안 유지)'), hand, speeds);
    mountScreen(root, ...nodes);
  }

  render();
  schedule();
}
