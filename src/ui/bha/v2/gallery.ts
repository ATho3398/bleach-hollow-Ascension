// v2 공통 컴포넌트 갤러리 (C.151, 개발 전용 — `npm run dev` 에서 `?v2gallery=<종족 theme 값>`). 배포 빌드에는 들어가지 않는다 (main.ts 의 import.meta.env.DEV 가드).
// 컴포넌트 시트(docs/bha-ui-handoff/design/sheets/Components.dc.html)와 같은 항목을 한 화면씩 보여 준다.
import { FACTIONS } from '../../../data/factions';
import { V2_GLYPH, V2_PATH, setV2Locked, setV2Pips, v2AttackKind, v2BlockEl, v2ChainEl, v2FamilyPath, v2TrayEl } from './battle';
import { mountV2Root } from './root';
import { v2Badge, v2Button, v2Chip, v2Gauge, v2IconButton, v2Modal, v2Notice, v2Panel, v2Tabs, v2TempChip, v2TitleToggle, v2Toast } from './components';

function row(...nodes: (Node | string)[]): HTMLElement {
  const r = document.createElement('div');
  r.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap';
  r.append(...nodes);
  return r;
}
function section(title: string, ...nodes: (Node | string)[]): HTMLElement {
  const s = document.createElement('div');
  s.style.cssText = 'display:flex;flex-direction:column;gap:6px';
  const h = document.createElement('div');
  h.className = 'bha-sec';
  h.textContent = title;
  s.append(h, ...nodes);
  return s;
}

/** 스킬 블록 시트 (각인 컷): 종류·상태·체인 묶음을 실제 크기 블록 바로 — 핸드오프 BlockStyles 시트와 같은 구성 */
function mountBlockSheet(root: HTMLElement, faction: (typeof FACTIONS)[number]): void {
  const fx = faction.families.map((f) => ({ abbr: f.abbr, path: v2FamilyPath(f.fx), id: f.id }));
  const a = fx[0]!;
  const b = fx[1] ?? a;
  const c = fx[2] ?? a;
  const make = (kind: Parameters<typeof v2BlockEl>[0]['kind'], path: string, glyph: string, label: string, o: { weak?: boolean; pips?: number; locked?: boolean } = {}): HTMLElement => {
    const n = v2BlockEl({ kind, path, glyph, label, uid: 0, weak: !!o.weak });
    setV2Pips(n, o.pips ?? 1);
    if (o.locked) setV2Locked(n, true);
    return n;
  };
  const bar = (label: string, items: ({ block: HTMLElement } | { chain: HTMLElement[]; level: number })[]): HTMLElement => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:grid;grid-template-columns:50px 488px;gap:8px;align-items:end';
    const t = document.createElement('span');
    t.className = 'bha-xs bha-b bha-t2';
    t.textContent = label;
    const tray = v2TrayEl(8);
    tray.root.style.cssText = 'position:relative;left:auto;right:auto;top:auto;margin-top:14px';
    let col = 1;
    const cellFor = (i: number): HTMLElement => tray.cells[i]!;
    for (const it of items) {
      if ('block' in it) cellFor(col++ - 1).append(it.block);
      else {
        const start = col;
        for (const blk of it.chain) cellFor(col++ - 1).append(blk);
        tray.grid.append(v2ChainEl({ start, len: it.chain.length, level: it.level, max: it.level >= 3, over: false }, '체인'));
      }
    }
    wrap.append(t, tray.root);
    return wrap;
  };
  const body = document.createElement('div');
  body.style.cssText = 'position:absolute;inset:8px 12px;display:flex;flex-direction:column;gap:6px;overflow:auto';
  body.dataset.gallery = '';
  body.append(
    bar('종류', [
      { block: make('guard', V2_PATH.guard, V2_GLYPH.guard, '막기') },
      { block: make(v2AttackKind('normal'), a.path, a.abbr, a.abbr) },
      { chain: [make(v2AttackKind('fire'), b.path, b.abbr, b.abbr, { pips: 2 }), make(v2AttackKind('fire'), b.path, b.abbr, b.abbr, { pips: 2 })], level: 2 },
      { block: make(v2AttackKind('thunder'), c.path, c.abbr, c.abbr, { weak: true }) },
      { block: make('heal', V2_PATH.heal, V2_GLYPH.heal, '회복') },
      { block: make('void', V2_PATH.void, V2_GLYPH.void, '공허') },
    ]),
    bar('속성', [
      ...(['normal', 'fire', 'thunder', 'water', 'earth', 'poison', 'blood', 'kyo'] as const).slice(0, 8).map((e) => ({ block: make(v2AttackKind(e), a.path, a.abbr, e) })),
    ]),
    bar('콤보·해방·잠김', [
      { block: make('combo', V2_PATH.combo, V2_GLYPH.combo, '콤보') },
      { chain: [make('fire', a.path, a.abbr, a.abbr, { pips: 3 }), make('fire', a.path, a.abbr, a.abbr, { pips: 3 }), make('fire', a.path, a.abbr, a.abbr, { pips: 3 })], level: 3 },
      { block: make('release', V2_PATH.release, V2_GLYPH.release, '해방') },
      { block: make('normal', a.path, a.abbr, '봉인', { locked: true }) },
    ]),
  );
  root.append(body);
}

export function mountGallery(host: HTMLElement, themeParam: string): void {
  host.style.cssText = 'position:fixed;inset:0';
  // 테마 = 종족 설정의 theme 값 (비우면 첫 종족)
  const theme = FACTIONS.find((f) => f.theme === themeParam)?.theme ?? FACTIONS[0]!.theme;
  const { root } = mountV2Root(host, { theme });
  if (new URLSearchParams(location.search).get('page') === 'blocks') return mountBlockSheet(root, FACTIONS.find((f) => f.theme === theme) ?? FACTIONS[0]!);
  const body = document.createElement('div');
  body.dataset.gallery = '';
  body.style.cssText = 'position:absolute;inset:8px 12px;display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;align-content:start;overflow:auto';
  const left = document.createElement('div');
  left.style.cssText = 'display:flex;flex-direction:column;gap:10px';
  const right = document.createElement('div');
  right.style.cssText = 'display:flex;flex-direction:column;gap:10px';

  left.append(
    section('버튼 4종 + 강조·밝은', row(v2Button({ label: '기본' }), v2Button({ label: '강조', kind: 'accent' }), v2Button({ label: '밝은', kind: 'light' }), v2Button({ label: '위험', kind: 'danger' }), v2Button({ label: '고스트', kind: 'ghost' }))),
    section('작은·비활성·포커스·아이콘', row(v2Button({ label: '작은', small: true }), v2Button({ label: '비활성', disabled: true }), v2Button({ label: '포커스', focus: true }), v2IconButton({ label: '닫기', icon: 'i-close' }), v2IconButton({ label: '도움말', icon: 'i-help', size: 44 }))),
    section('칩·배지', row(v2Chip('기본'), v2TempChip(), v2Chip('노멀', 'attr', { dot: 'var(--bha-attr-normal)' }), v2Chip('강적', 'danger'), v2Chip('봉인', 'seal'), v2Chip('희귀', 'rare'))),
    section('탭', v2Tabs([{ id: 'a', label: '음식', count: 5 }, { id: 'b', label: '소모품', count: 2 }, { id: 'c', label: '장비' }], 'b', () => {}), row(v2TitleToggle('가방 · 타일', () => {}))),
    section('게이지', ...(['hp', 'foe', 'hunger', 'cond', 'mad', 'release'] as const).map((k, i) => row(v2Gauge(k, 25 + i * 14, { label: k, width: '140px' }), `${k}`))),
  );
  const panel = v2Panel('default', 'default');
  panel.style.padding = '8px';
  const sunk = v2Panel('sunk', 'sunk');
  sunk.style.padding = '8px';
  const flat = v2Panel('flat', 'flat');
  flat.style.padding = '8px';
  const card = v2Panel('default', '배지 예');
  card.style.cssText = 'position:relative;padding:14px 8px';
  card.append(v2Badge('보유 3/9'));
  const modalBtn = v2Button({ label: '모달 열기', kind: 'accent', onClick: () => { v2Modal(root, { title: '프리셋 삭제', body: '이 프리셋을 지운다. 되돌릴 수 없다.', closable: true, actions: [{ label: '아니오', kind: 'ghost' }, { label: '삭제', kind: 'danger' }] }); } });
  const toastBtn = v2Button({ label: '토스트', onClick: () => { v2Toast(root, '현재 배치를 프리셋으로 저장했다'); } });
  right.append(
    section('패널 3종', row(panel, sunk, flat, card)),
    section('알림 띠·토스트·모달', row(modalBtn, toastBtn)),
  );
  body.append(left, right);
  root.append(body, v2Notice('업적', '튜토리얼 달성 — 보상 큰 사냥감 2 · 영옥 1'));
}
