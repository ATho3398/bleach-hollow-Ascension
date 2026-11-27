// C.553 (GDD 5-5 v6.227 마주침 창 꾸밈, 사용자 2026-11-27 "우라하라 조우 ui 우라하라도 좀 띄우고 이쁘게해봐"):
// 모험 중 우라하라 마주침 확인 창 = 왼쪽 우라하라 도트(prop-wanderer, 픽셀 그대로·등장 때 살짝 튀어 오름, 움직임 줄이기면 없음) + 오른쪽 제목·[확인 (5)].
// 머묾 안내 문구는 없음(v6.228 사용자 "시장에 머문다 문구 없애").
// 자동 확인 5초·기기 ✓·뒤로 = 확인 규칙 그대로. bha 토큰만(새 색 없음), 종족 분기 없음
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { artUrls } from '../src/data/art/manifest';
import { WANDERER_TEXT } from '../src/data/shop';

const read = (p: string): string => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const view = read('src/ui/expeditionView.ts');
const dialog = read('src/ui/confirmDialog.ts');
const market = read('src/ui/bha/market.css');
const comps = read('src/ui/bha/components/components.css');
const wmeetCss = market.slice(market.indexOf('/* 우라하라 마주침 창 꾸밈'));
const figCss = comps.slice(comps.indexOf('/* 그림 창 (C.553'), comps.indexOf('.bha-modal__main > :not('));

describe('C.553 우라하라 마주침 창 꾸밈', () => {
  it('머묾 안내 문구 없음 (v6.228): 데이터·창 호출 어디에도 \'시장에 머문다\'가 없다', () => {
    expect(Object.keys(WANDERER_TEXT).sort()).toEqual(['chipLabel', 'meet', 'meetOk']);
    expect(JSON.stringify(WANDERER_TEXT)).not.toContain('머문다');
    expect(view).not.toContain('머문다');
    expect(read('src/ui/bha/wandererChip.ts')).not.toContain('머문다');
  });

  it('우라하라 도트 그림이 있다 (prop.wanderer → prop-wanderer.png)', () => {
    const src = artUrls('prop.wanderer').src;
    expect(src).toMatch(/prop-wanderer\.(png|webp)$/);
    expect(existsSync(new URL('../public/art/prop-wanderer.png', import.meta.url))).toBe(true);
  });

  it('마주침 창: 그림을 넘기고(본문 없음) 자동 확인·뒤로 = 확인은 그대로', () => {
    const call = view.slice(view.indexOf("cls: 'bha-wmeet'") - 200, view.indexOf("cls: 'bha-wmeet'") + 500);
    expect(call).toContain('figure: wandererMeetFigure()');
    expect(call).not.toContain('body:');
    expect(call).toContain('autoYesSeconds: BALANCE.provisional.wanderer.confirmSeconds');
    expect(call).toContain('onYes: resume, onCancel: resume');
    expect(call).toContain('single: true');
    expect(call).not.toMatch(/hollow|shinigami|factionId ===/);
  });

  it('공용 확인 창: figure 가 있으면 [그림 | 제목·본문·버튼] 두 칸, 없으면 옛 창 그대로', () => {
    expect(dialog).toMatch(/figure\?: HTMLElement;/);
    expect(dialog).toContain("o.figure ? 'bha-modal bha-modal--figure' : 'bha-modal'");
    expect(dialog).toContain("const main = o.figure ? el('div', 'bha-modal__main') : modal;");
    expect(dialog).toContain('modal.append(fig, main);');
    expect(dialog).toContain('main.append(actions);');
    expect(dialog).toContain("fig.setAttribute('aria-hidden', 'true')");
  });

  it('CSS: 픽셀 그대로 정수 배율(한 도트 2px = 112px 폭), 등장 튀어 오름 ≈0.3초, 움직임 줄이기면 없음', () => {
    expect(wmeetCss).toMatch(/\.bha-wmeet__fig \{[^}]*width: 112px;/);
    expect(wmeetCss).toMatch(/\.bha-wmeet__fig \{[^}]*image-rendering: pixelated;/);
    expect(wmeetCss).toMatch(/animation: bha-wmeet-hop var\(--bha-dur-4\)/);
    expect(wmeetCss).toContain('@keyframes bha-wmeet-hop');
    expect(wmeetCss).toMatch(/prefers-reduced-motion: reduce\) \{ \.bha-wmeet__fig \{ animation: none; \} \}/);
    expect(comps).toContain('.bha-modal.bha-modal--figure { flex-direction: row;');
  });

  it('새 색·간격 없음: 더한 CSS 는 토큰만 (hex·rgb 색 없음, 간격은 --bha-sp-*)', () => {
    for (const css of [wmeetCss, figCss]) {
      expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(css).not.toMatch(/rgba?\(/);
      for (const m of css.matchAll(/(?:padding|margin(?:-top|-bottom)?|gap): ([^;]+);/g)) expect(m[1]).toMatch(/^(0|var\(--bha-sp-\d\)|calc\(-1 \* var\(--bha-sp-\d\)\))( (0|var\(--bha-sp-\d\)))*$/);
    }
  });
});
