// 모델 고르기 목록 (GDD 17절 '테스트 모드 보강' v6.036, C.434): 상태 화면 스킨 칸·테스트 패널 스킨 탭이 같이 쓴다.
// 순서 = 단계 모델(테스트 모드) → 초월자 외형(얻은 것 / 테스트 모드 전부) → 스킨(가진 것, 그림 있는 것). 그림 없는 스킨은 [그림 대기]로 따로.
// 단계 이름은 종족 설정(tierNames·ascension.lookName), 초월자 목록은 transcendents.json — 종족·초월자 id 로 나누지 않는다.
import { charArt, skinHasArt, transcendentSkinHasArt } from '../art/manifest';
import { getSkin, LIMITED_SUBS, SKIN_CLASSES, skinLabel, skinsFor, tierLookId, tierLookTiers, transcendentLookId, transcendentLooks, transcendentSkinLookId, type LimitedSub, type SkinClass } from './index';
import { TRANSCENDENTS } from '../transcendents';
import { getFaction } from '../factions';
import { skinItemId } from '../shop';

export type ModelLookGroup = 'tier' | 'transcendent' | 'skin' | 'waiting';

export interface ModelLookOption {
  id: string;
  label: string;
  group: ModelLookGroup;
  /** 단계 모델의 단계 번호 (1부터) */
  tier?: number;
  /** 그림 대기 (초월자 인간형 스킨 — 그림 파일이 아직 없어 자리 표시 종이인형, GDD 12-4 v6.052) */
  waiting?: boolean;
}

export const MODEL_LOOK_GROUP_NAMES: Record<ModelLookGroup, string> = { tier: '단계 모델', transcendent: '초월자', skin: '스킨', waiting: '그림 대기' };

/** 같은 그림인가 (정지 그림 주소 + 종이인형 외형) */
const sameArt = (a: ReturnType<typeof charArt>, b: ReturnType<typeof charArt>): boolean => a.src === b.src && a.rig?.look === b.rig?.look;

/** 단계 모델: 그 단계에서 남녀 그림이 다르면 (남)·(여) 두 칸, 같으면 한 칸 */
export function tierLookOptions(factionId: string): ModelLookOption[] {
  return tierLookTiers(factionId).flatMap(({ tier, name }) => {
    const label = `${tier}단계 ${name}`;
    const m = charArt(factionId, tier - 1, '', '/', undefined, undefined, null, undefined, 'male');
    const f = charArt(factionId, tier - 1, '', '/', undefined, undefined, null, undefined, 'female');
    if (sameArt(m, f)) return [{ id: tierLookId(tier), label, group: 'tier' as const, tier }];
    return [
      { id: tierLookId(tier, 'male'), label: `${label} (남)`, group: 'tier' as const, tier },
      { id: tierLookId(tier, 'female'), label: `${label} (여)`, group: 'tier' as const, tier },
    ];
  });
}

/** 모델 고르기 목록. test = 테스트 모드(단계 모델·초월자 전부·스킨 보유 무시), owned = 가진 꾸밈 id, dex = 이 슬롯이 얻은 초월자 id */
export function modelLookOptions(factionId: string, o: { test: boolean; owned: readonly string[]; dex: readonly string[]; waiting?: boolean }): ModelLookOption[] {
  const out: ModelLookOption[] = [];
  if (o.test) out.push(...tierLookOptions(factionId));
  // 초월자 외형 + 인간형 스킨 (GDD 12-4 v6.052 — 태초 '현현'·Unknown '디버깅', 기본 모델 바로 뒤): 그 초월자를 얻으면(테스트 모드 = 전부). 그림이 없으면 자리 표시 + 그림 대기
  const looks = new Set(transcendentLooks().map((t) => t.id));
  for (const t of TRANSCENDENTS) {
    if (!(o.test || o.dex.includes(t.id))) continue;
    if (looks.has(t.id)) out.push({ id: transcendentLookId(t.id), label: t.name, group: 'transcendent' });
    for (const sk of t.humanSkins ?? []) {
      const id = transcendentSkinLookId(t.id, sk.id);
      out.push({ id, label: sk.name, group: 'transcendent', ...(transcendentSkinHasArt(id) ? {} : { waiting: true }) });
    }
  }
  for (const sk of skinsFor(factionId)) {
    if (!o.test && !o.owned.includes(skinItemId(sk.id))) continue;
    if (skinHasArt(sk.id)) out.push({ id: sk.id, label: skinLabel(sk), group: 'skin' });
    else if (o.waiting) out.push({ id: sk.id, label: skinLabel(sk), group: 'waiting' });
  }
  return out;
}

// ── 캐릭터 스킨 분류 (GDD 5절 '캐릭터 스킨 분류' v6.044) ──
// 가방 > 스킨 > 캐릭터: 대분류 진화체·특수·한정 → 중분류. 목록은 스킨 하나당 한 칸, 색(속성 색·성별)은 상세 창에서 고른다.
// 진화체 중분류 = 종족 설정 skinGroups(없으면 단계 이름 + 깬 뒤 그림 단계 이름) + 초월자. 종족 id 로 나누지 않는다.
// 노출 규칙은 모델 고르기 목록(modelLookOptions)과 같다: 일반 = 가진 스킨(그림 있는 것)·이 슬롯이 얻은 초월자, 테스트 모드 = 단계 모델까지 전부.

export const SKIN_CLASS_NAMES: Record<SkinClass, string> = { form: '진화체', special: '특수', limited: '한정' };
export const LIMITED_SUB_NAMES: Record<LimitedSub, string> = { set: '세트', hair: '헤어', outfit: '복장' };
/** 진화체 중분류의 초월자 칸 id (종족 공통) */
export const TRANSCENDENT_SKIN_GROUP = 'transcendent';

export interface SkinSubGroup { id: string; name: string }

/** 진화체 중분류: 종족 설정 skinGroups 또는 단계 이름 칸 + 초월자 */
export function formSkinGroups(factionId: string): (SkinSubGroup & { tiers: number[] })[] {
  const f = getFaction(factionId);
  const base = f.skinGroups ?? [
    ...f.tierNames.map((name, i) => ({ id: `tier${i + 1}`, name, tiers: [i + 1] })),
    ...(f.ascension.lookChange && f.ascension.artTier !== undefined && f.ascension.artTier > f.tierNames.length ? [{ id: `tier${f.ascension.artTier}`, name: f.ascension.lookName ?? f.ascension.name, tiers: [f.ascension.artTier] }] : []),
  ];
  return [...base.map((g) => ({ id: g.id, name: g.name, tiers: [...g.tiers] })), { id: TRANSCENDENT_SKIN_GROUP, name: '초월자', tiers: [] }];
}

/** 대분류의 중분류 목록 (특수는 중분류 없음 = 빈 목록) */
export function skinSubGroups(factionId: string, cls: SkinClass): SkinSubGroup[] {
  if (cls === 'form') return formSkinGroups(factionId).map(({ id, name }) => ({ id, name }));
  if (cls === 'limited') return LIMITED_SUBS.map((id) => ({ id, name: LIMITED_SUB_NAMES[id] }));
  return [];
}

/** 상세 창의 색 칩 하나 = 실제로 입히는 외형 id. element = 속성 색 견본(속성 id), gender = 성별 칸 */
export interface SkinVariant { id: string; element?: string; gender?: 'male' | 'female' }

/** 목록 한 칸 (스킨 하나) */
export interface SkinEntry {
  key: string;
  name: string;
  cls: SkinClass;
  /** 중분류 id (특수는 '') */
  sub: string;
  group: ModelLookGroup;
  variants: SkinVariant[];
  /** 그림 대기 (자리 표시 그림) */
  waiting?: boolean;
}

/** 캐릭터 스킨 목록 (분류 붙임). 옵션은 modelLookOptions 와 같다 */
export function characterSkinEntries(factionId: string, o: { test: boolean; owned: readonly string[]; dex: readonly string[] }): SkinEntry[] {
  const groups = formSkinGroups(factionId);
  const groupOfTier = (tier: number | undefined): string => groups.find((g) => tier !== undefined && g.tiers.includes(tier))?.id ?? groups[0]!.id;
  const out: SkinEntry[] = [];
  const byKey = new Map<string, SkinEntry>();
  const push = (key: string, make: () => SkinEntry, v: SkinVariant) => {
    let e = byKey.get(key);
    if (!e) {
      e = make();
      byKey.set(key, e);
      out.push(e);
    }
    e.variants.push(v);
  };
  for (const opt of modelLookOptions(factionId, o)) {
    if (opt.group === 'tier') {
      const p = opt.tier!;
      const t = tierLookTiers(factionId).find((x) => x.tier === p);
      push(`tier:${p}`, () => ({ key: `tier:${p}`, name: `${p}단계 ${t?.name ?? ''}`.trim(), cls: 'form', sub: groupOfTier(p), group: 'tier', variants: [] }),
        { id: opt.id, ...(opt.id.endsWith(':f') ? { gender: 'female' as const } : opt.id.endsWith(':m') ? { gender: 'male' as const } : {}) });
    } else if (opt.group === 'transcendent') {
      push(opt.id, () => ({ key: opt.id, name: opt.label, cls: 'form', sub: TRANSCENDENT_SKIN_GROUP, group: 'transcendent', variants: [], ...(opt.waiting ? { waiting: true } : {}) }), { id: opt.id });
    } else {
      const d = getSkin(opt.id);
      if (!d) continue;
      const key = d.look ? `skin:${d.look.group}` : `skin:${d.id}`;
      const sub = d.cls === 'form' ? groupOfTier(d.tier) : d.cls === 'limited' ? (d.limited ?? LIMITED_SUBS[0]) : '';
      push(key, () => ({ key, name: d.look ? d.look.groupName : opt.label, cls: d.cls, sub, group: opt.group, variants: [] }), { id: d.id, ...(d.look ? { element: d.look.variant } : {}) });
    }
  }
  return out;
}

/** 대분류 순서 */
export { SKIN_CLASSES };
