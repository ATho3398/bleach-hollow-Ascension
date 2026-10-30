// C.185 (GDD 111장 4 · docs/text-style.md): 설명 문구 말투·서식 통일 — 평서 '~다' 체, 수치 줄 "조건: 효과", 빼기 기호 −, 상태 ⓘ 창 구조
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FACTIONS } from '../src/data/factions';
import { GLOSSARY, GUIDES, guideVars, helpVars, RECOVER_SCENES, renderHelpText, SCREEN_HELPS, SCRIPT_SCENES, TUTORIAL_SCENES } from '../src/data/help';

const SCRIPT_SCENES_LIST = Object.values(SCRIPT_SCENES);
import { riskText, riskZones, stabilityZones, zoneLines } from '../src/data/help/riskText';
import { MINUS, multPct, numLine, pctDelta, range, SECTION, signed, zonesBy } from '../src/data/help/textFormat';
import { TRAITS, traitDescription } from '../src/data/traits';
import { statusChips } from '../src/ui/bha/roomLogic';
import { roomStatusInfo, statusInfo, type StatusInfoKind } from '../src/ui/bha/statusInfo';

const read = (p: string) => readFileSync(p, 'utf8');
const FIDS = FACTIONS.map((f) => f.id);

/** '~요'체·명사형(~함/~됨)·물음·명령(~세요/~하자) 끝 — 설명 문구에 없어야 한다 */
const BAD_END = /(요|함|됨|세요|하자|니다)[.!]?$|\?$/;
const sentences = (text: string): string[] => text.split('\n').flatMap((l) => l.split(/(?<=[.!])\s+/)).map((s) => s.trim()).filter((s) => s !== '');

describe('111장 4: 문구 헬퍼 (textFormat)', () => {
  it('부호·배율·범위·수치 줄', () => {
    expect(signed(3)).toBe('+3');
    expect(signed(-3.25)).toBe(`${MINUS}3.3`);
    expect(MINUS).toBe('−');
    expect(pctDelta(-0.2)).toBe('−20%');
    expect(multPct(1.3)).toBe('+30%');
    expect(multPct(0.85)).toBe('−15%');
    expect(range(0, 24)).toBe('0~24');
    expect(range(5, 5)).toBe('5');
    expect(numLine('광기 100', '주는 피해 +30%', '받는 피해 +60%')).toBe('광기 100: 주는 피해 +30% · 받는 피해 +60%');
  });
  it('zonesBy: 같은 문구가 이어지는 값끼리 한 구간', () => {
    expect(zonesBy(0, 5, (v) => (v <= 2 ? 'a' : 'b'))).toEqual([{ from: 0, to: 2, text: 'a' }, { from: 3, to: 5, text: 'b' }]);
  });
});

describe('111장 4: 상태 ⓘ 창 구조', () => {
  const gauges: StatusInfoKind[] = ['hunger', 'cond', 'stab', 'risk', 'bond'];
  const ailments: StatusInfoKind[] = ['weak', 'tired', 'collapsed', 'dead'];
  it('수치 상태 = 요약 → 하는 일 → 구간별 손해 → 오르내림, 상태 이상 = 요약 → (손해) → 풀리는 법 — 두 종족 같은 순서', () => {
    for (const f of FACTIONS) {
      for (const k of gauges) {
        const d = statusInfo(k, f, 50);
        expect(d.lead.length).toBeGreaterThan(0);
        expect(d.groups.map((g) => g.title), k).toEqual([SECTION.does, SECTION.zones, SECTION.move]);
        // 구간 줄은 모두 "n: …" 또는 "a~b: …", 지금 값(50)이 든 구간 강조
        expect(d.groups[1]!.lines.every((l) => /^\d+(~\d+)?: /.test(l)), k).toBe(true);
        expect(d.groups[1]!.mark, k).toBeGreaterThanOrEqual(0);
      }
      for (const k of ailments) {
        const titles = statusInfo(k, f).groups.map((g) => g.title);
        expect(titles.at(-1)).toBe(SECTION.cure);
        expect(titles.filter((t) => t !== SECTION.loss && t !== SECTION.cure)).toEqual([]);
      }
    }
  });
  it('구간은 0~상한을 빈틈없이 덮는다 (배부름·컨디션·영압 안정도·광기·교감)', () => {
    const f = FACTIONS[0]!;
    for (const k of gauges) {
      const lines = statusInfo(k, f).groups[1]!.lines;
      const spans = lines.map((l) => l.split(':')[0]!.split('~').map(Number));
      expect(spans[0]![0], k).toBe(0);
      for (let i = 1; i < spans.length; i++) expect(spans[i]![0], k).toBe((spans[i - 1]!.at(-1) ?? 0) + 1);
    }
  });
  it('창 문구는 모두 평서체 · 하이픈 빼기 없음 · 이름은 종족 설정', () => {
    for (const f of FACTIONS) {
      for (const k of [...gauges, ...ailments]) {
        const d = statusInfo(k, f, 10);
        for (const t of [d.lead, ...d.groups.flatMap((g) => g.lines)]) {
          expect(t, t).not.toMatch(BAD_END);
          expect(t, t).not.toMatch(/(^|[\s(·])-\d/);
          expect(t, t).not.toMatch(/\([을를이가은는으와과]+\)/); // 조사 자리표시자가 남지 않는다
        }
      }
      expect(JSON.stringify(statusInfo('risk', f))).toContain(f.riskGaugeName);
      expect(JSON.stringify(statusInfo('stab', f))).toContain(f.stabilityName);
      expect(JSON.stringify(statusInfo('hunger', f))).toContain(f.nestActions.feed);
    }
  });
  it('방 상태 ⓘ: 칩마다 한 묶음 + 한 줄 요약', () => {
    const f = FACTIONS[0]!;
    const chips = statusChips({ hunger: 90, condition: 20, risk: 85, weakened: true, tired: true, stability: 30 }, f);
    const doc = roomStatusInfo(chips, f) as { lead: string; groups: { title: string; lines: string[] }[] };
    expect(doc.lead).toMatch(/다$/);
    expect(doc.groups).toHaveLength(chips.length);
  });
  it('광기·영압 안정도 설명(도움말과 ⓘ 창)이 같은 줄을 쓴다', () => {
    for (const f of FACTIONS) {
      const vars = helpVars(f);
      const rt = riskText(f);
      expect(vars.riskZoneText).toBe(zoneLines(riskZones(f)).join('\n'));
      expect(vars.stabilityZoneText).toBe(zoneLines(stabilityZones(f)).join('\n'));
      expect(statusInfo('risk', f).groups[2]!.lines).toEqual([...rt.riskUp, ...rt.riskDown]);
      for (const l of [...rt.riskUp, ...rt.riskDown, ...rt.stabilityMove, ...rt.frenzyLines]) expect(l, l).toMatch(/^[^:]+: \S/);
    }
  });
});

describe('111장 4: 설명 데이터 말투', () => {
  it('도움말(화면 요약·용어 사전)·안내·튜토리얼 문장 끝에 ~요·~함·~됨·물음·명령이 없다', () => {
    for (const fid of FIDS) {
      const fc = FACTIONS.find((f) => f.id === fid)!;
      const vars = { ...helpVars(fc), ...guideVars(fc) };
      const texts = [
        ...SCREEN_HELPS.map((s) => s.body),
        ...GLOSSARY.map((g) => g.body),
        ...Object.values(GUIDES).flat().flatMap((g) => [g.body, g.done ?? '']),
        ...TUTORIAL_SCENES.flatMap((s) => [s.body, s.done ?? '']),
      ];
      for (const t of texts) for (const s of sentences(renderHelpText(t, vars))) expect(s, s).not.toMatch(BAD_END);
    }
  });
  it('튜토리얼·한 번 뜨는 안내 (C.235, GDD 157장): 본문 2줄 이내(흡수 갈래 목록 카드만 예외) · 할 일 줄 "~해 보자" 허용 · "~을 누른다"·칸 수 없음', () => {
    const cards = [
      ...Object.entries(GUIDES).flatMap(([id, list]) => list.map((g) => ({ key: `${id}/${g.id}`, body: g.body }))),
      ...SCRIPT_SCENES_LIST.map((x) => ({ key: `script/${x.id}`, body: x.body })),
      ...RECOVER_SCENES.map((x) => ({ key: `recover/${x.id}`, body: x.body })),
    ];
    for (const c of cards) {
      if (c.key !== 'first-absorb/absorb') expect(c.body.split('\n').length, c.key).toBeLessThanOrEqual(2);
      expect(c.body, c.key).not.toMatch(/누른다|\{tutorialCell\}|한 칸씩/);
    }
    expect(cards.some((c) => /해 보자\.$/.test(c.body))).toBe(true);
    expect('블록 스킬로 적을 더 빨리 쓰러뜨려 보자.').not.toMatch(BAD_END);
  });
  it('특성 설명: 문장은 \'~다.\', 수치는 "효과: …" 줄', () => {
    for (const t of TRAITS) for (const fid of FIDS) {
      const d = traitDescription(t.id, fid);
      const [head, ...fx] = d.split('\n');
      for (const s of sentences(head!)) expect(s, s).toMatch(/다\.$/);
      for (const l of fx) expect(l, l).toMatch(/^효과: /);
    }
  });
  it('종족 설정·진화 특성 설명 문장도 \'~다\'', () => {
    for (const fid of FIDS) {
      const raw = JSON.parse(read(`src/data/factions/${fid}.json`)) as { training: { games: Record<string, { desc: string }> }; tower: { desc: string; locked: string } };
      for (const g of Object.values(raw.training.games)) expect(g.desc).toMatch(/다\.$/);
      expect(raw.tower.desc).toMatch(/다\.$/);
      expect(raw.tower.locked).toMatch(/다$/);
    }
    const ab = JSON.parse(read('src/data/evolution/abilities.json')) as Record<string, Record<string, { description: Record<string, string> }>>;
    for (const group of Object.values(ab)) for (const a of Object.values(group)) for (const d of Object.values(a.description ?? {})) expect(d, d).toMatch(/다\.$/);
  });
  it('확인 창 제목은 물음이 아닌 명사, 본문은 \'~다\' (C.185)', () => {
    for (const p of ['src/ui/app.ts', 'src/ui/battleView.ts', 'src/ui/expeditionView.ts', 'src/ui/settingsView.ts', 'src/ui/hogyokuView.ts', 'src/ui/rebirthView.ts', 'src/ui/backupView.ts']) {
      const src = read(p);
      expect(src, p).not.toMatch(/title: [`'][^`']*\?[`']/);
      expect(src, p).not.toMatch(/body: [`'][^`']*(요|니다)\.?[`']/);
    }
  });
  it('화면 안내 문구에 ~요체·~습니다체가 남지 않는다 (버튼 이름·대사 제외)', () => {
    for (const p of ['src/ui/installView.ts', 'src/ui/startView.ts', 'src/ui/updateBanner.ts', 'src/ui/battleView.ts', 'src/ui/buildPanel.ts']) {
      const strings = [...read(p).matchAll(/'([^'\n]*[가-힣][^'\n]*)'/g)].map((m) => m[1]!).filter((s) => !['알겠어요'].includes(s));
      for (const s of strings) expect(s, `${p}: ${s}`).not.toMatch(/(어요|아요|에요|예요|해요|세요|니다)[.!]?$/);
    }
  });
});

describe('111장 후속: 노멀 skill 특성 설명 = 기본 블록 (C.184 반영)', () => {
  it('노멀 skill 특성 설명은 위력 대신 "고르면 노멀 강화 +1", 다른 특성은 그대로', async () => {
    const { isBasicBlockTrait } = await import('../src/engine/absorb');
    const { traitBrief } = await import('../src/ui/buildPanel');
    for (const t of TRAITS) for (const f of FACTIONS) {
      const d = traitDescription(t.id, f.id);
      if (isBasicBlockTrait(t.id)) {
        expect(d).toContain('효과: 고르면 노멀 강화 +1');
        expect(d).not.toContain('위력');
        expect(traitBrief(f, t.id)).toBe('고르면 노멀 강화 +1');
      } else if (t.kind === 'skill') expect(d).toContain('위력 기본 공격');
    }
  });
});

describe('111장 후속 결정 2: 노멀 빈 칸 규칙 안내 한 줄', () => {
  it('진화 조건 용어·진화 화면 요약·노멀 바스트로데 도감 힌트에 같은 줄', async () => {
    const { normalSlotNote } = await import('../src/data/help/textFormat');
    const { FORM_TABLE: FORMS, formHint } = await import('../src/data/evolution');
    for (const f of FACTIONS) {
      const note = normalSlotNote(f.slotName);
      expect(note).toMatch(/다$/);
      const vars = helpVars(f);
      expect(renderHelpText(GLOSSARY.find((g) => g.id === 'evolution-condition')!.body, vars)).toContain(note);
      expect(renderHelpText(SCREEN_HELPS.find((s) => s.id === 'evolution')!.body, vars)).toContain(note);
      const normalT4 = FORMS.find((x) => x.label.kind === 'element' && x.label.elements[0] === 'normal');
      expect(normalT4).toBeDefined();
      expect(formHint(normalT4!, f.id)).toContain(note);
    }
    expect(read('src/ui/absorbView.ts')).toContain('normalSlotNote(faction.slotName)');
    expect(read('src/ui/evolutionPanel.ts')).toContain('normalSlotNote(faction.slotName)');
  });
});
