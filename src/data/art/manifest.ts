// 그림 매니페스트 (GDD 16-1 7번): 화면은 그림 파일을 직접 쓰지 않고 키로 참조한다.
// 지금은 모든 항목이 비어 있어 코드로 만든 자리표시 도형(CSS)이 나온다. 최종 그림을 받으면 아래 항목에 파일을 적기만 하면 된다.
//
//   교체 방법: 파일을 `public/art/` 에 넣고 해당 키의 `src`(한 장) 또는 `frames`(제자리 2프레임)에 `art/파일이름.png` 를 적는다.
//   키를 새로 만들면 종족 설정(`src/data/factions/*.json` 의 `room`)에서 그 키를 가리키면 된다. 코드 수정 불필요.
//
// 키 규칙: scene.<이름> 방 배경 / char.<이름> 캐릭터(프레임) / prop.<이름> 방 안 물건
//
// 파일만 넣어도 된다(GDD 17-6): `public/art/` 에 키의 마침표를 하이픈으로 바꾼 이름(scene-cave.png, prop-door.webp,
// enemy-<적id>.png, char-<종족>-<단계번호>.png, char-<종족>.png)으로 넣으면 이 목록을 고치지 않아도 인식한다(`files.ts`).
// 이 목록의 src·frames 는 파일 규칙에 맞지 않는 이름을 쓰고 싶을 때의 직접 지정이고, scale·offsetY 는 어느 쪽이든 쓴다.
// 우선순위: 캐릭터 = 단계별 파일 > 종족 공통 파일 > 이 목록의 src/frames > 자리표시 도형 / 그 밖 = 이 목록의 직접 지정 > 파일 규칙 > 자리표시.
import type { Locomotion } from '../../engine/locomotion';
import { charArtKeys, findArtFile, ART_FILES } from './files';

export interface ArtEntry {
  /** 한 장짜리 그림 경로 (public/ 기준, 예 "art/scene-hollow.png"). 비우면 자리표시 도형 */
  src?: string;
  /** 제자리 2프레임 (캐릭터 숨쉬기). 2장이면 번갈아 보인다. 비우면 자리표시 도형 */
  frames?: [string, string];
  /** 그림 크기 보정 배율(기본 1). 큰 몬스터는 1.3 같은 값. 파일 없이 이 값만 적어도 된다 */
  scale?: number;
  /** 세로 위치 보정(기본 0): 칸 높이 대비 %, 양수면 아래로 */
  offsetY?: number;
  /** 이 그림의 이동 방식(GDD 18-11): 부유 float / 걷기 walk / 날기 fly. 진화체·종족 기본보다 우선한다. 비우면 그쪽 값 */
  locomotion?: Locomotion;
}

/** 화면이 쓰는 그림 정보 */
export interface ArtUrls {
  src: string | null;
  frames: [string, string] | null;
  scale: number;
  offsetY: number;
  /** manifest 에서 정한 이동 방식(없으면 undefined = 진화체·종족 기본을 따른다) */
  locomotion?: Locomotion;
}

export const ART_MANIFEST: Readonly<Record<string, ArtEntry>> = {
  'scene.cave': {},
  'scene.room': {},
  'char.hollow': {},
  'char.shinigami': {},
  'prop.door': {},
  'prop.altar': {},
  'prop.book': {},
  'prop.chest': {},
  'prop.window': {},
  'prop.dummy': {},
};

/** 그림 키 → 실제 이미지 URL(없으면 null = 자리표시를 쓴다). base 는 배포 경로(Vite BASE_URL) */
export function artUrls(key: string, base = '/', manifest: Readonly<Record<string, ArtEntry>> = ART_MANIFEST, files: readonly string[] = ART_FILES): ArtUrls {
  const e = manifest[key];
  const join = (p: string) => (/^(https?:|data:)/.test(p) ? p : `${base.replace(/\/$/, '')}/${p.replace(/^\//, '')}`);
  const auto = !e?.src && !e?.frames ? findArtFile(key, files) : null;
  return {
    src: e?.src ? join(e.src) : auto ? join(auto) : null,
    frames: e?.frames ? [join(e.frames[0]), join(e.frames[1])] : null,
    scale: e?.scale ?? 1,
    offsetY: e?.offsetY ?? 0,
    locomotion: e?.locomotion,
  };
}

/** 적 그림: `enemy-<적id>` 파일이 있을 때만 값을 돌려준다(없으면 null = 기존 실루엣). 목록에 scale·offsetY 만 적어도 된다 */
export function enemyArt(enemyId: string, base = '/', manifest: Readonly<Record<string, ArtEntry>> = ART_MANIFEST, files: readonly string[] = ART_FILES): ArtUrls | null {
  const a = artUrls(`enemy.${enemyId}`, base, manifest, files);
  return a.src ? a : null;
}

/** 캐릭터 그림. 새 규칙(단계별 파일 > 종족 공통 파일)이 있으면 그 한 장이 우선이고(frames 없음),
 *  없으면 종족 설정의 기존 키(`fallbackKey`, 예 char.hollow)의 직접 지정 → 파일 → 자리표시 순서. 종족 id 는 키 조립에만 쓴다 */
export function charArt(factionId: string, tierIndex: number, fallbackKey: string, base = '/', manifest: Readonly<Record<string, ArtEntry>> = ART_MANIFEST, files: readonly string[] = ART_FILES): ArtUrls {
  const join = (p: string) => `${base.replace(/\/$/, '')}/${p.replace(/^\//, '')}`;
  for (const key of charArtKeys(factionId, tierIndex)) {
    const file = findArtFile(key, files);
    if (!file) continue;
    const e = manifest[key] ?? manifest[fallbackKey];
    return { src: join(file), frames: null, scale: e?.scale ?? 1, offsetY: e?.offsetY ?? 0, locomotion: manifest[key]?.locomotion ?? manifest[fallbackKey]?.locomotion };
  }
  return artUrls(fallbackKey, base, manifest, files);
}
