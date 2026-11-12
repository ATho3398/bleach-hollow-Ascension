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
import { rigPackOfLook } from './rig/pose';

/** 종이인형 여성 외형 id 꼬리 (humanoid.json looks: shinigami-base → shinigami-base-f) */
export const RIG_FEMALE_SUFFIX = '-f';
/** 여성 종이인형 외형인가 (C.398, 마스터AL "여성 해방 아란칼 bodySlot 버그"): id 가 '-f' 로 끝나거나 '-f-' 를 품으면 여(예 arrancar-base-f-released = 여성 해방).
 *  블록 도트 연출 몸동작 칸(남·여)을 고를 때 쓴다 */
export function isFemaleRigLook(look: string): boolean {
  return look.endsWith(RIG_FEMALE_SUFFIX) || look.includes(`${RIG_FEMALE_SUFFIX}-`);
}

// ── 조각 모델 표시 주소 (C.431, GDD 12-4 v6.029) ──
/** 외형 id 앞머리: 'mosaic:<초월자 id>' (artSkinOf 가 돌려준다) */
export const MOSAIC_LOOK_PREFIX = 'mosaic:';
const MOSAIC_BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
export const MOSAIC_MARK = '#mosaic=';
/** 몸 그림 표시 주소: 1×1 투명 그림 + 표시. 화면 관찰자가 이 주소를 단 그림을 찾아 합성 그림으로 바꾼다 */
export function mosaicSrc(transcendentId: string): string {
  return `${MOSAIC_BLANK}${MOSAIC_MARK}${transcendentId}`;
}
export function mosaicIdOf(src: string | null): string | null {
  const i = src ? src.indexOf(MOSAIC_MARK) : -1;
  return i >= 0 ? src!.slice(i + MOSAIC_MARK.length) : null;
}

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
  /** 종이인형 (GDD 96장 30): 외형 id 와 부위 그림 폴더 주소. src 는 쉬는 자세 정지 그림. rigId = 뼈대(없으면 사람형, 뱀형 = serpent — GDD 115-A 100) */
  rig?: { look: string; partBase: string; rigId?: string };
  /** 그림 위에서 머리 윗변까지 (그림 높이 대비 0~1, 없으면 0 = 그림 윗변). 종이인형은 칸이 칼 자리까지 넓어 머리 위가 비어 있다 — 머리 위 상태 칩 높이용 (C.190) */
  headTop?: number;
}

/** 내 덩치(호로 기본·덩치 스킨) 배율: 정지 그림 키(칸의 0.38) × 2.1 ≈ 지운 그림 키 0.8 (C.343) */
export const HOLLOW_BRUTE_SCALE = 2.1;
/** 적 덩치 배율 = 내 덩치와 같은 값 (C.345, GDD 206장 보충 "적 사이즈 나랑 맞춰"): 전투 적 칸·내 칸은 같은 크기라(실측) 배율이 같으면 키·도트 한 칸이 같다. 옛 값 1.78 은 0.85배로 작았다 */
export const BRUTE_FOE_SCALE = HOLLOW_BRUTE_SCALE;
/** 덩치 몸 적의 속성 색 (GDD 205장 3, 지금 적 그림 색 그대로) */
export const BRUTE_ELEMENT_LOOKS: Readonly<Record<string, string>> = { kyo: 'brute-base', blood: 'brute-red', normal: 'brute-gray', earth: 'brute-brown', fire: 'brute-orange', poison: 'brute-green', thunder: 'brute-yellow', water: 'brute-blue' };
/** 덩치 몸 적 종류 (GDD 206장 2) — swift 는 마른 몸이라 빠짐 */
export const BRUTE_ENEMY_KINDS = ['basic', 'sturdy', 'heavy-chain', 'heavy-seal', 'stance'] as const;
const BRUTE_ENEMIES: Record<string, ArtEntry> = Object.fromEntries(Object.entries(BRUTE_ELEMENT_LOOKS).flatMap(([el, look]) => BRUTE_ENEMY_KINDS.map((k) => [`enemy.${el}-${k}`, { rig: look, scale: BRUTE_FOE_SCALE }])));
/** 길리안(2단계 외형, 몸 hd) 배율 (GDD 219장 1): 정지 그림 키(칸의 0.37) × 2.3 ≈ 0.85 — 1단계 덩치(0.8)보다 조금 크게 */
export const GILLIAN_SCALE = 2.3;
/** 뱀형(뼈대 serpent) 배율 (GDD 219장 2): 그림 칸 72(사람형 152) · 정지 그림 키(칸의 0.52) × 1.6 ≈ 0.83 — 덩치(0.8)와 비슷한 키(도트는 덩치보다 굵다) */
export const SERPENT_SCALE = 1.6;
/** 뱀형 강적 (GDD 219장 2, 사용자 "아쥬커스 등급 강적에 2개"): 아쥬커스 등급 강적 중 뱀에 어울리는 둘 — 롯팽(독) = 초록, 마레하다(물) = 파랑. 덩치 적 목록을 덮는다 */
export const SERPENT_ENEMIES: Readonly<Record<string, string>> = { 'poison-heavy-chain': 'serpent-green', 'water-heavy-chain': 'serpent-blue' };
/** 짐승형(뼈대 beast) 배율 (GDD 228장 2): 그림 칸 80 · 정지 그림 키(칸의 0.39) × 1.5 ≈ 0.58, 몸길이 ≈ 칸 너비 — 네 발이라 키는 덩치(0.8)보다 낮고 길이가 길다 */
export const BEAST_SCALE = 1.5;
/** 짐승형 강적 (GDD 228장 2, 사용자 2026-11-11 "짐승형도 배색 4개정도 추가해서, 아쥬커스 강적에 3개정도 추가하고"): 아쥬커스 등급 강적 중 셋 — 스톰후프(번개) = 노랑, 브라세로(불) = 주황, 나이트램(허) = 보라. 덩치 적 목록을 덮는다 */
export const BEAST_ENEMIES: Readonly<Record<string, string>> = { 'thunder-heavy-chain': 'beast-yellow', 'fire-heavy-chain': 'beast-orange', 'kyo-heavy-chain': 'beast-violet' };
/** 외팔이(사람형 뼈대, 몸 ho) 배율 (GDD 231장 2): 1배 도트(키 56칸 = 칸의 0.37) × 2.2 ≈ 0.81 — 덩치(0.8)와 비슷한 키 */
export const ONEARM_SCALE = 2.2;
/** 외팔이 강적 (GDD 231장 2, 사용자 2026-11-11 "외팔이는 무조건 물리로만 … 각각 아쥬커스 등급 강적으로도 몇개"): 아쥬커스 등급·물리 강적 셋 — 샌드트랩(땅) = 갈색, 셸그레이브(물) = 파랑, 파라라요스(번개) = 황토. 덩치 적 목록을 덮는다 */
export const ONEARM_ENEMIES: Readonly<Record<string, string>> = { 'earth-heavy-seal': 'onearm-brown', 'water-stance': 'onearm-blue', 'thunder-stance': 'onearm-yellow' };
/** 거미형(뼈대 spider) 배율 (GDD 231장 3): 그림 칸 120 · 정지 그림 키(칸의 0.68) × 1.2 ≈ 0.81 */
export const SPIDER_SCALE = 1.2;
/** 거미형 강적 (GDD 231장 3, 사용자 "거미는 혼합이랑 특공으로"): 아쥬커스 등급·특수/혼합 강적 셋 — 잉크베일(물·특수) = 파랑, 숨비도(번개·특수) = 황토, 듄워든(땅·혼합) = 갈색. 덩치 적 목록을 덮는다 */
export const SPIDER_ENEMIES: Readonly<Record<string, string>> = { 'water-heavy-seal': 'spider-blue', 'thunder-heavy-seal': 'spider-yellow', 'earth-stance': 'spider-brown' };
/** 가시형(사람형 뼈대, 몸 hk)·속도형(몸 hv) 배율 (GDD 240장): 1배 도트(키 77·74칸 = 칸의 0.5) × 1.65 ≈ 0.82 — 덩치와 비슷한 키 */
export const SPIKY_SCALE = 1.65;
export const SPEED_SCALE = 1.65;
/** 부유형(뼈대 wraith) 배율 (GDD 240장): 그림 칸 120 · 떠 있는 키(칸의 0.71) × 1.15 ≈ 0.82 */
export const WRAITH_SCALE = 1.15;
/** 새 모델 강적 (GDD 240장 4, 사용자 2026-11-12 "아쥬커스 기반 강적들한테 입히고"): 아직 덩치 그림이던 아쥬커스 등급 강적 다섯 — 속성 색으로. 혈(손하이드)은 속성 색이 없어 노멀(보라). 스모크 위도우(fire-heavy-seal)만 덩치 그대로 — 이펙트 배치 도구의 '강적 덩치' 기준이라 픽셀FX 담당과 맞춘 뒤 바꾼다 */
export const SPIKY_ENEMIES: Readonly<Record<string, string>> = { 'normal-heavy-chain': 'spiky-base', 'earth-heavy-chain': 'spiky-brown' };
export const SPEED_ENEMIES: Readonly<Record<string, string>> = { 'normal-stance': 'speed-base', 'fire-stance': 'speed-orange' };
export const WRAITH_ENEMIES: Readonly<Record<string, string>> = { 'blood-stance': 'wraith-base' };
/** 아쥬커스 모델 (GDD 240장 2·3): 단계 외형 스킨 id → 배율 + 속성별 종이인형 외형. 노멀 = 보라, 물 = 파랑, 불 = 주황, 흙 = 갈색, 뇌 = 황토.
 *  스킨 id 는 옛 세이브에 저장된 값 그대로(이름·그림만 바뀜): carapace = 가시형(힘), stag = 뱀형(지능), rhino = 외팔형(체력), wyrm = 거미형(정신력), panther = 속도형(속도), scorpion = 짐승형(방어), wraith = 부유형(히든) */
export const AJUCHAS_MODELS: Readonly<Record<string, { scale: number; looks: Readonly<Record<'normal' | 'water' | 'fire' | 'earth' | 'thunder', string>> }>> = {
  carapace: { scale: SPIKY_SCALE, looks: { normal: 'spiky-base', water: 'spiky-blue', fire: 'spiky-orange', earth: 'spiky-brown', thunder: 'spiky-yellow' } },
  stag: { scale: SERPENT_SCALE, looks: { normal: 'serpent-purple', water: 'serpent-blue', fire: 'serpent-orange', earth: 'serpent-brown', thunder: 'serpent-yellow' } },
  rhino: { scale: ONEARM_SCALE, looks: { normal: 'onearm-base', water: 'onearm-blue', fire: 'onearm-orange', earth: 'onearm-brown', thunder: 'onearm-yellow' } },
  wyrm: { scale: SPIDER_SCALE, looks: { normal: 'spider-base', water: 'spider-blue', fire: 'spider-orange', earth: 'spider-brown', thunder: 'spider-yellow' } },
  panther: { scale: SPEED_SCALE, looks: { normal: 'speed-base', water: 'speed-blue', fire: 'speed-orange', earth: 'speed-brown', thunder: 'speed-yellow' } },
  scorpion: { scale: BEAST_SCALE, looks: { normal: 'beast-purple', water: 'beast-blue', fire: 'beast-orange', earth: 'beast-brown', thunder: 'beast-yellow' } },
  wraith: { scale: WRAITH_SCALE, looks: { normal: 'wraith-base', water: 'wraith-blue', fire: 'wraith-orange', earth: 'wraith-brown', thunder: 'wraith-yellow' } },
};
const AJUCHAS_SKINS: Record<string, ArtEntry> = Object.fromEntries(Object.entries(AJUCHAS_MODELS).flatMap(([id, m]) =>
  Object.entries(m.looks).map(([el, look]) => [el === 'normal' ? `skin.${id}` : `skin.${id}${el}`, { rig: look, scale: m.scale }])));
/** 길리안형 강적 (GDD 227장, 사용자 2026-11-10 "외눈 길리안을 … 강적 스티치마우스 그림으로"): 유일한 길리안 등급 강적 스티치마우스(노멀) = 외눈 가면 길리안. 덩치 적 목록을 덮는다 */
export const GILLIAN_ENEMIES: Readonly<Record<string, string>> = { 'normal-heavy-seal': 'gillian-cyclops' };

export const ART_MANIFEST: Readonly<Record<string, ArtEntry>> = {
  'scene.cave': {},
  'scene.room': {},
  // 호로 기본 그림 = 덩치 종이인형 원래 색(보라) (GDD 206장 보충 C.345, 사용자 "호로 기본 이미지를 덩치로해야지"). 단계별 그림·종이인형·스킨 그림이 있으면 그쪽이 먼저.
  // 배율 = HOLLOW_BRUTE_SCALE (덩치 스킨·적 덩치와 같은 값 — 전투에서 적·내 덩치 키·도트 크기가 같게)
  'char.hollow': { rig: 'brute-base', scale: HOLLOW_BRUTE_SCALE },
  // 초월자 그림 (C.430, GDD 12-4): 초월자 데이터 art 키. 128×128 후광 프레임 가운데 64 구슬 — 종족 기본 배율(호로 덩치)을 물려받지 않게 1
  'char.transcendent-zero-sage': { scale: 1 },
  // 사신 기본형은 종이인형으로 움직인다 (GDD 96장 30, 사용자 2026-10-28 "사신은 모션은 게임에도 적용시켜"). 단계별 파일(char-shinigami-<n>)이 있으면 그쪽이 먼저
  // 정지 그림 칸(view)은 옛 한 장 그림 규격(정사각·발 가운데·발 아래 8% 위)이라 위치 보정 없음. 칸이 칼 휘두를 자리까지 넓어(152도트) 키운다 —
  // C.189 의 키(1.32 × 152/113 ≈ 1.78)에서 사용자 2026-10-29 "캐릭터 크기 1/4정도 줄이고" → ×0.75 ≈ 1.33 (C.190, GDD 116장 1·4).
  // 방(홈)은 다시 C.189 키 1.78, 걷기·전투 필드만 1.33 (C.192, GDD 118장 1: "홈에서 사신, 아란칼 크기는 원래가 좋아. 모험이랑 전투할 떄 사이즈는 지금이 딱 좋음")
  'char.shinigami': { rig: 'shinigami-base', scale: 1.78, fieldScale: 1.33, offsetY: 0 },
  // 사신 1단계(혼백) = 혼백 모델(누더기 옷·나뭇가지, 칼집 없음 — GDD 241-F 1, 115-A 작업본. 옛 학생복은 폐기), 2단계(학생) = 진앙영술원 학생복(GDD 116장 2). 3단계부터 종족 공통(사신복)
  'char.shinigami.1': { rig: 'shinigami-soul', scale: 1.78, fieldScale: 1.33, offsetY: 0 },
  'char.shinigami.2': { rig: 'shinigami-student', scale: 1.78, fieldScale: 1.33, offsetY: 0 },
  // 길리안(2단계) = 종이인형 길리안 (GDD 219장 1, 사용자 2026-11-10 "길리안은, 길리안 단계 진화체로 게임에 넣고"). 옛 한 장 그림 배율(2배·필드 1.5배, C.137·C.176)은 폐기.
  // 시작 외형(거구 등)을 입었어도 2단계에 닿으면 단계 외형 gillian(종족 설정 tierLooks "2")이 덮는다 — 그 그림은 skin.gillian
  'char.hollow.2': { rig: 'gillian-base', scale: GILLIAN_SCALE },
  'skin.gillian': { rig: 'gillian-base', scale: GILLIAN_SCALE },
  'skin.gilliancyclops': { rig: 'gillian-cyclops', scale: GILLIAN_SCALE }, // 길리안 외눈형 — 숨은 모습 (GDD 241-C 4)
  // 아쥬커스 단계 외형 (GDD 240장): 능력치 1위로 모델, 진화체 속성으로 색 — AJUCHAS_MODELS. 옛 '새형'(raptor, 속도+지능 쌍 — 표에서 빠짐)은 옛 세이브용으로 속도형 노멀
  ...AJUCHAS_SKINS,
  'skin.raptor': { rig: 'speed-base', scale: SPEED_SCALE },
  // 아란칼(5단계) 진화체 자리 전부 = 아란칼 기본형 종이인형 (GDD 115장 2, C.189). 속성·칸별 스킨 그림(skin-arr*.png)이 오면 그쪽이 먼저(charArt 스킨 순서 그대로).
  // 여성이면 arrancar-base-f (genderLookFromTier 5). 크기·위치는 사신 종이인형과 같은 칸(view)이라 같은 값
  'char.hollow.5': { rig: 'arrancar-base', scale: 1.78, fieldScale: 1.33, offsetY: 0 },
  // 적 덩치 (GDD 115-A 85 · 206장 2): 덩치 몸 적 = <속성>-basic·sturdy·heavy-chain·heavy-seal·stance (8 × 5 = 40) 전부 종이인형 덩치(몸 hb, 동작 묶음 brute 하나 — 모션 통일)를
  // 그 속성 색 외형으로. 장식(쇠사슬·뼈 갑옷) 없음. 날쌘형 swift(마른 몸)는 한 장 그림 그대로. 배율 1.78 = 정지 그림 키(칸의 0.38)를 basic 적 그림 키(0.68)에 맞춤
  ...BRUTE_ENEMIES,
  // 뱀형 강적 (GDD 219장 2): 롯팽·마레하다 = 종이인형 뱀 색 외형 (덩치 적 줄을 덮음)
  ...Object.fromEntries(Object.entries(SERPENT_ENEMIES).map(([id, look]) => [`enemy.${id}`, { rig: look, scale: SERPENT_SCALE }])),
  // 짐승형 강적 (GDD 228장 2): 스톰후프·브라세로·나이트램 = 종이인형 짐승 색 외형 (덩치 적 줄을 덮음)
  ...Object.fromEntries(Object.entries(BEAST_ENEMIES).map(([id, look]) => [`enemy.${id}`, { rig: look, scale: BEAST_SCALE }])),
  // 외팔이·거미형 강적 (GDD 231장): 덩치 적 줄을 덮음
  ...Object.fromEntries(Object.entries(ONEARM_ENEMIES).map(([id, look]) => [`enemy.${id}`, { rig: look, scale: ONEARM_SCALE }])),
  ...Object.fromEntries(Object.entries(SPIDER_ENEMIES).map(([id, look]) => [`enemy.${id}`, { rig: look, scale: SPIDER_SCALE }])),
  // 가시형·속도형·부유형 강적 (GDD 240장 4)
  ...Object.fromEntries(Object.entries(SPIKY_ENEMIES).map(([id, look]) => [`enemy.${id}`, { rig: look, scale: SPIKY_SCALE }])),
  ...Object.fromEntries(Object.entries(SPEED_ENEMIES).map(([id, look]) => [`enemy.${id}`, { rig: look, scale: SPEED_SCALE }])),
  ...Object.fromEntries(Object.entries(WRAITH_ENEMIES).map(([id, look]) => [`enemy.${id}`, { rig: look, scale: WRAITH_SCALE }])),
  // 길리안형 강적 (GDD 227장): 스티치마우스 = 외눈 길리안 (배율 = 내 2단계 길리안과 같게)
  ...Object.fromEntries(Object.entries(GILLIAN_ENEMIES).map(([id, look]) => [`enemy.${id}`, { rig: look, scale: GILLIAN_SCALE }])),
  // 호로 시작 외형 중 덩치 몸 (GDD 206장 3): 거구·망령·속박자 = 덩치 색 외형. 배율 2.1 = 지운 그림 키(칸의 0.8)에 맞춤. 다른 외형은 그림 없음(사용자 시트 대기)
  'skin.brute': { rig: 'brute-brown', scale: HOLLOW_BRUTE_SCALE },
  'skin.ghoul': { rig: 'brute-gray', scale: HOLLOW_BRUTE_SCALE },
  'skin.shackled': { rig: 'brute-red', scale: HOLLOW_BRUTE_SCALE },
  'prop.door': {},
  'prop.altar': {},
  'prop.book': {},
  'prop.chest': {},
  // 붕옥 (GDD 12-2·15-1, C.421 사용자 그림 hogyoku-1112): 방 물건·메뉴 아이콘 = prop-hogyoku.png(32×32, 반각성/공명 한 모양) ·
  // 붕옥 창 왼쪽 큰 그림 = hogyoku-orb.png(64×64) · 개발 100% 뒤 불꽃 = hogyoku-flame.png(96×96 × 16프레임 가로 시트). 모두 픽셀 그대로·정수 배율
  'prop.hogyoku': {},
  'hogyoku.orb': {},
  'hogyoku.flame': {},
  // 붕옥 창 그림 6단계 (C.423, 사용자 stages/): 0~19% 얼음 상자 · 20~39% 금 간 상자 · 40~59% 깨진 상자 (112×116, 상자 속 붕옥 = 칸 24·25) ·
  // 60~79% 붕옥(hogyoku.orb) · 80~99% 붕옥 + 뒤 작은 불꽃(hogyoku.flame-calm 16프레임) · 100% 붕옥 + 뒤 큰 불꽃(hogyoku.flame)
  'hogyoku.stage1': {},
  'hogyoku.stage2': {},
  'hogyoku.stage3': {},
  'hogyoku.flame-calm': {},
  'prop.shop': {},
  // 온천 (GDD 123장 4, C.198): 방 물건·온천 화면 배경 그림 자리 — 사용자 그림 대기(비어 있으면 아이콘·임시 배경)
  'prop.spa': {},
  'scene.spa': {},
  // 장터 (GDD 127장 2, C.201): 방 물건(장터 문)·장터 배경·떠돌이 상인 그림 자리 — 사용자 그림 대기(비어 있으면 아이콘·임시 배경)
  // 월드맵 '시장' 장소 그림 = prop-market.png (사용자 2026-11-03 "시장 … 아이콘으로 넣고", 옛 160장 2 수레 그림 지정 해제).
  // 수레 그림은 떠돌이 상인(prop-wanderer.webp)으로 옮김 — 시장 안 소모품 상점 칸(prop.shop)은 그림 대기(아이콘)
  'prop.market': {},
  'scene.market': {},
  'prop.wanderer': {},
  // 상점 4곳 (GDD 150장 2, C.227): 소모품 상점 = prop.shop, 나머지 3곳 — 사용자 그림 대기(비어 있으면 아이콘)
  'prop.gearShop': { scale: 1.2 }, // 장비 상점 그림 ×1.2 (GDD 160장 3)
  'prop.skinShop': {},
  'prop.traitShop': {},
  'prop.smith': {}, // 대장장이 (GDD 153장 2)
  // 월드맵 (GDD 130장, C.204): 방 물건(월드맵)·월드맵 하이앵글 배경·지도 위 장소(홈·모험; 시장은 prop.market) — 사용자 그림 대기(비어 있으면 아이콘·임시 배경)
  'prop.worldmap': { scale: 1.5 }, // 시장의 월드맵 물건 = 지도 그림 (C.255, 방의 나가기 문은 prop.outside 그대로)
  'prop.outside': { scale: 1.5 }, // 방·시장의 월드맵 물건 그림 ×1.5 (GDD 160장 1)
  'scene.worldmap': {},
  'prop.home': {},
  'prop.adventure': {},
  // 월드맵 탑 (GDD 139장 1, C.217): 키 = place.tower.<종족 id> — 사용자 그림 대기(비어 있으면 아이콘)
  // 탑 그림은 두 종족 같은 그림 prop-tower.png (사용자 2026-11-03 "홈 ui 아이콘은 통일 (대원실, 둥지 빼고)") — 종족별 키는 남김(prop.tower 가 먼저)
  'prop.tower': {},
  'place.tower.hollow': {},
  'place.tower.shinigami': {},
  // 월드맵 온천 (GDD 153장 1, C.228): 키 = place.spa.<종족 id> — 사용자 그림 대기(비어 있으면 아이콘)
  'place.spa.hollow': {},
  'place.spa.shinigami': {},
  // 월드맵 수련장 (GDD 158장 1): 키 = place.training.<종족 id> — 사용자 그림 대기(비어 있으면 방 짚인형 그림 prop.altar, GDD 160장 4)
  'place.training.hollow': {},
  'place.training.shinigami': {},
  // 월드맵 번호 쟁탈전·진급 시험 (GDD 241-C 3, C.394): 키 = place.rank.<종족 id> — 사용자 그림 대기(비어 있으면 prop.rank, 그것도 없으면 아이콘)
  'place.rank.hollow': {},
  'place.rank.shinigami': {},
  // 휴식 칸 장소 그림 (GDD 128장 3, C.202): 걷는 앞쪽에 서는 장소 — 사용자 그림 대기(비어 있으면 임시 웅덩이 그림). 키 = place.<타일 id>.<종족 id>
  'place.rest-a.hollow': {},
  'place.rest-a.shinigami': {},
  'place.rest-spring.hollow': {},
  'place.rest-spring.shinigami': {},
};

/** 실행 중에만 덮어쓰는 그림 (UI 배치 도구 미리보기, GDD 175장 4): 키 → 그림 주소(data URL 등) 또는 null(그림 숨김 = 아이콘). 세이브·배포 데이터와 무관 */
const RUNTIME_ART = new Map<string, string | null>();
export function setRuntimeArt(key: string, src: string | null | undefined): void {
  if (src === undefined) RUNTIME_ART.delete(key);
  else RUNTIME_ART.set(key, src);
}
export function clearRuntimeArt(): void {
  RUNTIME_ART.clear();
}

/** 그림 키 → 실제 이미지 URL(없으면 null = 자리표시를 쓴다). base 는 배포 경로(Vite BASE_URL) */
export function artUrls(key: string, base = '/', manifest: Readonly<Record<string, ArtEntry>> = ART_MANIFEST, files: readonly string[] = ART_FILES): ArtUrls {
  const e = manifest[key];
  const join = (p: string) => (/^(https?:|data:|blob:)/.test(p) ? p : `${base.replace(/\/$/, '')}/${p.replace(/^\//, '')}`);
  const rt = manifest === ART_MANIFEST && RUNTIME_ART.has(key) ? RUNTIME_ART.get(key)! : undefined;
  const auto = !e?.src && !e?.frames ? findArtFile(key, files) : null;
  return {
    src: rt !== undefined ? (rt ? join(rt) : null) : e?.src ? join(e.src) : auto ? join(auto) : null,
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
  // 종이인형 적 (GDD 115-A 85): 목록에 rig 가 있으면 그 외형이 움직인다(정지 그림 = 쉬는 자세 한 장)
  const rig = manifest[key]?.rig;
  if (rig && rigPackOfLook(rig)) return rigArt(rig, manifest[key]!, base);
  const a = artUrls(key, base, manifest, files);
  const anims = resolveAnims([key], base, files, overrides);
  // 한 장짜리 파일이 없고 idle 애니만 있으면 idle-1 을 정지 그림으로도 쓴다 (GDD 26-2)
  const src = a.src ?? anims.idle?.frames[0] ?? null;
  return src ? withAnims({ ...a, src }, anims) : null;
}

/** 종이인형 그림 (GDD 96장 30): 정지 그림 = still/<외형>.png, 부위 그림 폴더, 목록의 배율·위치. 폴더 = 외형이 있는 뼈대(사람형·뱀형, GDD 115-A 100) */
function rigArt(look: string, e: ArtEntry, base: string): ArtUrls {
  const pack = rigPackOfLook(look);
  const id = pack?.id ?? 'humanoid';
  const r = pack?.rig.view?.rect;
  const headTop = r ? Math.max(0, -r[1] / r[3]) : 0; // 그림 칸(view)에서 머리 윗변(캔버스 y 0)까지의 비율
  return { src: joinBase(base, `art/rig/${id}/still/${look}.png`), frames: null, scale: e.scale ?? 1, ...(e.fieldScale !== undefined ? { fieldScale: e.fieldScale } : {}), offsetY: e.offsetY ?? 0, rig: { look, partBase: joinBase(base, `art/rig/${id}/`), rigId: id }, headTop };
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
  // 조각 모델 (C.431, GDD 12-4 v6.029): 'mosaic:<초월자 id>' = 표시 주소 — 화면 관찰자(ui/bha/glitchMosaic)가 합성 그림으로 바꿔 끼운다
  if (skinId && skinId.startsWith(MOSAIC_LOOK_PREFIX)) return { src: mosaicSrc(skinId.slice(MOSAIC_LOOK_PREFIX.length)), frames: null, scale: 1, offsetY: 0 };
  // 그림 키를 직접 받은 외형 (C.430 — 초월자 데이터 art 'char.<이름>'): 그 키의 그림(프레임 애니 포함)이 있으면 그것. 없으면 아래 진화체 그림(자리 표시)
  if (skinId && skinId.startsWith('char.') && !getSkin(skinId)) {
    const own = tryKeys([skinId]);
    if (own) return own;
  }
  if (skinId && getSkin(skinId)) {
    // 종이인형 스킨 (GDD 206장 3): 목록의 skin.<id> 에 rig 가 있으면 그 외형이 움직인다(적 덩치와 같은 길). 여성 외형(-f)이 있으면 그쪽
    const skinRig = manifest[skinArtKey(skinId)]?.rig;
    if (skinRig && rigPackOfLook(skinRig)) return rigArt(female && rigPackOfLook(skinRig + RIG_FEMALE_SUFFIX) ? skinRig + RIG_FEMALE_SUFFIX : skinRig, manifest[skinArtKey(skinId)]!, base);
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
  // 여성 외형 = 외형 id 뒤 -f (GDD 114·115장). 없으면 그 외형(남성) 그대로
  const rigOf = (l: string, key: string) => rigArt(female && rigPackOfLook(l + RIG_FEMALE_SUFFIX) ? l + RIG_FEMALE_SUFFIX : l, manifest[key]!, base);
  if (rigLook) {
    if (!stagedRig) {
      const staged = tryKeys(keys.slice(0, 1));
      if (staged) return staged;
    }
    return rigOf(rigLook, rigKey);
  }
  // 목록·사진(fallbackKey '')은 그림 파일이 먼저(사신 = 한 장 그림 그대로), 파일이 하나도 없으면 종족 공통 종이인형(호로 기본 덩치, C.345)
  const file = tryKeys(keys);
  if (file) return file;
  const common = !fallbackKey ? manifest[keys[1]!]?.rig : undefined;
  if (common && rigPackOfLook(common)) return rigOf(common, keys[1]!);
  return artUrls(fallbackKey, base, manifest, files);
}
