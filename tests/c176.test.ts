// C.176 (GDD 104장 1·2·3·5·6·7·8·9, 106장 1·2·3): 뒤로 = 처음 화면 버그 · 말풍선 · ⓘ · 진행도 · 포식 설명·이름 · 프리셋 · 배치 스크롤 · 같은 속성 후보 n강 · 웅덩이 · 메노스 크기
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { ART_MANIFEST, artUrls, charArt } from '../src/data/art/manifest';
import { getFaction } from '../src/data/factions';
import { TRAITS, getTrait, traitAbbr, traitDescription, traitName } from '../src/data/traits';
import { enhanceLevel, gainTrait } from '../src/engine/absorb';
import { advance, chooseAbsorb, createExpedition, finishBattle, startBattle, type ExpeditionState } from '../src/engine/expedition';
import { presetSummary } from '../src/ui/bha/tilePresets';
import { roomStatusInfo, statusInfo } from '../src/ui/bha/statusInfo';
import { statusChips } from '../src/ui/bha/roomLogic';

const read = (p: string) => readFileSync(p, 'utf8');
const hollow = getFaction('hollow');

function toAbsorb(exp: ExpeditionState, element: string): void {
  exp.wildCells = [exp.pos + 1];
  advance(exp);
  Object.assign(exp.pending!.enemy, { element, rare: false });
  const b = startBattle(exp);
  b.enemy.hp = 0;
  b.status = 'won';
  b.finisher = { kind: 'basic-attack', traitId: null, element: null };
  finishBattle(exp, b);
}

describe('104장 7: 뒤로 = 처음 화면 버그', () => {
  it('뒤로(onCancel)는 화면 스택 뒤로 — 갈 곳이 없으면 홈(home 표시)일 때만 처음 화면 확인(C.198, GDD 124장 1), 전투 = 일시정지, 독 펼침 = 닫기', () => {
    const app = read('src/ui/app.ts');
    expect(app).toContain('const r = nav.cancel();');
    expect(app).toContain("if (r === 'home') askReturnToTitle();");
    expect(app).toContain('canCancel: () => nav.canCancel,');
    expect(read('src/ui/battleView.ts')).toMatch(/registerCancelHook\(\(top\) => \{[\s\S]*?setPaused\(true\);[\s\S]*?\}, \{ button: true \}\)/);
    expect(read('src/ui/bha/dock.ts')).toMatch(/registerCancelHook\(\(top\) => \{[\s\S]*?setPanel\(CLOSED\);[\s\S]*?\}, \{ button: true \}\)/);
    expect(read('src/ui/bha/hold.ts')).not.toContain('requestTitle');
  });
});

describe('104장 5·6: 포식 설명·이름', () => {
  it("설명 '(공격 블록, 조 계열·물리)' → '(물리 공격 블록)', 계열 글자 없음", () => {
    for (const t of TRAITS) for (const f of ['hollow', 'shinigami']) expect(traitDescription(t.id, f)).not.toMatch(/\(공격 블록, [^)]*계열/);
    expect(traitDescription('t-water-a', 'hollow')).toContain('(물리 공격 블록)');
    expect(traitDescription('t-water-b', 'hollow')).toContain('(혼합 공격 블록)');
  });
  it("표시 이름에서 앞 속성 글자를 뺀다 ('물 조' → '조'), 데이터 이름·id 는 그대로", () => {
    expect(traitName('t-water-a', 'hollow')).toBe('조');
    expect(traitName('t-normal-c', 'shinigami')).toBe('귀');
    expect(traitName('t-fire-rare', 'hollow')).toBe('탄·극');
    expect(traitName('t-kyo-b', 'hollow')).toBe('교'); // 속성 이름 '허(虛)' 이 아니라 약어 '허' 로 시작
    expect(traitAbbr('t-water-a', 'hollow')).toBe('조');
    expect(getTrait('t-water-a').name).toEqual({ hollow: '물 조', shinigami: '물 참' });
    expect(traitName('boss-sand-maw', 'hollow')).toBe('모래 아귀의 턱'); // 속성 글자로 시작하지 않으면 그대로
  });
});

describe('104장 2: 상태 ⓘ', () => {
  it('상태마다 설명 문구가 있고(광기·자아 = 옛 설명 패널 내용), 방 칩 ⓘ 는 칩마다 한 묶음', () => {
    for (const k of ['hunger', 'cond', 'bond', 'risk', 'stab', 'weak', 'tired', 'collapsed'] as const) expect(statusInfo(k, hollow)).toBeTruthy();
    // C.185 (GDD 111장 4): 수치 상태 창 = 한 줄 요약 → 하는 일 → 구간별 손해 → 오르내림 (모든 수치 상태 같은 순서)
    for (const k of ['hunger', 'cond', 'bond', 'risk', 'stab'] as const) expect(statusInfo(k, hollow).groups.map((g) => g.title)).toEqual(['하는 일', '구간별 손해', '오르내림']);
    for (const k of ['weak', 'tired', 'collapsed'] as const) expect(statusInfo(k, hollow).groups.map((g) => g.title)).toEqual(['손해', '풀리는 법']);
    const risk = statusInfo('risk', hollow, 85).groups;
    // 109장 2: 구간마다 숫자, 지금 구간(85 = 80~99) 강조
    expect(risk[1]!.lines[0]).toMatch(/^0~79: /);
    expect(risk[1]!.mark).toBe(1);
    expect(risk[1]!.lines[2]).toContain(`+${Math.round((BALANCE.provisional.risk.frenzyDamageTaken - 1) * 100)}%`);
    const stab = statusInfo('stab', hollow, 10).groups;
    expect(stab[1]!.mark).toBe(0);
    expect(stab[1]!.lines).toHaveLength(4);
    expect(stab[1]!.lines.every((l) => /해방 게이지 [\d.]+~[\d.]+\//.test(l))).toBe(true);
    const chips = statusChips({ hunger: 50, condition: 50, risk: 10, weakened: true, tired: false, stability: 30 }, hollow);
    const groups = (roomStatusInfo(chips, hollow) as { groups: { title: string; lines: string[] }[] }).groups;
    expect(groups).toHaveLength(chips.length);
    expect(groups.every((g) => g.lines.length > 0)).toBe(true);
  });
});

describe('104장 8: 프리셋 미리보기 한 줄', () => {
  it('구성 = 타일 이름 ×개수, 놓은 순서대로', () => {
    expect(presetSummary([null, 'a', 'b', null, 'a'], (id) => id.toUpperCase())).toBe('A ×2 · B ×1');
  });
});

describe('106장 1: 같은 속성 포식 후보 · n강', () => {
  it('가진 블록을 고르면 중복 블록 없이 속성 강화 +1 만', () => {
    const exp = createExpedition({ factionId: 'hollow', seed: 3, hunger: 10, condition: 100, deck: [] });
    gainTrait(exp.build, 't-fire-a');
    toAbsorb(exp, 'fire');
    exp.absorbOffer!.candidates = ['t-fire-a'];
    const owned = exp.build.owned.length;
    const slots = [...exp.build.slots];
    const lv = enhanceLevel(exp.build, 'fire');
    expect(chooseAbsorb(exp, 't-fire-a').ok).toBe(true);
    expect(exp.build.owned.length).toBe(owned);
    expect(exp.build.slots).toEqual(slots);
    expect(enhanceLevel(exp.build, 'fire')).toBe(lv + 1);
  });
  it("화면: 안 가진 블록 = '새 블록', 가진 블록 = 'n강 → n+1강', 가진 블록은 가득이어도 교체 단계 없이", () => {
    const src = read('src/ui/absorbView.ts');
    expect(src).toContain("chip(have ? step : '새 블록')");
    expect(src).toContain('if (isFull(exp.build) && !ownsTraitBlock(exp.build, id))');
    expect(read('src/engine/absorb/offer.ts')).not.toContain('freshElements');
  });
});

describe('106장 2·3: 웅덩이 · 메노스 크기', () => {
  it('휴식 칸 시간 1/3 (회복량 그대로) · 회복 모션', () => {
    expect(BALANCE.provisional.expedition.restTimeTiles * BALANCE.expedition.restSecondsPerTile).toBeCloseTo(10 / 3);
    const ev = read('src/ui/expeditionView.ts');
    expect(ev).toContain("const healFx = el('span', 'bha-walker__heal');");
    expect(ev).toContain("floatEl('heal', gain");
  });
  it('메노스 그란데: 걷기·전투 필드 배율은 데이터(fieldScale), 방은 scale 그대로', () => {
    expect(ART_MANIFEST['char.hollow.2']!.fieldScale).toBe(1.5);
    expect(ART_MANIFEST['char.hollow.2']!.scale).toBe(2);
    expect(artUrls('char.hollow.2').fieldScale).toBe(1.5);
    expect(artUrls('char.hollow').fieldScale).toBeUndefined();
    expect(read('src/ui/bha/walk.ts')).toContain('art.fieldScale ?? art.scale');
    expect(read('src/ui/bha/battle.ts')).toContain('art.fieldScale ?? art.scale');
    expect(typeof charArt).toBe('function');
  });
});

describe('104장 3·9: 걷기 가운데 위 진행도 · 배치 칸 스크롤', () => {
  it('가운데 위 길 칸 줄 없음, 배치 화면 세로 스크롤 + [출발] 아래 고정', () => {
    expect(read('src/ui/expeditionView.ts')).not.toContain('bha-exp__strip');
    const css = read('src/ui/bha/expedition.css');
    expect(css).toMatch(/\.bha-lcd \.bha-app\.bha-plan \{[^}]*overflow: hidden auto;/);
    expect(css).toMatch(/\.bha-plan__go \{[^}]*position: sticky; bottom: 0;/);
  });
});
