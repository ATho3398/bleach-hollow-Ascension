// C.163 (GDD 99장 1·2·3·6): 스크롤 튐 · 수련장 세 화면 제목 토글 · 기기 탭 정리 · 새 버전 알림 가운데 큰 버튼
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COSMETIC_ITEMS, getCosmetic, skinListed } from '../src/data/shop';

const read = (p: string) => readFileSync(p, 'utf8');

describe('C.163 1 스크롤 튐', () => {
  it('다시 세기(refresh)에서는 scrollIntoView 하지 않고 ▲▼(move)에서만', () => {
    const d = read('src/ui/bha/device.ts');
    const refresh = d.slice(d.indexOf('function refresh(): void'), d.indexOf('function move('));
    expect(refresh).not.toContain('scrollIntoView');
    const move = d.slice(d.indexOf('function move('), d.indexOf('function confirm('));
    expect(move).toContain('scrollIntoView');
    expect(refresh).toContain('(cur?.el ?? null) !== (prev[prevIdx]?.el ?? null)'); // 항목 객체가 아니라 요소로 비교
  });
});

describe('C.163 2 수련장 세 화면 제목 토글', () => {
  it('훈련 인형·번호 쟁탈전 화면도 같은 trainingTitle, 서로 바꿔 끼운다', () => {
    const app = read('src/ui/app.ts');
    expect(app).toContain("title: trainingHead(faction, 'practice')");
    expect(app).toContain("title: trainingHead(faction, 'rank')");
    expect(app).toContain('function switchTraining(');
    expect(read('src/ui/trainingView.ts')).toContain("title: trainingTitle(faction, title, 'train', hd.onSwitch)");
    expect(read('src/ui/practiceView.ts')).toContain('title: h.title ??');
    expect(read('src/ui/rankView.ts')).toContain('title: h.title ??');
  });
  it('목록이 열리면 머리 줄이 본문 위 층 (훈련 인형 필터가 목록을 덮지 않게)', () => {
    expect(read('src/ui/bha/screens-lcd.css')).toContain('.bha-lcdpage__head:has(.bha-viewtitle__list:not([hidden])) { position: relative; z-index: var(--bha-z-sticky); }');
  });
});

describe('C.163 3 기기 탭 = 실제 기기 디자인만', () => {
  it('껍데기 색(shell)·견본·시험 기기는 목록에서 빠진다 (데이터는 그대로)', () => {
    for (const id of ['shell-bone', 'shell-ink', 'shell-gold', 'device-sample', 'device-vtest', 'device-vround']) {
      expect(getCosmetic(id)).toBeDefined();
      expect(skinListed(getCosmetic(id))).toBe(false);
    }
    for (const id of ['device-badge', 'device-zaraki']) expect(skinListed(getCosmetic(id))).toBe(true);
    expect(COSMETIC_ITEMS.filter((c) => c.category === 'device' && skinListed(c)).map((c) => c.id)).toEqual(['device-badge', 'device-zaraki']);
  });
  it('상점·보관함 기기 하위 탭은 deviceCards(기본 + 가진 정식 기기, 미리보기 그림)', () => {
    for (const f of ['src/ui/shopView.ts', 'src/ui/lcdScreens.ts']) expect(read(f)).toContain('deviceCards(save, faction,');
    const dc = read('src/ui/bha/deviceCards.ts');
    expect(dc).toContain("{ id: null, name: '기본'");
    expect(dc).toContain('imageArt(`${BASE}${e.front}`)');
  });
});

describe('C.163 6 새 버전 알림', () => {
  it('LCD 안 가운데 창(막) + 큰 가로 [다시 시작] + 작은 [나중에]', () => {
    const u = read('src/ui/updateBanner.ts');
    expect(u).toContain("'bha-overlay bha-overlay--in-app bha-update'");
    expect(u).toContain("label: '다시 시작', icon: 'i-loop', variant: 'primary', size: 'lg', block: true");
    expect(u).toContain("label: '나중에', variant: 'ghost', size: 'small'");
    expect(u).toContain('getOverlayHost().append(layer)');
    expect(read('src/ui/installView.ts')).toContain('브라우저 안내도 뜨지 않아요');
  });
});
