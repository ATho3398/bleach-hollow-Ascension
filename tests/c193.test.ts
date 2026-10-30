// C.193 (GDD 119장): 원정 체력 회복값 기획값 · 앱 이탈 일시정지 · 사신 지역 이름 · 성별 설명 · 대기 보상 장비
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { bossName } from '../src/data/bosses';
import { getFaction } from '../src/data/factions';
import { difficultyEnemyScale } from '../src/engine/difficulty';
import { advance, carryAttackMult, createExpedition, enemyScale, lapScale } from '../src/engine/expedition/expedition';
import { getEnemy } from '../src/data/enemies';
import { genderLookNote } from '../src/engine/gender';
import { idleYield } from '../src/engine/idle';
import { claimIdle, newSaveData } from '../src/game';
import { installAppAway, isAppAway, onAppAway, resetAppAwayForTest, setAppAway } from '../src/ui/bha/appAway';
import { createExpClock } from '../src/ui/bha/expClock';
import { createBgmPlayer, parseBgmSettings, type AudioLike } from '../src/ui/bgm';
import { idleSummaryText, idleYieldLines } from '../src/ui/idleView';

const PX = BALANCE.provisional.expedition;
const HOUR = 3_600_000;

describe('119장 1 원정 체력 회복값 = 기획값 (107장 3)', () => {
  it('승리 10%·웅덩이 35%', () => {
    expect(PX.hpCarry.winHeal).toBe(0.1);
    expect(PX.hpCarry.restHeal).toBe(0.35);
  });
  it('난이도 가드는 원정 적 공격 배율로 (원정 안에서만, ★1 이 더 낮다)', () => {
    expect(carryAttackMult(1)).toBeLessThan(carryAttackMult(2));
    expect(carryAttackMult(3)).toBe(PX.hpCarry.enemyAttackMult.default);
    expect(enemyScale(1, 'outskirts', 2, 0, 'normal').attack).toBeCloseTo(lapScale(1).attack * difficultyEnemyScale(2, 'normal').attack, 6); // 보스·도구가 쓰는 배율은 그대로
    const exp = createExpedition({ factionId: 'hollow', seed: 3, difficulty: 2, hunger: 20, condition: 80, deck: [], build: newSaveData('hollow', 1).build, evolution: newSaveData('hollow', 1).evolution });
    for (let i = 0; i < 400 && !exp.pending; i++) advance(exp);
    const p = exp.pending!;
    const base = getEnemy(p.enemy.id);
    expect(p.enemy.attackInAttacks).toBeCloseTo(base.attackInAttacks * enemyScale(exp.lap, exp.groundId, 2, 0, p.enemy.class as 'normal').attack * carryAttackMult(2), 6);
  });
});

describe('119장 2 앱 이탈 = 자동 일시정지', () => {
  afterEach(() => resetAppAwayForTest());

  const fakeDoc = () => {
    const fns: Record<string, (() => void)[]> = {};
    const doc = { hidden: false, addEventListener: (t: string, fn: () => void) => void (fns[t] ??= []).push(fn) };
    const win = { addEventListener: (t: string, fn: () => void) => void (fns[t] ??= []).push(fn) };
    const fire = (t: string) => fns[t]?.forEach((f) => f());
    return { doc, win, fire };
  };

  it('화면이 숨으면(홈키·앱 전환) 자리 비움, 보이면 풀림 · pagehide 도 자리 비움', () => {
    const f = fakeDoc();
    const seen: boolean[] = [];
    onAppAway((a) => seen.push(a));
    installAppAway(f.doc, f.win);
    f.doc.hidden = true;
    f.fire('visibilitychange');
    expect(isAppAway()).toBe(true);
    f.doc.hidden = false;
    f.fire('visibilitychange');
    expect(isAppAway()).toBe(false);
    f.fire('pagehide');
    expect(isAppAway()).toBe(true);
    f.fire('pageshow');
    expect(isAppAway()).toBe(false);
    expect(seen).toEqual([true, false, true, false]);
  });

  it('원정 시계: 떠난 동안 걷기·휴식 시간이 흐르지 않고, 돌아오면 남은 시간부터 이어 간다 (몰아서 진행 안 함)', () => {
    let t = 0;
    const timers = new Map<number, { at: number; fn: () => void }>();
    let seq = 0;
    const clock = createExpClock({
      speed: () => 1, blocked: () => isAppAway(), now: () => t,
      setTimer: (fn, ms) => { timers.set(++seq, { at: t + ms, fn }); return seq; },
      clearTimer: (id) => void timers.delete(id as number),
    });
    const advance = (ms: number) => {
      const end = t + ms;
      for (;;) {
        const next = [...timers.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        timers.delete(next[0]);
        t = next[1].at;
        next[1].fn();
      }
      t = end;
    };
    onAppAway(() => clock.rearm());
    let steps = 0;
    clock.set('step', 1000, () => steps++);
    advance(400);
    setAppAway(true);
    advance(60 * 60 * 1000); // 한 시간 자리 비움
    expect(steps).toBe(0);
    setAppAway(false);
    advance(599);
    expect(steps).toBe(0);
    advance(1);
    expect(steps).toBe(1);
  });

  it('노래: 떠나면 멈추고 돌아오면 다시 튼다 · 설정에서 끈 노래는 돌아와도 꺼져 있다', () => {
    const made: (AudioLike & { playing: boolean })[] = [];
    const makeAudio = (src: string) => {
      const a = { src, loop: false, volume: 1, playing: false, play() { this.playing = true; }, pause() { this.playing = false; } };
      made.push(a);
      return a;
    };
    const p = createBgmPlayer({ files: ['nest.mp3'], makeAudio, autoTick: false, settings: { ...parseBgmSettings(null), on: true, volume: 0.5 } });
    p.unlock();
    p.play('nest');
    expect(made[0]!.playing).toBe(true);
    p.setSuspended(true);
    expect(made[0]!.playing).toBe(false);
    p.play('nest'); // 떠난 동안 화면이 트랙을 다시 불러도 소리는 안 난다
    expect(made[0]!.playing).toBe(false);
    p.setSuspended(false);
    expect(made[0]!.playing).toBe(true);
    // 꺼 둔 소리
    p.setSettings({ ...p.settings, on: false });
    p.step(10_000);
    p.setSuspended(true);
    p.setSuspended(false);
    expect(made.some((a) => a.playing)).toBe(false);
  });

  it('전투 화면은 자리 비움에 일시정지 창을 띄우고 자동으로 풀지 않는다 (코드 연결 확인)', () => {
    const src = readFileSync('src/ui/battleView.ts', 'utf8');
    expect(src).toMatch(/onAppAway\(/);
    expect(src).toMatch(/if \(canPause\) setPaused\(true\)/);
    expect(src).not.toMatch(/onAppAway[\s\S]{0,400}setPaused\(false\)/);
    const exp = readFileSync('src/ui/expeditionView.ts', 'utf8');
    expect(exp).toMatch(/isAppAway\(\)/);
  });
});

describe('119장 3 사신 지역 이름', () => {
  it('루콘가 외곽 · 카라쿠라 마을 · 웨코문도', () => {
    const f = getFaction('shinigami');
    expect(Object.values(f.huntingGrounds!).map((g) => g.name)).toEqual(['루콘가 외곽', '카라쿠라 마을', '웨코문도']);
    expect(f.huntingGroundName).toBe('카라쿠라 마을 / 루콘가 외곽');
    expect(bossName('forest-lord', 'shinigami')).toBe('웨코문도의 문지기');
  });
  it('데이터 어디에도 옛 이름이 남지 않는다', () => {
    const files = ['src/data/factions/shinigami.json', 'src/data/story/shinigami/ch1.json', 'src/data/story/shinigami/ch3.json', 'src/data/bosses/bosses.json', 'src/data/traits/traits.json'];
    for (const p of files) expect(readFileSync(p, 'utf8')).not.toMatch(/루콘가이|현세 순찰 구역|단가이/);
  });
});

describe('119장 4 성별 설명', () => {
  it('"여성 그림이 없으면…" 문구 삭제', () => {
    expect(genderLookNote(getFaction('hollow').tierNames, 5, getFaction('hollow').ascension)).toBe('아란칼화를 깬 뒤부터 모습이 달라진다.');
  });
});

describe('119장 5 대기 보상 장비', () => {
  it('1시간 직접 원정 장비 수 × 시간 × share — 정수 + 남은 확률', () => {
    const IX = BALANCE.provisional.idle;
    const y = idleYield(5);
    const k = 5 * IX.share * IX.fullHour.gear;
    expect(y.gear).toBe(Math.floor(k));
    expect(y.gearChance).toBeCloseTo(k - Math.floor(k), 6);
    expect(idleYieldLines(y, getFaction('hollow')).some((l) => l.startsWith('장비 '))).toBe(true);
  });

  it('받으면 장비가 보관함에 들어오고(일반 전투 드롭표·지금 단계 권장 ★) 런 로그에 남는다', () => {
    const s = newSaveData('hollow', 1);
    s.nest.hunger = 0;
    s.nest.weakened = false;
    s.idlePending = { from: s.lastSeenAt, hours: 5, activeHours: 5 };
    const y = idleYield(5);
    const n0 = s.shared.gear.items.length;
    const r = claimIdle(s, s.lastSeenAt + 5 * HOUR, () => 0)!;
    const want = y.gear + (y.gearChance > 0 ? 1 : 0); // rand 0 = 남은 확률 굴림 성공
    expect(r.gear).toBe(want);
    expect(s.shared.gear.items.length - n0).toBe(want);
    const logs = s.runLog.gear.filter((g) => g.source === 'idle');
    expect(logs).toHaveLength(want);
    expect(logs.every((g) => g.star === 1)).toBe(true);
    expect(idleSummaryText(r, getFaction('hollow')).body).toMatch(/장비 \d+개/);
  });
});
