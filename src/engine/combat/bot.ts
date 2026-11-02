// 자동 점검 봇 (밸런스 점검·테스트용). 사람처럼 일정 간격(임시 0.5초)마다 입력 하나만 한다.
// 순서: 해방(게이지 가득) → 강공격 예고엔 막기(게이지 가득일 때) → 위험하면 소모품 → 장비 발동 → 약점 계통으로 마무리 → 체인3 사용 → 다른 블록을 먼저 써서 같은 블록 붙이기 → 가득 차면 하나 쓰기
// 블록 순서는 바꿀 수 없다(GDD 17-2): 체인은 '붙은 블록 하나를 클릭'하거나 '끼어 있는 다른 블록을 먼저 써서 같은 블록을 붙이는' 것으로만 만든다.
// 클릭 시간 규칙(누른 뒤 0.3초 이내)은 화면 몫이라 봇은 흉내 내지 않는다.
import { hasSpecialActions } from '../../data/enemies';
import {
  blockDamage, blockEffect, canGuard, canLiberate, canUseGear, canUseItem, halted, maxChain, step, ticksOf, type CombatInput, type CombatState, type ComboRule,
} from './combat';
import { createRng, nextFloat } from '../rng';
import { chainGroup, runAt, type Block, type Tray } from './tray';
import { playScriptedCombat } from './script';

export interface BotOptions {
  /** 공허 블록: never = 안 씀, when-full = 트레이가 가득 찼을 때만, smart(기본) = 가득 찼거나 공허가 2개 이상 쌓였을 때, always = 생기면 바로 */
  voidPolicy?: 'never' | 'when-full' | 'smart' | 'always';
  /** 입력 간격(초). 기본 0.5 (사람의 반응 속도 근사, 임시) */
  actEverySeconds?: number;
  /** false 면 이번 입력에서 같은 블록 붙이기(끼어 있는 블록 먼저 쓰기)를 하지 않는다 (사람형 봇의 "체인 정리" 실패). 기본 true */
  allowJoin?: boolean;
  /** false 면 이번 입력에서 막기를 쓰지 않는다 (사람형 봇의 막기 실패·반응 전). 기본 true */
  allowGuard?: boolean;
  /** false 면 콤보 연속을 이어 가는 중에도 기다리지 않고 다른 블록을 쓴다 (콤보를 모르는 플레이). 기본 true */
  comboHold?: boolean;
  /** true 면 상대의 방어 자세를 알아채지 못한 것처럼 플레이한다 (블록을 아끼지 않고 평소대로 쓴다). 기본 false */
  ignoreStance?: boolean;
  /** false 면 해방(GDD 83장)을 쓰지 않는다. 기본 true — 게이지가 차면 바로 쓴다 (저장형 필살기는 C.134 에 삭제) */
  liberate?: boolean;
}

type Cell = { i: number; b: Block };

/** 콤보 연속을 이어 가는 중에 같은 계열 체인이 만들어지길 기다리는 최대 시간(초): 이 시간 안에 다음 블록을 쓴 적이 있으면 기다린다 */
const COMBO_HOLD_SECONDS = 6;

function cells(s: CombatState): Cell[] {
  const out: Cell[] = [];
  s.tray.forEach((b, i) => {
    if (b && !(b.sealTicks && b.sealTicks > 0)) out.push({ i, b }); // 보스 기믹으로 봉인된 블록은 누를 수 없다
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

/** 그 칸을 클릭해 쓴 뒤의 바 (원본은 건드리지 않는다): 함께 발동하는 칸이 빠지고 뒤 블록이 당겨진다 */
function trayAfterUse(s: CombatState, i: number): Tray {
  const b = s.tray[i]!;
  const gone = new Set(b.kind === 'skill' ? chainGroup(s.tray, i, maxChain(s.params)) : [i]);
  return s.tray.filter((_, k) => !gone.has(k));
}

/** 다른 블록을 먼저 써서 같은 블록을 붙이는 클릭 하나 (a a b a → b 를 쓰면 a a a). 쓴 뒤 가장 긴 덩어리가 지금보다 길어지는 후보 중 가장 길어지는 것(같으면 앞쪽). 없으면 null */
function joinUse(s: CombatState, top: number): CombatInput | null {
  const now = bestRun(s.tray, top);
  if (now >= top) return null;
  const hasPattern = hasSpecialActions(s.enemy.def.pattern);
  let best: { i: number; run: number } | null = null;
  for (const c of cells(s)) {
    if (c.b.kind === 'combo' || c.b.kind === 'liberation') continue;
    // 낭비가 큰 블록은 붙이려고 쓰지 않는다: 막기는 강적(강공격)이 없을 때만, 회복은 다쳤을 때만
    const role = c.b.kind === 'skill' ? roleOf(s, c.b) : null;
    if (role === 'guard' && hasPattern) continue;
    if (role === 'heal' && s.player.hp >= s.player.maxHp * 0.9) continue;
    const run = bestRun(trayAfterUse(s, c.i), top);
    if (run > now && (!best || run > best.run)) best = { i: c.i, run };
  }
  return best ? { type: 'use', cell: best.i } : null;
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
  const hasPattern = hasSpecialActions(s.enemy.def.pattern);
  const top = maxChain(p);

  // 0. 해방: 게이지가 차면 바로 (GDD 83장)
  if (opt.liberate !== false && canLiberate(s)) return { type: 'liberate' };
  // 1. 강공격 예고 중이고 착탄이 막기 지속(0.5초, GDD 105장 수정) 안으로 들어왔으면 막기 — 게이지가 다 찼을 때만
  const cast = s.enemy.cast;
  if (cast && opt.allowGuard !== false && cast.ticks < guardWindowTicks(s) && canGuard(s)) return { type: 'guard' };
  // 막기·경직 중에는 블록을 쓸 수 없다 (GDD 105장 1번)
  if (halted(s)) return null;
  // 1.5 상대가 방어 자세면(블록 피해 감소 + 쓸 때마다 반격) 자세가 풀릴 때까지 블록을 아낀다: 마무리 가능하면 쓰고, 같은 블록만 붙이고, 바가 가득 차면 하나 쓴다
  if (s.enemy.stance && !opt.ignoreStance) {
    const kill = skills.find((c) => blockDamage(s, c.b, groupSize(s, c)) >= s.enemy.hp);
    if (kill) return use(kill);
    const j = opt.allowJoin === false ? null : joinUse(s, top);
    if (j) return j;
    if (s.tray.length >= p.trayCapacity) {
      const pick = ofRole('guard')[0] ?? ofRole('attack')[0] ?? ofRole('heal')[0];
      if (pick) return use(pick);
    }
    return null;
  }
  // 2. 콤보 블록·해방 블록은 바로
  const special = all.find((c) => c.b.kind === 'combo' || c.b.kind === 'liberation');
  if (special) return use(special);
  // 3. 소모품 (GDD 105장 수정 3): 회복약은 체력이 40% 아래면, 각성은 바로. 장비 발동(4): 쿨다운이 끝나면 바로
  const item = p.battleItem;
  if (item && canUseItem(s) && (item.effect === 'haste' || s.player.hp < s.player.maxHp * 0.4)) return { type: 'item' };
  if (canUseGear(s)) return { type: 'gear' };
  // 4. 약점 계통 블록으로 마무리할 수 있으면 (흡수 조건)
  const finisher = skills.find((c) => {
    const g = groupSize(s, c);
    return blockEffect(s, c.b, g)?.weak && blockDamage(s, c.b, g) >= s.enemy.hp;
  });
  if (finisher) return use(finisher);
  // 4.5 콤보 (GDD 17-3): 연속을 이어 가는 중이면 같은 계열 체인을 바로 쓰고, 쓸 수 없으면 다른 블록을 쓰지 않고 잠깐 기다린다(연속이 끊기므로)
  const comboRules = p.combos;
  const qualifying = (r: ComboRule) =>
    skills.filter((c) => (c.b.family ?? null) === r.family && groupSize(s, c) >= r.minChain).sort((a, b) => groupSize(s, b) - groupSize(s, a))[0];
  const running = comboRules.filter((r) => (s.comboStreaks[r.id] ?? 0) > 0);
  for (const r of running) {
    const c = qualifying(r);
    if (c) return use(c);
  }
  const lastUseTick = s.inputs.length > 0 ? s.inputs[s.inputs.length - 1]!.tick : -Infinity;
  if (running.length > 0 && opt.comboHold !== false && s.tray.length < p.trayCapacity && s.tick - lastUseTick < ticksOf(p, COMBO_HOLD_SECONDS)) return null;
  const voids = all.filter((c) => c.b.kind === 'void');
  if (voids[0] && (voidPolicy === 'always' || (voidPolicy === 'smart' && voids.length >= 2))) return use(voids[0]);
  // 5. 체인3 이 붙어 있으면 사용 (막기는 강적이면 강공격용으로 아껴 둔다, 회복은 다쳤을 때)
  for (const c of skills.filter((x) => groupSize(s, x) >= top)) {
    const role = roleOf(s, c.b);
    if (role === 'attack') return use(c);
    if (role === 'heal' && s.player.hp < s.player.maxHp * 0.9) return use(c);
    if (role === 'guard' && !hasPattern) return use(c);
  }
  // 6. 같은 특성 블록을 붙인다 (끼어 있는 다른 블록을 먼저 쓴다)
  const join = opt.allowJoin === false ? null : joinUse(s, top);
  if (join) return join;
  // 6.2 쓸 수 있는 콤보 시작 체인이 있으면 쓴다 (체인3 으로 더 붙일 방법이 없을 때)
  for (const r of comboRules) {
    const c = qualifying(r);
    if (c) return use(c);
  }
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
  if (s.script) return playScriptedCombat(s); // 첫 원정 각본 전투 (GDD 123장 5)
  const every = ticksOf(s.params, opt.actEverySeconds ?? 0.5);
  while (s.status === 'playing') {
    // 막기 창 (GDD 105장 수정: 0.5초)은 입력 간격과 같아 간격 틱에만 보면 늘 놓친다 — 착탄이 막기 지속 안에 들어온 틱에는 바로 본다
    const urgent = opt.allowGuard !== false && s.enemy.cast !== null && s.enemy.cast.ticks < guardWindowTicks(s) && canGuard(s);
    step(s, s.tick % every === 0 || urgent ? botInput(s, opt) : null);
    s.events.length = 0;
  }
  return s;
}

/** 사람형 봇 설정 (GDD 14-4, 모두 임시). 같은 시드면 같은 플레이 */
export interface HumanBotOptions extends BotOptions {
  /** 입력 사이 간격(초): 매번 이 범위에서 무작위. 강공격 예고를 본 뒤 막기까지의 반응 지연도 같은 범위 */
  reactionSeconds?: [number, number];
  /** 강공격(시전 하나)을 막으려는 시도가 성공할 확률. 실패하면 그 시전은 막기를 쓰지 않는다. 기본 1 = 막기 블록이 바에 있으면 다 막음 (GDD 101장 추가 결정 3, C.174 — 옛 0.7) */
  guardSuccess?: number;
  /** 붙일 수 있을 때 실제로 같은 블록을 붙이는(체인 정리) 확률. 입력 한 번마다 굴린다 */
  joinChance?: number;
  /** 전투마다 한 번 굴려, 방어 자세의 의미(블록 피해 감소·반격)를 알아채고 블록을 아끼는 확률. 못 알아채면 평소대로 쓴다 */
  stanceAware?: number;
}

/** 막기가 버티는 틱: 착탄이 이보다 가까우면 막는다 (막기 틱은 착탄 틱 앞에 줄어들어 같으면 착탄 때 이미 풀린다 — 그래서 < ) */
function guardWindowTicks(s: CombatState): number {
  return ticksOf(s.params, s.params.guardSeconds);
}

export const HUMAN_BOT_DEFAULTS = { reactionSeconds: [0.5, 1.2] as [number, number], guardSuccess: 1, joinChance: 0.5, stanceAware: 0.5 };

/** 사람형 봇으로 전투를 끝까지 돌린다: 반응 지연(무작위), 막기 성공률, 체인 정리 확률. 무작위는 전투 시드에서 따로 뽑아 전투 rng 를 건드리지 않는다 */
export function playCombatHuman(s: CombatState, opt: HumanBotOptions = {}): CombatState {
  if (s.script) return playScriptedCombat(s); // 첫 원정 각본 전투 (GDD 123장 5)
  const [lo, hi] = opt.reactionSeconds ?? HUMAN_BOT_DEFAULTS.reactionSeconds;
  const guardSuccess = opt.guardSuccess ?? HUMAN_BOT_DEFAULTS.guardSuccess;
  const joinChance = opt.joinChance ?? HUMAN_BOT_DEFAULTS.joinChance;
  const stanceAware = opt.stanceAware ?? HUMAN_BOT_DEFAULTS.stanceAware;
  const rng = createRng((s.seed ^ 0x5bd1e995) >>> 0);
  const ignoreStance = nextFloat(rng) >= stanceAware;
  const delay = () => ticksOf(s.params, lo + nextFloat(rng) * (hi - lo));
  let nextAct = delay();
  /** 지금 시전(강공격 예고)에 대한 반응: 볼 수 있게 되는 틱과 막기 시도 성공 여부 */
  let react: { at: number; ok: boolean } | null = null;
  while (s.status === 'playing') {
    if (s.events.some((e) => e.kind === 'heavy-cast')) {
      // 반응 지연은 그대로, 단 착탄 전에는 누른다 (GDD 101장 추가 결정 3: 막기 블록이 바에 있으면 강공격은 막는 기준)
      const impact = s.enemy.cast ? s.tick + s.enemy.cast.ticks - 1 : Infinity;
      react = { at: Math.min(s.tick + delay(), impact), ok: nextFloat(rng) < guardSuccess };
      nextAct = Math.min(nextAct, react.at);
    }
    // 막기 창 (GDD 101장): 예고를 본 뒤 착탄이 막기 지속 안에 들어오는 틱에 한 번 더 손을 쓴다
    if (react && react.ok && s.enemy.cast && s.tick >= react.at && s.enemy.cast.ticks < guardWindowTicks(s) && canGuard(s)) {
      nextAct = Math.min(nextAct, s.tick);
    }
    if (!s.enemy.cast) react = null;
    let input: CombatInput | null = null;
    if (s.tick >= nextAct) {
      input = botInput(s, {
        ...opt,
        allowGuard: react !== null && react.ok && s.tick >= react.at,
        allowJoin: nextFloat(rng) < joinChance,
        ignoreStance,
      });
      nextAct = s.tick + delay();
    }
    s.events.length = 0;
    step(s, input);
  }
  return s;
}
