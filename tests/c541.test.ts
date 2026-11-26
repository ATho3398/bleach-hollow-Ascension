/** C.541 설정 [블록 생성 위치 반전] (GDD 7절 '블록 바 표시' v6.206,
 *  사용자 2026-11-26 "그리고 설정에 블록 생성위치 반전 추가해서 그거 켜면 블록 왼쪽에서 나오게해")
 *  기본 끔 = 칸 1 이 맨 오른쪽(C.216). 켬 = 표시만 좌우 반전(칸 1 맨 왼쪽, 새 블록 오른쪽). 엔진 순서·숫자키 N = 칸 N·시작 커서 = 칸 1 은 그대로.
 *  기기 공통 localStorage(bha-tray-flip) — 세이브 구조 무관. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { slotAt } from '../src/ui/pointer';
import { cellsInScreenOrder, loadTrayFlip, saveTrayFlip, TRAY_FLIP_CLASS, TRAY_FLIP_KEY, trayIndexAtScreen } from '../src/ui/trayFlip';
import { PATCH_LABEL } from '../src/version';

const memStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};
const CAP = 8;
const cells = Array.from({ length: CAP }, (_, i) => `칸${i + 1}`);

describe('C.541 블록 생성 위치 반전', () => {
  it('기본 끔 = 지금 배치: 칸 1 이 맨 오른쪽, 새 블록(칸 2·3…)은 왼쪽으로 붙는다', () => {
    expect(loadTrayFlip(memStorage())).toBe(false);
    expect(loadTrayFlip(null)).toBe(false);
    expect(cellsInScreenOrder(cells, false)).toEqual(['칸8', '칸7', '칸6', '칸5', '칸4', '칸3', '칸2', '칸1']);
    expect(trayIndexAtScreen(CAP - 1, CAP, false)).toBe(0); // 맨 오른쪽 = 칸 1
    expect(trayIndexAtScreen(0, CAP, false)).toBe(CAP - 1);
    // 옛 판정(cap - 1 - slotAt)과 같다
    for (let s = 0; s < CAP; s++) expect(trayIndexAtScreen(s, CAP, false)).toBe(CAP - 1 - s);
  });

  it('켬 = 칸 1 이 맨 왼쪽, 새 블록은 오른쪽에 붙는다', () => {
    expect(cellsInScreenOrder(cells, true)).toEqual(cells);
    expect(trayIndexAtScreen(0, CAP, true)).toBe(0); // 맨 왼쪽 = 칸 1
    expect(trayIndexAtScreen(1, CAP, true)).toBe(1); // 그 오른쪽 = 칸 2 (새 블록 쪽)
    expect(trayIndexAtScreen(CAP - 1, CAP, true)).toBe(CAP - 1);
  });

  it('누른 화면 자리 → 칸 번호: 반전 뒤에도 그 칸의 블록을 가리킨다 (화면 왼쪽 끝 누름)', () => {
    const left = 0, width = 400; // 격자 400px, 칸 50px
    const x = 10; // 맨 왼쪽 칸
    expect(trayIndexAtScreen(slotAt(x, left, width, CAP), CAP, false)).toBe(7); // 끔: 맨 왼쪽 = 칸 8
    expect(trayIndexAtScreen(slotAt(x, left, width, CAP), CAP, true)).toBe(0); // 켬: 맨 왼쪽 = 칸 1
    // 화면 자리 ↔ 칸 번호가 DOM(기기 커서) 순서와 일치: 화면 왼쪽에서 s번째 DOM 칸 = trayIndexAtScreen(s)
    for (const flip of [false, true]) {
      const order = cellsInScreenOrder(cells, flip);
      for (let s = 0; s < CAP; s++) expect(order[s]).toBe(cells[trayIndexAtScreen(s, CAP, flip)]);
    }
  });

  it('숫자키 N = 칸 N · 시작 커서 = 칸 1 은 반전과 무관 (엔진 인덱스 그대로)', () => {
    const bv = readFileSync('src/ui/battleView.ts', 'utf8');
    // 시작 커서는 칸 배열의 0번(칸 1)에 — DOM 순서를 바꿔도 같은 요소
    expect(bv).toContain("if (i === 0) c.dataset.devStart = '';");
    // 화면 좌표 판정만 설정을 탄다
    expect(bv).toContain('trayIndexAtScreen(slotAt(pointerLocal(e).x, r.left, r.width, cap), cap, trayFlip)');
    expect(bv).not.toContain('return cap - 1 - slotAt(');
    // 전투 중 설정을 바꿔도 따라가고, 전투가 끝나면 구독을 푼다
    expect(bv).toContain('window.addEventListener(TRAY_FLIP_EVENT, onTrayFlip)');
    expect(bv).toContain('unflip();');
    expect(bv).not.toMatch(/faction(?:Id)? === '(?:hollow|shinigami)'/);
  });

  it('설정 저장·불러오기: 기기 공통 키, 깨진 값은 끔', () => {
    const st = memStorage();
    expect(saveTrayFlip(st, true)).toBe(true);
    expect(st.m.get(TRAY_FLIP_KEY)).toBe('1');
    expect(loadTrayFlip(st)).toBe(true);
    saveTrayFlip(st, false);
    expect(loadTrayFlip(st)).toBe(false);
    st.setItem(TRAY_FLIP_KEY, 'garbage');
    expect(loadTrayFlip(st)).toBe(false);
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(loadTrayFlip(broken)).toBe(false);
    expect(saveTrayFlip(broken, true)).toBe(true); // 이번 실행에서만
  });

  it('설정 화면: 전투 탭 [조작] 판에 토글 + 한 줄 설명, 공통 값으로 읽고 쓴다(슬롯 설정 아님)', () => {
    const sv = readFileSync('src/ui/settingsView.ts', 'utf8');
    expect(sv).toContain("boolRow('trayFlip', '블록 생성 위치 반전'), hintLine('켜면 블록이 왼쪽부터 채워진다.')");
    expect(sv).toContain('trayFlip: loadTrayFlip(storage)');
    expect(sv).toContain('saveTrayFlip(storage, after.trayFlip)');
    const scope = readFileSync('src/ui/settingsScope.ts', 'utf8');
    expect(scope).not.toContain('trayFlip');
  });

  it('CSS: 켬 클래스 = 격자 ltr, 묶음 경계 선은 칸 왼쪽 틈', () => {
    const css = readFileSync('src/ui/bha/v2/bha.css', 'utf8');
    expect(TRAY_FLIP_CLASS).toBe('is-fill-left');
    expect(css).toContain('.bha-root .bha-v2tray__grid{direction:rtl}');
    expect(css).toContain('.bha-root .bha-v2tray__grid.is-fill-left{direction:ltr}');
    expect(css).toContain('.bha-root .bha-v2tray__grid.is-fill-left .bha-v2cut::before{left:-3px;right:auto}');
    expect(Number(PATCH_LABEL.slice(2))).toBeGreaterThanOrEqual(541);
  });
});
