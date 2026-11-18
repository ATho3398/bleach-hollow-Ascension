// 진화체 고유 능력 장치 (GDD 8-7 1차 구현, C.499 — docs/drafts/evo-impl-1119.md): 4단계 진화체의 고유 능력·특수 블록·해방(레스렉시온/만해) 변형을
// 규칙(언제 + 거르기 + 효과)과 늘 붙는 효과(passive)로 돌린다. 데이터 = src/data/evolution/uniques.json(진화체 id × 종족), 수치 = balance provisional.evoUniques.
// 엔진은 진화체·종족 id 를 모른다 — params.evo 에 실린 규칙만 본다(코드 분기 없음). 전투 엔진(combat.ts)이 시점마다 아래 훅을 부르고,
// 피해·블록 생성처럼 엔진 안쪽이 필요한 일은 combat.ts 가 등록한 EvoApi 로 한다(순환 import 없이).
// 스택·게이지는 '맞으면/멈추면 초기화' 같은 끊김 조건이 없다(GDD 8-7 ②) — 시간 스택은 스택마다 제 시간만, 'every' 시계는 조건이 거짓이면 멈췄다가 이어 간다.
import type { EvoAbilityDef, EvoAction, EvoNeed, EvoNum, EvoPassive, EvoRule, EvoSource, EvoSpecialDef, EvoStat, EvoTrigger } from '../../data/evolution/uniques';
import type { PerFaction } from '../../data/schema';
import type { CombatParams, CombatState } from './combat';
import type { Block } from './tray';

/** 전투에 싣는 고유 능력 (applyEvolutionToParams 가 채운다). nums = 평소 수치, relNums = 레스렉시온/만해 중 수치 */
export interface EvoParams {
  /** 진화체 id (기록·화면용 — 엔진은 분기하지 않는다) */
  formId: string;
  ability: EvoAbilityDef;
  nums: Record<string, number>;
  relNums: Record<string, number>;
  /** 원정 동안 이어 가는 스택(carry)의 이번 전투 시작 값 */
  carry?: Record<string, number>;
}

/** 특수 블록의 traitId 머리 */
export const EVO_TRAIT_PREFIX = 'evo:';

interface StackState {
  n: number;
  /** 스택마다 끝나는 틱 (시간 스택만, 오래된 것부터) */
  exp?: number[];
}

/** 전투 중 고유 능력 상태 (저장하지 않는다 — 전투 밖으로는 carry 스택만 원정이 넘긴다) */
export interface EvoState {
  stacks: Record<string, StackState>;
  buffs: Record<string, { value: number; until: number }>;
  charges: Record<string, { n: number; value: number }>;
  /** 규칙마다 every 카운터 · every 트리거 시계(틱) · streak 통과 틱 */
  counters: number[];
  clocks: number[];
  streaks: number[][];
  timers: Record<string, number>;
  /** 발동 작은 글자별 횟수 (런 로그 abilityProcs 의 evo:<글자>) */
  procs: Record<string, number>;
  /** 지금 보호막이 막은 합 (깨지면 shieldBreak 의 amount) */
  shieldAbsorbed: number;
  /** basics 동작으로 치는 평타의 추가 배율 · 그 평타인가 (평타 n대 카운터를 세지 않는다) */
  extraBonus: number;
  fromEvo: boolean;
  /** 이번 평타 치명 확정 (basicPre forceCrit) */
  forceCrit: boolean;
  /** 지금 쓰는 블록의 치명 피해 + (blockPre blockCritDmg — 그 블록 피해 계산 동안만) */
  critDmgNow?: number;
  /** 처형한 수 */
  executes: number;
}

/** 규칙 실행 맥락 */
export interface EvoCtx {
  chain: number;
  consumed: number;
  amount: number;
  damage: number;
  element: string | null;
  kind: 'skill' | 'void' | 'combo' | 'liberation' | 'special' | null;
  crit: boolean;
  echo: boolean;
  /** pre 단계가 모으는 값: 피해 +비율 · 평타 n회분 더하기 · 치명 + · 치명 확정 · 방어 무시 */
  mult: number;
  flat: number;
  critBonus: number;
  critDmg: number;
  /** 이 블록은 피해 없음 (blockPre noDamage) */
  noDamage: boolean;
  forceCrit: boolean;
  ignore: number;
  chargeValues: Record<string, number>;
  block?: Block;
  special?: string;
  timer?: string;
}

/** combat.ts 가 등록하는 엔진 안쪽 동작 */
export interface EvoApi {
  /** 평소 출현표에서 블록 1개 (허 제외). 넣었으면 true */
  spawnDraw(s: CombatState): boolean;
  /** 그 속성('self' = 내 속성)·계열 블록 1개 (그 생성원이 없으면 false) */
  spawnMade(s: CombatState, element: string | null, family: string | null): boolean;
  /** 바에 블록을 놓고 spawn 사건·spawn 규칙 (front = 맨 앞) */
  place(s: CombatState, b: Omit<Block, 'uid'>, front?: boolean): Block | null;
  /** 추가 평타 1회 (타이머 그대로) */
  extraBasic(s: CombatState): void;
  /** 추가 피해 1단위: basic = 평타 1회 · block = 기본 블록 1단계 · void = 공허 블록 1개 (element 속성, ignore 방어 무시) */
  unitOf(s: CombatState, basis: 'basic' | 'block' | 'void', element: string | null, ignore: number): number;
  /** 추가 피해를 넣는다 (치명·특성 배율 포함, 화면 사건) */
  strike(s: CombatState, damage: number, text: string, element: string | null): void;
  /** 바의 index 블록이 지금 무슨 속성인가 (허 = void) */
  elementOf(s: CombatState, b: Block): string | null;
  /** 처형 (강적·보스 제외는 부르는 쪽이 본다) */
  execute(s: CombatState): void;
  /** 해방 게이지 + */
  addGauge(s: CombatState, v: number): void;
  ticksOf(p: CombatParams, seconds: number): number;
}

let API: EvoApi | null = null;
export function registerEvoApi(api: EvoApi): void {
  API = api;
}
const api = (): EvoApi => {
  if (!API) throw new Error('진화체 고유 능력: 엔진 API 미등록');
  return API;
};

// ── 기본 ──

/** 처형 발동 글자 (두 종족 공용) */
export const EXECUTE_TEXT = '처형!';

/** 고유 능력 또는 처형 특성이 있으면 상태를 만든다 */
export function newEvoState(p: CombatParams): EvoState | undefined {
  const ev = p.evo;
  if (!ev && !p.abilityEffects.execute) return undefined;
  const st: EvoState = {
    stacks: {}, buffs: {}, charges: {}, counters: [], clocks: [], streaks: [], timers: {}, procs: {},
    shieldAbsorbed: 0, extraBonus: 0, fromEvo: false, forceCrit: false, executes: 0,
  };
  for (const [name, def] of Object.entries(ev?.ability.stacks ?? {})) {
    const start = def.carry ? Math.max(0, ev?.carry?.[name] ?? 0) : 0;
    st.stacks[name] = { n: start, ...(def.seconds !== undefined ? { exp: [] } : {}) };
  }
  return st;
}

/** 레스렉시온/만해 중인가 (기본 해방 제외) */
export function evoReleasing(s: Pick<CombatState, 'params' | 'liberation'>): boolean {
  return s.params.liberationUnique && s.liberation.ticksLeft > 0;
}

/** 수치: 숫자 그대로, 문자열이면 balance 키 (해방 중 값 우선) */
export function evoNum(s: Pick<CombatState, 'params' | 'liberation'>, v: EvoNum | undefined, fallback = 0): number {
  if (v === undefined) return fallback;
  if (typeof v === 'number') return v;
  const ev = s.params.evo;
  if (!ev) return fallback;
  const table = evoReleasing(s) ? ev.relNums : ev.nums;
  return table[v] ?? ev.nums[v] ?? fallback;
}

const isElite = (s: CombatState): boolean => s.enemy.def.class === 'elite' || !!s.boss;

function emptyCtx(): EvoCtx {
  return { chain: 0, consumed: 0, amount: 0, damage: 0, element: null, kind: null, crit: false, echo: false, mult: 0, flat: 0, critBonus: 0, critDmg: 0, noDamage: false, forceCrit: false, ignore: 0, chargeValues: {} };
}

function specialIdOf(b: Block | undefined): string | null {
  return b && b.kind === 'skill' && b.traitId?.startsWith(EVO_TRAIT_PREFIX) ? b.traitId.slice(EVO_TRAIT_PREFIX.length) : null;
}

/** 이 블록이 진화체 특수 블록이면 그 정의 */
export function evoSpecialOf(p: Pick<CombatParams, 'evo'>, traitId: string | null | undefined): (EvoSpecialDef & { id: string }) | null {
  if (!traitId?.startsWith(EVO_TRAIT_PREFIX)) return null;
  const id = traitId.slice(EVO_TRAIT_PREFIX.length);
  const d = p.evo?.ability.specials?.[id];
  return d ? { ...d, id } : null;
}

/** 출처 값 */
function sourceValue(s: CombatState, name: string, ctx: EvoCtx): number {
  const st = s.evo;
  const [kind, key] = name.split(':') as [string, string | undefined];
  switch (kind) {
    case 'one': return 1;
    case 'chain': return ctx.chain;
    case 'consumed': return ctx.consumed;
    case 'amount': return ctx.amount;
    case 'damage': return ctx.damage;
    case 'bar': {
      const blocks = s.tray.filter((b) => !b.fixed);
      if (!key) return blocks.length;
      return blocks.filter((b) => api().elementOf(s, b) === key).length;
    }
    case 'lostHpPct': return Math.max(0, (1 - s.player.hp / Math.max(1e-6, s.player.maxHp)) * 100);
    case 'shieldPct': return Math.max(0, ((s.player.shield ?? 0) / Math.max(1e-6, s.player.maxHp)) * 100);
    case 'risk': return Math.max(0, (s.params.riskStart ?? 0) + s.riskGained);
    case 'stack': return st?.stacks[key!]?.n ?? 0;
    case 'buff': {
      const b = st?.buffs[key!];
      return b && b.until > s.tick ? b.value : 0;
    }
    case 'charge': return st?.charges[key!]?.n ?? 0;
    case 'chargeValue': return ctx.chargeValues[key!] ?? 0;
  }
  return 0;
}

function perValue(s: CombatState, per: EvoSource | EvoSource[] | undefined, ctx: EvoCtx): number {
  if (per === undefined) return 1;
  let m = 1;
  for (const x of Array.isArray(per) ? per : [per]) m *= sourceValue(s, x, ctx);
  return m;
}

function needsOk(s: CombatState, list: EvoNeed[] | undefined, ctx: EvoCtx): boolean {
  for (const n of list ?? []) {
    let v: number | null = null;
    if (n.stack) v = sourceValue(s, `stack:${n.stack}`, ctx);
    else if (n.buff) v = sourceValue(s, `buff:${n.buff}`, ctx);
    else if (n.charge) v = sourceValue(s, `charge:${n.charge}`, ctx);
    else if (n.special) v = s.tray.filter((b) => specialIdOf(b) === n.special).length;
    if (v !== null) {
      if (n.atLeast !== undefined && v < evoNum(s, n.atLeast)) return false;
      if (n.below !== undefined && !(v < evoNum(s, n.below))) return false;
      if (n.atLeast === undefined && n.below === undefined && v <= 0) return false;
    }
    if (n.barFull !== undefined && (s.tray.length >= s.params.trayCapacity) !== n.barFull) return false;
    if (n.shield !== undefined && ((s.player.shield ?? 0) > 0) !== n.shield) return false;
    if (n.elite !== undefined && isElite(s) !== n.elite) return false;
  }
  return true;
}

function whenOk(s: CombatState, when: 'release' | 'normal' | undefined): boolean {
  if (!when) return true;
  return when === 'release' ? evoReleasing(s) : !evoReleasing(s);
}

// ── 스택·버프·충전 ──

function stackDef(s: CombatState, name: string) {
  return s.params.evo?.ability.stacks?.[name];
}

function addStack(s: CombatState, name: string, k: number): void {
  const st = s.evo!.stacks[name] ??= { n: 0 };
  const def = stackDef(s, name);
  const max = def?.max !== undefined ? evoNum(s, def.max, Infinity) : Infinity;
  if (k <= 0) return;
  if (def?.overflow === 'reset' && st.n >= max) {
    st.n = 0;
    if (st.exp) st.exp = [];
    return;
  }
  if (st.exp && def?.seconds !== undefined) {
    const until = s.tick + api().ticksOf(s.params, evoNum(s, def.seconds));
    for (let i = 0; i < Math.round(k); i++) st.exp.push(until);
    while (st.exp.length > max) st.exp.shift(); // 가득이면 가장 오래된 스택이 새 스택으로 (스택마다 따로 시간)
    st.n = st.exp.length;
    return;
  }
  st.n = Math.min(max, st.n + k);
}

function setStack(s: CombatState, name: string, n: number): void {
  const st = s.evo!.stacks[name] ??= { n: 0 };
  const v = Math.max(0, n);
  if (st.exp) {
    const keep = Math.floor(v);
    st.exp = st.exp.slice(Math.max(0, st.exp.length - keep)); // 오래된 것부터 빠진다
    st.n = st.exp.length;
  } else st.n = v;
}

/** 발동 한 번 세기 (+ 작은 글자 사건 — show false 면 세기만: 추가 피해는 그 피해 사건이 글자를 낸다) */
function proc(s: CombatState, text: string | undefined, damage = 0, show = true): void {
  if (!text || !s.evo) return;
  const p = s.evo.procs;
  p[text] = (p[text] ?? 0) + 1;
  if (show) s.events.push({ kind: 'evo-proc', text, damage });
}

// ── 효과 ──

function runActions(s: CombatState, rule: EvoRule, ctx: EvoCtx): void {
  const ev = s.evo!;
  for (const a of rule.do) {
    if (s.status !== 'playing') return;
    const v = (x: EvoNum | undefined, d = 0) => evoNum(s, x, d);
    const val = () => v(a.value, 1) * perValue(s, a.per, ctx);
    switch (a.act) {
      case 'add': addStack(s, a.stack!, val()); break;
      case 'mul': setStack(s, a.stack!, (ev.stacks[a.stack!]?.n ?? 0) * v(a.value, 1)); break;
      case 'clear': setStack(s, a.stack!, 0); break;
      case 'consume': {
        const have = ev.stacks[a.stack!]?.n ?? 0;
        const want = a.value === undefined && a.per === undefined ? have : val();
        const take = Math.min(have, Math.max(0, want));
        setStack(s, a.stack!, have - take);
        ctx.consumed = take;
        break;
      }
      case 'buff': {
        const until = s.tick + api().ticksOf(s.params, v(a.seconds));
        const cur = ev.buffs[a.buff!];
        const live = cur && cur.until > s.tick ? cur.value : 0;
        const nv = a.refresh === 'max' ? Math.max(live, val()) : a.refresh === 'add' ? live + val() : val();
        ev.buffs[a.buff!] = { value: nv, until };
        break;
      }
      case 'charge': {
        const c = (ev.charges[a.charge!] ??= { n: 0, value: 0 });
        const def = s.params.evo!.ability.charges?.[a.charge!];
        const max = def?.max !== undefined ? v(def.max, Infinity) : Infinity;
        c.n = Math.min(max, c.n + Math.round(val()));
        if (a.amount !== undefined) c.value = v(a.amount) * perValue(s, a.amountPer, ctx);
        break;
      }
      case 'spawn': {
        const n = Math.max(1, Math.round(v(a.value, 1)));
        for (let k = 0; k < n; k++) {
          if (a.block === 'draw') api().spawnDraw(s);
          else if (a.block === 'make') api().spawnMade(s, a.element ?? null, a.family ?? null);
          else spawnSpecial(s, a.block!);
        }
        break;
      }
      case 'shield': {
        const max = s.player.maxHp;
        const cur = s.player.shield ?? 0;
        if (cur <= 0) ev.shieldAbsorbed = 0;
        s.player.shield = Math.min(Math.max(cur, max * v(a.cap)), cur + max * val());
        break;
      }
      case 'shieldCut': s.player.shield = Math.max(0, (s.player.shield ?? 0) - s.player.maxHp * val()); break;
      case 'blockMult': ctx.mult += val(); break;
      case 'blockFlat': ctx.flat += val(); break;
      case 'blockCrit': ctx.critBonus += val(); break;
      case 'blockCritDmg': ctx.critDmg += val(); break;
      case 'noDamage': ctx.noDamage = true; break;
      case 'basicMult': ctx.mult += val(); break;
      case 'forceCrit': ctx.forceCrit = true; break;
      case 'ignoreDef': ctx.ignore = Math.max(ctx.ignore, val()); break;
      case 'hit': {
        const basis = a.basis ?? 'basic';
        const amount = basis === 'raw' ? val() : basis === 'last' ? ctx.damage * val() : api().unitOf(s, basis, a.element ?? null, v(a.ignoreDef)) * val();
        if (amount > 0) api().strike(s, amount, rule.proc ?? '', a.element ?? null);
        break;
      }
      case 'basics': {
        const n = Math.max(0, Math.round(v(a.value, 1)));
        for (let k = 0; k < n && s.status === 'playing'; k++) {
          ev.extraBonus = v(a.bonus);
          ev.fromEvo = true;
          try {
            api().extraBasic(s);
          } finally {
            ev.extraBonus = 0;
            ev.fromEvo = false;
          }
        }
        break;
      }
      case 'heal': {
        const base = a.of === 'damage' ? ctx.damage : s.player.maxHp;
        const heal = Math.min(s.player.maxHp - s.player.hp, base * val());
        if (heal > 0) {
          s.player.hp += heal;
          s.events.push({ kind: 'drain', target: 'player', heal });
        }
        break;
      }
      case 'echo': {
        const b = ctx.block;
        if (!b || ctx.echo || b.kind !== 'skill') break;
        api().place(s, { kind: b.kind, traitId: b.traitId, family: b.family ?? null, element: b.element ?? null, echo: true });
        break;
      }
      case 'absorb': {
        const b = ctx.block;
        if (!b) break;
        const i = s.tray.findIndex((x) => x.uid === b.uid);
        if (i >= 0) s.tray.splice(i, 1);
        break;
      }
      case 'useSpecial': {
        const i = s.tray.findIndex((x) => specialIdOf(x) === a.special);
        if (i >= 0) useEvoSpecial(s, i, true);
        break;
      }
      case 'timer': ev.timers[a.timer!] = s.tick + Math.max(1, api().ticksOf(s.params, v(a.seconds))); break;
      case 'timerCut': {
        const t = ev.timers[a.timer!];
        if (t !== undefined) ev.timers[a.timer!] = Math.max(s.tick + 1, t - api().ticksOf(s.params, v(a.seconds)));
        break;
      }
      case 'execute':
        if (!isElite(s)) {
          ev.executes++;
          api().execute(s);
        }
        break;
    }
  }
}

/** 규칙 하나의 거르기 (every·streak 제외) */
function filtersOk(s: CombatState, r: EvoRule, ctx: EvoCtx): boolean {
  if (!whenOk(s, r.when)) return false;
  if (r.charge && !(r.charge in ctx.chargeValues)) return false;
  if (r.special && ctx.special !== undefined && r.special !== ctx.special) return false;
  if (r.timer && r.timer !== ctx.timer) return false;
  if (r.on === 'block' || r.on === 'blockPre' || r.on === 'spawn') {
    const kinds = r.kind ?? ['skill'];
    if (!ctx.kind || !kinds.includes(ctx.kind)) return false;
    if (r.element && !(ctx.element && r.element.includes(ctx.element))) return false;
    if (r.notElement && ctx.element && r.notElement.includes(ctx.element)) return false;
    if (r.minChain !== undefined && ctx.chain < evoNum(s, r.minChain)) return false;
    if (r.chain && !r.chain.includes(ctx.chain)) return false;
    if (r.crit !== undefined && ctx.crit !== r.crit) return false;
    if (r.echo !== undefined && ctx.echo !== r.echo) return false;
  }
  return needsOk(s, r.need, ctx);
}

/** on 트리거 규칙을 돌린다 */
function fire(s: CombatState, on: EvoTrigger, ctx: EvoCtx): void {
  const ev = s.params.evo;
  const st = s.evo;
  if (!ev || !st) return;
  const rules = ev.ability.rules ?? [];
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i]!;
    if (r.on !== on) continue;
    if (s.status !== 'playing') return;
    if (!filtersOk(s, r, ctx)) {
      if (r.streak) st.streaks[i] = []; // 연달아가 끊김 (다른 블록을 썼다)
      continue;
    }
    if (r.streak) {
      const within = r.streak.withinSeconds === undefined ? Infinity : api().ticksOf(s.params, evoNum(s, r.streak.withinSeconds));
      const list = (st.streaks[i] ??= []).filter((t) => s.tick - t <= within);
      list.push(s.tick);
      if (list.length < evoNum(s, r.streak.count, 1)) {
        st.streaks[i] = list;
        continue;
      }
      st.streaks[i] = [];
    }
    if (r.every !== undefined && on !== 'every') {
      if (on === 'basic' && st.fromEvo) continue; // basics 동작 평타는 카운터를 세지 않는다
      const n = (st.counters[i] ?? 0) + 1;
      if (n < Math.max(1, evoNum(s, r.every, 1))) {
        st.counters[i] = n;
        continue;
      }
      st.counters[i] = 0;
    }
    runActions(s, r, ctx);
    proc(s, r.proc, 0, !r.do.some((a) => a.act === 'hit'));
  }
}

// ── 엔진 훅 (combat.ts 가 부른다) ──

/** 전투 시작: 고정 특수 블록을 바 맨 앞에 놓고 start 규칙 */
export function evoStart(s: CombatState): void {
  const ev = s.params.evo;
  if (!ev || !s.evo) return;
  for (const [id, d] of Object.entries(ev.ability.specials ?? {})) {
    const n = Math.round(evoNum(s, d.fixed));
    for (let k = 0; k < n; k++) api().place(s, { kind: 'skill', traitId: EVO_TRAIT_PREFIX + id, family: null, element: null, solo: true, fixed: true }, true);
  }
  fire(s, 'start', emptyCtx());
}

/** 매 틱: 시간 스택·버프 끝 · every 시계 · timer */
export function evoTick(s: CombatState): void {
  const ev = s.params.evo;
  const st = s.evo;
  if (!ev || !st) return;
  for (const x of Object.values(st.stacks)) {
    if (!x.exp || x.exp.length === 0) continue;
    while (x.exp.length > 0 && x.exp[0]! <= s.tick) x.exp.shift();
    x.n = x.exp.length;
  }
  for (const [k, b] of Object.entries(st.buffs)) if (b.until <= s.tick) delete st.buffs[k];
  const rules = ev.ability.rules ?? [];
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i]!;
    if (r.on !== 'every' || s.status !== 'playing') continue;
    const ctx = emptyCtx();
    if (!whenOk(s, r.when) || !needsOk(s, r.need, ctx)) continue; // 조건이 거짓이면 시계가 멈춘다(0 으로 안 돌아감)
    const n = (st.clocks[i] ?? 0) + 1;
    if (n < Math.max(1, api().ticksOf(s.params, evoNum(s, r.seconds, 1)))) {
      st.clocks[i] = n;
      continue;
    }
    st.clocks[i] = 0;
    runActions(s, r, ctx);
    proc(s, r.proc, 0, !r.do.some((a) => a.act === 'hit'));
  }
  for (const [name, at] of Object.entries(st.timers)) {
    if (at > s.tick || s.status !== 'playing') continue;
    delete st.timers[name];
    fire(s, 'timer', { ...emptyCtx(), timer: name });
  }
}

/** 평타 직전: 충전 1회씩 쓰고 basicPre 규칙 → 이번 평타 배율·치명 확정·방어 무시 */
export function evoBasicPre(s: CombatState): EvoCtx | null {
  const st = s.evo;
  if (!s.params.evo || !st) return null;
  const ctx = emptyCtx();
  for (const [name, c] of Object.entries(st.charges)) {
    if (c.n <= 0) continue;
    c.n--;
    ctx.chargeValues[name] = c.value;
  }
  fire(s, 'basicPre', ctx);
  ctx.mult += st.extraBonus;
  ctx.ignore = Math.max(ctx.ignore, evoStat(s, 'ignoreDef'));
  st.forceCrit = ctx.forceCrit;
  return ctx;
}

/** 평타를 친 뒤 (damage = 마지막 타격 피해) */
export function evoBasicPost(s: CombatState, ctx: EvoCtx | null, damage: number): void {
  if (!ctx || !s.evo) return;
  s.evo.forceCrit = false;
  ctx.damage = damage;
  fire(s, 'basic', ctx);
}

/** 블록 쓰기 직전 (blockPre 규칙 → 이 블록 피해 +·평타 n회분·치명 +) */
export function evoBlockPre(s: CombatState, info: { kind: EvoCtx['kind']; element: string | null; chain: number; block?: Block; echo?: boolean; special?: string }): EvoCtx | null {
  if (!s.params.evo || !s.evo) return null;
  const ctx = { ...emptyCtx(), ...info, echo: !!info.echo };
  fire(s, 'blockPre', ctx);
  return ctx;
}

/** 블록을 쓴 뒤 (crit·damage 가 정해진 뒤) */
export function evoBlockPost(s: CombatState, ctx: EvoCtx | null, crit: boolean, damage: number): void {
  if (!ctx) return;
  ctx.crit = crit;
  ctx.damage = damage;
  fire(s, 'block', ctx);
}

/** 바에 블록이 생겼다 */
export function evoOnSpawn(s: CombatState, b: Block): void {
  if (!s.params.evo || !s.evo) return;
  const special = specialIdOf(b);
  fire(s, 'spawn', { ...emptyCtx(), kind: special ? 'special' : b.kind, element: api().elementOf(s, b), block: b, echo: !!b.echo, ...(special ? { special } : {}) });
}

/** 레스렉시온/만해 지속(초) 예외 — 없으면 null */
export function evoReleaseSecondsOf(p: CombatParams): number | null {
  const ev = p.evo;
  const v = ev?.ability.releaseSeconds;
  if (v === undefined) return null;
  return typeof v === 'number' ? v : ev!.relNums[v] ?? ev!.nums[v] ?? null;
}

export function evoReleaseStart(s: CombatState): void {
  fire(s, 'releaseStart', emptyCtx());
}

export function evoReleaseEnd(s: CombatState): void {
  fire(s, 'releaseEnd', emptyCtx());
}

/** 보호막이 피해를 막았다 (broke = 이번에 0 이 됐다) */
export function evoOnShield(s: CombatState, absorbed: number, broke: boolean): void {
  const st = s.evo;
  if (!s.params.evo || !st || absorbed <= 0) return;
  st.shieldAbsorbed += absorbed;
  fire(s, 'shieldHit', { ...emptyCtx(), amount: absorbed });
  if (broke) {
    const total = st.shieldAbsorbed;
    st.shieldAbsorbed = 0;
    fire(s, 'shieldBreak', { ...emptyCtx(), amount: total });
  }
}

/** 이 진화체의 체인 배율 덮어쓰기 (공격 블록, chain 1~): 없으면 null */
export function evoChainMultOf(s: CombatState, chain: number): number | null {
  const v = s.params.evo?.ability.chainMultipliers?.[chain - 1];
  return v === undefined ? null : evoNum(s, v);
}

/** 해방 중 체력 하한 (0 = 없음) */
export function evoHpFloor(s: CombatState): number {
  const v = s.params.evo?.ability.releaseHpFloor;
  return v !== undefined && evoReleasing(s) ? evoNum(s, v) : 0;
}

/** 허 블록 말고는 저절로 안 생김 */
export function evoVoidOnly(p: CombatParams): boolean {
  return p.evo?.ability.spawnRule === 'voidOnly';
}

/** 늘 붙는 효과 합 (passive) */
export function evoStat(s: CombatState, stat: EvoStat): number {
  const ev = s.params.evo;
  if (!ev) return 0;
  let sum = 0;
  const ctx = emptyCtx();
  for (const p of ev.ability.passives ?? []) {
    if (p.stat !== stat || !whenOk(s, p.when) || !needsOk(s, p.need, ctx)) continue;
    sum += passiveValue(s, p, ctx);
  }
  return sum;
}

function passiveValue(s: CombatState, p: EvoPassive, ctx: EvoCtx): number {
  const raw = evoNum(s, p.value) * perValue(s, p.per, ctx);
  return p.max !== undefined ? Math.min(evoNum(s, p.max), raw) : raw;
}

/** 처형선 (적 최대 체력 비율): 평타선 = 처형 특성 선 + execLine, 블록선 = execBlockLine (GDD 8-8 — 다른 색 선) */
export function evoExecLinesOf(s: CombatState): { basic: number; block: number } {
  const ex = s.params.abilityEffects.execute;
  const basic = (ex?.line ?? 0) + (ex || s.params.evo ? evoStat(s, 'execLine') : 0);
  const block = s.params.evo ? evoStat(s, 'execBlockLine') : 0;
  return { basic: Math.min(1, Math.max(0, basic)), block: Math.min(1, Math.max(0, block)) };
}

/** 처형한 수 */
export function evoExecutes(s: CombatState): number {
  return s.evo?.executes ?? 0;
}

/** 처형 판정 (dealDamage 직전): 평타면 처형선 아래 = 남은 체력 전부, 강적·보스는 그 아래에서 모든 피해 ×eliteMult. 돌려주는 값 = 넣을 피해 */
export function evoDamageAdjust(s: CombatState, amount: number, basic: boolean): number {
  const ex = s.params.abilityEffects.execute;
  if (!ex || amount <= 0 || s.enemy.maxHp <= 0) return amount;
  const line = evoExecLinesOf(s).basic;
  if (s.enemy.hp > s.enemy.maxHp * line) return amount;
  if (isElite(s)) return amount * ex.eliteMult;
  if (!basic) return amount;
  if (s.evo) {
    s.evo.executes++;
    proc(s, EXECUTE_TEXT, s.enemy.hp);
    fire(s, 'kill', emptyCtx());
  }
  return Math.max(amount, s.enemy.hp + 1);
}

/** 특수 블록을 지금 쓸 수 있는가 (처형 블록 = 블록 처형선 아래 · 강적·보스 아님) */
export function evoSpecialUsable(s: CombatState, b: Block | undefined): boolean {
  const d = evoSpecialOf(s.params, b?.traitId);
  if (!d) return false;
  if (d.usable === 'execBlock') {
    const line = evoExecLinesOf(s).block;
    return !isElite(s) && line > 0 && s.enemy.hp <= s.enemy.maxHp * line;
  }
  return true;
}

/** 특수 블록 놓기 (maxOnBar 를 넘으면 안 놓음) */
function spawnSpecial(s: CombatState, id: string): boolean {
  const d = s.params.evo?.ability.specials?.[id];
  if (!d) return false;
  if (d.maxOnBar !== undefined && s.tray.filter((b) => specialIdOf(b) === id).length >= evoNum(s, d.maxOnBar, Infinity)) return false;
  return api().place(s, { kind: 'skill', traitId: EVO_TRAIT_PREFIX + id, family: null, element: null, solo: true }) !== null;
}

/** 특수 블록 쓰기 (바의 index): keep 이 아니면 바에서 빠지고 special 규칙. auto = 능력이 대신 누름(해방 끝 자동 사용 등) */
export function useEvoSpecial(s: CombatState, index: number, auto = false): boolean {
  const b = s.tray[index];
  const d = evoSpecialOf(s.params, b?.traitId);
  if (!b || !d || !s.evo) return false;
  if (!evoSpecialUsable(s, b)) return false;
  if (!d.keep) s.tray.splice(index, 1);
  if (!auto) api().addGauge(s, s.params.liberationGaugePerBlock);
  fire(s, 'special', { ...emptyCtx(), kind: 'special', special: d.id, block: b });
  return true;
}

/** 원정으로 넘길 carry 스택 (이번 전투 끝 값) */
export function evoCarryOut(s: CombatState): Record<string, number> | null {
  const ev = s.params.evo;
  if (!ev || !s.evo) return null;
  const out: Record<string, number> = {};
  for (const [name, d] of Object.entries(ev.ability.stacks ?? {})) if (d.carry) out[name] = s.evo.stacks[name]?.n ?? 0;
  return Object.keys(out).length > 0 ? out : null;
}

/** 런 로그 발동 횟수 (abilityProcs 에 evo:<글자> 로 합친다) */
export function evoProcsOf(s: CombatState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(s.evo?.procs ?? {})) out[`evo:${k}`] = v;
  return out;
}

/** 화면 네모(스택 표시): 정의에 mark 가 있는 스택·버프·충전 */
export function evoMarksOf(s: CombatState): { key: string; on: 'self' | 'foe'; icon: string; name: PerFaction<string> | string; value: number; seconds: number | null }[] {
  const ev = s.params.evo;
  const st = s.evo;
  if (!ev || !st) return [];
  const out: ReturnType<typeof evoMarksOf> = [];
  const ts = s.params.tickSeconds;
  for (const [name, d] of Object.entries(ev.ability.stacks ?? {})) {
    const x = st.stacks[name];
    if (!d.mark || !x || x.n <= 0) continue;
    const left = x.exp && x.exp.length > 0 ? (x.exp[x.exp.length - 1]! - s.tick) * ts : null;
    out.push({ key: `evo-s-${name}`, on: d.on ?? 'self', icon: d.mark.icon, name: d.mark.name, value: Math.round(x.n * 10) / 10, seconds: left });
  }
  for (const [name, d] of Object.entries(ev.ability.buffs ?? {})) {
    const b = st.buffs[name];
    if (!d.mark || !b || b.until <= s.tick) continue;
    out.push({ key: `evo-b-${name}`, on: d.on ?? 'self', icon: d.mark.icon, name: d.mark.name, value: b.value, seconds: (b.until - s.tick) * ts });
  }
  for (const [name, d] of Object.entries(ev.ability.charges ?? {})) {
    const c = st.charges[name];
    if (!d.mark || !c || c.n <= 0) continue;
    out.push({ key: `evo-c-${name}`, on: 'self', icon: d.mark.icon, name: d.mark.name, value: c.n, seconds: null });
  }
  return out;
}

/** 이 행동에 쓰는 action 종류 목록 (테스트·점검용) */
export function evoActionsOf(p: CombatParams): EvoAction['act'][] {
  return (p.evo?.ability.rules ?? []).flatMap((r) => r.do.map((a) => a.act));
}
