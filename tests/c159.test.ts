// C.159 (GDD 98장 A1~A4): 수련장 머리 제목 토글 · 보관함 슬롯 오른쪽 창 · 대기 보상 시계 버튼 · 방 물건 크기
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import hollow from '../src/data/factions/hollow.json';
import shinigami from '../src/data/factions/shinigami.json';

const read = (p: string) => readFileSync(p, 'utf8');

describe('C.159 A2 보관함 슬롯 오른쪽 창', () => {
  it('두 열/한 열 전환(오른쪽 열 hidden)을 슬롯 탭 분기보다 먼저 맞춘다', () => {
    const t = read('src/ui/lcdScreens.ts');
    const hide = t.indexOf('page.right.hidden = oneCol');
    const slots = t.indexOf("if (chestUi.tab === 'slots')");
    expect(hide).toBeGreaterThan(0);
    expect(hide).toBeLessThan(slots);
    expect(t.match(/page\.right\.hidden = /g)).toHaveLength(1);
  });
});

describe('C.159 A3 대기 보상 시계 버튼', () => {
  it('방 위 줄에서 빠지고 독 ⋯ 옆 버튼이 된다', () => {
    expect(read('src/ui/roomView.ts')).not.toContain("label: '대기 보상'");
    const d = read('src/ui/bha/dock.ts');
    expect(d).toContain("dataset.sc = 'idle-reward'");
    expect(d).toContain('iconOnly: true');
  });
});

describe('C.159 A4 방 물건 크기', () => {
  it('보관함·책장·상점·수련장은 0.68, 모험(문)은 그대로', () => {
    for (const f of [hollow, shinigami]) {
      const l = (f as any).room.layout;
      for (const p of ['book', 'altar', 'chest']) expect(l[p].scale).toBe(0.68);
      expect(l.outside.scale).toBe(1); // C.215: 옛 모험 문 → 밖으로 (GDD 137장 3)
    }
  });
});
