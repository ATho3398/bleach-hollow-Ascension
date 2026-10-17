// 전투 화면 v2 (GDD 3-5): 실시간 자동 전투 + 스킬 블록 트레이. 원정과 연습이 같이 쓴다.
// 엔진 틱(0.1초)을 실시간 1x/2x 로 돌린다. 탭 = 블록 사용, 드래그 = 이동(빈 칸/이웃과 맞바꿈), 같은 블록 위에 놓기 = 합치기(체인 +1).
// 텍스트는 FactionConfig·데이터에서 읽고 종족 id 로 분기하지 않는다.
import { lineageName } from '../data/lineages';
import { pickFaction } from '../data/schema';
import { traitName } from '../data/traits';
import {
  BASIC_SKILL_ID, blockEffect, canMerge, canMove, drainCombatEvents, maxChain, mergePairs, step, timeLeftSeconds,
  type Block, type CombatEvent, type CombatInput, type CombatState,
} from '../engine/combat';
import type { FactionConfig } from '../engine/faction';
import { barOf, el, mountScreen, pct, rowOf } from './dom';
import { battleLabels, type BattleLabels } from './labels';

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
    case 'merge':
      return `${labels.chain}${e.chain}!`;
    case 'shuffle':
      return '트레이가 섞였다';
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

  const trayEl = el('div', 'tray');
  trayEl.style.gridTemplateColumns = `repeat(${p.trayCols}, 1fr)`;
  const cellEls = s.tray.map((_, i) => {
    const c = el('div', 'tcell');
    c.dataset.i = String(i);
    trayEl.append(c);
    return c;
  });

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
    trayEl,
    el('small', 'dim', `탭 = 사용 · 드래그 = 옮기기 · 같은 블록 위에 놓기 = ${labels.chain} +1 (최대 ${top})`),
    rowOf(controls, timeText),
  );

  const say = (text: string) => {
    const line = el('div', 'line', text);
    stage.prepend(line);
    lines.unshift(line);
    while (lines.length > 3) lines.pop()!.remove();
    lines.forEach((l, i) => (l.style.opacity = String(1 - i * 0.3)));
  };

  // ── 트레이 그리기 ──
  let dragFrom: number | null = null;
  const sig: string[] = [];
  const drawTray = () => {
    const pairs = mergePairs(s.tray, p.trayCols, top);
    const mergeable = new Set(pairs.flat());
    s.tray.forEach((b, i) => {
      const c = cellEls[i]!;
      const targets = dragFrom !== null && dragFrom !== i;
      const canM = targets && canMerge(s.tray, dragFrom!, i, p.trayCols, top);
      const canMv = targets && !canM && canMove(s.tray, dragFrom!, i, p.trayCols);
      c.className = `tcell${canM ? ' merge-target' : canMv ? ' move-target' : ''}${dragFrom === null && mergeable.has(i) ? ' can-merge' : ''}`;
      const eff = b ? blockEffect(s, b) : null;
      const key = b ? `${b.uid}:${b.chain}:${eff?.weak ? 1 : 0}` : '';
      if (sig[i] === key) return;
      sig[i] = key;
      c.replaceChildren();
      if (!b) return;
      const role = eff?.skill.role ?? null;
      const blk = el('div', `tblock ${b.kind === 'skill' ? `role-${role}` : b.kind}${eff?.weak ? ' weak' : ''}`);
      blk.append(el('b', '', blockName(b, labels, faction.id)));
      if (b.kind === 'skill') {
        blk.append(el('small', '', `${role ? labels.role[role] : ''}${eff?.weak ? ' · 약점' : ''}`));
        blk.append(el('span', 'pips', '●'.repeat(b.chain) + '○'.repeat(top - b.chain)));
      } else if (b.kind === 'void') blk.append(el('small', '', `큰 피해 · ${labels.riskGauge} ↑`));
      else blk.append(el('small', '', '큰 피해'));
      c.append(blk);
    });
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
    if (s.sealTicks > 0) chips.push(`봉인 ${(s.sealTicks * p.tickSeconds).toFixed(1)}초`);
    if (s.voidUsed > 0) chips.push(`${labels.voidBlock} ${s.voidUsed}회`);
    if (s.chain3Count > 0) chips.push(`${labels.chain}${top} ${s.chain3Count}회`);
    status.textContent = chips.join(' · ');
    trayEl.classList.toggle('sealed', s.sealTicks > 0);
  };

  // ── 입력: 탭 = 사용, 드래그 = 이동/합치기 (터치·마우스 모두 pointer 이벤트) ──
  const queue: CombatInput[] = [];
  let down: { i: number; x: number; y: number; id: number; moved: boolean } | null = null;
  const cellAt = (x: number, y: number): number | null => {
    const t = document.elementFromPoint(x, y)?.closest<HTMLElement>('.tcell');
    return t?.dataset.i !== undefined ? Number(t.dataset.i) : null;
  };
  const dragged = () => (down ? cellEls[down.i]!.querySelector<HTMLElement>('.tblock') : null);
  const resetDrag = () => {
    const d = dragged();
    if (d) {
      d.style.transform = '';
      d.style.pointerEvents = '';
      d.classList.remove('dragging');
    }
    down = null;
    dragFrom = null;
    drawTray();
  };
  trayEl.addEventListener('pointerdown', (e) => {
    const i = cellAt(e.clientX, e.clientY);
    if (i === null || !s.tray[i] || s.status !== 'playing') return;
    down = { i, x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
    trayEl.setPointerCapture(e.pointerId);
  });
  trayEl.addEventListener('pointermove', (e) => {
    if (!down || e.pointerId !== down.id) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    if (!down.moved && Math.hypot(dx, dy) > 10) {
      down.moved = true;
      dragFrom = down.i;
      sig.length = 0;
      drawTray();
    }
    if (down.moved) {
      const d = dragged();
      if (d) {
        d.style.transform = `translate(${dx}px, ${dy}px) scale(1.05)`;
        d.style.pointerEvents = 'none';
        d.classList.add('dragging');
      }
    }
  });
  trayEl.addEventListener('pointercancel', resetDrag);
  trayEl.addEventListener('pointerup', (e) => {
    if (!down || e.pointerId !== down.id) return;
    const from = down.i;
    if (!down.moved) queue.push({ type: 'use', cell: from });
    else {
      const to = cellAt(e.clientX, e.clientY);
      if (to !== null && to !== from) {
        queue.push(canMerge(s.tray, from, to, p.trayCols, top) ? { type: 'merge', from, to } : { type: 'move', from, to });
      }
    }
    resetDrag();
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
  say(`${enemyName}과(와) 조우! 블록을 탭해 쓰고, 같은 블록끼리 붙여 ${labels.chain}을 올린다`);
  requestAnimationFrame(frame);
}
