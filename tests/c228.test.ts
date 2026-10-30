// C.228 (GDD 153장 1 월드맵 쪽·3): 온천 = 월드맵 장소 · 월드맵 이동 = 출발하자마자 페이드
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FACTIONS } from '../src/data/factions';
import { RECOVER_SCENES } from '../src/data/help';
import { worldMapOf, WORLD_PLACES } from '../src/engine/faction';
import { departFoot, standFoot, WORLD_DEPART_MS, WORLD_FADE_DELAY_MS, WORLD_FADE_MS, WORLD_MOVE_MS } from '../src/ui/worldMapView';

const read = (p: string) => readFileSync(p, 'utf8');
const app = read('src/ui/app.ts');
const wm = read('src/ui/worldMapView.ts');

describe('153장 1 온천 = 월드맵 장소', () => {
  it('장소 목록 끝에 온천, 이름 = 종족 설정 worldmap.spaName, 다른 장소와 겹치지 않는 자리', () => {
    expect(WORLD_PLACES.at(-1)).toBe('spa');
    for (const f of FACTIONS) {
      const w = worldMapOf(f);
      expect(w.places.spa).toBe(f.worldmap?.spaName);
      for (const p of WORLD_PLACES) if (p !== 'spa') expect(Math.hypot(w.layout.spa.x - w.layout[p].x, w.layout.spa.y - w.layout[p].y), `${f.id} spa–${p}`).toBeGreaterThan(20);
    }
  });
  it('그림 키 자리 place.spa.<종족> (비어 있음 = 아이콘)', () => {
    const m = read('src/data/art/manifest.ts');
    for (const f of FACTIONS) expect(m).toContain(`'place.spa.${f.id}': {}`);
  });
  it('월드맵 → 온천 화면, [돌아가기] = 월드맵, 첫 모험 강제 중 잠김', () => {
    expect(wm).toContain('spa: hd.onSpa };');
    expect(app).toContain("onSpa: () => { openSpa(faction, s); if (nav.top?.id === 'spa') worldAt = 'spa'; },");
    expect(app).toContain("const backLabel = nav.top?.id === 'worldmap' ? '월드맵으로 돌아가기' : undefined;");
    expect(app).toContain("locked: forceAdventure ? ['home', 'market', 'training', 'tower', 'spa'] : undefined,");
  });
  it('온천 이름은 시장 설정이 아니라 월드맵 장소 이름에서 (시장 칸이 빠져도 동작)', () => {
    expect(app).not.toContain('marketOf(faction).props.spa');
    expect(read('src/ui/spaView.ts')).not.toContain('marketOf');
    expect(read('src/ui/bha/statusInfo.ts')).not.toContain('props.spa');
  });
  it('튜토리얼 회복 안내 온천 길 = 밖으로 → 월드맵 온천 → 쉬는 중 (시장 단계 없음)', () => {
    const sc = RECOVER_SCENES.find((s) => s.id === 'to-spa')!;
    expect(sc.stages!.map((s) => s.targets.at(-1))).toEqual(['@.bha-prop--outside', '@.bha-worldmap [data-place="spa"]', '@.bha-spa__actor']);
    expect(JSON.stringify(sc)).not.toContain('bha-market');
    expect(JSON.stringify(sc)).not.toContain('marketName');
    expect(app).toContain(`const spaWay = '.bha-prop--outside, .bha-worldmap [data-place="spa"]';`); // C.235: 길 문구 spaPath 대신 단계 문구 (GDD 157장 4)
    expect(sc.stages!.map((x) => x.body)).toEqual([sc.body, '{spaName}(으)로 가 보자.', '체력이 차오른다.']);
  });
});

describe('153장 3 월드맵 이동 = 한두 걸음 출발 + 바로 페이드', () => {
  it('출발 약 0.4초, 페이드는 출발 직후 시작, 끝까지 걷지 않는다', () => {
    expect(WORLD_DEPART_MS).toBe(400);
    expect(WORLD_FADE_DELAY_MS).toBeLessThan(WORLD_DEPART_MS / 2);
    expect(WORLD_MOVE_MS).toBe(Math.max(WORLD_DEPART_MS, WORLD_FADE_DELAY_MS + WORLD_FADE_MS));
    for (const f of FACTIONS) {
      const L = worldMapOf(f).layout;
      for (const p of WORLD_PLACES) {
        const a = standFoot(L.home), b = standFoot(L[p]);
        const d = departFoot(a, b);
        expect(Math.hypot(d.x - a.x, d.y - a.y)).toBeLessThanOrEqual(6 + 1e-9);
      }
    }
    expect(wm).not.toContain('worldWalkMs');
  });
  it('페이드 중 장면 이동 알림(beginSceneMove) 유지 — 페이드인 끝에 endMove', () => {
    expect(wm).toContain('endMove = beginSceneMove();');
    expect(wm).toContain('if (t >= WORLD_MOVE_MS) return arrive(p);');
  });
});
