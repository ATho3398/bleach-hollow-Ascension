// 수련장 화면 = 특수던전식 목록 (GDD 8-9 v6.204, C.539 — 사용자 2026-11-26 "그 훈련인형도 특수던전마냥, 왼쪽에 리스트로 훈련인형, 무슨훈련? 그거 리스트로 띄우고,
// 오른쪽에 그림이랑 설면 넣고 시작 누르게 바꿔라"): 방 수련장 물건 → 이 화면. 틀·CSS 는 주간던전·보스전 화면(specialDungeonView, bha-sdg)을 그대로 쓴다.
//  - 왼쪽 = 위아래로 끌어 넘기는 버튼 목록: 훈련 인형 · 수련(이름 = 종족 설정 training.title). 4단계 전에는 수련에 자물쇠·흐린 글자
//  - 오른쪽 큰 칸 = 고른 항목 그림(그림 키 training.hall.<항목>, 없으면 방 수련장 물건 그림 prop.altar) + 이름 + 설명(종족 설정 training.hall) + [시작]
//  - 처음 들어오면 훈련 인형이 골라진 상태(부르는 쪽이 resetTrainingHallPick). 고른 행을 한 번 더 누르면(기기 ✓) 하이라이트가 [시작]으로
// 종족 id 로 분기하지 않는다.
import { artUrls } from '../data/art/manifest';
import { PRACTICE_DUMMY } from '../data/enemies';
import { pickFaction } from '../data/schema';
import type { FactionConfig } from '../engine/faction';
import { button, el, icon } from './bha/dom';
import { enableDragScrollY } from './bha/dragScroll';
import { lcdPage } from './bha/lcdpage';
import { shownName } from './displayName';
import { trainingLockedText, type TrainingScreenId } from './trainingView';

const ART_BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

export interface TrainingHallHandlers {
  /** 훈련 인형 [시작] = 전투 화면 + 적 설정 창 (GDD 8-9 v6.129 흐름 그대로) */
  onPractice: () => void;
  /** 수련 [시작] = 수련 화면(수련치·수련권·종목 카드) */
  onTrain: () => void;
}

export interface TrainingHallState {
  /** 수련장 이름 (방 물건 이름) */
  altarName: string;
  /** 수련이 아직 잠겼나 (4단계 전) */
  trainLocked: boolean;
  /** 지금 수련치 / 완료 기준 (목록 작은 글자) */
  points: number;
  pointsMax: number;
  /** 이번 생 훈련 인형과 싸운 판 수 (목록 작은 글자) */
  practiceCount: number;
}

/** 화면 안에서 고른 항목 (수련 화면에 갔다 돌아와도 그대로). 방에서 들어올 때 resetTrainingHallPick 으로 훈련 인형 */
const pick: { id: TrainingScreenId } = { id: 'practice' };

/** 방 수련장 물건으로 처음 들어올 때: 훈련 인형이 골라진 상태로 */
export function resetTrainingHallPick(): void {
  pick.id = 'practice';
}

interface HallItem {
  id: TrainingScreenId;
  name: string;
  sub: string;
  icon: string;
  art: string | null;
  desc: string;
  open: boolean;
  lockText: string;
  go: () => void;
}

/** 항목 그림: 제 그림(training.hall.<항목>)이 없으면 방 수련장 물건 그림 (GDD 8-9 v6.204) */
export function hallArt(id: TrainingScreenId): string | null {
  return artUrls(`training.hall.${id}`, ART_BASE).src ?? artUrls('prop.altar', ART_BASE).src;
}

export function trainingHallItems(faction: FactionConfig, st: TrainingHallState, h: TrainingHallHandlers): HallItem[] {
  const H = faction.training.hall;
  return [
    {
      id: 'practice', name: shownName(pickFaction(PRACTICE_DUMMY.name, faction.id)), sub: `이번 생 ${st.practiceCount}판`, icon: 'i-attack', art: hallArt('practice'),
      desc: H?.practiceDesc ?? '도감에서 만난 적을 불러 싸워 본다. 져도 잃는 것이 없다.', open: true, lockText: '', go: h.onPractice,
    },
    {
      id: 'train', name: faction.training.title, sub: st.trainLocked ? '잠김' : `수련치 ${Math.min(st.points, st.pointsMax)}/${st.pointsMax}`, icon: 'i-practice', art: hallArt('train'),
      desc: H?.trainDesc ?? `${faction.liberation.name}의 힘을 길들인다.`, open: !st.trainLocked, lockText: trainingLockedText(faction), go: h.onTrain,
    },
  ];
}

export function trainingHallView(root: HTMLElement, faction: FactionConfig, st: TrainingHallState, h: TrainingHallHandlers): void {
  const cards = trainingHallItems(faction, st, h);
  let sel = Math.max(0, cards.findIndex((c) => c.id === pick.id));

  // 왼쪽: 위아래로 끌어 넘기는 버튼 목록 (특수던전 bha-sdg__list 그대로)
  const list = el('div', 'bha-sdg__list');
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', st.altarName);
  list.dataset.hallList = '';
  enableDragScrollY(list);
  const stage = el('div', 'bha-sdg__stage');
  stage.dataset.hallStage = '';
  let go: HTMLButtonElement | null = null;

  const items = cards.map((c, i) => {
    const b = el('button', `bha-sdg__item${c.open ? '' : ' is-locked'}`);
    b.type = 'button';
    b.setAttribute('role', 'option');
    b.dataset.hall = c.id;
    const name = el('span', 'bha-sdg__itemname');
    name.append(el('b', '', c.name), el('small', 'bha-faint', c.sub));
    b.append(icon(c.open ? c.icon : 'i-lock'), name);
    // 고른 행을 한 번 더 누르면(기기 ✓) 하이라이트를 [시작]으로 — 잠긴 항목은 그대로 (lcdpage.masterDetail 과 같은 규칙)
    b.onclick = () => {
      if (i !== sel) return show(i);
      if (go && !go.disabled) go.dispatchEvent(new CustomEvent('bha-goto', { bubbles: true }));
    };
    list.append(b);
    return b;
  });

  // 오른쪽: 큰 그림 칸 + 이름 + 설명 + [시작]
  function show(i: number): void {
    sel = i;
    const c = cards[i]!;
    pick.id = c.id;
    items.forEach((b, j) => {
      b.classList.toggle('is-selected', j === i);
      b.setAttribute('aria-selected', String(j === i));
    });
    const art = el('div', 'bha-sdg__art');
    art.dataset.art = c.art ?? '';
    if (c.art) {
      const img = el('img', 'bha-thall__img') as HTMLImageElement;
      img.src = c.art;
      img.alt = '';
      art.append(img);
    } else {
      const mark = icon(c.icon);
      mark.classList.add('bha-thall__icon');
      art.append(mark);
    }
    const cap = el('div', 'bha-sdg__cap');
    cap.append(el('span', 'bha-label', st.altarName), el('b', 'bha-sdg__title', c.name));
    art.append(cap);
    if (!c.open) {
      const lock = el('div', 'bha-sdg__lock');
      lock.dataset.hallLock = '';
      lock.append(icon('i-lock'), el('span', '', c.lockText));
      art.append(lock);
    }
    const info = el('div', 'bha-sdg__info');
    const desc = el('p', 'bha-sdg__reward', c.desc);
    desc.dataset.hallDesc = '';
    go = button({ label: '시작', icon: 'i-play', variant: 'primary', size: 'lg', disabled: !c.open, onClick: () => c.go() });
    go.dataset.go = c.id;
    const row = el('div', 'bha-sdg__go bha-thall__go');
    row.append(go);
    info.append(desc, row);
    stage.replaceChildren(art, info);
  }
  show(sel);

  const head = el('header', 'bha-exp__head bha-depart-head bha-sdg__head');
  head.append(el('h2', 'bha-plan__title', st.altarName));
  const { app } = lcdPage(root, { cls: 'bha-tower bha-sdg bha-thall', cols: '1fr 2.2fr' }, head, [list], [stage]);
  app.dataset.screen = 'training-hall';
}
