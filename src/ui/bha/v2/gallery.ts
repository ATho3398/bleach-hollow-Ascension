// v2 공통 컴포넌트 갤러리 (C.151, 개발 전용 — `npm run dev` 에서 `?v2gallery=<종족 theme 값>`). 배포 빌드에는 들어가지 않는다 (main.ts 의 import.meta.env.DEV 가드).
// 컴포넌트 시트(docs/bha-ui-handoff/design/sheets/Components.dc.html)와 같은 항목을 한 화면씩 보여 준다.
import { FACTIONS } from '../../../data/factions';
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

export function mountGallery(host: HTMLElement, themeParam: string): void {
  host.style.cssText = 'position:fixed;inset:0';
  // 테마 = 종족 설정의 theme 값 (비우면 첫 종족)
  const theme = FACTIONS.find((f) => f.theme === themeParam)?.theme ?? FACTIONS[0]!.theme;
  const { root } = mountV2Root(host, { theme });
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
    section('탭', v2Tabs([{ id: 'a', label: '음식', count: 5 }, { id: 'b', label: '소모품', count: 2 }, { id: 'c', label: '장비' }], 'b', () => {}), row(v2TitleToggle('보관함 · 타일', () => {}))),
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
