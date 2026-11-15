// C.328 (GDD 198장): 레스렉시온·참백도·만해 이름과 언령 · 사신 한정 해제 · 적·보스 이름과 등급
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FORM_TABLE, formHasUniqueRelease, formName, formRelease, formReleaseCutin, getForm, validateFormTable } from '../src/data/evolution';
import { FORM_RELEASES } from '../src/data/evolution/releases';
import { BOSSES, bossName } from '../src/data/bosses';
import { ENEMIES, ENEMY_GRADES, enemyGradeName } from '../src/data/enemies';
import { getFaction } from '../src/data/factions';
import { parseFactionConfig } from '../src/engine/faction';
import { formDisplayName, hasUniqueLiberation, newEvolution } from '../src/engine/evolution/evolution';
import { ascensionUnlockText, battleLabels, liberationLabels } from '../src/ui/labels';

const tier4 = FORM_TABLE.filter((f) => f.tier === 4);

describe('198장 해방 이름 데이터', () => {
  it('4단계 28종 모두 호로(이름·언령)·사신(참백도 이름) 이름이 있고, 1~3단계에는 없다', () => {
    expect(tier4).toHaveLength(28);
    for (const f of tier4) {
      const h = formRelease(f, 'hollow');
      const s = formRelease(f, 'shinigami');
      expect(h?.name && h.command, f.id).toBeTruthy();
      expect(s?.name, f.id).toBeTruthy();
    }
    for (const f of FORM_TABLE.filter((x) => x.tier < 4)) expect(f.release, f.id).toBeUndefined();
    expect(validateFormTable(FORM_TABLE)).toEqual([]);
    expect(Object.keys(FORM_RELEASES)).toHaveLength(28);
  });

  it('표본: 기획서 198장 표 글자 그대로', () => {
    expect(formRelease(getForm('t4:normal:physical'), 'hollow')).toEqual({ name: '마르티요', command: '내리찍어라' });
    expect(formRelease(getForm('h4:void'), 'hollow')).toEqual({ name: '나다', command: '적멸위락' });
    expect(formRelease(getForm('t4:normal:physical'), 'shinigami')).toEqual({ name: '백련', command: '담금질하라', final: '천단백련' });
    expect(formRelease(getForm('h4:awakened'), 'shinigami')).toEqual({ name: '환혼', command: '다시 일어서라', final: '구사환혼' });
    // 사신 둔도 = 만해 없음, 사신 폭주(호로화)형 = 언령 없음
    expect(formRelease(getForm('h4:fail'), 'shinigami')).toEqual({ name: '둔도', command: '그래도 휘둘러라' });
    expect(formRelease(getForm('h4:frenzy'), 'shinigami')).toEqual({ name: '흑귀', final: '대흑귀나찰' });
    // 호로 폭주형은 언령 있음
    expect(formRelease(getForm('h4:frenzy'), 'hollow')).toEqual({ name: '프레네시', command: '날뛰어라' });
  });

  it('원작 제외 목록(docs/reference/bleach-original-names.json)의 이름·언령과 겹치지 않는다', () => {
    const ref = JSON.parse(readFileSync('docs/reference/bleach-original-names.json', 'utf8'));
    const banned = new Set<string>();
    for (const r of [...ref.resurreccion, ...ref.shikai]) {
      banned.add(r.name);
      for (const a of r.aliases ?? []) banned.add(a);
      for (const c of String(r.command ?? '').split(' / ')) if (c) banned.add(c);
    }
    for (const x of [...ref.bankai_memory.list, ...ref.hollows_memory.list]) banned.add(x);
    const ours: string[] = [];
    for (const f of tier4) for (const r of Object.values(f.release ?? {})) ours.push(r.name, ...(r.command ? [r.command] : []), ...(r.final ? [r.final] : []));
    for (const e of ENEMIES) ours.push(e.name['*']!);
    for (const b of BOSSES) ours.push(b.name['*']!);
    for (const n of ours) expect(banned.has(n), n).toBe(false);
  });
});

describe('198장 쓰는 곳', () => {
  const ascended = (formId: string) => {
    const e = newEvolution(1);
    e.tierIndex = 3;
    e.formId = formId;
    e.ascended = true;
    return e;
  };

  it('220장 3: 4단계 진화체 이름 = 레스렉시온 이름(호로) / 참백도 이름(사신) — 아란칼화 전후 같다 (종족 설정 liberation.formNameKey)', () => {
    const e = ascended('t4:fire:special');
    e.ascended = false;
    expect(formDisplayName(e, 'hollow')).toBe('루시에르나가');
    e.ascended = true;
    expect(formDisplayName(e, 'hollow')).toBe('루시에르나가');
    expect(formName(getForm('t4:fire:special'), 'hollow', [], true)).toBe('루시에르나가');
    // 사신 = 참백도 이름 (releases.json shinigami.name)
    expect(formDisplayName(e, 'shinigami')).toBe(formName(getForm('t4:fire:special'), 'shinigami'));
    expect(getFaction('shinigami').ascension.formNameKey).toBeUndefined();
    expect(getFaction('shinigami').liberation.formNameKey).toBe('name');
  });

  it('해방 컷인: 호로 = 언령, 이름 — 레스렉시온! / 사신 = 만해 — 만해 이름! (깨기 전은 기본 해방)', () => {
    const f = getForm('t4:normal:physical');
    expect(formReleaseCutin(f, 'hollow')).toBe('내리찍어라, 마르티요!');
    expect(formReleaseCutin(f, 'shinigami')).toBe('만해 — 천단백련!');
    expect(liberationLabels(getFaction('hollow'), true, formReleaseCutin(f, 'hollow')).cutin).toBe('내리찍어라, 마르티요!');
    expect(battleLabels(getFaction('shinigami'), 3, true, formReleaseCutin(f, 'shinigami')).liberation).toMatchObject({ name: '만해', cutin: '만해 — 천단백련!' });
    expect(liberationLabels(getFaction('shinigami'), false).cutin).toBe('한정 해제!'); // GDD 245장 6: 컷인은 해방 이름만
    // 진화체를 모르면 종족 기본 컷인
    expect(liberationLabels(getFaction('hollow'), true).cutin).toBe(getFaction('hollow').liberation.cutin);
    // 둔도는 만해 이름이 없어 컷인 틀을 못 채운다
    expect(formReleaseCutin(getForm('h4:fail'), 'shinigami')).toBeNull();
  });

  it('사신 둔도 = 만해 없음: 구상화를 깨도 고유 해방이 없다(한정 해제 그대로). 호로 실패형은 레스렉시온 있음', () => {
    expect(formHasUniqueRelease(getForm('h4:fail'), 'shinigami')).toBe(false);
    expect(hasUniqueLiberation(ascended('h4:fail'), 'shinigami')).toBe(false);
    expect(hasUniqueLiberation(ascended('h4:fail'), 'hollow')).toBe(true);
    expect(hasUniqueLiberation(ascended('t4:water:mixed'), 'shinigami')).toBe(true);
    expect(ascensionUnlockText(getFaction('shinigami'), 'h4:fail')).toBe('만해는 없다. 해방은 한정 해제 그대로다.');
    expect(ascensionUnlockText(getFaction('shinigami'), 't4:water:mixed')).toBe("만해 '백랑파천'을 쓸 수 있다.");
    expect(ascensionUnlockText(getFaction('hollow'), 't4:water:mixed')).toBe("레스렉시온 '바라쿠다'를 쓸 수 있다.");
  });

  it('종족 설정 검증: formKey·formNameKey 는 name | final', () => {
    const h = getFaction('hollow');
    expect(() => parseFactionConfig({ ...h, liberation: { ...h.liberation, formKey: 'command' } })).toThrow(/liberation.formKey/);
    expect(() => parseFactionConfig({ ...h, ascension: { ...h.ascension, formNameKey: 'x' } })).toThrow(/ascension.formNameKey/);
    expect(() => parseFactionConfig({ ...h, liberation: { ...h.liberation, formNameKey: 'command' } })).toThrow(/liberation.formNameKey/);
  });
});

describe('198장 적·보스 이름과 등급', () => {
  it('보스 4종: 두 종족 같은 이름, 모두 바스트로데', () => {
    expect(BOSSES.map((b) => [bossName(b.id, 'hollow'), bossName(b.id, 'shinigami')])).toEqual([['아레나 보라스', '아레나 보라스'], ['엠버 스론', '엠버 스론'], ['썬더우드', '썬더우드']]);
    for (const b of BOSSES) expect(enemyGradeName(b.enemy), b.id).toBe('바스트로데');
    for (const f of ['hollow', 'shinigami']) expect(getFaction(f).tower?.finalBossName).toBe('코로나도');
  });

  it('등급 표: 호로·길리안·아쥬커스·바스트로데, 길리안부터 메노스 그랑데', () => {
    expect(ENEMY_GRADES.order.map((g) => ENEMY_GRADES.names[g])).toEqual(['호로', '길리안', '아쥬커스', '바스트로데']);
    expect(ENEMY_GRADES.menosName).toBe('메노스 그랑데');
    expect(ENEMY_GRADES.menos).toEqual(['gillian', 'adjuchas', 'vasto-lorde']);
  });
});
