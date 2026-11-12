// C.425 (GDD 12-2 v6.013, 코딩279): 붕옥 창 재배치 — 오른쪽 세로 목록·개발 단계 삭제, 오른쪽 = 고른 것의 상세 + 아래 고정 [강화],
// 오른쪽 위 탭 [합체][초월체 도감] = 별도 창, 왼쪽 = 개발 % 아래 지금 얻는 총 효과, 한 글자씩 세로로 깨지던 상세 줄 수정
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FACTIONS } from '../src/data/factions';
import { newSaveData } from '../src/game';
import { totalEffectText, tracksInFactionOrder } from '../src/ui/hogyokuView';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('C.425 붕옥 창 재배치', () => {
  it('지금 얻는 총 효과 = 붕옥 개발 보너스 + 초월체 보너스', () => {
    const s = newSaveData('hollow', 0);
    expect(totalEffectText(s).main).toBe('두 캐릭터 전 능력치 +0%');
    s.hogyoku.developed = 3;
    s.transcendentDex.push({ id: 'x', at: 0, fusionIndex: 1 });
    const t = totalEffectText(s);
    expect(t.main).toMatch(/\+5%$/); // 3 × 1% + 1종 × 2% (임시값)
    expect(t.parts).toContain('붕옥 개발 +3%');
    expect(t.parts).toContain('초월체 1종 +2%');
  });

  it('합체 창 두 칸 순서 = 종족 설정 순서 (지금 키우는 트랙과 무관, 종족 id 분기 없음)', () => {
    const order = FACTIONS.map((f) => f.id);
    for (const first of order) {
      const s = newSaveData(first, 0);
      for (const other of order.filter((x) => x !== first)) s.otherTracks.push({ ...newSaveData(other, 0), parkedAt: 0 } as never);
      expect(tracksInFactionOrder(s).map((t) => t.factionId)).toEqual(order);
    }
  });

  it('화면: 세로 목록·개발 단계 삭제, 탭 2개 = 별도 창, [강화]는 오른쪽 아래 고정', () => {
    const v = read('src/ui/hogyokuView.ts');
    for (const gone of ["'bha-hglist'", 'HOGYOKU_LIST', 'stepList', "'개발 단계'"]) expect(v).not.toContain(gone);
    for (const k of ["dataset.sc = 'hogyoku-fusion'", "dataset.sc = 'hogyoku-dex'", "'bha-hgfoot'", "art.onclick = () => pick('develop')", '지금 두 캐릭터라면 → ', "'상세 보기'", 'dexGrid(', 'dexCard(']) expect(v).toContain(k);
    expect(v).not.toMatch(/faction(Id)? === '(hollow|shinigami)'/);
    const app = read('src/ui/app.ts');
    for (const k of ["open('hogyoku-fusion'", "open('hogyoku-dex'", "open('fusion-confirm'", "stashSlot(store, slot, 'fusion')"]) expect(app).toContain(k);
  });

  it('CSS: 상세 줄 이름표는 줄바꿈 없음(폭 0 으로 눌리지 않음) · 상세만 스크롤 · 버튼 줄 고정 · 토큰만', () => {
    const css = read('src/ui/bha/screens-lcd.css');
    expect(css).toMatch(/\.bha-hgrow__label \{[^}]*flex: none;[^}]*white-space: nowrap/);
    expect(css).toMatch(/\.bha-hgdetail \{[^}]*overflow-y: auto/);
    expect(css).toMatch(/\.bha-hgfoot \{ flex: none; \}/);
    const block = css.slice(css.indexOf('붕옥 창 배치 (C.421'), css.indexOf('.bha-articon'));
    expect(block).not.toMatch(/#[0-9a-f]{3,6}\b|rgba?\(/i);
  });
});
