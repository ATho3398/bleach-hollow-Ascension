// 그림 윤곽 굽기 Worker (GDD 186장 1): 화면 스레드를 막지 않고 OffscreenCanvas 에서 drop-shadow 겹을 그린다 (artOutline.ts)
import { shadowChain, type BakeJob } from './artOutlineCore';

interface BakeMsg { id: number; bitmap: ImageBitmap; job: BakeJob }
const scope = self as unknown as { onmessage: ((e: MessageEvent<BakeMsg>) => void) | null; postMessage: (m: unknown, t?: Transferable[]) => void };

scope.onmessage = (e) => {
  const { id, bitmap, job } = e.data;
  try {
    const out = shadowChain((w, h) => {
      const c = new OffscreenCanvas(w, h);
      return [c, c.getContext('2d')];
    }, bitmap, job) as OffscreenCanvas | null;
    bitmap.close();
    if (!out) return scope.postMessage({ id, bitmap: null });
    const result = out.transferToImageBitmap();
    scope.postMessage({ id, bitmap: result }, [result]);
  } catch {
    scope.postMessage({ id, bitmap: null });
  }
};
