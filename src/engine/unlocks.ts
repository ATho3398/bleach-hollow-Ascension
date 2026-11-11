// 해금 흐름 (GDD 241-0 사용자 수정 v5.570, C.399): 진화마다 하나씩 열리는 기능의 판정·저장. 종족 무관 — 조건 수치는 BALANCE.provisional.unlocks, 이름은 종족 설정.
// 화면(타일, 가방 장비 탭·장신구 칸·전투 소모품 칸·펫·출정품 칸, 수련장 드롭다운, 월드맵 번호 쟁탈전)은 featureUnlocked 로 잠김을 정하고 unlockHintText 로 이유 한 줄을 띄운다.
// 저장 = save.shared.unlocks(슬롯 공유, 열린 시각). 한 번 열리면 영구 — 환생·트랙 바꿈에도 닫히지 않는다.
// 단 본능 수련(instinct)·번호 쟁탈전(rankBattle)의 '이번 생에 할 수 있나'는 옛 규칙 그대로 지금 단계로 본다(engine/training trainingGate · engine/rank rankUnlocked) — 여기 기록은 '처음 열렸다'(안내 카드 한 번)만 뜻한다.
import { BALANCE } from '../config/balance';
import { fixParticles } from './josa';

/** 해금되는 기능 (표 순서). tiles = 지형 타일(배치·합성·프리셋, 2단계) · gear = 장비(무기·방어구·신발) + 장비 상점 · battleItem = 전투 소모품 칸(3단계)
 *  · instinct = 본능 수련(수련장 드롭다운) · rankBattle = 번호 쟁탈전(월드맵, 4단계) · accessory = 장신구 3칸(해방 클리어 = 아란칼화/참백도 구상화) · pet = 펫 · sortie = 출정품 칸(첫 환생) */
export const FEATURE_IDS = ['tiles', 'gear', 'battleItem', 'instinct', 'rankBattle', 'accessory', 'pet', 'sortie'] as const;
export type FeatureId = (typeof FEATURE_IDS)[number];

/** 열린 기능 → 열린 시각(ms). 옛 세이브에서 이미 쓰던 것은 0 (언제 열렸는지 모름) */
export type UnlockState = Partial<Record<FeatureId, number>>;

/** 해금 조건: tierIndex = 어느 트랙이든 이 단계에 닿은 적이 있다 · ascended = 어느 트랙이든 해방(아란칼화/참백도 구상화)을 클리어한 적이 있다 · rebirths = 어느 트랙이든 환생을 이만큼 했다 */
export type UnlockRule = { tierIndex: number } | { ascended: true } | { rebirths: number };

/** 판정에 쓰는 슬롯 진행: 모든 트랙 중 닿아 본 최고 단계(tierIndex) · 해방 클리어 여부 · 가장 많은 환생 수 */
export interface UnlockProgress {
  maxTierIndex: number;
  ascended: boolean;
  rebirths: number;
}

export function newUnlockState(): UnlockState {
  return {};
}

export function sanitizeUnlocks(raw: unknown): UnlockState {
  const out: UnlockState = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const id of FEATURE_IDS) {
    const v = (raw as Record<string, unknown>)[id];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[id] = v;
  }
  return out;
}

export function unlockRule(id: FeatureId): UnlockRule {
  return BALANCE.provisional.unlocks[id];
}

/** 이 기능이 열렸나 (화면 잠김 판정). 세이브의 shared.unlocks 만 본다 */
export function featureUnlocked(save: { shared: { unlocks?: UnlockState } }, id: FeatureId): boolean {
  return save.shared.unlocks?.[id] !== undefined;
}

/** 조건을 채웠나 (저장과 무관한 순수 판정) */
export function ruleMet(rule: UnlockRule, p: UnlockProgress): boolean {
  if ('tierIndex' in rule) return p.maxTierIndex >= rule.tierIndex;
  if ('ascended' in rule) return p.ascended;
  return p.rebirths >= rule.rebirths;
}

/** 조건을 채운 기능을 연다. 새로 열린 기능 id (표 순서) */
export function applyUnlocks(state: UnlockState, p: UnlockProgress, nowMs: number): FeatureId[] {
  const fresh: FeatureId[] = [];
  for (const id of FEATURE_IDS) {
    if (state[id] !== undefined || !ruleMet(unlockRule(id), p)) continue;
    state[id] = nowMs;
    fresh.push(id);
  }
  return fresh;
}

/** 기능 표시 이름에 필요한 종족 설정 (전부 종족 json — 종족 분기 없음) */
export interface UnlockNames {
  tierNames: readonly string[];
  ascension: { name: string };
  rankBattleName?: string;
  training?: { title: string };
  gearScreen?: { title?: string; battleSlot?: string };
}

/** 기능 이름: 종족 설정에 있으면 그것, 없으면 공통 이름 */
export function featureName(f: UnlockNames, id: FeatureId): string {
  switch (id) {
    case 'tiles': return '지형 타일';
    case 'gear': return f.gearScreen?.title ?? '장비';
    case 'battleItem': return f.gearScreen?.battleSlot ?? '전투 소모품';
    case 'instinct': return f.training?.title ?? '수련';
    case 'rankBattle': return f.rankBattleName ?? '등급전';
    case 'accessory': return '장신구 칸';
    case 'pet': return '펫';
    case 'sortie': return '출정품';
  }
}

/** 열리는 때 한 마디: "길리안이 되면" / "아란칼화 클리어 후" / "첫 환생 후" (문구는 '클리어 후'로 통일 — GDD 241-C 10) */
export function unlockWhenText(f: UnlockNames, id: FeatureId): string {
  const rule = unlockRule(id);
  if ('tierIndex' in rule) return fixParticles(`${f.tierNames[rule.tierIndex] ?? `${rule.tierIndex + 1}단계`}이(가) 되면`);
  if ('ascended' in rule) return `${f.ascension.name} 클리어 후`;
  return rule.rebirths <= 1 ? '첫 환생 후' : `환생 ${rule.rebirths}번 후`;
}

/** 잠김 한 줄 (알림·툴팁): "길리안이 되면 장비가 열린다" */
export function unlockHintText(f: UnlockNames, id: FeatureId): string {
  return fixParticles(`${unlockWhenText(f, id)} ${featureName(f, id)}이(가) 열린다`);
}

/** 해금 안내 카드 id (engine/tutorial GUIDE_IDS). 타일은 옛 타일 안내(tile-intro)를 그대로 쓴다 */
export const UNLOCK_GUIDES = {
  tiles: 'tile-intro', gear: 'unlock-gear', battleItem: 'unlock-battle-item', instinct: 'unlock-instinct', rankBattle: 'unlock-rank', accessory: 'unlock-accessory', pet: 'unlock-pet', sortie: 'unlock-sortie',
} as const satisfies Record<FeatureId, string>;
