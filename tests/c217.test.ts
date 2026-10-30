// C.217 (GDD 139장 1): 탑 = 월드맵 장소. 모험 시작 화면 머리 탭에서 [탑] 삭제, 월드맵 홈 → 시장 → 모험 → 탑, 뒤로 = 월드맵, 잠김(사망·첫 모험 강제·해금 전)
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FACTIONS } from '../src/data/factions';
import { towerLabels, worldMapOf, WORLD_PLACES } from '../src/engine/faction';
import { standFoot } from '../src/ui/worldMapView';

const read = (p: string) => readFileSync(p, 'utf8');

describe('139장 1 탑 → 월드맵', () => {
  it('장소 순서 = 홈 → 시장 → 모험 → 탑, 탑 이름 = 종족 설정 towerLabels', () => {
    expect([...WORLD_PLACES]).toEqual(['home', 'market', 'adventure', 'tower', 'spa']); // 온천 = C.228 (GDD 153장 1)
    for (const f of FACTIONS) expect(worldMapOf(f).places.tower).toBe(towerLabels(f).name);
  });
  it('지도 위 탑 자리가 다른 장소와 겹치지 않는다 (발 기준 거리)', () => {
    for (const f of FACTIONS) {
      const L = worldMapOf(f).layout;
      for (const p of WORLD_PLACES) if (p !== 'tower') expect(Math.hypot(L.tower.x - L[p].x, L.tower.y - L[p].y), `${f.id} tower–${p}`).toBeGreaterThan(20);
      expect(standFoot(L.tower).y).toBeGreaterThan(30);
    }
  });
  it('그림 키 자리 place.tower.<종족> (비어 있음 = 아이콘)', () => {
    const m = read('src/data/art/manifest.ts');
    for (const f of FACTIONS) expect(m).toContain(`'place.tower.${f.id}': {}`);
    expect(read('src/ui/worldMapView.ts')).toContain('const placeArt = `place.${p}.${faction.id}`;');
  });
  it('모험 시작 화면 머리 탭 = 자유 원정·스토리 (탑 없음), 탑 화면은 탭 대신 제목', () => {
    const sv = read('src/ui/storyView.ts');
    expect(sv).toContain("export type DepartTab = 'free' | 'story';");
    expect(sv).not.toContain("label: '탑'");
    expect(read('src/ui/towerView.ts')).not.toContain('departTabs');
  });
  it('탑 화면은 월드맵 위에 쌓인다 (뒤로 = 월드맵), 사망이면 막힘', () => {
    const app = read('src/ui/app.ts');
    expect(app).toMatch(/function towerScreen[\s\S]{0,80}nav\.push\(\{\s*id: 'tower'/);
    expect(app).toContain("onTower: () => { if (careBlocked(s)) return; worldAt = 'tower'; towerScreen(faction); },");
    expect(read('src/ui/worldMapView.ts')).toContain("if ((p === 'adventure' || p === 'tower') && save.nest.dead)");
  });
  it('첫 모험 강제 중 탑 잠김, 해금 전이면 이유 한 줄과 함께 잠김', () => {
    const app = read('src/ui/app.ts');
    expect(app).toContain("locked: forceAdventure ? ['home', 'market', 'tower', 'spa'] : undefined,");
    expect(app).toContain('lockReasons: towerOpen(s.runLog, faction.id, s.tower.best) ? undefined : { tower: towerLabels(faction).locked },');
    expect(read('src/ui/worldMapView.ts')).toContain("b.setAttribute('aria-description', reason);");
  });
  it('홈 안내 [밖으로] 카드에 탑도 (이름은 종족 설정에서)', () => {
    expect(read('src/data/help/guides.json')).toContain('{adventureName}·{towerName}');
    expect(read('src/ui/app.ts')).toContain('towerName: wm.places.tower');
  });
  it('ui-audit: 탑 = 월드맵에서 들어가는 화면', () => {
    const s = read('scripts/ui-audit/screens.cjs');
    expect(s).toContain(`'.bha-worldmap [data-place="tower"]'`);
    expect(s).not.toContain('탑: { pick');
  });
});
