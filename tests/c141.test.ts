// C.141 (GDD 84장 9 · 85장 11 · 86장): 광기·자아 설명 · 타일 카드·끌어놓기·프리셋 패널 · 상점·보관함 카드 UI
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { getFaction } from '../src/data/factions';
import { BALANCE } from '../src/config/balance';
import { riskText, riskZones, zoneLines } from '../src/data/help/riskText';
import { GLOSSARY, helpVars, renderHelpText } from '../src/data/help';
import { cellAction, handCounts } from '../src/ui/bha/road';
import { presetPreview } from '../src/ui/bha/tilePresets';
import { nextFocusIndex } from '../src/ui/bha/modalFocus';

const read = (p: string) => readFileSync(p, 'utf8');
const RX = BALANCE.provisional.risk;

describe('C.141', () => {
  it('84장 9: 광기·자아 설명은 balance 값에서 읽은 숫자로 손해를 적는다 (두 종족)', () => {
    for (const id of ['hollow', 'shinigami']) {
      const f = getFaction(id);
      const t = riskText(f);
      const all = [t.riskTip, ...t.riskDoes, ...zoneLines(riskZones(f)), ...t.riskUp, ...t.riskDown, ...t.stabilityDoes, ...t.stabilityMove].join('\n');
      for (const n of [RX.frenzyDamageDealt * 100 - 100, RX.frenzyDamageTaken * 100 - 100, RX.frenzyConditionLoss, RX.breakthroughStabilityLoss, RX.riskAfterBreakthrough, RX.perVoidBlock, RX.releaseRelief, RX.restRelief, RX.stabilityStart]) expect(all).toContain(String(n));
      expect(all).toContain(`+${Math.round(RX.breakthroughSpawnBonus * 100)}%`);
      expect(t.riskDoes[0]).toContain('직접 손해가 없고');
      expect(t.stabilityDoes[0]).toContain('해방 게이지');
      expect(all).toContain(f.riskGaugeName);
      expect(all).toContain(f.stabilityName);
    }
  });
  it('84장 9: 도움말 용어(광기·자아)가 손해 문구로 렌더되고 자리표시자가 남지 않는다', () => {
    for (const id of ['hollow', 'shinigami']) {
      const f = getFaction(id);
      const vars = helpVars(f);
      for (const tid of ['risk-gauge', 'stability']) {
        const term = GLOSSARY.find((g) => g.id === tid)!;
        const body = renderHelpText(term.body, vars);
        expect(body).toContain('손해');
        expect(body).not.toMatch(/\{[A-Za-z.]+\}/);
        expect(body).toContain(tid === 'risk-gauge' ? String(RX.frenzyConditionLoss) : String(RX.breakthroughStabilityLoss));
      }
    }
  });
  it('84장 9: 광기·자아 설명은 상태 막대 이름 옆 ⓘ 창 (C.176 GDD 104장 2 — 옛 설명 패널 대체)', () => {
    expect(read('src/ui/lcdScreens.ts')).not.toContain('explain.dataset.riskExplain');
    expect(read('src/ui/bha/nest.ts')).toContain("withTip(meter({ kind: 'stab'");
    expect(read('src/ui/bha/statusInfo.ts')).toContain('riskText(f)');
  });
  it('85장 11: 손 타일은 카드, 끌어놓기는 눌러 고르기와 같은 규칙(onCell)으로 처리한다', () => {
    const src = read('src/ui/bha/road.ts');
    expect(src).toContain('bha-tilecard');
    expect(src).toContain("window.addEventListener('pointermove'");
    expect(src).toContain('onCell(i)'); // 놓기 = 선택 흉내 + 칸 누름
    expect(src).not.toContain('bha-tilechip bha-tilechip--');
    // 놓은 칸을 손 영역에 끌어 놓으면 되돌리기 = 같은 칸을 다시 누른 것
    expect(cellAction({ slot: 'x', editable: true, selection: { kind: 'cell', cell: 3 }, index: 3 })).toBe('return-hand');
    expect(cellAction({ slot: null, editable: false, selection: { kind: 'cell', cell: 3 }, index: 5 })).toBe('move');
    expect(cellAction({ slot: null, editable: false, selection: { kind: 'hand', tileId: 'a' }, index: 5 })).toBe('place');
    expect(handCounts(['a', 'b', 'a'])).toEqual([{ id: 'a', count: 2 }, { id: 'b', count: 1 }]);
    const css = read('src/ui/bha/expedition.css');
    expect(css).toContain('.bha-road__cell.is-drop');
    // C.170 (GDD 100장 #24): 배치판을 display: contents 로 풀어 화면 격자(왼쪽 길 · 오른쪽 손패)에 바로 놓는다
    expect(css).toContain('.bha-lcd .bha-plan .bha-road__wrap { display: contents; }');
  });
  it('85장 11: 프리셋 패널 — 칸 미리보기와 저장·불러오기·덮어쓰기·이름·삭제 버튼, 두 화면이 같이 쓴다', () => {
    const pv = presetPreview([null, 'prey-nest-a', null, 'rest-a', null]);
    expect(pv.map((c) => c.css)).toEqual(['prey', null, 'rest', null]);
    const src = read('src/ui/bha/tilePresets.ts');
    for (const k of ['presetSave', 'presetLoad', 'presetOverwrite', 'presetRename', 'presetDelete']) expect(src).toContain(k);
    expect(read('src/ui/planView.ts')).toContain('presetPanel(');
    // C.171(GDD 100장 #57): 배치·프리셋은 원정 출발 화면에서만, 보관함 타일 탭은 가진 타일 목록·합성만
    expect(read('src/ui/lcdScreens.ts')).not.toContain('presetPanel(');
    expect(read('src/ui/lcdScreens.ts')).not.toContain('roadPlanner(');
  });
  it('85장 11: 도움말·화면 문구에 남은 "덱" 칸 안내가 없다 (타일 덱 → 가진 타일)', () => {
    for (const f of ['src/data/help/guides.json', 'src/data/help/screens.json', 'src/data/help/tutorial.json', 'src/data/help/glossary.json']) expect(read(f)).not.toContain('덱');
    for (const [f, w] of [['src/ui/hogyokuView.ts', '타일 덱'], ['src/ui/rebirthView.ts', '타일 덱'], ['src/ui/expeditionView.ts', "'덱 밖'"], ['src/ui/expeditionView.ts', '덱 보관']]) expect(read(f!)).not.toContain(w!);
  });
  it('86장: 상점은 카테고리 탭 + 카드 격자(2줄이 보이는 높이) + 구매 상세 창(수량·가격 버튼)', () => {
    const src = read('src/ui/shopView.ts');
    for (const k of ['categoryTabs(', 'itemGrid(', 'itemDialog(', "heading: '상품 구매'", 'maxQty']) expect(src).toContain(k);
    expect(src).toContain("tag: cos?.category === 'skin' ? '미리보기'");
    const css = read('src/ui/bha/shop.css');
    expect(css).toMatch(/\.bha-itemgrid \{[^}]*grid-auto-rows: 118px/);
    expect(css).toContain('.bha-itemmodal');
  });
  it('86장: 보관함 물건 탭 = 카테고리 탭(음식·소모품·장비·스킨·타일·기타) + 카드 + 상세 창([사용]/[장착]/[해제])', () => {
    const src = read('src/ui/lcdScreens.ts');
    expect(src).toContain('categoryTabs(BAG_GROUPS.map('); // C.239 (GDD 159장 24): 소모품 탭 = 음식·약·전투 소모품
    // 장비 탭은 C.150 에 '준비 중' → 장비 카드·상세 창(장착·강화·판매, GDD 91장)
    for (const k of ["label: () => '사용'", "(on ? '장착' : '해제')", 'openGear(faction, save, e.id, changed)']) expect(src).toContain(k);
  });
  it('86장: 상점·보관함 상세 창은 공용 모달 초점 규칙을 쓴다', () => {
    const src = read('src/ui/bha/itemUi.ts');
    expect(src).toContain('trapModalFocus(layer)');
    expect(src).toContain('registerLayer(layer, close)');
    expect(nextFocusIndex(-1, 3, false)).toBe(0);
  });
});
