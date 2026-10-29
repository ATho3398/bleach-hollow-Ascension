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
import { charArtKeys, findArtFile, ART_ANIMS, ART_FILES } from './files';
import { frameFiles, hasAnims, resolveAnims, type AnimOverrides, type AnimSet } from './anim';
import { getSkin, skinArtKey } from '../skins';
import { FACTIONS } from '../factions';
import { activeGender, FEMALE_KEY_SUFFIX, usesFemaleLook, type Gender } from '../../engine/gender';
import { HUMANOID } from './rig/pose';

/** 종이인형 여성 외형 id 꼬리 (humanoid.json looks: shinigami-base → shinigami-base-f) */
export const RIG_FEMALE_SUFFIX = '-f';

export interface ArtEntry {
  /** 한 장짜리 그림 경로 (public/ 기준, 예 "art/scene-hollow.png"). 비우면 자리표시 도형 */
  src?: string;
  /** 제자리 2프레임 (캐릭터 숨쉬기). 2장이면 번갈아 보인다. 비우면 자리표시 도형 */
  frames?: [string, string];
  /** 그림 크기 보정 배율(기본 1). 큰 몬스터는 1.3 같은 값. 파일 없이 이 값만 적어도 된다 */
  scale?: number;
  /** 걷기(원정)·전투 필드에서 쓰는 배율 (C.176, GDD 106장 3). 비우면 scale — 방은 scale */
  fieldScale?: number;
  /** 세로 위치 보정(기본 0): 칸 높이 대비 %, 양수면 아래로 */
  offsetY?: number;
  /** 종이인형 외형 id(GDD 96장 30, src/data/art/rig/humanoid.json 의 looks). 있으면 단계별 파일이 없는 한 종족 공통 그림 대신 종이인형이 움직인다 */
  rig?: string;
}

/** 화면이 쓰는 그림 정보 */
export interface ArtUrls {
  src: string | null;
  frames: [string, string] | null;
  scale: number;
  /** 걷기·전투 필드 배율 (없으면 scale) */
  fieldScale?: number;
  offsetY: number;
  /** 프레임 애니 (GDD 26장): 동작별로 있는 것만. 없는 동작은 기존 연출을 쓴다 */
  anims?: AnimSet;
  /** 종이인형 (GDD 96장 30): 외형 id 와 부위 그림 폴더 주소. src 는 쉬는 자세 정지 그림 */
  rig?: { look: string; partBase: string };
  /** 그림 위에서 머리 윗변까지 (그림 높이 대비 0~1, 없으면 0 = 그림 윗변). 종이인형은 칸이 칼 자리까지 넓어 머리 위가 비어 있다 — 머리 위 상태 칩 높이용 (C.190) */
  headTop?: number;
}

export const ART_MANIFEST: Readonly<Record<string, ArtEntry>> = {
  'scene.cave': {},
  'scene.room': {},
  'char.hollow': {},
  // 사신 기본형은 종이인형으로 움직인다 (GDD 96장 30, 사용자 2026-10-28 "사신은 모션은 게임에도 적용시켜"). 단계별 파일(char-shinigami-<n>)이 있으면 그쪽이 먼저
  // 정지 그림 칸(view)은 옛 한 장 그림 규격(정사각·발 가운데·발 아래 8% 위)이라 위치 보정 없음. 칸이 칼 휘두를 자리까지 넓어(152도트) 키운다 —
  // C.189 의 키(1.32 × 152/113 ≈ 1.78)에서 사용자 2026-10-29 "캐릭터 크기 1/4정도 줄이고" → ×0.75 ≈ 1.33 (C.190, GDD 116장 1·4).
  // 방(홈)은 다시 C.189 키 1.78, 걷기·전투 필드만 1.33 (C.192, GDD 118장 1: "홈에서 사신, 아란칼 크기는 원래가 좋아. 모험이랑 전투할 떄 사이즈는 지금이 딱 좋음")
  'char.shinigami': { rig: 'shinigami-base', scale: 1.78, fieldScale: 1.33, offsetY: 0 },
  // 사신 1단계(혼백)·2단계(학생) = 진앙영술원 학생복 (사용자 2026-10-29 "기본적으로 혼백, 학생은 진앙영술원 학생복으로 시작", GDD 116장 2). 3단계부터 종족 공통(사신복)
  'char.shinigami.1': { rig: 'shinigami-student', scale: 1.78, fieldScale: 1.33, offsetY: 0 },
  'char.shinigami.2': { rig: 'shinigami-student', scale: 1.78, fieldScale: 1.33, offsetY: 0 },
  // 메노스 그랑데(2단계): 그림이 작아 2배 키움 (C.137, GDD 85장 1). 발은 그림 아래쪽 약 8% 위라 확대 기준점(92%)과 거의 같다.
  // 걷기·전투 필드는 1.5배 (C.176, GDD 106장 3: 2배면 그림 높이가 1단계의 약 1.26배·폭 1.4배로 필드 위로 넘쳤다 → 높이·폭이 1단계와 비슷하게)
  'char.hollow.2': { scale: 2, fieldScale: 1.5 },
  // 아란칼(5단계) 진화체 자리 전부 = 아란칼 기본형 종이인형 (GDD 115장 2, C.189). 속성·칸별 스킨 그림(skin-arr*.png)이 오면 그쪽이 먼저(charArt 스킨 순서 그대로).
  // 여성이면 arrancar-base-f (genderLookFromTier 5). 크기·위치는 사신 종이인형과 같은 칸(view)이라 같은 값
  'char.hollow.5': { rig: 'arrancar-base', scale: 1.78, fieldScale: 1.33, offsetY: 0 },
  'prop.door': {},
  'prop.altar': {},
  'prop.book': {},
  'prop.chest': {},
  'prop.shop': {},
  // 온천 (GDD 123장 4, C.198): 방 물건·온천 화면 배경 그림 자리 — 사용자 그림 대기(비어 있으면 아이콘·임시 배경)
  'prop.spa': {},
  'scene.spa': {},
  // 장터 (GDD 127장 2, C.201): 방 물건(장터 문)·장터 배경·떠돌이 상인 그림 자리 — 사용자 그림 대기(비어 있으면 아이콘·임시 배경)
  'prop.market': {},
  'scene.market': {},
  'prop.wanderer': {},
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
    ...(e?.fieldScale !== undefined ? { fieldScale: e.fieldScale } : {}),
    offsetY: e?.offsetY ?? 0,
  };
}

const joinBase = (base: string, p: string) => `${base.replace(/\/$/, '')}/${p.replace(/^\//, '')}`;
const withAnims = (a: ArtUrls, anims: AnimSet): ArtUrls => (hasAnims(anims) ? { ...a, anims } : a);

/** 적 그림: `enemy-<적id>` 한 장짜리 파일이나 `idle` 애니가 있을 때만 값을 돌려준다(없으면 null = 기존 실루엣). 목록에 scale·offsetY 만 적어도 된다 */
export function enemyArt(enemyId: string, base = '/', manifest: Readonly<Record<string, ArtEntry>> = ART_MANIFEST, files: readonly string[] = ART_FILES, overrides: Readonly<Record<string, AnimOverrides>> = ART_ANIMS as Record<string, AnimOverrides>): ArtUrls | null {
  const key = `enemy.${enemyId}`;
  const a = artUrls(key, base, manifest, files);
  const anims = resolveAnims([key], base, files, overrides);
  // 한 장짜리 파일이 없고 idle 애니만 있으면 idle-1 을 정지 그림으로도 쓴다 (GDD 26-2)
  const src = a.src ?? anims.idle?.frames[0] ?? null;
  return src ? withAnims({ ...a, src }, anims) : null;
}

/** 종이인형 그림 칸(view)에서 머리 윗변(캔버스 y 0)까지의 비율 */
function rigHeadTop(): number {
  const r = HUMANOID.view?.rect;
  return r ? Math.max(0, -r[1] / r[3]) : 0;
}

/** 캐릭터 그림. 새 규칙(단계별 파일 > 종족 공통 파일)이 있으면 그 한 장이 우선이고(frames 없음),
 *  없으면 종족 설정의 기존 키(`fallbackKey`, 예 char.hollow)의 직접 지정 → 파일 → 자리표시 순서. 종족 id 는 키 조립에만 쓴다.
 *  프레임 애니(GDD 26장)는 동작마다 단계별 폴더 → 종족 공통 폴더 순서로 찾는다.
 *  skinId 가 있고 그 스킨 그림이 하나라도 있으면 단계와 상관없이 스킨 그림(`skin-<id>` 한 장·폴더)만 쓴다(없는 동작은 기존 연출, 진화체 애니로 대신하지 않는다).
 *  성별 (GDD 114장): 여성이고 종족 설정 genderLookFromTier 단계 이상이면 키마다 여성 키(`<키>.f` → 파일 `-f`)를 먼저 찾고, 없으면 그 키(남성) 그대로 — 여성 그림이 없으면 지금과 같은 그림 */
export function charArt(factionId: string, tierIndex: number, fallbackKey: string, base = '/', manifest: Readonly<Record<string, ArtEntry>> = ART_MANIFEST, files: readonly string[] = ART_FILES, skinId?: string | null, overrides: Readonly<Record<string, AnimOverrides>> = ART_ANIMS as Record<string, AnimOverrides>, gender: Gender = activeGender()): ArtUrls {
  const female = usesFemaleLook(gender, tierIndex, FACTIONS.find((f) => f.id === factionId)?.genderLookFromTier);
  const tryKeys = (plain: string[]): ArtUrls | null => {
    const keys = female ? plain.flatMap((k) => [k + FEMALE_KEY_SUFFIX, k]) : plain;
    for (const key of keys) {
      // 정지 그림: 한 장짜리 파일, 없으면 그 폴더의 idle-1 (GDD 26-2)
      const still = findArtFile(key, files) ?? frameFiles(key, 'idle', files)[0] ?? null;
      if (!still) continue;
      const own = manifest[key] ?? (key.endsWith(FEMALE_KEY_SUFFIX) ? manifest[key.slice(0, -FEMALE_KEY_SUFFIX.length)] : undefined); // 여성 키는 같은 키(남성)의 크기·위치를 물려받는다
      const e = own ?? manifest[fallbackKey];
      const a: ArtUrls = { src: joinBase(base, still.startsWith('art/') ? still : `art/${still}`), frames: null, scale: e?.scale ?? 1, ...(e?.fieldScale !== undefined ? { fieldScale: e.fieldScale } : {}), offsetY: e?.offsetY ?? 0 };
      return withAnims(a, resolveAnims(keys, base, files, overrides));
    }
    return null;
  };
  if (skinId && getSkin(skinId)) {
    const skin = tryKeys([skinArtKey(skinId)]);
    if (skin) return skin; // 스킨 그림이 아직 하나도 없으면 진화체 그림으로 (빈 화면 방지)
  }
  const keys = charArtKeys(factionId, tierIndex);
  // 종이인형 (GDD 115-A 30, 115장): 단계별 종이인형(char.<종족>.<n> 의 rig)은 그 단계 대체 그림 파일보다 먼저 — 진화체 자리 전부가 종이인형.
  // 종족 공통 종이인형(char.<종족> 의 rig)은 단계별 파일이 없을 때만 (종족 공통 그림보다 먼저). 정지 그림 = 쉬는 자세 한 장
  // 목록·사진처럼 종족 기본 키를 안 넘기는 곳(fallbackKey '')도 단계별 종이인형은 정지 그림으로 같게 보인다
  const stagedRig = manifest[keys[0]!]?.rig;
  const rigKey = stagedRig ? keys[0]! : fallbackKey;
  const rigLook = stagedRig ?? (fallbackKey ? manifest[fallbackKey]?.rig : undefined);
  if (rigLook) {
    if (!stagedRig) {
      const staged = tryKeys(keys.slice(0, 1));
      if (staged) return staged;
    }
    // 여성 외형 = 외형 id 뒤 -f (GDD 114·115장). 없으면 그 외형(남성) 그대로
    const look = female && HUMANOID.looks[rigLook + RIG_FEMALE_SUFFIX] ? rigLook + RIG_FEMALE_SUFFIX : rigLook;
    const e = manifest[rigKey]!;
    return { src: joinBase(base, `art/rig/humanoid/still/${look}.png`), frames: null, scale: e.scale ?? 1, ...(e.fieldScale !== undefined ? { fieldScale: e.fieldScale } : {}), offsetY: e.offsetY ?? 0, rig: { look, partBase: joinBase(base, 'art/rig/humanoid/') }, headTop: rigHeadTop() };
  }
  return tryKeys(keys) ?? artUrls(fallbackKey, base, manifest, files);
}
