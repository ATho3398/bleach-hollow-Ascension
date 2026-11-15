// C.420 (GDD v6.004·v6.005 3-2·14-3): 방 상태 박스 푸는 법 줄 삭제·제자리 · 상태 화면 상태이상 블록 · 홈 [소모품] 빠른 사용
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { togglePanel } from '../src/ui/bha/dockLogic';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('v6.004 3-2 방 상태 박스', () => {
  const box = read('src/ui/bha/statusBox.ts');
  const room = read('src/ui/roomView.ts');
  const css = read('src/ui/bha/room.css');
  it('상태이상 줄에 푸는 법 줄이 없다', () => {
    expect(box).not.toContain('bha-room__gaugehint');
    expect(css).not.toContain('bha-room__gaugehint');
  });
  it('자리는 상태이상 줄을 뺀 박스로 정하고 줄은 아래로 붙는다 (--state-h)', () => {
    expect(room).toContain("scene.style.setProperty('--state-h', `${stateH}px`);");
    expect(room).toContain("scene.style.setProperty('--chip-h', `${chipRow.offsetHeight - stateH + (nameTag?.offsetHeight ?? 0)}px`);");
    expect(css).toContain('transform: translate(-50%, calc(-100% + var(--state-h, 0px)));');
  });
  it('머리 높이는 정지 그림으로 잰다 (움직이는 프레임마다 박스가 몇 px 흔들리던 것)', () => {
    expect(room).toContain('const drawnTop = ar.top + ratio * ar.height;');
    expect(room).not.toContain('const drawnTop = drawnHeadY(char)');
  });
});

describe('v6.004 3-2 상태 화면 상태이상 블록', () => {
  const lcd = read('src/ui/lcdScreens.ts');
  const css = read('src/ui/bha/screens-lcd.css');
  it('윗줄 이름 · 푸는 법, 아랫줄 남은 시간(빈사만), ⓘ 끝', () => {
    expect(lcd).toContain("top.append(h('b', '', title), ' ', h('span', 'bha-faint', `· ${short}`));");
    expect(lcd).toContain("if (left) text.append(h('span', 'bha-nest__stateleft', left));");
    expect(lcd).toContain('row.append(icon(iconId), text, infoTip(title, () => statusInfo(info, faction)));');
  });
  it('모든 블록 같은 폭 (한 열 격자)', () => {
    expect(css).toContain('.bha-care__ailmentlist { display: grid; grid-template-columns: minmax(0, 1fr);');
    expect(css).toContain('grid-template-columns: auto minmax(0, 1fr) auto;');
  });
});

describe('v6.004 14-3 홈 [소모품]', () => {
  const dock = read('src/ui/bha/dock.ts');
  const room = read('src/ui/roomView.ts');
  it('독 패널에 소모품 줄이 있고 같은 버튼을 다시 누르면 닫힌다', () => {
    expect(togglePanel('none', 'items')).toBe('items');
    expect(togglePanel('items', 'items')).toBe('none');
    expect(togglePanel('food', 'items')).toBe('items');
  });
  it('목록 = 약 + 해금된 전투 소모품, 전투 전용은 흐리게 + 이유, 쓴 뒤 줄 유지', () => {
    expect(room).toContain("consumableGroupOf(e.id) === 'battle' && gateOpen(save, 'battleItem')");
    expect(room).toContain("lock: e.action === 'use' ? e.lock : BATTLE_ONLY_LOCK");
    expect(dock).toContain('b.disabled = q.lock !== null;');
    expect(dock).toContain("if (panel !== 'items' || !root.isConnected) return;");
  });
  it('쓰기 = 가방 [사용]과 같은 함수', () => {
    expect(room).toContain('const r = useInventoryItem(save, faction, id);');
  });
});
