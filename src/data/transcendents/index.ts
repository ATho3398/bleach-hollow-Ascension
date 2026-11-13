// 초월자 6종 (GDD 22-3, 종족 무관 공용 데이터). 이름·조건 수치는 provisional, 오리지널 3종 이름은 자리 표시. 외형은 그림 대기.
// 결정 규칙(GDD 12-4 v6.037) = 두 캐릭터 진화체 분류 조합(combo) 하나에 초월자 하나 — 엔진(src/engine/transcend.ts)이 조합만 본다. 이 파일은 데이터와 검증만.
import { ATTACK_CATEGORIES, type AttackCategory } from '../schema';
import raw from './transcendents.json';

/** 초월자 결정 조합 (GDD 12-4 v6.037): 두 캐릭터 진화체 공격 분류(물리·특수·혼합) 한 쌍 — 순서 무관. 6가지 조합에 초월자 하나씩 */
export type TranscendentCombo = readonly [AttackCategory, AttackCategory];

/** 순서 무관 조합 키 (분류 이름 순) */
export function comboKey(a: AttackCategory, b: AttackCategory): string {
  return [a, b].sort().join('+');
}

/** 초월 특성 효과 (GDD 12-4 v6.039, C.436): 기존 특성 효과 구조 그대로 — abilities = 진화 특성 id → 세기(AbilityLoadout.owned 와 같은 모양: el:<속성>·el4:<속성>·uniq:<키>·phys:<속성>·disp:<능력치>),
 *  dealt·taken·maxHp·blockCrit = 탈착 특성(traits.json detach)과 같은 칸. 빈 객체 = 효과 없음. 데이터만 채우면 전투·상태 화면에 실린다(엔진은 id 분기 없음) */
export interface TranscendentTraitEffect {
  abilities?: Record<string, number>;
  dealt?: number;
  taken?: number;
  maxHp?: number;
  blockCrit?: number;
}

/** 초월 특성 (GDD 12-4 v6.039): 초월자가 되면 얻고 전투 기반과 상관없이 늘 붙는다(기반 특성과 별도 칸). 내용 [미정] — 지금은 자리만(provisional) */
export interface TranscendentTraitDef {
  name: string;
  description: string;
  effect: TranscendentTraitEffect;
  provisional?: boolean;
}

/** 초월자 전용 블록 하나 (GDD 12-4 v6.048, C.441): 이름·장치만 — 수치는 BALANCE.provisional.transcendentKits[초월자 id].blocks[블록 id].
 *  장치 = solo(체인 안 됨) · counter(적 공격을 받은 뒤 창 안에 쓰면 반격 — 대사) · stack(최대 체인마다 스택, 가득이면 다음 최대 체인이 마무리 기술) ·
 *  releaseSwap(해방 중 이 블록 대신 나오는 블록) · releaseOnly(해방 중에만 — 다른 블록의 releaseSwap 로만 나옴) · upgradeAs(강화 단계를 같이 쓰는 블록) */
export interface TranscendentKitBlockDef {
  id: string;
  name: string;
  /** 블록 칸 글자 (한 글자) */
  short: string;
  /** 화면 연출 키 (clone = 몸 그림 반투명 사본이 때림, 그 밖 = 기존 블록 연출) */
  fx: string;
  /** 체인 단계 이름 (없으면 블록 이름) */
  tierNames?: string[];
  solo?: boolean;
  counter?: { line: string };
  stack?: { finisherName: string };
  releaseSwap?: string;
  releaseOnly?: boolean;
  upgradeAs?: string;
  /** 허(공허) 블록 자리 (GDD 12-4 v6.052 붕옥 블록): 등장 = 허 공식 × 수치, 쓰면 패널티 없이 게이지 + (수치 = balance blocks.<id>.voidSlot) */
  voidSlot?: boolean;
}

/** 초월자 전용 블록 묶음 (GDD 12-4 v6.048): 있으면 '초월자' 전투 기반에서 일반 블록 대신 이 블록만 나온다. 없으면(나머지 5종 — 블록 [미정]) 합체 순간 이어받은 빌드 그대로 */
export interface TranscendentKitDef {
  /** 해방 이름 (해방 수치는 진화체 만해와 같음) */
  liberationName: string;
  /** 리스크 게이지 이름 덮어쓰기 (GDD 12-4 v6.052 — 아이젠 = '붕옥 감응도'): 이 초월자 트랙에선 기반·종족과 상관없이 이 이름 */
  riskGaugeName?: string;
  /** 해방 = 전투 게이지 모드 체인지 (GDD 12-4 v6.052 붕옥 융합): 게이지 ≥ 문턱이면 언제든, 지속 시간 없음, 문턱 밑이면 풀림 (수치 = balance riskRelease — 최소·문턱, 게이지 = 트랙 리스크 그 자체 v6.054) */
  riskRelease?: boolean;
  /** 리스크 게이지 최솟값 (GDD 12-4 v6.054 — 아이젠 붕옥 감응도 20): 이 트랙의 리스크는 원정·둥지·전투 어디서 내려가도 balance riskRelease.floor 밑으로 안 간다 */
  riskFloor?: boolean;
  /** 해방 중엔 회피·되살아나기·스택이 꺼진다 (GDD 12-4 v6.052 융합 중) */
  releaseBare?: boolean;
  /** 리스크 패널티 없음 (GDD 12-4 v6.050): 게이지가 차도 폭주(돌파) 상태·피해·제약 없음 — 쌓이기만 한다 */
  riskPenaltyFree?: boolean;
  /** 기본 회피율을 쓴다 (수치 = balance evadeChance) */
  evade?: boolean;
  /** 쓰러지면 전투당 1회 되살아남 (수치 = balance revive) */
  revive?: { line: string };
  /** 스택 이름 (전투 화면 표시) */
  stackName?: string;
  blocks: TranscendentKitBlockDef[];
  provisional: true;
}

export interface TranscendentDef {
  id: string;
  /** 도감 순서 (작을수록 앞) */
  order: number;
  name: string;
  concept: string;
  /** 오리지널(원작 밖) 초월자 */
  original?: boolean;
  /** 캐릭터 그림 키 (GDD 12-4, C.430): public/art/<키의 . → ->/idle-n 프레임 — 초월자 트랙의 방·상태·전투 몸, 도감·합체 결과 그림. 없으면 자리 표시 */
  art?: string;
  /** 이름 글리치 (GDD 12-4 v6.027, C.430): 화면에 찍히는 이름 일부가 잠깐씩 깨진 글자로 바뀐다. 저장값·읽기 이름은 원래 이름 */
  nameGlitch?: boolean;
  /** 자기 방 (GDD 12-4 v6.032, C.432): 방 목록(src/data/rooms)의 방 키. 없으면 바탕 종족 방 */
  room?: string;
  /** 만든 모델 (GDD 12-4 v6.029, C.431): glitchMosaic = 게임의 캐릭터·적 도트 그림에서 사각 조각을 잘라 모은 네모 도트 하나(시드 고정 기본 모습) + 조각 글리치.
   *  tile = 조각 한 변(64칸 기준 원본 화소), grid = [가로, 세로] 조각 수, scale = 화면 표시 배율(GDD 12-4 v6.037 '지금의 2/3', 없으면 1) */
  model?: {
    kind: 'glitchMosaic'; seed: number; tile: number; grid: [number, number]; scale?: number;
    /** 조각 교체 (GDD 12-4 v6.043, C.437 — 사용자 '블록들이 랜덤하게 계속 바뀌게'): churnMs 다음 교체까지 [최소, 최대] ms · swap 한 번에 바뀌는 조각 수 [최소, 최대] */
    churnMs: [number, number]; swap: [number, number];
    /** 모노톤·흑백 ('가다가 모노톤이나 흑백도'): 교체 조각이 모노톤/흑백일 확률 · 몸 전체 흑백/모노톤 간격·지속 [최소, 최대] ms · 모노톤 색 = 디자인 토큰 이름 */
    monoChance: number; fullMonoEveryMs: [number, number]; fullMonoHoldMs: [number, number]; monoTokens: string[];
    /** 칸 바탕 (C.438): 조각의 투명 화소 = 그 조각 그림 평균색 × cellBgDarken (0~1) — 몸이 늘 꽉 찬 네모 덩어리 */
    cellBgDarken: number;
    provisional?: boolean;
  };
  /** 이 초월자가 나오는 두 캐릭터 진화체 분류 조합 (GDD 12-4 v6.037, provisional 대응) */
  combo: TranscendentCombo;
  /** 합체 뒤 이 초월자 트랙의 종류 (GDD 12-4 v6.028 — src/data/trackKinds/<id>.json: 진화 없음·시간 감소 없음 등) */
  trackKind: string;
  /** 초월 특성 (GDD 12-4 v6.039, C.436) */
  trait: TranscendentTraitDef;
  /** 전용 블록 (GDD 12-4 v6.048, C.441) — 아이젠만 */
  kit?: TranscendentKitDef;
  /** 인간형 모델 스킨 (GDD 12-4 v6.052 '초월자 인간형 스킨', C.443): 기본 모델이 인간형이 아닌 초월자(태초·Unknown)에게 하나씩 더.
   *  그 초월자를 얻으면 가방 > 스킨 > 진화체 > 초월자에 열림. art = 그림 키(파일이 오면 그 그림), 없으면 placeholder(그림 목록 키 — 기존 인간형 종이인형) + '그림 대기' */
  humanSkins?: TranscendentHumanSkinDef[];
  provisional: true;
}

export interface TranscendentHumanSkinDef {
  id: string;
  name: string;
  art: string;
  placeholder: string;
  provisional?: boolean;
}

function humanSkinsOk(v: unknown): boolean {
  if (v === undefined) return true;
  if (!Array.isArray(v) || v.length === 0) return false;
  const ids = new Set<string>();
  return v.every((x: Partial<TranscendentHumanSkinDef>) => !!x && typeof x.id === 'string' && /^[a-z0-9-]+$/.test(x.id) && !ids.has(x.id) && (ids.add(x.id), true)
    && typeof x.name === 'string' && !!x.name && typeof x.art === 'string' && x.art.startsWith('char.') && typeof x.placeholder === 'string' && x.placeholder.startsWith('char.'));
}

function kitErrors(k: unknown): boolean {
  const kit = k as Partial<TranscendentKitDef> | undefined;
  if (kit === undefined) return true;
  if (!kit || typeof kit.liberationName !== 'string' || !kit.liberationName || !Array.isArray(kit.blocks) || kit.blocks.length === 0 || kit.provisional !== true) return false;
  if (kit.riskGaugeName !== undefined && (typeof kit.riskGaugeName !== 'string' || !kit.riskGaugeName)) return false;
  const ids = new Set(kit.blocks.map((b) => b?.id));
  if (ids.size !== kit.blocks.length) return false;
  return kit.blocks.every((b) => b && typeof b.id === 'string' && b.id && typeof b.name === 'string' && b.name && typeof b.short === 'string' && [...b.short].length === 1 && typeof b.fx === 'string'
    && (b.tierNames === undefined || (Array.isArray(b.tierNames) && b.tierNames.every((n) => typeof n === 'string' && n)))
    && (b.releaseSwap === undefined || (ids.has(b.releaseSwap) && b.releaseSwap !== b.id))
    && (b.upgradeAs === undefined || ids.has(b.upgradeAs))
    && (b.voidSlot === undefined || typeof b.voidSlot === 'boolean')
    && (b.counter === undefined || typeof b.counter.line === 'string')
    && (b.stack === undefined || typeof b.stack.finisherName === 'string'))
    && kit.blocks.some((b) => !b.releaseOnly);
}

export function parseTranscendent(r: unknown): TranscendentDef {
  const t = (r ?? {}) as Partial<TranscendentDef>;
  const errors: string[] = [];
  if (typeof t.id !== 'string' || !t.id) errors.push('id');
  if (!Number.isInteger(t.order)) errors.push('order');
  if (typeof t.name !== 'string' || !t.name) errors.push('name');
  if (typeof t.concept !== 'string') errors.push('concept');
  const combo = t.combo as unknown;
  if (!(Array.isArray(combo) && combo.length === 2 && combo.every((c) => (ATTACK_CATEGORIES as readonly string[]).includes(c as string)))) errors.push('combo (물리·특수·혼합 두 개)');
  if (typeof t.trackKind !== 'string' || !t.trackKind) errors.push('trackKind');
  if (t.art !== undefined && (typeof t.art !== 'string' || !t.art.startsWith('char.'))) errors.push('art (char.<이름>)');
  if (t.nameGlitch !== undefined && typeof t.nameGlitch !== 'boolean') errors.push('nameGlitch');
  if (t.room !== undefined && (typeof t.room !== 'string' || !t.room)) errors.push('room');
  const m = t.model as Partial<NonNullable<TranscendentDef['model']>> | undefined;
  if (m !== undefined && !(m.kind === 'glitchMosaic' && Number.isInteger(m.seed) && Number.isInteger(m.tile) && (m.tile as number) > 0
    && Array.isArray(m.grid) && m.grid.length === 2 && m.grid.every((v) => Number.isInteger(v) && v > 0)
    && (m.scale === undefined || (typeof m.scale === 'number' && m.scale > 0 && m.scale <= 2))
    && [m.churnMs, m.swap, m.fullMonoEveryMs, m.fullMonoHoldMs].every((r) => Array.isArray(r) && r.length === 2 && r.every((v) => typeof v === 'number' && v > 0) && r[0]! <= r[1]!)
    && typeof m.monoChance === 'number' && m.monoChance >= 0 && m.monoChance <= 1
    && typeof m.cellBgDarken === 'number' && m.cellBgDarken >= 0 && m.cellBgDarken <= 1
    && Array.isArray(m.monoTokens) && m.monoTokens.length > 0 && m.monoTokens.every((k) => typeof k === 'string' && k.startsWith('--bha-')))) errors.push('model (glitchMosaic seed·tile·grid·scale·churnMs·swap·monoChance·fullMonoEveryMs·fullMonoHoldMs·monoTokens·cellBgDarken)');
  const tr = t.trait as Partial<TranscendentTraitDef> | undefined;
  const fx = tr?.effect as Record<string, unknown> | undefined;
  const numOk = (v: unknown) => v === undefined || (typeof v === 'number' && Number.isFinite(v));
  if (!(tr && typeof tr.name === 'string' && tr.name && typeof tr.description === 'string' && fx && typeof fx === 'object'
    && ['dealt', 'taken', 'maxHp', 'blockCrit'].every((k) => numOk(fx[k]))
    && (fx.abilities === undefined || (typeof fx.abilities === 'object' && fx.abilities !== null && Object.entries(fx.abilities).every(([k, v]) => /^(el|el4|uniq|phys|disp):.+/.test(k) && typeof v === 'number')))
    && Object.keys(fx).every((k) => ['abilities', 'dealt', 'taken', 'maxHp', 'blockCrit'].includes(k)))) errors.push('trait (name·description·effect)');
  if (!humanSkinsOk(t.humanSkins)) errors.push('humanSkins (id·name·art char.·placeholder char.)');
  if (!kitErrors(t.kit)) errors.push('kit (liberationName·blocks id·name·short·fx·releaseSwap·upgradeAs)');
  if (t.provisional !== true) errors.push('provisional (22-3 수치·이름 provisional)');
  if (errors.length > 0) throw new Error(`초월자 데이터 오류 (${String(t.id ?? '?')}): ${errors.join(', ')}`);
  return t as TranscendentDef;
}

/** 도감 순서대로 */
export const TRANSCENDENTS: readonly TranscendentDef[] = (raw as unknown[]).map(parseTranscendent).sort((a, b) => a.order - b.order);

if (new Set(TRANSCENDENTS.map((t) => t.id)).size !== TRANSCENDENTS.length) throw new Error('초월자 id 가 겹친다');
if (new Set(TRANSCENDENTS.map((t) => comboKey(t.combo[0], t.combo[1]))).size !== TRANSCENDENTS.length) throw new Error('초월자 조합이 겹친다 (조합 하나에 초월자 하나)');

export function tryGetTranscendent(id: string): TranscendentDef | undefined {
  return TRANSCENDENTS.find((t) => t.id === id);
}
