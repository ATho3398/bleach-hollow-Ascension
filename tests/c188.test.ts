// C.188 성별 선택 (GDD 114장): 슬롯마다 남성/여성(기본 남성) · 외형이 갈리는 단계 = 종족 설정 genderLookFromTier · 여성 그림 키 `-f` 없으면 지금 그림 · 런 로그 성별 · 테스트 패널 진화체 이름 shownName
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { activeGender, DEFAULT_GENDER, genderLookNote, parseGender, setActiveGender, usesFemaleLook } from '../src/engine/gender';
import { charArt } from '../src/data/art/manifest';
import { ART_FILES } from '../src/data/art/files';
import { getFaction } from '../src/data/factions';
import { parseFactionConfig } from '../src/engine/faction';
import { migrateSave, newSaveData, MIN_LOADABLE_SAVE_FORMAT, SAVE_FORMAT_VERSION } from '../src/game';
import { shownName } from '../src/ui/displayName';

const read = (p: string) => readFileSync(p, 'utf8');

afterEach(() => setActiveGender(null));

describe('성별 값 (114장 1)', () => {
  it('기본 남성, 모르는 값은 남성', () => {
    expect(DEFAULT_GENDER).toBe('male');
    expect(parseGender('female')).toBe('female');
    expect(parseGender('x')).toBe('male');
    expect(parseGender(undefined)).toBe('male');
    setActiveGender('female');
    expect(activeGender()).toBe('female');
    setActiveGender(3);
    expect(activeGender()).toBe('male');
  });
});

describe('외형이 갈리는 단계 = 종족 설정 (114장 2)', () => {
  it('호로 5(아란칼 모습 = 아란칼화를 깬 그림 단계, C.220)·사신 1, 단계 번호는 1부터', () => {
    expect(getFaction('hollow').genderLookFromTier).toBe(5);
    expect(getFaction('hollow').ascension.artTier).toBe(5);
    expect(getFaction('shinigami').genderLookFromTier).toBe(1);
    expect(usesFemaleLook('female', 3, 5)).toBe(false); // 4단계 = 남녀 같음
    expect(usesFemaleLook('female', 4, 5)).toBe(true);
    expect(usesFemaleLook('male', 4, 5)).toBe(false);
    expect(usesFemaleLook('female', 0, 1)).toBe(true);
    expect(usesFemaleLook('female', 4, undefined)).toBe(false);
  });
  it('설정 검사: 1 이상 정수만', () => {
    const base = JSON.parse(read('src/data/factions/hollow.json'));
    expect(() => parseFactionConfig({ ...base, genderLookFromTier: 0 })).toThrow(/genderLookFromTier/);
    expect(() => parseFactionConfig({ ...base, genderLookFromTier: 2.5 })).toThrow(/genderLookFromTier/);
    expect(parseFactionConfig({ ...base, genderLookFromTier: undefined }).genderLookFromTier).toBeUndefined();
  });
  it('코드에 종족 분기 없음', () => {
    for (const p of ['src/engine/gender.ts', 'src/data/art/manifest.ts', 'src/ui/settingsView.ts']) expect(read(p)).not.toMatch(/=== '(hollow|shinigami)'/);
  });
  it('안내 문구는 종족 설정의 단계 이름으로', () => {
    expect(genderLookNote(getFaction('hollow').tierNames, 5, getFaction('hollow').ascension)).toBe('아란칼화를 깬 뒤부터 모습이 달라진다.');
    expect(genderLookNote(getFaction('shinigami').tierNames, 1)).toMatch(/^처음부터/);
  });
});

describe('그림 연결 (114장 3): 여성 키 -f 가 있으면 그걸, 없으면 지금 그림', () => {
  const files = ['char-hollow-5.png', 'char-hollow-5-f.png', 'char-hollow-4.png', 'skin-arrwatera.png', 'skin-arrwaterb-f.png'];
  it('진화체 그림: 5단계 여성 = -f, 4단계는 남녀 같음, 남성은 늘 지금 그림', () => {
    expect(charArt('hollow', 4, 'char.hollow', '/', {}, files, null, {}, 'female').src).toBe('/art/char-hollow-5-f.png');
    expect(charArt('hollow', 4, 'char.hollow', '/', {}, files, null, {}, 'male').src).toBe('/art/char-hollow-5.png');
    expect(charArt('hollow', 3, 'char.hollow', '/', {}, ['char-hollow-4.png', 'char-hollow-4-f.png'], null, {}, 'female').src).toBe('/art/char-hollow-4.png');
  });
  it('스킨: 여성 그림이 없으면 같은 스킨의 지금 그림, 스킨 그림도 없으면 진화체 그림', () => {
    expect(charArt('hollow', 4, 'char.hollow', '/', {}, files, 'arrwatera', {}, 'female').src).toBe('/art/skin-arrwatera.png');
    expect(charArt('hollow', 4, 'char.hollow', '/', {}, files, 'arrwaterb', {}, 'female').src).toBe('/art/skin-arrwaterb-f.png');
    expect(charArt('hollow', 4, 'char.hollow', '/', {}, files, 'arrfirea', {}, 'female').src).toBe('/art/char-hollow-5-f.png');
  });
  it('기본값은 지금 열린 슬롯의 성별', () => {
    setActiveGender('female');
    expect(charArt('hollow', 4, 'char.hollow', '/', {}, files).src).toBe('/art/char-hollow-5-f.png');
  });
  it('지금 빌드: 한 장 여성 그림(-f 파일)은 없고, 여성 외형은 종이인형 -f (C.189, GDD 115장) — 호로 아란칼 전은 남녀 같다', () => {
    expect(ART_FILES.some((f) => /-f\.(png|webp)$|-f\//.test(f))).toBe(false);
    const art = (fid: string, t: number, g: 'male' | 'female') => charArt(fid, t, getFaction(fid).room?.characterArt ?? '', '/', undefined, ART_FILES, null, undefined, g);
    expect(art('hollow', 0, 'female')).toEqual(art('hollow', 0, 'male'));
    expect(art('hollow', 3, 'female')).toEqual(art('hollow', 3, 'male'));
    for (const [fid, t, look] of [['hollow', 4, 'arrancar-base'], ['shinigami', 0, 'shinigami-student'], ['shinigami', 1, 'shinigami-student'], ['shinigami', 2, 'shinigami-base']] as const) {
      expect(art(fid, t, 'male').rig?.look, `${fid}${t}`).toBe(look);
      expect(art(fid, t, 'female').rig?.look, `${fid}${t}`).toBe(`${look}-f`);
      expect(art(fid, t, 'female').src).toBe(`/art/rig/humanoid/still/${look}-f.png`);
    }
  });
});

describe('세이브 (114장 4, 61장: 마이그레이션 없음)', () => {
  it('형식·문턱 52, 새 세이브 남성, 저장·불러오기로 남고 깨진 값은 남성', () => {
    expect([SAVE_FORMAT_VERSION, MIN_LOADABLE_SAVE_FORMAT]).toEqual([61, 54]); // C.226 · C.225 · C.220 · C.223 · C.213 · C.198: 문턱 54 고정(123장 6) // C.195
    const s = newSaveData('hollow');
    expect(s.gender).toBe('male');
    s.gender = 'female';
    expect(migrateSave(JSON.parse(JSON.stringify(s)))!.gender).toBe('female');
    expect(migrateSave({ ...JSON.parse(JSON.stringify(s)), gender: 'x' })!.gender).toBe('male');
  });
  it('런 로그 원정 기록에 성별', () => {
    expect(read('src/engine/runLog.ts')).toContain('gender?: Gender;');
    expect(read('src/game.ts')).toContain('log.runs.push({ ...buildRunRecord(exp), gender: save.gender });');
  });
});

describe('설정 화면 · 테스트 패널', () => {
  it('성별 줄은 이 캐릭터 칸 (C.239 GDD 159장 13: 늘 바꿀 수 있다), 체크 자리 고정', () => {
    const v = read('src/ui/settingsView.ts');
    expect(v).toContain("genderRow.dataset.set = 'gender';");
    expect(v).toContain("panel('이 캐릭터 · 성별'");
    expect(v).toContain('b.replaceChildren(icon(\'i-check\'), label(v));');
    expect(read('src/ui/bha/screens-lcd.css')).toContain('.bha-settings__choices .bha-btn[aria-pressed="false"] .bha-icon { visibility: hidden; }');
    expect(read('src/ui/app.ts')).toContain('setActiveGender(save?.gender);');
  });
  it('테스트 패널 진화체 이름은 shownName (밑줄 없음)', () => {
    expect(shownName('아란칼_노멀_조')).toBe('아란칼 노멀 조');
    const t = read('src/ui/testModePanel.ts');
    expect(t).not.toMatch(/[^(]formName\(form, fid\)/);
    expect(t).toContain('shownName(formName(form, fid))');
  });
});
