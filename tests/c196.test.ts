// C.196 (GDD 121장 1·2·3·9·10): 배치판 고정 칸·아이콘만, 바퀴 끝 길 줄 가로 밀기, 배경음 끊김, '브금' → '배경음'
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PLAYLIST } from '../src/data/audio/bgm';
import { BGM_FADE_MS, BGM_RETRY_MAX, createBgmPlayer, parseBgmSettings, type AudioLike } from '../src/ui/bgm';
import { LOCKED_NOTE, cellAction } from '../src/ui/bha/road';

const read = (p: string) => readFileSync(p, 'utf8');

type Fake = AudioLike & { playing: boolean; released: boolean };
const mk = (playImpl?: (a: Fake) => Promise<void> | void) => {
  const made: Fake[] = [];
  const toasts: string[] = [];
  const p = createBgmPlayer({
    playlist: PLAYLIST, autoTick: false, settings: parseBgmSettings(null),
    makeAudio: (src) => {
      const a: Fake = {
        src, loop: false, volume: 1, playing: false, released: false, currentTime: 0,
        play() { this.playing = true; return playImpl?.(this); },
        pause() { this.playing = false; },
        removeAttribute(n: string) { if (n === 'src') this.released = true; },
        load() {},
      };
      made.push(a);
      return a;
    },
    onTrack: (t) => toasts.push(t.name),
  });
  p.unlock();
  return { p, made, toasts };
};
const last = (made: Fake[]) => made[made.length - 1]!;
/** 지금 소리 내는 요소 (페이드 끝난 뒤) */
const live = (made: Fake[]) => made.filter((a) => a.playing && !a.released);

describe('121장 9 배경음 끊김', () => {
  it('12곡을 이어 틀어도 늘 한 곡이 울리고, 다 쓴 요소는 파일 연결을 끊는다', () => {
    const { p, made, toasts } = mk();
    for (let i = 0; i < 12; i++) {
      last(made).currentTime = 200;
      last(made).onended?.();
      p.step(BGM_FADE_MS);
      expect(p.currentTrack?.id).toBe(PLAYLIST[(i + 1) % PLAYLIST.length]!.id);
      expect(live(made).length).toBe(1);
      expect(p.voices).toBe(1);
    }
    expect(toasts.length).toBe(12);
    expect(made.slice(0, -1).every((a) => a.released && a.onended === null && a.onerror === null)).toBe(true);
  });

  it('곡 중간 읽기 오류 = 같은 곡을 그 자리부터 다시 잇는다, 한도를 넘으면 다음 곡', () => {
    const { p, made } = mk();
    const first = PLAYLIST[0]!.id;
    for (let k = 0; k < BGM_RETRY_MAX; k++) {
      last(made).currentTime = 95 + k;
      last(made).onerror?.();
      expect(p.currentTrack?.id).toBe(first);
      expect(last(made).currentTime).toBe(95 + k);
      expect(last(made).playing).toBe(true);
      expect(made[made.length - 2]!.released).toBe(true);
    }
    last(made).onerror?.();
    p.step(BGM_FADE_MS);
    expect(p.currentTrack?.id).toBe(PLAYLIST[1]!.id);
    expect(live(made).length).toBe(1);
  });

  it('버린 곡의 play() 가 끊긴 것(AbortError)은 재생 막힘으로 보지 않는다', async () => {
    let n = 0;
    const { p, made } = mk(() => (n++ === 0 ? Promise.reject(Object.assign(new Error('interrupted'), { name: 'AbortError' })) : undefined));
    await Promise.resolve();
    await Promise.resolve();
    expect(p.unlocked).toBe(true);
    p.next();
    expect(last(made).playing).toBe(true);
  });

  it('첫 터치 훅을 떼지 않는다 — 곡 넘김에서 막혀도 다음 터치에 다시 켠다', () => {
    const src = read('src/ui/bgm.ts');
    expect(src).not.toMatch(/removeEventListener\(t, open/);
  });

  it('서비스 워커는 음악 조각(Range)·플레이리스트 요청을 가로채지 않는다', () => {
    const sw = read('scripts/sw-template.js');
    expect(sw).toMatch(/req\.headers\.has\('range'\)/);
    expect(sw).toMatch(/\/audio\/playlist\//);
  });
});

describe("121장 10 '브금' → '배경음'", () => {
  it('곡 알림 머리는 배경음, 화면에 나가는 글자에 브금이 없다', () => {
    const src = read('src/ui/bgm.ts');
    expect(src).toContain("eyebrow: '배경음'");
    for (const f of ['src/ui/bgm.ts', 'src/ui/settingsView.ts', 'src/data/audio/bgm.ts']) {
      const code = read(f).split('\n').filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).map((l) => l.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, ''));
      expect(code.join('\n')).not.toContain('브금');
    }
  });
});

describe('121장 1·2·3 배치판', () => {
  it('확정(고정) 칸을 누르면 안내만, 안내 문구', () => {
    expect(cellAction({ slot: 'prey-a', editable: false, selection: null, index: 2 })).toBe('info');
    expect(cellAction({ slot: 'prey-a', editable: false, selection: { kind: 'hand', tileId: 'x' }, index: 2 })).toBe('info');
    expect(LOCKED_NOTE).toBe('고정 칸 — 바꿀 수 없다');
  });

  it('놓인 칸은 이름 글자 없이 아이콘 + 칸 번호, 고정 칸은 자물쇠', () => {
    const src = read('src/ui/bha/road.ts');
    expect(src).not.toContain("'bha-road__name'");
    expect(src).toMatch(/locked \? \[lockBadge\(\)\]/);
    expect(src).toMatch(/bha-road__cell--nest is-locked/);
    const css = read('src/ui/bha/expedition.css');
    expect(css).toMatch(/\.bha-road__cell\.is-locked/);
    expect(css).toMatch(/\.bha-road__lock/);
  });

  it('바퀴 끝 창 길 줄 = 한 줄 가로 밀기, 칸 크기 고정', () => {
    const css = read('src/ui/bha/expedition.css');
    expect(css).toMatch(/\.bha-sheet \.bha-road \{ display: flex; overflow-x: auto;/);
    expect(css).toMatch(/\.bha-sheet \.bha-road__cell \{ flex: 0 0 72px;/);
    expect(css).toMatch(/\.bha-sheet \.bha-road__wrap \{ flex-shrink: 0; \}/);
  });
});
