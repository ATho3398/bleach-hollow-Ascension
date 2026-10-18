// 전투 화면 v2 (GDD 3-5 v0.8): 실시간 자동 전투 + 일자 8칸 스킬 블록 바. 원정과 연습이 같이 쓴다.
// 엔진 틱(0.1초)을 실시간 1x/2x 로 돌린다. 클릭(누른 뒤 0.3초 이내 떼기) = 블록 사용(붙은 같은 블록이 함께 발동해 체인),
// 드래그 = 놓은 칸에 끼워 넣어 순서 변경. 오래 누르면 사용되지 않는다. 클릭 판정은 여기(실시간)서, 엔진은 use/move 결과만 받는다.
// 텍스트는 FactionConfig·데이터에서 읽고 종족 id 로 분기하지 않는다.
import { lineageName } from '../data/lineages';
import { pickFaction } from '../data/schema';
import { traitName } from '../data/traits';
import {
  BASIC_SKILL_ID, blockEffect, drainCombatEvents, maxChain, runsOf, step, timeLeftSeconds,
  type Block, type CombatEvent, type CombatInput, type CombatState,
} from '../engine/combat';
import type { FactionConfig } from '../engine/faction';
import { barOf, el, mountScreen, pct, rowOf } from './dom';
import { battleLabels, type BattleLabels } from './labels';
import { classifyRelease, POINTER_RULES, releaseInput, slotAt } from './pointer';

export interface BattleViewOptions {
  /** 머리말: 원정이면 바퀴·칸·타일 정보 */
  banner?: string;
  /** 있으면 '그만두기' 버튼을 보인다 (원정 중에는 없다) */
  onQuit?: () => void;
  /** 전투가 끝나면(승·패) 한 번 불린다 */
  onEnd: (s: CombatState) => void;
}

/** 블록 이름: 스킬 블록은 특성 이름(기본 블록은 종족 기본 기술 이름), 필살·공허는 종족 표기 */
export function blockName(b: Block, labels: BattleLabels, factionId: string): string {
  if (b.kind === 'special') return labels.specialBlock;
  if (b.kind === 'void') return labels.voidBlock;
  return b.traitId === BASIC_SKILL_ID || !b.traitId ? labels.basicBlock : traitName(b.traitId, factionId);
}

/** 사건 한 줄 (전투 연출 텍스트) */
function eventText(e: CombatEvent, s: CombatState, labels: BattleLabels, factionId: string): string | null {
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
      return parts.join(' · ');
    }
    case 'heavy-cast':
      return `강공격 예고! ${e.seconds}초 안에 ${labels.role.guard} 블록으로 막아라`;
    case 'heavy-hit':
      return e.guarded ? `강공격을 막았다! ${n(e.damage)} 피해${e.reflected > 0 ? ` · ${n(e.reflected)} 반사` : ''}` : `강공격 적중! ${n(e.damage)} 피해`;
    case 'seal':
      return `봉인! ${e.seconds}초 동안 ${labels.skillBlock} 생성 정지`;
    case 'stance':
      return `방어 자세! ${e.seconds}초 동안 내 블록 피해 감소 · 블록을 쓰면 반격`;
    case 'stance-end':
      return '방어 자세가 풀렸다';
    case 'counter':
      return `반격! ${n(e.damage)} 피해${e.guarded ? ' (막기로 경감)' : ''}`;
    case 'shuffle':
      return '블록 바의 순서가 섞였다';
    case 'end':
      return e.status === 'won' ? `${pickFaction(s.enemy.def.name, factionId)}을(를) 쓰러뜨렸다!` : null;
    default:
      return null;
  }
}

export function battleView(root: HTMLElement, faction: FactionConfig, s: CombatState, opts: BattleViewOptions): void {
  const labels = battleLabels(faction);
  const p = s.params;
  const enemy = s.enemy.def;
  const enemyName = pickFaction(enemy.name, faction.id);
  const top = maxChain(p);

  const enemyHp = el('i');
  const playerHp = el('i');
  const spBar = el('i');
  const castBar = el('i');
  const enemyText = el('span');
  const playerText = el('span');
  const spText = el('span');
  const timeText = el('span', 'dim');
  const status = el('div', 'status');
  const castWrap = barOf('cast', castBar);
  const castText = el('div', 'casttext');
  const stage = el('div', 'stage');
  const lines: HTMLElement[] = [];

  const weakChip = el('span', 'chip weak', `약점 ${lineageName(enemy.weaknessLineageId, faction.id)}`);
  const head = el('div', 'row');
  head.append(el('b', '', `${enemyName}${enemy.class === 'elite' ? ' (강적)' : ''}`), weakChip);

  const cap = p.trayCapacity;
  const trayEl = el('div', 'tray');
  trayEl.style.gridTemplateColumns = `repeat(${cap}, 1fr)`;
  const cellEls = Array.from({ length: cap }, () => {
    const c = el('div', 'tcell');
    trayEl.append(c);
    return c;
  });
  // 붙은 같은 블록 위에 "체인N" 묶음 표시
  const runRow = el('div', 'runrow');
  runRow.style.gridTemplateColumns = `repeat(${cap}, 1fr)`;
  const holdNote = el('small', 'holdnote', '');

  let speed = 1;
  let paused = false;
  const speedBtn = el('button', 'small', '1x');
  speedBtn.onclick = () => {
    speed = speed === 1 ? 2 : 1;
    speedBtn.textContent = `${speed}x`;
  };
  const pauseBtn = el('button', 'small', '일시정지');
  pauseBtn.onclick = () => {
    paused = !paused;
    pauseBtn.textContent = paused ? '계속' : '일시정지';
    trayEl.classList.toggle('paused', paused);
  };
  const controls = el('div', 'speeds');
  controls.append(speedBtn, pauseBtn);
  let stopped = false;
  if (opts.onQuit) {
    const quit = el('button', 'small', '그만두기');
    quit.onclick = () => {
      stopped = true;
      opts.onQuit!();
    };
    controls.append(quit);
  }

  mountScreen(
    root,
    ...(opts.banner ? [el('div', 'banner', opts.banner)] : []),
    head,
    barOf('enemy', enemyHp),
    rowOf(el('span', 'dim', '적 체력'), enemyText),
    castWrap,
    castText,
    stage,
    barOf('player', playerHp),
    rowOf(el('span', 'dim', '내 체력'), playerText),
    status,
    barOf('sp', spBar),
    rowOf(el('span', 'dim', labels.sp), spText),
    runRow,
    trayEl,
    holdNote,
    el('small', 'dim', `클릭(${POINTER_RULES.clickMaxSeconds}초 안에 떼기) = 사용 · 오래 누르면 사용 안 됨 · 끌어서 순서 바꾸기 · 같은 블록을 붙이면 ${labels.chain}(최대 ${top})`),
    rowOf(controls, timeText),
  );

  const say = (text: string) => {
    const line = el('div', 'line', text);
    stage.prepend(line);
    lines.unshift(line);
    while (lines.length > 3) lines.pop()!.remove();
    lines.forEach((l, i) => (l.style.opacity = String(1 - i * 0.3)));
  };

  // ── 블록 바 그리기 ──
  /** 드래그 중인 블록: 누른 블록의 uid 로 추적한다 (그 사이 앞 블록이 쓰여 칸 번호가 바뀌어도 따라간다) */
  let drag: { uid: number; dx: number; dy: number; to: number } | null = null;
  const indexOfUid = (uid: number) => s.tray.findIndex((b) => b.uid === uid);
  const sig: string[] = [];
  const drawTray = () => {
    const runs = runsOf(s.tray);
    const dragFrom = drag ? indexOfUid(drag.uid) : -1;
    const inRun = new Map<number, string>();
    runRow.replaceChildren();
    for (const r of runs) {
      if (r.length < 2 || s.tray[r.start]!.kind !== 'skill') continue;
      for (let k = 0; k < r.length; k++) inRun.set(r.start + k, `run${k === 0 ? ' run-l' : ''}${k === r.length - 1 ? ' run-r' : ''}`);
      const tag = el('span', 'runtag', `${labels.chain}${Math.min(top, r.length)}${r.length > top ? ' (누른 곳 기준)' : ''}`);
      tag.style.gridColumn = `${r.start + 1} / span ${r.length}`;
      runRow.append(tag);
    }
    cellEls.forEach((c, i) => {
      const b = s.tray[i];
      const mark = drag && dragFrom >= 0 && i === Math.min(s.tray.length - 1, drag.to) && i !== dragFrom ? (i > dragFrom ? ' drop-after' : ' drop-before') : '';
      c.className = `tcell${b ? ' filled' : ''}${b ? (inRun.get(i) ? ` ${inRun.get(i)}` : '') : ''}${mark}`;
      const eff = b ? blockEffect(s, b) : null;
      const key = b ? `${b.uid}:${eff?.weak ? 1 : 0}` : '';
      if (sig[i] === key) return;
      sig[i] = key;
      c.replaceChildren();
      if (!b) return;
      const role = eff?.skill.role ?? null;
      const blk = el('div', `tblock ${b.kind === 'skill' ? `role-${role}` : b.kind}${eff?.weak ? ' weak' : ''}`);
      blk.dataset.uid = String(b.uid);
      blk.append(el('b', '', blockName(b, labels, faction.id)));
      if (b.kind === 'skill') blk.append(el('small', '', `${role ? labels.role[role] : ''}${eff?.weak ? '·약점' : ''}`));
      else if (b.kind === 'void') blk.append(el('small', '', `${labels.riskGauge}↑`));
      c.append(blk);
    });
    // 누르고 있는 블록이 손가락을 따라다닌다 (다시 그려도 유지)
    trayEl.querySelectorAll<HTMLElement>('.tblock.dragging').forEach((x) => {
      if (!drag || x.dataset.uid !== String(drag.uid)) {
        x.classList.remove('dragging');
        x.style.transform = '';
        x.style.pointerEvents = '';
      }
    });
    if (drag) {
      const d = trayEl.querySelector<HTMLElement>(`.tblock[data-uid="${drag.uid}"]`);
      if (d) {
        d.style.transform = `translate(${drag.dx}px, ${drag.dy}px) scale(1.08)`;
        d.style.pointerEvents = 'none';
        d.classList.add('dragging');
      }
    }
  };

  const drawHud = () => {
    enemyHp.style.width = pct(s.enemy.hp, s.enemy.maxHp);
    playerHp.style.width = pct(s.player.hp, s.player.maxHp);
    spBar.style.width = pct(s.sp, p.spMax);
    enemyText.textContent = `${Math.ceil(s.enemy.hp - 1e-6)} / ${Math.round(s.enemy.maxHp)}`;
    playerText.textContent = `${Math.ceil(s.player.hp - 1e-6)} / ${s.player.maxHp}`;
    spText.textContent = `${Math.round(s.sp)} / ${p.spMax}${s.sp >= p.spMax ? ` — ${labels.specialBlock} 대기 (빈 칸 필요)` : ''}`;
    timeText.textContent = `남은 시간 ${Math.ceil(timeLeftSeconds(s))}초`;
    const cast = s.enemy.cast;
    castWrap.style.visibility = cast ? 'visible' : 'hidden';
    castBar.style.width = cast ? pct(cast.total - cast.ticks, cast.total) : '0%';
    castText.textContent = cast ? `강공격 시전 중 ${(cast.ticks * p.tickSeconds).toFixed(1)}초 — ${labels.role.guard} 블록!` : '';
    const chips: string[] = [];
    if (s.guard.ticks > 0) chips.push(`${labels.role.guard} ${(s.guard.ticks * p.tickSeconds).toFixed(1)}초`);
    if (s.enemy.stance) chips.push(`적 방어 자세 ${(s.enemy.stance.ticks * p.tickSeconds).toFixed(1)}초 (블록 피해 감소·반격)`);
    if (s.sealTicks > 0) chips.push(`봉인 ${(s.sealTicks * p.tickSeconds).toFixed(1)}초`);
    if (s.voidUsed > 0) chips.push(`${labels.voidBlock} ${s.voidUsed}회`);
    if (s.chain3Count > 0) chips.push(`${labels.chain}${top} ${s.chain3Count}회`);
    status.textContent = chips.join(' · ');
    trayEl.classList.toggle('sealed', s.sealTicks > 0);
  };

  // ── 입력: 포인터 이벤트(터치·마우스 공통). 판정은 pointer.ts, 시각은 performance.now(실시간)이라 배속·일시정지와 무관 ──
  const queue: CombatInput[] = [];
  let down: { uid: number; x: number; y: number; id: number; at: number; maxMoved: number; holdTimer: number } | null = null;
  const barRect = () => trayEl.getBoundingClientRect();
  const slotOf = (x: number) => {
    const r = barRect();
    const inner = trayEl.clientWidth;
    const pad = (r.width - inner) / 2;
    return slotAt(x, r.left + pad, inner, cap);
  };
  const endPress = () => {
    if (down) window.clearTimeout(down.holdTimer);
    down = null;
    drag = null;
    trayEl.classList.remove('held');
    holdNote.textContent = '';
    drawTray();
  };
  trayEl.addEventListener('pointerdown', (e) => {
    if (down || s.status !== 'playing') return;
    const i = slotOf(e.clientX);
    const b = s.tray[i];
    if (!b) return;
    trayEl.setPointerCapture(e.pointerId);
    const holdTimer = window.setTimeout(() => {
      // 제한 시간을 넘겼다: 놓아도 사용되지 않는다는 것을 보여 준다 (드래그 중이면 상관없다)
      if (down && down.maxMoved < POINTER_RULES.dragThresholdPx) {
        trayEl.classList.add('held');
        holdNote.textContent = '오래 눌러서 사용되지 않아요 — 그냥 놓으면 제자리';
      }
    }, POINTER_RULES.clickMaxSeconds * 1000);
    down = { uid: b.uid, x: e.clientX, y: e.clientY, id: e.pointerId, at: performance.now(), maxMoved: 0, holdTimer };
    drawTray();
  });
  trayEl.addEventListener('pointermove', (e) => {
    if (!down || e.pointerId !== down.id) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    down.maxMoved = Math.max(down.maxMoved, Math.hypot(dx, dy));
    if (down.maxMoved >= POINTER_RULES.dragThresholdPx) {
      trayEl.classList.remove('held');
      holdNote.textContent = '';
      drag = { uid: down.uid, dx, dy, to: slotOf(e.clientX) };
      drawTray();
    }
  });
  trayEl.addEventListener('pointercancel', endPress);
  trayEl.addEventListener('pointerup', (e) => {
    if (!down || e.pointerId !== down.id) return;
    const from = indexOfUid(down.uid); // 누르는 사이 앞 블록이 쓰여 번호가 바뀌었을 수 있다. 블록이 사라졌으면 -1
    const kind = classifyRelease(performance.now() - down.at, down.maxMoved);
    if (from >= 0 && s.status === 'playing' && !paused) {
      const input = releaseInput(kind, from, slotOf(e.clientX), s.tray.length);
      if (input) queue.push(input);
    }
    endPress();
  });

  // ── 실시간 루프: 화면 프레임마다 쌓인 시간만큼 엔진 틱을 돌린다 (1x/2x) ──
  const tickMs = p.tickSeconds * 1000;
  let acc = 0;
  let last = performance.now();
  const frame = (now: number) => {
    if (stopped) return;
    const dt = Math.min(250, now - last);
    last = now;
    if (!paused && s.status === 'playing') {
      acc += dt * speed;
      let n = 0;
      while (acc >= tickMs && s.status === 'playing' && n++ < 40) {
        acc -= tickMs;
        step(s, queue.splice(0, queue.length));
      }
    } else if (paused) queue.length = 0;
    for (const ev of drainCombatEvents(s)) {
      const t = eventText(ev, s, labels, faction.id);
      if (t) say(t);
    }
    drawHud();
    drawTray();
    if (s.status !== 'playing') {
      stopped = true;
      if (s.status === 'lost') say(s.lossReason === 'timeout' ? '시간 제한을 넘겼다…' : `${labels.defeatState}…`);
      setTimeout(() => opts.onEnd(s), 900);
      return;
    }
    requestAnimationFrame(frame);
  };
  drawHud();
  drawTray();
  say(`${enemyName}과(와) 조우! 블록을 눌러 쓰고, 같은 블록을 붙여 놓으면 함께 발동해 ${labels.chain}이 된다`);
  requestAnimationFrame(frame);
}
