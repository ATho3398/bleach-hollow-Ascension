// C.53 (GDD 24장): 꺼 둔 동안 허기·사냥터 3곳·도감 보상·배경 음악·자동 백업·혈 흡혈 상한, 세이브 형식 17
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { FACTIONS, getFaction } from '../src/data/factions';
import { DEFAULT_GROUND_ID, GROUNDS, getGround, openGrounds, parseGround, parseGrounds } from '../src/data/grounds';
import { DEX_MILESTONES, parseDexMilestone } from '../src/data/dexRewards';
import { BGM_TRACKS, findBgmFile } from '../src/data/audio/bgm';
import { ENEMIES } from '../src/data/enemies';
import { enemyPool } from '../src/engine/enemyPool';
import { applyAbsenceHunger, newNest } from '../src/engine/nest';
import { createCombat, playCombatHuman } from '../src/engine/combat';
import { buildCombatParams, gainTrait, newBuild } from '../src/engine/absorb';
import { FOOD_IDS, groundName, parseFactionConfig, roomOf } from '../src/engine/faction';
import { rollBattleFood } from '../src/engine/food';
import { createRng } from '../src/engine/rng';
import {
  advance, buildRunRecord, chooseDifficulty, chooseGround, createExpedition, enemyScale, finishRest, lapScale, playExpedition, restoreExpedition, serializeExpedition, startBattle,
  type ExpeditionState,
} from '../src/engine/expedition';
import { applyAbsence, claimDexRewards, dexCounts, markSeen, migrateSave, newSaveData, recordExpedition, SAVE_FORMAT_VERSION, type SaveData } from '../src/game';
import { PLAYLIST } from '../src/data/audio/bgm';
import { createBgmPlayer, parseBgmSettings, saveBgmSettings, loadBgmSettings, type AudioLike } from '../src/ui/bgm';
import { needsMigration, swapWithBackup } from '../src/saveBackup';
import { readBackupMeta, slotBackupKey, slotKey, stashSlot } from '../src/saveSlots';
import { groundInfo } from '../src/ui/planView';
import { dexMilestoneText, rewardText } from '../src/ui/tutorialGoalsView';
import { useLegacyMigrations } from './helpers/legacyGate';

useLegacyMigrations(); // 옛 형식 마이그레이션 시험 (C.120, GDD 61장)

const NX = BALANCE.provisional.nest;
const H = 3_600_000;
const DECK = ['prey-nest-a', 'prey-nest-a', 'elite-den-a', 'env-fog', 'rest-a', 'prey-nest-b', 'env-ruin', 'elite-den-b'];
const mk = (over: Partial<Parameters<typeof createExpedition>[0]> = {}) => createExpedition({ factionId: 'hollow', seed: 7, hunger: 10, condition: 100, deck: DECK, ...over });
const memStorage = () => {
  const mem: Record<string, string> = {};
  return {
    mem,
    getItem: (k: string) => (k in mem ? mem[k]! : null),
    setItem: (k: string, v: string) => void (mem[k] = v),
    removeItem: (k: string) => void delete mem[k],
  };
};
function toBattle(exp: ExpeditionState): void {
  for (let i = 0; i < 200 && exp.phase !== 'battle'; i++) {
    if (exp.phase === 'moving') advance(exp);
    else if (exp.phase === 'rest') finishRest(exp);
    else break;
  }
}

describe('24-1 꺼 둔 동안 허기', () => {
  it('시간당 +7.5, 한 번에 최대 +60, 허기 100 이하', () => {
    const n = newNest(0);
    n.hunger = 10;
    expect(applyAbsenceHunger(n, 0, 2 * H)).toBeCloseTo(2 * NX.idleHungerPerHour);
    expect(n.hunger).toBeCloseTo(10 + 15);
    const m = newNest(0);
    m.hunger = 0;
    expect(applyAbsenceHunger(m, 0, 100 * H)).toBe(NX.idleHungerMaxGain);
    expect(m.hunger).toBe(60);
    const full = newNest(0);
    full.hunger = 80;
    applyAbsenceHunger(full, 0, 100 * H);
    expect(full.hunger).toBe(100);
  });

  it('원정 중간 저장 중에는 오르지 않는다', () => {
    const save = newSaveData('hollow', 0);
    const before = save.nest.hunger;
    save.activeExpedition = serializeExpedition(mk(), 1, 0);
    expect(applyAbsence(save, 5 * H)).toBe(0);
    expect(save.nest.hunger).toBe(before);
    expect(save.lastSeenAt).toBe(5 * H);
  });

  it('기기 시계를 되돌려도 음수로 가지 않고, 같은 시간을 두 번 세지 않는다', () => {
    const save = newSaveData('hollow', 10 * H);
    save.nest.hunger = 30;
    expect(applyAbsence(save, 4 * H)).toBe(0); // 되돌린 시계
    expect(save.nest.hunger).toBe(30);
    expect(save.lastSeenAt).toBe(10 * H); // 앞선 값 유지
    expect(applyAbsence(save, 12 * H)).toBeCloseTo(2 * NX.idleHungerPerHour);
    markSeen(save, 11 * H);
    expect(save.lastSeenAt).toBe(12 * H);
  });

  it('복귀 말풍선 문구는 종족 설정 room.talk.hungry 에 있다 (두 종족)', () => {
    for (const f of FACTIONS) expect(roomOf(f).talk.hungry.length).toBeGreaterThan(0);
    expect(roomOf(getFaction('hollow')).talk.hungry).not.toEqual(roomOf(getFaction('shinigami')).talk.hungry);
  });
});

describe('24-2 사냥터', () => {
  it('3곳: 1곳 기본, 3단계에 2번째, 5단계에 3번째. 주 속성 2~3종', () => {
    expect(GROUNDS.length).toBe(3);
    expect(openGrounds(0).map((g) => g.id)).toEqual([DEFAULT_GROUND_ID]);
    expect(openGrounds(1).length).toBe(1);
    expect(openGrounds(2).length).toBe(2);
    expect(openGrounds(4).length).toBe(3);
    for (const g of GROUNDS) expect(g.elements.length >= 2 && g.elements.length <= 3).toBe(true);
    expect(getGround('없음').id).toBe(DEFAULT_GROUND_ID);
  });

  it('데이터 검증: 잘못된 사냥터는 거부, 첫 사냥터는 처음부터 열려야 한다', () => {
    expect(() => parseGround({ id: 'x', unlockTierIndex: 0, elements: ['fire'], elementWeight: 2, strength: { hp: 1, attack: 1 } })).toThrow();
    expect(() => parseGround({ id: 'x', unlockTierIndex: 0, elements: ['fire', 'nope'], elementWeight: 2, strength: { hp: 1, attack: 1 } })).toThrow();
    expect(() => parseGrounds([{ id: 'x', unlockTierIndex: 2, elements: ['fire', 'water'], elementWeight: 2, strength: { hp: 1, attack: 1 } }])).toThrow();
    // 먹이 표가 없으면 기본 표
    expect(parseGround({ id: 'x', unlockTierIndex: 0, elements: ['fire', 'water'], elementWeight: 2, strength: { hp: 1, attack: 1 } }).food.normalDropChance).toBe(BALANCE.provisional.food.normalDropChance);
  });

  it('두 종족 모두 사냥터마다 이름이 있다 (종족 설정, 자리 표시)', () => {
    for (const f of FACTIONS) GROUNDS.forEach((g, i) => expect(groundName(f, g.id, i)).toBe(f.huntingGrounds![g.id]!.name));
    expect(groundName({ huntingGroundName: '사냥터' }, 'zzz', 2)).toBe('사냥터 3');
    expect(() => parseFactionConfig({ ...getFaction('hollow'), huntingGrounds: { a: { desc: 'x' } } })).toThrow(/huntingGrounds/);
    expect(groundInfo(getFaction('hollow'), GROUNDS[1]!)).toMatch(/불·뇌·독/);
  });

  it('주 속성 적은 출현 가중치가 커진다 (엔진 공통, 사냥터 id 분기 없음)', () => {
    const g = GROUNDS[1]!;
    const pool = enemyPool('normal', 1, 'wild', g);
    const plain = enemyPool('normal', 1, 'wild');
    for (const e of pool) {
      const p = plain.find((x) => x.enemy.id === e.enemy.id)!;
      expect(e.weight).toBe(p.weight * (g.elements.includes(e.enemy.element) ? g.elementWeight : 1));
    }
  });

  it('고른 사냥터의 강도 배율이 적에 붙고, 배치 단계에서만 바꿀 수 있다', () => {
    const exp = mk();
    expect(exp.groundId).toBe(DEFAULT_GROUND_ID);
    chooseGround(exp, GROUNDS[2]!.id);
    expect(() => chooseGround(exp, 'nope')).toThrow();
    toBattle(exp);
    const p = exp.pending!;
    const base = ENEMIES.find((e) => e.id === p.enemy.id)!;
    const k = enemyScale(exp.lap, exp.groundId);
    expect(k.hp).toBeCloseTo(lapScale(exp.lap).hp * GROUNDS[2]!.strength.hp);
    expect(p.enemy.hpInAttacks).toBeCloseTo(base.hpInAttacks * k.hp);
    expect(() => chooseGround(exp, DEFAULT_GROUND_ID)).toThrow();
    // C.75 (GDD 32-1 6번): 사냥터 강도는 난이도로 일원화(모두 ×1) — 같은 시드면 사냥터가 달라도 적 체력이 같고, 난이도 ★가 다르면 다르다
    expect(GROUNDS.every((g) => g.strength.hp === 1 && g.strength.attack === 1)).toBe(true);
    const a = mk();
    toBattle(a);
    expect(a.pending!.enemy.hpInAttacks).toBeCloseTo(p.enemy.hpInAttacks);
    const b = mk();
    chooseDifficulty(b, 3, 5);
    toBattle(b);
    expect(b.pending!.enemy.hpInAttacks).toBeGreaterThan(p.enemy.hpInAttacks);
  });

  it('먹이 드롭 표는 사냥터 표를 쓴다', () => {
    const always = { normalDropChance: 1, normalTable: { feast: 1 }, eliteExtraChance: 0, eliteTable: { snack: 1 } };
    expect(rollBattleFood(createRng(1), false, always)).toEqual(['feast']);
    expect(rollBattleFood(createRng(1), true, always)).toEqual(['snack']);
  });

  it('원정 중간 저장 왕복에 사냥터가 남고, 모르는 사냥터는 손상으로 본다. 런 로그에 사냥터 기록', () => {
    const exp = mk({ groundId: GROUNDS[1]!.id });
    const snap = serializeExpedition(exp, 1)!;
    const back = restoreExpedition(JSON.parse(JSON.stringify(snap)));
    expect(back.ok && back.exp.groundId).toBe(GROUNDS[1]!.id);
    const bad = JSON.parse(JSON.stringify(snap));
    bad.exp.groundId = 'nope';
    expect(restoreExpedition(bad)).toEqual({ ok: false, reason: 'corrupt' });
    const done = playExpedition(mk({ groundId: GROUNDS[1]!.id }), { returnAfterLap: 1, playBattle: (b) => { b.enemy.hp = 0; b.status = 'won'; b.finisher = { kind: 'basic-attack', traitId: null, element: null }; } });
    expect(buildRunRecord(done).groundId).toBe(GROUNDS[1]!.id);
    const save = newSaveData('hollow', 0);
    recordExpedition(save, done, 0);
    expect(save.runLog.runs.at(-1)!.groundId).toBe(GROUNDS[1]!.id);
  });
});

describe('24-3 도감 보상', () => {
  const withDex = (forms: number, titles: number): SaveData => {
    const save = newSaveData('hollow', 0);
    save.formDex = Array.from({ length: forms }, (_, i) => `f${i}`);
    save.titles = Array.from({ length: titles }, (_, i) => ({ titleId: `t${i}` }) as SaveData['titles'][number]);
    save.shared.food = { snack: 0, basic: 0, hearty: 0, tonic: 0, feast: 0 };
    return save;
  };

  it('표: 진화체 5·10·20·30·45, 칭호 5·10 (데이터, provisional)', () => {
    expect(DEX_MILESTONES.filter((m) => m.dex === 'forms').map((m) => m.count)).toEqual([5, 10, 20, 30, 45]);
    expect(DEX_MILESTONES.filter((m) => m.dex === 'titles').map((m) => m.count)).toEqual([5, 10]);
    expect(() => parseDexMilestone({ id: 'x', dex: 'forms', count: 3, reward: {} })).toThrow();
  });

  it('이정표에 닿으면 먹이·영옥(꾸밈 재화)을 주고, 골드는 주지 않으며, 한 번만 준다', () => {
    const save = withDex(4, 0);
    expect(claimDexRewards(save, 1)).toEqual([]);
    save.formDex.push('f4');
    const g = claimDexRewards(save, 2);
    expect(g.map((x) => x.milestone.id)).toEqual(['forms-5']);
    expect(save.shared.jade).toBe(1);
    expect(save.shared.tradeCoins).toBe(0);
    expect(save.shared.food.hearty).toBe(1);
    expect(claimDexRewards(save, 3)).toEqual([]);
    expect(dexMilestoneText(g[0]!)).toBe('진화체 도감 5종 등록');
    expect(rewardText(g[0]!, getFaction('hollow'))).toContain('영옥');
  });

  it('기존 세이브는 이미 닿은 이정표를 한꺼번에 받는다 (먹이는 상한까지)', () => {
    const save = withDex(21, 10);
    save.shared.food.tonic = 8;
    const g = claimDexRewards(save, 9);
    expect(g.map((x) => x.milestone.id)).toEqual(['forms-5', 'forms-10', 'forms-20', 'titles-5', 'titles-10']);
    expect(save.shared.food.tonic).toBe(BALANCE.provisional.food.cap);
    expect(save.shared.jade).toBe(1 + 2 + 3 + 1 + 2);
    expect(save.shared.dexRewards.length).toBe(5);
    expect(dexCounts(save)).toEqual({ forms: 21, titles: 10 });
  });
});

describe('세이브 형식 17', () => {
  it('16 → 17: 마지막 접속 시각(옛 둥지 시각)·도감 보상 기록·원정 기록 사냥터', () => {
    const old = JSON.parse(JSON.stringify(newSaveData('hollow', 0)));
    old.meta.format = 16;
    delete old.lastSeenAt;
    delete old.shared.dexRewards;
    old.nest.lastTickMs = 12345;
    old.runLog.runs = [{ runId: 1, laps: 1, outcome: 'returned', gained: [], lost: [], endReason: 'returned', seed: 1, factionId: 'hollow', gainedTraits: [], lostTraits: [], riskPeak: 0, breakthrough: false }];
    const m = migrateSave(old)!;
    expect(SAVE_FORMAT_VERSION).toBeGreaterThanOrEqual(17); // C.54 에서 18 (형식 18 검사는 c54.test.ts)
    expect(m.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(m.lastSeenAt).toBe(12345);
    expect(m.shared.dexRewards).toEqual([]);
    expect(m.shared.jade).toBe(0);
    expect(m.runLog.runs[0]!.groundId).toBe(DEFAULT_GROUND_ID);
  });

  it('미래 시각이 저장돼 있으면 지금으로, 숫자가 아니면 지금으로', () => {
    const old = JSON.parse(JSON.stringify(newSaveData('hollow', 0)));
    old.meta.format = 16;
    old.nest.lastTickMs = Date.now() + 1e12;
    expect(migrateSave(old)!.lastSeenAt).toBeLessThanOrEqual(Date.now());
    const cur = JSON.parse(JSON.stringify(newSaveData('hollow', 0)));
    cur.lastSeenAt = 'x';
    expect(typeof migrateSave(cur)!.lastSeenAt).toBe('number');
  });
});

describe('24-4 배경 음악', () => {
  const fake = () => {
    const made: (AudioLike & { playing: boolean })[] = [];
    const makeAudio = (src: string) => {
      const a = { src, loop: false, volume: 1, playing: false, play() { this.playing = true; }, pause() { this.playing = false; } };
      made.push(a);
      return a;
    };
    return { made, makeAudio };
  };

  it('파일 이름 규칙: <키>.mp3 > <키>.ogg, 없으면 null(무음)', () => {
    expect(BGM_TRACKS).toEqual(['nest', 'expedition', 'battle', 'elite', 'boss', 'rank', 'story']);
    expect(findBgmFile('nest', ['nest.ogg', 'nest.mp3'])).toBe('audio/bgm/nest.mp3');
    expect(findBgmFile('battle', ['battle.ogg'])).toBe('audio/bgm/battle.ogg');
    expect(findBgmFile('boss', ['nest.mp3'])).toBeNull();
    // 빌드가 모은 파일 목록은 트랙 키 이름만 의미가 있다 (모르는 이름은 무시된다)
    expect(findBgmFile('story', ['story.wav', 'Story.mp3'])).toBeNull();
  });

  it('파일이 없으면 오디오를 만들지 않고 조용하다 (오류 없음)', () => {
    const f = fake();
    const p = createBgmPlayer({ files: [], makeAudio: f.makeAudio, autoTick: false });
    p.unlock();
    p.play('nest');
    expect(p.wanted).toBe('nest');
    expect(p.current).toBeNull();
    expect(f.made.length).toBe(0);
  });

  it('첫 터치 뒤에 재생, 같은 트랙은 이어 재생, 다른 트랙은 페이드로 바꾼다', () => {
    const f = fake();
    const p = createBgmPlayer({ files: ['nest.ogg', 'battle.mp3'], makeAudio: f.makeAudio, autoTick: false, settings: { ...parseBgmSettings(null), on: true, volume: 0.5 } });
    p.play('nest');
    expect(f.made.length).toBe(1);
    expect(f.made[0]!.playing).toBe(false); // 자동재생 제한: 아직 안 난다
    p.unlock();
    expect(f.made[0]!.playing).toBe(true);
    expect(f.made[0]!.loop).toBe(true);
    p.step(10_000);
    expect(f.made[0]!.volume).toBeCloseTo(0.5);
    p.play('nest');
    expect(f.made.length).toBe(1); // 끊지 않는다
    p.play('battle');
    expect(f.made.length).toBe(2);
    expect(p.current).toBe('battle');
    expect(p.voices).toBe(2); // 페이드 중
    p.step(300);
    expect(f.made[0]!.volume).toBeLessThan(0.5);
    expect(f.made[1]!.volume).toBeGreaterThan(0);
    p.step(10_000);
    expect(p.voices).toBe(1);
    expect(f.made[0]!.playing).toBe(false);
    // 꺼지는 중에 같은 트랙으로 돌아오면 새로 만들지 않고 살린다
    p.play('nest');
    p.step(200);
    p.play('battle');
    expect(f.made.length).toBe(3);
    expect(p.current).toBe('battle');
    expect(p.voices).toBe(2);
  });

  it('음악 끔·음량 (효과음과 별도 저장)', () => {
    const f = fake();
    const p = createBgmPlayer({ files: ['nest.mp3'], makeAudio: f.makeAudio, autoTick: false });
    p.unlock();
    p.play('nest');
    p.step(10_000);
    p.setSettings({ ...p.settings, on: true, volume: 0.25 });
    expect(f.made[0]!.volume).toBeCloseTo(0.25);
    p.setSettings({ ...p.settings, on: false, volume: 0.25 });
    p.step(10_000);
    expect(p.current).toBeNull();
    expect(p.voices).toBe(0);
    p.setSettings({ ...p.settings, on: true, volume: 1 });
    expect(p.current).toBe('nest'); // 다시 켜면 그 화면 트랙
    const st = memStorage();
    saveBgmSettings(st, { on: false, volume: 0.75, track: null, repeat: false, excluded: [] });
    expect(loadBgmSettings(st)).toEqual({ on: false, volume: 0.75, track: null, repeat: false, excluded: [] });
    expect(Object.keys(st.mem)).toEqual(['bha-bgm-settings']);
    expect(parseBgmSettings('{bad')).toEqual({ on: true, volume: 0.5, track: null, repeat: false, excluded: [] });
    expect(parseBgmSettings('{"volume": 9}').volume).toBe(1);
  });

  it('재생이 막혀도(자동재생 거부) 오류 없이 다음 터치에 다시 한다', async () => {
    let tries = 0;
    const p = createBgmPlayer({
      files: ['nest.mp3'], autoTick: false,
      makeAudio: (src) => ({ src, loop: false, volume: 1, play: () => { tries++; return tries === 1 ? Promise.reject(new Error('blocked')) : Promise.resolve(); }, pause() {} }),
    });
    p.unlock();
    p.play('nest');
    await Promise.resolve();
    await Promise.resolve();
    expect(p.unlocked).toBe(false);
    p.unlock();
    expect(tries).toBe(2);
  });
});

describe('97장 브금 플레이리스트', () => {
  const mk = (settings = parseBgmSettings(null)) => {
    const made: (AudioLike & { playing: boolean })[] = [];
    const saved: unknown[] = [];
    const toasts: string[] = [];
    const p = createBgmPlayer({
      playlist: PLAYLIST, autoTick: false, settings,
      makeAudio: (src) => { const a = { src, loop: false, volume: 1, playing: false, play() { this.playing = true; }, pause() { this.playing = false; } }; made.push(a); return a; },
      persist: (s) => saved.push(s), onTrack: (t) => toasts.push(t.name),
    });
    p.unlock();
    return { p, made, saved, toasts };
  };
  const ids = PLAYLIST.map((t) => t.id);

  it('곡 이름·순서·파일', () => {
    expect(PLAYLIST.map((t) => t.name)).toEqual(['난무의 멜로디', 'chAngE', '나선', '소녀S', '혜성']);
    expect(PLAYLIST.map((t) => t.file)).toEqual(['ranbu-no-melody', 'change', 'rasen-acoustic', 'shoujo-s', 'track-5'].map((n) => `audio/playlist/${n}.mp3`));
  });

  it('화면 트랙 키와 상관없이 첫 곡부터, 끝나면 다음 곡, 마지막 뒤 처음', () => {
    const { p, made, toasts } = mk();
    p.play('nest');
    expect(made.length).toBe(1);
    expect(made[0]!.src).toContain('ranbu-no-melody.mp3');
    p.play('battle'); // 화면이 바뀌어도 끊기지 않는다
    expect(made.length).toBe(1);
    expect(made[0]!.loop).toBe(false);
    for (let i = 1; i < 5; i++) { made[made.length - 1]!.onended?.(); expect(p.currentTrack?.id).toBe(ids[i]); }
    made[made.length - 1]!.onended?.();
    expect(p.currentTrack?.id).toBe(ids[0]);
    expect(toasts).toEqual(['chAngE', '나선', '소녀S', '혜성', '난무의 멜로디']);
  });

  it('제외 곡은 자동 넘김에서 건너뛰고, 직접 ▶ 는 재생한다', () => {
    const { p, made } = mk();
    p.toggleExcluded('change');
    made[0]!.onended?.();
    expect(p.currentTrack?.id).toBe('rasen-acoustic');
    p.playTrack('change');
    expect(p.currentTrack?.id).toBe('change');
    expect(made[made.length - 1]!.src).toContain('change.mp3');
  });

  it('듣던 곡을 제외하면 다음 곡으로, 전부 제외면 무음', () => {
    const { p } = mk();
    p.toggleExcluded('ranbu-no-melody');
    expect(p.currentTrack?.id).toBe('change');
    for (const id of ids) if (!p.settings.excluded.includes(id)) p.toggleExcluded(id);
    expect(p.currentTrack).toBeNull();
    p.step(10_000);
    expect(p.voices).toBe(0);
    p.toggleExcluded('shoujo-s'); // 하나 풀면 다시 재생
    expect(p.currentTrack?.id).toBe('shoujo-s');
  });

  it('현재 곡만 반복이면 loop, 다음 곡 버튼, 한 곡만 남으면 그 곡을 다시', () => {
    const { p, made, saved } = mk();
    p.toggleRepeat();
    expect(made[0]!.loop).toBe(true);
    expect(p.settings.repeat).toBe(true);
    p.toggleRepeat();
    p.next();
    expect(p.currentTrack?.id).toBe('change');
    for (const id of ids) if (id !== 'change') p.toggleExcluded(id);
    const n = made.length;
    made[made.length - 1]!.onended?.();
    expect(p.currentTrack?.id).toBe('change');
    expect(made.length).toBe(n + 1);
    expect(saved.length).toBeGreaterThan(3);
  });

  it('저장값 복원: 지금 곡·반복·제외 목록, 제외된 곡이 저장돼 있으면 다음 곡', () => {
    const st = memStorage();
    saveBgmSettings(st, { on: true, volume: 0.5, track: 'rasen-acoustic', repeat: true, excluded: ['shoujo-s', 'change'] });
    const s = loadBgmSettings(st);
    expect(s).toMatchObject({ track: 'rasen-acoustic', repeat: true, excluded: ['shoujo-s', 'change'] });
    const a = mk(s);
    expect(a.p.currentTrack?.id).toBe('rasen-acoustic');
    expect(a.made[0]!.loop).toBe(true);
    const b = mk({ ...s, track: 'change' });
    expect(b.p.currentTrack?.id).toBe('rasen-acoustic');
    expect(Object.keys(st.mem)).toEqual(['bha-bgm-settings']);
  });
});

describe('24-5 자동 백업', () => {
  it('되돌릴 수 없는 일 직전 지금 슬롯을 백업 키에 보관(최근 1개)하고 까닭을 남긴다. 되돌리기와 이어진다', () => {
    const st = memStorage();
    st.setItem(slotKey(2), 'A');
    stashSlot(st, 2, 'rank', 100);
    expect(st.getItem(slotBackupKey(2))).toBe('A');
    expect(readBackupMeta(st, 2)).toEqual({ reason: 'rank', at: 100 });
    st.setItem(slotKey(2), 'B');
    stashSlot(st, 2, 'migration', 200);
    expect(st.getItem(slotBackupKey(2))).toBe('B'); // 최근 1개
    st.setItem(slotKey(2), 'C');
    expect(swapWithBackup(st, 2)).toBe(true);
    expect(st.getItem(slotKey(2))).toBe('B');
    expect(readBackupMeta(st, 2)?.reason).toBe('revert');
  });

  it('옛 형식 세이브인지 판단 (마이그레이션 직전 백업)', () => {
    const save = newSaveData('hollow', 0);
    expect(needsMigration(JSON.stringify(save))).toBe(false);
    expect(needsMigration(JSON.stringify({ ...save, meta: { ...save.meta, format: 16 } }))).toBe(true);
    expect(needsMigration('{bad')).toBe(false);
    expect(needsMigration(null)).toBe(false);
  });
});

describe('혈 흡혈 상한 (C.53)', () => {
  it('한 전투 흡혈 회복 합계 ≤ 최대 체력 × drainCapFraction', () => {
    const cap = BALANCE.provisional.elements.drainCapFraction;
    expect(cap).toBeLessThanOrEqual(0.2);
    const b = newBuild();
    gainTrait(b, 't-blood-a');
    const params = { ...buildCombatParams(b, 'hollow'), drainFraction: 0.5 }; // 상한이 꼭 걸리게 흡혈을 키운다
    const elite = ENEMIES.find((e) => e.class === 'elite' && !e.testOnly)!;
    for (let seed = 1; seed <= 5; seed++) {
      const s = playCombatHuman(createCombat(seed, { enemy: elite, params }));
      expect(s.player.drained ?? 0).toBeLessThanOrEqual(s.player.maxHp * cap + 1e-9);
    }
  });
});

describe('재화 이름 (GDD 25-1 v5.11)', () => {
  it('일반 재화 = 골드(세이브 키 tradeCoins 그대로), 꾸밈 재화 = 영옥 (새 세이브 0)', async () => {
    const eco = await import('../src/data/economy');
    expect(eco.TRADE_CURRENCY_NAME).toBe('골드');
    expect(eco.JADE_NAME).toBe('영옥');
    const save = newSaveData('hollow', 0);
    expect(save.shared.jade).toBe(0);
    expect(save.shared.tradeCoins).toBe(0);
  });
});

describe('먹이 이름', () => {
  it('먹이 이름에 "결정"이 들어가지 않는다 (붕옥 재화 영혼 결정과 헷갈림 방지)', () => {
    for (const f of FACTIONS) for (const id of FOOD_IDS) expect(f.foodNames[id]).not.toContain('결정');
  });
});
