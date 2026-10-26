// 상점·보관함 스킨 '기기' 하위 탭 (GDD 99장 3, C.163): 실제 기기 디자인만 — 기본(그림 없는 기본형) + 가진 정식 기기(사신대행증·십일번대 …).
// 옛 기기 껍데기 색(shell)·견본·시험 기기는 skinListed 로 뺀다. 카드 = 기기 앞면 미리보기, 누르면 바로 장착(✓ 착용 중). 종족 무관 — 이름은 데이터에서.
import { cosmeticName, deviceArt, skinListed, sourceNote } from '../../data/shop';
import type { FactionConfig } from '../../engine/faction';
import type { SaveData } from '../../game';
import { ownedDeviceDesigns, unwearCategory, wearCosmetic } from '../../shop';
import { iconArt, imageArt, itemCard } from './itemUi';
import { showToast } from './nest';

const BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

export interface DeviceEntry {
  /** null = 기본형(기기 벗기) */
  id: string | null;
  name: string;
  note: string;
  /** 앞면 그림 경로 (기본형은 null) */
  front: string | null;
}

/** 기기 탭에 보일 것 (순수에 가까움: 세이브·그림 목록만 읽는다). 맨 앞 = 기본 */
export function deviceEntries(save: Pick<SaveData, 'shared'>, faction: FactionConfig, files?: readonly string[]): DeviceEntry[] {
  return [
    { id: null, name: '기본', note: '기본 제공', front: null },
    ...ownedDeviceDesigns(save, files).filter(skinListed).map((c) => ({ id: c.id, name: cosmeticName(c, faction), note: sourceNote(c), front: deviceArt(c, files)?.front ?? null })),
  ];
}

/** 기기 카드들: 지금 입은 기기는 ✓ 착용 중. 고르면 바로 입고 changed() (저장·화면 다시 그리기는 부르는 쪽) */
export function deviceCards(save: SaveData, faction: FactionConfig, changed: () => void): HTMLElement[] {
  const cur = save.wear.device ?? null;
  return deviceEntries(save, faction).map((e) => {
    const worn = e.id === cur;
    return itemCard({
      id: e.id ?? 'device-basic', name: e.name, detail: e.note,
      art: e.front ? imageArt(`${BASE}${e.front}`) : iconArt('i-frame'),
      badge: worn ? '✓ 착용 중' : undefined,
      state: worn ? 'worn' : undefined,
      onClick: () => {
        if (worn) return;
        if (e.id === null) unwearCategory(save, 'device');
        else if (!wearCosmetic(save, e.id)) return;
        showToast({ eyebrow: '기기', title: `${e.name} 장착` }, 0, 1800);
        changed();
      },
    });
  });
}
