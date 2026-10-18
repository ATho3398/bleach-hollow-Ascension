import { describe, expect, it } from 'vitest';
import { cssRatio, nudgeValue, ratio, sliderPct } from '../src/ui/bha/util';
import { speciesStartText } from '../src/data/start';
import { FACTIONS } from '../src/data/factions';

describe('bha 헬퍼 순수 함수', () => {
  it('ratio 는 0~1 로 자른다', () => {
    expect(ratio(50, 100)).toBe(0.5);
    expect(ratio(150, 100)).toBe(1);
    expect(ratio(-5, 100)).toBe(0);
    expect(ratio(5, 0)).toBe(0);
    expect(ratio(NaN, 100)).toBe(0);
  });

  it('cssRatio 는 소수 3자리 문자열', () => {
    expect(cssRatio(1, 3)).toBe('0.333');
    expect(cssRatio(20, 100)).toBe('0.200');
  });

  it('sliderPct = (값-최소)/(최대-최소)', () => {
    expect(sliderPct(0.3, 0.15, 0.6)).toBe('0.333');
    expect(sliderPct(6, 6, 20)).toBe('0.000');
    expect(sliderPct(20, 6, 20)).toBe('1.000');
    expect(sliderPct(10, 6, 20)).toBe('0.286');
  });
});

describe('시작 화면 문구 데이터', () => {
  it('등록된 종족마다 설명과 엠블럼이 있다', () => {
    for (const f of FACTIONS) {
      const t = speciesStartText(f.id);
      expect(t.desc.length).toBeGreaterThan(0);
      expect(t.emblemIcon).toMatch(/^i-/);
    }
  });
  it('모르는 종족은 설명 없이 기본 엠블럼', () => {
    expect(speciesStartText('quincy')).toEqual({ emblemIcon: 'i-broken', desc: '' });
  });
});

describe('nudgeValue (설정 슬라이더 −/+ 버튼)', () => {
  it('한 칸씩 옮기고 부동소수 오차를 정리한다', () => {
    expect(nudgeValue(0.3, 1, 0.05, 0.1, 1)).toBe(0.35);
    expect(nudgeValue(0.35, -1, 0.05, 0.1, 1)).toBe(0.3);
    expect(nudgeValue(0.1, 1, 0.05, 0.1, 1)).toBe(0.15);
  });
  it('최소·최대에서 멈춘다', () => {
    expect(nudgeValue(0.1, -1, 0.05, 0.1, 1)).toBe(0.1);
    expect(nudgeValue(1, 1, 0.05, 0.1, 1)).toBe(1);
    expect(nudgeValue(10, -1, 1, 8, 40)).toBe(9);
  });
});
