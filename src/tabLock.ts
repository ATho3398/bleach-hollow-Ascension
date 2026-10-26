// 한 번에 한 창만 플레이 (C.139, GDD 88장 1): 같은 세이브를 두 창에서 열면 한쪽의 압축 덩어리 수거가 다른 쪽의 저장을 깨뜨릴 수 있다.
// 먼저 연 창이 잠금을 쥐고, 뒤에 연 창은 "다른 창에서 실행 중" 안내만 띄우고 저장소를 건드리지 않는다.
// navigator.locks 가 있으면 그것(창이 닫히면 브라우저가 풀어 준다), 없으면 BroadcastChannel 로 먼저 연 창에 물어본다.

export const PLAY_LOCK_NAME = 'bha-play';
/** BroadcastChannel 방식에서 먼저 연 창의 답을 기다리는 시간 */
export const PLAY_LOCK_ASK_MS = 300;

interface LockManagerLike {
  request(name: string, opts: { ifAvailable: boolean }, cb: (lock: unknown) => Promise<unknown> | unknown): Promise<unknown>;
}
interface ChannelLike {
  postMessage(m: unknown): void;
  onmessage: ((e: { data: unknown }) => void) | null;
  close(): void;
}
export interface PlayLockDeps {
  locks?: LockManagerLike | null;
  channel?: (() => ChannelLike) | null;
  wait?: (ms: number) => Promise<void>;
}

function defaultDeps(): PlayLockDeps {
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManagerLike }) : undefined;
  return {
    locks: nav?.locks ?? null,
    channel: typeof BroadcastChannel !== 'undefined' ? () => new BroadcastChannel(PLAY_LOCK_NAME) as unknown as ChannelLike : null,
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
}

/** 플레이 잠금을 쥐면 true(이 창이 플레이), 다른 창이 쥐고 있으면 false. 둘 다 없는 환경이면 true(막지 않는다) */
export function acquirePlayLock(deps: PlayLockDeps = defaultDeps()): Promise<boolean> {
  const { locks, channel, wait = (ms) => new Promise((r) => setTimeout(r, ms)) } = deps;
  if (locks) {
    return new Promise<boolean>((resolve) => {
      locks
        .request(PLAY_LOCK_NAME, { ifAvailable: true }, (lock) => {
          if (!lock) {
            resolve(false);
            return undefined;
          }
          resolve(true);
          return new Promise(() => undefined); // 창이 닫힐 때까지 쥐고 있는다
        })
        .catch(() => resolve(true));
    });
  }
  if (!channel) return Promise.resolve(true);
  let ch: ChannelLike;
  try {
    ch = channel();
  } catch {
    return Promise.resolve(true);
  }
  let busy = false;
  let mine = false;
  ch.onmessage = (e) => {
    if (e.data === 'who' && mine) ch.postMessage('busy');
    else if (e.data === 'busy' && !mine) busy = true;
  };
  ch.postMessage('who');
  return wait(PLAY_LOCK_ASK_MS).then(() => {
    if (busy) {
      ch.close();
      return false;
    }
    mine = true; // 채널은 닫지 않는다 — 뒤에 여는 창의 물음에 답한다
    return true;
  });
}
