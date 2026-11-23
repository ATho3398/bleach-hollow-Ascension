/** C.526 진화체 고유 능력 '다 키우면' 표기 = 배율(+8000%) 대신 다 키웠을 때의 실제 값.
 *  설명 틀 {키@기울기} = 키 × (1 + 기울기) — grow·secondsGrow 의 투자율(effort·blockLv)이 1일 때와 같다 */
import { describe, expect, it } from 'vitest';
import raw from '../src/data/evolution/uniques.json';
import { evoFormEntry, evoNumsOf, evoReleaseNums, evoText, fillEvoText } from '../src/data/evolution/uniques';
import { evoUniqueLines } from '../src/ui/evolutionPanel';
import { BALANCE_VERSION } from '../src/config/balance';
import { PATCH_LABEL } from '../src/version';

const FORMS = (raw as { forms: Record<string, Record<string, unknown>> }).forms;
const all = (): [string, string][] => Object.entries(FORMS).flatMap(([id, by]) => Object.keys(by).map((fac) => [id, fac] as [string, string]));
const lines = (id: string, fac: string) => evoUniqueLines(id, fac, '해방');
const text = (id: string, fac: string, label = '고유 능력') => lines(id, fac).find((l) => l.label === label)?.text ?? '';

describe('C.526 다 키우면 = 실제 값', () => {
  it('fillEvoText {키@기울기}: 키 × (1 + 기울기), % 는 기존 반올림', () => {
    expect(fillEvoText('+{a@g%}', { a: 0.01, g: 80 })).toBe('+81%');
    expect(fillEvoText('−{a@g}초', { a: 0.1, g: 4 })).toBe('−0.5초');
    expect(fillEvoText('{a@g%}', { a: 0.004, g: 28 })).toBe('11.6%');
    expect(fillEvoText('{a@nope%}', { a: 0.1 })).toBe('{a@nope%}'); // 없는 키는 그대로 남겨 검사가 잡는다
  });
  it('마르티요: 찢김 1당 +1%(… 다 키우면 +81%)', () => {
    const t = text('t4:normal:physical', 'hollow');
    expect(t).toContain('찢김 1당 그 적이 받는 일반 공격 피해 +1%(노력치를 키울수록 커짐 — 다 키우면 +81%)');
  });
  it('에스칼레라: 시간·피해 둘 다 실제 값 (해방도)', () => {
    expect(text('t4:normal:mixed', 'hollow')).toContain('2초 동안 일반 공격 피해 +체인 수×2%(노력치를 키울수록 커짐 — 다 키우면 8초 동안 체인 수×42%)');
    expect(text('t4:normal:mixed', 'hollow', '해방')).toBe('6초 동안 체인 수×7%(다 키우면 16초 동안 체인 수×84%)' /* C.527 해방 기울기: 다 키운 평소(8초·42%)의 2배 */);
  });
  it('비전: 간격 −0.1초, 1.5초 동안 → 다 키우면 4.5초 동안 −0.5초 (해방도)', () => {
    expect(text('t4:thunder:mixed', 'shinigami')).toContain('1.5초 동안 일반 공격 간격 −0.1초(노력치를 키울수록 커짐 — 다 키우면 4.5초 동안 −0.5초)');
    expect(text('t4:thunder:mixed', 'shinigami', '해방')).toContain('다 키우면 9초 동안 −0.75초' /* C.527 해방 기울기 */);
  });
  it('블록 비례 = 「블록을 키울수록」 · 둘 다 = 「노력치·이 속성 블록을 같이 키울수록」', () => {
    expect(text('t4:earth:physical', 'shinigami')).toContain('블록(흡수 특성·강화)을 키울수록 커짐 — 다 키우면 +10.5%');
    expect(text('t4:fire:physical', 'shinigami')).toContain('노력치·이 속성 블록을 같이 키울수록 커짐 — 다 키우면 +36%');
    expect(lines('t4:water:physical', 'shinigami').find((l) => l.label === '특수 블록')!.text).toContain('다 키우면 7회'); // C.528: hitsGrow 1.5 → 2.5 (옛 기대 5회)
  });
  it('모든 진화체 × 종족: {키} 다 채움 · 배율 표기(기울기 키 직접 노출) 없음 · 옛 문구·「평타」 없음', () => {
    for (const [id, fac] of all()) {
      const a = evoFormEntry(id, fac)?.ability;
      if (!a) continue;
      const n = evoNumsOf(id, fac);
      const tpl = [evoText(a.description, fac), evoText(a.releaseDescription, fac), ...Object.values(a.specials ?? {}).flatMap((sp) => [evoText(sp.description, fac), evoText(sp.offNote, fac)])].join(' ');
      expect(tpl, `${id}/${fac}`).not.toMatch(/\{[A-Za-z0-9_]*Grow%?\}/); // 기울기는 {키@기울기} 로만
      for (const l of lines(id, fac)) {
        expect(l.text, `${id}/${fac} ${l.label}`).not.toMatch(/\{[A-Za-z0-9_@]+%?\}/);
        expect(l.text, `${id}/${fac} ${l.label}`).not.toMatch(/평타|키운 만큼/);
      }
      // 해방 설명도 release 값 위에서 채워진다
      if (a.releaseDescription) expect(fillEvoText(evoText(a.releaseDescription, fac), evoReleaseNums(n))).not.toMatch(/\{/);
    }
  });
  it('기울기(grow)가 있는 몸은 설명에 「다 키우면」 실제 값이 있다', () => {
    for (const [id, fac] of all()) {
      const json = JSON.stringify(evoFormEntry(id, fac)?.ability ?? {});
      if (!/"grow"|"secondsGrow"/.test(json)) continue;
      expect(lines(id, fac).map((l) => l.text).join(' '), `${id}/${fac}`).toMatch(/다 키우면 (확률 )?[+−×]?\d/);
    }
  });
  it('패치 C.526 · 수치 그대로(BALANCE 161)', () => {
    expect(Number(PATCH_LABEL.slice(2))).toBeGreaterThanOrEqual(526); // C.527: 패치·BALANCE 올라감
    expect(BALANCE_VERSION).toBeGreaterThanOrEqual(161);
  });
});
