// 프레임 애니 그림 + 스킨 (GDD 26장, C.55): 프레임 찾기, 동작별 단계 순서, anim.json, 재생기, 공격 연출 동작 고르기, 스킨 데이터·세이브
import { describe, expect, it } from 'vitest';
import { ANIM_ACTIONS, animCounts, animCountsLine, clipDurationMs, clipHitMs, frameAt, frameFiles, resolveAnims } from '../src/data/art/anim';
import { animWishlist } from '../src/data/art/list';
import { charArt, enemyArt } from '../src/data/art/manifest';
import { ENEMIES } from '../src/data/enemies';
import { FACTIONS } from '../src/data/factions';
import { canWear, getSkin, skinLabel, SKINS, skinsFor } from '../src/data/skins';
import { equipSkin, migrateSave, newSaveData, SAVE_FORMAT_VERSION } from '../src/game';
import { animActionOf } from '../src/ui/attackFx';
import { createAnimPlayer } from '../src/ui/bha/animPlayer';

const f = (dir: string, action: string, n: number, ext = 'png') => Array.from({ length: n }, (_, i) => `${dir}/${action}-${i + 1}.${ext}`);

describe('프레임 파일 찾기 (26-2)', () => {
  it('1번부터 끊기는 곳 앞까지만, 프레임마다 webp 가 png 보다 먼저', () => {
    const files = [...f('char-hollow-1', 'idle', 3), 'char-hollow-1/idle-5.png', 'char-hollow-1/move-1.webp', 'char-hollow-1/move-1.png', 'char-hollow-1/move-2.png'];
    expect(frameFiles('char.hollow.1', 'idle', files)).toHaveLength(3); // 4번이 없으니 5번은 무시
    expect(frameFiles('char.hollow.1', 'move', files)).toEqual(['char-hollow-1/move-1.webp', 'char-hollow-1/move-2.png']);
    expect(frameFiles('char.hollow.1', 'attack', files)).toEqual([]);
  });
  it('동작 키는 10종 데이터 표이고 재생 방식·기본 속도가 26-3 표와 같다', () => {
    expect(ANIM_ACTIONS.map((a) => a.key)).toEqual(['idle', 'move', 'attack', 'skill', 'hit', 'win', 'lose', 'eat', 'sleep', 'release']);
    const by = Object.fromEntries(ANIM_ACTIONS.map((a) => [a.key, a]));
    expect([by.idle!.mode, by.idle!.fps]).toEqual(['loop', 6]);
    expect([by.move!.mode, by.move!.fps]).toEqual(['loop', 10]);
    expect([by.attack!.mode, by.attack!.fps]).toEqual(['once', 12]);
    expect([by.win!.mode, by.win!.fps]).toEqual(['hold', 8]);
    expect([by.lose!.mode, by.lose!.fps]).toEqual(['hold', 8]);
    expect([by.sleep!.mode, by.sleep!.fps]).toEqual(['loop', 4]);
  });
  it('동작별 프레임 수 한 줄 (art:list): 없는 동작은 없음', () => {
    const files = [...f('char-hollow-1', 'idle', 3), ...f('char-hollow-1', 'move', 5)];
    expect(animCounts('char.hollow.1', files).move).toBe(5);
    expect(animCountsLine('char.hollow.1', files)).toBe('idle 3 · move 5 · attack 없음');
    expect(animCountsLine('char.hollow.2', files)).toBeNull();
    expect(animCountsLine('char.hollow.1', [...files, ...f('char-hollow-1', 'lose', 2)])).toBe('idle 3 · move 5 · attack 없음 · lose 2');
  });
});

describe('동작마다 단계별 폴더 → 종족 공통 폴더 (26-2)', () => {
  const files = [...f('char-hollow-1', 'idle', 3), ...f('char-hollow', 'idle', 2), ...f('char-hollow', 'move', 5)];
  it('동작마다 따로 첫 번째로 프레임이 있는 폴더를 쓴다', () => {
    const a = resolveAnims(['char.hollow.1', 'char.hollow'], './', files, {});
    expect(a.idle!.frames).toHaveLength(3); // 단계별 폴더가 먼저
    expect(a.move!.frames).toHaveLength(5); // 단계별에 없으니 공통에서
    expect(a.attack).toBeUndefined();
    expect(a.move!.frames[0]).toBe('./art/char-hollow/move-1.png');
  });
  it('기본 fps·반복 방식, anim.json 으로 fps 와 타격 프레임(1부터)을 바꾼다. 기본 타격은 가운데', () => {
    const fs = [...f('x', 'idle', 3), ...f('x', 'attack', 6)];
    const d = resolveAnims(['x'], '/', fs, {});
    expect(d.idle!.fps).toBe(6);
    expect(d.attack!.fps).toBe(12);
    expect(d.attack!.hitFrame).toBe(2); // 6장의 가운데 = 3번째 = 인덱스 2
    const o = resolveAnims(['x'], '/', fs, { x: { idle: { fps: 5 }, attack: { fps: 14, hit: 5 } } });
    expect(o.idle!.fps).toBe(5);
    expect(o.attack!.fps).toBe(14);
    expect(o.attack!.hitFrame).toBe(4);
    expect(clipHitMs(o.attack!)).toBeCloseTo((4 / 14) * 1000);
    expect(clipDurationMs(o.attack!)).toBeCloseTo((6 / 14) * 1000);
    // 엉터리 값은 무시, 범위를 넘는 hit 는 마지막 장
    const bad = resolveAnims(['x'], '/', fs, { x: { attack: { fps: -3, hit: 99 }, idle: { fps: Number.NaN } } });
    expect(bad.attack!.fps).toBe(12);
    expect(bad.attack!.hitFrame).toBe(5);
    expect(bad.idle!.fps).toBe(6);
  });
});

describe('재생 계산 (frameAt)', () => {
  const fs = f('x', 'idle', 3);
  const loop = resolveAnims(['x'], '/', fs, {}).idle!;
  it('반복은 계속 돌고 끝나지 않는다', () => {
    expect(frameAt(loop, 0)).toEqual({ index: 0, done: false });
    expect(frameAt(loop, 1000 / 6 + 1).index).toBe(1);
    expect(frameAt(loop, (3 / 6) * 1000 + 1)).toEqual({ index: 0, done: false });
  });
  it('한 번 재생은 마지막 장에서 끝난다', () => {
    const a = resolveAnims(['x'], '/', f('x', 'attack', 4), {}).attack!;
    expect(frameAt(a, 0).done).toBe(false);
    expect(frameAt(a, clipDurationMs(a) + 1)).toEqual({ index: 3, done: true });
  });
});

describe('캐릭터·적 그림에 프레임 애니 연결', () => {
  it('애니가 없으면 예전과 똑같다 (anims 없음)', () => {
    const a = charArt('hollow', 0, 'char.hollow', './', {}, ['char-hollow.png']);
    expect(a).toEqual({ src: './art/char-hollow.png', frames: null, scale: 1, offsetY: 0 });
    expect(a.anims).toBeUndefined();
  });
  it('한 장짜리가 없고 idle 만 있으면 idle-1 이 정지 그림이다 (적도 같다)', () => {
    const files = f('char-hollow-1', 'idle', 3);
    const a = charArt('hollow', 0, 'char.hollow', './', {}, files);
    expect(a.src).toBe('./art/char-hollow-1/idle-1.png');
    expect(Object.keys(a.anims!)).toEqual(['idle']);
    const e = enemyArt('a-basic', './', {}, f('enemy-a-basic', 'idle', 2));
    expect(e!.src).toBe('./art/enemy-a-basic/idle-1.png');
    expect(enemyArt('a-basic', './', {}, f('enemy-a-basic', 'attack', 2))).toBeNull(); // 정지 그림이 없으면 기존 실루엣
  });
  it('idle 만 있는 캐릭터: 나머지 동작은 없다고 나온다 (기존 방식으로 간다)', () => {
    const a = charArt('hollow', 0, 'char.hollow', './', {}, [...f('char-hollow-1', 'idle', 3), 'char-hollow-1.png']);
    expect(a.anims!.idle).toBeDefined();
    for (const k of ['move', 'attack', 'skill', 'hit', 'win', 'lose', 'eat', 'sleep', 'release'] as const) expect(a.anims![k]).toBeUndefined();
  });
  it('스킨: 단계와 상관없이 스킨 그림만 쓰고 진화체 애니로 대신하지 않는다', () => {
    const files = [...f('char-hollow-1', 'idle', 3), ...f('char-hollow-1', 'win', 2), 'skin-grandfisher.png', ...f('skin-grandfisher', 'idle', 4), ...f('skin-grandfisher', 'move', 6)];
    const a = charArt('hollow', 0, 'char.hollow', './', {}, files, 'grandfisher');
    expect(a.src).toBe('./art/skin-grandfisher.png');
    expect(a.anims!.idle!.frames).toHaveLength(4);
    expect(a.anims!.move!.frames).toHaveLength(6);
    expect(a.anims!.win).toBeUndefined(); // 진화체의 win 이 스킨에 새어 나오지 않는다
    const none = charArt('hollow', 0, 'char.hollow', './', {}, files);
    expect(none.anims!.win).toBeDefined(); // 스킨을 벗으면 진화체 그림
    // 알 수 없는 스킨 id 이거나 스킨 그림이 아직 없으면 진화체 그림
    expect(charArt('hollow', 0, 'char.hollow', './', {}, files, 'nope').src).toBe('./art/char-hollow-1/idle-1.png');
    expect(charArt('hollow', 0, 'char.hollow', './', {}, ['char-hollow.png'], 'grandfisher').src).toBe('./art/char-hollow.png');
  });
});

describe('재생기 (순수 코어)', () => {
  const files = [...f('x', 'idle', 3), ...f('x', 'attack', 4), ...f('x', 'win', 2), ...f('x', 'hit', 2)];
  const anims = resolveAnims(['x'], '', files, {});
  const make = () => {
    const shown: string[] = [];
    const p = createAnimPlayer(anims, 'still.png', { show: (u) => shown.push(u) });
    return { p, shown };
  };
  it('처음엔 정지 그림, 쉬는 동작을 idle 로 하면 프레임이 바뀐다. 없는 동작은 play 가 null', () => {
    const { p, shown } = make();
    expect(shown).toEqual(['still.png']);
    expect(p.play('move')).toBeNull(); // 없는 동작 — 호출한 쪽이 기존 연출을 쓴다
    p.setLoop('idle');
    p.advance(0);
    p.advance(1000 / 6 + 5);
    expect(shown.at(-1)).toBe('/art/x/idle-2.png');
    p.advance(1000 / 6);
    expect(shown.at(-1)).toBe('/art/x/idle-3.png');
    p.advance(1000 / 6);
    expect(shown.at(-1)).toBe('/art/x/idle-1.png'); // 반복
  });
  it('쉬는 동작이 없으면(setLoop 안 함 / 없는 동작) 정지 그림을 유지한다', () => {
    const { p, shown } = make();
    p.setLoop('move'); // 없는 동작
    p.advance(5000);
    expect(shown).toEqual(['still.png']);
    expect(p.active).toBe(false);
  });
  it('공격 한 번 재생 → 타격 프레임에서 onHit → 끝나면 쉬는 동작으로 돌아간다', () => {
    const { p, shown } = make();
    p.setLoop('idle');
    let hit = 0;
    let end = 0;
    const r = p.play('attack', { onHit: () => hit++, onEnd: () => end++ })!;
    expect(r.hitAtMs).toBeCloseTo((1 / 12) * 1000); // 4장의 가운데 = 2번째 = 인덱스 1
    expect(shown.at(-1)).toBe('/art/x/attack-1.png');
    p.advance(r.hitAtMs + 1);
    expect(hit).toBe(1);
    expect(end).toBe(0);
    p.advance(r.durationMs);
    expect(end).toBe(1);
    expect(hit).toBe(1);
    expect(p.playing).toBe('idle');
  });
  it('배속·일시정지를 따른다', () => {
    const { p, shown } = make();
    p.play('attack');
    p.setRate(2);
    p.advance(1000 / 12); // 2배라 2프레임 지남
    expect(shown.at(-1)).toBe('/art/x/attack-3.png');
    p.setPaused(true);
    p.advance(5000);
    expect(shown.at(-1)).toBe('/art/x/attack-3.png');
    expect(p.active).toBe(false);
  });
  it('승리·패배는 마지막 장을 유지하고, 그 뒤 늦게 온 맞음 애니가 덮지 않는다. stop 으로 풀린다', () => {
    const { p, shown } = make();
    p.setLoop('idle');
    p.play('win');
    p.advance(5000);
    expect(shown.at(-1)).toBe('/art/x/win-2.png');
    expect(p.active).toBe(false);
    p.play('hit'); // 잠겨 있다
    p.advance(5000);
    expect(shown.at(-1)).toBe('/art/x/win-2.png');
    p.stop();
    expect(p.playing).toBe('idle');
    p.play('hit');
    expect(shown.at(-1)).toBe('/art/x/hit-1.png');
  });
});

describe('공격 연출이 고르는 동작 (26-3, 다른 동작으로 대신하지 않는다)', () => {
  const has = (...k: string[]) => (a: 'attack' | 'skill') => k.includes(a);
  it('일반 공격은 attack, 필살·콤보·계열 공격·강공격은 skill', () => {
    expect(animActionOf({ tier: 'basic' }, has('attack', 'skill'))).toBe('attack');
    expect(animActionOf({ tier: 'chain2' }, has('attack', 'skill'))).toBe('attack');
    expect(animActionOf({ tier: 'special', ult: true }, has('attack', 'skill'))).toBe('skill');
    expect(animActionOf({ tier: 'chain1', fx: 'claw' }, has('attack', 'skill'))).toBe('skill');
    expect(animActionOf({ tier: 'special' }, has('attack', 'skill'))).toBe('skill');
  });
  it('그 동작이 없으면 null — attack 만 있어도 skill 자리에 쓰지 않는다 (기존 연출)', () => {
    expect(animActionOf({ tier: 'special', ult: true }, has('attack'))).toBeNull();
    expect(animActionOf({ tier: 'chain1', fx: 'slash' }, has('attack'))).toBeNull();
    expect(animActionOf({ tier: 'basic' }, has('skill'))).toBeNull();
    expect(animActionOf({ tier: 'basic' }, has())).toBeNull();
  });
});

describe('스킨 데이터·세이브 (26-5)', () => {
  it('첫 스킨은 그랜드피셔(가칭, 호로)이고 종족이 다르면 목록에 안 보인다 — 데이터의 종족 필드로', () => {
    const g = getSkin('grandfisher')!;
    expect([g.name, g.tentativeName, g.provisional]).toEqual(['그랜드피셔', true, true]);
    expect(skinLabel(g)).toBe('그랜드피셔(가칭)');
    expect(skinsFor(g.factionId).map((s) => s.id)).toContain('grandfisher');
    const other = FACTIONS.find((x) => x.id !== g.factionId)!;
    expect(skinsFor(other.id).map((s) => s.id)).not.toContain('grandfisher');
    expect(canWear(other.id, 'grandfisher')).toBe(false);
    expect(canWear(g.factionId, 'grandfisher')).toBe(true);
    expect(canWear(g.factionId, null)).toBe(false);
    expect(SKINS.every((s) => /^[a-z]+$/.test(s.id))).toBe(true);
  });
  it('세이브: 새 세이브는 스킨 없음, 입기·기본 복귀, 입을 수 없는 스킨은 거절', () => {
    const s = newSaveData('hollow', 1);
    expect(s.skin).toBeNull();
    expect(equipSkin(s, 'grandfisher')).toBe(true);
    expect(s.skin).toBe('grandfisher');
    expect(equipSkin(s, 'nope')).toBe(false);
    expect(s.skin).toBe('grandfisher');
    expect(equipSkin(s, null)).toBe(true);
    expect(s.skin).toBeNull();
    const other = FACTIONS.find((x) => x.id !== 'hollow')!;
    const o = newSaveData(other.id, 1);
    expect(equipSkin(o, 'grandfisher')).toBe(false);
  });
  it('형식 18 → 19: 스킨 없음으로 열린다. 저장 뒤 다시 열어도 유지, 깨진 값·다른 종족 스킨은 null', () => {
    const old = JSON.parse(JSON.stringify(newSaveData('hollow', 1))) as Record<string, any>;
    old.meta.format = 18;
    delete old.skin;
    const m = migrateSave(old)!;
    expect(SAVE_FORMAT_VERSION).toBe(19);
    expect(m.meta.format).toBe(19);
    expect(m.skin).toBeNull();
    equipSkin(m, 'grandfisher');
    expect(migrateSave(JSON.parse(JSON.stringify(m)))!.skin).toBe('grandfisher');
    const bad = JSON.parse(JSON.stringify(m)) as Record<string, any>;
    bad.skin = 42;
    expect(migrateSave(bad)!.skin).toBeNull();
    const other = FACTIONS.find((x) => x.id !== 'hollow')!;
    const wrong = JSON.parse(JSON.stringify(newSaveData(other.id, 1))) as Record<string, any>;
    wrong.skin = 'grandfisher';
    expect(migrateSave(wrong)!.skin).toBeNull();
  });
});

describe('art:list 애니 표', () => {
  it('애니 폴더가 있는 캐릭터와 스킨 전부를 동작별 프레임 수로 보여 준다', () => {
    const files = [...f('char-hollow-1', 'idle', 3), ...f('char-hollow-1', 'move', 5), ...f('skin-grandfisher', 'idle', 4)];
    const rows = animWishlist(FACTIONS, ENEMIES, SKINS, files);
    expect(rows.find((r) => r.dir === 'char-hollow-1')!.line).toBe('idle 3 · move 5 · attack 없음');
    expect(rows.find((r) => r.dir === 'char-hollow-2')).toBeUndefined();
    const sk = rows.find((r) => r.dir === 'skin-grandfisher')!;
    expect(sk.group).toBe('스킨');
    expect(sk.line).toContain('idle 4');
    expect(animWishlist(FACTIONS, ENEMIES, SKINS, []).find((r) => r.group === '스킨')!.line).toBeNull(); // 스킨은 폴더가 없어도 줄이 나온다
  });
});
