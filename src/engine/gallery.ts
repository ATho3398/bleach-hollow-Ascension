// 도감 일러스트·애니메이션 다시 보기 (GDD 14-8 v6.256 '일러스트·애니메이션 탭', C.570 — 사용자 2026-11-28 "도감에, 일러스트, 애니메이션 창 만들고 다시볼 수 있게
// 만드셈 … 테스트모드에선 다 볼 수 있게. 애니는 진화, 첫 시작 등등."). 순수 판정만: 무엇이 열렸나(본 적 있나)를 세이브 기록에서 읽는다 — 새 세이브 칸 없음.
// 애니메이션 = 탄생(첫 시작, 종족별) · 진화(실제로 지나간 바뀌기 전 → 뒤, 진화 기록 tiers.evolutions) · 아란칼화/참백도 구상화(이긴 기록) · 환생(환생 기록).
// 옛 세이브도 기록이 있으므로 지금 단계까지 지나온 진화·탄생은 본 것으로 친다. 테스트 모드 = 전부 열림. 종족 분기 없음(종족은 데이터에서).
import { ILLUSTRATIONS, type IllustDef } from '../data/gallery';
import type { RebirthRecord } from './runLog';

/** 진화 연출 한 번 (바뀌기 전 → 뒤). fromFormId null = 1단계(진화체 없음) */
export interface EvolveAnim {
  kind: 'evolve';
  factionId: string;
  fromTier: number;
  toTier: number;
  fromFormId: string | null;
  toFormId: string;
  fromLook: string | null;
  toLook: string | null;
}

export type AnimEntry =
  | { kind: 'birth'; factionId: string }
  | EvolveAnim
  | { kind: 'ascension'; factionId: string; formId: string | null; tierIndex: number }
  | { kind: 'rebirth'; factionId: string; record: RebirthRecord };

/** 목록 한 칸: entry = 다시 틀 연출, seen = 본 적 있나(못 봤으면 실루엣 + '???'). 못 본 진화 칸은 어느 단계인지만 안다(entry 없음) */
export interface AnimSlot {
  id: string;
  group: AnimEntry['kind'];
  factionId: string;
  seen: boolean;
  entry: AnimEntry | null;
  /** 못 본 진화 칸: 몇 단계 → 몇 단계 */
  tiers?: [number, number];
}

/** 기록을 읽는 데 필요한 트랙 모양 (세이브 본체 = 지금 트랙, otherTracks = 다른 트랙) */
export interface GalleryTrack {
  factionId: string;
  evolution: { tierIndex: number; ascended?: boolean; formId: string | null };
  runLog: {
    tiers: { evolutions: readonly { fromTier: number; toTier: number; fromFormId: string | null; toFormId?: string; formId: string; look?: string | null }[] };
    ascensions?: readonly { factionId: string; won: boolean; formId: string | null; tierIndex: number }[];
    rebirths: readonly RebirthRecord[];
  };
}

export interface GallerySave extends GalleryTrack {
  help: { guides: Record<string, string> };
  formDex: readonly string[];
  otherTracks?: readonly GalleryTrack[];
}

/** 슬롯의 트랙 전부 (지금 트랙이 먼저) */
export function tracksOf(save: GallerySave): GalleryTrack[] {
  return [save, ...(save.otherTracks ?? [])];
}

const evolveId = (e: Pick<EvolveAnim, 'factionId' | 'fromFormId' | 'toFormId' | 'toLook'>): string => `evolve:${e.factionId}:${e.fromFormId ?? '-'}>${e.toFormId}${e.toLook ? `@${e.toLook}` : ''}`;

/** 한 트랙의 진화 기록 → 진화 연출 (바뀌기 전 모습 = 그 앞 기록의 외형). 같은 쌍은 한 번만 */
export function evolveAnimsOf(t: GalleryTrack): EvolveAnim[] {
  const out: EvolveAnim[] = [];
  let prevLook: string | null = null;
  let prevTo: string | null = null;
  for (const r of t.runLog.tiers.evolutions) {
    const toFormId = r.toFormId ?? r.formId;
    // 환생하면 1단계부터 다시 — 앞 기록의 외형을 잇지 않는다
    const fromLook = r.fromFormId !== null && r.fromFormId === prevTo ? prevLook : null;
    out.push({ kind: 'evolve', factionId: t.factionId, fromTier: r.fromTier, toTier: r.toTier, fromFormId: r.fromFormId, toFormId, fromLook, toLook: r.look ?? null });
    prevLook = r.look ?? null;
    prevTo = toFormId;
  }
  const seen = new Set<string>();
  return out.filter((e) => (seen.has(evolveId(e)) ? false : (seen.add(evolveId(e)), true)));
}

/** 애니메이션 탭 목록 (테스트 모드가 아닐 때): 종족마다 탄생 · 진화(본 것 + 아직 못 간 단계는 '???') · 아란칼화/구상화 · 환생.
 *  factionIds = 게임의 종족 목록(종족 설정 순서), maxTierIndex = 마지막 단계 index */
export function animSlots(save: GallerySave, factionIds: readonly string[], maxTierIndex: number): AnimSlot[] {
  const tracks = tracksOf(save);
  const played = new Set(tracks.map((t) => t.factionId));
  const out: AnimSlot[] = [];
  for (const f of factionIds) {
    const mine = tracks.filter((t) => t.factionId === f);
    // 탄생: 그 종족 트랙이 있으면 본 것 — 지금 트랙은 탄생 안내가 끝났을 때(새 세이브가 방에 들어오기 전엔 아직)
    const birthSeen = played.has(f) && (save.factionId !== f || save.help.guides.birth !== 'pending' || mine.length > 1);
    out.push({ id: `birth:${f}`, group: 'birth', factionId: f, seen: birthSeen, entry: birthSeen ? { kind: 'birth', factionId: f } : null });
    const evolves = mine.flatMap(evolveAnimsOf);
    const ids = new Set<string>();
    for (const e of evolves) {
      const id = evolveId(e);
      if (ids.has(id)) continue;
      ids.add(id);
      out.push({ id, group: 'evolve', factionId: f, seen: true, entry: e });
    }
    // 아직 한 번도 못 지나간 단계 (그 종족을 해 본 적 있을 때만 — 다른 종족 칸은 탄생 '???' 하나로 충분)
    if (played.has(f)) {
      for (let tier = 0; tier < maxTierIndex; tier++) {
        if (!evolves.some((e) => e.fromTier === tier)) out.push({ id: `evolve:${f}:tier${tier}`, group: 'evolve', factionId: f, seen: false, entry: null, tiers: [tier, tier + 1] });
      }
    }
    const asc = mine.flatMap((t) => (t.runLog.ascensions ?? []).filter((a) => a.won && a.factionId === f));
    const ascNow = mine.find((t) => t.evolution.ascended);
    const ascSeen = asc.length > 0 || !!ascNow;
    const last = asc.at(-1);
    out.push({
      id: `ascension:${f}`, group: 'ascension', factionId: f, seen: ascSeen,
      entry: ascSeen ? { kind: 'ascension', factionId: f, formId: last?.formId ?? ascNow?.evolution.formId ?? null, tierIndex: last?.tierIndex ?? ascNow?.evolution.tierIndex ?? maxTierIndex } : null,
    });
    const rebirths = mine.flatMap((t) => t.runLog.rebirths.filter((r) => r.factionId === f));
    if (rebirths.length === 0) out.push({ id: `rebirth:${f}`, group: 'rebirth', factionId: f, seen: false, entry: null });
    for (const r of rebirths) out.push({ id: `rebirth:${f}:${r.count}:${r.at}`, group: 'rebirth', factionId: f, seen: true, entry: { kind: 'rebirth', factionId: f, record: r } });
  }
  return out;
}

/** 테스트 모드 애니메이션 목록: 종족마다 탄생·아란칼화/구상화·환생(본보기 기록) 전부 열림. 진화는 화면이 '진화 연출 고르기'(모든 진화체 쌍)로 따로 연다 */
export function testAnimSlots(factionIds: readonly string[], maxTierIndex: number, nowMs = 0): AnimSlot[] {
  return factionIds.flatMap((f): AnimSlot[] => [
    { id: `birth:${f}`, group: 'birth', factionId: f, seen: true, entry: { kind: 'birth', factionId: f } },
    { id: `ascension:${f}`, group: 'ascension', factionId: f, seen: true, entry: { kind: 'ascension', factionId: f, formId: null, tierIndex: maxTierIndex } },
    {
      id: `rebirth:${f}`, group: 'rebirth', factionId: f, seen: true,
      entry: { kind: 'rebirth', factionId: f, record: { at: nowMs, count: 1, factionId: f, prevFormId: null, prevTierIndex: maxTierIndex, prevElements: [], keptTraitId: null, carry: {}, runsCompleted: 0 } },
    },
  ]);
}

/** 일러스트가 열렸나 (테스트 모드 = 전부) */
export function illustUnlocked(d: IllustDef, save: GallerySave, test = false): boolean {
  if (test) return true;
  const u = d.unlock;
  const tracks = tracksOf(save);
  switch (u.kind) {
    case 'always': return true;
    case 'tier': return tracks.some((t) => t.evolution.tierIndex >= u.tierIndex || t.runLog.tiers.evolutions.some((e) => e.toTier >= u.tierIndex));
    case 'form': return save.formDex.includes(u.formId);
    case 'rebirth': return tracks.reduce((n, t) => n + t.runLog.rebirths.length, 0) >= u.count;
  }
}

/** 이 종족에서 보이는 일러스트 (데이터 순서) */
export function illustsFor(factionId: string, list: readonly IllustDef[] = ILLUSTRATIONS): IllustDef[] {
  return list.filter((d) => !d.forFaction || d.forFaction === factionId);
}

/** 열리는 조건 문구 (임시·provisional) — 못 연 칸 상세에 */
export function illustUnlockText(d: IllustDef, tierNames: readonly string[]): string {
  const u = d.unlock;
  switch (u.kind) {
    case 'always': return '처음부터 열려 있다';
    case 'tier': return `${u.tierIndex + 1}단계 ${tierNames[u.tierIndex] ?? ''}에 닿으면 열린다`.replace(/\s+에/, '에');
    case 'form': return '어떤 진화체를 발견하면 열린다';
    case 'rebirth': return `환생 ${u.count}번 하면 열린다`;
  }
}
