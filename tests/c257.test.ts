// C.257 (GDD 174장): 진급 시험 = 방 책장 아래 물건. 수련장 토글에서 빠짐 · 이름 = 종족 설정 rankBattleName · 잠김 = 월드맵 잠긴 장소 모양
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FACTIONS } from '../src/data/factions';
import { roomOf, ROOM_PROPS } from '../src/engine/faction';
import { PROP_ICON } from '../src/ui/bha/room';
import { rankLockedText } from '../src/ui/rankView';
import { BALANCE } from '../src/config/balance';

const read = (p: string) => readFileSync(p, 'utf8');

describe('C.257 174장 1 수련장 토글에서 진급 시험 빼기', () => {
  it('토글 = 수련 · 훈련 인형 둘', () => {
    const tv = read('src/ui/trainingView.ts');
    expect(tv).toContain("export type TrainingScreenId = 'train' | 'practice';");
    expect(tv).not.toContain("id: 'rank'");
    expect(read('src/ui/app.ts')).not.toContain("id === 'rank'");
  });
});

describe('C.257 174장 2 방 물건 rank', () => {
  it('물건 목록·아이콘(그림 prop.rank 없을 때)', () => {
    expect(ROOM_PROPS).toContain('rank');
    expect(PROP_ICON.rank).toBeTruthy();
  });
  it.each(FACTIONS.map((f) => [f.id, f] as const))('%s: 이름 = rankBattleName, 자리 = 책장 바로 아래(x 같음, 더 앞)', (_id, f) => {
    const r = roomOf(f);
    expect(r.props.rank).toBe(f.rankBattleName);
    // C.263·C.268: 사용자가 배치 도구로 잡은 값 — 책장보다 앞쪽(C.268 은 책장 오른쪽 앞, x 는 같지 않아도 됨)
    expect(r.layout.rank.y).toBeGreaterThan(r.layout.book.y);
  });
  it('두 종족 이름이 다르다 (같은 엔진, 설정만)', () => {
    const names = FACTIONS.map((f) => roomOf(f).props.rank);
    expect(new Set(names).size).toBe(FACTIONS.length);
  });
  it('방에서 열고 뒤로 = 방 (nav open), 종족 분기 없음', () => {
    const app = read('src/ui/app.ts');
    expect(app).toContain("onRank: () => { if (careBlocked(s) || !trackRulesOf(s).rank) return; worldAt = 'rank'; open('rank', () => rankScreen(faction)); },"); // C.429: 등급전 없는 트랙(초월자)은 막힘 // C.394 (GDD 241-C 3): 월드맵 장소로
    const rv = read('src/ui/roomView.ts');
    expect(rv).not.toMatch(/faction\.id\s*===|'hollow'|'shinigami'/);
    expect(rv).toContain("const order: RoomProp[] = ['book', 'outside', 'hogyoku', 'chest', 'altar'];"); // C.394: 그 자리 = 수련장
  });
});

describe('C.257 174장 3 잠금 그대로', () => {
  it('해금 단계 전이면 자물쇠·흐림(is-locked) + 토스트, 문구는 해금 단계·종족 이름', () => {
    // C.394 (GDD 241-C 3): 잠김은 월드맵 장소의 lockReasons 로 (흐림 + 자물쇠 + 이유 알림 그대로)
    const wm = read('src/ui/worldMapView.ts');
    expect(wm).toContain("b.classList.add('is-locked');");
    expect(wm).toContain('lockProp(b);'); // C.265: 자물쇠는 그림 칸 안 귀퉁이 (room.ts lockProp)
    const app = read('src/ui/app.ts');
    expect(app).toContain('...(rankUnlocked(s.evolution.tierIndex) ? {} : { rank: rankLockedText(faction) }),');
    for (const f of FACTIONS) {
      const t = rankLockedText(f);
      expect(t).toContain(f.tierNames[BALANCE.rank.unlockTierIndex]!);
      expect(t).toContain(f.rankBattleName);
      expect(t.endsWith('.')).toBe(false); // 한 줄(토스트·툴팁) — 마침표 없음
      expect(t).not.toContain('(가)');
    }
  });
});

describe('C.257 174장 4 문구', () => {
  it('도움말 진급 시험 줄 = 방 책장 아래 (수련장 아님)', () => {
    const g = read('src/data/help/glossary.json');
    expect(g).toContain('{tier4}이(가) 되면 {worldmap.name}에서 열린다.'); // C.407: 번호 쟁탈전·진급 시험 = 월드맵 (GDD 241-C 3)
    expect(g).not.toContain('월드맵의 수련장 안에서 열린다');
  });
});
