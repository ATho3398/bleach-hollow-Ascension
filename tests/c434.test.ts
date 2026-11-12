// C.434 (GDD 17절 '테스트 모드 보강' v6.036): 모델 고르기 목록(단계 이름·아란칼 기본) · 테스트 모드 붕옥·초월자 켜기 · 초월자 외형 스킨
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { charArt, skinHasArt } from '../src/data/art/manifest';
import { FORM_TABLE } from '../src/data/evolution';
import { FACTIONS } from '../src/data/factions';
import { tierLookTiers, transcendentLookId, transcendentLooks, validModelLook } from '../src/data/skins';
import { modelLookOptions, tierLookOptions } from '../src/data/skins/lookOptions';
import { allTracks, artSkinOf, artTierIndexOf, characterTracks, equipSkin, loadSave, newSaveData, trackIdOf, writeSave } from '../src/game';
import { newTestSave, openTestHogyoku, setForm, testGrantTranscendent, testSkins, testWearSkin } from '../src/engine/testMode';

function memStorage(): { getItem(k: string): string | null; setItem(k: string, v: string): void } {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}
const look = (factionId: string, tierIndex: number, skin: string | null, g: 'male' | 'female' = 'male') => charArt(factionId, tierIndex, `char.${factionId}`, '/', undefined, undefined, skin, undefined, g);

describe('모델 고르기 목록 — 단계 이름·아란칼 기본', () => {
  it('단계 모델 = 종족 설정 단계 이름 (호로 1 호로·4 바스트로데·5 아란칼, 단계 외형 표 단계는 뺌 / 사신 4단계 전부)', () => {
    expect(tierLookTiers('hollow')).toEqual([{ tier: 1, name: '호로' }, { tier: 4, name: '바스트로데' }, { tier: 5, name: '아란칼' }]);
    expect(tierLookTiers('shinigami').map((t) => t.name)).toEqual(['혼백', '영술원 학생', '평대원', '수석 대원']);
    const labels = tierLookOptions('hollow').map((o) => o.label);
    expect(labels).toContain('4단계 바스트로데');
    expect(labels).toEqual(expect.arrayContaining(['5단계 아란칼 (남)', '5단계 아란칼 (여)']));
    expect(labels.filter((l) => l.includes('아란칼')).length).toBe(2);
  });
  it('5단계 아란칼 = 종이인형 arrancar-base(여 -f), 4단계 바스트로데 = 덩치', () => {
    expect(look('hollow', 3, 'tier:5:m').rig?.look).toBe('arrancar-base');
    expect(look('hollow', 0, 'tier:5:f').rig?.look).toBe('arrancar-base-f');
    expect(look('hollow', 4, 'tier:4').rig?.look).toBe('brute-base');
  });
  it('그림 없는 스킨(아란칼 진화체별 그림 자리)은 [그림 대기] — 일반 목록에서 빠진다', () => {
    expect(skinHasArt('arrnormala')).toBe(false);
    expect(skinHasArt('gillian')).toBe(true);
    const test = testSkins('hollow');
    expect(test.filter((o) => o.group === 'waiting').map((o) => o.id)).toContain('arrnormala');
    expect(test.filter((o) => o.group !== 'waiting').some((o) => o.id.startsWith('arr'))).toBe(false);
    const all = modelLookOptions('hollow', { test: false, owned: ['skin-arrnormala', 'skin-gillian'], dex: [] });
    expect(all.map((o) => o.id)).toEqual(['gillian']);
  });
  it('실제 게임: 4단계 진화체 전부 아란칼화를 깨면 arrancar-base (여성 -f), 깨기 전엔 덩치', () => {
    for (const form of FORM_TABLE.filter((f) => f.tier === 4)) {
      const s = newSaveData('hollow', 1);
      setForm(s, form.id);
      expect(look('hollow', artTierIndexOf(s), artSkinOf(s)).rig?.look, form.id).toBe('brute-base');
      s.evolution.ascended = true;
      setForm(s, form.id); // 깬 뒤 외형 다시 고름 (formLooks)
      expect(look('hollow', artTierIndexOf(s), artSkinOf(s)).rig?.look, form.id).toBe('arrancar-base');
      expect(look('hollow', artTierIndexOf(s), artSkinOf(s), 'female').rig?.look, form.id).toBe('arrancar-base-f');
    }
  });
});

describe('초월자 외형 스킨', () => {
  it('그림/모델 있는 초월자만 (데이터) — 태초 그림·Unknown;03398 조각 모델', () => {
    expect(transcendentLooks().map((t) => t.id)).toEqual(['zero-sage', 'rift-wanderer']);
    expect(look('hollow', 3, transcendentLookId('zero-sage')).src).toMatch(/char-transcendent-zero-sage/);
    expect(look('shinigami', 2, transcendentLookId('rift-wanderer')).src).toMatch(/#mosaic=rift-wanderer/);
  });
  it('일반 = 얻은 초월자만 목록·입기, 테스트 = 전부. 단계 모델은 테스트에서만', () => {
    const s = newSaveData('shinigami', 1);
    expect(modelLookOptions('shinigami', { test: false, owned: [], dex: [] })).toEqual([]);
    expect(equipSkin(s, transcendentLookId('zero-sage'))).toBe(false);
    expect(equipSkin(s, 'tier:1')).toBe(false);
    s.transcendentDex.push({ id: 'zero-sage', at: 1, fusionIndex: 1 });
    expect(modelLookOptions('shinigami', { test: false, owned: [], dex: ['zero-sage'] }).map((o) => o.id)).toEqual([transcendentLookId('zero-sage')]);
    expect(equipSkin(s, transcendentLookId('zero-sage'))).toBe(true);
    expect(equipSkin(s, 'tier:1', { test: true })).toBe(true);
    expect(equipSkin(s, transcendentLookId('rift-wanderer'), { test: true })).toBe(true);
    expect(testWearSkin(s, 'tier:9')).toBe(false);
    expect(validModelLook('hollow', 'tier:2')).toBe(false); // 단계 외형 표가 덮는 단계
  });
  it('저장·불러오기: 올바른 모델 외형은 남고 모르는 값은 지운다 (세이브 형식 그대로)', () => {
    const s = newSaveData('hollow', 1);
    s.skin = 'tier:5:f';
    const st = memStorage();
    writeSave(st, s);
    expect(loadSave(st)!.skin).toBe('tier:5:f');
    s.skin = transcendentLookId('rift-wanderer');
    writeSave(st, s);
    expect(loadSave(st)!.skin).toBe(transcendentLookId('rift-wanderer'));
    s.skin = 'transcendent:aizen'; // 그림 없는 초월자
    writeSave(st, s);
    expect(loadSave(st)!.skin).toBeNull();
  });
});

describe('테스트 모드 붕옥·초월자 켜기', () => {
  it('새 테스트 칸 = 붕옥 등장·공명 · 두 번째 캐릭터(전체 해금) · 알림 없음 · 다시 불러도 그대로', () => {
    const s = newTestSave('hollow', 5000);
    expect(s.hogyoku).toMatchObject({ tabOpen: true, tabNotice: false, resonance: true });
    const chars = characterTracks(s);
    expect(chars.map((t) => t.factionId)).toEqual(['hollow', 'shinigami']);
    expect(chars[1]!.evolution.tierIndex).toBe(chars[0]!.evolution.tierIndex);
    expect(s.trackNotice).toBeNull();
    expect(s.help.guides['hogyoku-appear']).not.toBe('pending');
    expect(trackIdOf(s)).toBe('hollow');
    expect(openTestHogyoku(s, 6000)).toBeNull();
    expect(allTracks(s).length).toBe(2);
  });
  it('일반 새 세이브는 그대로 (붕옥 닫힘)', () => {
    expect(newSaveData('hollow', 1).hogyoku.tabOpen).toBe(false);
  });
  it('초월자 바로 얻기: 6종 각각 트랙·도감, 두 캐릭터 그대로, 다시 누르면 그 트랙으로', () => {
    const s = newTestSave('shinigami', 5000);
    expect(testGrantTranscendent(s, 'nope')).toBe(false);
    expect(testGrantTranscendent(s, 'zero-sage', 6000)).toBe('added');
    expect(s.transcendentId).toBe('zero-sage');
    expect(s.transcendentDex.map((x) => x.id)).toEqual(['zero-sage']);
    expect(s.slotLog.fusions).toEqual([]);
    for (const id of ['yhwach', 'aizen', 'ichigo', 'iron-tyrant', 'rift-wanderer']) expect(testGrantTranscendent(s, id, 7000)).toBe('added');
    expect(characterTracks(s).length).toBe(2);
    expect(allTracks(s).length).toBe(8);
    expect(testGrantTranscendent(s, 'zero-sage', 8000)).toBe('owned');
    expect(s.transcendentId).toBe('zero-sage');
  });
});

describe('분기 없음', () => {
  it('목록·외형 코드에 종족·초월자 id 문자열이 없다', () => {
    const src = readFileSync('src/data/skins/lookOptions.ts', 'utf8') + readFileSync('src/data/skins/index.ts', 'utf8').split('모델 고르기 전용 외형')[1]!;
    for (const id of [...FACTIONS.map((f) => f.id), ...transcendentLooks().map((t) => t.id)]) expect(src).not.toContain(`'${id}'`);
  });
});
