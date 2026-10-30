// C.221 (GDD 143장): 튜토리얼 안내 창은 장면 이동 연출이 끝난 뒤에 · 빈사 치료제 → 구급상자
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { beginSceneMove, sceneMoving } from '../src/ui/bha/actionFx';
import { RECOVER_SCENES } from '../src/data/help';
import { GOLD_ITEMS } from '../src/data/shop';
import { CARE_STATUS_HINTS } from '../src/ui/bha/roomLogic';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('143장 1: 장면 이동 연출 중에는 안내 창을 그리지 않는다', () => {
  afterEach(() => vi.useRealTimers());
  it('beginSceneMove → sceneMoving 참, 끝 함수는 한 번만 · 못 불러도 maxMs 뒤 저절로 끝', () => {
    vi.useFakeTimers();
    expect(sceneMoving()).toBe(false);
    const a = beginSceneMove();
    const b = beginSceneMove(1000);
    expect(sceneMoving()).toBe(true);
    a();
    a();
    expect(sceneMoving()).toBe(true);
    vi.advanceTimersByTime(1001);
    expect(sceneMoving()).toBe(false);
    b();
    expect(sceneMoving()).toBe(false);
  });
  it('온천 들고 나기·월드맵 걷기(→ 페이드인 끝)가 연출을 알리고, 안내 창은 그동안 숨었다가 끝나면 한 번 놓고 고정', () => {
    const spa = read('src/ui/spaView.ts');
    expect(spa).toContain('endMove = beginSceneMove();');
    expect(spa.match(/beginSceneMove\(\)/g)?.length).toBe(2); // 들어오기·나가기
    const wm = read('src/ui/worldMapView.ts');
    expect(wm).toContain('endMove = beginSceneMove();');
    expect(wm).toMatch(/v\.remove\(\);\s*end\(\);/); // 페이드인이 끝나야 끝
    const ov = read('src/ui/tutorialOverlay.ts');
    expect(ov).toContain('if (holdWhileMoving()) return;');
    expect(ov).toContain('if (hiddenForMove || holdWhileMoving()) return;');
    expect(ov).not.toContain('      layout(); // 화면이 바뀌면'); // 매 틱 다시 놓기 없음
    expect(ov).toContain('if (movedFar(');
  });
});

describe('143장 2: 빈사 치료제 이름 = 구급상자 (id 그대로)', () => {
  it('상점 품목 med-cure 이름 = 구급상자', () => {
    expect(GOLD_ITEMS.find((g) => g.id === 'med-cure')?.name).toBe('구급상자');
  });
  it('화면 문구에 치료제 없음 (튜토리얼·빈사 안내·라벨·온천)', () => {
    for (const p of ['src/data/help/tutorial.json', 'src/data/shop/items.json', 'src/ui/labels.ts', 'src/ui/bha/roomLogic.ts', 'src/ui/roomView.ts', 'src/ui/spaView.ts', 'src/ui/bha/statusInfo.ts', 'docs/text-style.md']) {
      expect(read(p), p).not.toContain('치료제');
    }
    expect(CARE_STATUS_HINTS.collapsed).toContain('구급상자를 쓰면 풀린다');
    expect(RECOVER_SCENES.some((s) => s.body.includes('구급상자'))).toBe(true);
  });
});
