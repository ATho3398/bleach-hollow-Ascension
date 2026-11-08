// 일반 세로 (블리치 할로우 어센션 커스텀, GDD 180장): 세로 오스큐라스(custom/cero-oscuras)에서 모으는 가는 빛줄기를 빼고,
// 두께를 절반으로, 시작하자마자 쏘는 빔. 빔 안은 단색(가운데 한 색 + 가장자리 한 색) — 그라데이션·흐르는 줄·맥동·구멍 없음.
// 사용자 2026-11-04 "세로 오스큐라스 얇은 선으로 기모으는듯한 이펙트 없애고, 두께 절반으로 줄여서 바로 발사되는 빔 만들어.
// 이거 이름은 일반 세로. 빔 안에 그라데이션이나 뭔가 움직이는 연출 넣지말고"
// 나오는 법: 첫 2장 흰 번쩍(뻗는 순간) → 단색 빔 유지 → 두께가 줄어 사라짐. 기본 +90° 눕힘(앞 = 오른쪽으로 쏨, 세로 오스큐라스와 같음).
// 02:4x "세로 끝나는 부분 그라데이션으로 없애고, 출발부분은 한 점에서 출발하듯이 수정. 지속시간 반으로 줄이고"
// → 끝 30% 는 점점 성기게(도트 디더) 사라지고, 출발은 한 점에서 TAPER px 동안 두께가 벌어진다. 유지·사라짐 시간 절반.
// 번쩍임(flare)·빛은 pixelfx arcane/magic-circle-cast 에서 (MIT, THIRD_PARTY_NOTICES.md).
import { Lights, PAL, fit, flare, clamp, smooth, ease, WHITE, hex } from "../../core/index.js";
import { bayer } from "../arcane/_lib.js";

// 빔 길이(px), 반 두께(세로 오스큐라스 W 11 의 절반), 뻗는 시간, 유지, 사라짐
const LEN = 196, W = 5.5, SHOOT = 0.09, HOLD = 0.37, OUT = 0.11, END = HOLD + OUT + 0.02;
// 출발점에서 두께가 다 벌어지는 길이(px), 끝에서 사라지기 시작하는 곳(길이 비율)
const TAPER = 22, FADE = 0.7;

export const meta = {
  name: "일반 세로",
  desc: "Cero (custom): a flat beam fires straight away, holds, then thins out. Half as thick as Cero Oscuras, no charge thread, nothing moving inside it.",
  tags: ["custom", "cero", "beam", "laser", "one-shot"],
  size: [236, 72],
  origin: [20, 36],
  duration: END,
  loop: false,
  fps: 30,
  bg: "dark",
  // edge: 테두리 색(없으면 팔레트) — 02:5x "세로랑 세로 오스큐라스 노멀 테두리색은 어두운 검정으로 하자." 도구가 노멀 색일 때 넘긴다
  options: { palette: PAL.arcane, seed: 6, edge: null },
};

export function create(o) {
  const C = fit(o.palette, 8), EDGE = o.edge ? hex(o.edge) : null;
  const lights = new Lights();
  let t = 0, flashed = false;
  // 기본 = +90° 눕혀 앞(오른쪽)으로: 놓인 자리·뒤집기는 그대로, 각도만 +90° (옵션 angle 은 pixelfx 가 자리 잡기에 쓰므로 여기서 더한다)
  const lie = (p) => p.place(p.tx, p.ty, p.fx < 0, (o.angle ?? 0) + Math.PI / 2);
  // 지금 반 두께: 유지 동안 그대로, 끝에 줄어든다
  const half = () => (t < HOLD ? W : W * (1 - ease.inQuad(clamp((t - HOLD) / OUT))));

  // 테두리 색을 따로 줬으면(edge) 그 칸에는 빛을 얹지 않는다 — 둘레 빛에 씻겨 밝아지지 않게
  const edgeCells = [];
  const markEdge = (p, x, y) => EDGE !== null && edgeCells.push(p.cellX(x, y), p.cellY(x, y));
  const unlightEdges = (p) => {
    for (let i = 0; i < edgeCells.length; i += 2) {
      const sx = edgeCells[i], sy = edgeCells[i + 1];
      if (sx < p.ox || sy < p.oy || sx >= p.ox + p.w || sy >= p.oy + p.h) continue;
      p.L[(sy - p.oy) * p.w + (sx - p.ox)] = 0;
    }
    edgeCells.length = 0;
  };
  function beam(p) {
    const w = half();
    if (w < 0.5) return;
    const top = -LEN * ease.outExpo(clamp(t / SHOOT));
    const white = t < 0.067;
    for (let y = 0; y >= Math.ceil(top); y--) {
      const h = -y;
      // 한 점에서 출발: 처음 TAPER px 동안 두께가 0 → w (부드러운 곡선)
      const ww = w * Math.sqrt(clamp((h + 0.5) / TAPER));
      // 끝은 점점 성기게: 길이의 FADE 부터 끝까지 남는 점이 줄어든다(도트 디더)
      const keep = 1 - smooth(LEN * FADE, LEN, h);
      for (let x = Math.floor(-ww); x <= Math.ceil(ww) - 1; x++) {
        const q = Math.abs(x + 0.5) / ww;
        if (q > 1 || keep <= bayer(x, y)) continue;
        // 단색: 가운데 한 색, 가장자리(바깥 1/4) 한 색
        p.px(x, y, white ? WHITE : q < 0.75 ? C[6] : EDGE ?? C[4]);
        if (!white && q >= 0.75) markEdge(p, x, y);
      }
    }
    // 빔 둘레 빛 (빔 안은 그대로)
    const k = w / W;
    p.glow(0, -2, 16, C[5], 0.4 * k);
    p.glow(0, top / 2, -top / 2 + 8, C[4], 0.12 * k);
  }

  return {
    update(dt) {
      t += dt;
      if (!flashed) {
        flashed = true;
        lights.add(0, -10, 40, WHITE, 0.7, 0.12);
        lights.add(0, -40, 70, C[5], 0.6, 0.35);
      }
      lights.update(dt);
    },
    draw(p) {
      lie(p);
      beam(p);
      // 쏘는 순간 번쩍
      if (t < 0.18) {
        const a = t / 0.18;
        flare(p, 0, -2, 18 * Math.pow(1 - a, 1.5), 1 - a, C);
      }
      lights.draw(p);
      unlightEdges(p);
    },
  };
}
