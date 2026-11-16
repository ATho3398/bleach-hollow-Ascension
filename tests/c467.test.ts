import { describe, expect, it } from 'vitest';
import { ART_MANIFEST, GILLIAN_SCALE, HOLLOW_BRUTE_SCALE, HUMAN_FIELD_SCALE, HUMAN_SCALE, ONEARM_SCALE, SPIDER_SCALE, SPIKY_SCALE, SPEED_SCALE, WRAITH_SCALE, SERPENT_SCALE } from '../src/data/art/manifest';

// C.467 (GDD 17-6 v6.095, 사용자 2026-11-17 "인간형들은 호로보다 좀 작았으면 좋겠음 … 거미형이나 체력형이 제일 크고" · "홈화면도 줄여야지")
// 보이는 키 = 배율 × 서 있는 몸 키(도트) / 그림 칸(도트). 몸 키는 쉬는 자세 실측(작업본 시험 페이지, 2026-11-17)
const H = {
  human: HUMAN_FIELD_SCALE * 81 / 152,
  aizen: ART_MANIFEST['char.transcendent-aizen']!.fieldScale! * 110 / 128,
  mugetsu: ART_MANIFEST['char.transcendent-ichigo-mugetsu']!.fieldScale! * 108 / 144,
  bloodchain: ART_MANIFEST['char.transcendent-ichigo-bloodchain']!.fieldScale! * 107 / 144,
};
const HOLLOW = {
  brute: HOLLOW_BRUTE_SCALE * 58 / 152, gillian: GILLIAN_SCALE * 56 / 152, onearm: ONEARM_SCALE * 56 / 152, spiky: SPIKY_SCALE * 75 / 152,
  speed: SPEED_SCALE * 70 / 152, serpent: SERPENT_SCALE * 38 / 72, spider: SPIDER_SCALE * 82 / 120, wraith: WRAITH_SCALE * 79 / 120,
};

describe('C.467 사람형은 호로보다 작게, 거미형·체력형이 가장 크게', () => {
  it('배율 값', () => {
    expect([HUMAN_SCALE, HUMAN_FIELD_SCALE, ONEARM_SCALE, SPIDER_SCALE, GILLIAN_SCALE]).toEqual([1.3, 1.16, 2.6, 1.4, 2.4]);
    expect(ART_MANIFEST['char.shinigami']).toMatchObject({ scale: 1.3, fieldScale: 1.16 });
    expect(ART_MANIFEST['char.hollow.5']).toMatchObject({ scale: 1.3, fieldScale: 1.16 });
  });
  it('걷기·전투: 사람형(초월자 포함) 키 < 서 있는 호로(짐승형 네 발 빼고) 키', () => {
    const minHollow = Math.min(...Object.values(HOLLOW));
    for (const [k, v] of Object.entries(H)) expect(v, k).toBeLessThan(minHollow);
  });
  it('거미형·외팔형(체력형)이 가장 크다', () => {
    const rest = Object.entries(HOLLOW).filter(([k]) => k !== 'spider' && k !== 'onearm').map(([, v]) => v);
    expect(HOLLOW.spider).toBeGreaterThan(Math.max(...rest));
    expect(HOLLOW.onearm).toBeGreaterThan(Math.max(...rest));
  });
  it('방(홈)도 사람형 < 덩치', () => {
    expect(HUMAN_SCALE * 81 / 152).toBeLessThan(HOLLOW_BRUTE_SCALE * 58 / 152);
  });
});
