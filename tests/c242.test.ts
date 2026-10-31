// C.242 (GDD 165장): 방 수련장 삭제 · 능력치 ⓘ 설명 = 능력치마다 한 줄
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { statInfoLines } from '../src/data/help/statText';
import { FACTIONS } from '../src/data/factions';
import { GLOSSARY } from '../src/data/help';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('165장 2 능력치 ⓘ 문구', () => {
  it('사신: 사용자 말투 그대로 11줄', () => {
    const sh = FACTIONS.find((f) => f.id === 'shinigami')!;
    expect(statInfoLines(sh, { basic: '50%', block: '50%' })).toEqual([
      '체력 = 최대 체력',
      '힘 = 일반 공격 피해 관련',
      '지능 = 블록 공격 피해 관련',
      '방어 = 받는 일반 공격 피해 관련',
      '정신력 = 받는 블록 공격 피해 관련',
      '속도 = 일반 공격 빠르기 관련',
      '평타 치명 = 일반 공격이 치명타로 터질 확률 (최대 50%)',
      '블록 치명 = 블록 공격이 치명타로 터질 확률 (최대 50%)',
      '치명타 피해 = 치명타가 터지면 들어가는 피해 배율',
      '속성 피해 = 그 속성 공격 피해 관련',
      '값 옆 굵은 +숫자 = 노력치',
    ]);
  });
  it('두 종족 모두 이상한 말 없음 (기본 n%·맞선다·괄호 부연·머리 줄)', () => {
    for (const f of FACTIONS) {
      const t = statInfoLines(f, { basic: '50%', block: '50%' }).join('\n');
      expect(t).not.toMatch(/기본 \d|맞선다|따라간다|콤보|기본 공격 블록/);
      expect(t.split('\n')).toHaveLength(11);
    }
  });
  it('상태 화면 ⓘ = statInfoLines 목록 하나(머리 줄 없음), 종족 분기 없음', () => {
    const lcd = read('src/ui/lcdScreens.ts');
    expect(lcd).toContain("infoTip('능력치', () => statInfoLines(faction, { basic: pctText(cc.basicMax), block: pctText(cc.blockMax) }))");
    expect(read('src/data/help/statText.ts')).not.toMatch(/'hollow'|'shinigami'/);
  });
  it('도움말 능력치도 같은 문구', () => {
    const t = GLOSSARY.find((x) => x.id === 'stats')!.body;
    for (const s of ['**{stat.hp}**: 최대 체력', '일반 공격 피해 관련', '블록 공격 피해 관련', '받는 일반 공격 피해 관련', '받는 블록 공격 피해 관련', '일반 공격 빠르기 관련', '값 옆 굵은 +숫자 = 노력치'])
      expect(t).toContain(s);
    expect(t).not.toContain('확률 기본');
  });
});

describe('165장 1 방 수련장 없음', () => {
  it('두 종족 방 화면은 altar 를 건너뛴다(종족 분기 없이 공통)', () => {
    const rv = read('src/ui/roomView.ts');
    expect(rv).toContain("if (p === 'altar') continue;");
    expect(rv).not.toMatch(/'hollow'|'shinigami'/);
  });
  it('월드맵 수련장 그림 폴백 = 짚인형 유지', () => {
    expect(read('src/ui/worldMapView.ts')).toContain("training: 'prop.altar'");
  });
});
