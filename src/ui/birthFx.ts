// 첫 시작 탄생 연출 재생기 (GDD 74장, C.126): 종족 설정의 birthFx 단계 목록을 차례로 재생하는 공통 엔진. 종족 이름·id 로 분기하지 않는다.
// 그림 없이 CSS + Web Animations 모션(영혼 불빛·사슬·불꽃·섬광). 색은 설정이 이름 붙인 디자인 토큰만. 화면(버튼)을 누르면 건너뛴다.
import type { BirthFx, FactionConfig } from '../engine/faction';
import { el } from './bha/dom';
import { getOverlayHost, registerLayer } from './bha/overlayHost';
import { flickerKeyframeOffsets, planBirth, seeded, stagger } from './birthPlan';
import { prefersReducedMotion } from './fxSettings';

export interface BirthOptions {
  /** 캐릭터가 드러나기 시작할 때 (방의 캐릭터 등장 모션을 시작한다) */
  onReveal?: () => void;
  /** 끝났거나 건너뛰었을 때 */
  onDone?: () => void;
}

export interface BirthHandle {
  skip(): void;
}

type Anim = Animation;

/** 탄생 연출을 띄운다. 종족에 birthFx 가 없으면 null (아무것도 안 한다) */
export function playBirth(faction: Pick<FactionConfig, 'birthFx'>, o: BirthOptions = {}): BirthHandle | null {
  const fx: BirthFx | undefined = faction.birthFx;
  if (!fx || fx.steps.length === 0) return null;
  const plan = planBirth(fx, prefersReducedMotion());
  const layer = el('div', 'bha-birth');
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-label', '탄생 연출');
  for (const [role, token] of Object.entries(fx.colors)) layer.style.setProperty(`--birth-${role}`, `var(${token})`);

  const stage = el('div', 'bha-birth__stage');
  const orb = el('div', 'bha-birth__orb');
  const chain = el('div', 'bha-birth__chain');
  const burst = el('div', 'bha-birth__burst');
  const flames = el('div', 'bha-birth__flames');
  const embers = el('div', 'bha-birth__embers');
  const flash = el('div', 'bha-birth__flash');
  stage.append(chain, orb, embers);
  const skipBtn = el('button', 'bha-birth__skip') as HTMLButtonElement;
  skipBtn.type = 'button';
  skipBtn.setAttribute('aria-label', '건너뛰기');
  const hint = el('span', 'bha-birth__hint', '화면을 누르면 건너뛰기');
  layer.append(burst, stage, flames, flash, hint, skipBtn);
  getOverlayHost().append(layer);
  const unregister = registerLayer(layer, () => skip());

  const anims: Anim[] = [];
  const timers: number[] = [];
  let done = false;
  let revealed = false;
  const run = (e: Element, kf: Keyframe[], ms: number, opt: KeyframeAnimationOptions = {}): void => {
    if (typeof e.animate !== 'function') return;
    anims.push(e.animate(kf, { duration: ms, fill: 'forwards', easing: 'ease-out', ...opt }));
  };
  const after = (ms: number, fn: () => void): void => {
    timers.push(window.setTimeout(fn, ms));
  };
  const reveal = () => {
    if (revealed) return;
    revealed = true;
    o.onReveal?.();
  };
  const finish = () => {
    if (done) return;
    done = true;
    for (const t of timers) window.clearTimeout(t);
    for (const a of anims) a.cancel();
    unregister();
    layer.remove();
    reveal();
    o.onDone?.();
  };
  function skip(): void {
    if (done) return;
    // 건너뛰기: 바로 드러내고 짧게 걷힌다
    for (const t of timers.splice(0)) window.clearTimeout(t);
    reveal();
    run(layer, [{ opacity: 1 }, { opacity: 0 }], 160, { easing: 'linear' });
    timers.push(window.setTimeout(finish, 170));
  }
  skipBtn.onclick = skip;

  // ── 효과 낱말: 단계마다 한 번 ──
  const link = (i: number): HTMLElement => {
    const l = el('i', 'bha-birth__link');
    if (i % 2 === 1) l.classList.add('is-turn');
    return l;
  };
  const effects: Record<string, (ms: number, count?: number) => void> = {
    // 영혼 불빛이 나타나 떠 있다
    orb: (ms) => {
      run(orb, [{ opacity: 0, transform: 'scale(0.3)' }, { opacity: 1, transform: 'scale(1)' }], ms);
      run(stage, [{ transform: 'translateY(-4px)' }, { transform: 'translateY(4px)' }], 1400, { direction: 'alternate', iterations: Infinity, easing: 'ease-in-out', fill: 'none' });
    },
    // 점점 빨라지는 깜빡임, 끝에 밝고 커진다
    flicker: (ms, count = 6) => {
      const offs = flickerKeyframeOffsets(count);
      const kf: Keyframe[] = [];
      offs.forEach((offset, i) => {
        const phase = i === offs.length - 1 ? 3 : i % 3; // 0 켜짐 · 1 꺼짐 · 2 켜짐 (마지막 = 커진 켜짐)
        const grow = 1 + (i / offs.length) * 0.5;
        const v = phase === 1 ? { opacity: 0.18, transform: 'scale(0.85)' } : { opacity: 1, transform: `scale(${phase === 3 ? 1.7 : grow})` };
        kf.push({ offset, ...v });
      });
      run(orb, kf, ms, { easing: 'linear' });
    },
    // 영혼에서 사슬이 늘어져 내려온다
    chain: (ms, count = 6) => {
      const delays = stagger(count, ms * 0.8);
      for (let i = 0; i < count; i++) {
        const l = link(i);
        chain.append(l);
        run(l, [{ opacity: 0, transform: 'translateY(-14px)' }, { opacity: 1, transform: 'translateY(0)' }], Math.max(120, ms * 0.35), { delay: delays[i] });
      }
    },
    // 사슬 끝(아래)부터 불붙어 타 들어가며 사라진다 + 불씨
    burn: (ms, count = 6) => {
      const links = [...chain.children] as HTMLElement[];
      const n = links.length || count;
      const delays = stagger(n, ms * 0.7, true); // 마지막 고리가 먼저
      links.forEach((l, i) => {
        run(l, [
          { opacity: 1, filter: 'none', transform: 'scale(1)' },
          { opacity: 1, filter: 'drop-shadow(0 0 6px var(--birth-ember, currentColor))', borderColor: 'var(--birth-ember, currentColor)', offset: 0.4 },
          { opacity: 0, filter: 'drop-shadow(0 0 10px var(--birth-ember, currentColor))', transform: 'scale(1.25)' },
        ], Math.max(160, ms * 0.35), { delay: delays[i] });
        for (let k = 0; k < 2; k++) {
          const e = el('i', 'bha-birth__ember');
          e.style.left = `${(seeded(i * 2 + k, 3) - 0.5) * 36}px`;
          e.style.top = `${i * 24 + 12}px`;
          embers.append(e);
          run(e, [
            { opacity: 0, transform: 'translate(0, 0) scale(0.6)' },
            { opacity: 1, transform: `translate(${(seeded(i + k, 5) - 0.5) * 30}px, -${14 + seeded(i, k) * 18}px) scale(1)`, offset: 0.3 },
            { opacity: 0, transform: `translate(${(seeded(i + k, 7) - 0.5) * 50}px, -${50 + seeded(i, k + 2) * 50}px) scale(0.3)` },
          ], Math.max(300, ms * 0.5), { delay: (delays[i] ?? 0) + k * 90 });
        }
      });
      run(orb, [{ transform: 'scale(1)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' }], ms, { fill: 'forwards' });
    },
    // 번쩍
    flash: (ms) => {
      run(flash, [{ opacity: 0 }, { opacity: 1, offset: 0.35 }, { opacity: 0 }], ms, { easing: 'ease-in-out' });
    },
    // 검은 불꽃이 확 일어난다: 영혼 자리에서 번지는 어둠 + 아래에서 솟는 불꽃
    flames: (ms) => {
      run(burst, [{ opacity: 0, transform: 'scale(0.05)' }, { opacity: 1, transform: 'scale(1)' }], ms * 0.6);
      flames.style.setProperty('--flames-glow', '1');
      const n = 14;
      for (let i = 0; i < n; i++) {
        const f = el('i', 'bha-birth__flame');
        f.style.left = `${4 + (92 * i) / (n - 1)}%`;
        f.style.setProperty('--flame-h', `${30 + seeded(i, 11) * 38}%`);
        flames.append(f);
        run(f, [
          { opacity: 0, transform: 'translateY(40%) scaleY(0.2)' },
          { opacity: 1, transform: 'translateY(0) scaleY(1)', offset: 0.55 },
          { opacity: 0.95, transform: 'translateY(-6%) scaleY(1.15)' },
        ], ms * 0.7, { delay: seeded(i, 13) * ms * 0.3 });
      }
    },
    // 걷히며 캐릭터 등장
    reveal: (ms) => {
      reveal();
      run(layer, [{ opacity: 1 }, { opacity: 0 }], ms, { easing: 'ease-in' });
    },
  };

  for (const st of plan.steps) after(st.at, () => effects[st.fx]?.(st.ms, st.count));
  after(plan.total + 40, finish);
  return { skip };
}
