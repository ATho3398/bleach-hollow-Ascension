// UI 배치 도구 (GDD 175장, 개발 전용): 배포 사이트 주소 뒤 `?layout` 으로 연다(게임 메뉴엔 없음). 사용자는 안드로이드 크롬 폰으로 쓴다.
// 화면은 게임과 같은 기기 틀(844×390 기준) 안에 **실제 게임 화면 코드**(roomView·worldMapView·marketView)를 보기용 세이브로 그려, 보이는 그대로 편집한다.
// 편집 = 물건 끌어 옮기기·크기·이름·아이콘/그림·배경·숨기기·새 물건(아이콘만). 결과는 이 브라우저(localStorage)에 저장되고,
// [미리보기 켜기]면 같은 브라우저로 게임을 열 때 편집본이 적용된다. [내보내기] = 파일 하나(.json, 올린 그림은 data URL) — 대화에 올리면 코딩 세션이 게임 데이터에 반영한다.
import { artUrls, clearRuntimeArt } from '../../data/art/manifest';
import { FACTIONS, getFaction } from '../../data/factions';
import type { FactionConfig } from '../../engine/faction';
import { newSaveData, type SaveData } from '../../game';
import { PATCH_LABEL } from '../../version';
import { marketView } from '../marketView';
import { roomView, type RoomHandlers } from '../roomView';
import { worldMapView } from '../worldMapView';
import type { Device } from './device';
import { button, el, icon } from './dom';
import {
  addExtra, applyLooks, applySceneEdit, draftHasEdits, editItem, emptyScene, exportFile, layoutScenes, loadDraft, normalizeDraft, removeExtra, resolveScene, saveDraft,
  type LayoutDraft, type LayoutItem, type LayoutSceneDef, type ResolvedScene,
} from './layoutDraft';
import { layoutOnFloor, PROP_ICON } from './room';
import { floorPolyPx } from './roomFloor';
import { applyTheme } from './theme';

const BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
const FRAME_W = 844;
const FRAME_H = 390;
const noop = () => {};

/** 장면 종류 → 실제 게임 화면 그리기 (보기용 세이브·빈 처리기). 새 장면 종류는 여기에 한 줄 */
const RENDER: Record<string, (dev: Device, f: FactionConfig, save: SaveData) => void> = {
  room: (dev, f, save) => roomView(dev, f, save, roomHandlers()),
  worldmap: (dev, f, save) => worldMapView(dev, f, save, { onHome: noop, onMarket: noop, onTraining: noop, onAdventure: noop, onTower: noop, onSpa: noop }),
  market: (dev, f, save) => marketView(dev, f, save, { onShop: noop, onSmith: noop, onWanderer: noop, onBack: noop }),
};

function roomHandlers(): RoomHandlers {
  return {
    onBook: noop, onChest: noop, onStatus: noop, onSwitchTrack: null, onHogyoku: null, onSettings: noop, onHelp: noop, onShop: noop, onPhoto: noop,
    onTamago: noop, onBackup: null, onTest: null, onTitle: noop, persist: noop, resume: null, resumeNote: '', onOutside: noop, onRank: noop,
  };
}

/** 보기용 세이브 (종족마다 하나): 새 세이브 + 떠돌이 상인이 와 있는 상태(시장에 자리가 보이게) */
const sampleSaves = new Map<string, SaveData>();
function sampleSave(factionId: string): SaveData {
  let s = sampleSaves.get(factionId);
  if (!s) {
    s = newSaveData(factionId);
    s.shared.wanderer.visit = { at: Date.now(), runId: 0, tier: 1, stock: [] };
    sampleSaves.set(factionId, s);
  }
  return s;
}

/** 기기 틀 (게임과 같은 bha-dev 마크업, 버튼은 보기만). LCD 안 view 에 게임 화면을 그린다 */
function deviceFrame(): { frame: HTMLElement; dev: Device } {
  const side = (cls: string, ...btns: [string, string][]) => {
    const s = el('div', `bha-dev__side ${cls}`);
    for (const [c, ic] of btns) {
      const b = el('span', `bha-dev__btn ${c}`);
      b.append(icon(ic, undefined, c === 'bha-dev__btn--dir is-up' ? 'bha-dev__flip' : ''));
      s.append(b);
    }
    return s;
  };
  const view = el('div', 'bha-lcd__view');
  const lcd = el('div', 'bha-lcd');
  lcd.append(view);
  const bezel = el('div', 'bha-dev__bezel');
  bezel.append(lcd);
  const devEl = el('div', 'bha-dev');
  devEl.append(side('bha-dev__side--left', ['bha-dev__btn--dir is-up', 'i-chevron-down'], ['bha-dev__btn--dir', 'i-chevron-down']), bezel, side('bha-dev__side--right', ['bha-dev__btn--ok', 'i-check'], ['bha-dev__btn--back', 'i-chevron-left']));
  const frame = el('div', 'bha-ltool__frame');
  frame.append(devEl);
  const dev: Device = {
    view, lcd, frame: devEl,
    setItems: noop, move: noop, confirm: noop, cancel: noop, refresh: noop, setStage: noop, restage: noop, setSkin: noop, destroy: noop,
    setExtraItems: noop, focusMark: () => null, restoreFocus: noop, // C.259 기기 초점 기억·LCD 밖 항목 (도구에서는 안 씀)
  };
  return { frame, dev };
}

/** 스프라이트의 아이콘 목록 (게임 아이콘 고르기) */
function spriteIcons(): string[] {
  return [...new Set([...document.querySelectorAll('symbol[id^="i-"]')].map((s) => s.id))].filter((id) => !id.startsWith('i-fx-'));
}

/** 파일 → data URL */
function readFile(file: File): Promise<string> {
  return new Promise((ok, bad) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => bad(r.error);
    r.readAsDataURL(file);
  });
}

/** 파일 고르기 (accept 예: image/png,image/webp) */
function pickFile(accept: string): Promise<File | null> {
  return new Promise((ok) => {
    const input = el('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => ok(input.files?.[0] ?? null);
    input.click();
  });
}

export function mountLayoutTool(host: HTMLElement): void {
  document.title = 'UI 배치 도구 · 블리치 할로우 어센션';
  const scenes = layoutScenes(FACTIONS);
  let draft: LayoutDraft = loadDraft();
  let undo: string | null = null;
  let sceneId = scenes[0]!.id;
  let picked: string | null = null;
  let showIcons = false;
  let resolved: ResolvedScene | null = null;

  const root = el('div', 'bha-ltool');
  host.replaceChildren(root);

  // ── 머리: 제목 · 장면 고르기 ──
  const head = el('header', 'bha-ltool__head');
  const title = el('h1', 'bha-ltool__title', 'UI 배치 도구');
  const sel = el('select', 'bha-ltool__select');
  sel.setAttribute('aria-label', '장면');
  for (const s of scenes) {
    const o = el('option', '', s.label);
    o.value = s.id;
    sel.append(o);
  }
  sel.onchange = () => {
    sceneId = sel.value;
    picked = null;
    render();
  };
  head.append(title, sel, el('span', 'bha-ltool__note', `개발 전용 · ${PATCH_LABEL}`));

  // ── 기기 틀 + 게임 화면 ──
  const stage = el('div', 'bha-ltool__stage');
  const { frame, dev } = deviceFrame();
  stage.append(frame);
  const fit = () => {
    const k = Math.min(1, stage.clientWidth / FRAME_W);
    frame.style.transform = `translateX(${Math.max(0, (stage.clientWidth - FRAME_W * k) / 2)}px) scale(${k})`;
    stage.style.height = `${FRAME_H * k}px`;
  };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fit).observe(stage);

  const status = el('p', 'bha-ltool__status');
  status.setAttribute('role', 'status');
  const say = (t: string) => (status.textContent = t);

  const tools = el('div', 'bha-ltool__row');
  const panel = el('section', 'bha-ltool__panel');
  const items = el('div', 'bha-ltool__items');
  const foot = el('div', 'bha-ltool__row bha-ltool__foot');
  root.append(head, stage, tools, items, panel, foot, status);

  const def = (): LayoutSceneDef => scenes.find((s) => s.id === sceneId)!;
  const pristine = (): FactionConfig => getFaction(def().factionId);

  /** 바꾸기 한 번 = 되돌리기 1단계 저장 → 바꿈 → 저장 → 다시 그림 */
  const commit = (fn: () => void, msg?: string) => {
    undo = JSON.stringify(draft);
    fn();
    const ok = saveDraft(draft);
    render();
    say(ok ? (msg ?? '저장했다') : '저장 공간이 꽉 찼다 — 올린 그림이 너무 크다(작은 파일로 다시)');
  };

  // ── 게임 화면 그리기 (사본 종족 설정에 편집 적용) ──
  function drawScene(): void {
    const d = def();
    const f = structuredClone(pristine()) as FactionConfig;
    clearRuntimeArt();
    applySceneEdit(d, f, draft.scenes[d.id]);
    applyLooks(draft, iconTable());
    applyTheme(f);
    RENDER[d.kind.kind]!(dev, f, sampleSave(f.id));
    const scene = dev.view.querySelector<HTMLElement>('.bha-room__scene');
    if (!scene || !resolved) return;
    // 바닥(걷는 면) 윤곽 — 물건 발은 이 안으로만 놓인다
    const paintFloor = () => {
      scene.querySelector('.bha-ltool__floor')?.remove();
      const size = { w: scene.clientWidth, h: scene.clientHeight };
      if (!size.w || !size.h) return;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'bha-ltool__floor');
      svg.setAttribute('viewBox', `0 0 ${size.w} ${size.h}`);
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      poly.setAttribute('points', floorPolyPx(resolved!.floor, size).map((p) => p.join(',')).join(' '));
      svg.append(poly);
      scene.prepend(svg);
    };
    requestAnimationFrame(paintFloor);
    for (const b of scene.querySelectorAll<HTMLElement>('.bha-prop')) {
      const key = b.dataset.prop ?? '';
      b.classList.toggle('is-picked', key === picked);
      bindDrag(scene, b, key);
    }
  }

  /** 자리표시 아이콘 표(room.ts PROP_ICON): 그릴 때마다 원래 값으로 되돌린 뒤 편집본을 건다 — 안 그러면 '원래 그림'을 눌러도 고른 아이콘이 남는다 */
  const ICON0: Record<string, string> = { ...PROP_ICON };
  function iconTable(): Record<string, string> {
    Object.assign(PROP_ICON, ICON0);
    return PROP_ICON;
  }

  /** 끌기: 손가락 따라 발 기준점 이동(바닥 안), 놓으면 저장 */
  function bindDrag(scene: HTMLElement, b: HTMLElement, key: string): void {
    const item = resolved?.items.find((i) => i.key === key);
    if (!item) return;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (picked !== key) {
        picked = key;
        for (const o of scene.querySelectorAll('.bha-prop.is-picked')) o.classList.remove('is-picked');
        b.classList.add('is-picked');
        drawPanel();
        drawItems();
      }
      const r = scene.getBoundingClientRect();
      const start = { x: e.clientX, y: e.clientY };
      const from = { x: item.spot.x, y: item.spot.y };
      let foot = { ...from };
      let moved = false;
      b.setPointerCapture(e.pointerId);
      b.classList.add('is-dragging');
      const move = (ev: PointerEvent) => {
        const dx = ((ev.clientX - start.x) / r.width) * 100;
        const dy = ((ev.clientY - start.y) / r.height) * 100;
        if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4) return;
        moved = true;
        foot = { x: Math.min(100, Math.max(0, from.x + dx)), y: Math.min(100, Math.max(0, from.y + dy)) };
        layoutOnFloor(scene, resolved!.floor, [{ el: b, foot, kind: 'prop' }]);
        say(`${item.name} · x ${foot.x.toFixed(1)} · y ${foot.y.toFixed(1)}`);
      };
      const up = () => {
        b.removeEventListener('pointermove', move);
        b.removeEventListener('pointerup', up);
        b.removeEventListener('pointercancel', up);
        b.classList.remove('is-dragging');
        if (!moved) return;
        const placed = placedFoot(scene, b);
        commit(() => editItem(draft, sceneId, key, placed), `${item.name} 옮김 · x ${placed.x.toFixed(1)} · y ${placed.y.toFixed(1)}`);
      };
      b.addEventListener('pointermove', move);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
    });
  }

  /** 놓인 자리(바닥 안으로 끌린 뒤) → 발 기준점 % : layoutOnFloor 가 left = x%, top = y% × 높이 + 이름표 높이 로 놓는다 */
  function placedFoot(scene: HTMLElement, b: HTMLElement): { x: number; y: number } {
    const shape = b.querySelector<HTMLElement>('.bha-prop__shape');
    const lift = shape ? b.offsetHeight - (shape.offsetTop + shape.offsetHeight) : 0;
    const x = parseFloat(b.style.left);
    const y = ((parseFloat(b.style.top) - lift) / scene.clientHeight) * 100;
    return { x: Number.isFinite(x) ? x : 50, y: Number.isFinite(y) ? y : 75 };
  }

  // ── 물건 목록 (숨긴 것도 여기서 고른다) ──
  function drawItems(): void {
    items.replaceChildren(
      ...(resolved?.items ?? []).map((i) => {
        const b = button({ label: i.name, icon: i.icon, size: 'small', on: i.key === picked, onClick: () => { picked = i.key; render(); } });
        if (i.spot.hidden) b.classList.add('is-off');
        if (i.extra) b.dataset.extra = '';
        return b;
      }),
    );
  }

  // ── 고른 물건 편집 칸 ──
  function drawPanel(): void {
    const i = resolved?.items.find((x) => x.key === picked);
    if (!i) {
      panel.replaceChildren(el('p', 'bha-ltool__note', '물건을 손가락으로 누르면 고르고, 끌면 옮긴다. 위 물건 목록에서도 고를 수 있다(숨긴 물건 포함).'));
      return;
    }
    const nameIn = el('input', 'bha-ltool__input');
    nameIn.type = 'text';
    nameIn.value = i.name;
    nameIn.maxLength = 16;
    nameIn.disabled = !i.nameEditable;
    nameIn.setAttribute('aria-label', '이름');
    nameIn.onchange = () => {
      const v = nameIn.value.trim();
      if (v) commit(() => editItem(draft, sceneId, i.key, { name: v }), `이름 → ${v}`);
    };
    // 크기: 끄는 동안 그 물건만 바로 바꾸고, 놓으면 저장
    const scaleOut = el('output', 'bha-ltool__value', `×${i.spot.scale.toFixed(2)}`);
    const range = el('input', 'bha-ltool__range');
    range.type = 'range';
    range.min = '0.3';
    range.max = '2.5';
    range.step = '0.01';
    range.value = String(i.spot.scale);
    range.setAttribute('aria-label', '크기');
    range.oninput = () => {
      const v = Number(range.value);
      scaleOut.textContent = `×${v.toFixed(2)}`;
      const b = dev.view.querySelector<HTMLElement>(`.bha-prop[data-prop="${i.key}"]`);
      const scene = dev.view.querySelector<HTMLElement>('.bha-room__scene');
      if (b && scene && resolved) {
        b.style.setProperty('--prop-s', String(v * artUrls(i.artKey, BASE).scale));
        layoutOnFloor(scene, resolved.floor, [{ el: b, foot: i.spot, kind: 'prop' }]);
      }
    };
    range.onchange = () => commit(() => editItem(draft, sceneId, i.key, { scale: Number(range.value) }), `크기 ×${Number(range.value).toFixed(2)}`);

    const rows: HTMLElement[] = [];
    const row = (...n: (Node | string)[]) => {
      const r = el('div', 'bha-ltool__row');
      r.append(...n);
      rows.push(r);
      return r;
    };
    row(el('strong', 'bha-ltool__label', i.extra ? '새 물건' : '물건'), nameIn);
    row(el('span', 'bha-ltool__note', i.nameNote));
    row(el('span', 'bha-ltool__label', '크기'), range, scaleOut);
    row(el('span', 'bha-ltool__note', `자리 x ${i.spot.x.toFixed(1)} · y ${i.spot.y.toFixed(1)} (장면 %, 발 기준점)`));
    const ed = draft.scenes[sceneId];
    const ex = ed?.extras.find((x) => x.id === i.key);
    const look = draft.looks[i.artKey];
    row(
      button({ label: '아이콘 고르기', icon: i.icon, size: 'small', on: showIcons, onClick: () => { showIcons = !showIcons; drawPanel(); } }),
      button({ label: '그림 올리기', icon: 'i-plus', size: 'small', onClick: () => void uploadArt(i) }),
      ...(look || ex?.art ? [button({ label: '원래 그림', icon: 'i-return', size: 'small', onClick: () => resetLook(i) })] : []),
    );
    row(
      button({ label: i.spot.hidden ? '보이기' : '숨기기', icon: i.spot.hidden ? 'i-check' : 'i-broken', size: 'small', onClick: () => commit(() => editItem(draft, sceneId, i.key, { hidden: !i.spot.hidden }), i.spot.hidden ? `${i.name} 보임` : `${i.name} 숨김`) }),
      ...(ex ? [button({ label: '지우기', icon: 'i-broken', size: 'small', variant: 'danger', onClick: () => commit(() => { removeExtra(draft, sceneId, i.key); picked = null; }, `${i.name} 지움`) })] : []),
    );
    if (!i.extra) row(el('span', 'bha-ltool__note', `그림·아이콘은 두 종족 공통 (${i.artKey})`));
    if (showIcons) {
      const grid = el('div', 'bha-ltool__icons');
      for (const id of spriteIcons()) {
        const b = button({ label: id, icon: id, iconOnly: true, size: 'small', on: id === i.icon, onClick: () => pickIcon(i, id) });
        b.title = id;
        grid.append(b);
      }
      rows.push(grid);
    }
    panel.replaceChildren(...rows);
  }

  function pickIcon(i: LayoutItem, id: string): void {
    showIcons = false;
    commit(() => {
      const ex = draft.scenes[sceneId]?.extras.find((x) => x.id === i.key);
      if (ex) {
        ex.icon = id;
        delete ex.art;
      } else if (i.extra) return; // 데이터에 반영된 새 물건의 아이콘은 반영 패치에서 바꾼다
      else draft.looks[i.artKey] = { ...draft.looks[i.artKey], icon: id, art: null }; // 아이콘을 고르면 그림은 끈다(아이콘이 보이게)
    }, `아이콘 → ${id}`);
  }

  async function uploadArt(i: LayoutItem): Promise<void> {
    const file = await pickFile('image/png,image/webp,image/gif,image/jpeg');
    if (!file) return;
    const url = await readFile(file);
    commit(() => {
      const ex = draft.scenes[sceneId]?.extras.find((x) => x.id === i.key);
      if (ex) ex.art = url;
      else draft.looks[i.artKey] = { ...draft.looks[i.artKey], art: url };
    }, `그림 → ${file.name} (${Math.round(file.size / 1024)}KB)`);
  }

  function resetLook(i: LayoutItem): void {
    commit(() => {
      const ex = draft.scenes[sceneId]?.extras.find((x) => x.id === i.key);
      if (ex) delete ex.art;
      else delete draft.looks[i.artKey];
    }, '원래 그림으로');
  }

  // ── 위 도구 줄: 되돌리기 · 장면 처음으로 · 새 물건 · 배경 ──
  function drawTools(): void {
    const ed = draft.scenes[sceneId];
    tools.replaceChildren(
      button({ label: '되돌리기', icon: 'i-return', size: 'small', disabled: undo === null, onClick: () => {
        if (undo === null) return;
        draft = normalizeDraft(JSON.parse(undo));
        undo = null;
        saveDraft(draft);
        render();
        say('한 단계 되돌렸다');
      } }),
      button({ label: '새 물건', icon: 'i-special', size: 'small', onClick: () => {
        const name = prompt('새 물건 이름 (기능은 나중에 — 게임에서 누르면 준비 중)', '')?.trim();
        if (name === undefined) return;
        commit(() => {
          const x = addExtra(draft, sceneId, name ?? '', 'i-special', resolved?.items.map((i) => i.key) ?? []);
          picked = x.id;
        }, '새 물건을 장면 왼쪽 앞에 놓았다 — 끌어서 옮긴다');
      } }),
      button({ label: '배경 바꾸기', icon: 'i-plus', size: 'small', onClick: async () => {
        const file = await pickFile('image/png,image/webp,image/jpeg');
        if (!file) return;
        const url = await readFile(file);
        commit(() => ((draft.scenes[sceneId] ??= emptyScene()).bg = url), `배경 → ${file.name} (${Math.round(file.size / 1024)}KB)`);
      } }),
      ...(ed?.bg ? [button({ label: '원래 배경', icon: 'i-return', size: 'small', onClick: () => commit(() => delete draft.scenes[sceneId]!.bg, '원래 배경으로') })] : []),
      button({ label: '이 장면 처음으로', icon: 'i-broken', size: 'small', variant: 'danger', disabled: !ed, onClick: () => {
        if (!confirm('이 장면의 편집을 모두 지우고 게임 데이터 값으로 돌린다. (공통 그림·아이콘은 그대로)')) return;
        commit(() => { delete draft.scenes[sceneId]; picked = null; }, '이 장면을 처음 값으로 돌렸다');
      } }),
    );
  }

  // ── 아래 줄: 미리보기 · 게임 열기 · 내보내기 · 불러오기 · 전부 초기화 ──
  function drawFoot(): void {
    foot.replaceChildren(
      button({ label: draft.preview ? '미리보기 끄기' : '미리보기 켜기', icon: 'i-check', size: 'small', on: draft.preview, onClick: () => commit(() => (draft.preview = !draft.preview), draft.preview ? '미리보기 끔' : '미리보기 켬 — 이 브라우저로 게임을 열면 편집본이 보인다') }),
      button({ label: '게임 열기', icon: 'i-loop', size: 'small', onClick: () => (location.href = location.pathname) }),
      button({ label: '내보내기', icon: 'i-deck', size: 'small', variant: 'primary', disabled: !draftHasEdits(draft), onClick: exportNow }),
      button({ label: '불러오기', icon: 'i-plus', size: 'small', onClick: async () => {
        const file = await pickFile('application/json,.json');
        if (!file) return;
        try {
          const d = normalizeDraft(JSON.parse(await file.text()));
          commit(() => (draft = d), `불러옴: ${file.name}`);
        } catch {
          say('이 파일은 배치 도구 파일이 아니다');
        }
      } }),
      button({ label: '전부 초기화', icon: 'i-broken', size: 'small', variant: 'danger', onClick: () => {
        if (!confirm('모든 장면의 편집·올린 그림을 지운다. (먼저 내보내기를 권함)')) return;
        commit(() => { draft = { ...draft, scenes: {}, looks: {} }; picked = null; }, '전부 처음 값으로');
      } }),
    );
  }

  function exportNow(): void {
    const text = exportFile(draft, FACTIONS, PATCH_LABEL);
    const blob = new Blob([text], { type: 'application/json' });
    const a = el('a');
    const t = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    a.download = `bha-layout-${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}-${pad(t.getHours())}${pad(t.getMinutes())}.json`;
    a.href = URL.createObjectURL(blob);
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    say(`내보냄: ${a.download} (${Math.round(text.length / 1024)}KB) — 이 파일을 대화에 올리면 게임 데이터에 반영한다`);
  }

  function render(): void {
    sel.value = sceneId;
    const d = def();
    resolved = resolveScene(d, pristine(), draft);
    if (picked && !resolved.items.some((i) => i.key === picked)) picked = null;
    drawScene();
    drawTools();
    drawItems();
    drawPanel();
    drawFoot();
  }

  // 게임 화면 안 누름은 도구에선 아무 일도 하지 않는다 (상점·월드맵 이동 등 막음 — 고르기·끌기만)
  dev.view.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); }, true);
  render();
  fit();
  say(draftHasEdits(draft) ? `저장된 편집본을 열었다${draft.preview ? ' · 미리보기 켜짐' : ''}` : '물건을 끌어 옮겨 보자. 바뀐 것은 이 브라우저에 바로 저장된다');
}

