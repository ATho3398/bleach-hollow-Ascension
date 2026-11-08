// C.256 (GDD 173장): 버튼 자리 고정 — 내용(설명 길이·고른 항목·상태)이 바뀌어도 버튼·초점 대상이 움직이지 않는다. 실제 y 값은 docs/captures/c256/proof.json (Playwright)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8');
const lcd = read('src/ui/bha/screens-lcd.css');

describe('흡수 [흡수] 버튼 (173장 1)', () => {
  it('설명 칸이 남은 높이를 고정으로 차지하고(넘치면 안에서 스크롤 + ▼ 더 있음) 버튼은 왼쪽 열 맨 아래', () => {
    expect(lcd).toContain('.bha-absorbpage .bha-lcdpage__col > .bha-absorb__desc, .bha-absorbpage .bha-absorb__pick > .bha-absorb__desc { flex: 1 1 0; min-height: 0; overflow-y: auto;');
    expect(lcd).toContain('.bha-absorbpage .bha-lcdpage__col > .bha-absorb__pick { flex: 1 1 0;'); // 첫 흡수 연습 화면도
    const a = read('src/ui/absorbView.ts');
    expect(a).toContain("const more = el('div', 'bha-pop__more', '▼ 더 있음');");
  });
  it('캡처 실측: 갈래 4개 모두 같은 y (사신·호로·연습)', () => {
    const p = JSON.parse(read('docs/captures/c256/proof.json'));
    const ys = Object.values(p.absorbGoY_after as Record<string, { go: number[] }>).map((v) => v.go[0]);
    expect(new Set(ys).size).toBe(1);
    expect(new Set(Object.values(p.tutorialGoY_after)).size).toBe(1);
  });
});

describe('같은 종류 (173장 3)', () => {
  it('특성 고르기: 후보 목록이 남은 높이 → [다시 뽑기] 줄 자리 고정', () => {
    expect(read('src/ui/absorbView.ts')).toContain("el('div', 'bha-stack bha-absorb__cands')");
    expect(lcd).toContain('.bha-absorbpage .bha-lcdpage__col > .bha-absorb__cands { flex: 1 1 0;');
  });
  it('바퀴 끝 창: 안 글이 바뀌는 창은 높이 고정 → [귀환]·[한 바퀴 더] 자리 고정', () => {
    expect(read('src/ui/expeditionView.ts')).toContain("if (body.childElementCount > 0) sheet.classList.add('bha-sheet--fixed');");
    expect(read('src/ui/bha/walk-scene.css')).toContain('.bha-lcd .bha-exp .bha-sheet.bha-sheet--fixed { height: 330px; }'); // 리디자인 v2 S12 창 552×330
  });
  it('이벤트 창: 실패 이유 줄은 늘 자리(한 줄) → 선택 버튼이 안 내려간다', () => {
    const e = read('src/ui/expeditionView.ts');
    expect(e).toContain("note.style.visibility = eventNote ? 'visible' : 'hidden';");
    expect(e).not.toContain("if (eventNote) info.append(notice('warn', eventNote));");
  });
  it('상세 창(상점·수련장·장비): 높이 고정, 설명은 안에서 스크롤, 행동 버튼은 창 아래', () => {
    const s = read('src/ui/bha/shop.css');
    expect(s).toContain('.bha-itemmodal { height: 300px; max-height: 100%; }'); // 리디자인 v2 창 높이 고정 (C.288)
    expect(s).toContain('.bha-itemmodal__desc { flex: 1 1 0; min-height: 0; overflow-y: auto;');
  });
  it('저장 칸 고르기 설명 두 줄은 한 줄씩(줄바꿈 없음), 프리셋 보기 칸 높이 고정', () => {
    expect(lcd).toContain('.bha-slotpage__sel > * { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }');
    expect(read('src/ui/bha/expedition.css')).toMatch(/\.bha-presets__view \{[^}]*height: 40px;/);
  });
});
