// C.245 (GDD 162장): 튜토리얼 안내 창이 강조 대상·주인공을 가리지 않게(공용 자리 고르기) · 회복 안내 먹이 단계 재검수
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getFaction } from '../src/data/factions';
import { helpVars, renderHelpText, RECOVER_SCENES } from '../src/data/help';
import { placeCardBox } from '../src/ui/helpLayout';

const read = (p: string) => readFileSync(p, 'utf8');
const by = Object.fromEntries(RECOVER_SCENES.map((s) => [s.id, s]));

describe('162장 1 안내 창 자리', () => {
  it('온천 쉬기 카드는 온천 체력 막대를 가리키고(가운데에 떠 온천 캐릭터를 덮지 않게), 주인공(방·온천 캐릭터)은 늘 피한다', () => {
    expect(by['spa-rest']!.targets).toEqual(['@.bha-spa__status']);
    const o = read('src/ui/tutorialOverlay.ts');
    expect(o).toContain("const SUBJECTS = ['@.bha-char', '@.bha-spa__actor'];");
    expect(o).toContain('...OPEN_WINDOWS, ...SUBJECTS,');
    // 자리는 강조 테두리까지 넓힌 대상으로 잰다 · 모든 장면에서 카드가 대상을 덮게 되면 다시 놓는다
    expect(o).toContain('placeCardBox(keep,');
    expect(o).toContain('rectsOverlap(hostRect(card), padRect(r, TUTORIAL_HOLE_PAD))');
  });
  it('대상 없는 카드: 가운데·위·아래가 막히면 모서리로', () => {
    const vp = { width: 628, height: 360 };
    const card = { width: 240, height: 120 };
    // 가운데 캐릭터 + 위 띠 + 아래 독을 보호 → 모서리
    const prot = [{ left: 250, top: 100, width: 130, height: 150 }, { left: 260, top: 0, width: 200, height: 100 }, { left: 0, top: 300, width: 628, height: 60 }];
    const p = placeCardBox(null, card, vp, prot);
    expect(p.side).toBe('corner');
    expect(p.clear).toBe(true);
  });
});

describe('162장 2 먹이 단계', () => {
  it('제목·할 일은 종족 이름(호로 먹이 / 사신 식사)과 먹이 이름에서, 2줄·"~해 보자"', () => {
    const feed = by.feed!;
    expect(feed.title).toBe('{nestActionsShort.feed}');
    for (const fid of ['hollow', 'shinigami'] as const) {
      const f = getFaction(fid);
      const vars = { ...helpVars(f), foodName: f.foodNames.basic };
      expect(renderHelpText(feed.title, vars)).toBe(f.nestActionsShort!.feed);
      const body = renderHelpText(feed.body, vars);
      expect(body.split('\n')).toHaveLength(2);
      expect(body).toMatch(/보자\.$/);
      expect(body).toContain(f.foodNames.basic);
      for (const st of feed.stages!) expect(st.body).toBe(feed.body); // 단계가 바뀌어도 같은 할 일(다시 시키지 않음)
    }
    expect(JSON.stringify(RECOVER_SCENES)).not.toContain('먹이를 줘');
  });
  it('먹으면 연출이 끝난 뒤 [다음] 없이 결과 카드로 · 연출 중에는 창을 숨김 · 결과 카드는 펼친 먹이 줄을 닫고 말풍선을 피함', () => {
    const app = read('src/ui/app.ts');
    expect(app).toMatch(/bha-homedock__food\[data-food="\$\{TR\.food\}"\]`, autoFinish: true/);
    expect(app).toContain(`done: { show: () => document.querySelector<HTMLButtonElement>('.bha-homedock__carebtn--feed[aria-expanded="true"]')?.click() }`);
    expect(read('src/ui/tutorialOverlay.ts')).toContain('if (actionBusy()) return showCard(false);');
    expect(by.done!.avoid).toEqual(['@.bha-room__bubble']);
    expect(by.done!.body).toBe('배가 든든해졌다.\n방에서 쉬어도 체력이 조금씩 찬다.');
  });
});
