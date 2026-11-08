// C.247 (GDD 168장): AI 검수 첫 결과에서 바로 고칠 것 — 1 AI 플레이테스트 지시문 기본 흐름 · 2 놓아주기 = 리스크 게이지 −1 통일
// · 3 리스크 ⓘ 창 잘림·계산식 · 4 흡수 화면 개발 메모 삭제
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getFaction } from '../src/data/factions';
import { riskText } from '../src/data/help/riskText';
import { guideVars, helpVars, renderHelpText } from '../src/data/help/index';
import guidesJson from '../src/data/help/guides.json';
import { advance, chooseRelease, createExpedition, finishBattle, startBattle, type ExpeditionState } from '../src/engine/expedition';
import { releaseEffect } from '../src/engine/absorb/risk';
import { absorbDescLines, releaseDelta } from '../src/ui/absorbView';
import { statusInfo } from '../src/ui/bha/statusInfo';
import { screenTerm, xlsxRows, type Finding } from '../scripts/ai-tools/lib/findings';
import { systemPrompt, STEP_SCHEMA } from '../scripts/ai-tools/playtest';

const RX = BALANCE.provisional.risk;
const FACTIONS = [getFaction('hollow'), getFaction('shinigami')];
const read = (p: string) => readFileSync(p, 'utf8');
const DECK = ['prey-nest-a', 'prey-nest-a', 'elite-den-a', 'env-fog', 'rest-a', 'prey-nest-b', 'env-ruin', 'elite-den-b'];

function toAbsorb(factionId: string, risk: number): ExpeditionState {
  const exp = createExpedition({ factionId, seed: 7, hunger: 40, condition: 100, deck: DECK } as Parameters<typeof createExpedition>[0]);
  exp.wildCells = [exp.pos + 1];
  advance(exp);
  const b = startBattle(exp);
  b.enemy.hp = 0;
  b.status = 'won';
  b.finisher = { kind: 'basic-attack', traitId: null, element: null };
  b.riskGained = 0;
  finishBattle(exp, b);
  exp.risk = risk;
  return exp;
}

describe('2 놓아주기 = 리스크 게이지 −1 (엔진은 원래 −releaseRelief)', () => {
  it('BALANCE 값은 1 그대로, 엔진 releaseEffect 가 그만큼 내리고 0 아래로는 안 내려간다', () => {
    expect(RX.releaseRelief).toBe(1);
    const s = { risk: 5, stability: 50 } as Parameters<typeof releaseEffect>[0];
    releaseEffect(s);
    expect(s.risk).toBe(5 - RX.releaseRelief);
    const z = { risk: 0, stability: 50 } as Parameters<typeof releaseEffect>[0];
    releaseEffect(z);
    expect(z.risk).toBe(0);
  });
  for (const f of FACTIONS) {
    it(`${f.id}: 게이지 0 이면 놓아주기 리스크 줄 없음(실제로 안 바뀜, GDD 197장 C.318), 0 아래로는 안 내려간다 — 실제 놓아주기 결과와 같다`, () => {
      const exp = toAbsorb(f.id, 0);
      expect(absorbDescLines(f, exp, 'none').some((l) => l.kind === 'risk')).toBe(false);
      const real = structuredClone(exp);
      chooseRelease(real);
      expect(real.risk).toBe(0);
      const mid = toAbsorb(f.id, 5);
      expect(absorbDescLines(f, mid, 'none').find((l) => l.kind === 'risk')!.text).toBe(`${f.riskGaugeName}: −${RX.releaseRelief} (5 → ${5 - RX.releaseRelief})`);
    });
    it(`${f.id}: 도움말 오르내림은 같은 −1, 첫 흡수 안내는 리스크 말 없음`, () => {
      const vars = { ...helpVars(f), ...guideVars(f) };
      expect(vars.releaseRelief).toBe(`−${RX.releaseRelief}`);
      const cards = (guidesJson as unknown as { guides: Record<string, { body: string }[]> }).guides['first-absorb']!;
      const body = renderHelpText(cards[0]!.body, vars);
      expect(body).not.toContain(f.riskGaugeName); // 첫 흡수 안내 = 리스크 문장 없음 (GDD 197장 2, C.318)
      expect(riskText(f).riskDown[0]).toBe(`적 놓아주기: −${RX.releaseRelief}`);
    });
  }
  it('확인 창 본문도 같은 값(releaseRelief)', () => {
    expect(read('src/ui/absorbView.ts')).toContain('${faction.riskGaugeName} −${RX.releaseRelief}');
    expect(releaseDelta(3, 2)).toBe(`−${RX.releaseRelief} (3 → 2)`);
  });
});

describe('3 리스크 ⓘ 창: 계산식 대신 쉬운 말 + 대표 값, 잘리면 스크롤', () => {
  for (const f of FACTIONS) {
    it(`${f.id}: 상태 ⓘ 창 전부에 개발자 계산식이 없다`, () => {
      for (const k of ['hunger', 'cond', 'bond', 'risk', 'stab'] as const) {
        const doc = statusInfo(k as Parameters<typeof statusInfo>[0], f, 10);
        const all = [doc.lead, ...doc.groups.flatMap((g) => g.lines)].join('\n');
        expect(all, `${k}`).not.toMatch(/\[기본 공격 횟수\]|×\s*0\.\d|\(바퀴 −|absorbPerHpAttack|lateLapPerTile/);
      }
      const up = riskText(f).riskUp.join('\n');
      expect(up).toContain('강한 적일수록 많이 오른다');
      const n = Math.round(BALANCE.provisional.combat.enemyHpInAttacks.normal * RX.absorbPerHpAttack * 10) / 10;
      expect(up).toContain(`일반 적 약 +${n}`);
      expect(up).toContain('바퀴가 늘수록 더 오른다');
    });
  }
  it('ⓘ 창: 넘치면 "▼ 더 있음", 기기 ▲▼ 는 누를 것 없는 맨 위 창을 스크롤', () => {
    expect(read('src/ui/bha/infoTip.ts')).toContain("'bha-pop__more', '▼ 더 있음'");
    expect(read('src/ui/bha/device.ts')).toMatch(/top\.scrollBy\(/);
    expect(read('src/ui/bha/device.ts')).toContain('const canScroll');
    expect(read('src/ui/bha/components/components.css')).toContain('.bha-pop__more');
  });
});

describe('4 개발 메모(기획 n장·미정)는 화면에 없다', () => {
  it('흡수·슬롯·칭호 도감·진화 화면', () => {
    for (const p of ['src/ui/absorbView.ts', 'src/ui/buildPanel.ts', 'src/ui/titleDexView.ts', 'src/ui/evolutionPanel.ts', 'src/ui/dexView.ts']) {
      const s = read(p);
      expect(s, p).not.toMatch(/PROVISIONAL_NOTE|TITLE_NOTE|EVOLUTION_NOTE|evolutionNote\(/);
      expect(s, p).not.toContain("'조건 미정'");
    }
  });
});

describe('1 AI 플레이테스트 지시문', () => {
  it('기본 흐름: 자동으로 걷고 조우·전투 자동, 기다리기가 정상, 내 캐릭터 오른쪽·적 왼쪽, 용어 모험', () => {
    const sys = systemPrompt();
    expect(sys).toContain('저절로 길을 걷고');
    expect(sys).toContain('기다리기(wait)');
    expect(sys).toContain('내 캐릭터가 오른쪽, 적이 왼쪽');
    expect(sys).toContain("'내 체력 / 적 체력'");
    expect(sys).not.toContain('첫 모험(원정)');
    expect(STEP_SCHEMA.properties.screen.description).toContain('모험 출발');
  });
  it('화면 글자에 내 체력/적 체력 라벨', () => {
    expect(read('scripts/ai-tools/playtest.ts')).toContain('내 체력(오른쪽 내 캐릭터)');
  });
  it("엑셀 화면·묶음 이름 '원정' → '모험'", () => {
    expect(screenTerm('원정 출발')).toBe('모험 출발');
    const f: Finding = { severity: '상', group: '첫 원정', screen: '원정 지도', faction: 'hollow', viewpoint: '진행 막힘', problem: 'p', fix: 'f', shot: '' };
    const { rows } = xlsxRows([f], 'review');
    expect(rows[0]![2]).toBe('첫 모험');
    expect(rows[0]![3]).toBe('모험 지도');
  });
});
