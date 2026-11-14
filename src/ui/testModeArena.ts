// 테스트 모드 적 설정 창 (GDD 17-4 v6.083, C.457 사용자 2026-11-15 '테스트 전투 방식 개편'): 바로 전투에 들어가면 적 없이 이 창이 뜬다.
// 적(몹 목록)·★·연속·탑 층·체력/공격력 배율·공격 여부·무적을 정하고 [확인] = 적 등장. 적을 쓰러뜨리면 다시 이 창(전투는 이어짐).
// [창 닫기] = 빈 적 자리에 [적 설정] 버튼만 남김, [나가기] = 테스트 패널로. 목록은 데이터(testFoes)에서 — 종족 분기 없음.
import { bossName } from '../data/bosses';
import { pickFaction } from '../data/schema';
import { BALANCE } from '../config/balance';
import { MAX_DIFFICULTY } from '../engine/difficulty';
import type { FactionConfig } from '../engine/faction';
import { testFoes, TOWER_FLOORS, TEST_ARENA_PCT_MAX, TEST_ARENA_PCT_MIN, type TestArenaChoice } from '../engine/testMode';
import { pickList } from './bha/pickList';
import { button, el, seg } from './bha/dom';
import { confirmDialog } from './confirmDialog';

export interface TestArenaDialogHandlers {
  /** [확인]: 고른 값으로 적을 내보낸다 */
  onPick: (c: TestArenaChoice) => void;
  /** [창 닫기]: 적 없이 창만 닫는다 (빈 자리 [적 설정]으로 다시 연다) */
  onClose: () => void;
  /** [나가기]: 전투를 그만두고 테스트 패널로 */
  onExit: () => void;
}

function numInput(value: number, min: number, max: number, aria: string): HTMLInputElement {
  const i = el('input', 'bha-test__input');
  i.type = 'number';
  i.inputMode = 'numeric';
  i.min = String(min);
  i.max = String(max);
  i.step = '1';
  i.value = String(value);
  i.setAttribute('aria-label', aria);
  return i;
}

/** 적 설정 창을 연다. prev = 지난 값(처음이면 기본값), note = 창 위 한 줄(직전 결과 등) */
export function testArenaDialog(faction: FactionConfig, prev: TestArenaChoice, note: string, h: TestArenaDialogHandlers): () => void {
  const fid = faction.id;
  const foes = testFoes();
  const foeSel = pickList(foes.map((f) => ({
    value: f.id,
    label: f.kind === 'boss' ? bossName(f.id, fid) : pickFaction(f.def.name, fid),
    group: f.kind === 'boss' ? '보스' : f.def.class === 'elite' ? '강적' : '일반',
  })), prev.foeId, '적 종류', 'bha-test__select');
  const starSel = pickList(Array.from({ length: MAX_DIFFICULTY }, (_, i) => ({ value: String(i + 1), label: `★${i + 1}` })), String(prev.star), '난이도', 'bha-test__select');
  const floorSel = pickList([{ value: '', label: '탑 아님' }, ...Array.from({ length: TOWER_FLOORS }, (_, i) => ({ value: String(i + 1), label: `${i + 1}층` }))], prev.floor ? String(prev.floor) : '', '탑 층', 'bha-test__select');
  const streak = numInput(prev.streak, 0, BALANCE.provisional.difficulty.streak.maxClears, '연속 클리어');
  const hp = numInput(prev.hpPct, TEST_ARENA_PCT_MIN, TEST_ARENA_PCT_MAX, '체력 배율 %');
  const atk = numInput(prev.attackPct, TEST_ARENA_PCT_MIN, TEST_ARENA_PCT_MAX, '공격력 배율 %');
  let attacks = prev.attacks;
  let immortal = prev.immortal;
  const atkSeg = seg([{ id: 'on', label: '공격함' }, { id: 'off', label: '안 함' }], attacks ? 'on' : 'off', (id) => { attacks = id === 'on'; }, { small: true });
  const immSeg = seg([{ id: 'off', label: '죽음' }, { id: 'on', label: '무적' }], immortal ? 'on' : 'off', (id) => { immortal = id === 'on'; }, { small: true });

  const grid = el('div', 'bha-test__grid');
  const cell = (label: string, node: Node) => grid.append(el('span', 'bha-test__label', label), node);
  cell('적 종류', foeSel.el);
  cell('★', starSel.el);
  cell('체력 %', hp);
  cell('공격력 %', atk);
  cell('연속', streak);
  cell('탑 층', floorSel.el);
  cell('공격', atkSeg);
  cell('죽음', immSeg);
  const content = el('div', 'bha-testarena__body');
  content.append(grid);
  if (note) content.append(el('p', 'bha-test__note', note));

  let closeFn: () => void = () => undefined;
  closeFn = confirmDialog({
    title: '적 설정',
    cls: 'bha-testarena',
    content,
    yes: '확인',
    no: '창 닫기', // 뒤로·Esc = 창만 닫기 (빈 자리 [적 설정]으로 다시)
    alt: { label: '나가기', onClick: h.onExit },
    onYes: () => h.onPick({
      foeId: foeSel.value,
      star: Number(starSel.value),
      streak: Number(streak.value) || 0,
      floor: floorSel.value ? Number(floorSel.value) : null,
      hpPct: Number(hp.value) || 100,
      attackPct: Number(atk.value) || 100,
      attacks,
      immortal,
    }),
    onNo: h.onClose,
  });
  return closeFn;
}

/** 빈 적 자리에 놓는 [적 설정] 버튼 (창을 닫은 뒤 다시 연다) */
export function testArenaSlot(onOpen: () => void): HTMLElement {
  const b = button({ label: '적 설정', icon: 'i-attack', variant: 'primary', onClick: onOpen });
  b.classList.add('bha-testarena__slot');
  return b;
}
