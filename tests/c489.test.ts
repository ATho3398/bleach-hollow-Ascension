// C.489 (GDD v6.121 12-4·7-8, 사용자 2026-11-18):
// ① "아이젠 붕옥 존나 안나옴, 경화수월 안나옴" — voidSlot 에 고정 기본 몫 base(붕옥 0.15·경화수월 0.12, provisional) + 폭주 블록 공식
// ② "훈련장 한번 누르면 다시 못나감" — 바꿔 끼워져 떠난 전투의 뒤로 처리기가 뒤로를 계속 삼키던 버그
// ③ "그냥 폭주 블록이라고 하자" — 화면 문구 '공허' → '폭주' (코드 id·키·세이브는 그대로, '공허의 밤'은 그대로)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { getEnemy } from '../src/data/enemies';
import { FACTIONS } from '../src/data/factions';
import { helpVars } from '../src/data/help';
import { buildCombatParams } from '../src/engine/absorb/build';
import { createCombat, drainCombatEvents, KIT_TRAIT_PREFIX, spawnTableOf, step, voidChanceOf, type CombatParams } from '../src/engine/combat';
import { applyEvolutionToParams } from '../src/engine/evolution';
import { BLOCK_WORDS } from '../src/engine/faction';
import { testGrantTranscendent } from '../src/engine/testMode';
import { newSaveData } from '../src/game';
import { battleLabels } from '../src/ui/labels';
import { ScreenStack } from '../src/ui/bha/select';
import { battleBackHook } from '../src/ui/bha/screenBack';
import { registerCancelHook, runCancelHooks } from '../src/ui/bha/shortcuts';
import { V2_GLYPH } from '../src/ui/bha/v2/battle';

const K = BALANCE.provisional.transcendentKits.aizen!;
const id = (b: string) => KIT_TRAIT_PREFIX + b;
const read = (p: string) => readFileSync(p, 'utf8');

function aizenParams(): Partial<CombatParams> {
  const s = newSaveData('hollow', 1000);
  expect(testGrantTranscendent(s, 'aizen', 2000)).toBe('added');
  const p: Partial<CombatParams> = { ...buildCombatParams(s.build, s.factionId) };
  applyEvolutionToParams(p, s.evolution, s.factionId, 0, false);
  return p;
}
const mk = () => createCombat(1, { enemy: getEnemy('test-a'), params: aizenParams() });
const chance = (p: CombatParams, b: string, risk = 20, releasing = false) => spawnTableOf(p, releasing, risk).entries.find((e) => e.source?.id === id(b))?.chance ?? 0;

describe('① 아이젠 붕옥·경화수월 확률 (고정 기본 몫 + 폭주 블록 공식)', () => {
  it('수치: 붕옥 base 0.15 · 경화수월 base 0.12 (voidScale 1·순서 그대로)', () => {
    expect(K.blocks.hogyoku!.voidSlot).toEqual({ base: 0.15, voidScale: 1, riskGain: 10, order: 0 });
    expect(K.blocks.kyoka!.voidSlot).toEqual({ base: 0.12, voidScale: 1, order: 1 });
    expect(mk().params.kit?.blocks.find((b) => b.id === 'hogyoku')?.voidSlot?.base).toBe(0.15); // 전투 kit 까지 그대로 실린다
  });
  it('일반 상태(폭주 블록 공식 기본 2%): 붕옥 = 0.15 + 0.02, 경화수월 = (1 − 붕옥) × (0.12 + 0.02), 나머지 귀도', () => {
    const p = mk().params;
    const v = voidChanceOf(p);
    expect(v).toBeCloseTo(0.02, 9);
    expect(chance(p, 'hogyoku')).toBeCloseTo(0.17, 9);
    expect(chance(p, 'kyoka')).toBeCloseTo(0.83 * 0.14, 9);
    expect(chance(p, 'kido')).toBeCloseTo(0.83 * 0.86, 9);
    expect(spawnTableOf(p, false, 20).entries.some((e) => e.kind === 'void')).toBe(false);
  });
  it('폭주 블록 공식 가산(컨디션·환경 등)도 그대로 더해지고, 상한 1', () => {
    const p = { ...mk().params, voidChanceBonus: 0.2 };
    expect(chance(p, 'hogyoku')).toBeCloseTo(0.15 + voidChanceOf(p), 9);
    const huge = { ...mk().params, voidChance: 2, voidChanceMax: 5 };
    expect(chance(huge, 'hogyoku')).toBe(1);
    expect(chance(huge, 'kyoka')).toBe(0);
  });
  it('감응도 100이면 붕옥 0 → 경화수월 = 0.12 + 0.02, 융합 중엔 둘 다 없음', () => {
    const p = mk().params;
    expect(chance(p, 'hogyoku', 100)).toBe(0);
    expect(chance(p, 'kyoka', 100)).toBeCloseTo(0.14, 9);
    expect(chance(p, 'hogyoku', 50, true)).toBe(0);
    expect(chance(p, 'kyoka', 50, true)).toBe(0);
  });
  it('실제 생성 표본(블록 6000개, 감응도 20 고정·바 비움) ≈ 표 계산', () => {
    const s = mk();
    s.enemy.attackTimer = s.enemy.actionTimer = s.player.attackTimer = 1e9;
    s.params.timeLimitSeconds = 1e9;
    const n = { hogyoku: 0, kyoka: 0, total: 0 };
    for (let i = 0; n.total < 6000 && i < 5e6; i++) {
      s.kit!.risk = 20;
      step(s);
      for (const e of drainCombatEvents(s)) if (e.kind === 'spawn') {
        n.total++;
        const t = s.tray[e.index]?.traitId;
        if (t === id('hogyoku')) n.hogyoku++;
        if (t === id('kyoka')) n.kyoka++;
      }
      s.tray = [];
    }
    expect(n.total).toBe(6000);
    expect(n.hogyoku / n.total).toBeGreaterThan(0.15);
    expect(n.hogyoku / n.total).toBeLessThan(0.19);
    expect(n.kyoka / n.total).toBeGreaterThan(0.1);
    expect(n.kyoka / n.total).toBeLessThan(0.135);
  });
  it('엔진에 초월자 id 분기 없음 (데이터 필드 base 만 읽는다)', () => {
    const src = read('src/engine/combat/combat.ts');
    expect(src).toContain('(b.voidSlot!.base ?? 0) + base * b.voidSlot!.voidScale');
    expect(src).not.toMatch(/'hogyoku'|'kyoka'|'aizen'/);
  });
});

describe('② 훈련장 들어갔다 나오기 — 모든 진입 경로에서 뒤로가 동작', () => {
  /** 화면 스택 + 기기 뒤로(device.cancel: 처리기가 안 받으면 화면 스택 뒤로)를 흉내 낸다. 화면 = 지금 그려진 id */
  function world() {
    let shown = '';
    const nav = new ScreenStack();
    const screen = (sid: string, locked = false, home = false) => ({ id: sid, locked, home, render: () => { shown = sid; } });
    nav.reset(screen('room', false, true));
    /** 전투 화면 하나: battleView 와 같은 처리기(battleBackHook) 를 건다. 화면이 바뀌면 connected = false */
    const battle = (sid: string) => {
      const st = { stopped: false, paused: false, status: 'playing' as 'playing' | 'won' };
      const draw = () => {
        shown = sid;
        registerCancelHook(battleBackHook({
          connected: () => shown === sid, stopped: () => st.stopped, stop: () => { st.stopped = true; },
          busy: () => st.paused || st.status !== 'playing', pause: () => { st.paused = true; },
        }), { button: true });
      };
      return { st, draw };
    };
    const back = (): string => {
      if (!runCancelHooks(null, true)) nav.cancel();
      return shown;
    };
    return { nav, screen, battle, back, get shown() { return shown; } };
  }
  /** 훈련 인형 입구 → [전투 들어가기] = 빈 적 자리 전투(진행 중, hold) */
  function enterArena(w: ReturnType<typeof world>) {
    w.nav.push(w.screen('practice'));
    const empty = w.battle('arena-empty');
    w.nav.push({ id: 'practice-battle', locked: true, render: empty.draw });
    return empty;
  }

  it('입구만 열었다 닫기: 뒤로 = 둥지', () => {
    const w = world();
    w.nav.push(w.screen('practice'));
    expect(w.back()).toBe('room');
  });
  it('창의 [나가기](nav.pop): 입구로 → 뒤로 = 둥지 (옛 버그: 떠난 빈 자리 전투가 뒤로를 삼킴)', () => {
    const w = world();
    enterArena(w);
    w.nav.pop();
    expect(w.shown).toBe('practice');
    expect(w.back()).toBe('room');
  });
  it('적을 골라 싸우다 일시정지 → [그만두기]: 입구로 → 뒤로 = 둥지', () => {
    const w = world();
    enterArena(w);
    const fight = w.battle('arena-fight');
    w.nav.replace({ id: 'practice-battle', locked: true, render: fight.draw }); // [확인] = 빈 자리 전투를 바꿔 끼움 (stop 없음)
    expect(w.back()).toBe('arena-fight'); // 싸우는 중 뒤로 = 일시정지 (화면 그대로)
    expect(fight.st.paused).toBe(true);
    fight.st.stopped = true; // 그만두기 = quit → stop
    w.nav.pop();
    expect(w.shown).toBe('practice');
    expect(w.back()).toBe('room');
  });
  it('이기면 다시 빈 자리 창 → [나가기]: 입구 → 둥지', () => {
    const w = world();
    enterArena(w);
    const fight = w.battle('arena-fight');
    w.nav.replace({ id: 'practice-battle', locked: true, render: fight.draw });
    fight.st.status = 'won';
    const again = w.battle('arena-empty-2');
    w.nav.replace({ id: 'practice-battle', locked: true, render: again.draw });
    w.nav.pop();
    expect(w.back()).toBe('room');
  });
  it('여러 번 들어갔다 나와도 처리기가 쌓이지 않는다 (떠난 전투 처리기는 첫 뒤로에 지워짐)', () => {
    const w = world();
    for (let i = 0; i < 3; i++) {
      enterArena(w);
      w.nav.pop();
      expect(w.back()).toBe('room');
    }
    expect(runCancelHooks(null, true)).toBe(false); // 남은 전투 처리기 없음
  });
  it('battleBackHook: 떠난 전투 = stop 후 gone, 열린 창이 있으면 처리 안 함', () => {
    let stopped = false;
    let paused = false;
    let connected = true;
    const h = battleBackHook({ connected: () => connected, stopped: () => stopped, stop: () => { stopped = true; }, busy: () => paused, pause: () => { paused = true; } });
    expect(h({} as Element)).toBe(false);
    expect(h(null)).toBe(true);
    expect(paused).toBe(true);
    expect(h(null)).toBe(false); // 이미 일시정지 = 창이 받는다
    connected = false;
    expect(h(null)).toBe('gone');
    expect(stopped).toBe(true);
  });
  it('화면 연결: battleView 가 battleBackHook 을 쓰고, 떠난 전투는 프레임 루프도 멈춘다', () => {
    const bv = read('src/ui/battleView.ts');
    expect(bv).toContain('registerCancelHook(battleBackHook({\n    connected: () => app.isConnected,');
    expect(bv).toMatch(/const frame = \(now: number\) => \{\n\s*if \(!app\.isConnected\) stop\(\);/);
  });
});

describe('③ 폭주 블록 문구 (옛 공허 블록)', () => {
  it('블록 표시 = 폭주 · 글자 = 폭 · 종족 설정·도움말 이름 = 폭주 블록', () => {
    expect(BLOCK_WORDS.void).toBe('폭주');
    expect(V2_GLYPH.void).toBe('폭');
    for (const f of FACTIONS) {
      expect(f.voidBlockName).toBe('폭주 블록');
      expect(battleLabels(f).voidBlock).toBe('폭주');
      expect(helpVars(f).voidBlockName).toBe('폭주 블록');
    }
  });
  it('화면 문구에 블록 뜻의 공허가 남아 있지 않다 (주석 제외, 공허의 밤·폭주 연출 글 공허가 몰려든다 제외)', () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const f = join(d, n);
        if (statSync(f).isDirectory()) walk(f);
        else if (/\.(ts|json|svg)$/.test(n)) files.push(f);
      }
    };
    walk('src');
    const left: string[] = [];
    for (const f of files) {
      read(f).split('\n').forEach((line, i) => {
        if (!line.includes('공허')) return;
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // 주석 줄
        const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
        const t = code.replaceAll('공허의 밤', '').replaceAll('공허가 몰려든다', '');
        if (t.includes('공허') && !/^\s*--bha-void:/.test(line)) left.push(`${f}:${i + 1}`);
      });
    }
    expect(left).toEqual([]);
  });
});
