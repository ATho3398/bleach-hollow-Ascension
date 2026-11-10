// C.379 (GDD 229장): 튜토리얼 카드 [이전] 버튼(첫 장·행동 대기 카드 제외, 앞 장이 대기 카드면 그 앞 일반 카드로) · [이전]/[다음] 버튼 줄은 언제나 한 줄
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { SCRIPT_STAGES, scriptWaitOf } from '../src/engine/combat';
import { SCRIPT_SCENES } from '../src/data/help';

const read = (p: string) => readFileSync(p, 'utf8');

describe('229장 1 각본 전투 [이전] = 앞 설명 카드 (대기 카드 건너뜀)', () => {
  const cards = SCRIPT_STAGES.filter((x) => !!SCRIPT_SCENES[x]);
  it('카드가 뜨는 단계는 모두 무엇을 기다리는지 안다 (설명 = ack, 막기·블록 = 대기)', () => {
    for (const c of cards) expect(scriptWaitOf(c)).not.toBeNull();
    expect(scriptWaitOf('auto')).toBeNull();
  });
  it('설명 카드의 앞 설명 카드: 첫 카드는 없음, 그 밖은 대기 카드를 건너뛴 앞 설명 카드', () => {
    const prevAck = (stage: string) => {
      for (let i = cards.indexOf(stage as (typeof cards)[number]) - 1; i >= 0; i--) if (scriptWaitOf(cards[i]!) === 'ack') return cards[i]!;
      return null;
    };
    const acks = cards.filter((c) => scriptWaitOf(c) === 'ack');
    expect(prevAck(acks[0]!)).toBeNull();
    for (const a of acks.slice(1)) {
      const p = prevAck(a)!;
      expect(scriptWaitOf(p)).toBe('ack');
      expect(cards.indexOf(p)).toBeLessThan(cards.indexOf(a));
    }
  });
  it('battleView: 설명 카드(ack)에만 onPrev, [이전] 글 보기는 전투 상태를 건드리지 않는다(scriptAck 없음)', () => {
    const v = read('src/ui/battleView.ts');
    expect(v).toContain('onPrev: ack ? scriptBackFrom(pr.stage, pr.stage) : undefined');
    const review = v.slice(v.indexOf('const scriptReview = '), v.indexOf('const startTutorial = '));
    expect(review).not.toContain('scriptAck(');
    expect(review).not.toContain('scriptStep(');
  });
});

describe('229장 1 오버레이 [이전] 규칙', () => {
  const t = read('src/ui/tutorialOverlay.ts');
  it('각본 카드 = onPrev 가 있고 대기(waitFor·act)가 아닐 때만, 여러 장 안내 = 직접 해 보기가 아니고 앞 일반 장이 있을 때만', () => {
    expect(t).toContain('const canPrev = sc ? !!sc.onPrev && !sc.waitFor && !sc.act : !scene.practice && back >= 0;');
    expect(t).toMatch(/while \(j >= 0 && SCENES\[j\]!\.practice\) j--;/);
  });
  it('여러 장 홈 안내·치명상 카드도 [이전]으로 앞 장', () => {
    expect(read('src/ui/app.ts')).toContain('onPrev: i > 0 ? () => show(i - 1) : undefined');
    expect(read('src/ui/guideView.ts')).toContain('onPrev: i > 0 ? () => show(i - 1) : undefined');
  });
});

describe('229장 2 버튼 줄 한 줄', () => {
  const css = read('src/ui/bha/screens/screens.css');
  it('버튼 줄은 줄바꿈하지 않고, 모자라면 아이콘만', () => {
    const rule = css.split('\n').find((l) => l.startsWith('.bha-tut__actions {'))!;
    expect(rule).toContain('flex-wrap: nowrap');
    expect(rule).not.toContain('flex-wrap: wrap');
    expect(css).toContain('.bha-tut__actions.is-iconic .bha-btn:has(.bha-icon) .bha-tut__label { display: none; }');
  });
  it('가로 화면 카드 너비 후보는 버튼 줄 폭 이상', () => {
    const t = read('src/ui/tutorialOverlay.ts');
    expect(t).toContain('const minW = Math.min(vp.width - 16, rowNeed());');
    expect(t).toMatch(/\.map\(\(w\) => Math\.max\(w, minW\)\)/);
  });
});
