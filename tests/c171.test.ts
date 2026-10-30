// C.171 (GDD 100장, 사용자 "적 그림이랑 이미지는 빼고, 나머지 진행"): 안쪽 화면 UI/UX 점검 반영 — 이름 표시 함수 · 개발용 문구는 테스트 모드만 · 용어 통일 · 화면별 정리
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { devText, setDevText, shownName } from '../src/ui/displayName';
import { getFaction } from '../src/data/factions';
import { TUTORIAL_SCENES } from '../src/data/help';
import { FLOAT_SPOTS, HURT_SPOTS } from '../src/ui/bha/battle';
import { actionChipOf, bagGroupOf, cardDetailOf } from '../src/ui/lcdScreens';
import { absorbModeText } from '../src/ui/absorbView';
import { inventoryOf, petEffectText } from '../src/inventory';
import { goldRows } from '../src/shop';
import { newSaveData } from '../src/game';

const read = (p: string) => readFileSync(p, 'utf8');
const H = getFaction('hollow');
const S = getFaction('shinigami');

afterEach(() => setDevText(false));

describe('이름 표시 함수 하나 (#5·10·28·82)', () => {
  it('밑줄 → 공백, 데이터 이름은 그대로', () => {
    expect(shownName('아란칼_노멀_조')).toBe('아란칼 노멀 조');
    expect(shownName('수석 대원_노멀_참')).toBe('수석 대원 노멀 참');
    expect(shownName('길리안')).toBe('길리안');
  });
  it("'(가칭)' 은 테스트 모드에서만", () => {
    expect(shownName('그랜드피셔(가칭)')).toBe('그랜드피셔');
    setDevText(true);
    expect(devText()).toBe(true);
    expect(shownName('그랜드피셔(가칭)')).toBe('그랜드피셔(가칭)');
  });
  it('방 이름표·사진·도감·전투·탑·카드가 모두 같은 함수를 거친다', () => {
    for (const f of ['src/ui/roomView.ts', 'src/ui/photoView.ts', 'src/ui/dexView.ts', 'src/ui/battleView.ts', 'src/ui/towerView.ts', 'src/ui/bha/itemUi.ts', 'src/ui/rankView.ts', 'src/ui/practiceView.ts']) expect(read(f), f).toContain('shownName(');
  });
});

describe('개발용 문구는 테스트 모드에서만 (시급 10)', () => {
  it("'○ 임시' 칩·임시 태그는 일반 화면에서 숨김, 테스트 모드 시작 때 스위치를 켠다", () => {
    expect(read('src/ui/bha/dom.ts')).toContain('t.hidden = !devText();');
    expect(read('src/ui/bha/v2/components.ts')).toContain('c.hidden = !devText();');
    expect(read('src/ui/testMode.ts')).toContain('setDevText(active);');
    // 직접 만든 임시 태그 없이 공용 함수만
    expect(read('src/ui/bha/nest.ts')).not.toContain("'bha-tag bha-tag--provisional'");
    expect(read('src/ui/bha/dock.ts')).not.toContain("'bha-tag bha-tag--provisional'");
  });
  it("칭호 조건은 일반 화면에 '조건 공개 예정' 한 줄 (11-7 [미정] 그대로), 설정 > 정보에 '임시 수치 있음'", () => {
    const t = read('src/ui/titleDexView.ts');
    expect(t).toContain("TITLE_CONDITION_SOON = '조건 공개 예정'");
    expect(t).toContain('devText() ? [head, body, h(\'p\', \'bha-faint\', TITLE_NOTE)] : [head, body]');
    expect(read('src/ui/settingsView.ts')).toContain("'임시 수치가 있다");
  });
  it("상인 품목 효과 글에 '(가칭)' 이 없다", () => {
    expect(read('src/shop.ts')).not.toMatch(/탭 \(가칭\)/);
  });
});

describe("용어 '포식'·'배부름' (#46·58·81)", () => {
  it('보관함·상점 음식 = 배부름 +n, 펫 효과·도움말도 배부름', () => {
    const save = newSaveData('hollow', 1);
    save.shared.food.snack = 2;
    const food = inventoryOf(save, H).find((e) => e.id === 'food-snack')!;
    expect(food.detail).toMatch(/^배부름 \+\d+/);
    expect(goldRows(save, H).find((r) => r.id.includes('snack'))?.effect ?? '배부름').toMatch(/^배부름 \+\d+/);
    expect(petEffectText('pet-belly', 0)).toContain('배부름');
    expect(read('src/data/help/screens.json')).not.toContain('허기·컨디션');
  });
  it('포식 갈래 문구는 한 곳(absorbModeText)에서 화면·첫 포식 안내가 같이 읽는다 (#47)', () => {
    const m = absorbModeText(H);
    // C.236 (GDD 158장 6): 갈래 이름 = 종족 설정 absorbModeNames
    expect(m.both.label).toBe(H.absorbModeNames.both);
    expect(m.trait.sub).toBe('특성만 · 노력치 없음');
    expect(absorbModeText(S).none.label).toBe(S.absorbModeNames.none);
    expect(read('src/ui/guideView.ts')).toContain('absorbModeText(faction)');
    expect(read('src/ui/guideView.ts')).not.toContain('그 속성 쪽으로 자란다');
  });
});

describe('전투 (#36~40·42)', () => {
  it('피해 숫자는 맞은 쪽 머리 위: 적 = 왼쪽, 나 = 오른쪽 (#38, C.216 GDD 138장 좌우 반전)', () => {
    for (const s of FLOAT_SPOTS) expect(s.left).toBeLessThanOrEqual(30);
    for (const s of HURT_SPOTS) expect(s.left).toBeGreaterThanOrEqual(60);
  });
  it('범례 줄에 해방 설명이 없고 해방 버튼 툴팁으로 (#37), 빈 예고 띠는 안 보임 (#36), 승리 버튼은 행동 (#42)', () => {
    const b = read('src/ui/battleView.ts');
    expect(b).toContain('legendRow.append(libChip, legend);'); // C.183: 상태 칩은 범례 줄에서 빼 필드 아래 가운데로
    expect(b).toContain('libBtn.title = hintFull;');
    expect(b).toContain('하러 가기');
    expect(read('src/ui/bha/battle-scene.css')).toContain('.bha-hgauge.is-idle { visibility: hidden;');
    // C.197 (GDD 122장 2): 전투 중 ▲▼ 숨김은 대체됨 — 늘 보인다
    expect(read('src/ui/bha/device.ts')).not.toContain('up.style.visibility');
  });
  it('튜토리얼 4단계, 본문 2줄 이내, 체인 설명은 블록 3개가 모인 뒤 (#40)', () => {
    expect(TUTORIAL_SCENES.map((s) => s.id)).toEqual(['tray', 'try', 'chain', 'liberation']);
    expect(TUTORIAL_SCENES[1]!.minBlocks).toBe(3);
    expect(read('src/ui/tutorialOverlay.ts')).toContain("blocks < (scene.minBlocks ?? 0)");
    expect(read('src/ui/battleView.ts')).toContain('tutorial?.trayCount(count);');
  });
});

describe('포식 (#44~53)', () => {
  const a = read('src/ui/absorbView.ts');
  it('설명 표 삭제, 갈래 버튼은 왼쪽, 오른쪽은 슬롯 목록 (#44·45)', () => {
    expect(a).not.toContain('info([');
    expect(a).toContain('nodes.push(actions);');
  });
  it('후보 0개 머리 · 기본 선택 = 첫 후보 · 다시 뽑기 숫자 하나 · 교체 단계 새 특성 카드 · 필요한 단계만 (#49~53)', () => {
    expect(a).toContain("'새 특성 없음 — 강화만'");
    expect(a).toContain('(first as HTMLElement | null)?.focus');
    expect(a).toContain('다시 뽑기 · ${n}장');
    expect(a).toContain("candCard(picked!, 'article')");
    expect(a).toContain("variant: 'ghost', size: 'lg', onClick");
    expect(a).toContain('STEP_LABELS.slice(0, need)');
  });
});

describe('보관함·상점 (#54~65)', () => {
  it('스킨 하위 탭 줄이 카드 격자에 눌리지 않는다 (시급 1)', () => {
    expect(read('src/ui/bha/shop.css')).toContain('.bha-itemtabs { flex: none;');
  });
  it("캐릭터 스킨 카드엔 '스킨' 반복 줄 없음, 카드 아래 동작 칩 (#59·61)", () => {
    expect(cardDetailOf({ category: 'skin', detail: '보유', cosmeticCategory: 'skin' })).toBe('');
    expect(cardDetailOf({ category: 'skin', detail: '보유', cosmeticCategory: 'aura' })).not.toBe('');
    expect(actionChipOf({ action: 'use' })).toBe('사용');
    expect(actionChipOf({ action: 'equip' })).toBe('착용');
    expect(actionChipOf({ action: 'take' })).toBe('데리고 가기');
  });
  it("물건 분류에 '타일' 없음 · 타일 탭은 목록·합성만 (#56·57), 슬롯 머리 숫자 = 남는 수 (#55)", () => {
    const l = read('src/ui/lcdScreens.ts');
    expect(bagGroupOf({ id: 'tile-x', category: 'tile' })).toBeNull(); // C.239: 소모품 탭에 타일 없음
    expect(l).toContain('dataset.ownedTiles');
    expect(read('src/ui/buildPanel.ts')).toContain('`남는 ${spare.length}개`');
  });
  it("상점: 가득이면 '가득' · 가진 꾸밈은 상점에서 바로 착용 · 탭 숫자 '판매 n'/'보유 n' (#63~65)", () => {
    const s = read('src/ui/shopView.ts');
    expect(s).toContain("full ? '가득'");
    expect(s).toContain('owned ? toggleWear(row) : openDetail(row)');
    expect(s).toContain('`판매 ${');
    expect(read('src/ui/lcdScreens.ts')).toContain('`보유 ${');
  });
});

describe('훈련장·책장·상태 (#67~75·83·84)', () => {
  it('수련 카드 보상·비용은 칩, 테두리는 선택 전용 (#67·68), 테스트 적은 테스트 모드만 (#70)', () => {
    expect(read('src/ui/trainingView.ts')).toContain("chips.append(chip(rewards.find((x) => x.includes('노력치')) ?? rewards[0]!, 'guard'));"); // C.239 (GDD 159장 44): 대표 효과 칩 하나
    expect(read('src/ui/bha/training.css')).not.toContain(':hover, .bha-train__card.bha-sel');
    expect(read('src/ui/practiceView.ts')).toContain('!e.testOnly || devText()');
  });
  it('제목 토글 아래 설명줄 4px (#69·74), 진화체 도감은 한 목록 + 단계 머리줄 (#73)', () => {
    expect(read('src/ui/bha/screens-lcd.css')).toContain('.bha-lcdpage__title:has(.bha-viewtitle) + .bha-lcdpage__sub { margin-top: var(--bha-sp-2); }');
    const d = read('src/ui/dexView.ts');
    expect(d).not.toContain('seg(');
    expect(d).toContain('caption');
    expect(read('src/ui/titleDexView.ts')).toContain("logo: logoMark(faction, 'bha-logo--md')");
  });
  it('상태: 장비 칸이 왼쪽 상태 아래, 능력치 2열 (#83·84)', () => {
    expect(read('src/ui/lcdScreens.ts')).toContain('[status, gear, holdingsPanel'); // C.176: 광기·자아 설명 패널 → ⓘ 창
    expect(read('src/ui/bha/screens-lcd.css')).toContain('.bha-care-page .bha-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));');
  });
});
