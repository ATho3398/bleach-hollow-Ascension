// GDD 213장 (사용자 2026-11-09 "모험준비에서 블록 창 잘 바꿨는데, 튜토는 그대로거든?튜토도 블록 수정된대로 바꾸고"):
// 타일 안내(tile-plan)는 진짜 모험 준비 화면의 [타일 배치] 탭(C.266·C.298·C.307 창) 위에서 돈다 — 가리키는 것이 그 탭에만 보이므로 안내 차례면 그 탭으로 연다
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { GUIDES } from '../src/data/help';

const read = (p: string) => readFileSync(p, 'utf8');

describe('타일 안내 = 새 [타일 배치] 창 (GDD 213장)', () => {
  const scenes = GUIDES['tile-plan'];

  it('카드 5장: 탭 → 가진 타일 → 길 → 조합 → 배치 프리셋', () => {
    expect(scenes.map((s) => s.id)).toEqual(['tabs', 'deck', 'place', 'combo', 'preset']);
    expect(scenes.map((s) => s.targets)).toEqual([['@.bha-plan__modetabs'], ['plan.hand'], ['plan.road'], ['plan.road'], ['@.bha-plan__side']]);
  });

  it('가리키는 대상은 모두 모험 준비 화면의 새 창 부품이다', () => {
    const pv = read('src/ui/planView.ts');
    const road = read('src/ui/bha/road.ts');
    expect(pv).toContain("'bha-tabs bha-plan__sidetabs bha-plan__modetabs'");
    expect(pv).toContain("presetEl.classList.add('bha-plan__side', 'bha-panel')");
    expect(road).toContain("hand.dataset.help = 'plan.hand'");
    expect(road).toContain("road.dataset.help = 'plan.road'");
  });

  it('옛 창 문구 없음: "아래 카드" 대신 "길 아래 카드", 탭 안내가 [타일 배치]/[준비]를 말한다', () => {
    expect(scenes.some((s) => s.body.startsWith('아래 카드'))).toBe(false);
    expect(scenes[0]!.body).toContain('[타일 배치]');
    expect(scenes[0]!.body).toContain('[준비]');
  });

  it('안내 차례면 모험 준비를 [타일 배치] 탭으로 연다 (보통은 [준비])', () => {
    expect(read('src/ui/planView.ts')).toContain("setMode?.(h.startMode ?? 'prep');");
    expect(read('src/ui/app.ts')).toContain("startMode: tilesUnlocked(save!) && guidePending(save!.help, 'tile-plan') ? 'place' : 'prep',");
  });

  it('카드 제목 아이콘이 있다 (새 카드 tabs·preset)', () => {
    const ov = read('src/ui/tutorialOverlay.ts');
    expect(ov).toContain("tabs: 'i-deck'");
    expect(ov).toContain("preset: 'i-stored'");
  });
});
