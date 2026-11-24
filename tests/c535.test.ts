/** C.535 (GDD 8-7 v6.195 '진화체 고유 능력 설명 표기', 사용자 2026-11-24 "이 진화 고유능력 설명을 아래 진화체정보에 써야지. 그리고 괄호같이 막 능력치 몇찍어야하는지 쓰지마. 다른애들도 전부.")
 *  1. 상태 화면 고유 능력·특수 블록·해방 줄 = 진화 정보 칸(진화체 이름·단계·속성 줄 아래) — 특성 칸 쪽에서 뺐다
 *  2. 모든 진화체 설명에 능력치 투자 안내 괄호('키울수록'·'다 키우면'·'간격 0.6초에 최대') 없음
 *  3. 숫자는 하나: 내 몸(invest 있음) = 지금 값, 도감 등(invest 없음) = 기본값. 비례 동작(effort·blockLv)은 그대로 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import raw from '../src/data/evolution/uniques.json';
import { evoFormEntry, evoGrowSourcesOf, evoInvestOf, evoText, fillEvoText } from '../src/data/evolution/uniques';
import { evoUniqueLines } from '../src/ui/evolutionPanel';
import { PATCH_LABEL } from '../src/version';

const FORMS = (raw as { forms: Record<string, Record<string, unknown>> }).forms;
const all = (): [string, string][] => Object.entries(FORMS).flatMap(([id, by]) => Object.keys(by).map((fac) => [id, fac] as [string, string]));
const GUIDE = /키울수록|다 키우면|에 최대|노력치를|투자/;

describe('C.535 진화체 고유 능력 설명 — 괄호 없음·진화 정보 칸', () => {
  it('모든 진화체 × 종족 설명 틀(고유 능력·특수 블록·꺼짐 안내·해방)에 투자 안내 괄호가 없다', () => {
    let n = 0;
    for (const [id, fac] of all()) {
      const a = evoFormEntry(id, fac)?.ability;
      if (!a) continue;
      const tpl = [evoText(a.description, fac), evoText(a.releaseDescription, fac), ...Object.values(a.specials ?? {}).flatMap((sp) => [evoText(sp.description, fac), evoText(sp.offNote, fac)])];
      for (const t of tpl) expect(t, `${id}/${fac}`).not.toMatch(GUIDE);
      expect(tpl.join(' '), `${id}/${fac}`).not.toContain('{intervalFull}');
      n++;
    }
    expect(n).toBeGreaterThan(30);
    expect(JSON.stringify(raw)).not.toMatch(/키울수록|다 키우면/);
  });
  it('화면 줄(기본값·다 키운 값 둘 다)에도 안내 괄호가 없고 {키}가 다 채워진다', () => {
    for (const [id, fac] of all()) {
      for (const inv of [undefined, { effort: 0.5, blockLv: 0.5 }, { effort: 1, blockLv: 1 }]) {
        for (const l of evoUniqueLines(id, fac, '해방', inv)) {
          expect(l.text, `${id}/${fac} ${l.label}`).not.toMatch(GUIDE);
          expect(l.text, `${id}/${fac} ${l.label}`).not.toMatch(/\{[A-Za-z0-9_@]+[%#]?\}/);
        }
      }
    }
  });
  it('숫자 하나 = 지금 값: 마르티요 찢김 1당 기본 +1% → 절반 +45% → 다 키움 +89%', () => {
    const t = (inv?: { effort: number; blockLv: number }) => evoUniqueLines('t4:normal:physical', 'hollow', '레스렉시온', inv)[0]!.text;
    expect(t()).toContain('찢김 1당 그 적이 받는 일반 공격 피해 +1%. 블록을 쓰면'); // 도감처럼 내 몸이 아닌 곳 = 기본값
    expect(t({ effort: 0.5, blockLv: 0 })).toContain('피해 +45%.');
    expect(t({ effort: 1, blockLv: 0 })).toContain('피해 +89%.');
    expect(t({ effort: 0, blockLv: 1 })).toContain('피해 +1%.'); // effort 기준 몸 — blockLv 는 안 센다
  });
  it('기울기 출처: 데이터의 grow·secondsGrow per 그대로 (effort·blockLv, 둘 다면 곱)', () => {
    const a = (id: string, fac: string) => evoFormEntry(id, fac)!.ability;
    expect(evoGrowSourcesOf(a('t4:normal:physical', 'hollow')).perStackGrow).toEqual(['effort']);
    expect(evoGrowSourcesOf(a('t4:earth:physical', 'shinigami')).perShieldGrow).toEqual(['blockLv']);
    expect(evoGrowSourcesOf(a('t4:fire:physical', 'shinigami')).fireGrow).toEqual(['effort', 'blockLv']);
    expect(evoInvestOf(a('t4:fire:physical', 'shinigami'), { effort: 0.5, blockLv: 0.4 })('fireGrow')).toBeCloseTo(0.2);
    expect(evoInvestOf(a('t4:fire:physical', 'shinigami'), { effort: 1, blockLv: 1 })('nope')).toBe(0);
  });
  it('{키#} = 반올림 정수 (노도 연격 횟수 — 엔진 Math.round 와 같음)', () => {
    expect(fillEvoText('{h@g#}회', { h: 2, g: 2 }, () => 0.3)).toBe('3회'); // 2 × 1.6 = 3.2
    expect(fillEvoText('{h@g#}회', { h: 2, g: 2 })).toBe('2회');
  });
  it('상태 화면: 고유 능력 문단은 진화 정보 칸(evoPanel)에, 진화체 이름·단계·속성 줄 다음 — 능력치·특성 칸(stats)에는 없다', () => {
    const src = readFileSync('src/ui/lcdScreens.ts', 'utf8');
    expect(src).not.toMatch(/stats\.append\(uniq\)/);
    const iForm = src.indexOf('evoPanel.append(...cols.left.slice(0, 1));');
    const iUniq = src.indexOf('if (uniq) evoPanel.append(uniq);');
    expect(iForm).toBeGreaterThan(0);
    expect(iUniq).toBeGreaterThan(iForm);
    expect(src).toMatch(/evoUniqueParagraph\(evo, faction, 'bha-faint', evoInvestNowOf\(save, faction\.id\)\)/); // 내 몸 = 지금 값
  });
  it('패치 C.535', () => {
    expect(Number(PATCH_LABEL.slice(2))).toBeGreaterThanOrEqual(535);
  });
});
