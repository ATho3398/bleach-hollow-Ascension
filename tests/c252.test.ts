// C.252 (GDD 172장): 흡수 갈래 버튼 = 고르기만, 설명 칸 바로 아래 [흡수] 버튼(글자 = 고른 갈래 이름 + '하기')을 눌러야 실행
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getFaction } from '../src/data/factions';
import { renderHelpText, helpVars } from '../src/data/help';
import { absorbModeText, absorbRunLabel } from '../src/ui/absorbView';

const read = (p: string) => readFileSync(p, 'utf8');
const a = read('src/ui/absorbView.ts');

describe('[흡수] 버튼 글자 (172장 2)', () => {
  it('사신: 정화 흡수하기 · 속성 흡수하기 · 능력치 흡수하기 · 놓아주기', () => {
    const n = absorbModeText(getFaction('shinigami'));
    expect([n.both, n.trait, n.stat, n.none].map((x) => absorbRunLabel(x.label))).toEqual(['정화 흡수하기', '속성 흡수하기', '능력치 흡수하기', '놓아주기']);
  });
  it('호로: 포식하기 · 속성 포식하기 · 능력치 포식하기 · 놓아주기 (이름은 종족 json)', () => {
    const n = absorbModeText(getFaction('hollow'));
    expect([n.both, n.trait, n.stat, n.none].map((x) => absorbRunLabel(x.label))).toEqual(['포식하기', '속성 포식하기', '능력치 포식하기', '놓아주기']);
  });
});

describe('화면 (172장 1·3)', () => {
  it('갈래 버튼 클릭 = 고르기만 (다시 눌러도 실행 안 함, 옛 armed/again 판정 삭제)', () => {
    expect(a).toContain('b.onclick = (e) => {\n      select(m);');
    expect(a).toContain("(e.detail > 0 ? b : go).dispatchEvent(new CustomEvent('bha-goto'"); // 기기 ✓ = 고르고 하이라이트를 [흡수] 버튼으로
    expect(a).not.toContain('const again =');
    expect(a).not.toContain('armed');
    expect(a).not.toContain("faction.id === 'hollow'");
  });
  it('[흡수] 버튼만 run 을 부른다, 설명 칸 바로 뒤(DOM 순서 = 기기 ▲▼ 순서: 갈래 → 버튼)', () => {
    expect(a.match(/run\(/g)?.length).toBe(1);
    expect(a).toContain('go.onclick = () => run(sel);');
    expect(a).toContain('picker.actions, picker.desc, picker.go]');
    expect(read('src/ui/guideView.ts')).toContain('pick.append(picker.actions, picker.desc, picker.go);');
  });
  it('버튼은 bha- 클래스만 (새 색·간격 없음)', () => {
    expect(a).toContain("go.classList.add('bha-absorb__go');");
    // 173장 1 에서 자리 고정 규칙이 붙었다 — 색·간격은 토큰만 (#색·px 없음)
    for (const l of read('src/ui/bha/screens-lcd.css').split('\n').filter((x) => x.includes('bha-absorb__go'))) expect(l).not.toMatch(/#[0-9a-f]{3}|\d+px/i);
  });
});

describe('튜토리얼 (172장 4)', () => {
  it('첫 흡수 안내 마지막 장 = 갈래 고르고 [흡수] 버튼 (GDD 245장 5 — 강조 대상은 그 버튼)', () => {
    const g = JSON.parse(read('src/data/help/guides.json')).guides['first-absorb'].at(-1);
    expect(g.targets).toEqual(['@.bha-absorb__go']);
    for (const id of ['shinigami', 'hollow']) {
      const body = renderHelpText(g.body, helpVars(getFaction(id)));
      expect(body).toContain('이 버튼을 눌러');
      expect(body).not.toContain('한 번 더');
    }
  });
});
