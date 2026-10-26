// 타일 배치 프리셋 패널 (GDD 85장 11번, C.141): 모험 출발 화면과 보관함 배치 편집기가 같이 쓴다.
// 카드마다 이름·놓은 칸 미리보기(칸 색)·[불러오기][덮어쓰기][이름][삭제]. 위 줄에 이름 칸 + [현재 배치 저장].
// 판정·저장은 src/tilePresets.ts (이 화면은 결과만 그린다). 종족 무관.
import { BALANCE } from '../../config/balance';
import { getTile } from '../../data/tiles';
import type { PresetResult, TilePreset } from '../../tilePresets';
import { confirmDialog } from '../confirmDialog';
import { button, el } from './dom';
import { tileCss } from './expedition';

const PX = BALANCE.provisional.tilePresets;

export interface PresetHandlers {
  list: () => { index: number; preset: TilePreset }[];
  /** index 를 주면 그 프리셋을 덮어쓴다 */
  save: (name: string, index?: number) => PresetResult;
  rename: (index: number, name: string) => boolean;
  remove: (index: number) => boolean;
  /** 불러오기: 결과 안내 한 줄 (칸 수·건너뛴 타일) */
  load: (preset: TilePreset) => string;
}

/** 프리셋 미리보기 한 줄: 칸(1부터)마다 놓은 타일 색 / 빈 칸 (순수) */
export function presetPreview(cells: readonly (string | null)[]): { id: string | null; css: string | null }[] {
  return cells.slice(1).map((id) => (id ? { id, css: tileCss(getTile(id).kind) } : { id: null, css: null }));
}

export function presetPanel(h: PresetHandlers, tileName: (id: string) => string, limitText: string): HTMLElement {
  const root = el('section', 'bha-presets');
  root.dataset.presets = '';
  const head = el('div', 'bha-presets__head');
  const note = el('span', 'bha-presets__note');
  note.setAttribute('aria-live', 'polite');
  let renaming: number | null = null;

  const draw = () => {
    const list = h.list();
    const title = el('b', 'bha-presets__title', `배치 프리셋 ${list.length}/${PX.max}`);
    const name = el('input', 'bha-presets__input');
    name.type = 'text';
    name.maxLength = PX.nameMax;
    name.placeholder = '프리셋 이름';
    name.setAttribute('aria-label', '프리셋 이름');
    name.dataset.presetName = '';
    const save = button({ label: '현재 배치 저장', icon: 'i-plus', size: 'small', onClick: () => {
      const r = h.save(name.value);
      note.textContent = r.ok ? '현재 배치를 프리셋으로 저장했다' : r.reason;
      draw();
    } });
    save.dataset.presetSave = '';
    head.replaceChildren(title, name, save, note);
    const grid = el('div', 'bha-presets__grid');
    grid.dataset.presetCount = String(list.length);
    if (list.length === 0) grid.append(el('p', 'bha-faint', `자주 쓰는 배치(${limitText})를 이름 붙여 저장한다.`));
    list.forEach(({ index, preset }, n) => {
      const card = el('div', 'bha-presetcard');
      card.dataset.preset = String(n);
      const top = el('div', 'bha-presetcard__top');
      if (renaming === index) {
        const input = el('input', 'bha-presets__input');
        input.type = 'text';
        input.maxLength = PX.nameMax;
        input.value = preset.name;
        input.setAttribute('aria-label', '새 이름');
        input.dataset.presetRenameInput = '';
        const ok = button({ label: '확인', size: 'small', variant: 'primary', onClick: () => {
          if (h.rename(index, input.value)) note.textContent = '이름을 바꿨다';
          else note.textContent = '이름이 비어 있다';
          renaming = null;
          draw();
        } });
        ok.dataset.presetRenameOk = String(n);
        top.append(input, ok);
        queueMicrotask(() => input.focus());
      } else top.append(el('b', 'bha-presetcard__name', preset.name));
      const strip = el('div', 'bha-presetcard__strip');
      strip.setAttribute('role', 'img');
      const ids = preset.cells.filter((x): x is string => x !== null);
      strip.setAttribute('aria-label', `${ids.length}칸: ${ids.map(tileName).join(', ')}`);
      for (const c of presetPreview(preset.cells)) {
        const dot = el('i', `bha-presetcard__cell${c.css ? ` bha-presetcard__cell--${c.css}` : ''}`);
        if (c.id) dot.title = tileName(c.id);
        strip.append(dot);
      }
      const acts = el('div', 'bha-presetcard__acts');
      const load = button({ label: '불러오기', size: 'small', variant: 'primary', onClick: () => {
        note.textContent = h.load(preset);
      } });
      load.dataset.presetLoad = String(n);
      const over = button({ label: '덮어쓰기', size: 'small', variant: 'ghost', onClick: () => {
        const r = h.save(preset.name, index);
        note.textContent = r.ok ? `${preset.name}에 현재 배치를 덮어썼다` : r.reason;
        draw();
      } });
      over.dataset.presetOverwrite = String(n);
      const ren = button({ label: '이름', size: 'small', variant: 'ghost', onClick: () => { renaming = index; draw(); } });
      ren.dataset.presetRename = String(n);
      const del = button({ label: '삭제', size: 'small', variant: 'ghost', icon: 'i-close', onClick: () => {
        confirmDialog({ title: `${preset.name} 삭제`, body: '이 프리셋을 지운다. 되돌릴 수 없다.', yes: '삭제', no: '아니오', danger: true, onYes: () => {
          if (h.remove(index)) note.textContent = '프리셋을 지웠다';
          renaming = null;
          draw();
        } });
      } });
      del.dataset.presetDelete = String(n);
      acts.append(load, over, ren, del);
      card.append(top, strip, el('small', 'bha-presetcard__meta', `${ids.length}칸`), acts);
      grid.append(card);
    });
    root.replaceChildren(head, grid);
  };
  draw();
  return root;
}
