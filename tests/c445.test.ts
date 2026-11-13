// C.445: 아이젠 프라고르 1블록마다 감응도 −3 (3체인 −9, 사용자) · 경화수월 반격 창(발광) 중에 누르면 블록이 0.7초 공중에 떠 있던 버그.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';

describe('프라고르 −3', () => {
  it('수치 riskCost 3 (provisional)', () => {
    expect(BALANCE.provisional.transcendentKits.aizen!.blocks.fragor!.riskCost).toBe(3);
  });
});

describe('경화수월 블록 렉 (발광 중 사용)', () => {
  const view = readFileSync('src/ui/battleView.ts', 'utf8');
  const css = readFileSync('src/ui/bha/battle-scene.css', 'utf8');
  it('발광 클래스의 무한 애니메이션이 발동 연출(is-fire)을 덮는다 — 그래서 사라질 때 떼야 한다', () => {
    expect(css).toMatch(/\.bha-block\.bha-kitglow\s*\{[^}]*animation:\s*bha-kitglow[^}]*infinite/);
  });
  it('fireAway 가 bha-kitglow 를 떼고 is-fire 를 붙인다', () => {
    const i = view.indexOf('const fireAway = ');
    expect(i).toBeGreaterThan(0);
    const body = view.slice(i, view.indexOf('};', i));
    expect(body).toMatch(/classList\.remove\([^)]*'bha-kitglow'/);
    expect(body.indexOf("'bha-kitglow'")).toBeLessThan(body.indexOf("classList.add('is-fire')"));
  });
});
