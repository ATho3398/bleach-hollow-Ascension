// C.237 (GDD 159장): UI 검수 1차 반영 — 원정 → 모험 문구 통일, 가방 소모품 탭(음식·약·전투 소모품)·스킨 위 탭, 상점 약/전투 소모품 탭,
// 목록 한 줄 효과, 떠돌이 상인 n/1개 구매 가능, 설정 공통/슬롯 나누기 삭제, 방 상태 창 한 줄, 쟁탈전 목록, 탑 배율 ⓘ
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getFaction } from '../src/data/factions';
import { foodBlurb } from '../src/data/shop';
import { newSaveData } from '../src/game';
import { consumableBrief, inventoryOf } from '../src/inventory';
import { consumableGroupOf, goldRows } from '../src/shop';
import { bagGroupOf, cardDetailOf } from '../src/ui/lcdScreens';
import { stabilityZones } from '../src/data/help/riskText';

const H = getFaction('hollow');
const S = getFaction('shinigami');
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/** src 아래 .ts·.json 파일 전부 */
function srcFiles(dir = new URL('../src', import.meta.url).pathname): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? srcFiles(p) : /\.(ts|json)$/.test(n) ? [p] : [];
  });
}

describe('159장 20·40: 화면 문구 원정 → 모험', () => {
  it('src 의 문자열(주석 제외)에 원정이 없다 — 코드 id·세이브 키는 영어라 그대로', () => {
    const hits: string[] = [];
    for (const f of srcFiles()) {
      const lines = readFileSync(f, 'utf8').split('\n');
      lines.forEach((l, i) => {
        if (!l.includes('원정')) return;
        if (f.endsWith('.json')) return hits.push(`${f}:${i + 1}`);
        if (/^\s*(\/\/|\*|\/\*)/.test(l)) return;
        // 따옴표 밖의 // 부터는 주석 — 그 앞 코드에 원정이 남았으면 화면 문구
        let q: string | null = null;
        let cut = l.length;
        for (let k = 0; k < l.length; k++) {
          const c = l[k]!;
          if (q) {
            if (c === '\\') k++;
            else if (c === q) q = null;
          } else if (c === "'" || c === '"' || c === '`') q = c;
          else if (c === '/' && l[k + 1] === '/') {
            cut = k;
            break;
          }
        }
        if (l.slice(0, cut).includes('원정')) hits.push(`${f}:${i + 1}`);
      });
    }
    expect(hits).toEqual([]);
  });
});

describe('159장 24·25·36·37: 소모품 갈래 · 한 줄 효과', () => {
  it('약 = 상태 이상 약·체력 회복 물건·정화제·각성제, 전투 소모품 = 전투 각성제, 다시 뽑기권 = 기타', () => {
    for (const id of ['med-cure', 'med-iv', 'med-energy', 'heal-patch', 'battle-potion', 'heal-salve', 'w-hp-potion', 'calm', 'wake', 'w-calm-deep', 'w-soul-elixir']) expect(consumableGroupOf(id)).toBe('medicine');
    expect(consumableGroupOf('battle-haste')).toBe('battle');
    expect(consumableGroupOf('reroll')).toBe('etc');
  });
  it('가방 칸: 음식·약·전투 소모품, 수련권·다시 뽑기권은 기타(위쪽 탭), 스킨·타일·장비·펫은 소모품 탭 밖', () => {
    expect(bagGroupOf({ id: 'food-snack', category: 'food' })).toBe('food');
    expect(bagGroupOf({ id: 'heal-patch', category: 'consumable' })).toBe('medicine');
    expect(bagGroupOf({ id: 'battle-haste', category: 'consumable' })).toBe('battle');
    expect(bagGroupOf({ id: 'training-ticket', category: 'etc' })).toBe('etc');
    for (const c of ['skin', 'tile', 'equipment', 'pet'] as const) expect(bagGroupOf({ id: 'x', category: c })).toBeNull();
  });
  it('목록 칸 한 줄 = 짧은 효과 (반창고 체력 10% 회복 · 구급상자 빈사 치료), 상세 창은 자세한 수치 그대로', () => {
    expect(consumableBrief('heal-patch', H)).toBe('체력 10% 회복');
    expect(consumableBrief('w-hp-potion', H)).toBe('체력 가득 회복');
    expect(consumableBrief('med-cure', H)).toBe('빈사 치료');
    expect(consumableBrief('calm', H)).toBe(`${H.riskGaugeName} −30`);
    const s = newSaveData('shinigami');
    s.shared.items = { 'heal-patch': 2 };
    const e = inventoryOf(s, S).find((x) => x.id === 'heal-patch')!;
    expect(cardDetailOf(e)).toBe('체력 10% 회복');
    expect(cardDetailOf({ ...e, brief: undefined })).toContain('모험 걷기 중');
  });
  it('음식 한 줄 = 하는 일 (종족 배부름 이름) — 상점·가방 같은 줄', () => {
    expect(foodBlurb('snack', H)).toBe(`${H.fullnessName}이 조금 찬다`);
    expect(foodBlurb('tonic', S)).toBe('컨디션이 오른다');
    expect(read('src/data/shop/blurbs.json')).not.toContain('"먹이다"');
  });
  it('가방 위쪽 탭 = 장비 · 슬롯 · 타일 · 소모품 · 스킨 · 펫 · 기타, 장비 탭 숫자 = 장비 + 전투용 소모품', () => {
    const l = read('src/ui/lcdScreens.ts');
    expect(l).not.toContain("label: '물건'");
    expect(l).toContain("BAG_GROUPS: readonly [BagGroup, string][] = [['food', ITEM_CATEGORY_NAMES.food], ['medicine', MEDICINE_NAME], ['battle', BATTLE_ITEMS_NAME]]");
    expect(l).toContain('save.shared.gear.items.length + BATTLE_ITEM_IDS.filter(');
  });
});

describe('159장 3·28·31~35: 상점 · 전투 소모품 상세', () => {
  it('배지는 보유 n 하나, 타일 배치 칸 효과에 트랙 없음 · 다 산 칸은 가득', () => {
    const s = newSaveData('hollow');
    const rows = goldRows(s, H);
    expect(rows.find((r) => r.id === 'heal-patch')!.have).toMatch(/^보유 \d+\/\d+$/);
    expect(rows.find((r) => r.id === 'tile-draw')!.have).toBeNull();
    const deck = rows.find((r) => r.id === 'deck-slot')!;
    expect(deck.effect).not.toContain('트랙');
    expect(deck.have).toMatch(/^보유 \+\d\/\d$/);
    s.shared.deckSlots = 99;
    expect(goldRows(s, H).find((r) => r.id === 'deck-slot')!.lock).toBe('가득');
  });
  it('떠돌이 상인: 칸 한 줄 n/1개 구매 가능, 칸마다 하나씩 문구 없음, 장비 이름에 (레어) 없음', () => {
    const v = read('src/ui/shopView.ts');
    expect(v).toContain('개 구매 가능');
    expect(v).not.toContain('칸마다 하나씩');
    expect(read('src/data/shop/wanderer.json')).not.toMatch(/떠돌이 장비 \(/);
  });
  it('전투 소모품 상세: 남은 개수 한 곳, 대괄호·괄호 설명 없음', () => {
    const e = read('src/ui/equipView.ts');
    expect(e).toContain('`남은 개수 ${n}');
    expect(e).not.toContain('have: `보관 ${n}개`');
    expect(e).not.toContain('(전투당 1회, 1개 소모)');
  });
});

describe('159장 그 밖', () => {
  it('12·13: 전체 화면 설명 한 줄, 공통/이 슬롯 토글·꼬리표 없음, 성별은 이 캐릭터 칸', () => {
    const v = read('src/ui/settingsView.ts');
    for (const t of ['주소창·상태 표시줄', '(안드로이드)', '공통 설정 — 슬롯 설정이 없는 항목에 쓴다', "'슬롯만'"]) expect(v).not.toContain(t);
    expect(v).toContain("panel('이 캐릭터 · 성별'");
  });
  it('17: 배경음 곡 알림 없음, 설정이 열려 있으면 알림을 미룬다', () => {
    expect(read('src/ui/bgm.ts')).not.toContain("eyebrow: '배경음'");
    expect(read('src/ui/bha/nest.ts')).toContain('if (settingsOpen()) deferUntilSettingsClosed(start);');
  });
  it('23: 영압 안정도 구간 값은 정수, 겹치지 않는다', () => {
    const z = stabilityZones(H).map((x) => x.text);
    for (const t of z) expect(t).not.toMatch(/\d\.\d/);
    expect(z.join('|')).toBe('전투 시작 해방 게이지 0~12/100|전투 시작 해방 게이지 13~24/100|전투 시작 해방 게이지 25~37/100|전투 시작 해방 게이지 38~50/100');
  });
  it('41·42: 탑 배율은 ⓘ 안, 쟁탈전 목록은 번호 칸만(순번·무번호 줄 없음)', () => {
    expect(read('src/ui/towerView.ts')).not.toContain("el('span', 'bha-faint bha-num', `적 +");
    const r = read('src/ui/rankView.ts');
    expect(r).toContain('for (let n = 1; n <= RANK_COUNT; n++) {');
    expect(r).not.toContain('bha-rankrow__num');
  });
  it('14·39: 기기 화면 안 초점 표시는 선택 하이라이트 하나', () => {
    expect(read('src/ui/bha/device.css')).toContain('.bha-lcd :focus-visible:not(.bha-sel) { outline: none; }');
  });
});
