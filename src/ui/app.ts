// 화면: 종족 선택 → 메뉴(적 고르기) → 전투 → 결과. DOM/CSS 만 쓴다.
// 화면 텍스트는 FactionConfig 에서 읽고, 종족 id 로 분기하지 않는다.
import { ENEMIES } from '../data/enemies';
import { FACTIONS, getFaction } from '../data/factions';
import { pickFaction, type EnemyDef } from '../data/schema';
import {
  buildBattleRecord, createBattle, findMoves, playerSwap, useSkill, hudOf, isAdjacent,
  type ActionResult, type BattleState, type Cell, type Hud,
} from '../engine/battle';
import { TILE_ROLES, type FactionConfig } from '../engine/faction';
import { loadSave, newSaveData, recordBattle, writeSave, type SaveData } from '../game';
import { versionLabel } from '../version';
import { battleLabels } from './labels';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const pct = (v: number, max: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export function startApp(root: HTMLElement): void {
  let save: SaveData | null = loadSave(localStorage);

  const mount = (...nodes: HTMLElement[]) => {
    const screen = el('div', 'screen');
    screen.append(...nodes);
    root.replaceChildren(screen);
  };
  const persist = () => save && writeSave(localStorage, save);

  function factionScreen(): void {
    const buttons = FACTIONS.map((f) => {
      const b = el('button', 'primary', f.name);
      b.onclick = () => {
        if (save) save.factionId = f.id;
        else save = newSaveData(f.id);
        persist();
        menuScreen();
      };
      return b;
    });
    mount(
      el('h1', '', '블리치 할로우 어센션'),
      el('p', 'dim', '어느 쪽으로 시작할까? (두 종족 모두 처음부터 개방)'),
      el('div', 'stack'),
      el('small', 'dim', versionLabel()),
    );
    root.querySelector('.stack')!.append(...buttons);
  }

  function menuScreen(): void {
    if (!save) return factionScreen();
    const faction = getFaction(save.factionId);
    const labels = battleLabels(faction);
    const list = el('div', 'stack');
    for (const enemy of ENEMIES) {
      const name = pickFaction(enemy.name, faction.id);
      const b = el('button', '', `${name} (${enemy.class === 'elite' ? '강적' : '일반'}) — 약점 ${labels.tile[enemy.weakness]}`);
      b.onclick = () => battleScreen(faction, enemy, Math.floor(Math.random() * 2 ** 32));
      list.append(b);
    }
    const change = el('button', '', '종족 바꾸기');
    change.onclick = factionScreen;
    mount(
      el('h1', '', `${labels.factionName} · 전투 테스트`),
      el('p', 'dim', `사냥터: ${labels.huntingGround}. 상대를 고르면 전투를 시작한다. 전투 기록 ${save.runLog.battles.length}판 저장됨.`),
      list,
      change,
      el('small', 'dim', versionLabel()),
    );
  }

  function battleScreen(faction: FactionConfig, enemy: EnemyDef, seed: number): void {
    const labels = battleLabels(faction);
    const s: BattleState = createBattle({ seed, enemy });
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

    const bar = (cls: string, fill: HTMLElement) => { const b = el('div', `bar ${cls}`); b.append(fill); return b; };
    const head = el('div', 'row');
    head.append(el('b', '', enemyName), weakChip);
    const rowOf = (...n: HTMLElement[]) => { const r = el('div', 'row'); r.append(...n); return r; };
    const quit = el('button', '', '그만두기');
    quit.onclick = menuScreen;
    mount(
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
      quit,
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
      skillBar.style.width = pct(Math.min(h.spiritMatches, s.params.spiritMatchesPerSkill), s.params.spiritMatchesPerSkill);
      enemyText.textContent = `${Math.ceil(h.enemyHp - 1e-6)} / ${Math.round(h.enemyMaxHp)}`;
      playerText.textContent = `${Math.ceil(h.playerHp)} / ${h.playerMaxHp}` + (h.shield > 0 ? ` (실드 ${Math.round(h.shield)})` : '');
      skillText.textContent = `${Math.min(h.spiritMatches, 99)} / ${s.params.spiritMatchesPerSkill}`;
      extraText.textContent = `${labels.riskGauge} +${h.riskGained} · ${labels.absorbGauge} ${h.absorbGained.toFixed(1)} · ${h.turns}턴`;
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
        if (ph.kind === 'enemy') note.push(`적 공격 ${Math.round(ph.damageTaken + ph.blocked)}${ph.blocked > 0 ? ` (${Math.round(ph.blocked)} 막음)` : ''}`);
        if (note.length > 0) msg.textContent = note.join(' · ');
        drawHud(ph.hud);
        await sleep(250);
      }
      if (res.reshuffled) { msg.textContent = '움직일 수 있는 수가 없어 보드를 새로 섞었다'; draw(); }
    };

    const finish = async () => {
      busy = true;
      await sleep(500);
      if (save) {
        recordBattle(save, buildBattleRecord(s, { factionId: faction.id }));
        persist();
      }
      resultScreen(faction, enemy, s);
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

  function resultScreen(faction: FactionConfig, enemy: EnemyDef, s: BattleState): void {
    const labels = battleLabels(faction);
    const won = s.status === 'won';
    const rows = TILE_ROLES.map((r) => `<tr><td>${labels.tile[r]} 매칭</td><td>${s.matchesByRole[r]}회</td></tr>`).join('');
    const detail = el('div');
    detail.innerHTML = `<table>
      <tr><td>턴 수</td><td>${s.turns}턴</td></tr>${rows}
      <tr><td>${labels.riskGauge} 상승(기록)</td><td>+${s.riskGained}</td></tr>
      <tr><td>${labels.absorbGauge}(기록)</td><td>${s.absorbGained.toFixed(1)}</td></tr>
      <tr><td>쓴 기술</td><td>${s.skillsUsed.length}회</td></tr></table>`;
    const again = el('button', 'primary', '같은 상대와 다시');
    again.onclick = () => battleScreen(faction, enemy, Math.floor(Math.random() * 2 ** 32));
    const menu = el('button', '', '메뉴로');
    menu.onclick = menuScreen;
    mount(
      el('div', `result-title ${won ? 'win' : 'lose'}`, won ? '승리' : labels.defeatState),
      el('p', 'dim', won ? `${pickFaction(enemy.name, faction.id)}을(를) 쓰러뜨렸다. (흡수 판정은 P3)` : s.lossReason === 'timeout' ? '턴 한도를 넘겼다.' : '체력이 다했다.'),
      detail,
      el('small', 'dim', `시드 ${s.seed} · 기록이 런 로그에 저장됨`),
      again,
      menu,
    );
  }

  if (save) menuScreen();
  else factionScreen();
}
