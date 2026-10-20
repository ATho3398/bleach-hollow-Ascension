// C.92 (GDD 40장): 탑 전투 배경 — 보통 층 = ★에 맞는 사냥터 배경, 보스 층 = arenaBg, 종족 설정에서 읽기
import { describe, expect, it } from 'vitest';
import { FACTIONS } from '../src/data/factions';
import { groundBgId, towerBgId } from '../src/engine/faction';
import { TOWER_FLOORS, towerFloor } from '../src/engine/tower';

describe('C.92 탑 전투 배경', () => {
  for (const f of Object.values(FACTIONS)) {
    it(`${f.id}: 보통·강적 층은 ★ 사냥터 배경`, () => {
      const sg = f.tower?.starGrounds ?? {};
      for (let n = 1; n <= TOWER_FLOORS; n++) {
        const fl = towerFloor(n);
        if (fl.kind === 'boss') continue;
        const want = groundBgId(f, sg[String(fl.star)]);
        expect(want, `${n}층 ★${fl.star}`).toBeTruthy();
        expect(towerBgId(f, fl)).toBe(want);
      }
    });
    it(`${f.id}: 보스 층은 arenaBg`, () => {
      const boss = Array.from({ length: TOWER_FLOORS }, (_, i) => towerFloor(i + 1)).filter((x) => x.kind === 'boss');
      expect(boss.length).toBeGreaterThan(0);
      for (const b of boss) expect(towerBgId(f, b)).toBe(f.arenaBg);
    });
  }
});
