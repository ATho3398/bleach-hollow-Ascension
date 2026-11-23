// C.525 진화체 재조정 (GDD 8-7 v6.178, 마스터AS — 사용자 "스킬 짠거에 맞춰서 알아서 배정해 ㅇㅇ" · "특히 뭐 n초내로 이런애들 있잖아. 얘네는 스탯흡수 열심히해서 공속 내지는
// 블록생성속도 높여야 제 성능 내게 설계해. 대신 고점 높게" · "웬만한 캐릭들은 블록에 기본적으로 적한테 주는 딜이 달려있고 거기에 부가적으로 효과까지 붙는거다"):
// ① 측정 무투자·노력치만 칸에도 그 속성 공격 블록 1개 ② 시간 제한 능력 15칸 = 노력 곡선(timed)·노력치 비례·고점 가드 ③ 블록 기본 피해를 빼는 장치 없음 ④ 목표 미달 목록
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BALANCE, BALANCE_VERSION } from '../src/config/balance';
import { evoFormEntry, evoNumsOf, evoText, fillEvoText } from '../src/data/evolution/uniques';
import raw from '../src/data/evolution/balanceProfiles.json';
import { balanceProfileOf, validateBalanceProfiles, type BalanceProfileFile } from '../src/data/evolution/balanceProfiles';
import { EVO_PROFILE_KNOWN, evoProfileInvest, evoProfileTargets, judgeProfileGoal, type ProfileVerdict } from '../scripts/lib/evoProfile';
import { evoBalSkills } from '../scripts/lib/evoUniqueBalance';
import { PATCH_LABEL } from '../src/version';

const F = BALANCE.provisional.evoUniques.forms as Record<string, Record<string, Record<string, unknown>>>;
const D = raw as unknown as BalanceProfileFile;
const timed = (): [string, string, string][] => {
  const out: [string, string, string][] = [];
  for (const [id, byFac] of Object.entries(D.forms)) for (const [fac, g] of Object.entries(byFac)) if (g?.timed) out.push([id, fac, g.timed]);
  return out;
};

describe('① 측정 칸 — 무투자·노력치만에도 그 속성 공격 블록 1개 (마스터AS 결정)', () => {
  it('무투자·노력치만 = 표준 공격 특성 앞 1개(강화 0), 블록만·둘 다 = 2개 + 강화 표준', () => {
    const t = evoProfileTargets().find((x) => x.formId === 't4:fire:physical' && x.factionId === 'hollow')!;
    expect(BALANCE.provisional.evoProfile.invest.baseSkills).toBe(1);
    for (const i of ['none', 'ev'] as const) expect(evoProfileInvest(t, i)).toMatchObject({ skills: 1, enhance: 0 });
    for (const i of ['blk', 'both'] as const) expect(evoProfileInvest(t, i)).toMatchObject({ skills: 2, enhance: BALANCE.provisional.evoProfile.invest.enhance });
    expect(evoBalSkills(t)[0]).toBe('t-fire-a'); // 소로 = 불 블록 1개 → 여우불 조건(불 블록)이 무투자 칸에서도 켜질 수 있다
  });
});

describe('② 시간 제한 능력 = 노력 곡선 (GDD v6.178)', () => {
  it('timed 15칸: 전부 노력 곡선, 성향은 그대로(강제 배정 카사도르·추성 강적 · 칼마·정심 잡몹 유지)', () => {
    const list = timed();
    expect(list).toHaveLength(15);
    for (const [id, fac] of list) expect(balanceProfileOf(id, fac)?.curve, `${id}/${fac}`).toBe('effort');
    expect(balanceProfileOf('h4:hunter', 'hollow')).toEqual({ curve: null, lean: 'elite' });
    expect(balanceProfileOf('h4:hunter', 'shinigami')?.lean).toBe('elite');
    expect(balanceProfileOf('h4:stable', 'hollow')?.lean).toBe('mob');
    expect(balanceProfileOf('h4:stable', 'shinigami')?.lean).toBe('mob');
    // 성향 유지: 에스카라바호 선공 · 토르투가 생존 · 비보라 강적 · 나다·석양홍 해방 · 공화 잡몹
    expect(Object.fromEntries(list.map(([id, fac]) => [`${id}/${fac}`, balanceProfileOf(id, fac)!.lean]))).toMatchObject({
      't4:earth:physical/hollow': 'opener', 't4:earth:mixed/hollow': 'survive', 't4:poison:special/hollow': 'elite', 'h4:void/hollow': 'release', 't4:fire:special/shinigami': 'release', 'h4:void/shinigami': 'mob',
    });
  });
  it('timed 는 노력 곡선에만 — 데이터 검사', () => {
    const bad = JSON.parse(JSON.stringify(D)) as BalanceProfileFile;
    bad.forms['t4:fire:special']!.hollow = { curve: 'block', lean: null, timed: 'x' };
    expect(validateBalanceProfiles(bad).join()).toMatch(/timed/);
    expect(validateBalanceProfiles()).toEqual([]);
  });
  it('시간 제한 몸은 노력치 비례 손잡이(grow per effort)를 가진다 (공화 = 원정 누적 스택이라 측정 밖) · 블록 투자 비례(blockLv) 없음', () => {
    for (const [id, fac] of timed()) {
      const json = JSON.stringify(evoFormEntry(id, fac)!.ability);
      expect(json, `${id}/${fac}`).not.toMatch(/"per":\s*"blockLv"|"blockLv"\]/);
      if (id === 'h4:void' && fac === 'shinigami') continue;
      expect(json, `${id}/${fac}`).toMatch(/"per":"effort"/);
    }
  });
  it('설명 문구: 시간 제한 몸은 「노력치를 키운 만큼」 · {키} 다 채움', () => {
    for (const [id, fac] of timed()) {
      if (id === 'h4:void' && fac === 'shinigami') continue;
      const txt = fillEvoText(evoText(evoFormEntry(id, fac)!.ability!.description, fac), evoNumsOf(id, fac) as Record<string, number>);
      expect(txt, `${id}/${fac}`).toMatch(/노력치를 키운 만큼/);
      expect(txt, `${id}/${fac}`).not.toMatch(/\{[A-Za-z0-9_]+%?\}/);
    }
  });
  it('가드: 시간 제한 몸은 고점(둘 다) ≥ +10% 도 본다', () => {
    expect(BALANCE.provisional.evoProfile.guard.effort.timedHiMin).toBe(0.1);
    const v = { key: 'k', feat: { lo: -0.1, hi: 0.05, ev: 0.3, blk: 0, syn: 0, both: 0.2 }, lean: { id: null, scores: {} }, valueDev: 0, floor: [], topCells: 0 } as unknown as ProfileVerdict;
    expect(judgeProfileGoal({ curve: 'effort', lean: null }, v)).toEqual([]);
    expect(judgeProfileGoal({ curve: 'effort', lean: null, timed: 'x' }, v).join()).toMatch(/시간 제한 능력 고점/);
  });
  it('사용자 확정 시간 값 그대로: 여우불 2.5초·5개 · 갑각 재생 12초 · 열기 3초 · 자기장 5초 · 비전 −0.1초 · 나다 바 8칸·처형선 1%', () => {
    expect(F['t4:fire:physical']!.hollow).toMatchObject({ seconds: 2.5, need: 5 });
    expect(F['t4:earth:physical']!.hollow!.regrow).toBe(12);
    expect(F['t4:fire:mixed']!.hollow).toMatchObject({ seconds: 3, spawnPer: 0.1 });
    expect(F['t4:thunder:special']!.hollow!.fieldSeconds).toBe(5);
    expect(F['t4:thunder:mixed']!.shinigami!.cut).toBe(0.1);
    expect(F['h4:void']!.hollow).toMatchObject({ bar: 8, perLine: 0.01 });
  });
});

describe('③ 블록 기본 피해 유지', () => {
  it('블록 피해를 없애는 장치(noDamage)를 쓰는 진화체가 없다 · 원래부터 블록 기본 피해를 바꾸는 몸(천평환 평균·연우 체인 배율)은 그대로', () => {
    const json = readFileSync('src/data/evolution/uniques.json', 'utf8');
    expect(json).not.toMatch(/"act": "noDamage"/);
    expect(F['t4:normal:mixed']!.shinigami).toMatchObject({ blockAverage: 2 });
    expect(F['t4:water:special']!.shinigami).toMatchObject({ c1: 0.8, c2: 1.8, c3: 4.4 });
  });
});

describe('④ 목표 미달 목록 · 버전', () => {
  it('목표 미달 25칸(섬뢰각은 통과로 빠짐) — 시간 제한 몸은 사유에 「시간 제한」', () => {
    expect(Object.keys(EVO_PROFILE_KNOWN)).toHaveLength(25);
    expect(EVO_PROFILE_KNOWN['t4:thunder:physical/shinigami']).toBeUndefined();
    for (const [id, fac] of timed()) if (EVO_PROFILE_KNOWN[`${id}/${fac}`] && !(id === 'h4:void' && fac === 'shinigami')) expect(EVO_PROFILE_KNOWN[`${id}/${fac}`]).toMatch(/시간 제한/);
  });
  it('BALANCE 161 · 패치 C.525', () => {
    expect(BALANCE_VERSION).toBe(161);
    expect(PATCH_LABEL).toBe('C.525');
  });
});
