// C.406 (GDD 241-C 4~9·11 · 241-G): 길리안 외눈형(숨은 모습) · 새 게임 시작 지급 · 쇠약 = 먹인 뒤 24시간 · 눌러서 말 걸기 · 문구 · 칭호 도감 탭 · 반석
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { ART_MANIFEST } from '../src/data/art/manifest';
import { FACTIONS, getFaction } from '../src/data/factions';
import { getSkin } from '../src/data/skins';
import { evCaps, evCounted, evTotal } from '../src/engine/evolution';
import { departCare, feedFood, hoursToWeak, mealOverdue, newNest, passNestTime, touchNest } from '../src/engine/nest';
import { careNest, migrateSave, newSaveData, performEvolution, SAVE_FORMAT_VERSION, SAVE_MIGRATIONS, touchCharacter } from '../src/game';
import { STAT_IDS } from '../src/data/schema';
import { TITLE_TABS } from '../src/ui/titleDexView';
import releases from '../src/data/evolution/releases.json';
import { useLegacyMigrations } from './helpers/legacyGate';

// C.446: 게임은 형식 87 미만을 열지 않는다(MIN_LOADABLE_SAVE_FORMAT 87) — 이 파일의 옛 형식 마이그레이션 시험 동안만 문턱을 내린다
useLegacyMigrations();

const read = (p: string) => readFileSync(p, 'utf8');
const H = 3_600_000;
const NX = BALANCE.provisional.nest;
const TC = NX.bond.touch;

describe('241-C 4 길리안 외눈형 (숨은 모습 — 종족 설정 specialLooks)', () => {
  const evolveTo2 = (s: ReturnType<typeof newSaveData>) => {
    s.evolution.steps = 999999;
    const r = performEvolution(s, 100);
    expect(r.ok).toBe(true);
    return r;
  };
  it('데이터: 호로 = 외눈형(2단계 진화, 1단계 동안 교감 3번, 모든 능력치 +5), 사신은 없음 — 엔진에 종족 분기 없음', () => {
    expect(getFaction('hollow').specialLooks).toEqual([{ id: 'cyclops', name: '외눈형', toTierIndex: 1, minBondCare: 3, look: 'gilliancyclops', bonusEv: 5 }]);
    expect(getFaction('shinigami').specialLooks).toEqual([]);
    expect(getSkin('gilliancyclops')).toMatchObject({ factionId: 'hollow', tierLook: true });
    expect(ART_MANIFEST['skin.gilliancyclops']).toMatchObject({ rig: 'gillian-cyclops' });
    expect(read('src/game.ts')).not.toMatch(/factionId === '(hollow|shinigami)'/);
  });
  it('1단계 동안 교감 3번 → 외눈형으로 진화 + 모든 능력치 +5(상한 밖 노력치 = 노력치 상한 +30)', () => {
    const s = newSaveData('hollow', 1);
    for (let i = 0; i < 3; i++) expect(touchCharacter(s, 1000 + i)!.kind).toBe('like');
    expect(s.evolution.bondCare).toBe(3);
    const evBefore = evTotal(s.evolution.ev);
    const r = evolveTo2(s);
    expect(s.evolution.look).toBe('gilliancyclops');
    expect(evTotal(s.evolution.ev) - evBefore).toBe(5 * STAT_IDS.length);
    expect(evTotal(evCounted(s.evolution))).toBe(evTotal(s.evolution.ev) - evTotal(s.evolution.evFree!)); // 상한에는 안 센다
    expect(evTotal(s.evolution.evFree!)).toBeGreaterThanOrEqual(30);
    expect(evCaps(1).total).toBe(BALANCE.provisional.stats.evCapTotal[1]); // 상한 수치 자체는 그대로 — 상한 밖 몫으로 +30
    expect(s.shared.specialLooks).toEqual(['hollow:cyclops']);
    expect(r.ok && r.record.specialLook).toEqual({ id: 'cyclops', bondCare: 3, bonus: true });
    expect(s.evolution.bondCare).toBeUndefined(); // 진화하면 다시 0
  });
  it('교감이 모자라면 보통 길리안, 사신은 조건을 채워도 그대로', () => {
    const s = newSaveData('hollow', 1);
    touchCharacter(s, 1000);
    evolveTo2(s);
    expect(s.evolution.look).toBe('gillian');
    expect(s.shared.specialLooks).toEqual([]);
    const g = newSaveData('shinigami', 1);
    for (let i = 0; i < 4; i++) touchCharacter(g, 1000 + i);
    const before = evTotal(g.evolution.ev);
    evolveTo2(g);
    expect(evTotal(g.evolution.ev)).toBe(before);
    expect(g.shared.specialLooks).toEqual([]);
  });
  it('보너스는 세이브 전체에서 처음 1번만 — 이미 받았으면 외형만', () => {
    const s = newSaveData('hollow', 1);
    s.shared.specialLooks = ['hollow:cyclops'];
    for (let i = 0; i < 3; i++) touchCharacter(s, 1000 + i);
    const before = evTotal(s.evolution.ev);
    const r = evolveTo2(s);
    expect(s.evolution.look).toBe('gilliancyclops');
    expect(evTotal(s.evolution.ev)).toBe(before);
    expect(r.ok && r.record.specialLook).toEqual({ id: 'cyclops', bondCare: 3, bonus: false });
  });
  it('쓰다듬기 요청에 응답한 것도 교감으로 센다', () => {
    const s = newSaveData('hollow', 1); s.help.guides = {}; // 튜토리얼이 끝난 세이브 — 튜토리얼 중엔 돌봄 요청이 없다 (GDD 245장 8)
    s.nest.careRequest = { action: 'pet', until: 10_000 };
    expect(careNest(s, 'pet', 5000, () => 0.5)).toBe('answered');
    expect(s.evolution.bondCare).toBe(1);
  });
  it('조건은 숨김 — 도움말에는 숨은 모습이 있다는 것만', () => {
    const help = read('src/data/help/screens.json');
    expect(help).toContain('숨은 모습으로 진화하기도 한다');
    expect(help).not.toContain('외눈');
  });
});

describe('241-C 5 새 게임 시작 지급', () => {
  it('상태이상 치료제 각 3개 · 일반 먹이는 시작 지급 없음 (GDD 245장 2 — 첫 끼니 뒤 보상으로) · 싸구려는 그대로', () => {
    const s = newSaveData('hollow', 1);
    for (const id of ['med-cure', 'med-iv', 'med-energy']) expect(s.shared.items[id], id).toBeUndefined(); // GDD 245장 9: 빈사 치료 뒤 지급
    for (const [id, def] of Object.entries(NX.foods)) {
      if (def.type === 'normal') expect(s.shared.food[id as keyof typeof s.shared.food], id).toBe(0);
      if (def.type === 'special') expect(s.shared.food[id as keyof typeof s.shared.food], id).toBe(0);
    }
    expect(s.shared.food.snack).toBe(0); // 싸구려 간식도 빈사 치료 뒤 (GDD v6.005)
  });
});

describe('241-C 6 쇠약 = 마지막으로 먹인 뒤 24시간', () => {
  it('수치 24시간, 배부름 문턱은 없다', () => {
    expect(NX.care.weakAfterHours).toBe(24);
    expect('weakFullness' in NX.care).toBe(false);
  });
  it('배부름이 바닥이어도 24시간 전에는 쇠약이 아니고, 24시간이 지나면 걸린다 — 먹이면 시계가 다시 돈다', () => {
    const T = 10_000_000;
    const n = newNest(T);
    n.hunger = 100;
    passNestTime(n, 23, false, T + 23 * H);
    expect(n.weakened).toBe(false);
    expect(hoursToWeak(n, T + 23 * H)).toBeCloseTo(1, 5);
    expect(feedFood(n, 'basic', T + 23 * H)).toBe('ate');
    passNestTime(n, 23, false, T + 46 * H);
    expect(n.weakened).toBe(false); // 먹인 뒤 23시간
    passNestTime(n, 2, false, T + 48 * H);
    expect(n.weakened).toBe(true);
    expect(mealOverdue(n, T + 48 * H)).toBe(true);
  });
  it('풀기: 먹인 뒤 출발해야 돌아올 때 풀린다 (안 먹이고 출발하면 그대로)', () => {
    const T = 10_000_000;
    const n = newNest(T);
    n.weakened = true;
    expect(departCare(n, T + 30 * H)).toMatchObject({ weak: true });
    expect(n.cureOnReturn.weak).toBe(false);
    feedFood(n, 'basic', T + 30 * H);
    departCare(n, T + 30 * H + 1000);
    expect(n.cureOnReturn.weak).toBe(true);
  });
  it('세이브 형식 77: 76 → 77 = 쇠약 시계는 지금부터, 터치 빈 기록, 숨은 모습 보너스 빈 목록', () => {
    expect(SAVE_FORMAT_VERSION).toBe(88); // C.406 쇠약 시계·터치·숨은 모습
    expect(SAVE_MIGRATIONS[76]).toBeTypeOf('function');
    const s = newSaveData('hollow', 1);
    const raw = JSON.parse(JSON.stringify(s));
    raw.meta.format = 76;
    delete raw.nest.lastMealAt;
    delete raw.nest.touch;
    delete raw.shared.specialLooks;
    raw.lastSeenAt = Date.now() - 40 * H; // 40시간 비운 옛 세이브
    const before = Date.now();
    const m = migrateSave(raw)!;
    expect(m.meta.format).toBe(88);
    expect(m.nest.lastMealAt).toBeGreaterThanOrEqual(before);
    expect(m.nest.touch).toEqual({ count: 0, at: 0 });
    expect(m.shared.specialLooks).toEqual([]);
    expect(m.nest.weakened).toBe(false);
  });
});

describe('241-C 7 눌러서 말 걸기', () => {
  it('수치: 4번째까지 +1, 5·6번째 싫어하는 티, 7번째부터 −1, 3시간 뒤 처음부터', () => {
    expect(TC).toEqual({ likeCount: 4, dislikeCount: 2, gain: 1, loss: 1, resetHours: 3 });
  });
  it('한 묶음: 좋아함 4 → 싫어하는 티 2 → 싫어함(교감 −1) · 하루 최대와 따로', () => {
    const T = 50_000_000;
    const n = newNest(T);
    n.bond = 10;
    n.bondToday = NX.bond.dailyMax; // 하루 최대를 이미 채웠어도
    const kinds = Array.from({ length: 8 }, (_, i) => touchNest(n, T + i * 1000)!);
    expect(kinds.map((k) => k.kind)).toEqual(['like', 'like', 'like', 'like', 'dislike', 'dislike', 'hate', 'hate']);
    expect(kinds.map((k) => k.bond)).toEqual([1, 1, 1, 1, 0, 0, -1, -1]);
    expect(n.bond).toBe(12);
    // 마지막 터치 뒤 3시간이 지나면 처음부터
    expect(touchNest(n, T + 7000 + TC.resetHours * H - 1)!.kind).toBe('hate');
    expect(touchNest(n, T + 7000 + TC.resetHours * H - 1 + TC.resetHours * H)!).toMatchObject({ kind: 'like', n: 1, bond: 1 });
  });
  it('교감 0·최대에서는 넘지 않고, 사망이면 반응 없음', () => {
    const n = newNest(1);
    n.bond = NX.bond.max;
    expect(touchNest(n, 5)!.bond).toBe(0);
    n.dead = true;
    expect(touchNest(n, 6)).toBeNull();
  });
  it('런 로그 care.touch 에 세고 저장·불러오기로 남는다 · 방에서 캐릭터를 누르면 부른다', () => {
    const s = newSaveData('shinigami', 1);
    for (let i = 0; i < 7; i++) touchCharacter(s, 1000 + i);
    expect(s.runLog.care.touch).toEqual({ like: 4, dislike: 2, hate: 1 });
    const back = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(back.nest.touch).toEqual(s.nest.touch);
    expect(read('src/ui/roomView.ts')).toContain('const out = touchCharacter(save, Date.now());');
  });
});

describe('241-C 8·9·11 문구·화면 · 241-G 이름', () => {
  it("교감 설명에서 '약으로는 오르지 않는다' 삭제, 쇠약 설명 = 24시간", () => {
    const si = read('src/ui/bha/statusInfo.ts');
    expect(si).not.toContain('약으로는 오르지 않는다');
    expect(si).toContain('안 준 지 ${CP.weakAfterHours}시간이 지나면 걸린다');
  });
  it("상태 화면: '진화할 때는 비밀이다' 글은 도움말로, '가진 것' 칸 삭제", () => {
    expect(read('src/ui/evolutionPanel.ts')).not.toContain('진화할 때는 비밀이다');
    expect(read('src/data/help/screens.json')).toContain('언제인지는 비밀이고');
    expect(read('src/ui/lcdScreens.ts')).not.toContain("title: '가진 것'");
  });
  it('칭호 도감 탭 = 일반 · 에픽 · 히든 (+ 스토리 · 탑)', () => {
    expect(TITLE_TABS.map((t) => t.label)).toEqual(['일반', '에픽', '히든', '스토리', '탑']);
    expect(TITLE_TABS.map((t) => t.kind)).toEqual(['rank', 'tag', 'hidden-rank', 'story', 'tower']);
  });
  it('사신 흙·권 4단계 = 반석 / 부동반석 (옛 금강저)', () => {
    const r = (releases as { releases?: Record<string, Record<string, { name: string; final?: string }>> }).releases ?? (releases as unknown as Record<string, Record<string, { name: string; final?: string }>>);
    expect(JSON.stringify(releases)).not.toContain('금강저');
    expect(JSON.stringify(r)).toContain('"name":"반석"');
    expect(JSON.stringify(r)).toContain('"final":"부동반석"');
    for (const f of FACTIONS) expect(f.id).toBeTruthy();
  });
});

describe('C.407 241-C 10 문구 검수', () => {
  const read2 = (p: string) => readFileSync(p, 'utf8');
  it("대기 보상: '플레이와 관계없이' · '직접 모험했을 때'", () => {
    const iv = read2('src/ui/idleView.ts');
    expect(iv).toContain('플레이와 관계없이 흐른 시간만큼 자동으로 모험한다. 보상은 직접 모험했을 때의 ');
    expect(iv).not.toMatch(/켜 두든|직접 돌았을 때|덜 돌았다/);
  });
  it("'깬 뒤'·'깨면' → '클리어 후'·'클리어하면' (화면 문구 — 이야기 대사 '가면을 깨는 자' 같은 말은 그대로)", () => {
    for (const f of ['src/ui/planView.ts', 'src/ui/storyView.ts', 'src/data/help/glossary.json', 'src/data/help/tutorial.json', 'src/engine/gender.ts']) {
      const strings = read2(f).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
      expect(strings, f).not.toMatch(/깨면|깬 뒤`|을\(를\) 깬/);
    }
    for (const f of FACTIONS) {
      const raw = read2(`src/data/factions/${f.id}.json`);
      expect(raw).toContain('"locked": "스토리 1장 클리어 후 열린다"');
      expect(f.ascension.desc).toContain('클리어 후');
    }
  });
  it('도움말에 개발용 (임시) 표시가 없다 · 번호 쟁탈전 위치 = 월드맵', () => {
    const g = read2('src/data/help/glossary.json');
    expect(g).not.toMatch(/\(임시\)|\(수치는 임시\)|\(조건은 임시\)|오오라/);
    expect(g).toContain('{tier4}이(가) 되면 {worldmap.name}에서 열린다.');
  });
});
