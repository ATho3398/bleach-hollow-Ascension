// 전투 화면 (P1 화면을 원정에서도 쓰도록 분리). 텍스트는 FactionConfig 에서 읽는다.
import { pickFaction } from '../data/schema';
import {
  playerSwap, useSkill, hudOf, isAdjacent, spiritCap,
  type ActionResult, type BattleState, type Cell, type Hud,
} from '../engine/battle';
import type { FactionConfig } from '../engine/faction';
import { barOf, el, mountScreen, pct, rowOf, sleep } from './dom';
import { battleLabels } from './labels';

export interface BattleViewOptions {
  /** 머리말: 원정이면 바퀴·칸·타일 정보 */
  banner?: string;
  /** 있으면 '그만두기' 버튼을 보인다 (원정 중에는 없다) */
  onQuit?: () => void;
  /** 전투가 끝나면(승·패) 한 번 불린다 */
  onEnd: (s: BattleState) => void;
}

/** 전투 화면: 이미 만들어진 전투 상태를 받아 플레이하게 하고, 끝나면 onEnd. 원정과 연습이 같이 쓴다 */
export function battleView(root: HTMLElement, faction: FactionConfig, s: BattleState, opts: BattleViewOptions): void {
  const mount = (...nodes: HTMLElement[]) => mountScreen(root, ...nodes);
  const labels = battleLabels(faction);
  const enemy = s.enemy.def;
  const enemyName = pickFaction(enemy.name, faction.id);

  const enemyHp = el('i');
  const playerHp = el('i');
  const skillBar = el('i');
  const enemyText = el('span');
  const playerText = el('span');
  const skillText = el('span');
  const extraText = el('span', 'dim');
  const msg = el('div', 'msg', '타일을 밀거나 눌러서 인접한 타일과 바꾼다');
  const skillBtn = el('button', 'primary', labels.skillButton);
  const boardEl = el('div', 'board');
  const cells: HTMLElement[][] = [];
  for (let r = 0; r < s.board.length; r++) {
    const row: HTMLElement[] = [];
    for (let c = 0; c < s.board.length; c++) {
      const t = el('div', 'tile');
      t.dataset.r = String(r);
      t.dataset.c = String(c);
      boardEl.append(t);
      row.push(t);
    }
    cells.push(row);
  }
  const weakChip = el('span', 'chip');
  const dot = el('b');
  dot.style.background = `var(--${enemy.weakness})`;
  weakChip.append(dot, `약점 ${labels.tile[enemy.weakness]}`);

  const bar = barOf;
  const head = el('div', 'row');
  head.append(el('b', '', enemyName), weakChip);
  const quit = el('button', '', '그만두기');
  if (opts.onQuit) quit.onclick = opts.onQuit;
  mount(
    ...(opts.banner ? [el('div', 'banner', opts.banner)] : []),
    head,
    bar('enemy', enemyHp),
    rowOf(el('span', 'dim', '적 체력'), enemyText),
    boardEl,
    msg,
    bar('player', playerHp),
    rowOf(el('span', 'dim', '내 체력'), playerText),
    bar('skill', skillBar),
    rowOf(el('span', 'dim', labels.skillGauge), skillText),
    rowOf(skillBtn, extraText),
    ...(opts.onQuit ? [quit] : []),
  );

  const draw = (board = s.board, clearing: Cell[] = []) => {
    const clr = new Set(clearing.map((p) => p.r * 100 + p.c));
    for (let r = 0; r < board.length; r++) {
      for (let c = 0; c < board.length; c++) {
        const role = board[r]![c]!;
        const t = cells[r]![c]!;
        t.className = `tile ${role}${clr.has(r * 100 + c) ? ' clearing' : ''}`;
        t.textContent = labels.tileShort[role];
      }
    }
  };
  const drawHud = (h: Hud) => {
    enemyHp.style.width = pct(h.enemyHp, h.enemyMaxHp);
    playerHp.style.width = pct(h.playerHp, h.playerMaxHp);
    skillBar.style.width = pct(h.spiritMatches, spiritCap(s.params));
    enemyText.textContent = `${Math.ceil(h.enemyHp - 1e-6)} / ${Math.round(h.enemyMaxHp)}`;
    playerText.textContent = `${Math.ceil(h.playerHp)} / ${h.playerMaxHp}` + (h.shield > 0 ? ` (실드 ${Math.round(h.shield)})` : '');
    skillText.textContent = `${h.spiritMatches.toFixed(1)} / ${spiritCap(s.params)} (기술 1회 ${s.params.spiritMatchesPerSkill})`;
    extraText.textContent = `적 공격 ${h.enemyAttackIn}턴 후 · ${labels.riskGauge} +${h.riskGained} · ${h.turns}턴`;
    skillBtn.disabled = busy || !h.skillReady;
  };

  let busy = false;
  let selected: Cell | null = null;
  const setSel = (p: Cell | null) => {
    if (selected) cells[selected.r]![selected.c]!.classList.remove('sel');
    selected = p;
    if (p) cells[p.r]![p.c]!.classList.add('sel');
  };

  const play = async (res: ActionResult, from: Cell[]) => {
    if (!res.accepted) {
      msg.textContent = '교환해도 매치가 없다';
      for (const p of from) cells[p.r]![p.c]!.classList.add('bad');
      await sleep(260);
      draw();
      return;
    }
    for (const ph of res.phases) {
      if (ph.kind === 'enemy') { msg.textContent = '적의 턴'; await sleep(350); }
      for (const st of ph.steps) {
        draw(st.before, st.cleared);
        if (st.specials.length > 0) msg.textContent = st.specials.some((x) => x.kind === 'colorClear') ? '색 전체 제거!' : '줄 폭발!';
        else if (st.chain > 1) msg.textContent = `${st.chain}연쇄!`;
        await sleep(300);
        draw(st.after);
        await sleep(160);
      }
      const note: string[] = [];
      if (ph.damageDealt > 0) note.push(`${ph.kind === 'skill' ? labels.skillButton : '공격'} ${Math.round(ph.damageDealt)} 피해${ph.weakHit ? ' (약점!)' : ''}`);
      if (ph.shieldGained > 0) note.push(`${labels.tile.shield} +${Math.round(ph.shieldGained)}`);
      if (ph.attacked) note.push(`적 공격 ${Math.round(ph.damageTaken + ph.blocked)}${ph.blocked > 0 ? ` (${Math.round(ph.blocked)} 막음)` : ''}`);
      if (note.length > 0) msg.textContent = note.join(' · ');
      drawHud(ph.hud);
      await sleep(250);
    }
    if (res.reshuffled) { msg.textContent = '움직일 수 있는 수가 없어 보드를 새로 섞었다'; draw(); }
  };

  const finish = async () => {
    busy = true;
    await sleep(500);
    opts.onEnd(s);
  };

  const act = async (fn: () => ActionResult, from: Cell[]) => {
    if (busy || s.status !== 'playing') return;
    busy = true;
    setSel(null);
    await play(fn(), from);
    busy = false;
    drawHud(hudOf(s));
    if (s.status !== 'playing') await finish();
  };
  const trySwap = (a: Cell, b: Cell) => act(() => playerSwap(s, a, b), [a, b]);

  skillBtn.onclick = () => act(() => useSkill(s), []);

  let down: { p: Cell; x: number; y: number } | null = null;
  const cellOf = (e: PointerEvent): Cell | null => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('.tile');
    return t ? { r: Number(t.dataset.r), c: Number(t.dataset.c) } : null;
  };
  boardEl.addEventListener('pointerdown', (e) => {
    const p = cellOf(e);
    down = p && !busy ? { p, x: e.clientX, y: e.clientY } : null;
  });
  boardEl.addEventListener('pointercancel', () => { down = null; });
  boardEl.addEventListener('pointerup', (e) => {
    if (!down || busy) return;
    const { p, x, y } = down;
    down = null;
    const dx = e.clientX - x;
    const dy = e.clientY - y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 20) {
      const to: Cell = Math.abs(dx) > Math.abs(dy) ? { r: p.r, c: p.c + Math.sign(dx) } : { r: p.r + Math.sign(dy), c: p.c };
      void trySwap(p, to);
    } else if (selected && isAdjacent(selected, p)) {
      void trySwap(selected, p);
    } else {
      setSel(selected && selected.r === p.r && selected.c === p.c ? null : p);
    }
  });

  draw();
  drawHud(hudOf(s));
}
