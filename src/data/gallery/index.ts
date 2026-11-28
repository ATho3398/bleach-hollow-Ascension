// 도감 일러스트 목록 (GDD 14-8 v6.256 '일러스트·애니메이션 탭', C.570 — 사용자 2026-11-28 "일러도 추가해줄거임"): 데이터 파일 하나(illustrations.json)에
// id·그림 키·제목·열리는 조건만 둔다. 지금은 빈 목록 — 사용자가 그림을 주면 줄만 더한다. 조건 문구는 임시·provisional. 종족 무관(그림 키가 종족별이면 forFaction 으로 거른다)
import raw from './illustrations.json';

export type IllustUnlock =
  | { kind: 'always' }
  | { kind: 'tier'; tierIndex: number }
  | { kind: 'form'; formId: string }
  | { kind: 'rebirth'; count: number };

export interface IllustDef {
  id: string;
  /** 그림 키 (artUrls 키) */
  art: string;
  title: string;
  unlock: IllustUnlock;
  /** 이 종족에서만 보인다 (없으면 모든 종족) */
  forFaction?: string;
}

/** 한 줄 검사 — 틀리면 던진다(데이터 실수를 빌드·테스트에서 잡는다) */
export function parseIllust(r: unknown): IllustDef {
  const p = (r ?? {}) as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof p.id !== 'string' || !p.id.startsWith('illust-')) errors.push("id: 'illust-…'");
  if (typeof p.art !== 'string' || !p.art) errors.push('art: 그림 키');
  if (typeof p.title !== 'string' || !p.title) errors.push('title');
  if (p.forFaction !== undefined && (typeof p.forFaction !== 'string' || !p.forFaction)) errors.push('forFaction: 종족 id');
  const u = (p.unlock ?? {}) as Record<string, unknown>;
  const int = (v: unknown, min: number): boolean => typeof v === 'number' && Number.isInteger(v) && v >= min;
  const ok = u.kind === 'always' || (u.kind === 'tier' && int(u.tierIndex, 0)) || (u.kind === 'form' && typeof u.formId === 'string' && !!u.formId) || (u.kind === 'rebirth' && int(u.count, 1));
  if (!ok) errors.push("unlock: { kind: 'always' } | { kind: 'tier', tierIndex } | { kind: 'form', formId } | { kind: 'rebirth', count }");
  if (errors.length) throw new Error(`일러스트 데이터 오류 (${String(p.id ?? '?')}): ${errors.join(', ')}`);
  return { id: p.id as string, art: p.art as string, title: p.title as string, unlock: u as unknown as IllustUnlock, ...(p.forFaction ? { forFaction: p.forFaction as string } : {}) };
}

export const ILLUSTS_PROVISIONAL: boolean = raw.provisional;
export const ILLUSTRATIONS: readonly IllustDef[] = (raw.illustrations as unknown[]).map(parseIllust);
