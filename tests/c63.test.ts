// C.63 (S-18, GDD 28장): 실기기 피드백 — 치명타·피해 숫자 크기·배속 유지·다마고치 축소·종족 바꾸기 잠금·방 상점·배부름 표시·체인 이펙트·세로 오스큐라스
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE, BALANCE_VERSION } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { FACTIONS, getFaction } from '../src/data/factions';
import { parseTrait, TRAITS } from '../src/data/traits';
import { buildCombatParams, critChanceBonus, newBuild } from '../src/engine/absorb';
import { createCombat, critChanceOf, defaultCombatParams, drainCombatEvents, step, type CombatEvent, type CombatState } from '../src/engine/combat';
import { buildBattleRecord } from '../src/engine/combat/record';
import { parseFactionConfig, roomOf, ROOM_PROPS } from '../src/engine/faction';
import { canSwitchFaction, newSaveData, newTrack, SAVE_FORMAT_VERSION, switchTrack } from '../src/game';
import { attackCueOf } from '../src/ui/attackFx';
import { BATTLE_SPEED_KEY, CRIT_LABEL, damageTier, loadBattleSpeed, saveBattleSpeed } from '../src/ui/bha/battle';
import { careFeedback } from '../src/ui/bha/dockLogic';
import { fullnessDeltaText, fullnessOf } from '../src/ui/bha/fullness';
import { statusChips } from '../src/ui/bha/roomLogic';
import { BODY, clampView, minViewZoom, tamaLayout } from '../src/ui/bha/tamagoLogic';
import { PATCH_LABEL, STAGE_LABEL } from '../src/version';

const CX = BALANCE.provisional.combat;
const H = getFaction('hollow');
const S = getFaction('shinigami');
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const memStore = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

/** 전투를 입력 없이 끝까지 돌리며 사건을 모은다 */
function playOut(s: CombatState): CombatEvent[] {
  const out: CombatEvent[] = [];
  while (s.status === 'playing') {
    step(s, null);
    out.push(...drainCombatEvents(s));
  }
  return out;
}

describe('버전 (S-18)', () => {
  it('패치 C.63 / 단계 S-18, BALANCE 39, 세이브 형식 25 그대로(세이브 구조 변화 없음)', () => {
    expect(PATCH_LABEL).toMatch(/^C\.\d+$/); // C.64 에서 C.64 / S-18b
    expect(STAGE_LABEL).toMatch(/^[A-Z]+-\d+[a-z]?$/); // C.69 부터 병렬 단계도 허용
    expect(BALANCE_VERSION).toBeGreaterThanOrEqual(39);
    expect(SAVE_FORMAT_VERSION).toBeGreaterThanOrEqual(25); // C.64 에서 26 (형식 26 검사는 c64.test.ts)
  });
});

describe('치명타 (GDD 28장 5번, provisional)', () => {
  it('기본 수치: 내 5%·×1.5, 적 3%, 상한 50% — 물리·마법 합친 하나', () => {
    const p = defaultCombatParams();
    expect([p.critChance, p.critMultiplier, p.enemyCritChance, p.critChanceMax]).toEqual([0.05, 1.5, 0.03, 0.5]);
    expect(critChanceOf({ ...p, critChance: 0.9 })).toBe(0.5);
    expect(critChanceOf({ ...p, critChance: -1 })).toBe(0);
  });
  it('확률 100% 면 기본 공격이 모두 ×1.5, 0% 면 치명 없음 (같은 시드, 다른 난수 순서는 그대로)', () => {
    const base = { enemy: getEnemy('test-a') };
    const a = createCombat(7, { ...base, params: { critChance: 0, enemyCritChance: 0 } });
    const b = createCombat(7, { ...base, params: { critChance: 1, critChanceMax: 1, enemyCritChance: 0 } });
    const ea = playOut(a).filter((e) => e.kind === 'player-attack');
    const eb = playOut(b).filter((e) => e.kind === 'player-attack');
    expect(ea.every((e) => e.kind === 'player-attack' && !e.crit)).toBe(true);
    expect(eb.every((e) => e.kind === 'player-attack' && e.crit)).toBe(true);
    expect(eb[0]!.kind === 'player-attack' && ea[0]!.kind === 'player-attack' && eb[0]!.damage / ea[0]!.damage).toBeCloseTo(1.5, 6);
    expect(b.crits).toBe(eb.length); // 블록을 안 쓴 전투: 치명 횟수 = 기본 공격 수
  });
  it('공허 블록·반사·독 지속 피해는 치명이 없다', () => {
    const s = createCombat(3, { enemy: getEnemy('test-a'), params: { critChance: 1, critChanceMax: 1, voidChance: 0.8, voidChanceMax: 0.8 } });
    const ev: CombatEvent[] = [];
    while (s.status === 'playing') {
      const vi = s.tray.findIndex((x) => x.kind === 'void');
      step(s, vi >= 0 ? { type: 'use', cell: vi } : null);
      ev.push(...drainCombatEvents(s));
    }
    const voids = ev.filter((e) => e.kind === 'block' && e.block === 'void');
    expect(voids.length).toBeGreaterThan(0);
    expect(voids.every((e) => e.kind === 'block' && !e.crit)).toBe(true);
  });
  it('치명 비율 ≈ 확률 (200판 기본 공격·적 공격) · 전투 기록에 치명 횟수', () => {
    let hits = 0, crits = 0, eHits = 0, eCrits = 0, recCrits = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const s = createCombat(seed, { enemy: getEnemy('test-a') });
      for (const e of playOut(s)) {
        if (e.kind === 'player-attack') { hits++; if (e.crit) crits++; }
        if (e.kind === 'enemy-attack') { eHits++; if (e.crit) eCrits++; }
      }
      const rec = buildBattleRecord(s, { factionId: 'hollow' });
      expect(rec.crits).toBe(s.crits);
      expect(rec.enemyCrits).toBe(s.enemyCrits);
      recCrits += rec.crits ?? 0;
    }
    expect(crits / hits).toBeGreaterThan(0.04);
    expect(crits / hits).toBeLessThan(0.06);
    expect(eCrits / eHits).toBeGreaterThan(0.015);
    expect(eCrits / eHits).toBeLessThan(0.045);
    expect(recCrits).toBe(crits);
  });
  it('critChance 효과 키: 특성에 붙이면 장착 시 확률에 더한다 (provisional 1~2개), 잘못된 값은 거부', () => {
    const withCrit = TRAITS.filter((t) => t.critChance);
    expect(withCrit.length).toBeGreaterThanOrEqual(1);
    expect(withCrit.length).toBeLessThanOrEqual(2);
    expect(withCrit.every((t) => t.provisional)).toBe(true);
    const b = newBuild();
    b.slots[0] = withCrit[0]!.id;
    expect(critChanceBonus(b)).toBeCloseTo(withCrit[0]!.critChance!);
    expect(buildCombatParams(b).critChance).toBeCloseTo(CX.critChance + withCrit[0]!.critChance!);
    expect(buildCombatParams(newBuild()).critChance).toBe(CX.critChance);
    expect(() => parseTrait({ ...withCrit[0]!, critChance: 2 })).toThrow(/critChance/);
  });
});

describe('피해 숫자 크기 단계 (28장 4번)', () => {
  it('작음 = 기본 공격 1회분 미만 / 큼 = 3회분 이상·체인·필살류 / 그 사이 보통', () => {
    expect(damageTier(5, 10)).toBe('small');
    expect(damageTier(10, 10)).toBe('normal');
    expect(damageTier(29, 10)).toBe('normal');
    expect(damageTier(30, 10)).toBe('big');
    expect(damageTier(12, 10, { chain: 2 })).toBe('big');
    expect(damageTier(12, 10, { ult: true })).toBe('big');
    expect(CRIT_LABEL).toBe('치명');
  });
  it('색은 기존 토큰만 (회복 초록 = good, 막음 회색 = text-3)', () => {
    const css = src('src/ui/bha/components/components.css');
    expect(css).toMatch(/\.bha-float--heal \{ color: var\(--bha-good\); \}/);
    expect(css).toMatch(/\.bha-float--guard \{ color: var\(--bha-text-3\);/);
    const block = css.slice(css.indexOf('피해 크기 단계'), css.indexOf('.bha-float--chain {'));
    expect(block).not.toMatch(/#[0-9a-f]{3,6}\b/i);
  });
});

describe('전투 안내·로그 (28장 3번)', () => {
  it('가운데 실시간 안내 대신 [로그] 버튼 + 닫힌 목록', () => {
    const v = src('src/ui/battleView.ts');
    expect(v).toContain("button({ label: '로그'");
    expect(v).toMatch(/log\.hidden = true/);
    expect(src('src/ui/bha/battle-scene.css')).toContain('.bha-battle__logpanel[hidden] { display: none; }');
  });
});

describe('배속 유지 (28장 6번)', () => {
  it('고른 배속을 브라우저 저장에 남겨 다음 전투에 쓴다, 깨진 값·저장 불가는 1x', () => {
    const st = memStore();
    expect(loadBattleSpeed(st)).toBe(1);
    saveBattleSpeed(st, 2);
    expect(st.getItem(BATTLE_SPEED_KEY)).toBe('2');
    expect(loadBattleSpeed(st)).toBe(2);
    st.setItem(BATTLE_SPEED_KEY, '7');
    expect(loadBattleSpeed(st)).toBe(1);
    expect(loadBattleSpeed(null)).toBe(1);
    expect(loadBattleSpeed({ getItem: () => { throw new Error('막힘'); } })).toBe(1);
  });
});

describe('다마고치 모드 축소·두께 (28장 1·2번)', () => {
  it('실제 배율 0.40 까지 줄어든다 (기본은 그대로 기기 전체)', () => {
    const L = tamaLayout(844, 390);
    const lo = minViewZoom(L.zoom);
    expect(L.zoom * lo).toBeCloseTo(BODY.minScale, 3);
    expect(BODY.minScale).toBe(0.4);
    expect(clampView({ uz: 0.01, px: 0, py: 0 }, L.zoom, L.box, 844, 390).uz).toBe(lo);
    expect(clampView({ uz: 1, px: 0, py: 0 }, L.zoom, L.box, 844, 390).uz).toBe(1);
  });
  it('옆면 두께 띠는 뒤집는 동안만 3D, 색은 껍데기 토큰', () => {
    const css = src('src/ui/bha/tamago.css');
    expect(css).toContain('.bha-dev.is-tama-flipping .bha-tama__edge { visibility: visible; }');
    expect(css.slice(css.indexOf('.bha-tama__edge {'), css.indexOf('.bha-tama__edge--l'))).not.toMatch(/#[0-9a-f]{3,6}\b/i);
    expect(BODY.thicknessRatio).toBeGreaterThan(0); // 두께 값은 c66.test.ts (가로의 25%)
  });
});

describe('종족 바꾸기 잠금 (28장 7번, 22-3)', () => {
  it('새 세이브(5단계 전)는 다른 종족으로 갈 수 없다 — 트랙이 열려야만', () => {
    const s = newSaveData('hollow', 1000);
    expect(canSwitchFaction(s)).toBe(false);
    expect(switchTrack(s, 'shinigami', 2000)).toBe(false);
    expect(s.factionId).toBe('hollow');
    s.otherTracks.push({ ...newTrack('shinigami', 1000, 1), parkedAt: 1000 });
    expect(canSwitchFaction(s)).toBe(true);
    expect(switchTrack(s, 'shinigami', 2000)).toBe(true);
  });
  it('방의 옛 [종족 바꾸기] 길(세이브 종족을 바로 바꾸던 것)이 없다', () => {
    expect(src('src/ui/roomView.ts')).not.toContain('종족 바꾸기');
    expect(src('src/ui/app.ts')).not.toMatch(/save\.factionId = f\.id/);
    expect(src('src/ui/app.ts')).not.toContain('onChangeFaction');
  });
});

describe('출발 화면 탭 고정 (28장 8번)', () => {
  it('자유 원정·스토리 두 화면 모두 머리 맨 왼쪽에 같은 탭 머리(bha-depart-head)', () => {
    expect(src('src/ui/storyView.ts')).toMatch(/head\.append\(departTabs\('story'/);
    expect(src('src/ui/planView.ts')).toContain('bha-depart-head');
  });
});

describe('방 상점 (28장 9번)', () => {
  it('방 물건 shop, 이름은 두 종족 공통 상점(GDD 34-2), 다른 물건과 겹치지 않는다', () => {
    expect(ROOM_PROPS).toContain('shop');
    expect(roomOf(H).props.shop).toBe('상점');
    expect(roomOf(S).props.shop).toBe('상점');
    for (const f of FACTIONS) {
      const r = roomOf(f);
      for (const p of ROOM_PROPS) {
        if (p === 'shop') continue;
        expect(Math.hypot(r.layout[p].x - r.layout.shop.x, r.layout[p].y - r.layout.shop.y), `${f.id}: shop–${p}`).toBeGreaterThan(14);
      }
    }
  });
  it('더보기 줄에 상점이 없다', () => {
    expect(src('src/ui/roomView.ts')).not.toMatch(/label: '상점'/);
  });
});

describe('배부름 표시 (28장 10번)', () => {
  it('엔진 허기는 그대로, 화면만 100 − 허기, 이름은 종족 설정', () => {
    expect(fullnessOf(0)).toBe(100);
    expect(fullnessOf(35)).toBe(65);
    expect(fullnessOf(130)).toBe(0);
    expect(H.fullnessName).toBe('배부름');
    expect(S.fullnessName).toBe('배부름');
    expect(fullnessDeltaText('배부름', -35)).toBe('배부름 +35');
    expect(fullnessDeltaText('배부름', 10)).toBe('배부름 −10');
    expect(careFeedback(H, 'feed', 'snack', { hunger: -15, condition: 0, stability: 0, risk: 0 })).toContain('배부름 +15');
    const [c] = statusChips({ hunger: 85, condition: 100, risk: 0, weakened: false }, H);
    expect(c).toMatchObject({ label: '배부름', value: 15, danger: true });
  });
  it('종족 설정에 fullnessName 이 없으면 거부', () => {
    const { fullnessName: _drop, ...rest } = JSON.parse(JSON.stringify(H)) as Record<string, unknown>;
    expect(() => parseFactionConfig(rest)).toThrow(/fullnessName/);
  });
});

describe('체인 이펙트·세로 오스큐라스 (28장 11~13번)', () => {
  it('이펙트 위치는 레이아웃 좌표(offset)로 잰다 — 세로 회전 출력에서 아래로 나가던 원인', () => {
    const fx = src('src/ui/attackFx.ts');
    expect(fx).toContain('export function offsetOrigin');
    expect(fx).toMatch(/const a = offsetOrigin\(n\);/);
  });
  it('용어 "세로 오스큐라스" (오스쿠라스 없음)', () => {
    const c = H.families.find((f) => f.id === 'family-c')!;
    expect(c.tiers[2].name).toBe('세로 오스큐라스');
    for (const p of ['src/data/factions/hollow.json', 'src/data/evolution/combos.json']) expect(src(p)).not.toContain('오스쿠라스');
  });
  it('세로 오스큐라스 = 빔 + 고유 모양(cero-oscuras), 다른 단계·사신은 그대로', () => {
    const c = H.families.find((f) => f.id === 'family-c')!;
    expect(c.tiers[2]).toMatchObject({ fx: 'beam', fxLook: 'cero-oscuras' });
    expect(c.tiers[0].fx).toBeUndefined();
    for (const f of S.families) for (const t of f.tiers) expect(t.fxLook).toBeUndefined();
    const spec = (id: string, stage: number) => {
      const f = H.families.find((x) => x.id === id)!;
      const t = f.tiers[stage - 1];
      return { fx: t?.fx ?? f.fx, look: t?.fxLook ?? null };
    };
    const ev = (chain: number): CombatEvent => ({ kind: 'block', block: 'skill', traitId: 't', family: 'family-c', element: null, matchup: 'neutral', role: 'attack', chain, damage: 10, weak: false, heal: 0, guardSeconds: 0, bonus: null });
    expect(attackCueOf(ev(3), 3, spec)).toMatchObject({ fx: 'beam', look: 'cero-oscuras', stage: 3 });
    expect(attackCueOf(ev(2), 3, spec)).toMatchObject({ fx: 'shot', stage: 2 });
    expect(attackCueOf(ev(2), 3, spec)?.look).toBeUndefined();
    expect(attackCueOf(ev(2), 3, () => 'claw')).toMatchObject({ fx: 'claw' }); // 예전 형식(종류만)도 된다
  });
  it('색 토큰 --bha-fx-cero-oscuras-core/-edge, 꾸밈 색보다 우선', () => {
    expect(src('src/ui/bha/design-system/tokens.css')).toMatch(/--bha-fx-cero-oscuras-core: #[0-9a-f]{6};[\s\S]*--bha-fx-cero-oscuras-edge: #[0-9a-f]{6};/);
    expect(src('src/ui/bha/battle-scene.css')).toContain(':root[data-cos-fx] .bha-afx.bha-afx--look-cero-oscuras[data-side]');
    expect(() => parseFactionConfig({ ...JSON.parse(JSON.stringify(H)), families: H.families.map((f, i) => (i ? f : { ...f, tiers: f.tiers.map((t) => ({ ...t, fxLook: 'Bad Look' })) })) })).toThrow(/fxLook/);
  });
});

describe('종족 분기 없음', () => {
  it('바꾼 화면 파일에 종족 id 분기가 없다', () => {
    for (const p of ['src/ui/battleView.ts', 'src/ui/roomView.ts', 'src/ui/storyView.ts', 'src/ui/attackFx.ts', 'src/ui/bha/fullness.ts', 'src/ui/bha/tamago.ts', 'src/engine/combat/combat.ts']) {
      expect(src(p), p).not.toMatch(/=== ?'(hollow|shinigami)'/);
    }
  });
});
