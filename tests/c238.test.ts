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
    expect(room).toContain("const s = (o.scale ?? 1) * artUrls(key, BASE).scale;"); // C.255: key = o.artKey ?? prop.<물건>
    expect(read('src/ui/marketView.ts')).toContain("propButton({ prop: 'outside'");
  });
  // 2026-11-03 사용자 그림으로 바뀜: 월드맵 시장 = 상점 그림(prop-market.png), 수레 그림은 우라하라로 옮김
  it("월드맵 '시장' 장소 = prop-market 그림, 수레 그림 = 우라하라", () => {
    expect(artUrls('prop.market').src).toBe('/art/prop-market.png');
    expect(artUrls('prop.wanderer').src).toBe('/art/prop-wanderer.png'); // C.450: 수레 → 우라하라 도트
  });
});

describe('160장 4 → 165장 1 방 수련장 다시 삭제 (C.241), 월드맵 수련장 짚인형은 유지', () => {
  it('방 물건에 수련장(altar)이 없고, 월드맵 수련장 장소는 그대로', () => {
    const rv = read('src/ui/roomView.ts');
    // C.394 (GDD 241-C 3): 자리 바꿈 — 수련장(altar)이 다시 방 물건(옛 진급 시험 자리), 번호 쟁탈전·진급 시험(rank)이 월드맵 장소
    expect(rv).toContain("const order: RoomProp[] = ['book', 'outside', 'hogyoku', 'chest', 'altar'];");
    expect(rv).not.toContain('altar: hd.onAltar,');
    expect(rv).toContain("if (p === 'rank') continue;");
    expect([...ROOM_PROPS]).toContain('rank'); // 이름·그림 키용
    for (const f of FACTIONS) {
      expect(roomOf(f).layout.altar).toBeDefined();
      expect(worldMapOf(f).places.rank).toBe(f.rankBattleName);
    }
  });
  it('단축키 T·홈 안내 수련장 카드도 삭제', () => {
    expect(actionFor('room', 'KeyT')).toBeNull();
    expect(HOME_INTRO.items.map((x) => x.id)).not.toContain('altar');
  });
  it('방에서 여는 길 없음 — 수련장은 월드맵에서만(뒤로 = 월드맵)', () => {
    const app = read('src/ui/app.ts');
    expect(app).not.toContain('onAltar');
    // C.394 (GDD 241-C 2·3): 수련장은 방에서 연다 — 기본 = 훈련 인형. 월드맵 그 자리는 번호 쟁탈전·진급 시험
    expect(app).toContain("onTraining: () => { if (careBlocked(s)) return; askDying(s, () => open('practice', () => practiceScreen(faction))); },");
    expect(app).toContain("onRank: () => { if (careBlocked(s) || !trackRulesOf(s).rank) return; worldAt = 'rank'; open('rank', () => rankScreen(faction)); },");
  });
  it('월드맵 수련장 그림이 비면 짚인형 그림', () => {
    const wm = read('src/ui/worldMapView.ts');
    expect(wm).toContain("const PLACE_ART_FALLBACK: Partial<Record<WorldPlace, string>> = { rank: 'prop.rank' };"); // C.394: 월드맵 그 자리는 번호 쟁탈전
    expect(wm).not.toMatch(/'hollow'|'shinigami'/);
    for (const f of FACTIONS) expect(artUrls(`place.training.${f.id}`).src).toBeNull();
    expect(artUrls('prop.altar').src).not.toBeNull();
  });
});

describe('160장 5~7 상태 화면', () => {
  const lcd = read('src/ui/lcdScreens.ts');
  it('상태이상 칸이 능력치 칸 위, 없으면 숨김', () => {
    expect(lcd).toContain('[weakSlot, status, gear]'); // C.28x (183장 S15): 상태이상이 왼쪽 맨 위
    expect(lcd).toContain('rightScroll.append(stats, evoPanel);');
    expect(lcd).toContain('weakSlot.hidden = states.length === 0;');
  });
  it('노력치 = .bha-ev (굵게·한 단계 크게, 기존 토큰만)', () => {
    const css = read('src/ui/bha/components/components.css');
    expect(css).toContain('.bha-ev { font-size: var(--bha-fs-lg); font-weight: var(--bha-fw-heavy);');
    const nest = read('src/ui/bha/nest.ts');
    expect(nest).toContain('if (extra) row.append(evText(extra));');
    for (const p of ['src/ui/lcdScreens.ts', 'src/ui/trainingView.ts', 'src/ui/rebirthView.ts']) expect(read(p)).toContain('evText(');
  });
  it('능력치 줄 누름 펼침 없음 → 능력치 ⓘ 창에 능력치별 한 줄 (165장 2: 기본 n%·머리 줄 없음)', () => {
    const nest = read('src/ui/bha/nest.ts');
    expect(nest).not.toContain('is-tip');
    expect(nest).not.toContain('bha-statrow__tip');
    expect(read('src/ui/bha/components/components.css')).not.toContain('.bha-statrow__tip');
    expect(lcd).toContain("statRow('일반 공격 치명', pctText(cc.basic));");
    expect(lcd).toContain('statInfoLines(faction,');
    expect(lcd).not.toContain('기본 ${');
  });
});
