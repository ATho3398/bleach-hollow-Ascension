// C.547 (GDD 6-2 v6.216, 사용자 2026-11-27 "모험도 그 특수던전처럼 ui바꿔야된다니까"):
// 모험 준비 [준비] 탭 = 특수던전·수련장과 같은 틀(bha-sdg) — 왼쪽 사냥터 3곳 목록, 오른쪽 그림(무대 배경)·이름·설명·★·길 미리보기·[출발].
// 머리 제목 토글(자유 모험/스토리)·[준비]/[타일 배치] 탭·[출발] 규칙(체력 n%·낮은 체력 확인 창·빈사)·[타일 배치] 탭은 그대로.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getFaction } from '../src/data/factions';
import { GROUNDS } from '../src/data/grounds';
import { elementName } from '../src/data/elements';
import { groundBgId, groundName } from '../src/engine/faction';
import { groundElementsText, groundInfo, lowDepartHp } from '../src/ui/planView';

const read = (p: string) => readFileSync(p, 'utf8');
const pv = read('src/ui/planView.ts');
const css = read('src/ui/bha/expedition.css');
const FACTIONS = ['hollow', 'shinigami'];

describe('[준비] 탭 = 특수던전식 틀 (bha-sdg 재사용)', () => {
  it('왼쪽 목록·항목·오른쪽 그림 칸·자물쇠·[출발] 줄 = 특수던전·수련장 클래스 그대로, 끌어 넘기기', () => {
    for (const c of ["'bha-sdg__list bha-plan__grounds'", 'bha-sdg__item', "'bha-sdg__stage bha-plan__stage'", "'bha-sdg__art bha-plan__art'", "'bha-sdg__info bha-plan__info'", "'bha-sdg__lock'", "'bha-sdg__cap'", "'bha-sdg__title'", "'bha-sdg__go'", 'enableDragScrollY(grounds)']) {
      expect(pv).toContain(c);
    }
    // 오른쪽 = 그림 · (설명 · ★ · 길 미리보기 · [출발])
    expect(pv).toContain('stage.append(gArt, info);');
    expect(pv).toContain('info.append(desc, diff, planner ? miniRow : sub);');
    expect(pv).toContain('prep.append(grounds, stage);');
  });
  it('그림 = 그 사냥터 무대 배경(걷기·전투와 같은 그림, 종족 설정 huntingGrounds.bg)', () => {
    expect(pv).toContain('const bg = groundSceneBg(faction, g.id);');
    expect(pv).toContain('sceneBgEl(bg, false)');
    for (const fid of FACTIONS) {
      const f = getFaction(fid);
      for (const g of GROUNDS) expect(groundBgId(f, g.id)).toBeTruthy();
    }
  });
  it('종족 분기 없음 · 새 색 없음 · 간격은 토큰', () => {
    expect(pv).not.toMatch(/'hollow'|'shinigami'/);
    const mine = css.slice(css.indexOf('/* 모험 준비 [준비] 탭 = 특수던전식 목록'), css.indexOf('.bha-plan__rec {'));
    expect(mine.length).toBeGreaterThan(100);
    expect(mine).not.toMatch(/#[0-9a-f]{3,6}\b|rgba?\(/i);
    expect(mine).toContain('grid-template-columns: minmax(0, 1fr) minmax(0, 2.2fr)'); // 수련장·특수던전과 같은 1 : 2.2
    expect(css).toContain('.bha-lcd .bha-app.bha-plan.is-place > .bha-plan__prep { display: none; }');
  });
});

describe('왼쪽 = 사냥터 3곳 (이름 + 자주 나오는 속성, 잠긴 곳 자물쇠·흐림)', () => {
  it('3곳 · 이름은 종족 설정 · 작은 글자 = 자주 나오는 속성', () => {
    expect(GROUNDS.map((g) => g.id)).toEqual(['outskirts', 'canyon', 'forest']);
    for (const fid of FACTIONS) {
      const f = getFaction(fid);
      GROUNDS.forEach((g, i) => {
        expect(groundName(f, g.id, i)).toBe(f.huntingGrounds![g.id]!.name);
        expect(groundElementsText(f, g)).toBe(`자주 나오는 속성 ${g.elements.map((e) => elementName(e, fid)).join('·')}`);
        expect(groundInfo(f, g)).toContain(groundElementsText(f, g)); // 설명 칸도 같은 말
      });
    }
    expect(pv).toContain("el('small', 'bha-faint', groundElementsText(faction, g))");
  });
  it('열리는 단계 = 첫 곳 기본 · 둘째 3단계 · 셋째 4단계, 잠긴 곳 = 자물쇠 아이콘 + is-locked(점선·흐림)', () => {
    expect(GROUNDS.map((g) => g.unlockTierIndex)).toEqual([0, 2, 3]);
    expect(pv).toContain("el('button', `bha-sdg__item${open ? '' : ' is-locked'}`)");
    expect(pv).toContain("icon(open ? 'i-loop' : 'i-lock')");
  });
  it("잠긴 곳을 고르면 그림 위 'n단계(이름)에 열린다' + [출발] 흐림, 원정 사냥터는 바뀌지 않는다", () => {
    expect(pv).toContain('`${g.unlockTierIndex + 1}단계(${faction.tierNames[g.unlockTierIndex] ?? \'\'})에 열린다`');
    expect(pv).toContain('if (open) chooseGround(exp, g.id);');
    expect(pv).toContain('if (goBtn) goBtn.disabled = !open;');
    expect(pv).toContain('lock.dataset.groundLock');
    // [타일 배치] 탭으로 가면 원정 사냥터로 되돌려 아래 띠 [출발]이 흐린 채 남지 않게
    expect(pv).toContain("if (k === 'place' && !groundOpen(curGround)) pick(");
  });
  it('처음 고른 곳 = 마지막에 간 사냥터(열린 곳만)', () => {
    expect(pv).toContain('pick(GROUNDS.find((g) => g.id === exp.groundId && groundOpen(g)) ?? GROUNDS.find(groundOpen) ?? GROUNDS[0]!);');
    expect(read('src/ui/app.ts')).toContain('return openGrounds(s.evolution.tierIndex).some((g) => g.id === last) ? last : undefined;');
  });
});

describe('오른쪽 = 설명 · 난이도 ★ · 길 미리보기 · [출발]', () => {
  it('★ 버튼·권장 표시·잠긴 ★ 그대로, 길 미리보기 = 작은 네모 12개 + 놓은 타일 n/최대', () => {
    expect(pv).toContain('dataset.difficulty');
    expect(pv).toContain('L.recommended');
    expect(pv).toContain("miniText.append('놓은 타일 ', miniCount);");
  });
  it('[출발] 규칙 그대로: 체력 n% · 낮은 체력 확인 창(그만/출발) · 빈사면 창 없음', () => {
    expect(pv).toMatch(/yes: '출발', no: '그만'/);
    expect(pv).toContain("title: '체력이 낮다'");
    expect(pv).toContain('if (h.hpNoWarn || !lowDepartHp(h.hpFraction)) return depart();');
    expect(pv).toContain("hpEl.append(icon('i-heal'), '체력 '");
    expect(lowDepartHp(0.3)).toBe(true);
    expect(lowDepartHp(0.9)).toBe(false);
  });
  it('[출발] 줄 자리: [준비] = 그림 칸 맨 아래, [타일 배치] = 화면 아래 고정 띠', () => {
    expect(pv).toContain("if (k === 'prep') info.append(go);");
    expect(pv).toContain('else main.append(go);');
    expect(pv).toContain('placeGo(k);');
    expect(css).toContain('.bha-lcd .bha-plan .bha-plan__info > .bha-plan__go { position: static;');
  });
});

describe('기기 조작 = 수련장과 같은 규칙', () => {
  it('▲▼ 목록 · ✓ 고르기 · 고른 항목에서 ✓ 한 번 더 = 하이라이트가 [출발]로(잠긴 곳은 그대로)', () => {
    expect(pv).toContain('if (g !== curGround) return pick(g);');
    expect(pv).toContain("if (goBtn && !goBtn.disabled) goBtn.dispatchEvent(new CustomEvent('bha-goto', { bubbles: true }));");
    expect(pv).toContain("b.setAttribute('role', 'option');");
    // DOM 순서 = 기기 순서: 목록 → 그림 칸(★·[출발])
    expect(pv.indexOf('prep.append(grounds, stage);')).toBeGreaterThan(0);
    expect(pv).toContain("start.dataset.sc = 'go';"); // PC Space = 출발 그대로
  });
});

describe('그대로 둔 것', () => {
  it('머리 제목 토글(자유 모험/스토리) · [준비]/[타일 배치] 탭 · 타일 안내 대상', () => {
    expect(pv).toContain("departTabs('free'");
    expect(pv).toContain("k === 'prep' ? '준비' : '타일 배치'");
    expect(pv).toContain("setMode?.(h.placeOnly ? 'place' : h.startMode ?? 'prep');");
    const guides = read('src/data/help/guides.json');
    expect(guides).toContain('@.bha-plan__modetabs');
    expect(guides).toContain('@.bha-plan__side');
  });
  it('스토리 쪽은 이미 같은 틀(왼쪽 장 목록 · 오른쪽 화 목록) — 바꾸지 않음', () => {
    const sv = read('src/ui/storyView.ts');
    expect(sv).toContain("const { app } = lcdPage(root, { cls: 'bha-story', cols: '2fr 3fr' }, head, [md.list], [md.detail]);");
  });
  it('첫 모험(튜토리얼)은 준비 화면 없이 강제 흐름 그대로', () => {
    expect(read('src/ui/app.ts')).toContain('askDying(s, () => (firstRunPending(s) ? startTutorialRun(faction) : departScreen(faction)));');
  });
  it('GDD 6-2 줄 + 구현 표시', () => {
    const gdd = read('docs/GDD.md');
    const s62 = gdd.slice(gdd.indexOf('### 6-2 모험 준비 화면'), gdd.indexOf('### 6-3'));
    expect(s62).toContain('모험 준비 = 특수던전식 목록 화면');
    expect(s62).toContain('C.547');
  });
});
