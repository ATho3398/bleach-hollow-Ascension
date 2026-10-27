// 해방 수련 화면 (GDD 22-4·22-5): 둥지 방 수련장 → 수련 화면(수련치·수련권·4종목 카드) → 미니게임 한 판 → 결과.
// 규칙·시간은 engine/training 이 정하고, 화면은 상태를 그리기만 한다. 문구·종목 이름은 종족 설정 training 에서 읽는다 (종족 id 분기 없음).
// 조작은 한 손가락: 화면 버튼 / 칸 누르기, PC 는 방향키·스페이스(숫자 1~9 = 먹이사슬 칸).
import { fullnessDeltaText } from './bha/fullness';
import { BALANCE } from '../config/balance';
import type { FactionConfig } from '../engine/faction';
import {
  clashZone, createMiniGame, DODGE_PLAYER_X, DUEL_DIRS, gameRule, stepMiniGame, TRAINING_GAMES, trainingGate, trainingLevel, trainingRiskWarning,
  type DuelDir, type MiniGameInput, type MiniGameState, type TrainingGameId, type TrainingOutcome,
} from '../engine/training';
import type { SaveData } from '../game';
import { STAT_IDS, type StatId } from '../data/schema';
import { statName } from '../data/elements';
import { button, el, icon, meter, mountApp, notice, panel, provisionalTag, tag } from './bha/dom';
import type { Device } from './bha/device';
import { lcdHead, lcdPage, selectLast } from './bha/lcdpage';
import { viewTitle } from './bha/viewtitle';

const TX = BALANCE.provisional.training;
const LB = BALANCE.provisional.liberation;

/** 제단(수련) 화면 진입 문구: 5단계 미만이면 "<5단계 이름>이(가) 되면 열린다" */
export function trainingLockedText(f: Pick<FactionConfig, 'tierNames' | 'training'>): string {
  const t5 = f.tierNames[LB.minTierIndex] ?? '5단계';
  return `${t5}${hasBatchim(t5) ? '이' : '가'} 되면 ${f.training.title}이 열린다.`;
}

function hasBatchim(word: string): boolean {
  const c = word.charCodeAt(word.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
}

/** "이름 +n / 이름 −n" (C.68: 컨디션만 하이픈 "-10" 으로 나와 배부름 "−15" 와 기호가 달랐다) */
export function signedText(name: string, delta: number): string {
  const d = Math.round(delta);
  return `${name} ${d < 0 ? '−' : '+'}${Math.abs(d)}`;
}

/** 한 판의 보상·비용 한 줄씩 (22-4 표) */
export function gameRuleLines(f: Pick<FactionConfig, 'riskGaugeName' | 'fullnessName'>, factionId: string, game: TrainingGameId): { reward: string; cost: string } {
  const r = gameRule(game);
  const evText = Object.entries(r.ev).filter(([k]) => (STAT_IDS as readonly string[]).includes(k)).map(([k, v]) => `${statName(k as StatId, factionId)} 노력치 +${v}`);
  const reward = [`수련치 +${r.points}`, ...evText, ...(r.winHunger ? [fullnessDeltaText(f.fullnessName, r.winHunger)] : [])].join(' · ');
  const cost = [r.condition ? signedText('컨디션', r.condition) : '', r.hunger ? fullnessDeltaText(f.fullnessName, r.hunger) : '', r.risk ? `${f.riskGaugeName} +${r.risk}` : ''].filter(Boolean).join(' · ') || '없음';
  return { reward, cost };
}

export interface TrainingHandlers {
  onPlay: (game: TrainingGameId) => void;
  /** 머리 제목 토글로 훈련 인형(전투 연습) · 번호 쟁탈전으로 (C.137 → GDD 98장 A1·99장 2) */
  onSwitch: (id: TrainingScreenId) => void;
}

/** 수련장 묶음의 세 화면: 수련(본능 수련) · 훈련 인형 · 번호 쟁탈전 */
export type TrainingScreenId = 'train' | 'practice' | 'rank';

/** 수련장 세 화면이 같이 쓰는 머리 제목 토글 (GDD 99장 2, C.163): 어느 화면에서든 나머지 둘로 바로 오간다. altarName = 방 물건 이름(수련장) */
export function trainingTitle(faction: FactionConfig, altarName: string, current: TrainingScreenId, onSwitch: (id: TrainingScreenId) => void): HTMLElement {
  return selectLast(viewTitle([
    { id: 'train', label: `${altarName} · ${faction.training.title}` },
    { id: 'practice', label: '훈련 인형' },
    { id: 'rank', label: faction.rankBattleName },
  ], current, (id) => onSwitch(id as TrainingScreenId)));
}

/** 제단 = 수련 화면: 왼쪽 수련치·수련권·안내, 오른쪽 4종목 카드 */
export function trainingView(dev: Device, faction: FactionConfig, save: SaveData, title: string, hd: TrainingHandlers): void {
  const t = save.training;
  const n = save.nest;
  const gate = trainingGate(t, save.evolution.tierIndex, n.condition);
  const head = lcdHead({
    // 진화 정보는 상태 화면 능력치 아래로 옮겼다 (C.137, GDD 85장 7)
    // 책장처럼 머리 제목이 토글: 누르면 훈련 인형(전투 연습) · 등급전(번호 쟁탈전) 이 열린다 (GDD 98장 A1). 수련권·컨디션 게이트와 무관
    title: trainingTitle(faction, title, 'train', hd.onSwitch),
    sub: (() => {
      const s = el('span');
      s.append(provisionalTag(), ' 수련을 마치면 전투의 ', el('b', '', faction.liberation.name), ' 고유 효과(능력치 상승)가 강해진다');
      return s;
    })(),
  });

  // 왼쪽: 수련치 막대(0/60), 수련권(최대 3), 상태 안내
  const prog = panel({ title: '수련', aside: t.completed ? tag('수련 완료', 'kind') : undefined });
  prog.dataset.training = 'progress';
  const pts = Math.min(t.points, TX.pointsToComplete);
  prog.append(meter({ kind: 'stab', label: '수련치', icon: 'i-stab', value: pts, max: TX.pointsToComplete, valueText: `${pts} / ${TX.pointsToComplete}`, full: t.completed }));
  const tickets = el('div', 'bha-train__tickets');
  tickets.setAttribute('aria-label', `수련권 ${t.tickets} / ${TX.ticketsMax}`);
  tickets.append(el('span', 'bha-train__ticketlabel', '수련권'));
  for (let i = 0; i < TX.ticketsMax; i++) tickets.append(el('i', i < t.tickets ? 'is-on' : ''));
  tickets.append(el('span', 'bha-num', `${t.tickets}/${TX.ticketsMax}`), el('span', 'bha-faint', '원정에서 돌아올 때마다 1장 (최대 3장, 한 판에 1장)'));
  prog.append(tickets);
  const notes: HTMLElement[] = [];
  if (!gate.ok && gate.reason === 'tier') notes.push(notice('info', trainingLockedText(faction), { icon: 'i-lock' }));
  else if (!gate.ok && gate.reason === 'tickets') notes.push(notice('info', '수련권이 없다. 원정에서 돌아오면 1장.', { icon: 'i-lock' }));
  else if (!gate.ok && gate.reason === 'condition') notes.push(notice('warn', `컨디션이 ${TX.minCondition} 미만이라 수련할 수 없다. ${faction.nestActions.sleep}(으)로 회복한다.`));
  if (gate.ok || gate.reason !== 'tier') {
    if (trainingRiskWarning(n.risk)) notes.push(notice('risk', `${faction.riskGaugeName}이(가) 한계 근처다 (${Math.round(n.risk)}). 리스크가 오르는 종목은 조심.`));
    if (t.completed) notes.push(notice('good', faction.training.completeText, { title: '수련 완료' }));
  }
  prog.append(...notes);
  const left = [prog];

  // 오른쪽: 4종목 카드
  const cards = el('div', 'bha-train__cards');
  for (const g of TRAINING_GAMES) {
    const cfg = faction.training.games[g];
    const lines = gameRuleLines(faction, faction.id, g);
    const level = trainingLevel(t, g);
    const card = el('button', 'bha-train__card');
    card.type = 'button';
    card.dataset.game = g;
    const top = el('span', 'bha-train__cardtop');
    top.append(el('b', 'bha-train__cardname', cfg.name), el('span', 'bha-chip', `${level}단계`));
    card.append(top, el('span', 'bha-train__line bha-train__line--reward', `승리: ${lines.reward}`), el('span', 'bha-train__line', `비용: ${lines.cost}`));
    card.setAttribute('aria-label', `${cfg.name} ${level}단계. 승리 ${lines.reward}. 비용 ${lines.cost}`);
    card.title = cfg.desc;
    if (!gate.ok) {
      card.disabled = true;
      card.classList.add('is-locked');
      card.prepend(icon('i-lock', 'sm'));
    } else card.onclick = () => hd.onPlay(g);
    cards.append(card);
  }
  const right = [cards, el('p', 'bha-faint', `패배해도 수련치 +${TX.lossPoints}, 비용은 그대로. 종목별 승리 ${TX.levelWins.slice(1).join('·')}번에서 난이도가 오른다.`)];
  lcdPage(dev.view, { cls: 'bha-train-page', cols: '0.9fr 1.1fr' }, head, left, right);
}

// ── 한 판 ──

export interface PlayHandlers {
  /** 한 판이 끝나고 [결과] 를 누르면 (won) */
  onDone: (won: boolean) => void;
}

const DIR_LABEL: Record<DuelDir, string> = { up: '위', mid: '정면', down: '아래' };
const DIR_ICON: Record<DuelDir, string> = { up: 'i-chevron-right', mid: 'i-chevron-right', down: 'i-chevron-right' };

/** 미니게임 한 판 (실시간). 끝나면 결과 줄과 [계속] 버튼 */
export function trainingPlayView(root: HTMLElement, faction: FactionConfig, game: TrainingGameId, level: number, seed: number, hd: PlayHandlers): { state: MiniGameState } {
  const cfg = faction.training.games[game];
  const s = createMiniGame(game, level, seed);
  const queue: MiniGameInput[] = [];
  let started = false;
  // "준비…" 동안 누른 것은 버린다 (C.68: 쌓였다가 시작 순간 한꺼번에 들어가 첫 판이 실패로 셌다)
  const push = (inp: MiniGameInput) => {
    if (s.status === 'playing' && started) queue.push(inp);
  };

  const head = el('header', 'bha-train__playhead');
  const hudLeft = el('div', 'bha-train__hud');
  const hudRight = el('div', 'bha-train__hud bha-train__hud--right');
  head.append(el('h1', 'bha-train__title', `${cfg.name} · ${level}단계`), hudLeft, hudRight);
  const field = el('div', `bha-train__field bha-train__field--${game}`);
  const help = el('p', 'bha-train__help', cfg.desc);
  const controls = el('div', 'bha-train__controls');
  const app = mountApp(root, { fixed: true, cls: `bha-train-play bha-train-play--${game}` }, head, field, help, controls);

  // ── 종목별 장면 ──
  let draw: () => void;
  if (s.kind === 'duel') {
    const foe = el('div', 'bha-train__foe');
    foe.append(el('span', 'bha-train__foename', faction.training.foe));
    const arrows = DUEL_DIRS.map((d) => {
      const a = el('div', `bha-train__lane bha-train__lane--${d}`);
      a.append(el('span', 'bha-train__lanemark', DIR_LABEL[d]));
      return a;
    });
    const lanes = el('div', 'bha-train__lanes');
    lanes.append(...arrows);
    field.append(lanes, foe);
    const btns = DUEL_DIRS.map((d) => {
      const b = button({ label: DIR_LABEL[d], icon: DIR_ICON[d], size: 'lg', onClick: () => push({ kind: 'duel', dir: d }) });
      b.classList.add('bha-train__btn', `bha-train__btn--${d}`);
      return b;
    });
    controls.append(...btns);
    draw = () => {
      if (s.kind !== 'duel') return;
      arrows.forEach((a, i) => {
        const d = DUEL_DIRS[i]!;
        a.classList.toggle('is-tele', s.phase === 'tele' && s.dir === d);
        a.classList.toggle('is-strike', s.phase === 'window' && s.dir === d);
        a.classList.toggle('is-hit', !!s.last && s.t - s.last.at < 0.45 && s.last.dir === d && s.last.ok);
        a.classList.toggle('is-miss', !!s.last && s.t - s.last.at < 0.45 && s.last.dir === d && !s.last.ok);
      });
      hudLeft.replaceChildren(el('span', 'bha-chip bha-chip--guard', `받아치기 ${s.hits}/${TX.duel.hits}`));
      hudRight.replaceChildren(el('span', 'bha-chip bha-chip--danger', `놓침 ${s.misses}/${TX.duel.misses}`));
    };
  } else if (s.kind === 'dodge') {
    const lanes = el('div', 'bha-train__lanes bha-train__lanes--two');
    const laneEls = [0, 1].map(() => el('div', 'bha-train__lane'));
    lanes.append(...laneEls);
    const me = el('div', 'bha-train__me');
    me.style.left = `${DODGE_PLAYER_X * 100}%`;
    field.append(lanes, me);
    const shotEls = new Map<number, HTMLElement>();
    const up = button({ label: '위로', size: 'lg', onClick: () => push({ kind: 'dodge', move: 'up' }) });
    const down = button({ label: '아래로', size: 'lg', onClick: () => push({ kind: 'dodge', move: 'down' }) });
    up.classList.add('bha-train__btn');
    down.classList.add('bha-train__btn');
    controls.append(up, down);
    draw = () => {
      if (s.kind !== 'dodge') return;
      me.style.top = s.lane === 0 ? '25%' : '75%';
      me.classList.toggle('is-hurt', !!s.last && s.t - s.last.at < 0.4);
      const live = new Set<number>();
      for (const shot of s.shots) {
        live.add(shot.id);
        let node = shotEls.get(shot.id);
        if (!node) {
          node = el('div', 'bha-train__shot', faction.training.games.dodge.shot ?? '');
          shotEls.set(shot.id, node);
          field.append(node);
        }
        node.style.left = `${shot.x * 100}%`;
        node.style.top = shot.lane === 0 ? '25%' : '75%';
        node.classList.toggle('is-hit', shot.hit);
      }
      for (const [id, node] of shotEls) if (!live.has(id)) (node.remove(), shotEls.delete(id));
      hudLeft.replaceChildren(el('span', 'bha-chip', `남은 시간 ${Math.max(0, Math.ceil(TX.dodge.seconds - s.t))}초`));
      hudRight.replaceChildren(el('span', 'bha-chip bha-chip--danger', `맞음 ${s.hits}/${TX.dodge.hitsToLose}`));
    };
  } else if (s.kind === 'clash') {
    const bar = el('div', 'bha-train__bar');
    const z = clashZone(level);
    const zone = el('i', 'bha-train__zone');
    zone.style.left = `${z.lo * 100}%`;
    zone.style.width = `${(z.hi - z.lo) * 100}%`;
    const mark = el('i', 'bha-train__mark');
    bar.append(zone, mark);
    const rounds = el('div', 'bha-train__rounds');
    field.append(bar, rounds);
    const hit = button({ label: '맞대기!', size: 'lg', variant: 'primary', onClick: () => push({ kind: 'clash' }) });
    hit.classList.add('bha-train__btn', 'bha-train__btn--wide');
    controls.append(hit);
    draw = () => {
      if (s.kind !== 'clash') return;
      mark.style.left = `${s.pos * 100}%`;
      bar.classList.toggle('is-pause', s.t < s.pauseUntil);
      bar.classList.toggle('is-ok', !!s.last && s.t - s.last.at < 0.5 && s.last.ok);
      bar.classList.toggle('is-miss', !!s.last && s.t - s.last.at < 0.5 && !s.last.ok);
      rounds.replaceChildren(...Array.from({ length: TX.clash.rounds }, (_, i) => el('i', i < s.successes ? 'is-ok' : i < s.successes + s.fails ? 'is-miss' : '')));
      hudLeft.replaceChildren(el('span', 'bha-chip bha-chip--guard', `성공 ${s.successes}/${TX.clash.toWin}`));
      hudRight.replaceChildren(el('span', 'bha-chip', `${Math.min(TX.clash.rounds, s.round + 1)}번째 / ${TX.clash.rounds}`));
    };
  } else {
    const grid = el('div', 'bha-train__grid');
    const cells = Array.from({ length: TX.chain.cells }, (_, i) => {
      const c = el('button', 'bha-train__cell');
      c.type = 'button';
      c.setAttribute('aria-label', `${i + 1}번 칸`);
      c.onclick = () => push({ kind: 'chain', cell: i });
      return c;
    });
    grid.append(...cells);
    field.append(grid);
    const words = faction.training.games.chain;
    controls.append(el('span', 'bha-faint', `${words.prey} +${TX.chain.preyScore} · ${words.predator} ${TX.chain.predatorScore}`));
    draw = () => {
      if (s.kind !== 'chain') return;
      cells.forEach((c, i) => {
        const x = s.cells[i];
        const kind = x?.kind ?? '';
        if (c.dataset.kind !== kind) {
          c.dataset.kind = kind;
          c.textContent = x ? (x.kind === 'prey' ? words.prey ?? '' : words.predator ?? '') : '';
        }
        c.classList.toggle('is-flash', !!s.last && s.last.cell === i && s.t - s.last.at < 0.35);
      });
      hudLeft.replaceChildren(el('span', 'bha-chip bha-chip--guard', `점수 ${s.score}/${TX.chain.target}`));
      hudRight.replaceChildren(el('span', 'bha-chip', `남은 시간 ${Math.max(0, Math.ceil(TX.chain.seconds - s.t))}초`));
    };
  }

  // ── PC 키: 방향키·스페이스·숫자 (기기 이동 키보다 먼저 받는다) ──
  const onKey = (e: KeyboardEvent) => {
    if (!app.isConnected) return void window.removeEventListener('keydown', onKey, true);
    if (s.status !== 'playing' || e.repeat) return;
    let inp: MiniGameInput | null = null;
    if (s.kind === 'duel') inp = e.key === 'ArrowUp' ? { kind: 'duel', dir: 'up' } : e.key === 'ArrowDown' ? { kind: 'duel', dir: 'down' } : e.key === 'ArrowRight' || e.key === ' ' ? { kind: 'duel', dir: 'mid' } : null;
    else if (s.kind === 'dodge') inp = e.key === 'ArrowUp' ? { kind: 'dodge', move: 'up' } : e.key === 'ArrowDown' ? { kind: 'dodge', move: 'down' } : e.key === ' ' ? { kind: 'dodge', move: 'toggle' } : null;
    else if (s.kind === 'clash') inp = e.key === ' ' || e.key === 'Enter' ? { kind: 'clash' } : null;
    else if (/^Digit[1-9]$/.test(e.code)) inp = { kind: 'chain', cell: Number(e.code.slice(5)) - 1 };
    if (!inp) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    push(inp);
  };
  window.addEventListener('keydown', onKey, true);

  // ── 실시간 루프 ──
  let last = performance.now();
  const countdown = el('div', 'bha-train__countdown', '준비…');
  field.append(countdown);
  window.setTimeout(() => {
    started = true;
    countdown.remove();
    last = performance.now();
  }, 1000);
  const finish = () => {
    window.removeEventListener('keydown', onKey, true);
    const won = s.status === 'won';
    const ov = el('div', `bha-train__end ${won ? 'is-win' : 'is-lose'}`);
    const go = button({ label: '결과 보기', variant: 'primary', size: 'lg', onClick: () => hd.onDone(won) });
    ov.append(el('h2', 'bha-train__endtitle', won ? '승리' : '패배'), go);
    // 끝나면 조작 버튼을 끈다 (C.68: 그대로 살아 있어 기기 확인 키 선택이 [결과 보기] 로 안 옮겨 갔다)
    for (const b of app.querySelectorAll('button')) b.disabled = true;
    field.append(ov);
    go.focus();
  };
  const frame = (now: number) => {
    if (!app.isConnected) return void window.removeEventListener('keydown', onKey, true);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (started && s.status === 'playing') {
      // 입력은 한 프레임에 하나씩(같은 프레임 두 번 누름도 순서대로)
      const inp = queue.shift() ?? null;
      stepMiniGame(s, dt, inp);
    }
    draw();
    if (s.status !== 'playing') return finish();
    requestAnimationFrame(frame);
  };
  draw();
  requestAnimationFrame(frame);
  return { state: s };
}

/** 한 판 결과: 승패·얻은 수련치·노력치·비용, 수련 완료면 완료 연출 */
export function trainingResultView(dev: Device, faction: FactionConfig, save: SaveData, out: TrainingOutcome, hd: { onBack: () => void; onAgain: (() => void) | null }): void {
  const cfg = faction.training.games[out.game];
  const t = save.training;
  const rows = el('div', 'bha-stack');
  const evText = Object.entries(out.ev).filter(([, v]) => (v ?? 0) > 0).map(([k, v]) => `${statName(k as StatId, faction.id)} +${v}`).join(' · ');
  rows.append(
    el('p', '', `수련치 +${out.points} (지금 ${Math.min(t.points, TX.pointsToComplete)} / ${TX.pointsToComplete})`),
    ...(evText ? [el('p', '', `노력치 ${evText}`)] : out.won ? [el('p', 'bha-faint', '노력치는 이미 이 단계 상한이다')] : []),
    el('p', 'bha-faint', [out.condition ? signedText('컨디션', out.condition) : '', out.hunger ? fullnessDeltaText(faction.fullnessName, out.hunger) : '', out.risk ? `${faction.riskGaugeName} +${Math.round(out.risk)}` : ''].filter(Boolean).join(' · ') || '둥지 수치 변화 없음'),
    el('p', 'bha-faint', `남은 수련권 ${t.tickets}/${TX.ticketsMax}`),
  );
  const left = [panel({ title: `${cfg.name} · ${out.level}단계 ${out.won ? '승리' : '패배'}`, aside: out.won ? tag('승리', 'kind') : undefined }, rows)];
  const right: HTMLElement[] = [];
  if (out.completedNow) {
    const done = panel({ title: '수련 완료', mod: 'accent' });
    done.dataset.training = 'complete';
    done.append(el('p', 'bha-train__complete', faction.training.completeText), el('p', 'bha-faint', `칭호 해금 · 튜토리얼 목표 달성. ${faction.liberation.name} 능력치 ×${LB.uniqueStatMultiplier} → ×${LB.trainedStatMultiplier}.`));
    right.push(done);
  }
  const actions = el('div', 'bha-grid2');
  if (hd.onAgain) actions.append(button({ label: '한 판 더', icon: 'i-play', onClick: hd.onAgain }));
  actions.append(button({ label: '수련 화면으로', variant: 'primary', icon: 'i-return', onClick: hd.onBack }));
  right.push(actions);
  lcdPage(dev.view, { cls: 'bha-train-page bha-train-result' }, lcdHead({ title: faction.training.title }), left, right);
}
