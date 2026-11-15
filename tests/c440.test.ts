// C.440 (GDD 5절 '캐릭터 스킨 분류' v6.044): 대분류 진화체·특수·한정 → 중분류, 색은 상세 창 칩으로 묶기, 상태 화면 스킨 목록 삭제
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { characterSkinEntries, formSkinGroups, skinSubGroups } from '../src/data/skins/lookOptions';
import { SKINS } from '../src/data/skins';
import { skinSubOf } from '../src/data/shop';
import { FACTIONS } from '../src/data/factions';

const read = (p: string) => readFileSync(p, 'utf8');

describe('C.440 캐릭터 스킨 분류', () => {
  it('진화체 중분류 = 종족 설정 단계 이름(+깬 뒤 그림 단계) + 초월자 / skinGroups 가 있으면 그것', () => {
    expect(formSkinGroups('hollow').map((g) => g.name)).toEqual(['호로', '길리안', '아쥬커스', '바스트로데', '아란칼', '초월자']);
    expect(formSkinGroups('shinigami').map((g) => g.name)).toEqual(['사신', '참백도', '초월자']);
    expect(skinSubGroups('hollow', 'limited').map((g) => g.name)).toEqual(['세트', '헤어', '복장']);
    expect(skinSubGroups('hollow', 'special')).toEqual([]);
  });
  it('모든 스킨 데이터에 분류가 있고, 진화체 스킨은 단계가 있다', () => {
    for (const s of SKINS) {
      expect(['form', 'special', 'limited']).toContain(s.cls);
      if (s.cls === 'form') expect(s.tier).toBeGreaterThan(0);
    }
    expect(SKINS.find((s) => s.id === 'grandfisher')?.cls).toBe('special');
  });
  it('테스트 모드: 아쥬커스 모델은 한 칸 + 색 5(노멀·물·불·흙·뇌), 단계 모델은 종족 중분류로', () => {
    const e = characterSkinEntries('hollow', { test: true, owned: [], dex: [] });
    const aj = e.filter((x) => x.sub === 'tier3');
    expect(aj).toHaveLength(7);
    expect(aj[0]!.variants.map((v) => v.id)).toEqual(['carapace', 'carapacewater', 'carapacefire', 'carapaceearth', 'carapacethunder']);
    expect(e.find((x) => x.key === 'tier:5')?.variants.map((v) => v.gender)).toEqual(['male', 'female']);
    expect(e.find((x) => x.key === 'tier:4')?.sub).toBe('tier4');
    expect(e.filter((x) => x.sub === 'transcendent').map((x) => x.name)).toEqual(['아이젠', '태초', '현현', 'Unknown;03398', '디버깅']); // C.443: 인간형 스킨 현현·디버깅
    const sh = characterSkinEntries('shinigami', { test: true, owned: [], dex: [] });
    expect(sh.filter((x) => x.sub === 'shinigami').map((x) => x.key)).toEqual(['tier:1', 'tier:2', 'tier:3', 'tier:4']);
  });
  it('일반 플레이: 가진 색만 칩으로, 그림 없는 스킨(아란칼 진화체별 자리)은 숨김, 단계 모델 없음', () => {
    const e = characterSkinEntries('hollow', { test: false, owned: ['skin-wyrmwater', 'skin-wyrm', 'skin-arrnormala'], dex: [] });
    expect(e.map((x) => [x.name, x.variants.map((v) => v.id)])).toEqual([['거미형', ['wyrm', 'wyrmwater']]]);
    expect(characterSkinEntries('shinigami', { test: false, owned: [], dex: [] })).toEqual([]);
  });
  it('색조·오라는 연출·꾸밈으로 (캐릭터 탭은 스킨만)', () => {
    expect(skinSubOf('tint')).toBe('etc');
    expect(skinSubOf('aura')).toBe('etc');
  });
  it('상태 화면에 스킨 목록이 없다 · 종족 분기 없음', () => {
    expect(read('src/ui/lcdScreens.ts')).not.toContain('function skinPanel');
    for (const f of ['src/ui/bha/skinPick.ts', 'src/data/skins/lookOptions.ts']) for (const fa of FACTIONS) expect(read(f)).not.toContain(`'${fa.id}'`);
  });
});
