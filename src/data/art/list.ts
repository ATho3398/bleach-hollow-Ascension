// 그림 파일 목록 (GDD 17-6): 지금 필요한 파일 이름과 넣어졌는지 여부. `npm run art:list` 와 docs/art-guide.md 의 표가 같은 규칙을 쓴다.
import type { ArtEntry } from './manifest';
import { animCountsLine, animDir } from './anim';
import { artFileName, charArtKeys, enemyArtKey, findArtFile } from './files';
import { skinArtKey } from '../skins';

export interface ArtWishRow {
  group: '캐릭터' | '몬스터' | '방';
  /** 제작할 파일 이름(.png 기준, .webp 도 된다) */
  file: string;
  /** 사람이 읽는 설명 */
  note: string;
  /** public/art/ 에 이미 들어 있나 */
  present: boolean;
}

interface FactionLike { id: string; name: string; tierNames: readonly string[] }
interface EnemyLike { id: string; name: Record<string, string>; class: string; testOnly?: boolean }

/** 필요한 그림 전체 목록: 캐릭터(종족 × 단계 + 종족 공통), 몬스터(실제 적 전부), 방(manifest 의 scene·prop 키) */
export function artWishlist(factions: readonly FactionLike[], enemies: readonly EnemyLike[], manifest: Readonly<Record<string, ArtEntry>>, files: readonly string[]): ArtWishRow[] {
  const rows: ArtWishRow[] = [];
  const row = (group: ArtWishRow['group'], key: string, note: string) => rows.push({ group, file: artFileName(key), note, present: findArtFile(key, files) !== null });
  for (const f of factions) {
    f.tierNames.forEach((t, i) => row('캐릭터', charArtKeys(f.id, i)[0]!, `${f.name} ${i + 1}단계 ${t}`));
    row('캐릭터', charArtKeys(f.id, 0)[1]!, `${f.name} 공통(단계별 파일이 없는 단계에 쓰인다)`);
  }
  for (const e of enemies.filter((x) => !x.testOnly)) row('몬스터', enemyArtKey(e.id), `${e.name['*'] ?? e.id} (${e.class === 'elite' ? '강적' : '일반'})`);
  for (const key of Object.keys(manifest).filter((k) => /^(scene|prop)\./.test(k))) row('방', key, key.startsWith('scene.') ? '방 배경' : '방 안 물건');
  return rows;
}

export interface AnimListRow {
  group: '캐릭터' | '몬스터' | '스킨';
  /** 폴더 이름(그림 키) */
  dir: string;
  /** 동작별 프레임 수 한 줄 (예 `idle 3 · move 5 · attack 없음`), 애니 폴더가 없으면 null */
  line: string | null;
  note: string;
}

interface SkinLike { id: string; name: string; tentativeName: boolean; factionId: string }

/** 프레임 애니 현황 (GDD 26-4, C.55): 애니 폴더가 있는 캐릭터·몬스터와, 스킨 전부(폴더가 없어도 줄은 나온다). 프레임 수는 1번부터 끊김 없이 이어진 장수 */
export function animWishlist(factions: readonly FactionLike[], enemies: readonly EnemyLike[], skins: readonly SkinLike[], files: readonly string[]): AnimListRow[] {
  const rows: AnimListRow[] = [];
  const add = (group: AnimListRow['group'], key: string, note: string, always = false) => {
    const line = animCountsLine(key, files);
    if (line || always) rows.push({ group, dir: animDir(key), line, note });
  };
  for (const f of factions) {
    f.tierNames.forEach((t, i) => add('캐릭터', charArtKeys(f.id, i)[0]!, `${f.name} ${i + 1}단계 ${t}`));
    add('캐릭터', charArtKeys(f.id, 0)[1]!, `${f.name} 공통`);
  }
  for (const e of enemies.filter((x) => !x.testOnly)) add('몬스터', enemyArtKey(e.id), e.name['*'] ?? e.id);
  for (const s of skins) add('스킨', skinArtKey(s.id), `${s.name}${s.tentativeName ? '(가칭)' : ''} · ${s.factionId === 'all' ? '공용' : s.factionId}`, true);
  return rows;
}
