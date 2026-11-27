// C.560 붕옥 창 간소화 · 합체 결과 숨김 (GDD 12-2·12-4 v6.242, 사용자 2026-11-27 "붕옥 ui고쳐라 … 현재 강화수치랑 효과만 … 강화하기 누르면 별도 창 …
// 반각성 공명 합체가능 이 ㅈ같은거 뭔데. 없애 … 조건 다 채워도 그냥 검정 실루엣에 이름 ???로만 … 지금 두 캐릭터라면-> 이딴거 좀 없애고").
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FACTIONS } from '../src/data/factions';
import { BALANCE } from '../src/config/balance';
import { TRANSCENDENTS } from '../src/data/transcendents';
import { HOGYOKU_MATERIAL_SOURCE } from '../src/data/hogyoku';
import { STORY_CHAPTERS, chapterContent, episodeKey } from '../src/data/story';
import { checkTrackOpen, newSaveData, newStoryProgress, type SaveData } from '../src/game';
import { developDialogInfo, fusionConds, fusionFinalText, HOGYOKU_MATERIALS, trackNowText, totalEffectText } from '../src/ui/hogyokuView';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const HX = BALANCE.provisional.hogyoku;
const clear = (s: SaveData, fid: string) => {
  const p = (s.story[fid] ??= newStoryProgress());
  for (const c of STORY_CHAPTERS) { for (const e of chapterContent(fid, c.id)?.episodes ?? []) p.cleared[episodeKey(c.id, e.id)] = { firstAt: 1, clears: 1 }; if (!p.chapters.includes(c.id)) p.chapters.push(c.id); }
};
const opened = (resonance: boolean): SaveData => {
  const s = newSaveData(FACTIONS[0]!.id, 1);
  clear(s, FACTIONS[0]!.id);
  checkTrackOpen(s, 10);
  if (resonance) { clear(s, FACTIONS[1]!.id); checkTrackOpen(s, 11); }
  s.shared.soulCrystals = 0; s.shared.hogyokuShards = 0; s.shared.resonanceEssence = 0;
  return s;
};
const view = read('src/ui/hogyokuView.ts');

describe('C.560 붕옥 창 오른쪽 = 지금 강·효과 + [강화하기] + 얻는 곳 한 줄', () => {
  it("효과 한 줄 '33강 · 전 능력치 +3.3%'", () => {
    expect(trackNowText(33)).toBe(`33강 · 전 능력치 +${Math.round(33 * HX.perStepBonus * 1000) / 10}%`);
    expect(trackNowText(0)).toBe('0강 · 전 능력치 +0%');
  });

  it("얻는 곳 = '모험 · 우라하라 상점 · 특수던전' (괄호 설명 없음)", () => {
    expect(HOGYOKU_MATERIAL_SOURCE).toBe('모험 · 우라하라 상점 · 특수던전');
    for (const m of HOGYOKU_MATERIALS) expect(m.from()).toBe(HOGYOKU_MATERIAL_SOURCE);
  });

  it('상태 칩·다음 강·필요 재료·다음 1강·강화 뒤 전체·강당 재료 줄 삭제, [강화하기] 하나', () => {
    for (const gone of ['stageChips', "'bha-hogyoku__stages'", "'다음 강'", "'다음 1강으로 얻는 것'", "'강화 뒤 전체'", "'강당 재료'", "'필요 재료 (보유 / 필요)'"]) expect(view).not.toContain(gone);
    expect(view).toContain("label: '강화하기'");
    expect(read('src/ui/bha/screens-lcd.css')).not.toContain('.bha-hogyoku__stages');
  });

  it("'두 캐릭터' 군말 없음: 총 효과·강화 창", () => {
    expect(totalEffectText(opened(false)).main).toBe('전 능력치 +0%');
    const dlg = view.slice(view.indexOf('export function developDialogInfo'), view.indexOf('/** 상세: 붕옥 그림'));
    expect(dlg).not.toContain('두 캐릭터');
  });
});

describe('C.560 [강화하기] 별도 창', () => {
  const tr = HOGYOKU_MATERIALS[0]!;

  it("재료 충분: 'n강 → n+1강' · 보유/필요 · 오르는 효과 · [강화] 켜짐", () => {
    const s = opened(false);
    s.shared.soulCrystals = 5;
    s.hogyoku.tracks[tr.id] = 3;
    const i = developDialogInfo(s, tr.id);
    expect(i.step).toBe('3강 → 4강');
    expect(i.cost).toBe(`${tr.name} 5 / 4`);
    expect(i.costOk).toBe(true);
    expect(i.gain).toBe(`전 능력치 +${Math.round(HX.perStepBonus * 1000) / 10}%`);
    expect(i.ok).toBe(true);
    expect(i.lock).toBeNull();
  });

  it('재료 모자람: [강화] 흐림 + 이유 한 줄(얻는 곳)', () => {
    const s = opened(false);
    const i = developDialogInfo(s, tr.id);
    expect(i.ok).toBe(false);
    expect(i.costOk).toBe(false);
    expect(i.lock).toContain('모자라다');
    expect(i.lock).toContain(HOGYOKU_MATERIAL_SOURCE);
  });

  it("공명 전 반각성 한계: 이유 = '공명 전 25강 한계'", () => {
    const s = opened(false);
    s.hogyoku.tracks[tr.id] = HX.trackHalf;
    s.shared.soulCrystals = 999;
    const i = developDialogInfo(s, tr.id);
    expect(i.ok).toBe(false);
    expect(i.lock).toContain(`공명 전 ${HX.trackHalf}강 한계`);
  });

  it('50강: 완료 한 줄, 재료·효과 줄 없음', () => {
    const s = opened(true);
    s.hogyoku.tracks[tr.id] = HX.trackMax;
    const i = developDialogInfo(s, tr.id);
    expect(i.step).toBe(`${HX.trackMax}강 — 완료`);
    expect(i.cost).toBeNull();
    expect(i.gain).toBeNull();
    expect(i.ok).toBe(false);
  });

  it('[일괄 강화]는 창 안 · 기기 ✓ 시작 자리 = [강화] · [강화] 뒤 같은 창을 새 강으로 다시 연다', () => {
    const dlg = view.slice(view.indexOf('export function developDialog('), view.indexOf('/** 상세: 붕옥 그림'));
    for (const k of ["key: 'develop-all'", "key: 'develop'", 'data-dev-start', 'hd.onDevelop(m.id); developDialog(save, m, hd);']) expect(dlg).toContain(k);
    expect(view).not.toContain("dataset.sc = 'hogyoku-develop-all'");
  });
});

describe('C.560 합체 결과는 숨긴다', () => {
  it("결과 카드 = 늘 실루엣 + '???' (조합 칩·얻는 것·'지금 두 캐릭터라면 →' 없음)", () => {
    const card = view.slice(view.indexOf('function fusionResultCard('), view.indexOf('/** 합체 창 (GDD 12-2 v6.040'));
    expect(card).toContain('transcendentArt(false)');
    expect(card).toContain("'???'");
    for (const gone of ['지금 두 캐릭터라면', 'transcendentNameNode', 'bha-fuse__gains', 'bha-fuse__chips', 'def.trait']) expect(card).not.toContain(gone);
  });

  it('조건 줄·최종 확인 글에 초월자 이름이 없다', () => {
    const s = opened(true);
    const names = TRANSCENDENTS.map((t) => t.name);
    for (const c of fusionConds(s)) for (const n of names) expect(c.detail).not.toContain(n);
    for (const d of TRANSCENDENTS) expect(fusionFinalText(d).body).not.toContain(d.name);
  });

  it('못 모은 초월자 도감 칸은 조합을 드러내지 않는다 · 종족 분기 없음', () => {
    expect(view).not.toContain('얻는 조합:');
    expect(view).not.toMatch(/faction(Id)? === '(hollow|shinigami)'/);
  });
});
