// 4단계 진화체 고유 능력·특수 블록·해방 변형·4단계 한 줄 특성 (GDD 8-7 1차 구현, C.499 — docs/drafts/evo-impl-1119.md).
// 데이터 = uniques.json(진화체 id × 종족: 규칙·조건·효과 종류), 수치 = BALANCE.provisional.evoUniques(같은 키 — 해방 중 값은 release). 엔진(src/engine/combat/evoUnique.ts)은
// 장치(규칙·조건·효과 종류)만 알고 진화체·종족 id 로 분기하지 않는다. 3번째 종족은 forms[id] 에 그 종족 칸을 더하면 된다.
// 쓰는 법(다음 세션): docs/dev-log.md C.499 소절 '장치 목록'. 새 진화체 = forms 에 칸 하나 + balance forms 에 수치 하나.
import { BALANCE } from '../../config/balance';
import { pickFaction, type PerFaction } from '../schema';
import raw from './uniques.json';

/** 숫자 칸: 숫자 그대로 또는 balance 수치 키(해방 중이면 release 의 같은 키가 우선) */
export type EvoNum = number | string;

/** 곱하는 값의 출처 (per): chain 체인 수 · consumed 이번 규칙에서 소모한 스택 수 · amount 사건 양(막은 피해·깨진 보호막 등) · damage 이번 공격 피해 ·
 *  bar 바의 블록 수(고정 특수 블록 제외) · bar:<속성> 그 속성 블록 수 · lostHpPct 잃은 체력 %(0~100) · shieldPct 보호막 %(최대 체력 대비 0~100) ·
 *  risk 리스크(호로화) 게이지 · stack:<이름> · buff:<이름>(버프 값) · charge:<이름>(남은 횟수) · chargeValue:<이름>(이번 평타가 쓴 충전 값) */
export type EvoSource = string;

/** 언제 (규칙의 on) */
export const EVO_TRIGGERS = [
  'start', // 전투 시작
  'basicPre', // 평타 피해 계산 직전 (basicMult·forceCrit·ignoreDef 는 여기서만)
  'basic', // 평타를 친 뒤 (every = 평타 n대마다)
  'blockPre', // 블록 피해 계산 직전 (blockMult·blockFlat·blockCrit 는 여기서만)
  'block', // 블록을 쓴 뒤 (crit = 그 블록이 치명)
  'spawn', // 바에 블록이 생겼다
  'every', // seconds 마다 (need 가 참인 동안만 시간이 간다 — 끊겨도 0 으로 돌아가지 않음, GDD 8-7 ②)
  'timer', // timer 동작으로 맞춘 시계가 다 됐다
  'releaseStart', // 레스렉시온/만해 시작 (기본 해방 제외)
  'releaseEnd', // 레스렉시온/만해 끝
  'shieldHit', // 보호막이 피해를 막았다 (amount = 막은 양)
  'shieldBreak', // 보호막이 깨졌다 (amount = 그 보호막이 막은 합)
  'special', // 특수 블록을 썼다 (special = 블록 id)
  'kill', // 처형했다
] as const;
export type EvoTrigger = (typeof EVO_TRIGGERS)[number];

/** 효과 종류 (규칙의 do[].act) */
export const EVO_ACTIONS = [
  'add', // 스택 +value(×per). 스택 정의의 max·overflow·seconds 를 따른다
  'mul', // 스택 ×value (절반 = 0.5)
  'clear', // 스택 0
  'consume', // 스택에서 value(×per)만큼(없으면 전부) 빼고 그 수를 consumed 로
  'buff', // 버프 seconds 동안 value(×per). refresh replace(기본)·max(큰 값)·add(더함)
  'charge', // 다음 평타 value(×per)회 충전 (max), amount(×amountPer) = 충전 값(chargeValue)
  'spawn', // 블록 value 개: block 'draw'(평소 출현표, 허 제외) · 'make'(바 끝 빈 칸에 element 속성('self' = 내 속성)·family 계열 블록 — 그 속성·계열 생성원이 없으면 안 생김) · 특수 블록 id
  'shield', // 보호막 +최대 체력 × value(×per), 합 상한 cap
  'shieldCut', // 보호막 −최대 체력 × value(×per) (피해 아님)
  'blockMult', // (blockPre) 이 블록 피해 +value(×per)
  'blockFlat', // (blockPre) 이 블록에 평타 value(×per)회분 피해를 더함
  'blockCrit', // (blockPre) 이 블록 치명 확률 +value(×per)
  'blockCritDmg', // (blockPre) 이 블록 치명 피해 +value(×per)
  'basicMult', // (basicPre) 이 평타 피해 +value(×per)
  'forceCrit', // (basicPre) 이 평타 치명 확정
  'ignoreDef', // (basicPre) 이 평타 방어 무시 value
  'hit', // 추가 피해 value(×per) × basis: basic 평타 1회 · block 기본 블록 1단계 · last 방금 평타 피해 · raw 숫자 그대로 · void 공허 블록 1개 (element 속성, ignoreDef)
  'basics', // 평타 value 회를 바로 (각 +bonus) — 이 평타는 평타 n대 카운터를 세지 않는다
  'heal', // 회복 value(×per) × of(damage 이번 피해 · maxHp 최대 체력)
  'echo', // (block) 쓴 블록의 잔상(같은 블록 1체인)을 바 끝에 — 잔상은 echo 규칙을 다시 부르지 않는다
  'absorb', // (spawn) 방금 생긴 블록을 바에서 지운다 (흡수 스택은 add 로 따로)
  'useSpecial', // 바의 특수 블록 special 을 바로 쓴다 (없으면 아무것도 안 함)
  'timer', // 시계 timer 를 seconds 로 맞춘다 → 다 되면 on 'timer'
  'timerCut', // 시계 timer 를 seconds 만큼 당긴다 (돌고 있을 때만)
  'execute', // 지금 적을 처형 (강적·보스는 안 됨)
] as const;
export type EvoActionKind = (typeof EVO_ACTIONS)[number];

export interface EvoAction {
  act: EvoActionKind;
  stack?: string;
  buff?: string;
  charge?: string;
  timer?: string;
  special?: string;
  block?: string;
  value?: EvoNum;
  per?: EvoSource | EvoSource[];
  seconds?: EvoNum;
  max?: EvoNum;
  cap?: EvoNum;
  amount?: EvoNum;
  amountPer?: EvoSource | EvoSource[];
  refresh?: 'replace' | 'max' | 'add';
  basis?: 'basic' | 'block' | 'last' | 'raw' | 'void';
  element?: string;
  /** spawn make: 블록 계열 id (없으면 평소 출현표에서 고른 계열) */
  family?: string;
  ignoreDef?: EvoNum;
  bonus?: EvoNum;
  of?: 'damage' | 'maxHp';
}

/** 조건 하나 (규칙의 need[] — 모두 참이어야) */
export interface EvoNeed {
  stack?: string;
  buff?: string;
  charge?: string;
  special?: string;
  atLeast?: EvoNum;
  below?: EvoNum;
  /** 바가 가득 (고정 특수 블록 포함 trayCapacity) */
  barFull?: boolean;
  /** 보호막이 있다 / 없다 */
  shield?: boolean;
  /** 적이 강적·보스다 / 아니다 */
  elite?: boolean;
}

/** 규칙 = 언제(on) + 거르기 + 무엇을(do) */
export interface EvoRule {
  on: EvoTrigger;
  /** release = 레스렉시온/만해 중에만, normal = 그 밖에만 */
  when?: 'release' | 'normal';
  /** basic·block·spawn: 그 횟수마다 (규칙마다 따로 센다, 끊김 없음) */
  every?: EvoNum;
  /** every 트리거 간격(초) */
  seconds?: EvoNum;
  /** block·blockPre·spawn: 블록 속성(void = 공허 블록) */
  element?: string[];
  notElement?: string[];
  /** block·blockPre·spawn: 블록 종류 (없으면 skill — 흡수·기본·물공 블록) */
  kind?: ('skill' | 'void' | 'combo' | 'liberation' | 'special')[];
  minChain?: EvoNum;
  chain?: number[];
  /** block: 그 블록이 치명이었다 */
  crit?: boolean;
  /** block: 잔상 블록이었다(true)/아니었다(false) */
  echo?: boolean;
  /** block: 이 거르기를 통과한 사용이 count 번 연달아 이어지면 (사이에 거르기를 못 넘는 블록을 쓰면 끊김, withinSeconds 가 있으면 그 시간 안에서만 — 없으면 시간 제한 없음). 그 뒤 0 부터 */
  streak?: { count: EvoNum; withinSeconds?: EvoNum };
  /** basicPre·basic: 이번 평타가 이 충전을 썼다 */
  charge?: string;
  special?: string;
  timer?: string;
  need?: EvoNeed[];
  do: EvoAction[];
  /** 발동 작은 글자 (런 로그 발동 횟수 키 evo:<글자>) */
  proc?: string;
}

/** 늘 붙는 효과 (passive): stat 에 value(×per, 상한 max) */
export const EVO_STATS = [
  'basicPower', // 평타 피해 +
  'blockPower', // 블록 피해 +
  'dealt', // 주는 모든 피해 +
  'attackSpeed', // 공격 속도 + (평타 간격 ÷ (1 + 값))
  'interval', // 평타 간격 −비율 (간격 × (1 − 값), 음수면 늘어남)
  'intervalCut', // 평타 간격 −초
  'crit', // 평타 치명 확률 +(상한도 같이)
  'critDmg', // 치명 피해 +
  'blockCrit', // 블록 치명 확률 +(상한도 같이)
  'petPower', // 펫 공격 피해 +
  'execLine', // 평타 처형선 + (처형 특성의 선에 더함)
  'execBlockLine', // 블록 처형선 + (처형 특수 블록용, 다른 색 선)
  'ignoreDef', // 평타 방어 무시 +
  'offenseBasic', // 평타 피해 능력치: value 1 = 공격력·지능 중 높은 쪽, 2 = 평균 (1 이상이면 켜짐)
  'offenseBlock', // 블록 피해 능력치: 같은 값
] as const;
export type EvoStat = (typeof EVO_STATS)[number];

export interface EvoPassive {
  stat: EvoStat;
  value: EvoNum;
  per?: EvoSource | EvoSource[];
  max?: EvoNum;
  when?: 'release' | 'normal';
  need?: EvoNeed[];
}

/** 표시 네모 (GDD 7-13 스택 표시): 아이콘·이름. on 은 스택 정의의 on */
export interface EvoMark {
  icon: string;
  name: PerFaction<string> | string;
}

export interface EvoStackDef {
  max?: EvoNum;
  /** 스택마다 따로 도는 시간(초) — 없으면 영구 */
  seconds?: EvoNum;
  /** self = 내게 쌓임(내 체력 막대 위), foe = 적에게 건 것(적 체력 막대 위) */
  on?: 'self' | 'foe';
  /** cap = 가득이면 더 안 쌓임(기본), reset = 가득에서 더 쌓으면 0 */
  overflow?: 'cap' | 'reset';
  /** 원정 동안 유지 (다음 전투 시작 값으로 넘긴다) */
  carry?: boolean;
  mark?: EvoMark;
}
export interface EvoBuffDef {
  on?: 'self' | 'foe';
  mark?: EvoMark;
}
export interface EvoChargeDef {
  max?: EvoNum;
  mark?: EvoMark;
}

/** 특수 블록 (GDD 8-7 '특수 블록'): 바에 놓이는 진화체 전용 블록. 체인으로 묶이지 않는다 */
export interface EvoSpecialDef {
  name: PerFaction<string> | string;
  /** 블록 위 한 글자 */
  short: string;
  description?: PerFaction<string> | string;
  /** 바 맨 앞 n칸 고정 (전투 시작 때 놓임, 섞이지 않음) */
  fixed?: EvoNum;
  /** 써도 바에서 안 사라짐 */
  keep?: boolean;
  /** always(기본) · execBlock = 적 체력이 블록 처형선 아래이고 강적·보스가 아닐 때만 켜짐 */
  usable?: 'always' | 'execBlock';
  /** 바에 한 번에 최대 몇 개 (기본 제한 없음) */
  maxOnBar?: EvoNum;
}

export interface EvoAbilityDef {
  name?: PerFaction<string> | string;
  /** 상태 화면 한 줄 ({키} = 수치, {키%} = 백분율) */
  description: PerFaction<string> | string;
  /** 해방(레스렉시온/만해) 때 바뀌는 것 한 줄 (같은 틀, 수치는 release 값) */
  releaseDescription?: PerFaction<string> | string;
  /** voidOnly = 허(공허) 블록 말고는 블록이 저절로 안 생김(생성 타이머·해방 순간 지급) */
  spawnRule?: 'voidOnly';
  stacks?: Record<string, EvoStackDef>;
  buffs?: Record<string, EvoBuffDef>;
  charges?: Record<string, EvoChargeDef>;
  specials?: Record<string, EvoSpecialDef>;
  rules?: EvoRule[];
  passives?: EvoPassive[];
  /** 이 진화체의 체인 배율 덮어쓰기 (1·2·3체인, 공격 블록만 — 계열 단계 배율 대신) */
  chainMultipliers?: EvoNum[];
  /** 레스렉시온/만해 지속(초) 예외 */
  releaseSeconds?: EvoNum;
  /** 레스렉시온/만해 중 체력이 이 값 아래로 안 떨어짐 */
  releaseHpFloor?: EvoNum;
}

/** 4단계 한 줄 특성 효과 종류 (특성 칸 — 받으면 영구, 해방해도 그대로 GDD 8-6) */
export const EVO_TRAIT_EFFECTS = [
  'attackSpeed', // 공격 속도 +value
  'crit', // 평타 치명 확률 +value(상한도)
  'blockCrit', // 블록 치명 확률 +value(상한도)
  'chainPower', // chain 체인 블록 위력 +value
  'offenseMax', // 피해 계산 능력치 = 공격력·지능 중 높은 쪽 (평타·블록 모두)
  'execute', // 처형: 적 체력 line 이하에서 평타 = 처형, 강적·보스는 그 아래에서 주는 피해 ×eliteMult. 이 특성을 대표로 주는 진화체가 아니면 weakLine·weakEliteMult
] as const;
export type EvoTraitEffect = (typeof EVO_TRAIT_EFFECTS)[number];

export interface EvoTraitDef {
  effect: EvoTraitEffect;
  name: PerFaction<string>;
  description: PerFaction<string>;
  /** chainPower 의 체인 수 */
  chain?: number;
}

/** 진화체 하나 × 종족 하나 */
export interface EvoFormEntry {
  /** 4단계 한 줄 특성 (traits 키): 이 진화체의 4단계 대표 특성(el4:)을 대신한다 */
  trait?: string;
  ability?: EvoAbilityDef;
  /** none = 해방 없음(레스렉시온/만해·기본 해방 모두 막음, 해방 버튼·도전 숨김) */
  release?: 'none';
  /** 펫 칸 + (훅 자리 — 펫 쪽 연결은 코딩314) */
  extraPetSlots?: EvoNum;
}

interface EvoFile {
  provisional: boolean;
  traits: Record<string, EvoTraitDef>;
  forms: Record<string, PerFaction<EvoFormEntry>>;
}

const DATA = raw as unknown as EvoFile;

/** 수치 표 한 칸: 키 → 값, release = 해방 중 값 */
export type EvoNums = Record<string, number> & { release?: Record<string, number> };
type EvoBalance = { traits: Record<string, Record<string, number>>; forms: Record<string, Record<string, Record<string, unknown>>> };
const EB = (): EvoBalance => (BALANCE.provisional as unknown as { evoUniques: EvoBalance }).evoUniques;

export const EVO_UNIQUES_PROVISIONAL: boolean = DATA.provisional;

/** 진화체 × 종족 데이터 (없으면 null) */
export function evoFormEntry(formId: string | null | undefined, factionId: string): EvoFormEntry | null {
  if (!formId) return null;
  return DATA.forms[formId]?.[factionId] ?? null;
}

/** 진화체 × 종족 수치 (balance) — 없으면 빈 표 */
export function evoNumsOf(formId: string, factionId: string): EvoNums {
  return (EB().forms[formId]?.[factionId] ?? {}) as EvoNums;
}

export function evoTraitDef(key: string): EvoTraitDef | null {
  return DATA.traits[key] ?? null;
}

export function evoTraitNums(key: string): Record<string, number> {
  return EB().traits[key] ?? {};
}

/** 그 진화체가 이 특성을 대표로 주는가 (종족 하나라도) — 처형 특성의 센 값(허무형) 판정 */
export function evoTraitIsHome(formId: string | null | undefined, traitKey: string): boolean {
  if (!formId) return false;
  return Object.values(DATA.forms[formId] ?? {}).some((e) => e.trait === traitKey);
}

/** 해방 없음 진화체인가 (GDD 8-7 프레네시 — 해방 버튼·아란칼화/구상화 도전 숨김) */
export function evoReleaseBlocked(formId: string | null | undefined, factionId: string): boolean {
  return evoFormEntry(formId, factionId)?.release === 'none';
}

/** 펫 칸 + (훅 자리 — 코딩314 가 펫 쪽에 연결) */
export function evoExtraPetSlots(formId: string | null | undefined, factionId: string): number {
  const e = evoFormEntry(formId, factionId);
  if (!e?.extraPetSlots || !formId) return 0;
  return typeof e.extraPetSlots === 'number' ? e.extraPetSlots : Number(evoNumsOf(formId, factionId)[e.extraPetSlots] ?? 0);
}

/** 데이터가 있는 진화체 id 목록 */
export function evoFormIds(): string[] {
  return Object.keys(DATA.forms);
}

/** 표시 글자 (종족별 또는 한 벌) */
export function evoText(v: PerFaction<string> | string | undefined, factionId: string): string {
  if (v === undefined) return '';
  return typeof v === 'string' ? v : pickFaction(v, factionId);
}

const pctText = (x: number) => `${Math.round(x * 1000) / 10}`;

/** 설명 틀 채우기: {키} = 수치, {키%} = 백분율(0.03 → 3%) */
export function fillEvoText(text: string, nums: Record<string, number>): string {
  return text.replace(/\{([A-Za-z0-9_]+)(%?)\}/g, (_m, k: string, p: string) => {
    const v = nums[k];
    if (v === undefined) return `{${k}}`;
    return p ? `${pctText(v)}%` : String(Math.round(v * 100) / 100);
  });
}

/** 해방 중 수치 = 기본 위에 release 덮어쓰기 */
export function evoReleaseNums(n: EvoNums): Record<string, number> {
  const { release, ...base } = n;
  return { ...(base as Record<string, number>), ...(release ?? {}) };
}

// ── 데이터 검사 ──

function numKeysOfRule(r: EvoRule): EvoNum[] {
  const out: EvoNum[] = [];
  for (const k of ['every', 'seconds', 'minChain'] as const) if (r[k] !== undefined) out.push(r[k]!);
  if (r.streak) out.push(r.streak.count, ...(r.streak.withinSeconds !== undefined ? [r.streak.withinSeconds] : []));
  for (const n of r.need ?? []) for (const k of ['atLeast', 'below'] as const) if (n[k] !== undefined) out.push(n[k]!);
  for (const a of r.do) for (const k of ['value', 'seconds', 'max', 'cap', 'amount', 'ignoreDef', 'bonus'] as const) if (a[k] !== undefined) out.push(a[k]!);
  return out;
}

/** 데이터 검사: 트리거·효과·능력치 종류가 엔진이 아는 것이고, 수치 키가 balance 에 있고, 참조한 스택·버프·충전·특수 블록이 정의돼 있다 */
export function validateEvoUniques(d: EvoFile = DATA, balance: EvoBalance = EB()): string[] {
  const errors: string[] = [];
  for (const [key, t] of Object.entries(d.traits)) {
    if (!(EVO_TRAIT_EFFECTS as readonly string[]).includes(t.effect)) errors.push(`특성 ${key}: 모르는 효과 ${t.effect}`);
    if (!t.name || Object.keys(t.name).length === 0) errors.push(`특성 ${key}: 이름 없음`);
    if (t.effect === 'chainPower' && !t.chain) errors.push(`특성 ${key}: chainPower 는 chain`);
  }
  for (const [formId, byFaction] of Object.entries(d.forms)) {
    for (const [fac, e] of Object.entries(byFaction)) {
      const where = `${formId}.${fac}`;
      const nums = (balance.forms[formId]?.[fac] ?? {}) as EvoNums;
      const has = (v: EvoNum | undefined) => v === undefined || typeof v === 'number' || nums[v] !== undefined;
      if (e.trait && !d.traits[e.trait]) errors.push(`${where}: 모르는 특성 ${e.trait}`);
      if (e.release !== undefined && e.release !== 'none') errors.push(`${where}: release 는 'none' 만`);
      if (!has(e.extraPetSlots)) errors.push(`${where}: extraPetSlots 수치 키 없음`);
      for (const k of Object.keys(nums.release ?? {})) if (nums[k] === undefined) errors.push(`${where}: release.${k} 의 기본 값이 없다`);
      const a = e.ability;
      if (!a) continue;
      if (!a.description) errors.push(`${where}: 설명 없음`);
      for (const k of ['releaseSeconds', 'releaseHpFloor'] as const) if (!has(a[k])) errors.push(`${where}: ${k} 수치 키 없음`);
      for (const v of a.chainMultipliers ?? []) if (!has(v)) errors.push(`${where}: chainMultipliers 수치 키 없음`);
      const stacks = a.stacks ?? {};
      const buffs = a.buffs ?? {};
      const charges = a.charges ?? {};
      const specials = a.specials ?? {};
      for (const [n, sd] of Object.entries(stacks)) for (const v of [sd.max, sd.seconds]) if (!has(v)) errors.push(`${where}: 스택 ${n} 수치 키 없음`);
      for (const [n, sp] of Object.entries(specials)) {
        if (!sp.name || !sp.short) errors.push(`${where}: 특수 블록 ${n} 이름·글자 없음`);
        for (const v of [sp.fixed, sp.maxOnBar]) if (!has(v)) errors.push(`${where}: 특수 블록 ${n} 수치 키 없음`);
      }
      const src = (p: EvoSource | EvoSource[] | undefined) => {
        for (const x of p === undefined ? [] : Array.isArray(p) ? p : [p]) {
          const [kind, name] = x.split(':') as [string, string | undefined];
          const ok = ['chain', 'consumed', 'amount', 'damage', 'bar', 'lostHpPct', 'shieldPct', 'risk', 'one'].includes(kind) && (name === undefined || kind === 'bar')
            || (kind === 'stack' && !!name && name in stacks) || (kind === 'buff' && !!name && name in buffs)
            || ((kind === 'charge' || kind === 'chargeValue') && !!name && name in charges);
          if (!ok) errors.push(`${where}: 모르는 per ${x}`);
        }
      };
      const need = (list: EvoNeed[] | undefined) => {
        for (const n of list ?? []) {
          if (n.stack && !(n.stack in stacks)) errors.push(`${where}: need 스택 ${n.stack} 없음`);
          if (n.buff && !(n.buff in buffs)) errors.push(`${where}: need 버프 ${n.buff} 없음`);
          if (n.charge && !(n.charge in charges)) errors.push(`${where}: need 충전 ${n.charge} 없음`);
          if (n.special && !(n.special in specials)) errors.push(`${where}: need 특수 블록 ${n.special} 없음`);
        }
      };
      for (const [i, r] of (a.rules ?? []).entries()) {
        const at = `${where} 규칙 ${i}`;
        if (!(EVO_TRIGGERS as readonly string[]).includes(r.on)) errors.push(`${at}: 모르는 트리거 ${r.on}`);
        if (r.on === 'every' && r.seconds === undefined) errors.push(`${at}: every 는 seconds`);
        if (r.on === 'special' && !(r.special && r.special in specials)) errors.push(`${at}: special 블록 없음`);
        if (r.on === 'timer' && !r.timer) errors.push(`${at}: timer 이름 없음`);
        if (r.charge && !(r.charge in charges)) errors.push(`${at}: 충전 ${r.charge} 없음`);
        for (const v of numKeysOfRule(r)) if (!has(v)) errors.push(`${at}: 수치 키 ${String(v)} 없음`);
        need(r.need);
        if (!Array.isArray(r.do) || r.do.length === 0) errors.push(`${at}: do 비었음`);
        for (const x of r.do ?? []) {
          if (!(EVO_ACTIONS as readonly string[]).includes(x.act)) errors.push(`${at}: 모르는 효과 ${x.act}`);
          if (['add', 'mul', 'clear', 'consume'].includes(x.act) && !(x.stack && x.stack in stacks)) errors.push(`${at}: 스택 ${x.stack} 없음`);
          if (x.act === 'buff' && !(x.buff && x.buff in buffs)) errors.push(`${at}: 버프 ${x.buff} 없음`);
          if (x.act === 'buff' && x.seconds === undefined) errors.push(`${at}: 버프는 seconds`);
          if (x.act === 'charge' && !(x.charge && x.charge in charges)) errors.push(`${at}: 충전 ${x.charge} 없음`);
          if (x.act === 'spawn' && !(x.block === 'draw' || x.block === 'make' || (x.block && x.block in specials))) errors.push(`${at}: spawn block 은 draw·make 또는 특수 블록 id`);
          if (x.act === 'spawn' && x.block === 'make' && !x.element && !x.family) errors.push(`${at}: spawn make 는 element 또는 family`);
          if (x.act === 'useSpecial' && !(x.special && x.special in specials)) errors.push(`${at}: useSpecial 블록 없음`);
          if ((x.act === 'timer' || x.act === 'timerCut') && (!x.timer || x.seconds === undefined)) errors.push(`${at}: timer 는 이름·seconds`);
          if (x.act === 'shield' && x.cap === undefined) errors.push(`${at}: shield 는 cap`);
          if (x.act === 'hit' && !x.basis) errors.push(`${at}: hit 는 basis`);
          if (['blockMult', 'blockFlat', 'blockCrit', 'blockCritDmg'].includes(x.act) && r.on !== 'blockPre') errors.push(`${at}: ${x.act} 는 blockPre 에서만`);
          if (['basicMult', 'forceCrit', 'ignoreDef'].includes(x.act) && r.on !== 'basicPre') errors.push(`${at}: ${x.act} 는 basicPre 에서만`);
          src(x.per);
          src(x.amountPer);
        }
      }
      for (const [i, p] of (a.passives ?? []).entries()) {
        if (!(EVO_STATS as readonly string[]).includes(p.stat)) errors.push(`${where} 효과 ${i}: 모르는 능력치 ${p.stat}`);
        for (const v of [p.value, p.max]) if (!has(v)) errors.push(`${where} 효과 ${i}: 수치 키 없음`);
        src(p.per);
        need(p.need);
      }
    }
  }
  return errors;
}
{
  const errors = validateEvoUniques();
  if (errors.length > 0) throw new Error(`진화체 고유 능력 데이터 오류:\n- ${errors.join('\n- ')}`);
}
