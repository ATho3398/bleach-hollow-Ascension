import { describe, expect, it } from 'vitest';
import { HUMANOID, MOTIONS, apply, boneMatrices, layerMatrix, lookLayers, samplePose } from '../src/data/art/rig/pose';
import { createRigPlayer } from '../src/ui/bha/rigAnim';
import { charArt, ART_MANIFEST } from '../src/data/art/manifest';

describe('종이인형 → 게임 캐릭터 재생기 (GDD 96장 30)', () => {
  it('대기·이동·공격·특수·맞음만 있고 그 밖은 없다(기존 연출)', () => {
    const p = createRigPlayer(HUMANOID, MOTIONS);
    for (const a of ['idle', 'move', 'attack', 'skill', 'hit'] as const) expect(p.has(a), a).toBe(true);
    for (const a of ['win', 'lose', 'eat', 'sleep', 'release'] as const) expect(p.has(a), a).toBe(false);
    expect(p.play('win')).toBeNull();
  });
  it('공격은 공격1·2, 특수는 특수1·2 를 번갈아 하고, 타격·끝 콜백이 온다', () => {
    const p = createRigPlayer(HUMANOID, MOTIONS);
    p.setLoop('idle');
    const seen: string[] = [];
    let hit = 0;
    let end = 0;
    for (let i = 0; i < 2; i++) {
      const r = p.play('attack', { onHit: () => hit++, onEnd: () => end++ })!;
      seen.push(p.pose().motion === MOTIONS.attack ? 'attack' : 'attack2');
      expect(r.hitAtMs).toBeLessThan(r.durationMs);
      p.advance(r.durationMs + 1);
    }
    expect(seen).toEqual(['attack', 'attack2']);
    expect([hit, end]).toEqual([2, 2]);
    expect(p.playing).toBe('idle');
  });
  it('배속은 시간을 빨리 흘리고, 멈추면 흐르지 않는다', () => {
    const p = createRigPlayer(HUMANOID, MOTIONS);
    let end = 0;
    const r = p.play('hit', { onEnd: () => end++ })!;
    p.setPaused(true);
    p.advance(r.durationMs * 2);
    expect(end).toBe(0);
    p.setPaused(false);
    p.setRate(2);
    p.advance(r.durationMs / 2 + 1);
    expect(end).toBe(1);
  });
  it('사신 그림은 종이인형(정지 그림 = 쉬는 자세 한 장), 단계별 파일이 있으면 그쪽이 먼저', () => {
    const a = charArt('shinigami', 0, 'char.shinigami', '/', undefined, ['char-shinigami.png']);
    expect(a.rig?.look).toBe('shinigami-base');
    expect(a.src).toBe('/art/rig/humanoid/still/shinigami-base.png');
    expect(ART_MANIFEST['char.shinigami']!.rig).toBe(HUMANOID.looks['shinigami-base'] ? 'shinigami-base' : undefined);
    const staged = charArt('shinigami', 1, 'char.shinigami', '/', undefined, ['char-shinigami-2.png']);
    expect(staged.rig).toBeUndefined();
    expect(staged.src).toBe('/art/char-shinigami-2.png');
    // 2단계 = 진앙영술원 학생 종이인형
    expect(charArt('shinigami', 1, 'char.shinigami', '/', undefined, ['char-shinigami.png']).rig?.look).toBe('shinigami-student');
    expect(charArt('shinigami', 2, 'char.shinigami', '/', undefined, ['char-shinigami.png']).rig?.look).toBe('shinigami-base');
    // 목록·사진처럼 종족 기본 키를 안 넘기는 곳은 그대로 한 장 그림
    expect(charArt('shinigami', 0, '', '/', undefined, ['char-shinigami.png']).rig).toBeUndefined();
  });
  it('모든 동작에서 부위가 게임 그림 칸(view) 안에 있다(칼은 칼끝, 바닥 밑은 땅에 가려져 잘려도 된다)', () => {
    const [vx, vy, vw, vh] = HUMANOID.view!.rect;
    for (const look of Object.keys(HUMANOID.looks)) {
      const layers = lookLayers(HUMANOID, look);
      for (const [mid, m] of Object.entries(MOTIONS)) {
        for (let t = 0; t <= m.duration; t += 20) {
          const mats = boneMatrices(HUMANOID, samplePose(HUMANOID, m, t));
          for (const l of layers) {
            const mm = layerMatrix(HUMANOID, mats, l, m);
            const pts = l.slot === 'weapon' ? [HUMANOID.swordAxis!.tip, [1, 0]] : [[0, 0], [l.size[0], 0], [0, l.size[1]], [l.size[0], l.size[1]]];
            for (const c of pts as [number, number][]) {
              const [x, y] = apply(mm, c);
              expect(x >= vx - 1 && x <= vx + vw + 1 && y >= vy - 1, `${look} ${mid} ${t} ${l.slot} (${x.toFixed(1)},${y.toFixed(1)})`).toBe(true);
            }
          }
        }
      }
    }
  });
});
