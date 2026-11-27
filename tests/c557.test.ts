// C.557 남는 여백 = 기기 디자인 몸체 (GDD 14-2 v6.233, 사용자 "위아래로 검은줄 말고 기기 디자인을 보여주면 되잖아").
// C.554 의 한 배율 맞춤은 그대로 두고, 기기 틀(844×390 × 배율) 바깥 남는 곳을 다마고치 모드와 같은 배율·자리의 몸체가 채운다.
// 기본형 = 몸체 둘레(평소 몸체 색), 기기 디자인(frame-v2) = 앞면 그림을 자르지 않음. 몸체가 끝나는 바깥만 어두운 배경.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BODY, tamaLayout } from '../src/ui/bha/tamagoLogic';
import { computeFit, computePcFit } from '../src/ui/bha/viewport';

const src = (p: string) => readFileSync(p, 'utf8');

describe('C.557 기본형: 평소 화면 몸체 = 다마고치 모드 몸체 그대로(같은 배율·자리)', () => {
  it('몸체 = 기기 틀 + 둘레 두께(기기 안 px) — 평소 화면도 같은 배치 함수', () => {
    const l = tamaLayout(844, 390);
    expect(l.body).toEqual({ x: -BODY.pad, y: -BODY.pad, w: 844 + 2 * BODY.pad, h: 390 + 2 * BODY.pad });
  });
  it('화면에서 몸체 둘레 = 두께 × 기기 배율 (태블릿·20:9 폰·PC), 기기 틀 배율·자리는 C.554 그대로', () => {
    for (const f of [computeFit(1024, 768), computeFit(915, 412), computePcFit(1366, 768, 1, 844, 390)]) {
      const ring = BODY.pad * f.scale;
      expect(ring).toBeGreaterThan(0);
      // 몸체 바깥 끝 = 기기 틀 바깥 끝 + 둘레 — 남는 여백(틀 바깥)에서 몸체가 먼저 보이고 그 바깥만 어두운 배경
      expect((f.ox ?? 0) - ring).toBeLessThan(f.ox ?? 0);
      expect(f.w).toBe(844);
      expect(f.h).toBe(390);
    }
  });
  it('tamago.ts: 몸체 층은 늘 보이고, 처음부터 놓는다', () => {
    const t = src('src/ui/bha/tamago.ts');
    expect(t).toContain('function syncRoot(): void {\n    root.hidden = false;\n  }');
    expect(t).not.toContain("root.setAttribute('aria-hidden', 'true');\n  root.hidden = true;");
    expect(t).toContain('if (prefs.on) toggle(true);\n  else relayout();');
  });
  it('tamago.css: 평소 화면에서도 몸체를 남기고, 누르지 않고, 기존 몸체 색 토큰만 쓴다', () => {
    const css = src('src/ui/bha/tamago.css');
    expect(css).toContain('.bha-dev:not(.is-tama) .bha-tama > :not(.bha-tama__art):not(.bha-tama__hit):not(.bha-tama__body) { display: none; }');
    expect(css).toContain('.bha-dev:not(.is-tama) .bha-tama__body { pointer-events: none; background: var(--bha-shell-body); border-color: var(--bha-shell-line); }');
    // 그림 기기는 몸체 대신 그림 (기존 규칙 그대로)
    expect(css).toContain('.bha-dev.has-tama-art .bha-tama__body, .bha-dev.has-tama-art .bha-tama__ring { visibility: hidden; }');
  });
});

describe('C.557 기기 디자인(frame-v2): 앞면 그림이 틀 밖 여백까지', () => {
  const css = src('src/ui/bha/device.css');
  it('평소 화면에서 그림을 기기 틀에서 자르지 않는다', () => {
    expect(css).not.toContain('.bha-dev.is-frame-v2:not(.is-tama) { overflow: hidden; }');
  });
  it('그림이 없는 곳은 바깥과 같은 어두운 배경 (틀 안 무늬 배경 없음)', () => {
    expect(css).toContain('.bha-dev.is-skin.is-frame-v2 { background: transparent; }');
    expect(css).toContain('html, body { background: var(--bha-bg-0); }');
  });
  it('기기 틀 테두리 그림자(C.554)는 없앴다 — 몸체·그림이 이어져 보이게', () => {
    expect(css).not.toContain('.bha-dev { box-shadow:');
  });
});

describe('C.557 기획서', () => {
  it('14-2 줄', () => {
    expect(src('docs/GDD.md')).toContain('검은 띠 대신 착용한 기기 디자인(몸체)이 이어져 보이게');
  });
});
