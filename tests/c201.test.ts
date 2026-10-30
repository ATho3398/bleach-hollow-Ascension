// C.201 (GDD 127장 2·3·4): 장터 — 방 물건 [장터] → 장터 화면(온천·상점·떠돌이 상인), 떠돌이 상인 도착 알림(방에서만)·방 장터 물건 배지
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FEATURES } from '../src/config/features';
import { readFileSync } from 'node:fs';
import { FACTIONS, getFaction } from '../src/data/factions';
import { marketOf, MARKET_SPOTS, parseFactionConfig, roomOf, ROOM_PROPS } from '../src/engine/faction';
import { newSaveData } from '../src/game';
import { marketSpots } from '../src/ui/marketView';
import { slotLine, slotTitle } from '../src/ui/startView';

describe('127장 2 장터 = 방 물건 하나 + 따로 된 화면', () => {
  // 옛 방(장터) = 월드맵 스위치 끔 상태 (GDD 130장 6 — 되돌리면 그대로여야 한다)
  beforeAll(() => { FEATURES.WORLD_MAP = false; });
  afterAll(() => { FEATURES.WORLD_MAP = true; });
  it('방에는 장터 물건 하나, 상점·온천은 방에서 빠지고 장터 안 자리로', () => {
    expect(ROOM_PROPS).toContain('market');
    expect(ROOM_PROPS as readonly string[]).not.toContain('shop');
    expect(ROOM_PROPS as readonly string[]).not.toContain('spa');
    expect([...MARKET_SPOTS]).toEqual(['spa', 'shop', 'wanderer']);
  });
  it('장터 이름 = 종족 설정 (호로 웨코문도 장터 / 사신 루콘가 저잣거리), 상점·온천 이름은 그대로', () => {
    expect(marketOf(getFaction('hollow')).name).toBe('웨코문도 장터');
    expect(marketOf(getFaction('shinigami')).name).toBe('루콘가 저잣거리');
    for (const f of FACTIONS) {
      expect(marketOf(f).name).toBe(roomOf(f).props.market);
      expect(marketOf(f).props.shop).toBe('상점');
      expect(marketOf(f).props.spa.startsWith('온천')).toBe(true);
      expect(marketOf(f).sceneArt).toBe('scene.market');
    }
  });
  it('떠돌이 상인은 와 있을 때만 장터에 서 있다', () => {
    const s = newSaveData('hollow');
    expect(marketSpots(s)).toEqual(['spa', 'shop']);
    s.shared.wanderer.visit = { at: 1, runId: 1, tier: 1, stock: [] };
    expect(marketSpots(s)).toEqual(['spa', 'shop', 'wanderer']);
  });
  it('종족 설정 검사: 장터 자리 이름·위치가 틀리면 오류, 옛 room.props.shop 은 알 수 없는 물건', () => {
    const base = JSON.parse(readFileSync('src/data/factions/hollow.json', 'utf8'));
    expect(() => parseFactionConfig({ ...base, market: { props: { tavern: '술집' } } })).toThrow(/market\.props\.tavern/);
    expect(() => parseFactionConfig({ ...base, market: { layout: { shop: { x: 200, y: 1 } } } })).toThrow(/market\.layout\.shop/);
    expect(() => parseFactionConfig({ ...base, room: { ...base.room, props: { ...base.room.props, shop: '상점' } } })).toThrow(/room\.props\.shop/);
  });
  it('그림 키 자리: scene.market·prop.market·prop.wanderer (비어 있음 = 임시 배경)', () => {
    const m = readFileSync('src/data/art/manifest.ts', 'utf8');
    for (const k of ['scene.market', 'prop.market', 'prop.wanderer']) expect(m).toContain(`'${k}': {}`);
  });
});

describe('127장 2·3 화면 연결 (app.ts)', () => {
  const app = readFileSync('src/ui/app.ts', 'utf8');
  it('방 물건 → 장터, 장터 안 온천·상점·떠돌이 상인 창, 뒤로 = 방', () => {
    expect(app).toContain('onMarket: () => openMarket(faction, s)');
    expect(app).toContain("open('market', () => marketView(");
    expect(app).toContain('onSpa: () => openSpa(faction, s)');
    expect(app).toContain("mode: 'wanderer'");
  });
  it('떠돌이 상인 도착 알림은 방에서만, 장터에 먼저 들어가면 본 것으로', () => {
    expect(app).toContain("if (nav.top?.id !== 'room' || wandererAnnounced === visit.at) return;");
    expect(app).toMatch(/function openMarket[\s\S]*?if \(visit\) wandererAnnounced = visit\.at;/);
  });
  it('온천이 저절로 끝나면 방으로 (장터에서 들어갔어도)', () => {
    expect(app).toContain("if (nav.top?.id === 'spa') nestScreen();");
  });
  it('방 장터 물건 배지 = 떠돌이 상인이 와 있을 때', () => {
    const room = readFileSync('src/ui/roomView.ts', 'utf8');
    expect(room).toContain("if (p === 'market' && save.shared.wanderer.visit !== null)");
  });
});

describe('129장 1·2 슬롯 제목 · 종족 소개', () => {
  const H = getFaction('hollow');
  const S = getFaction('shinigami');
  const ok = (o: Partial<{ factionId: string; tierIndex: number; rank: number | null; rebirths: number }>) => ({ slot: 1, state: 'ok' as const, factionId: 'shinigami', tierIndex: 1, expeditions: 7, playedAt: null, inExpedition: false, ...o });
  it('제목 = 등급 이름만 (단계 숫자·종족·원정 횟수 없음)', () => {
    expect(slotTitle(ok({}), S)).toBe('영술원 학생');
    expect(slotLine(ok({}), FACTIONS).main).toBe('영술원 학생');
    expect(slotLine(ok({ factionId: 'hollow', tierIndex: 2 }), FACTIONS).main).toBe('아쥬커스');
  });
  it('칭호가 있으면 칭호, 환생했을 때만 +환생 n회', () => {
    expect(slotTitle(ok({ factionId: 'hollow', tierIndex: 4, rank: 3 }), H)).toBe('에스파다 No.3');
    expect(slotTitle(ok({ rebirths: 2 }), S)).toBe('영술원 학생 +환생 2회');
    expect(slotTitle(ok({ rebirths: 0 }), S)).toBe('영술원 학생');
  });
  it('종족 선택 카드에 한 줄 소개(tagline)를 그리지 않는다', () => {
    expect(readFileSync('src/ui/startView.ts', 'utf8')).not.toContain('bha-species__tagline');
  });
});

describe('128장 6 온천 화면 개편', () => {
  const v = readFileSync('src/ui/spaView.ts', 'utf8');
  const css = readFileSync('src/ui/bha/spa.css', 'utf8');
  it('화면 전체 장면 + 걸어 들어와 앉는 연출 + 왼쪽 위 [방으로 돌아가기]·ⓘ + 머리 위 상태 창', () => {
    expect(v).toContain("mountApp(root, { cls: 'bha-spa' }, scene)");
    expect(v).toContain("el('div', 'bha-spa__actor is-entering')");
    expect(v).toContain("actor.classList.add('is-seated')"); // C.208 (GDD 132장 4): 계단식 입수 끝에 앉는다
    expect(v).toContain("el('div', 'bha-room__status bha-spa__status')");
    expect(v).toContain("infoTip('쉬는 중'");
    expect(v).not.toContain('lcdPage(');
    expect(css).toContain('.bha-spa__actor.is-walking .bha-char__body'); // C.208: 걷기는 SPA_PATH 평지 칸
    expect(css).toMatch(/\.bha-spa__hud \{ position: absolute; top: [^;]+; left: /);
  });
});
