// C.238 (GDD 160장): 그림 크기·시장 그림·방 짚인형·상태 화면 상태이상 위로·노력치 글자·능력치 설명은 ⓘ
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { artUrls } from '../src/data/art/manifest';
import { ROOM_PROPS, roomOf, worldMapOf } from '../src/engine/faction';
import { FACTIONS } from '../src/data/factions';
import { HOME_INTRO } from '../src/data/help';
import { actionFor } from '../src/ui/shortcutMap';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('160장 1~3 그림 크기·시장 그림', () => {
  it('월드맵 물건 ×1.5 · 장비 상점 ×1.2 (그림 배율), 다른 물건은 1', () => {
    expect(artUrls('prop.outside').scale).toBe(1.5);
    expect(artUrls('prop.gearShop').scale).toBe(1.2);
    for (const k of ['prop.altar', 'prop.book', 'prop.chest', 'prop.shop', 'prop.smith', 'prop.market']) expect(artUrls(k).scale).toBe(1);
  });
  it('물건 단추 크기 = 배치 배율 × 그림 배율 (방·시장 같은 propButton)', () => {
    const room = read('src/ui/bha/room.ts');
    expect(room).toContain("const s = (o.scale ?? 1) * artUrls(`prop.${o.prop}`, BASE).scale;");
    expect(read('src/ui/marketView.ts')).toContain("propButton({ prop: 'outside'");
  });
  it("월드맵 '시장' 장소 = 소모품 상점 수레 그림, 시장 안 소모품 상점 칸은 그대로", () => {
    expect(artUrls('prop.market').src).toBe('/art/prop-shop.webp');
    expect(artUrls('prop.shop').src).toBe('/art/prop-shop.webp');
  });
});

describe('160장 4 방 짚인형 되살림', () => {
  it('방 물건에 수련장(altar)이 다시 서고, 월드맵 수련장 장소도 그대로', () => {
    const rv = read('src/ui/roomView.ts');
    expect(rv).toContain("const order: RoomProp[] = ['book', 'altar', 'outside', 'chest'];");
    expect(rv).toContain('altar: hd.onAltar,');
    expect(rv).not.toContain("if (p === 'altar') continue;");
    expect([...ROOM_PROPS]).toContain('altar');
    for (const f of FACTIONS) {
      expect(roomOf(f).layout.altar).toBeDefined();
      expect(worldMapOf(f).places.training).toBe(roomOf(f).props.altar);
    }
  });
  it('단축키 T·홈 안내 카드도 원래대로', () => {
    expect(actionFor('room', 'KeyT')).toBe('altar');
    expect(HOME_INTRO.items.map((x) => x.id)).toContain('altar');
  });
  it('방에서 열면 뒤로 = 방(스택), 사망 막힘·빈사 확인 같게, 첫 모험 강제 중엔 흐린 잠김(월드맵 물건만)', () => {
    const app = read('src/ui/app.ts');
    expect(app).toContain("onAltar: () => (careBlocked(s) ? undefined : askDying(s, () => open('training', () => renderTraining(faction, s)))),");
    expect(read('src/ui/bha/worldmap.css')).toContain('.bha-room.is-force-out .bha-prop:not(.bha-prop--outside)');
  });
  it('월드맵 수련장 그림이 비면 짚인형 그림', () => {
    const wm = read('src/ui/worldMapView.ts');
    expect(wm).toContain("const PLACE_ART_FALLBACK: Partial<Record<WorldPlace, string>> = { training: 'prop.altar' };");
    expect(wm).not.toMatch(/'hollow'|'shinigami'/);
    for (const f of FACTIONS) expect(artUrls(`place.training.${f.id}`).src).toBeNull();
    expect(artUrls('prop.altar').src).not.toBeNull();
  });
});

describe('160장 5~7 상태 화면', () => {
  const lcd = read('src/ui/lcdScreens.ts');
  it('상태이상 칸이 능력치 칸 위, 없으면 숨김', () => {
    expect(lcd).toContain('[weakSlot, stats, evoPanel,');
    expect(lcd).toContain('weakSlot.hidden = states.length === 0;');
  });
  it('노력치 = .bha-ev (굵게·한 단계 크게, 기존 토큰만)', () => {
    const css = read('src/ui/bha/components/components.css');
    expect(css).toContain('.bha-ev { font-size: var(--bha-fs-lg); font-weight: var(--bha-fw-heavy);');
    const nest = read('src/ui/bha/nest.ts');
    expect(nest).toContain('if (extra) row.append(evText(extra));');
    for (const p of ['src/ui/lcdScreens.ts', 'src/ui/trainingView.ts', 'src/ui/rebirthView.ts']) expect(read(p)).toContain('evText(');
  });
  it('능력치 줄 누름 펼침 없음 → 능력치 ⓘ 창에 능력치별 설명(치명 포함)', () => {
    const nest = read('src/ui/bha/nest.ts');
    expect(nest).not.toContain('is-tip');
    expect(nest).not.toContain('bha-statrow__tip');
    expect(read('src/ui/bha/components/components.css')).not.toContain('.bha-statrow__tip');
    expect(lcd).toContain("statRow('평타 치명', pctText(cc.basic));");
    expect(lcd).toContain('평타 치명 = 평타가 치명타로 터질 확률');
    expect(lcd).toContain('블록 치명 = 블록 공격이 치명타로 터질 확률');
    expect(lcd).toContain('치명타 피해 = 치명타가 터지면 피해');
    expect(lcd).toContain("{ title: '하는 일', lines: statUseLines(faction) }");
  });
});
