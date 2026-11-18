// 종이인형 관절 편집기 (시험용 페이지) — 게임 코드의 pose.ts 를 그대로 쓰고, 값은 작업본(draft.ts, GDD 96장 36)
import { DRAFT_RIGS, type DraftRig } from './draft';
import { apply, bodyBones, boneMatrices, fxAt, hairRect, insideFrame, jointMoveShift, layerMatrix, lookLayers, motionLook, motionSpeedOf, orderLayers, resolveMotions, samplePose, slotsOf, type BodyJoints, type Key, type Motion, type PartArt, type Pose, type Rig } from '../../src/data/art/rig/pose';
import { followMove } from './follow';
import { createFlame, type FlameLayer } from './flame';
import { createChain, type ChainSpec } from './chain';
import { encodeGif, zipStore } from './gifEncode';
import { fxSvg } from '../../src/ui/bha/rigFx';

declare const ART_MAP: Record<string, string>;
/** claude.ai 아티팩트 런타임(있을 때만). db = 편집기 값을 서버에 저장 — 다른 기기·Claude 가 읽는다 */
type DocRef = { get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>; set(d: Record<string, unknown>): Promise<void> };
type Comments = {
  canSendToClaude(): Promise<string>;
  anchorFor(el: Element): Promise<unknown>;
  sendToClaude(t: { anchor: unknown; text: string }): Promise<{ threadId: string }>;
};
declare const claude: {
  use(name: 'db'): Promise<{ doc(path: string): DocRef } | null>;
  use(name: 'comments'): Promise<Comments | null>;
  use(name: 'downloads'): Promise<{ save(r: { filename: string; data: Blob }): Promise<{ status: string }> } | null>;
} | undefined;
const K_FULL = 6;
let K = K_FULL; // 미리보기 배율(화면 칸/캔버스 칸) — 넓은 몸이 한 줄에 안 들어가면 fitWrap 이 5·4 로 줄인다
// 저장 칸 이름은 바꾸지 않는다(바꾸면 사용자가 맞춘 값이 사라진다). 옛 이름(v1~v3)에 남은 값도 읽어 온다
const LEGACY = ['bha-rig-editor-v3', 'bha-rig-editor-v2', 'bha-rig-editor-v1'];
/** 저장 = 절대값(관절·부위 자리·외형 층 자리·앞뒤 순서) + 그때의 게임 데이터 표시(dataStamp).
 * 게임 데이터가 바뀌었으면(Claude 가 사용자 값을 넣었거나 새 시트) 이 기기에 남은 옛 저장은 버리고 데이터 값을 쓴다 —
 * 서버 저장은 Claude 가 데이터를 바꿀 때마다 같이 맞춘다 */
type Saved = Partial<Rig> & { chain?: ChainSpec; dataStamp?: string; slotsEdited?: boolean; motionEdits?: MotionEdits; motionOrder?: MotionOrder; bodySlots?: Record<string, string[]> };
/** 동작에만 쓰는 그림 앞뒤 순서(GDD 115-A 62, 사용자 2026-11-01 "부위별 레이어도, 동작에서만이 작동 되야지"): '<동작 묶음>/<동작 id>' → 슬롯 id 목록(뒤 → 앞) */
type MotionOrder = Record<string, string[]>;
/** 동작 키 고친 것(사용자 2026-10-31 "이 모션에만 값 저장하기"): '<동작 묶음>/<동작 id>' → 뼈 → 키 목록(그 뼈 트랙 통째). 묶음이 없으면 '/<동작 id>' */
type MotionEdits = Record<string, Record<string, Key[]>>;
const stampOf = (r: unknown) => {
  let h = 2166136261;
  const t = JSON.stringify(r);
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
};
/** 뼈대마다(사람형·짐승형 — GDD 96장 41) 따로 고친 값·저장 자리. 사람형 저장 자리 이름은 예전 그대로 */
interface Ctx { chain: ChainSpec | null; id: string; src: DraftRig; rig: Rig; stamp: string; store: string; db: string; fix: string; slotsEdited: boolean; dbRef: DocRef | null; medits: MotionEdits; morder: MotionOrder }
const CTX: Record<string, Ctx> = Object.fromEntries(Object.entries(DRAFT_RIGS).map(([id, src]) => {
  const tail = id === 'humanoid' ? '' : `-${id}`;
  return [id, { chain: src.chain ? (JSON.parse(JSON.stringify(src.chain)) as ChainSpec) : null, id, src, rig: JSON.parse(JSON.stringify(src.rig)) as Rig, stamp: stampOf({ rig: src.rig, motions: src.motions, sets: src.sets, chain: src.chain }), store: `bha-rig-editor${tail}`, db: `rig/editor${tail}`, fix: `rig/fixed${tail}`, slotsEdited: false, dbRef: null, medits: {}, morder: {} }];
}));
let C: Ctx = CTX.humanoid!;
let rig: Rig = C.rig;
/** 외형 id → 뼈대 */
const ctxOfLook = (l: string) => Object.values(CTX).find((c) => c.rig.looks[l]) ?? C;
/** 외형 층(머리카락·칼·칼집·망토 등): 외형에 그림으로 붙은 것 전부 */
const lookParts = (lk: Rig['looks'][string]) => Object.keys(lk).filter((k) => typeof lk[k] === 'object');

function merge(c: Ctx, s: Saved): boolean {
  const rig = c.rig;
  if (s.dataStamp !== c.stamp) return false;
  // 사슬 자리(GDD 115-A 153): 그 뼈대에 사슬이 있을 때만, 띠·끝의 조각·점·방향·길이
  if (c.chain && s.chain) { c.chain.bands = JSON.parse(JSON.stringify(s.chain.bands)); c.chain.tails = JSON.parse(JSON.stringify(s.chain.tails)); }
  c.medits = JSON.parse(JSON.stringify(s.motionEdits ?? {})) as MotionEdits;
  c.morder = JSON.parse(JSON.stringify(s.motionOrder ?? {})) as MotionOrder;
  if (s.bones) for (const b of rig.bones) {
    const v = s.bones.find((x) => x.id === b.id);
    if (v) b.pivot = v.pivot; // 쉬는 각도(restRot)는 편집기에서 안 바꾸므로 데이터 값
  }
  // 몸별 관절(자리·기본 각도): 있는 몸·뼈만
  if (s.bodyJoints) for (const [bid, j] of Object.entries(s.bodyJoints)) {
    if (!rig.bodies[bid] || typeof j !== 'object') continue;
    const ok = (k: string) => rig.bones.some((b) => b.id === k);
    rig.bodyJoints ??= {};
    rig.bodyJoints[bid] = {
      pivots: Object.fromEntries(Object.entries(j.pivots ?? {}).filter(([k]) => ok(k))),
      rot: Object.fromEntries(Object.entries(j.rot ?? {}).filter(([k]) => ok(k))),
      shift: Object.fromEntries(Object.entries(j.shift ?? {}).filter(([k]) => ok(k))),
    };
  }
  if (s.bodySlots) {
    rig.bodySlots = Object.fromEntries(Object.entries(s.bodySlots).filter(([b]) => rig.bodies[b]).map(([b, o]) => [b, o.filter((id) => rig.slots.some((y) => y.id === id))]));
  }
  if (s.slots && s.slotsEdited) {
    c.slotsEdited = true;
    const order = s.slots.map((x) => x.id).filter((id) => rig.slots.some((y) => y.id === id));
    rig.slots = [...order.map((id) => rig.slots.find((y) => y.id === id)!), ...rig.slots.filter((y) => !order.includes(y.id))];
  }
  if (s.bodies) for (const [b, parts] of Object.entries(rig.bodies)) {
    for (const [k, cur] of Object.entries(parts)) { const v = s.bodies[b]?.[k]; if (v) cur.at = [v.at[0], v.at[1]]; }
  }
  if (s.looks) for (const [lid, lk] of Object.entries(rig.looks)) {
    for (const k of lookParts(lk)) {
      const v = s.looks[lid]?.[k];
      const cur = lk[k];
      if (typeof cur === 'object' && typeof v === 'object') cur.at = [v.at[0], v.at[1]];
    }
  }
  return true;
}
function resetRig(c: Ctx) {
  const fresh: Rig = JSON.parse(JSON.stringify(c.src.rig));
  const r = c.rig;
  r.bones = fresh.bones; r.slots = fresh.slots; r.bodies = fresh.bodies; r.looks = fresh.looks; r.bodyJoints = fresh.bodyJoints; r.bodySlots = fresh.bodySlots; c.slotsEdited = false; c.medits = {}; c.morder = {};
  if (c.chain && c.src.chain) { c.chain.bands = JSON.parse(JSON.stringify(c.src.chain.bands)); c.chain.tails = JSON.parse(JSON.stringify(c.src.chain.tails)); }
}
for (const c of Object.values(CTX)) {
  try {
    const raw = localStorage.getItem(c.store);
    if (raw) merge(c, JSON.parse(raw) as Saved);
  } catch { /* 저장 못 쓰는 환경 */ }
}
/** 사용자 도트를 잘라 쓰거나 조립한 몸(역관절·덩치·두건 — cuts·assembled): 칼 없음, _L = 뒤(먼 쪽)·_R = 앞(가까운 쪽) 이름 (GDD 115-A 72·94) */
const isCreature = () => {
  const r = rig as unknown as { cuts?: Record<string, unknown>; assembled?: Record<string, unknown> };
  return !!(r.cuts?.[curBody()] || r.assembled?.[curBody()]);
};
// 팔·다리 이름은 모든 몸이 같다(사용자 2026-11-13 "부위별 이름 싹 다 통일시켜 — 칼 든 손 = 오른손(앞손), 칼 안든 손 = 왼손(뒷손)", 115-A 123):
// 예전의 호로 전용 이름(뒤 위팔·앞 위팔·뒷다리 허벅지…)은 없앰. 팔이 한 조각인 몸(아래팔 그림 없음)만 '오른팔(앞손)'·'왼팔(뒷손)'
const CREATURE_GROUPS: Record<string, string> = {};
const NAMES = (): Record<string, string> => {
  const base = rig.edit?.names ?? {};
  if (!rig.looks[look] || !isCreature()) return base;
  const body = rig.bodies[curBody()] ?? {};
  return { ...base, ...(body.forearm_R ? {} : { arm_L: '오른팔(앞손)', arm_R: '왼팔(뒷손)' }), ...(body.fold1 ? { cape: '로브 아랫단' } : {}), ...(curBody() === 'hv' ? { cape: '꼬리', cape2: '꼬리 2', cape3: '꼬리 끝' } : {}) }; // 속도형은 망토 마디가 꼬리
};
/** 지금 몸이 쓰는 동작(역관절 몸은 동작 묶음을 덮은 것) */
const motionsNow = (): Record<string, Motion> => {
  const out = { ...resolveMotions(rig, C.src.motions, C.src.sets, curBody()) };
  const set = rig.bodyMotions?.[curBody()] ?? curBody();
  // 고친 동작 트랙을 덮는다: 기본 동작 것 먼저, 이 몸의 동작 묶음 것 나중
  const entries = Object.entries(C.medits).sort(([a], [b]) => (a.startsWith('/') ? 0 : 1) - (b.startsWith('/') ? 0 : 1));
  for (const [key, edits] of entries) {
    const [s0, id] = key.split('/') as [string, string];
    if (s0 && s0 !== set) continue;
    const m = out[id];
    if (m) out[id] = { ...m, tracks: { ...m.tracks, ...edits } };
  }
  // 이 동작에만 바꾼 앞뒤 순서
  for (const [key, order] of Object.entries(C.morder)) {
    const [s0, id] = key.split('/') as [string, string];
    if (s0 && s0 !== set) continue;
    const m = out[id];
    if (m) out[id] = { ...m, order };
  }
  return out;
};
/** 지금 동작을 고칠 때 넣을 자리 = 이 몸의 동작 묶음(없으면 몸 이름으로 새 묶음 — 고정할 때 apply_editor.py 가 만든다). 다른 몸 동작은 안 바뀜 */
function motionKeyOf(id: string): string {
  return `${rig.bodyMotions?.[curBody()] ?? curBody()}/${id}`;
}

let look = 'arrancar-base';
let sel = 'arm_L';
const chains = new Map<string, ReturnType<typeof createChain>>();
let mode: 'pivot' | 'part' | 'chain' = 'pivot';
let motion: string | null = null;
let mt = 0;
/** 저장 범위: 기본 자세(이 몸) / 이 동작에만(그 동작 내내 더해지는 각도·위치) — 사용자 2026-10-31. 고치는 동안 동작은 멈추지 않는다 */
let scope: 'base' | 'motion' = 'base';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const stage = $('stage');
const out = $<HTMLTextAreaElement>('out');
let W = 0;
let H = 0;
function sizeStage() {
  [W, H] = rig.canvas;
  stage.style.width = `${W * K}px`;
  stage.style.height = `${H * K}px`;
  fitWrap();
  fitSide();
}
/** 미리보기 칸 넓이: 지금 외형의 부위가 캔버스 밖으로 나간 만큼 + 동작 여유(사용자 2026-11-09 "편집창 미리보기 넓이 늘려. 짤려서 잘 안보인다", GDD 115-A 75) */
function fitWrap() {
  const wrap = stage.parentElement;
  if (!wrap || !rig.looks[look]) return;
  let x0 = 0;
  let x1 = W;
  for (const l of lookLayers(rig, look)) {
    x0 = Math.min(x0, l.at[0]);
    x1 = Math.max(x1, l.at[0] + l.size[0]);
  }
  // 위·아래도(두건처럼 캔버스 위로 크게 나가는 몸 — 사용자 2026-11-10 "툴이 뭔가 잘못됐다고 느끼지?": 머리가 미리보기 위로 나가 탭 단추를 덮었음, GDD 115-A 94)
  let y0 = 0;
  let y1 = H;
  for (const l of lookLayers(rig, look)) {
    y0 = Math.min(y0, l.at[1]);
    y1 = Math.max(y1, l.at[1] + l.size[1]);
  }
  // 팔 휘두르는 여유(캔버스 칸) = 16. 단, 몸이 넓은 외형(호로)은 미리보기가 넓어져 옆의 동작 단추 칸이 다음 줄로 밀린다
  // (사용자 2026-11-12 10:3x "호로가 미리보기가 크니까, 옆에 모션 창이 다음줄로 밀린다고") → 한 줄에 들어갈 때까지 여유를 줄인다(가장 작게 2칸)
  const row = wrap.closest<HTMLElement>('.stagerow');
  const side = row?.querySelector<HTMLElement>('.side');
  const tool = row?.querySelector<HTMLElement>('.toolcol');
  let minL = 140, minR = 60; // 좌우 여유의 가장 작은 값(px) — 그래도 안 들어가면 80·40 까지 줄인다(115-A 135)
  const widthOf = (mm: number, k = K) => W * k + Math.max(minL, (mm - x0) * k) + Math.max(minR, (x1 - W + mm) * k);
  let m = 16;
  K = K_FULL;
  if (row && side) {
    // 동작 칸 너비는 배율마다 다르다: 미리보기가 낮아지면 단추가 옆으로 새 줄을 만든다(fitSide) — 그 너비까지 넣어 잰다
    // (사용자 2026-11-14 "무월 툴 ui 다 망가졋잖아": 3배에서 단추 칸이 두 줄이 돼 미리보기가 도구 칸 아래로 밀렸음, GDD 115-A 135)
    // 보일 단추 수: 단추 숨김(syncMotionButtons)이 이 뒤에 돌 수도 있어 지금 몸의 동작으로 직접 센다(처음 그릴 때는 아직 못 세면 보이는 것만)
    let ms: Record<string, unknown> | null = null;
    try { ms = motionsNow(); } catch { ms = null; }
    const nSide = [...side.children].filter((c) => {
      const mm = (c as HTMLElement).dataset.m;
      return ms && mm ? mm === 'stop' || !!ms[mm] : !(c as HTMLElement).hidden;
    }).length;
    const rowH = (side.querySelector('button')?.offsetHeight || 30) + 6;
    const sideW = (k: number) => {
      const hh = H * k + Math.max(14, (2 - y0) * k) + Math.max(14, (y1 - H + 4) * k);
      const cols = Math.ceil(nSide / Math.max(4, Math.floor((hh + 6) / rowH)));
      return cols * 76 + (cols - 1) * 6;
    };
    const toolW = tool ? tool.offsetWidth + 8 : 0;
    // 도구 칸 옆에 다 들어가는 가장 큰 배율(6 → 5 → 4), 그래도 안 되면(좁은 화면) 6배로 두고 미리보기 + 동작 칸이 같이 아랫줄로
    // 3배까지(사용자 2026-11-14 "무월 툴 ui 다 망가졋잖아": 캔버스가 넓은 무월(105칸)은 4배로도 안 들어가 도구 칸 아래로 밀렸음, GDD 115-A 135)
    const fits = (k: number) => widthOf(2, k) + sideW(k) + 8 + toolW <= row.clientWidth;
    let fit = [6, 5, 4, 3].find(fits);
    if (!fit) { minL = 80; minR = 40; fit = [4, 3].find(fits); if (!fit) { minL = 140; minR = 60; } }
    K = fit ?? K_FULL;
    const room = row.clientWidth - sideW(K) - 8 - (fit ? toolW : 0);
    while (m > 2 && widthOf(m) > room) m--;
  }
  stage.style.width = `${W * K}px`;
  stage.style.height = `${H * K}px`;
  const pair = side?.parentElement;
  if (pair && pair !== row) pair.style.flexWrap = window.innerWidth < 700 ? 'wrap' : 'nowrap'; // 휴대폰 너비에서는 가로로 넘치지 않게 동작 칸을 아래로
  const pl = Math.max(minL, (m - x0) * K);
  const pr = Math.max(minR, (x1 - W + m) * K);
  wrap.style.paddingLeft = `${pl}px`;
  wrap.style.paddingRight = `${pr}px`;
  wrap.style.paddingTop = `${Math.max(14, (m - y0) * K)}px`;
  wrap.style.paddingBottom = `${Math.max(14, (y1 - H + 4) * K)}px`;
  // 칸 밖을 자르면(overflow hidden) 칸 너비가 0 까지 줄 수 있어 너비를 정해 준다(사용자 2026-11-10 "다른 인형들은 제대로 보지도 못하게" — 아란칼(여) 미리보기가 좁아져 잘림, 115-A 95)
  wrap.style.boxSizing = 'border-box';
  wrap.style.width = `${W * K + pl + pr}px`;
}
/** 동작 단추: 지금 몸에 없는 동작(묶음에서 off — 덩치 특수2·필살기)은 숨김 */
function syncMotionButtons() {
  const ms = motionsNow();
  if (motion && !ms[motion]) motion = null;
  document.querySelectorAll<HTMLButtonElement>('[data-m]').forEach((b) => {
    const m = b.dataset.m!;
    b.hidden = m !== 'stop' && !ms[m];
    const name = attackName(m);
    if (name) b.textContent = name;
    // 긴 이름은 두 줄·작은 글씨로(단추 밖으로 넘쳐 화면이 가로로 밀리지 않게 — 편집기 점검 editor-check.cjs, 115-A 135). 단추 높이는 그대로
    if (m !== 'stop') { const long = (b.textContent ?? '').length > 7; b.classList.toggle('long', long); if (long) b.style.height = `${(document.querySelector<HTMLElement>('.side button:not(.long)')?.offsetHeight || 34)}px`; else b.style.height = ''; }
  });
}
/** 공격 동작 이름 (사용자 2026-11-12 04:1x "용어를 기본 공격, 박치기, 무기 공격, 특수 공격으로 나누자 — 호로는 무기가 없으니까 무기공격은 없겠지? 이래야 이펙트 먹이기 편할듯"):
 *  무기를 든 외형(무기 그림이 있는 몸 — 사신·아란칼·혼백)의 공격1·2 = 무기 공격 1·2, 무기 없는 몸(호로 전부·알몸)의 공격1·2·3 = 기본 공격 1·2·3,
 *  맨손 치기(스트레이트·오른손 치기·어퍼컷) = 기본 공격(이름), 박치기 = 박치기(부유형 공격3 도 박치기), 특수1·2 = 특수 공격 1·2. 동작 id 는 그대로(이름표만) */
function attackName(m: string): string | null {
  const armed = lookLayers(C.rig, look).some((l) => l.slot === 'weapon' || l.slot === 'sword'); // 초월자 인형은 칼 부위 이름이 sword
  const kind = armed ? '무기 공격' : '기본 공격';
  if (m === 'attack') return `${kind} 1`;
  if (m === 'attack2') return `${kind} 2`;
  if (m === 'attack3') return C.id === 'wraith' ? '박치기(공격3)' : '기본 공격 3';
  if (m === 'skill') return '특수 공격 1';
  if (m === 'skill2') return '특수 공격 2';
  if (m === 'straight') return '기본 공격(스트레이트)';
  if (m === 'rpunch') return '기본 공격(오른손 치기)';
  if (m === 'uppercut') return '기본 공격(어퍼컷)';
  if (m === 'headbutt') return '박치기';
  return null;
}
/** 동작 단추 칸: 미리보기 높이를 넘으면 오른쪽에 새 줄로 (사용자 2026-10-31 "미리보기칸 넘어가는 모션버튼은 오른쪽 옆에 새 줄") */
function fitSide() {
  const side = document.querySelector<HTMLElement>('.side');
  const wrap = stage.parentElement;
  const btn = side?.querySelector('button');
  if (!side || !wrap || !btn) return;
  const row = btn.offsetHeight + 6;
  side.style.gridTemplateRows = `repeat(${Math.max(4, Math.floor((wrap.offsetHeight + 6) / row))}, auto)`;
}
{
  // 미리보기 칸(leftcol)과 동작 단추 칸(side)을 한 묶음으로: 화면이 좁아도 동작 칸만 따로 다음 줄로 밀리지 않는다(사용자 2026-11-12 10:3x)
  const lc = document.querySelector<HTMLElement>('.leftcol');
  const sd = document.querySelector<HTMLElement>('.side');
  if (lc && sd && lc.parentElement === sd.parentElement) {
    const pair = document.createElement('div');
    pair.style.cssText = 'display:flex;flex-wrap:nowrap;gap:8px;align-items:flex-start;flex:0 0 auto;min-width:0';
    lc.before(pair);
    pair.append(lc, sd);
  }
}
sizeStage();
window.addEventListener('resize', () => { fitWrap(); fitSide(); });

let dbTimer = 0;
const state = (c: Ctx = C) => JSON.stringify({ id: c.id, bones: c.rig.bones, slots: c.rig.slots, bodies: c.rig.bodies, looks: c.rig.looks, bodyJoints: c.rig.bodyJoints, bodySlots: c.rig.bodySlots ?? {}, dataStamp: c.stamp, slotsEdited: c.slotsEdited, motionEdits: c.medits, motionOrder: c.morder, ...(c.chain ? { chain: c.chain } : {}) });
function save(user = true) {
  const st = state();
  try { localStorage.setItem(C.store, st); } catch { /* 무시 */ }
  // 사용자가 바꾼 것만 서버에 (잠깐 모아서 한 번)
  if (user && C.dbRef) {
    clearTimeout(dbTimer);
    const ref = C.dbRef;
    dbTimer = window.setTimeout(() => { ref.set({ json: st, savedAt: Date.now() }).then(() => setSync('서버 저장됨'), () => setSync('서버 저장 실패 — 이 기기에만 저장')); }, 600);
  }
  const body = rig.looks[look]!.body;
  const lk = rig.looks[look]!;
  out.value = JSON.stringify({
    rig: rig.id,
    bones: rig.bones.map((b) => ({ id: b.id, parent: b.parent, pivot: b.pivot })),
    slots: rig.slots.map((s) => s.id),
    body,
    parts: Object.fromEntries(Object.entries(rig.bodies[body]!).map(([k, v]) => [k, v.at])),
    look,
    ...Object.fromEntries(lookParts(lk).map((k) => [k, (lk[k] as PartArt).at])),
    joints: rig.bodyJoints?.[body],
  });
}

/** 지금 외형의 몸 */
const curBody = () => rig.looks[look]!.body;
/** 이 몸의 관절(따로 맞춘 칸) — 관절을 옮기거나 기본 각도를 바꾸면 이 몸에만 들어간다(사용자 2026-10-29, 남녀 관절이 따로) */
function joints(): BodyJoints {
  rig.bodyJoints ??= {};
  const j = rig.bodyJoints[curBody()];
  if (typeof j === 'object') return j;
  const n: BodyJoints = { pivots: {}, rot: {} };
  rig.bodyJoints[curBody()] = n;
  return n;
}
/** 이 몸에서의 뼈(관절 자리·쉬는 각도) */
function bone(id: string) { return bodyBones(rig, curBody()).find((b) => b.id === id)!; }
function setPivot(id: string, p: [number, number]) { (joints().pivots ??= {})[id] = p; }
/** 관절만 옮긴다(GDD 115-A 61, 사용자 2026-11-01 "왜 자꾸 관절 옮기면 부위가 같이 이동함? 이거 고쳐"):
 *  관절 자리를 d 만큼 옮기고, 쉬는 각도로 돌아간 만큼 그림이 밀리는 것을 보정 이동(shift)으로 되돌린다 → 쉬는 자세에서 부위·아래 부위 그림은 제자리.
 *  관절 자리는 몸마다 하나라 '이 동작에만'이어도 이 몸의 모든 동작에 들어간다 */
function moveJoint(id: string, dx: number, dy: number) {
  if (!dx && !dy) return;
  const b = bone(id);
  setPivot(id, [b.pivot[0] + dx, b.pivot[1] + dy]);
  const [ex, ey] = jointMoveShift(b.restRot ?? 0, [dx, dy]);
  const sh = (joints().shift ??= {});
  const [ox, oy] = sh[id] ?? [0, 0];
  const nx = Math.round((ox + ex) * 100) / 100;
  const ny = Math.round((oy + ey) * 100) / 100;
  if (Math.abs(nx) < 0.01 && Math.abs(ny) < 0.01) delete sh[id];
  else sh[id] = [nx, ny];
  if (!Object.keys(sh).length) delete joints().shift;
}
function baseRot(id: string) { return (rig.bodyJoints?.[curBody()] as BodyJoints | undefined)?.rot?.[id] ?? 0; }
function boneOfSel() { return rig.slots.find((s) => s.id === sel)?.bone ?? sel; }

/** 지금 그려진 층(앞뒤 순서대로) — 미리보기를 눌러 부위 고르기용 */
let drawn: { slot: string; m: number[]; img: HTMLImageElement; size: [number, number]; src: string }[] = [];
const alphaCache = new Map<string, ImageData>();
/** 캔버스 좌표 (x, y) 에서 가장 앞에 보이는 부위(투명 칸은 지나침) */
function slotAt(x: number, y: number): string | null {
  for (let i = drawn.length - 1; i >= 0; i--) {
    const { slot, m, img, size } = drawn[i]!;
    const det = m[0]! * m[3]! - m[1]! * m[2]!;
    if (!det) continue;
    const dx = x - m[4]!, dy = y - m[5]!;
    const u = (m[3]! * dx - m[2]! * dy) / det;
    const v = (-m[1]! * dx + m[0]! * dy) / det;
    if (u < 0 || v < 0 || u >= size[0] || v >= size[1]) continue;
    let data = alphaCache.get(img.src);
    if (!data && img.complete && img.naturalWidth) {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      if (ctx) { ctx.drawImage(img, 0, 0); data = ctx.getImageData(0, 0, c.width, c.height); alphaCache.set(img.src, data); }
    }
    if (!data || data.data[(Math.floor(v) * data.width + Math.floor(u)) * 4 + 3]! > 0) return slot;
  }
  return null;
}

function draw() {
  stage.querySelectorAll('img, .dot, .tintpart').forEach((n) => n.remove());
  let pose: Pose = {};
  const MOTIONS = motionsNow();
  if (motion && !MOTIONS[motion]) motion = null;
  if (motion) pose = samplePose(rig, MOTIONS[motion]!, mt, performance.now()); // 자락 물결은 이어지는 시계로(115-A 116)
  const mats = boneMatrices(rig, pose, curBody());
  drawn = [];
  // 해방 동작이면 그 순간 외형, 필살기면 칼을 맨 앞으로(GDD 115-A 48·49)
  const cm = motion ? MOTIONS[motion] : undefined;
  for (const l of orderLayers(lookLayers(rig, motionLook(rig, look, cm, mt)), cm)) {
    const img = document.createElement('img');
    img.style.zIndex = String(drawn.length + 1); // 사슬 층을 조각 사이에 끼우려고 앞뒤를 z 로도 적는다
    const src = ART_MAP[`art/rig/${rig.id}/${l.art}.png`] ?? '';
    // 그림을 뺀 조각(<이름>_none, 예: 무월 칼 = 불 덩어리)은 편집기에서만 원래 그림을 반투명 안내로 보여 고르고 옮길 수 있게(사용자 2026-11-17 "칼 어디감...도트로 찍은거야도 툴에서 위치같은거 수정 가능하게 해줘")
    const guide = l.art.endsWith('_none') ? ART_MAP[`art/rig/${rig.id}/${l.art.slice(0, -5)}.png`] : undefined;
    img.src = guide ?? src;
    if (guide) img.style.opacity = '0.4';
    img.className = 'part' + (l.slot === sel ? ' sel' : '');
    img.style.width = `${l.size[0] * K}px`;
    img.style.height = `${l.size[1] * K}px`;
    const m = layerMatrix(rig, mats, l, motion ? MOTIONS[motion] : undefined);
    img.style.transform = `matrix(${m[0]},${m[1]},${m[2]},${m[3]},${m[4] * K},${m[5] * K})`;
    stage.append(img);
    // 부위별 색(사용자 2026-11-16 "지금무월이 검정색이라 잘 안보이거든? 무월에 일단 부위별로 색깔 다르게 보는 기능 추가"): 그림 모양 그대로(마스크) 부위마다 다른 색을 덧씌운다
    if (tintOn()) {
      const tp = document.createElement('div');
      tp.className = 'tintpart';
      tp.style.cssText = `z-index:${img.style.zIndex};width:${l.size[0] * K}px;height:${l.size[1] * K}px;transform:${img.style.transform};background:${tintOf(l.slot)};-webkit-mask-image:url(${img.src});mask-image:url(${img.src})`;
      stage.append(tp);
    }
    drawn.push({ slot: l.slot, m, img, size: l.size, src });
  }
  if (cm?.fx) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'dot fxlayer');
    svg.setAttribute('width', String(W * K));
    svg.setAttribute('height', String(H * K));
    svg.style.cssText = `position:absolute;left:0;top:0;margin:0;overflow:visible;pointer-events:none;opacity:1;background:none;border-radius:0;width:${W * K}px;height:${H * K}px`;
    svg.innerHTML = fxSvg(fxAt(cm, mt, mats), K);
    stage.append(svg);
  }
  if ((sel === 'hair' || sel === 'hair_back') && !motion) {
    const [fx, fy, fw, fh] = hairRect(rig, sel);
    const [kx, ky, kw, kh] = rig.hairFrame.keepOut;
    const m = mats.head!;
    for (const [x, y, w, h, cls] of [[fx, fy, fw, fh, 'frame'], [kx, ky, kw, kh, 'keep']] as const) {
      const f = document.createElement('div');
      f.className = `dot ${cls}`;
      f.style.width = `${w * K}px`;
      f.style.height = `${h * K}px`;
      f.style.transform = `matrix(${m[0]},${m[1]},${m[2]},${m[3]},${(m[0] * x + m[2] * y + m[4]) * K},${(m[1] * x + m[3] * y + m[5]) * K})`;
      stage.append(f);
    }
  }
  if (mode === 'chain' && C.chain && C.chain.look === look) {
    // 사슬 자리 점(GDD 115-A 153): 띠 꺾은선 점 = 네모, 풀린 끝 시작 = 세모(◆). 고른 것은 강조
    for (const p of chainPoints()) {
      const m = drawn.find((d) => d.slot === p.slot)?.m;
      if (!m) continue;
      const d = document.createElement('div');
      d.className = 'dot chainpt' + (p.key === chainSel ? ' on' : '') + (p.tail ? ' tail' : '');
      d.style.left = `${(m[0]! * p.x + m[2]! * p.y + m[4]!) * K}px`;
      d.style.top = `${(m[1]! * p.x + m[3]! * p.y + m[5]!) * K}px`;
      d.title = p.label;
      stage.append(d);
    }
  }
  {
    // 관절 점 = 이 뼈가 지금 실제로 도는 자리(보정 이동 포함) — 동작 중에도 그 순간 자리에(사용자 2026-11-01 "동작에선 왜 관절 위치가 안떠", GDD 115-A 64)
    for (const b of bodyBones(rig, curBody())) {
      const d = document.createElement('div');
      const [px, py] = apply(mats[b.id]!, b.pivot);
      d.className = 'dot' + (b.id === boneOfSel() ? ' on' : '');
      d.style.left = `${(px + 0.5) * K}px`;
      d.style.top = `${(py + 0.5) * K}px`;
      d.title = NAMES()[b.id] ?? b.id;
      stage.append(d);
    }
  }
  const b = bone(boneOfSel());
  const body = rig.bodies[rig.looks[look]!.body]!;
  const lk = rig.looks[look]!;
  const part = body[sel] ?? (typeof lk[sel] === 'object' ? (lk[sel] as PartArt) : undefined);
  $('info').textContent = `${NAMES()[sel] ?? sel} · 관절 (${b.pivot[0]}, ${b.pivot[1]})` + (b.shift ? ` · 보정 (${b.shift[0]}, ${b.shift[1]})` : '') + (part ? ` · 부위 자리 (${part.at[0]}, ${part.at[1]})` : '') + ` · 앞뒤 ${layerPos()}` + ` · 기본 각도 ${baseRot(b.id)}°`
    + (mode === 'pivot' && scope === 'motion' && motion ? ' · 관절 자리는 이 몸의 모든 동작에 들어감' : '');
  const editingMotion = scope === 'motion' && motion && MOTIONS[motion];
  const shownRot = editingMotion ? motionOffset(b.id)[0] : baseRot(b.id);
  const br = document.getElementById('brot') as HTMLInputElement | null;
  if (br && document.activeElement !== br) br.value = String(shownRot);
  const bv = document.getElementById('brotv');
  if (bv) bv.textContent = `${shownRot}°`;
  const bs = document.getElementById('brotscope');
  if (bs) bs.textContent = editingMotion ? `(이 몸의 ${motion} 동작에만 — 동작 내내 더함)` : '(이 몸에만 저장)';
  const mtv = document.getElementById('mtv');
  if (mtv) mtv.textContent = motion ?? '—';
  chains.get(C.id)?.raise(); // 조각 사이 사슬 층을 다시 붙인 그림들 뒤로(같은 z 에서 앞에)
}

/** 고른 부위의 앞뒤 자리: '이 동작에만'이면 그 동작 순서로 */
function layerPos(): string {
  const m = scope === 'motion' && motion ? motionsNow()[motion] : undefined;
  const ids = m?.order ?? bodyOrder();
  return `${ids.indexOf(sel) + 1}/${ids.length}` + (m?.order ? ' (이 동작)' : ' (이 몸)');
}
/** 부위 버튼 묶음(사용자 2026-10-29 "머리부터 왼팔 오른팔 순서대로", 뼈대 데이터 edit.groups) — 이 외형에 있는 것만 */
const CHIP_GROUPS = (): [string, string[]][] => (rig.edit?.groups ?? []).map(([label, ids]) => [isCreature() ? CREATURE_GROUPS[label] ?? label : label, ids]);
function pick(id: string) { sel = id; buildChips(); draw(); }
/** 사슬 자리 옮기기 (사용자 2026-11-17 도트 세션 경유 "혈쇄 이치고는 내가 사슬 위치 정할테니까 … 사슬 위치 조작 가능하게", GDD 115-A 153):
 *  사슬 띠의 꺾은선 점과 풀린 끝의 시작점을 골라 방향 단추로 1도트씩 옮기고, 끝의 방향·길이, 띠가 붙는 조각을 바꾼다. 점은 조각 안 좌표라 조각이 움직이면 같이 간다. '고정'하면 <뼈대>-chain.json 에 들어간다 */
let chainSel = 'b0:1';
interface ChainPt { key: string; label: string; slot: string; x: number; y: number; tail: boolean }
function chainPoints(): ChainPt[] {
  const ch = C.chain;
  if (!ch) return [];
  const out: ChainPt[] = [];
  ch.bands.forEach((b, i) => b.pts.forEach((p, j) => out.push({ key: `b${i}:${j}`, label: `${b.name ?? `띠 ${i + 1}`} 점 ${j + 1}`, slot: b.slot, x: p[0], y: p[1], tail: false })));
  ch.tails.forEach((tl, i) => out.push({ key: `t${i}`, label: `${tl.name ?? `끝 ${i + 1}`} 풀린 끝`, slot: tl.slot, x: tl.x, y: tl.y, tail: true }));
  return out;
}
/** 화면에서 (dx, dy) 도트 → 그 조각 안 좌표로(조각이 돌아가 있어도 화면 방향 그대로 움직이게) */
function screenToLocal(slot: string, dx: number, dy: number): [number, number] {
  const m = drawn.find((d) => d.slot === slot)?.m;
  if (!m) return [dx, dy];
  const det = m[0]! * m[3]! - m[1]! * m[2]!;
  if (Math.abs(det) < 1e-6) return [dx, dy];
  return [(m[3]! * dx - m[2]! * dy) / det, (-m[1]! * dx + m[0]! * dy) / det];
}
const r1 = (v: number) => Math.round(v * 10) / 10;
function moveChainPoint(dx: number, dy: number) {
  const ch = C.chain;
  if (!ch) return;
  const mt_ = /^b(\d+):(\d+)$/.exec(chainSel), tt = /^t(\d+)$/.exec(chainSel);
  if (mt_) {
    const b = ch.bands[Number(mt_[1])]!, p = b.pts[Number(mt_[2])]!;
    const [lx, ly] = screenToLocal(b.slot, dx, dy);
    p[0] = r1(p[0] + lx); p[1] = r1(p[1] + ly);
  } else if (tt) {
    const tl = ch.tails[Number(tt[1])]!;
    const [lx, ly] = screenToLocal(tl.slot, dx, dy);
    tl.x = r1(tl.x + lx); tl.y = r1(tl.y + ly);
  }
  save(); draw(); buildChainUi();
}
/** 띠(와 같은 번호의 풀린 끝)를 다른 조각에 붙인다 — 화면 자리는 그대로 두고 그 조각 안 좌표로 바꿔 적는다 */
function moveChainToSlot(i: number, slot: string) {
  const ch = C.chain;
  if (!ch) return;
  const from = (s: string) => drawn.find((d) => d.slot === s)?.m;
  const conv = (s0: string, x: number, y: number): [number, number] => {
    const a = from(s0), b = from(slot);
    if (!a || !b) return [x, y];
    const wx = a[0]! * x + a[2]! * y + a[4]!, wy = a[1]! * x + a[3]! * y + a[5]!;
    const det = b[0]! * b[3]! - b[1]! * b[2]!, ux = wx - b[4]!, uy = wy - b[5]!;
    return [r1((b[3]! * ux - b[2]! * uy) / det), r1((-b[1]! * ux + b[0]! * uy) / det)];
  };
  const band = ch.bands[i];
  if (band) { band.pts = band.pts.map(([x, y]) => conv(band.slot, x, y)); band.slot = slot; }
  const tl = ch.tails[i];
  if (tl) { [tl.x, tl.y] = conv(tl.slot, tl.x, tl.y); tl.slot = slot; }
  save(); draw(); buildChainUi();
}
function buildChainUi() {
  const sec = document.getElementById('chainsec');
  const btn = document.querySelector<HTMLElement>('[data-mode="chain"]');
  const has = !!C.chain && C.chain.look === look;
  if (btn) btn.hidden = !has;
  if (!sec) return;
  sec.hidden = !has || mode !== 'chain';
  if (sec.hidden || !C.chain) return;
  const ch = C.chain;
  const box = document.getElementById('chainpts')!;
  box.replaceChildren(...ch.bands.map((b, i) => {
    const g = document.createElement('div');
    g.className = 'chipgroup';
    const lb = document.createElement('span');
    lb.className = 'chiplabel';
    lb.textContent = b.name ?? `띠 ${i + 1}`;
    g.append(lb);
    const mk = (key: string, text: string) => { const x = document.createElement('button'); x.textContent = text; x.className = key === chainSel ? 'on' : ''; x.onclick = () => { chainSel = key; buildChainUi(); draw(); }; return x; };
    b.pts.forEach((_, j) => g.append(mk(`b${i}:${j}`, `점${j + 1}`)));
    if (ch.tails[i]) g.append(mk(`t${i}`, '풀린 끝'));
    const sel = document.createElement('select');
    sel.setAttribute('aria-label', `${b.name ?? `띠 ${i + 1}`} 붙는 조각`);
    for (const s of lookLayers(rig, look).map((l) => l.slot)) sel.append(new Option(NAMES()[s] ?? s, s, false, s === b.slot));
    sel.onchange = () => moveChainToSlot(i, sel.value);
    g.append(sel);
    return g;
  }));
  const tm = /^t(\d+)$/.exec(chainSel);
  const tl = tm ? ch.tails[Number(tm[1])] : undefined;
  const ctl = document.getElementById('chaintail')!;
  ctl.hidden = !tl;
  if (tl) document.getElementById('chaintailv')!.textContent = `방향 ${Math.round(tl.ang)}° · 길이 ${tl.L}`;
  const ci = chainItem(), zv = document.getElementById('chainzv');
  if (zv) zv.textContent = ci ? `${ci.it.name ?? ''} ${ci.tail ? '풀린 끝' : '띠'} 앞뒤: ${chainZName(ci.it.z, ci.tail)} — '뒤로·앞으로 보내기'(맨 뒤·맨 앞도)로 바꾼다` : '';
}
/** 사슬 앞뒤(사용자 2026-11-17 "혈쇄고 사실 위치만 조정되고 레이어 위치 조정 안되니 설마?"): 고른 띠(점을 골랐을 때)나 풀린 끝의 앞뒤 자리.
 *  자리 목록 = 맨 뒤 → (그 조각 바로 앞)… → 맨 앞. 띠 기본 = 맨 앞, 풀린 끝 기본 = 맨 뒤 */
function chainItem(): { it: { z?: string; name?: string }; tail: boolean } | null {
  const ch = C.chain;
  if (!ch) return null;
  const bm = /^b(\d+):/.exec(chainSel), tm = /^t(\d+)$/.exec(chainSel);
  if (bm && ch.bands[Number(bm[1])]) return { it: ch.bands[Number(bm[1])]!, tail: false };
  if (tm && ch.tails[Number(tm[1])]) return { it: ch.tails[Number(tm[1])]!, tail: true };
  return null;
}
function chainZList(): string[] { return ['@back', ...drawn.slice(0, -1).map((d) => d.slot), '@front']; }
function chainZName(z: string | undefined, tail: boolean): string {
  const zz = z ?? (tail ? '@back' : '@front');
  return zz === '@front' ? '맨 앞' : zz === '@back' ? '맨 뒤' : `${NAMES()[zz] ?? zz} 바로 앞`;
}
function moveChainLayer(step: number) {
  const c = chainItem();
  if (!c) return;
  const list = chainZList();
  const cur = c.it.z ?? (c.tail ? '@back' : '@front');
  let i = list.indexOf(cur);
  if (i < 0) i = list.length - 1;
  const j = Math.max(0, Math.min(list.length - 1, i + step));
  const nz = list[j]!;
  if (nz === (c.tail ? '@back' : '@front')) delete c.it.z; else c.it.z = nz;
  save(); draw(); buildChainUi();
}
function chainTail(dAng: number, dL: number) {
  const tm = /^t(\d+)$/.exec(chainSel);
  const tl = tm && C.chain ? C.chain.tails[Number(tm[1])] : undefined;
  if (!tl) return;
  tl.ang = (tl.ang + dAng + 360) % 360;
  tl.L = Math.max(2, Math.min(14, tl.L + dL));
  save(); draw(); buildChainUi();
}
document.querySelectorAll<HTMLButtonElement>('[data-ctail]').forEach((b) => b.onclick = () => { const [a, l] = b.dataset.ctail!.split(',').map(Number) as [number, number]; chainTail(a, l); });
/** 부위별 색 보기: 켜면 부위마다 다른 색(슬롯 차례 × 황금각 — 이웃 부위끼리 색이 멀다), 부위 단추에도 같은 색 띠 */
const tintOn = () => (document.getElementById('tint') as HTMLInputElement | null)?.checked ?? false;
const tintOf = (slot: string) => `hsl(${Math.round((Math.max(0, rig.slots.findIndex((s) => s.id === slot)) * 137.5) % 360)} 85% 55%)`;
function buildChips() {
  buildChainUi();
  const box = $('parts');
  box.innerHTML = '';
  const has = new Set(['root', ...lookLayers(rig, look).map((l) => l.slot)]);
  const listed = new Set(CHIP_GROUPS().flatMap(([, ids]) => ids));
  const groups = [...CHIP_GROUPS(), ['그 밖', [...has].filter((id) => !listed.has(id))] as [string, string[]]];
  for (const [label, ids] of groups) {
    const present = ids.filter((id) => has.has(id));
    if (!present.length) continue;
    const g = document.createElement('div');
    g.className = 'chipgroup';
    const t = document.createElement('span');
    t.className = 'chiplabel';
    t.textContent = label;
    g.append(t);
    for (const id of present) {
      const b = document.createElement('button');
      b.textContent = NAMES()[id] ?? id;
      b.className = id === sel ? 'on' : '';
      b.onclick = () => pick(id);
      if (tintOn() && id !== 'root') b.style.boxShadow = `inset 5px 0 0 ${tintOf(id)}`;
      g.append(b);
    }
    box.append(g);
  }
}

/** 이 동작에서 이 뼈의 원래 트랙(고친 것 덮기 전) */
function baseTrack(boneId: string): Key[] | undefined {
  if (!motion) return undefined;
  return resolveMotions(rig, C.src.motions, C.src.sets, curBody())[motion]?.tracks[boneId];
}
/** 이 동작에만 더한 값 [각도, x, y] = 고친 트랙 첫 키 − 원래 트랙 첫 키 */
function motionOffset(boneId: string): [number, number, number] {
  const ed = motion ? C.medits[motionKeyOf(motion)]?.[boneId]?.[0] : undefined;
  if (!ed) return [0, 0, 0];
  const o = baseTrack(boneId)?.[0] ?? [0, 0, 0, 0];
  return [ed[1] - o[1], ed[2] - o[2], ed[3] - o[3]];
}
/** 이 동작에만: 이 뼈 트랙의 모든 키에 같은 값을 더한다(동작은 그대로 흐름 — 사용자 "움직이고 있어도 … 멈추지 말란 얘기") */
function shiftMotion(boneId: string, drot: number, dx: number, dy: number) {
  if (!motion) return;
  const m = motionsNow()[motion];
  if (!m) return;
  const key = motionKeyOf(motion);
  const edits = (C.medits[key] ??= {});
  const track: Key[] = (edits[boneId] ??= JSON.parse(JSON.stringify(baseTrack(boneId) ?? [[0, 0, 0, 0], [m.duration, 0, 0, 0]])) as Key[]);
  for (const k of track) { k[1] += drot; k[2] += dx; k[3] += dy; }
  const [r, x, y] = motionOffset(boneId);
  if (!r && !x && !y) { delete edits[boneId]; if (!Object.keys(edits).length) delete C.medits[key]; }
  save(); draw();
}

function nudge(dx: number, dy: number) {
  // 관절 옮기기 = 언제나 관절만(그림은 제자리). '이 동작에만'에서 그 동작만 부위를 옮기려면 '부위 그림 옮기기'
  if (mode === 'chain') { moveChainPoint(dx, dy); return; }
  if (mode === 'pivot') { moveJoint(boneOfSel(), dx, dy); save(); draw(); return; }
  if (scope === 'motion' && motion) { shiftMotion(boneOfSel(), 0, dx, dy); return; }
  // 부위를 옮기면 딸린 부위(머리 → 머리카락·뒷머리, 왼팔 → 엄지, 오른 위팔 → 아래팔, 다리 → 정강이·발)와 그 관절도 같이(사용자 2026-10-29)
  const moves = followMove(rig, look, sel, (document.getElementById('sub') as HTMLInputElement | null)?.checked ?? true);
  if (!moves) return;
  for (const m of moves.parts) {
    const next: PartArt = { ...m.part, at: [m.part.at[0] + dx, m.part.at[1] + dy] };
    if ((m.slot === 'hair' || m.slot === 'hair_back') && !insideFrame(rig, next, m.slot)) { $('info').textContent = '머리카락이 틀 밖으로 나가서 못 옮김'; return; }
  }
  for (const m of moves.parts) m.part.at = [m.part.at[0] + dx, m.part.at[1] + dy];
  // 고른 부위의 관절도 같이(115-A 132) — 쉬는 자세 그림이 안 밀리게 관절 자리만 그대로 옮긴다
  for (const id of [...(moves.lead ? [moves.lead] : []), ...moves.bones]) { const b = bone(id); setPivot(id, [b.pivot[0] + dx, b.pivot[1] + dy]); }
  save(); draw();
}

/** 색 외형 (GDD 115-A 85, 사용자 "덩치 누른다음, 상세편집에서 색깔변경만"): 지금 몸을 쓰는 외형 중 color 이름이 있는 것 — 둘 이상이면 색 단추 줄을 보인다.
 *  색은 그림만 바뀌고 몸·관절·동작은 같다(관절을 고치면 모든 색에 같이). 탭(외형 단추)은 그대로 둔다 */
function buildColors() {
  const row = document.getElementById('colors');
  if (!row) return;
  const body = rig.looks[look]?.body;
  const list = Object.entries(rig.looks).filter(([, l]) => l.body === body && typeof l.color === 'string');
  row.hidden = list.length < 2;
  row.replaceChildren(...(list.length < 2 ? [] : [Object.assign(document.createElement('span'), { className: 'lbl', textContent: '종류·색' }), ...list.map(([id, l]) => {
    const b = document.createElement('button');
    b.textContent = l.color as string;
    b.dataset.color = id;
    b.classList.toggle('on', id === look);
    b.onclick = () => { look = id; buildColors(); buildSwaps(); buildChips(); save(false); draw(); };
    return b;
  })]));
}
/** 머리·무기 바꿔 끼우기 (GDD 115-A 113, 사용자 2026-11-11 "앞으로는 무기랑 머리 따로 분리하자 툴에서도 … 머리 변경, 무기 변경 만들어서 언제든 바꿀 수 있게"):
 *  뼈대 데이터 parts.hair·parts.weapon 목록에서 골라 지금 외형의 머리카락 층(hair·hair_back 마디)·무기(weapon·scabbard)를 갈아 끼운다.
 *  외형의 hairKind·weaponKind 에 고른 것을 적고, 뒷머리 관절은 이 몸에 같이 넣는다. '고정'하면 작업본에 들어간다(apply_editor.py) */
interface HairKind { name: string; layers: Record<string, PartArt>; pivots?: Record<string, [number, number]> }
interface WeaponKind { name: string; art?: string; size?: [number, number]; d?: [number, number]; scabbard?: boolean }
const partsOf = () => (rig as unknown as { parts?: { hair?: Record<string, HairKind>; weapon?: Record<string, WeaponKind> } }).parts;
const HAIR_LAYERS = ['hair', 'hair_back', 'hair_back2', 'hair_back3'];
function setHair(id: string) {
  const k = partsOf()?.hair?.[id];
  const lk = rig.looks[look] as Record<string, unknown> | undefined;
  if (!k || !lk) return;
  for (const s of HAIR_LAYERS) {
    if (k.layers[s]) lk[s] = JSON.parse(JSON.stringify(k.layers[s]));
    else delete lk[s];
  }
  for (const [b, p] of Object.entries(k.pivots ?? {})) setPivot(b, [p[0], p[1]]);
  lk.hairKind = id;
  if (!lookLayers(rig, look).some((l) => l.slot === sel)) sel = 'root';
  buildSwaps(); buildChips(); save(); draw();
}
function setWeapon(id: string) {
  const all = partsOf()?.weapon;
  const k = all?.[id];
  const lk = rig.looks[look] as Record<string, unknown> | undefined;
  if (!k || !lk || !all) return;
  // 칼 자리(d = 0,0) 기준: 지금 무기 자리에서 지금 종류의 d 를 빼면 손 기준 자리 — 없음(none)이었으면 같은 몸 다른 외형의 칼 자리, 그것도 없으면 그대로 못 바꿈
  const cur = lk.weapon as PartArt | undefined;
  const curD = all[String(lk.weaponKind ?? 'sword')]?.d ?? [0, 0];
  const base = (lk.weaponBase as [number, number] | undefined) ?? (cur ? [cur.at[0] - curD[0], cur.at[1] - curD[1]] as [number, number] : undefined);
  if (!base) return;
  lk.weaponBase = base;
  if (k.art && k.size) lk.weapon = { art: k.art, at: [base[0] + (k.d?.[0] ?? 0), base[1] + (k.d?.[1] ?? 0)], size: k.size };
  else delete lk.weapon;
  // 칼집: 차는 무기면 같은 뼈대의 칼집 그림(다른 외형에서 가져옴), 아니면 없앰
  if (k.scabbard) {
    if (!lk.scabbard) {
      const from = Object.values(rig.looks).find((l) => l.body === rig.looks[look]!.body && typeof l.scabbard === 'object') ?? Object.values(rig.looks).find((l) => typeof l.scabbard === 'object');
      if (from) lk.scabbard = JSON.parse(JSON.stringify(from.scabbard));
    }
  } else delete lk.scabbard;
  lk.weaponKind = id;
  if (!lookLayers(rig, look).some((l) => l.slot === sel)) sel = 'root';
  buildSwaps(); buildChips(); save(); draw();
}
function buildSwaps() {
  const lk = rig.looks[look] as Record<string, unknown> | undefined;
  const p = partsOf();
  const can = !!p && !!lk && (typeof lk.hairKind === 'string' || typeof lk.weaponKind === 'string');
  const row = (id: string, label: string, list: Record<string, { name: string }> | undefined, cur: unknown, on: (k: string) => void) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.hidden = !can || !list;
    el.replaceChildren(...(el.hidden ? [] : [Object.assign(document.createElement('span'), { className: 'lbl', textContent: label }), ...Object.entries(list!).map(([k, v]) => {
      const b = document.createElement('button');
      b.textContent = v.name;
      b.classList.toggle('on', k === cur);
      b.onclick = () => on(k);
      return b;
    })]));
  };
  row('hairs', '머리 변경', p?.hair, lk?.hairKind, setHair);
  row('weapons', '무기 변경', p?.weapon, lk?.weaponKind, setWeapon);
}
document.querySelectorAll<HTMLButtonElement>('[data-look]').forEach((b) => b.onclick = () => {
  look = b.dataset.look!;
  const c = ctxOfLook(look);
  if (c !== C) {
    C = c; rig = c.rig; motion = null;
    if (!rig.slots.some((s) => s.id === sel)) sel = rig.slots[0]!.id;
  }
  sizeStage(); syncMotionButtons();
  document.querySelectorAll('[data-look]').forEach((x) => x.classList.toggle('on', x === b));
  buildColors(); buildSwaps(); buildChips(); save(false); draw();
});
/** 외형 고르기 = 종족 탭(사신·아란칼·호로·초월자(아이젠 등 — 사용자 2026-11-14 "기타 말고 초월자로 따로 빼놔")·기타) → 성별(사신·아란칼만) → 단계/진화체 → 색(buildColors) (GDD 115-A 110, 사용자 2026-11-11
 *  "사신 아란칼 호로 탭 먼저 나누고 그 안에서 사신 여자 사신 남자 나누고 거기서 혼백, 영술원 학생, 사신 … 호로는 진화체들 정리해서 넣고, 진화체 선택하면 색상도 고르게").
 *  외형 단추는 묶음(data-group) 줄에 들어 있고, 탭·성별에 맞는 줄만 보인다. pick = 그 줄의 첫 외형을 고른다 */
let tab = 'arrancar';
let sub = 'm';
const GENDERED = ['shinigami', 'arrancar'];
const groupOf = () => (GENDERED.includes(tab) ? `${tab}-${sub}` : tab);
function showTabs(pick: boolean) {
  document.querySelectorAll<HTMLElement>('[data-tab]').forEach((x) => x.classList.toggle('on', x.dataset.tab === tab));
  document.querySelectorAll<HTMLElement>('[data-sub]').forEach((x) => x.classList.toggle('on', x.dataset.sub === sub));
  const subs = document.getElementById('subs');
  if (subs) subs.hidden = !GENDERED.includes(tab);
  let shown: HTMLElement | null = null;
  document.querySelectorAll<HTMLElement>('[data-group]').forEach((g) => {
    g.hidden = g.dataset.group !== groupOf();
    if (!g.hidden) shown = g;
  });
  if (pick && shown && !(shown as HTMLElement).querySelector('[data-look].on')) (shown as HTMLElement).querySelector<HTMLButtonElement>('[data-look]')?.click();
}
/** 지금 고른 외형(색 외형이면 그 몸의 대표 단추)이 든 줄로 탭·성별을 맞춘다 */
function syncTabs() {
  const body = rig.looks[look]?.body;
  const btn = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-look]')).find((x) => x.dataset.look === look)
    ?? Array.from(document.querySelectorAll<HTMLButtonElement>('[data-look]')).find((x) => ctxOfLook(x.dataset.look!) === C && rig.looks[x.dataset.look!]?.body === body);
  const g = btn?.closest<HTMLElement>('[data-group]')?.dataset.group;
  if (!g) return;
  const [t, s] = g.split('-');
  tab = t!;
  if (s) sub = s;
  document.querySelectorAll('[data-look]').forEach((x) => x.classList.toggle('on', x === btn));
  showTabs(false);
}
document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.onclick = () => { tab = b.dataset.tab!; showTabs(true); });
document.querySelectorAll<HTMLButtonElement>('[data-sub]').forEach((b) => b.onclick = () => { sub = b.dataset.sub!; showTabs(true); });
setTimeout(() => { syncTabs(); buildSwaps(); }, 0);
document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => b.onclick = () => {
  mode = b.dataset.mode as 'pivot' | 'part' | 'chain';
  buildChainUi();
  draw();
  document.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('on', x === b));
});
// 방향 단추를 꾹 누르면 주르륵(사용자 2026-11-10 "관절옮기기랑 부위그림은 방향키 꾹누르고 있으면 주루루룩"): 누르면 한 칸, 0.35초 뒤부터 0.06초마다 한 칸. 키보드 방향키도
document.querySelectorAll<HTMLButtonElement>('[data-d]').forEach((b) => {
  const [dx, dy] = b.dataset.d!.split(',').map(Number) as [number, number];
  let timer = 0;
  let rep = 0;
  const stop = () => { clearTimeout(timer); clearInterval(rep); timer = rep = 0; };
  b.onpointerdown = (e) => {
    e.preventDefault();
    try { b.setPointerCapture(e.pointerId); } catch { /* 무시 */ }
    stop();
    nudge(dx, dy);
    timer = window.setTimeout(() => { rep = window.setInterval(() => nudge(dx, dy), 60); }, 350);
  };
  b.onpointerup = stop;
  b.onpointercancel = stop;
  b.onlostpointercapture = stop;
  b.onclick = (e) => { if (e.detail === 0) nudge(dx, dy); }; // 키보드로 단추를 누른 것(Enter·Space)만 — 마우스·터치는 pointerdown 에서
});
const ARROWS: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
document.addEventListener('keydown', (e) => {
  const d = ARROWS[e.key];
  const t = e.target as HTMLElement | null;
  if (!d || (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable))) return;
  e.preventDefault();
  nudge(d[0], d[1]); // 꾹 누르면 키보드가 저절로 되풀이
});
// 기본 각도(이 몸에서 쉬는 자세의 관절 각도) — 저장된다
const brot = document.getElementById('brot') as HTMLInputElement | null;
if (brot) brot.oninput = () => {
  const id = boneOfSel();
  const v = Number(brot.value);
  if (scope === 'motion' && motion) { shiftMotion(id, v - motionOffset(id)[0], 0, 0); return; }
  const r = (joints().rot ??= {});
  if (v) r[id] = v; else delete r[id];
  save(); draw();
};
const brotStep = (d: number) => { if (!brot) return; brot.value = String(Number(brot.value) + d); brot.oninput?.(new Event('input')); };
document.getElementById('brot-m')?.addEventListener('click', () => brotStep(-1));
document.getElementById('brot-p')?.addEventListener('click', () => brotStep(1));
document.querySelectorAll<HTMLButtonElement>('[data-m]').forEach((b) => b.onclick = () => {
  const m = b.dataset.m!;
  motion = m === 'stop' ? null : m;
  mt = 0;
  document.querySelectorAll('[data-m]').forEach((x) => x.classList.toggle('on', x === b && m !== 'stop'));
  draw();
});
/** 지금 몸의 기본 앞뒤 순서(몸별 순서가 없으면 공통 slots) */
function bodyOrder(): string[] { return slotsOf(rig, curBody()).map((s) => s.id); }
/** 앞·뒤로 보내기: '이 동작에만'이면 지금 동작의 앞뒤 순서만(GDD 115-A 62), 아니면 지금 몸의 기본 순서만(몸별 bodySlots, 115-A 74 — 다른 몸은 그대로) */
/** step: ±1 = 한 칸, ±99 = 맨 앞·맨 뒤(사용자 2026-11-17 "앞으로 보내기 맨 앞으로 보내기 / 뒤로 보내기 맨 뒤로보내기") */
function shiftIn(cur: string[], i: number, step: number): boolean {
  const j = Math.max(0, Math.min(cur.length - 1, i + step));
  if (i < 0 || j === i) return false;
  const [x] = cur.splice(i, 1);
  cur.splice(j, 0, x!);
  return true;
}
function moveLayer(step: number) {
  if (mode === 'chain') { moveChainLayer(step); return; }
  const base = bodyOrder();
  if (scope === 'motion' && motion) {
    const key = motionKeyOf(motion);
    const cur = [...(motionsNow()[motion]?.order ?? base)];
    for (const id of base) if (!cur.includes(id)) cur.push(id);
    if (!shiftIn(cur, cur.indexOf(sel), step)) return;
    if (cur.join() === base.join() && !motionOrderInData(motion)) delete C.morder[key];
    else C.morder[key] = cur;
    save(); draw();
    return;
  }
  const cur = [...base];
  if (!shiftIn(cur, cur.indexOf(sel), step)) return;
  rig.bodySlots ??= {};
  if (cur.join() === rig.slots.map((s) => s.id).join()) delete rig.bodySlots[curBody()];
  else rig.bodySlots[curBody()] = cur;
  save(); draw();
}
/** 데이터(작업본)에 이 동작만의 앞뒤 순서가 이미 있는지 — 있으면 기본 순서와 같아져도 지우지 않고 그 순서로 남긴다 */
function motionOrderInData(id: string): boolean {
  return !!resolveMotions(rig, C.src.motions, C.src.sets, curBody())[id]?.order;
}
$('front').onclick = () => moveLayer(1);
$('back').onclick = () => moveLayer(-1);
$('frontmost').onclick = () => moveLayer(99);
$('backmost').onclick = () => moveLayer(-99);
$('reset').onclick = () => {
  resetRig(C);
  try { for (const k of [C.store, ...(C.id === 'humanoid' ? LEGACY : [])]) localStorage.removeItem(k); } catch { /* 무시 */ }
  save(); buildChips(); draw();
};
$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText(out.value); $('copy').textContent = '복사됨'; }
  catch { out.select(); $('copy').textContent = '선택됨 — 길게 눌러 복사'; }
  setTimeout(() => { $('copy').textContent = '값 복사'; }, 1800);
};
// 관절 모드에서 무대를 누르면 그 칸이 선택한 관절이 된다(움직임 멈춘 원래 자세 기준)
// 미리보기를 누르면 그 부위를 고른다(사용자 2026-10-29). 관절 모드에서 이미 고른 부위(또는 빈 곳)를 누르면 그 칸이 관절이 된다
stage.addEventListener('click', (e) => {
  const r = stage.getBoundingClientRect();
  const fx = (e.clientX - r.left) / (r.width / W);
  const fy = (e.clientY - r.top) / (r.height / H);
  const hit = slotAt(fx, fy);
  if (hit && hit !== sel) { pick(hit); return; }
  if (mode !== 'pivot') return;
  // 누른 칸이 관절 점 자리가 되게: 화면 → 이 뼈의 그림 좌표(지금 보이는 자세 — 동작 중이면 그 순간)로 되돌려 그 칸으로 관절만 옮김
  const id = boneOfSel();
  const cm = motion ? motionsNow()[motion] : undefined;
  const m = boneMatrices(rig, cm ? samplePose(rig, cm, mt) : {}, curBody())[id]!;
  const det = m[0] * m[3] - m[1] * m[2];
  if (!det) return;
  const qx = fx - m[4], qy = fy - m[5];
  const u = (m[3] * qx - m[2] * qy) / det, v = (-m[1] * qx + m[0] * qy) / det;
  const b = bone(id);
  moveJoint(id, Math.floor(u) - b.pivot[0], Math.floor(v) - b.pivot[1]);
  save(); draw();
});

document.querySelectorAll<HTMLButtonElement>('[data-scope]').forEach((b) => b.onclick = () => {
  scope = b.dataset.scope as 'base' | 'motion';
  document.querySelectorAll('[data-scope]').forEach((x) => x.classList.toggle('on', x === b));
  draw();
});

/** 불꽃 층(GDD 115-A 135): 지금 외형에 불꽃이 있으면 미리보기 위에 얹는다. 조각 그림은 그릴 때마다 새로 만들므로 자르기용 그림은 따로 간직 */
const flames = new Map<string, ReturnType<typeof createFlame>>();
const flameImgs = new Map<string, HTMLImageElement>();
let flameMotion: string | null = null;
function stepFlame(dt: number) {
  stepChain(dt);
  const spec = C.src.flame;
  const on = spec && spec.look === look ? C.id : null;
  for (const [id, f] of flames) { const show = id === on; f.back.hidden = !show; f.front.hidden = !show; }
  if (!spec || !on) return;
  let f = flames.get(on);
  if (!f) { f = createFlame(spec, rig.canvas); flames.set(on, f); stage.prepend(f.back); stage.append(f.front); }
  f.place(K);
  if (motion !== flameMotion) { flameMotion = motion; f.quench(); } // 새 동작이 시작되면 그 전 불은 빨리 꺼뜨린다
  const layers: FlameLayer[] = drawn.map((d) => {
    let img = flameImgs.get(d.src);
    if (!img) { img = new Image(); img.src = d.src; flameImgs.set(d.src, img); }
    return { slot: d.slot, m: d.m, img };
  });
  f.step(dt, layers);
}
/** 사슬 이펙트 층(GDD 115-A 149): 지금 외형에 사슬이 있으면 미리보기 위에 얹는다 */
function stepChain(dt: number) {
  const spec = C.chain;
  const on = spec && spec.look === look ? C.id : null;
  for (const [id, c] of chains) c.setHidden(id !== on);
  if (!spec || !on) return;
  let c = chains.get(on);
  if (!c) { c = createChain(spec, rig.canvas); chains.set(on, c); stage.prepend(c.back); stage.append(c.front); c.mount(stage); }
  c.place(K);
  c.step(dt, drawn.map((d, i) => {
    let img = flameImgs.get(d.src);
    if (!img) { img = new Image(); img.src = d.src; flameImgs.set(d.src, img); }
    return { slot: d.slot, m: d.m, img, z: i + 1 };
  }));
}
document.getElementById('tint')?.addEventListener('change', () => { buildChips(); draw(); });
// 점 숨기기(사용자 2026-11-17 "툴에 점 안보이게 기능 추가좀. 점때문에 도트가 안보임"): 관절 점·사슬 점·틀을 감춘다(무대 클래스 하나 — 그릴 때마다 다시 붙여도 그대로)
document.getElementById('nodots')?.addEventListener('change', (e) => stage.classList.toggle('nodots', (e.target as HTMLInputElement).checked));
let last = 0;
let recording = false;
function tick(now: number) {
  if (recording) { last = 0; requestAnimationFrame(tick); return; } // GIF 만드는 동안은 기록기가 장을 넘긴다
  if (last) stepFlame(now - last);
  if (motion) {
    if (last) mt += Math.min(100, now - last) * motionSpeedOf(rig, motion); // 게임과 같은 재생 속도(GDD 225장, 대기·홈 대기는 1배 — 115-A 103)
    const m = motionsNow()[motion];
    if (!m) motion = null;
    else if (!m.loop && mt > m.duration + 400) mt = 0;
    draw();
  }
  last = now;
  requestAnimationFrame(tick);
}
$('fix').onclick = async () => {
  const btn = $<HTMLButtonElement>('fix');
  if (!C.dbRef) return setSync('서버에 연결이 안 돼 고정 못 함 — 값 복사로 보내 주세요');
  btn.disabled = true;
  try {
    const db = await claude!.use('db');
    const st = state();
    await db!.doc(C.fix).set({ json: st, savedAt: Date.now() });
    await C.dbRef.set({ json: st, savedAt: Date.now() });
    const c = await claude!.use('comments').catch(() => null);
    const can = c ? await c.canSendToClaude().catch(() => 'off') : 'off';
    if (c && can === 'available') {
      await c.sendToClaude({ anchor: await c.anchorFor(btn), text: `고정: 편집기 값(서버 ${C.fix})을 작업본에 넣어 주세요. (게임에는 아직 넣지 않음)` });
      setSync('고정 저장 + Claude 에게 보냄 — 반영되면 댓글로 답이 와요');
    } else {
      setSync('고정 저장됨 — Claude 에게 "고정해"라고 말해 주세요(지금은 바로 못 보냄)');
    }
  } catch { setSync('고정 실패 — 다시 눌러 주세요'); }
  btn.disabled = false;
};
function setSync(t: string) { const e = document.getElementById('sync'); if (e) e.textContent = t; }
// 시트 받기 (사용자 2026-11-10 "툴에 그냥 캐릭별로 시트 다운받기 버튼 만들고, 누르면 너한테 명령 안보내도 알아서 다운되게"):
// 페이지를 만들 때 외형마다 만든 가이드 시트(1배 = 그리기용, 8배 = 칸 이름·관절 확인용)를 지금 고른 외형으로 저장. 저장 못 하는 화면이면 단추를 숨김
declare const SHEET_MAP: Record<string, { x1: string; x8: string }> | undefined;
async function saveSheet(kind: 'x1' | 'x8') {
  const sh = typeof SHEET_MAP !== 'undefined' ? SHEET_MAP[look] : undefined;
  if (!sh) return setSync(`${look}: 시트 없음`);
  const dl = typeof claude !== 'undefined' ? await claude.use('downloads').catch(() => null) : null;
  if (!dl) return setSync('이 화면에서는 시트를 받을 수 없음');
  const bin = Uint8Array.from(atob(sh[kind].slice(sh[kind].indexOf(',') + 1)), (c) => c.charCodeAt(0));
  try {
    await dl.save({ filename: `${look}-sheet${kind === 'x8' ? '-x8' : ''}.png`, data: new Blob([bin], { type: 'image/png' }) });
    setSync(`${look} 시트 저장함`);
  } catch (e) {
    const code = (e as { code?: string }).code;
    setSync(code === 'declined' ? '시트 저장 안 함' : code === 'rate_limited' ? '저장 창이 이미 떠 있음 — 잠시 뒤 다시' : '시트 저장 실패');
  }
}
// GIF 받기 (사용자 2026-11-18 "이거 애니메이션 완성된거 나한테 gif로 내어줄 수 있는 기능 추가해볼래?"):
// 지금 외형·지금 동작(안 골랐으면 대기)을 게임과 같은 재생 속도로 한 바퀴(반복 아닌 동작은 끝 자세 0.4초 더) 40ms 마다 찍어 GIF 로 저장.
// 미리보기에 보이는 그대로(부위·불꽃·사슬, 앞뒤 순서 = z·DOM 순서) — 관절 점·부위 색은 빼고, 배경 = 무대 색, 1도트 = 3픽셀, 그림이 있는 곳만 잘라 냄
const GIF_STEP = 40, GIF_DOT = 3;
/** 동작 하나를 GIF 로(미리보기를 그 동작으로 돌려 찍는다 — 부르는 쪽이 recording·되돌리기를 맡음) */
async function makeGif(id: string, tag: string): Promise<{ name: string; bin: Uint8Array; n: number; real: number }> {
  const m = motionsNow()[id]!;
  const speed = motionSpeedOf(rig, id);
  const real = m.duration / speed + (m.loop ? 0 : 400);
  const n = Math.max(2, Math.round(real / GIF_STEP));
  motion = id;
  const bg = getComputedStyle(stage.parentElement!).backgroundColor || '#9bb094';
  const sw = stage.offsetWidth / K, sh = stage.offsetHeight / K; // 캔버스 칸(도트)
  const mx = Math.ceil(sw * 0.6), my = Math.ceil(sh * 0.4); // 칼·불꽃이 칸 밖으로 나가는 몫
  const cw = Math.ceil((sw + mx * 2) * GIF_DOT), ch = Math.ceil((sh + my * 2) * GIF_DOT);
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const cx = cv.getContext('2d', { willReadFrequently: true })!;
  cx.imageSmoothingEnabled = false;
  const imgs = new Map<string, HTMLImageElement>();
  const imgOf = async (src: string) => { let im = imgs.get(src); if (!im) { im = new Image(); im.src = src; imgs.set(src, im); await im.decode().catch(() => undefined); } return im; };
  const frames: Uint8ClampedArray[] = [];
  for (let i = 0; i < n; i++) {
    setSync(`${tag}GIF 만드는 중… ${id} ${i + 1}/${n}`);
    mt = Math.min(m.duration, i * GIF_STEP * speed);
    draw();
    stepFlame(i ? GIF_STEP : 0);
    cx.setTransform(1, 0, 0, 1, 0, 0);
    cx.globalAlpha = 1;
    cx.fillStyle = bg; cx.fillRect(0, 0, cw, ch);
    const els = [...stage.children].filter((e): e is HTMLElement => (e instanceof HTMLImageElement && e.classList.contains('part')) || (e instanceof HTMLCanvasElement && !e.hidden));
    const z = (e: HTMLElement) => { const v = parseInt(e.style.zIndex || getComputedStyle(e).zIndex, 10); return Number.isFinite(v) ? v : 0; };
    const order = els.map((e, k) => ({ e, k, z: z(e) })).sort((a, b) => a.z - b.z || a.k - b.k);
    for (const { e } of order) {
      if (e instanceof HTMLImageElement) {
        const v = /matrix\(([^)]+)\)/.exec(e.style.transform)?.[1]?.split(',').map(Number);
        if (!v || v.length !== 6 || !e.src) continue;
        if (e.style.opacity && Number(e.style.opacity) < 1) continue; // 편집기 전용 반투명 안내 그림(그림 없는 칼 등)은 빼고
        const im = await imgOf(e.src);
        if (!im.naturalWidth) continue;
        cx.setTransform(v[0]! * GIF_DOT, v[1]! * GIF_DOT, v[2]! * GIF_DOT, v[3]! * GIF_DOT, (v[4]! / K + mx) * GIF_DOT, (v[5]! / K + my) * GIF_DOT);
        cx.drawImage(im, 0, 0);
      } else {
        const c = e as HTMLCanvasElement;
        const px = (q: string) => parseFloat(q) || 0;
        cx.setTransform(1, 0, 0, 1, 0, 0);
        cx.drawImage(c, (px(c.style.left) / K + mx) * GIF_DOT, (px(c.style.top) / K + my) * GIF_DOT, (px(c.style.width) / K) * GIF_DOT, (px(c.style.height) / K) * GIF_DOT);
      }
    }
    frames.push(cx.getImageData(0, 0, cw, ch).data);
    if (i % 5 === 4) await new Promise((r) => setTimeout(r, 0));
  }
  // 그림이 있는 곳(배경과 다른 칸)만 잘라 냄 + 여백 2도트
  const b0 = frames[0]!; let x0 = cw, y0 = ch, x1 = -1, y1 = -1;
  for (const f of frames) for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const o = (y * cw + x) * 4;
    if (f[o] !== b0[0] || f[o + 1] !== b0[1] || f[o + 2] !== b0[2]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) { x0 = 0; y0 = 0; x1 = cw - 1; y1 = ch - 1; }
  const pad = GIF_DOT * 2;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(cw - 1, x1 + pad); y1 = Math.min(ch - 1, y1 + pad);
  const gw = x1 - x0 + 1, gh = y1 - y0 + 1;
  const cut = frames.map((f) => { const d = new Uint8ClampedArray(gw * gh * 4); for (let y = 0; y < gh; y++) d.set(f.subarray(((y + y0) * cw + x0) * 4, ((y + y0) * cw + x0 + gw) * 4), y * gw * 4); return { data: d, delayCs: GIF_STEP / 10 }; });
  setSync(`${tag}GIF 묶는 중… ${id}`);
  await new Promise((r) => setTimeout(r, 0));
  return { name: `${look}-${id}.gif`, bin: encodeGif(gw, gh, cut), n, real };
}
/** all = 이 캐릭터(지금 외형)의 모든 동작을 각각 GIF 로 만들어 ZIP 하나로(사용자 2026-11-19 "이거랑, 이 캐릭터 모든 gif받기도 만들어") */
async function saveGif(all = false) {
  if (recording) return;
  const dl = typeof claude !== 'undefined' ? await claude.use('downloads').catch(() => null) : null;
  if (!dl) return setSync('이 화면에서는 GIF 를 받을 수 없음');
  const ms = motionsNow();
  const ids = all ? Object.keys(ms) : [motion && ms[motion] ? motion : ms.idle ? 'idle' : ''].filter(Boolean);
  if (!ids.length) return setSync('동작을 먼저 골라 주세요');
  const btns = [$<HTMLButtonElement>('gifbtn'), $<HTMLButtonElement>('gifall')];
  btns.forEach((b) => (b.disabled = true));
  recording = true;
  const keepMotion = motion, keepMt = mt;
  try {
    const out: { name: string; bin: Uint8Array; n: number; real: number }[] = [];
    for (const [k, id] of ids.entries()) out.push(await makeGif(id, all ? `(${k + 1}/${ids.length}) ` : ''));
    if (all) {
      setSync('ZIP 저장 중…');
      const zip = zipStore(out.map((g) => ({ name: g.name, data: g.bin })));
      await dl.save({ filename: `${look}-gifs.zip`, data: new Blob([zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' }) });
      setSync(`${look}-gifs.zip 저장함 (동작 ${out.length}개: ${ids.join(', ')})`);
    } else {
      const g = out[0]!;
      setSync('GIF 저장 중…');
      await dl.save({ filename: g.name, data: new Blob([g.bin as Uint8Array<ArrayBuffer>], { type: 'image/gif' }) });
      setSync(`${g.name} 저장함 (${g.n}장 · ${(g.real / 1000).toFixed(1)}초)`);
    }
  } catch (e) {
    const code = (e as { code?: string }).code;
    setSync(code === 'declined' ? 'GIF 저장 안 함' : code === 'rate_limited' ? '저장 창이 이미 떠 있음 — 잠시 뒤 다시' : 'GIF 만들기 실패');
  } finally {
    motion = keepMotion; mt = keepMt; recording = false; btns.forEach((b) => (b.disabled = false)); draw();
  }
}
$('gifall').onclick = () => void saveGif(true);
$('gifbtn').onclick = () => void saveGif();
$('sheet1').onclick = () => void saveSheet('x1');
$('sheet8').onclick = () => void saveSheet('x8');
void (async () => {
  if (typeof claude === 'undefined' || typeof SHEET_MAP === 'undefined' || !Object.keys(SHEET_MAP).length) return;
  if (await claude.use('downloads').catch(() => null)) $('sheetrow').hidden = false;
})();
void (async () => {
  if (typeof claude === 'undefined') return;
  if (await claude.use('downloads').catch(() => null)) $('gifrow').hidden = false;
})();
syncMotionButtons(); buildColors(); buildChips(); save(false); draw(); requestAnimationFrame(tick);
// 서버 값이 있으면 그걸 쓴다(어느 기기에서 열어도 같은 값). 없으면 이 기기 값을 한 번 올린다
void (async () => {
  if (typeof claude === 'undefined') return setSync('이 기기에만 저장');
  const db = await claude.use('db').catch(() => null);
  if (!db) return setSync('이 기기에만 저장(서버 연결 안 됨)');
  const msgs: string[] = [];
  for (const c of Object.values(CTX)) {
    const ref = db.doc(c.db);
    try {
      const snap = await ref.get();
      const json = snap.exists ? snap.data()?.json : undefined;
      resetRig(c);
      if (typeof json === 'string' && merge(c, JSON.parse(json) as Saved)) {
        c.dbRef = ref;
        if (c === C) msgs.push('서버 값 불러옴');
      } else {
        c.dbRef = ref;
        await ref.set({ json: state(c), savedAt: Date.now() });
        if (c === C) msgs.push('작업본 값으로 시작(서버에 올림)');
      }
    } catch { msgs.push(`서버 읽기 실패(${c.id}) — 이 기기에만 저장`); }
  }
  buildChips(); save(false); draw();
  setSync(msgs.join(' · '));
})();
