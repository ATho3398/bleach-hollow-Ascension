// 타일 배치 프리셋 패널 (GDD 85장 11번, C.141): 모험 출발 화면과 보관함 배치 편집기가 같이 쓴다.
// C.176 개편(GDD 104장 8): 프리셋 칸 가로 칩 + 고른 것 미리보기 한 줄 + 버튼 4개 한 줄(불러오기·저장·이름·삭제).
// 판정·저장은 src/tilePresets.ts (이 화면은 결과만 그린다). 종족 무관.
import { BALANCE } from '../../config/balance';
import { getTile } from '../../data/tiles';
import type { PresetResult, TilePreset } from '../../tilePresets';
import { confirmDialog } from '../confirmDialog';
import { button, el, icon } from './dom';
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

/** 프리셋 구성 한 줄: "고기 ×3 · 상급 호로 ×2" (순수, 놓은 순서대로) */
export function presetSummary(cells: readonly (string | null)[], tileName: (id: string) => string): string {
  const n = new Map<string, number>();
  for (const id of cells.slice(1)) if (id) n.set(id, (n.get(id) ?? 0) + 1);
  return [...n].map(([id, c]) => `${tileName(id)} ×${c}`).join(' · ');
}

/** 프리셋 패널 (C.176, GDD 104장 8 개편): 위 = 제목·안내 한 줄 / 프리셋 칸 가로 칩(고른 것 = 테두리, 빈 칸 = '+') / 고른 프리셋 미리보기 한 줄 /
 *  버튼 4개 한 줄(불러오기·저장·이름·삭제). 빈 '+' 칩을 고르고 [저장] = 지금 배치를 새 프리셋으로, 있는 프리셋을 고르고 [저장] = 덮어쓰기. 삭제는 확인 창(기본 아니오) */
export function presetPanel(h: PresetHandlers, tileName: (id: string) => string, limitText: string): HTMLElement {
  const root = el('section', 'bha-presets');
  root.dataset.presets = '';
  const note = el('span', 'bha-presets__note');
  note.setAttribute('aria-live', 'polite');
  /** 고른 칩: 프리셋 순번(0부터) 또는 빈 칸(-1) */
  let sel: number | null = null;
  let renaming = false;

  const draw = () => {
    const list = h.list();
    if (sel === null) sel = list.length > 0 ? 0 : -1;
    if (sel >= list.length) sel = list.length > 0 ? list.length - 1 : -1;
    const cur = sel >= 0 ? list[sel] : undefined;
    if (!cur) renaming = false;
    const head = el('div', 'bha-presets__head');
    head.append(el('b', 'bha-presets__title', `배치 프리셋 ${list.length}/${PX.max}`), note);

    // 프리셋 칸: 가진 것 + 빈 칸 하나('+', 다 차면 없음)
    const chips = el('div', 'bha-presets__chips');
    chips.setAttribute('role', 'radiogroup');
    chips.setAttribute('aria-label', '프리셋 고르기');
    const chipBtn = (label: string, at: number, empty: boolean) => {
      const b = el('button', `bha-presets__chip${empty ? ' is-empty' : ''}${sel === at ? ' is-on' : ''}`);
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(sel === at));
      b.dataset.presetChip = String(at);
      if (empty) b.append(icon('i-plus'), el('span', '', '새 칸'));
      else b.append(el('span', 'bha-presets__chipname', label));
      b.onclick = () => {
        if (sel === at) return;
        sel = at;
        renaming = false;
        note.textContent = '';
        draw();
        root.querySelector<HTMLElement>(`[data-preset-chip="${at}"]`)?.focus({ preventScroll: true });
      };
      return b;
    };
    list.forEach(({ preset }, n) => chips.append(chipBtn(preset.name, n, false)));
    if (list.length < PX.max) chips.append(chipBtn('', -1, true));

    // 미리보기 한 줄 (이름 바꾸는 중이면 이름 칸)
    const view = el('div', 'bha-presets__view');
    if (cur && renaming) {
      const input = el('input', 'bha-presets__input');
      input.type = 'text';
      input.maxLength = PX.nameMax;
      input.value = cur.preset.name;
      input.setAttribute('aria-label', '새 이름');
      input.dataset.presetRenameInput = '';
      const done = (ok: boolean) => {
        if (ok) note.textContent = h.rename(cur.index, input.value) ? '이름을 바꿨다' : '이름이 비어 있다';
        renaming = false;
        draw();
      };
      // Enter = 확인, Esc = 취소 (기기 뒤로까지 번지지 않게)
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          done(e.key === 'Enter');
        }
      });
      const ok = button({ label: '확인', icon: 'i-check', size: 'small', variant: 'primary', onClick: () => done(true) });
      ok.dataset.presetRenameOk = String(sel);
      view.append(input, ok);
      queueMicrotask(() => input.focus());
    } else if (cur) {
      const strip = el('div', 'bha-presetcard__strip');
      strip.setAttribute('role', 'img');
      const ids = cur.preset.cells.filter((x): x is string => x !== null);
      strip.setAttribute('aria-label', `${ids.length}칸: ${ids.map(tileName).join(', ')}`);
      for (const c of presetPreview(cur.preset.cells)) {
        const dot = el('i', `bha-presetcard__cell${c.css ? ` bha-presetcard__cell--${c.css}` : ''}`);
        if (c.id) dot.title = tileName(c.id);
        strip.append(dot);
      }
      view.append(strip, el('small', 'bha-presets__sum', `${ids.length}칸 · ${presetSummary(cur.preset.cells, tileName)}`));
    } else view.append(el('small', 'bha-faint', list.length >= PX.max ? `프리셋은 ${PX.max}개까지` : `빈 칸 — [저장]을 누르면 지금 배치(${limitText})를 새 프리셋으로 저장한다`));

    // 버튼 4개 한 줄: 아이콘 + 짧은 글
    const acts = el('div', 'bha-presets__acts');
    const load = button({ label: '불러오기', icon: 'i-return', size: 'small', variant: 'primary', disabled: !cur, onClick: () => {
      if (cur) note.textContent = h.load(cur.preset);
    } });
    load.dataset.presetLoad = String(sel);
    const save = button({ label: '저장', icon: 'i-plus', size: 'small', disabled: !cur && list.length >= PX.max, onClick: () => {
      const r = cur ? h.save(cur.preset.name, cur.index) : h.save('');
      note.textContent = r.ok ? (cur ? `${cur.preset.name}에 지금 배치를 덮어썼다` : '지금 배치를 새 프리셋으로 저장했다') : r.reason;
      if (r.ok && !cur) sel = h.list().length - 1;
      draw();
    } });
    save.dataset.presetSave = '';
    if (cur) save.dataset.presetOverwrite = String(sel);
    const ren = button({ label: '이름', icon: 'i-title', size: 'small', variant: 'ghost', disabled: !cur, onClick: () => {
      renaming = !renaming;
      draw();
    } });
    ren.dataset.presetRename = String(sel);
    const del = button({ label: '삭제', icon: 'i-close', size: 'small', variant: 'ghost', disabled: !cur, onClick: () => {
      if (!cur) return;
      confirmDialog({ title: `${cur.preset.name} 삭제`, body: '이 프리셋을 지운다. 되돌릴 수 없다.', yes: '삭제', no: '아니오', danger: true, onYes: () => {
        if (h.remove(cur.index)) note.textContent = '프리셋을 지웠다';
        renaming = false;
        draw();
      } });
    } });
    del.dataset.presetDelete = String(sel);
    acts.append(load, save, ren, del);
    root.replaceChildren(head, chips, view, acts);
  };
  draw();
  return root;
}
