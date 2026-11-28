// C.570 (GDD 14-8 v6.256 — 사용자 2026-11-28 "도감에, 일러스트, 애니메이션 창 만들고 다시볼 수 있게 만드셈. 일러도 추가해줄거임. 그리고 테스트모드에선 다 볼 수 있게.
// 애니는 진화, 첫 시작 등등."): 책장 [일러스트] [애니메이션] 탭. 본 적 있는 것만 열림(기록에서 읽음 — 새 세이브 칸 없음), 테스트 모드 = 전부.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ILLUSTRATIONS, parseIllust } from '../src/data/gallery';
import { newBuild, gainTrait } from '../src/engine/absorb/build';
import { MAX_TIER_INDEX, stepsNeeded } from '../src/engine/evolution';
import { animSlots, evolveAnimsOf, illustsFor, illustUnlocked, illustUnlockText, testAnimSlots, type GallerySave } from '../src/engine/gallery';
import { newSaveData, performEvolution, type SaveData } from '../src/game';
import { BOOK_TABS } from '../src/ui/bookView';

const F = ['hollow', 'shinigami'];

function evolved(times: number, faction: 'hollow' | 'shinigami' = 'hollow'): SaveData {
  const s = newSaveData(faction, 1);
  for (const k of Object.keys(s.help.guides)) s.help.guides[k as keyof typeof s.help.guides] = 'done';
  s.build = newBuild();
  for (let i = 0; i < 4; i++) s.build.slots.push(null);
  gainTrait(s.build, 't-water-a');
  s.nest.hunger = 20;
  s.nest.condition = 80;
  for (let i = 0; i < times; i++) {
    s.evolution.steps = stepsNeeded(s.evolution)!;
    expect(performEvolution(s, 10 + i).ok).toBe(true);
  }
  return s;
}
const g = (s: SaveData) => s as unknown as GallerySave;

describe('책장 탭', () => {
  it('진화체 도감·칭호 도감·적 도감 + 일러스트·애니메이션', () => {
    expect(BOOK_TABS.map((t) => t.label)).toEqual(['진화체 도감', '칭호 도감', '적 도감', '일러스트', '애니메이션']);
  });
});

describe('일러스트 데이터 (사용자가 그림을 주면 줄만 더한다)', () => {
  it('지금은 빈 목록 · 한 줄 검사(id·그림 키·제목·열리는 조건)', () => {
    expect(ILLUSTRATIONS).toEqual([]);
    expect(parseIllust({ id: 'illust-a', art: 'illust.a', title: '첫 그림', unlock: { kind: 'always' } })).toEqual({ id: 'illust-a', art: 'illust.a', title: '첫 그림', unlock: { kind: 'always' } });
    expect(() => parseIllust({ id: 'a', art: '', title: '', unlock: { kind: 'tier' } })).toThrow(/일러스트 데이터 오류/);
  });
  it('열리는 조건: 처음부터 · 단계 · 진화체 발견 · 환생 — 테스트 모드는 전부', () => {
    const s = evolved(2);
    const tier = parseIllust({ id: 'illust-t', art: 'x', title: 't', unlock: { kind: 'tier', tierIndex: 3 } });
    const form = parseIllust({ id: 'illust-f', art: 'x', title: 'f', unlock: { kind: 'form', formId: 't3:water' } });
    const reb = parseIllust({ id: 'illust-r', art: 'x', title: 'r', unlock: { kind: 'rebirth', count: 1 }, forFaction: 'shinigami' });
    expect(illustUnlocked(tier, g(s))).toBe(false);
    expect(illustUnlocked(tier, g(s), true)).toBe(true);
    expect(illustUnlocked(form, g(s))).toBe(true);
    expect(illustUnlocked(reb, g(s))).toBe(false);
    expect(illustsFor('hollow', [tier, form, reb]).map((d) => d.id)).toEqual(['illust-t', 'illust-f']);
    expect(illustUnlockText(tier, ['혼백', '길리안', '아쥬커스', '바스토 로데'])).toBe('4단계 바스토 로데에 닿으면 열린다');
  });
});

describe('애니메이션 목록 (본 것만 열림)', () => {
  it('새 세이브(방에 들어오기 전): 탄생도 아직 — 진화 칸 3개 ??? · 각성·환생 ??? · 다른 종족 탄생 ???', () => {
    const s = newSaveData('hollow', 1);
    s.help.guides.birth = 'pending'; // 새 게임을 만든 직후(app 이 탄생 연출을 차례로 둔다)
    const slots = animSlots(g(s), F, MAX_TIER_INDEX);
    expect(slots.filter((x) => x.seen)).toEqual([]);
    expect(slots.filter((x) => x.factionId === 'hollow').map((x) => x.group)).toEqual(['birth', 'evolve', 'evolve', 'evolve', 'ascension', 'rebirth']);
    expect(slots.filter((x) => x.factionId === 'shinigami').map((x) => x.group)).toEqual(['birth', 'ascension', 'rebirth']);
  });
  it('진화 2번 지난 세이브(옛 세이브 포함 — 기록에서 읽는다): 탄생 + 1→2·2→3 진화(바뀌기 전 → 뒤 모습 그대로) 열림, 3→4 는 ???', () => {
    const s = evolved(2);
    const slots = animSlots(g(s), F, MAX_TIER_INDEX).filter((x) => x.factionId === 'hollow');
    expect(slots.filter((x) => x.seen).map((x) => x.group)).toEqual(['birth', 'evolve', 'evolve']);
    const ev = slots.filter((x) => x.group === 'evolve');
    expect(ev.map((x) => x.entry && x.entry.kind === 'evolve' ? `${x.entry.fromFormId}>${x.entry.toFormId}` : x.tiers)).toEqual(['null>t2:base', 't2:base>t3:water', [2, 3]]);
    const e2 = ev[1]!.entry!;
    expect(e2.kind === 'evolve' && e2.fromLook).toBe(s.runLog.tiers.evolutions[0]!.look ?? null); // 바뀌기 전 모습 = 앞 진화의 외형
  });
  it('같은 진화를 두 번(환생 뒤) 지나도 한 칸 · 아란칼화를 깼으면 각성 칸 · 환생 기록마다 환생 칸', () => {
    const s = evolved(1);
    s.runLog.tiers.evolutions.push({ ...s.runLog.tiers.evolutions[0]! });
    expect(evolveAnimsOf(g(s))).toHaveLength(1);
    (s.runLog.ascensions ??= []).push({ at: 1, factionId: 'hollow', bossId: 'x', difficulty: 4, won: true, seed: 1, durationSeconds: 1, tierIndex: 3, formId: 't4:water:physical' });
    s.runLog.rebirths.push({ at: 2, count: 1, factionId: 'hollow', prevFormId: 't4:water:physical', prevTierIndex: 3, prevElements: ['water'], keptTraitId: null, carry: {}, runsCompleted: 9 });
    const slots = animSlots(g(s), F, MAX_TIER_INDEX).filter((x) => x.factionId === 'hollow');
    expect(slots.find((x) => x.group === 'ascension')).toMatchObject({ seen: true, entry: { kind: 'ascension', formId: 't4:water:physical' } });
    expect(slots.filter((x) => x.group === 'rebirth')).toMatchObject([{ seen: true, entry: { kind: 'rebirth', record: { count: 1 } } }]);
  });
  it('다른 트랙(사신)이 있으면 사신 탄생도 본 것', () => {
    const s = evolved(1);
    const other = evolved(1, 'shinigami');
    s.otherTracks = [{ ...(other as unknown as SaveData['otherTracks'][number]), parkedAt: 1 }];
    const slots = animSlots(g(s), F, MAX_TIER_INDEX);
    expect(slots.find((x) => x.id === 'birth:shinigami')?.seen).toBe(true);
    expect(slots.filter((x) => x.factionId === 'shinigami' && x.group === 'evolve' && x.seen)).toHaveLength(1);
  });
  it('테스트 모드: 종족마다 탄생·각성·환생 전부 열림 (진화는 화면이 모든 진화체 쌍 고르기)', () => {
    const t = testAnimSlots(F, MAX_TIER_INDEX);
    expect(t.every((x) => x.seen && x.entry)).toBe(true);
    expect(t.map((x) => x.id)).toEqual(['birth:hollow', 'ascension:hollow', 'rebirth:hollow', 'birth:shinigami', 'ascension:shinigami', 'rebirth:shinigami']);
  });
});

describe('화면 (소스 확인)', () => {
  const v = readFileSync('src/ui/galleryView.ts', 'utf8');
  const book = readFileSync('src/ui/bookView.ts', 'utf8');
  it('다시 보기 = 연출만(세이브 안 건드림) · 아무 데나 누르면 닫기 · 진화 연출은 replay(3번 터치 취소 없음)', () => {
    expect(v).toContain("root.addEventListener('pointerdown', onTap, true)");
    expect(v).toContain('{ replay: true }');
    expect(v).not.toMatch(/onCancel|persist|performEvolution|evolveAfterReturn/);
    expect(readFileSync('src/ui/evolutionPanel.ts', 'utf8')).toContain("label: hooks.replay ? '닫기'");
  });
  it('테스트 모드면 두 탭 전부 열림 · 일러스트 빈 목록 안내 한 줄 · 못 연 칸 = ???', () => {
    expect(book).toContain("illustView(root, faction, save, title, isTestMode())");
    expect(book).toContain('animView(root, faction, save, title, isTestMode()');
    expect(v).toContain("export const ILLUST_EMPTY_TEXT = '아직 일러스트가 없다 — 그림이 들어오면 여기에 모인다.';");
    expect(v).toContain("name: ok ? d.title : '???'");
  });
});
