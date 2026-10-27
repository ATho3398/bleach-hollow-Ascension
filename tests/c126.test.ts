// C.126 안내 문구 줄바꿈(GDD 73장) · 첫 시작 탄생 연출(GDD 74장)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FACTIONS } from '../src/data/factions';
import { BIRTH_FX_KINDS, parseFactionConfig } from '../src/engine/faction';
import { GUIDE_IDS, guidePending, markGuideDone, newHelpState, queueGuide, sanitizeHelpState } from '../src/engine/tutorial';
import { parseLines } from '../src/ui/bha/lines';
import { flickerKeyframeOffsets, flickerOffsets, planBirth, seeded, stagger } from '../src/ui/birthPlan';

const read = (p: string) => readFileSync(p, 'utf8');

describe('73장 안내 문구 줄바꿈', () => {
  it('parseLines: 줄 나누기·빈 줄 버림·**이름** 굵게, 짝이 안 맞는 **는 글자 그대로', () => {
    expect(parseLines('가나\n\n다라 ')).toEqual([[{ b: false, s: '가나' }], [{ b: false, s: '다라' }]]);
    expect(parseLines('**둘 다 포식** 특성 + 노력치')).toEqual([[{ b: true, s: '둘 다 포식' }, { b: false, s: ' 특성 + 노력치' }]]);
    expect(parseLines('앞 **굵게** 뒤 **끝')[0]!.map((g) => g.s).join('')).toBe('앞 굵게 뒤 **끝');
    expect(parseLines('')).toEqual([]);
  });

  it('첫 포식 2/3 "포식 네 갈래": 항목마다 한 줄, 이름 굵게 (이어 붙인 · 없음)', () => {
    const g = JSON.parse(read('src/data/help/guides.json')).guides['first-absorb'][1] as { body: string };
    const lines = parseLines(g.body);
    expect(lines).toHaveLength(5);
    expect(lines.slice(0, 4).every((l) => l[0]!.b)).toBe(true);
    expect(g.body).not.toContain(' · ');
  });

  it('안내·튜토리얼 문구: 한 줄에 문장이 둘 이상 이어 붙어 있지 않다 (문장마다 줄바꿈)', () => {
    for (const f of ['guides', 'tutorial']) {
      const raw = JSON.parse(read(`src/data/help/${f}.json`)) as { guides?: Record<string, { body: string; done?: string }[]>; scenes?: { body: string; done?: string }[] };
      const scenes = f === 'guides' ? Object.values(raw.guides!).flat() : raw.scenes!;
      for (const sc of scenes) for (const text of [sc.body, sc.done ?? '']) for (const line of text.split('\n')) expect(line, line).not.toMatch(/\.\s+\S/);
    }
  });

  it('타일 안내(64장)·전투 튜토리얼 블록 바 역할도 항목마다 한 줄', () => {
    const g = JSON.parse(read('src/data/help/guides.json')).guides;
    expect(parseLines(g['tile-plan'][1].body).filter((l) => l[0]!.b)).toHaveLength(4);
    expect(parseLines(g['tile-draw'][1].body).filter((l) => l[0]!.b)).toHaveLength(4);
    // C.171(GDD 100장 #40): 블록 바 역할은 본문 줄 대신 카드 안 샘플 블록 3개로
    const tray = (JSON.parse(read('src/data/help/tutorial.json')).scenes as { id: string; body: string; sample?: string[] }[]).find((s) => s.id === 'tray')!;
    expect(tray.sample).toHaveLength(3);
  });

  it('렌더는 공용 한 곳: 튜토리얼 카드·도움말 상세가 같은 linesBody 를 쓴다', () => {
    expect(read('src/ui/tutorialOverlay.ts')).toContain('linesBody(');
    expect(read('src/ui/helpView.ts')).toContain('linesBody(');
  });
});

describe('74장 첫 시작 탄생 연출', () => {
  it('종족 설정: 두 종족 모두 birthFx 가 검증을 통과하고 약 3초, 색은 토큰 이름뿐', () => {
    const tokens = [read('src/ui/bha/design-system/tokens.css'), read('src/ui/bha/design-system/theme-hollow.css'), read('src/ui/bha/design-system/theme-shinigami.css')].join('\n');
    for (const f of FACTIONS) {
      expect(f.birthFx, f.id).toBeDefined();
      const total = f.birthFx!.steps.reduce((a, s) => a + s.ms, 0);
      expect(total).toBeGreaterThanOrEqual(2600);
      expect(total).toBeLessThanOrEqual(3800);
      for (const s of f.birthFx!.steps) expect(BIRTH_FX_KINDS).toContain(s.fx);
      for (const tok of Object.values(f.birthFx!.colors)) expect(tokens, tok).toContain(`${tok}:`);
      expect(f.birthFx!.steps.at(-1)!.fx).toBe('reveal');
    }
  });

  it('종족 차이는 설정에서만: 호로 = 사슬·불탐·불꽃, 사신 = 깜빡임·섬광 (공통 재생기에 종족 분기 없음)', () => {
    const kinds = (id: string) => FACTIONS.find((f) => f.id === id)!.birthFx!.steps.map((s) => s.fx);
    expect(kinds('hollow')).toEqual(['orb', 'chain', 'burn', 'flames', 'reveal']);
    expect(kinds('shinigami')).toEqual(['orb', 'flicker', 'flash', 'reveal']);
    const player = read('src/ui/birthFx.ts');
    expect(player).not.toMatch(/hollow|shinigami|faction\.id|=== 'hollow'/);
  });

  it('설정 검증: 알 수 없는 효과·너무 긴 단계·토큰이 아닌 색은 거부', () => {
    const base = JSON.parse(read('src/data/factions/hollow.json')) as Record<string, unknown>;
    const bad = (birthFx: unknown) => () => parseFactionConfig({ ...base, birthFx });
    expect(bad({ steps: [{ fx: 'boom', ms: 500 }], colors: {} })).toThrow(/birthFx/);
    expect(bad({ steps: [{ fx: 'orb', ms: 9000 }], colors: {} })).toThrow(/birthFx/);
    expect(bad({ steps: [{ fx: 'orb', ms: 500 }], colors: { orb: '#fff' } })).toThrow(/birthFx/);
    expect(bad({ steps: [], colors: {} })).toThrow(/birthFx/);
    expect(bad({ steps: [{ fx: 'orb', ms: 500 }], colors: { orb: '--bha-accent' } })).not.toThrow();
  });

  it('시각표: 단계를 차례로 이어 붙이고, 동작 줄이기면 짧은 한 단계', () => {
    const fx = FACTIONS.find((f) => f.id === 'hollow')!.birthFx!;
    const p = planBirth(fx);
    expect(p.steps.map((s) => s.at)).toEqual([0, 500, 1000, 2000, 2800]);
    expect(p.total).toBe(3400);
    expect(planBirth(fx, true)).toEqual({ steps: [{ fx: 'reveal', ms: 400, at: 0 }], total: 400 });
  });

  it('깜빡임은 점점 빨라진다 · 키프레임 위치는 오름차순 0~1 · 낱개 지연은 균등 · 가짜 난수는 결정적', () => {
    const o = flickerOffsets(7);
    const gaps = o.slice(1).map((v, i) => v - o[i]!);
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]!).toBeLessThan(gaps[i - 1]!);
    const k = flickerKeyframeOffsets(7);
    expect(k[0]).toBe(0);
    expect(k.at(-1)).toBe(1);
    for (let i = 1; i < k.length; i++) expect(k[i]!).toBeGreaterThanOrEqual(k[i - 1]!);
    expect(stagger(4, 400)).toEqual([0, 100, 200, 300]);
    expect(stagger(4, 400, true)).toEqual([300, 200, 100, 0]);
    expect(seeded(3, 5)).toBe(seeded(3, 5));
    for (let i = 0; i < 20; i++) expect(seeded(i)).toBeGreaterThanOrEqual(0), expect(seeded(i)).toBeLessThan(1);
  });

  it("본 여부는 세이브 형식을 올리지 않고 help.guides['birth'] 에 (67장 first-run 과 같은 방식)", () => {
    expect(GUIDE_IDS).toContain('birth');
    const h = newHelpState();
    expect(guidePending(h, 'birth')).toBe(false);
    queueGuide(h, 'birth');
    expect(guidePending(h, 'birth')).toBe(true);
    expect(sanitizeHelpState(JSON.parse(JSON.stringify(h))).guides.birth).toBe('pending');
    markGuideDone(h, 'birth');
    expect(sanitizeHelpState(JSON.parse(JSON.stringify(h))).guides.birth).toBe('done');
    queueGuide(h, 'birth'); // 본 것은 다시 대기로 안 돌아간다
    expect(h.guides.birth).toBe('done');
    expect(sanitizeHelpState({ guides: { nope: 'pending' } }).guides).toEqual({});
  });

  it('연결: 새 세이브에서만 대기로 올리고, 방에서 재생해 본 것으로 저장하며, 건너뛰기·다시 보기가 있다', () => {
    const app = read('src/ui/app.ts');
    expect(app).toContain("queueGuide(save.help, 'birth')");
    expect(app).toContain("guidePending(s.help, 'birth')");
    expect(app).toContain("markGuideDone(save.help, 'birth')");
    expect(app).toContain("label: '탄생 연출'");
    const player = read('src/ui/birthFx.ts');
    expect(player).toContain('bha-birth__skip');
    expect(player).toContain('registerLayer(');
    const css = read('src/ui/bha/birth.css');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/rgb\(/);
    expect(css).toContain('prefers-reduced-motion');
    // 등장 모션은 .bha-char 의 translate 자리 잡기를 덮어쓰면 안 된다 (transform 대신 scale)
    const pop = css.slice(css.indexOf('@keyframes bha-birth-pop'), css.indexOf('}', css.indexOf('to {', css.indexOf('@keyframes bha-birth-pop'))) + 1);
    expect(pop).not.toContain('transform');
    expect(pop).toContain('scale:');
    expect(css).toContain('.bha-room.is-born .bha-char > *'); // 상자가 아니라 안쪽 요소에
  });
});
