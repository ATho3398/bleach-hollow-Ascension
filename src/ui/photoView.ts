// 사진 화면 (GDD 25-11, C.61): 독 [더보기] → [사진]. 지금 방 장면을 캔버스에 그려 미리 보여 주고, 액자(기본 + 산 것)를 고르고, PNG 로 저장한다.
// 그리기·파일 이름은 bha/photo.ts. 종족 분기 없음 (이름·단계는 진화 데이터·종족 설정). 세이브에는 아무것도 남기지 않는다.
import { artUrls } from '../data/art/manifest';
import { formName, tryGetForm } from '../data/evolution';
import { getCosmetic } from '../data/shop';
import { roomOf, type FactionConfig } from '../engine/faction';
import { playerElementsOf } from '../engine/evolution';
import type { SaveData } from '../game';
import { button, el, seg } from './bha/dom';
import type { Device } from './bha/device';
import { lcdHead, lcdPage, selectLast } from './bha/lcdpage';
import { showToast } from './bha/nest';
import { drawPhoto, frameChoices, photoFileName, savePhoto, PHOTO_SIZE, type PhotoScene } from './bha/photo';
import { roomCharArt } from './bha/room';

const BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

/** 지금 방 장면을 사진 재료로 (입은 꾸밈의 모양 키만 뽑는다) */
export function photoSceneOf(faction: FactionConfig, save: SaveData, frameId: string | null, date: Date): PhotoScene {
  const room = roomOf(faction);
  const art = roomCharArt(room, faction.id, save.evolution.tierIndex, save.skin);
  const form = save.evolution.formId ? tryGetForm(save.evolution.formId) : undefined;
  const look = (id: string | undefined): string | undefined => getCosmetic(id)?.look;
  const frame = frameChoices(save.shared.cosmetics).find((f) => f.id === frameId) ?? frameChoices([])[0]!;
  return {
    charSrc: art.src,
    charScale: art.scale,
    charOffsetY: art.offsetY,
    sceneSrc: artUrls(room.sceneArt, BASE).src,
    look: { aura: look(save.wear.aura), tint: look(save.wear.tint), room: look(save.wear.room), plate: look(save.wear.plate) },
    name: form ? formName(form, faction.id, playerElementsOf(save.evolution)) : faction.tierNames[save.evolution.tierIndex]!,
    stage: `${save.evolution.tierIndex + 1}단계`,
    date,
    frame,
  };
}

export function photoView(dev: Device, faction: FactionConfig, save: SaveData): void {
  const root = dev.view;
  const choices = frameChoices(save.shared.cosmetics);
  // 처음 고른 액자 = 입고 있는 액자(없으면 기본)
  let frameId: string | null = choices.some((c) => c.id === save.wear.frame) ? save.wear.frame ?? null : null;
  const date = new Date();
  const canvas = el('canvas', 'bha-photo__canvas') as HTMLCanvasElement;
  canvas.width = PHOTO_SIZE.w;
  canvas.height = PHOTO_SIZE.h;
  canvas.setAttribute('aria-label', '사진 미리보기');
  let drawing: Promise<void> = Promise.resolve();
  const paint = () => {
    drawing = drawPhoto(canvas, photoSceneOf(faction, save, frameId, date));
    canvas.dataset.frame = frameId ?? 'default';
    return drawing;
  };

  const frames = seg(choices.map((c) => ({ id: c.id ?? 'default', label: c.name })), frameId ?? 'default', (id) => {
    frameId = id === 'default' ? null : id;
    void paint();
  }, { small: true });
  const saveBtn = button({ label: '사진 저장', icon: 'i-check', variant: 'primary', size: 'lg', block: true, onClick: async () => {
    await drawing;
    const name = photoFileName(faction.id, date);
    const ok = await savePhoto(canvas, name);
    showToast({ eyebrow: '사진', title: ok ? '저장했다' : '저장하지 못했다', meta: ok ? name : '이 기기에서 파일 저장을 막았다' }, 0, 2600);
  } });
  saveBtn.dataset.sc = 'photo-save';
  const hint = el('p', 'bha-faint', choices.length > 1 ? '액자를 고르고 [사진 저장]. 기본 액자는 무료, 다른 액자는 상점 영옥 탭에서 산다.' : `기본 액자는 무료. 다른 액자는 방의 ${roomOf(faction).props.shop}(상점) 영옥 탭에서 산다.`);
  const page = lcdPage(root, { cls: 'bha-photo', cols: 'minmax(0, 1.5fr) minmax(0, 1fr)' }, lcdHead({ title: '사진', sub: '지금 방 모습을 PNG 로 저장한다.' }), [canvas], [el('b', 'bha-label', '액자'), selectLast(frames), hint, saveBtn]);
  page.app.dataset.frame = frameId ?? 'default';
  void paint();
}
