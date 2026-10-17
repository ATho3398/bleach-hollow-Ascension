// 자동 점검 봇 (밸런스 점검·테스트용). 사람처럼 일정 간격(임시 0.5초)마다 입력 하나만 한다.
// 순서: 강공격 예고엔 막기 → 필살 → 위험하면 회복 → 약점 계통으로 마무리 → 체인3 사용 → 같은 블록 붙이기(move) → 가득 차면 하나 쓰기
// 클릭 시간 규칙(누른 뒤 0.3초 이내)은 화면 몫이라 봇은 흉내 내지 않는다.
import {
  blockDamage, blockEffect, maxChain, step, ticksOf, type CombatInput, type CombatState,
} from './combat';
import { chainGroup, movedTray, runAt, type Block, type Tray } from './tray';

export interface BotOptions {
  /** 공허 블록: never = 안 씀, when-full = 트레이가 가득 찼을 때만, smart(기본) = 가득 찼거나 공허가 2개 이상 쌓였을 때, always = 생기면 바로 */
  voidPolicy?: 'never' | 'when-full' | 'smart' | 'always';
  /** 입력 간격(초). 기본 0.5 (사람의 반응 속도 근사, 임시) */
  actEverySeconds?: number;
}

type Cell = { i: number; b: Block };

function cells(s: CombatState): Cell[] {
  const out: Cell[] = [];
  s.tray.forEach((b, i) => {
    if (b) out.push({ i, b });
  });
  return out;
}

const roleOf = (s: CombatState, b: Block) => blockEffect(s, b)?.skill.role ?? null;

/** 그 블록을 클릭하면 함께 발동할 블록 수 (체인 단계) */
const groupSize = (s: CombatState, c: Cell) => chainGroup(s.tray, c.i, maxChain(s.params)).length;

/** 바에서 가장 길게 붙은 같은 특성 덩어리 길이 (최대 체인으로 자른다) */
function bestRun(t: Tray, top: number): number {
  let best = 0;
  t.forEach((b, i) => {
    if (b.kind !== 'skill') return;
    const [lo, hi] = runAt(t, i);
    best = Math.max(best, Math.min(top, hi - lo + 1));
  });
  return best;
}

/** 같은 블록을 붙이는 이동 하나 (바에서 가장 긴 덩어리를 더 늘리는 것 중 앞쪽). 없으면 null */
function joinMove(s: CombatState, top: number): CombatInput | null {
  const now = bestRun(s.tray, top);
  if (now >= top) return null;
  let best: { from: number; to: number; run: number } | null = null;
  const n = s.tray.length;
  for (let from = 0; from < n; from++) {
    if (s.tray[from]!.kind !== 'skill') continue;
    for (let to = 0; to < n; to++) {
      if (from === to) continue;
      const run = bestRun(movedTray(s.tray, from, to), top);
      if (run > now && (!best || run > best.run)) best = { from, to, run };
    }
  }
  return best ? { type: 'move', from: best.from, to: best.to } : null;
}

/** 지금 할 입력 하나 (없으면 null) */
export function botInput(s: CombatState, opt: BotOptions = {}): CombatInput | null {
  if (s.status !== 'playing') return null;
  const voidPolicy = opt.voidPolicy ?? 'smart';
  const p = s.params;
  const all = cells(s);
  const skills = all.filter((c) => c.b.kind === 'skill');
  /** 역할별 후보: 클릭하면 체인이 가장 높게 나오는 블록 먼저 */
  const ofRole = (role: string) => skills.filter((c) => roleOf(s, c.b) === role).sort((a, b) => groupSize(s, b) - groupSize(s, a));
  const use = (c: Cell): CombatInput => ({ type: 'use', cell: c.i });
  const hasPattern = s.enemy.def.pattern !== undefined;
  const top = maxChain(p);

  // 1. 강공격 예고 중이고 막기 상태가 착탄까지 못 버티면 막기 블록
  const cast = s.enemy.cast;
  if (cast && s.guard.ticks <= cast.ticks) {
    const g = ofRole('guard')[0];
    if (g) return use(g);
  }
  // 2. 필살 블록은 바로
  const special = all.find((c) => c.b.kind === 'special');
  if (special) return use(special);
  // 3. 체력이 절반 아래면 회복
  if (s.player.hp < s.player.maxHp * 0.5) {
    const h = ofRole('heal')[0];
    if (h) return use(h);
  }
  // 4. 약점 계통 블록으로 마무리할 수 있으면 (흡수 조건)
  const finisher = skills.find((c) => {
    const g = groupSize(s, c);
    return blockEffect(s, c.b, g)?.weak && blockDamage(s, c.b, g) >= s.enemy.hp;
  });
  if (finisher) return use(finisher);
  const voids = all.filter((c) => c.b.kind === 'void');
  if (voids[0] && (voidPolicy === 'always' || (voidPolicy === 'smart' && voids.length >= 2))) return use(voids[0]);
  // 5. 체인3 이 붙어 있으면 사용 (막기는 강적이면 강공격용으로 아껴 둔다, 회복은 다쳤을 때)
  for (const c of skills.filter((x) => groupSize(s, x) >= top)) {
    const role = roleOf(s, c.b);
    if (role === 'attack') return use(c);
    if (role === 'heal' && s.player.hp < s.player.maxHp * 0.9) return use(c);
    if (role === 'guard' && !hasPattern) return use(c);
  }
  // 6. 같은 특성 블록을 붙인다 (드래그 = move)
  const join = joinMove(s, top);
  if (join) return join;
  // 7. 가득 찼으면 하나 쓴다: 공허(허용 시) → 체인 높은 공격 → 회복 → 막기
  if (s.tray.length >= p.trayCapacity) {
    const v = all.find((c) => c.b.kind === 'void');
    if (v && voidPolicy !== 'never') return use(v);
    const pick = ofRole('attack')[0] ?? ofRole('heal')[0] ?? ofRole('guard')[0];
    if (pick) return use(pick);
  }
  return null;
}

/** 봇으로 전투를 끝까지 돌린다 (헤드리스) */
export function playCombatBot(s: CombatState, opt: BotOptions = {}): CombatState {
  const every = ticksOf(s.params, opt.actEverySeconds ?? 0.5);
  while (s.status === 'playing') {
    step(s, s.tick % every === 0 ? botInput(s, opt) : null);
    s.events.length = 0;
  }
  return s;
}
