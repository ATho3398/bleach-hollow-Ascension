// 수련장 화면 = 카드 3장 (GDD 8-9 v6.242, C.561 — 사용자 2026-11-27 "수련장 들어오면, 카드형식으로 본능 수련, 아란칼화 수련, 훈련인형 띄우고,
// 본능수련 누르면 그 때 좌측에 본능수련 리스트, 우측에 해당 수련 이미지랑 정보, 각 수련치 이런거 적으면 되잖니"): 방 수련장 물건 → 이 화면.
//  - 카드 = 그림 + 이름 + 한 줄(종족 설정 training.hall) + 작은 상태 글. 본능 수련(사신 참백도 수련) · 아란칼화(사신 참백도 구상화) · 훈련 인형 순
//  - 잠긴 카드 = 자물쇠 + 조건 한 줄(누를 수 없음). 해방 없음 진화체(GDD 8-7 프레네시)는 아란칼화 카드가 없다(옛 수련 화면 칸과 같은 규칙)
//  - 본능 수련 → 특수던전식 목록(trainingView), 아란칼화 → 도전 확인 창 → 보스전(임시), 훈련 인형 → 적 설정 창 전투. 뒤로 = 방
//  - 기기: ▲▼ = 카드 사이, ✓ = 고르기 (잠긴 카드는 건너뜀 — 공용 버튼 규칙)
// 옛 C.542 '왼쪽 목록(훈련 인형·수련) + 오른쪽 그림·[시작]' 화면은 이 카드 화면 + 본능 수련 목록으로 대체. 종족 id 로 분기하지 않는다.
import { artUrls } from '../data/art/manifest';
import { PRACTICE_DUMMY } from '../data/enemies';
import { pickFaction } from '../data/schema';
import type { FactionConfig } from '../engine/faction';
import { el, icon, mountApp } from './bha/dom';
import { shownName } from './displayName';
import { trainingLockedText } from './trainingView';

const ART_BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

/** 수련장 카드 세 장 (화면 순서) */
export type HallCardId = 'train' | 'ascend' | 'practice';

export interface TrainingHallHandlers {
  /** 본능 수련 카드 = 종목 목록 화면 */
  onTrain: () => void;
  /** 아란칼화(구상화) 카드 = 도전 확인 창 → 보스전 (GDD 8-5 임시) */
  onAscend: () => void;
  /** 훈련 인형 카드 = 전투 화면 + 적 설정 창 (GDD 8-9 v6.129 흐름 그대로) */
  onPractice: () => void;
}

export interface TrainingHallState {
  /** 수련장 이름 (방 물건 이름) */
  altarName: string;
  /** 본능 수련이 아직 잠겼나 (4단계 전) */
  trainLocked: boolean;
  /** 지금 수련치 / 완료 기준 */
  points: number;
  pointsMax: number;
  /** 이번 생 훈련 인형과 싸운 판 수 */
  practiceCount: number;
  /** 아란칼화 도전: open = 도전 가능, tier = 4단계 전, done = 이미 깸, dead = 돌봄 막힘, none = 해방 없음 진화체(카드 없음) */
  ascend: 'open' | 'tier' | 'done' | 'dead' | 'none';
}

export interface HallCard {
  id: HallCardId;
  name: string;
  /** 카드 한 줄 설명 */
  line: string;
  /** 작은 상태 글 (수련치·판 수·완료) */
  sub: string;
  icon: string;
  art: string | null;
  open: boolean;
  /** 잠긴 카드의 조건 한 줄 (열렸으면 '') */
  lockText: string;
  go: () => void;
}

/** 카드 그림: 제 그림(training.hall.<카드>)이 없으면 방 수련장 물건 그림 (GDD 8-9 v6.205) */
export function hallArt(id: HallCardId): string | null {
  return artUrls(`training.hall.${id}`, ART_BASE).src ?? artUrls('prop.altar', ART_BASE).src;
}

export function trainingHallCards(faction: FactionConfig, st: TrainingHallState, h: TrainingHallHandlers): HallCard[] {
  const H = faction.training.hall;
  const A = faction.ascension;
  const cards: HallCard[] = [
    {
      id: 'train', name: faction.training.title, line: H?.trainDesc ?? `${faction.liberation.name}의 힘을 길들인다.`,
      sub: `수련치 ${Math.min(st.points, st.pointsMax)}/${st.pointsMax}`, icon: 'i-practice', art: hallArt('train'),
      open: !st.trainLocked, lockText: st.trainLocked ? trainingLockedText(faction) : '', go: h.onTrain,
    },
  ];
  if (st.ascend !== 'none') {
    cards.push({
      id: 'ascend', name: A.name, line: H?.ascendDesc ?? A.desc, sub: st.ascend === 'done' ? '완료' : `상대: ${A.foe}`, icon: 'i-attack', art: hallArt('ascend'),
      open: st.ascend === 'open' || st.ascend === 'dead', lockText: st.ascend === 'tier' ? trainingLockedText(faction, A.name) : '', go: h.onAscend,
    });
  }
  cards.push({
    id: 'practice', name: shownName(pickFaction(PRACTICE_DUMMY.name, faction.id)), line: H?.practiceDesc ?? '도감에서 만난 적을 불러 싸워 본다. 져도 잃는 것이 없다.',
    sub: `이번 생 ${st.practiceCount}판`, icon: 'i-attack', art: hallArt('practice'), open: true, lockText: '', go: h.onPractice,
  });
  return cards;
}

export function trainingHallView(root: HTMLElement, faction: FactionConfig, st: TrainingHallState, h: TrainingHallHandlers): void {
  const row = el('div', 'bha-thall__cards');
  row.setAttribute('role', 'list');
  row.setAttribute('aria-label', st.altarName);
  for (const c of trainingHallCards(faction, st, h)) {
    const b = el('button', `bha-thall__card${c.open ? '' : ' is-locked'}${c.sub === '완료' ? ' is-done' : ''}`);
    b.type = 'button';
    b.setAttribute('role', 'listitem');
    b.dataset.hall = c.id;
    b.disabled = !c.open;
    const art = el('span', 'bha-thall__art');
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
    if (!c.open && c.lockText) {
      const lock = el('span', 'bha-thall__lock');
      lock.dataset.hallLock = '';
      lock.append(icon('i-lock'), el('span', '', c.lockText));
      art.append(lock);
    }
    const name = el('b', 'bha-thall__name', c.name);
    const line = el('span', 'bha-thall__line', c.line);
    line.dataset.hallLine = '';
    const sub = el('small', 'bha-thall__sub bha-faint', c.sub);
    b.append(art, name, line, sub);
    b.setAttribute('aria-label', [c.name, c.open ? c.line : c.lockText || '잠김', c.sub].join('. '));
    b.onclick = () => { if (c.open) c.go(); };
    row.append(b);
  }
  const head = el('header', 'bha-exp__head bha-depart-head bha-sdg__head');
  head.append(el('h2', 'bha-plan__title', st.altarName));
  const app = mountApp(root, { cls: 'bha-lcdpage bha-tower bha-thall' }, head, row);
  app.dataset.screen = 'training-hall';
}
