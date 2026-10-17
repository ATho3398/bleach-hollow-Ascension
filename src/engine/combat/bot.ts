// 자동 점검 봇 (밸런스 점검·테스트용). 사람처럼 일정 간격(임시 0.5초)마다 입력 하나만 한다.
// 순서: 강공격 예고엔 막기 → 필살 → 위험하면 회복 → 약점 계통으로 마무리 → 합치기 → 체인3 사용 → 같은 블록 붙이기 → 가득 차면 하나 쓰기
import {
  blockDamage, blockEffect, maxChain, step, ticksOf, type CombatInput, type CombatState,
} from './combat';
import { emptyCells, isNeighbor, mergePairs, neighbors, type Block } from './tray';

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
const byChainDesc = (a: Cell, b: Cell) => b.b.chain - a.b.chain;

/** 지금 할 입력 하나 (없으면 null) */
export function botInput(s: CombatState, opt: BotOptions = {}): CombatInput | null {
  if (s.status !== 'playing') return null;
  const voidPolicy = opt.voidPolicy ?? 'smart';
  const p = s.params;
  const all = cells(s);
  const skills = all.filter((c) => c.b.kind === 'skill');
  const ofRole = (role: string) => skills.filter((c) => roleOf(s, c.b) === role).sort(byChainDesc);
  const use = (c: Cell): CombatInput => ({ type: 'use', cell: c.i });
  const hasPattern = s.enemy.def.pattern !== undefined;

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
  const finisher = skills.find((c) => blockEffect(s, c.b)?.weak && blockDamage(s, c.b) >= s.enemy.hp);
  if (finisher) return use(finisher);
  const voids = all.filter((c) => c.b.kind === 'void');
  if (voids[0] && (voidPolicy === 'always' || (voidPolicy === 'smart' && voids.length >= 2))) return use(voids[0]);
  // 5. 합치기: 체인이 높은 쪽으로, 체인1 블록을 얹는 쪽을 우선(체인2+체인2 는 낭비)
  const pairs = mergePairs(s.tray, p.trayCols, maxChain(p));
  if (pairs.length > 0) {
    const score = ([a, b]: [number, number]) => s.tray[b]!.chain * 2 - (s.tray[a]!.chain - 1) * 3;
    const [from, to] = [...pairs].sort((x, y) => score(y) - score(x))[0]!;
    return { type: 'merge', from, to };
  }
  // 6. 체인3 블록 사용 (막기는 강적이면 강공격용으로 아껴 둔다, 회복은 다쳤을 때)
  const top = maxChain(p);
  for (const c of skills.filter((x) => x.b.chain >= top)) {
    const role = roleOf(s, c.b);
    if (role === 'attack') return use(c);
    if (role === 'heal' && s.player.hp < s.player.maxHp * 0.9) return use(c);
    if (role === 'guard' && !hasPattern) return use(c);
  }
  // 7. 같은 특성 블록을 이웃으로 붙인다 (이동 → 다음 입력에서 합치기)
  const size = s.tray.length;
  for (const a of skills) {
    if (a.b.chain >= top) continue;
    for (const b of skills) {
      if (a === b || a.b.traitId !== b.b.traitId || b.b.chain >= top || isNeighbor(a.i, b.i, p.trayCols)) continue;
      const near = neighbors(b.i, size, p.trayCols);
      const swap = near.find((n) => n !== a.i && isNeighbor(a.i, n, p.trayCols) && s.tray[n]?.traitId !== a.b.traitId);
      if (swap !== undefined) return { type: 'move', from: a.i, to: swap };
      const free = near.find((n) => s.tray[n] === null);
      if (free !== undefined) return { type: 'move', from: a.i, to: free };
    }
  }
  // 8. 가득 찼으면 하나 쓴다: 공허(허용 시) → 체인 높은 공격 → 회복 → 막기
  if (emptyCells(s.tray).length === 0) {
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
