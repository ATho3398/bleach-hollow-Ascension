import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { uiBox, visualOrder, type VisualBox } from '../src/ui/bha/select';

const read = (p: string) => readFileSync(p, 'utf8');
type Item = { id: string } & VisualBox;
const it_ = (id: string, u: number, v: number, w = 80, h = 80): Item => ({ id, u, v, w, h });
const order = (items: Item[]) => visualOrder(items, (i) => i).map((i) => i.id);

describe('C.119 기기 버튼 선택 = 보이는 위치 순서 (GDD 63장)', () => {
  it('위→아래 줄, 같은 줄은 왼→오 (DOM 순서가 뒤죽박죽이어도)', () => {
    // 홈 모양: DOM 순서 door·altar·book·chest·dummy·shop·캐릭터·상태·독
    const items = [
      it_('door', 600, 160, 100, 66), it_('altar', 275, 258, 96, 90), it_('book', 230, 172, 82, 77), it_('chest', 170, 268, 96, 90),
      it_('dummy', 665, 262, 96, 90), it_('shop', 565, 258, 96, 90), it_('char', 420, 190, 138, 142), it_('status', 420, 85, 54, 74),
      it_('feed', 100, 360, 190, 44), it_('more', 810, 360, 44, 44),
    ];
    expect(order(items)).toEqual(['status', 'book', 'char', 'door', 'chest', 'altar', 'shop', 'dummy', 'feed', 'more']);
  });

  it('같은 줄 판정: 높이가 달라도 가운데 높이 차가 작은 쪽 높이의 절반 이내면 한 줄, 아니면 다른 줄', () => {
    expect(order([it_('b', 300, 100, 50, 60), it_('a', 100, 120, 50, 100)])).toEqual(['a', 'b']); // 차 20 ≤ 30 → 같은 줄, 왼→오
    expect(order([it_('b', 300, 100, 50, 60), it_('a', 100, 140, 50, 100)])).toEqual(['b', 'a']); // 차 40 > 30 → 다른 줄, 위 먼저
  });

  it('같은 자리면 원래 순서를 지킨다, 원본 배열은 바뀌지 않는다', () => {
    const items = [it_('x', 10, 10), it_('y', 10, 10)];
    expect(order(items)).toEqual(['x', 'y']);
    expect(items.map((i) => i.id)).toEqual(['x', 'y']);
    expect(order([])).toEqual([]);
  });

  it('세로 폰 회전 출력(시계 90도): 화면 y 는 왼→오, 화면 x 는 아래→위로 읽는다', () => {
    const lcd = { left: 0, top: 0, width: 390, height: 844 }; // 회전된 화면의 바깥 사각형
    const at = (left: number, top: number) => uiBox({ left, top, width: 20, height: 20 }, lcd, true);
    // 게임 화면 위쪽 줄 = 화면 오른쪽, 게임 화면 왼쪽 = 화면 위쪽
    expect(at(360, 100).v).toBeLessThan(at(20, 100).v);
    expect(at(200, 100).u).toBeLessThan(at(200, 700).u);
    const items = [{ id: 'bottom-left', ...at(20, 100) }, { id: 'top-right', ...at(360, 700) }, { id: 'top-left', ...at(360, 100) }];
    expect(order(items)).toEqual(['top-left', 'top-right', 'bottom-left']);
    // 회전 없는 화면
    const flat = uiBox({ left: 110, top: 30, width: 20, height: 40 }, { left: 10, top: 10, width: 844, height: 390 }, false);
    expect(flat).toEqual({ u: 110, v: 40, w: 20, h: 40 });
  });

  it('연결: 홈은 보이는 위치 순서 표시, 선택 장치가 explicit·자동 목록 둘 다 적용, 펼친 줄은 맨 앞 묶음', () => {
    expect(read('src/ui/roomView.ts')).toContain("main.dataset.devLayout = 'visual'");
    const dev = read('src/ui/bha/device.ts');
    expect(dev).toContain("explicit.scope.dataset.devLayout === 'visual'");
    expect(dev).toContain('orderVisually(');
    expect(read('src/ui/bha/dock.ts')).toContain("b.setAttribute('data-dev-order', '-1')");
  });

  it('시작 화면: 열 수 없는 세이브 알림이 있으면 낮은 화면에 맞게 메뉴 한 줄 (버전 줄 안 잘림)', () => {
    expect(read('src/ui/startView.ts')).toContain('bha-start--stale');
    const css = read('src/ui/bha/screens-lcd.css');
    expect(css).toContain('.bha-start--stale .bha-start__menu { flex-direction: row;');
    expect(css).not.toMatch(/\.bha-start--stale[^{]*\{[^}]*#[0-9a-fA-F]{3,6}/);
  });
});
