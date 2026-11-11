// C.265 (마스터AE 지시, 사용자 캡처: 잠긴 진급 시험 자물쇠가 '책장' 이름표 옆에 붙어 책장 것처럼 보임): 자물쇠는 그 물건 그림 칸 안 귀퉁이 — 방·월드맵 공통
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8');

describe('C.265 잠긴 물건 자물쇠 자리', () => {
  it('자물쇠는 lockProp 하나로만 붙인다 (방·월드맵 모두, 버튼 바로 아래에 붙이지 않음)', () => {
    for (const f of ['src/ui/worldMapView.ts', 'src/ui/marketView.ts']) { // C.394: 방에는 잠긴 물건이 없다(수련장 잠금 표시 삭제, GDD 241-C 2) — 월드맵·시장
      const s = read(f);
      expect(s).not.toContain("b.append(icon('i-lock'))");
      expect(s).toContain('lockProp(b);');
    }
    expect(read('src/ui/bha/room.ts')).toContain("(b.querySelector('.bha-prop__shape') ?? b).append(lock);");
  });
  it('자물쇠 = 그림 칸 안 오른쪽 아래, 흐림은 그림에만', () => {
    const css = read('src/ui/bha/room.css');
    expect(css).toContain('.bha-prop__lock { position: absolute; right: 2px; bottom: 2px;');
    expect(css).toContain('.bha-prop.is-locked .bha-prop__shape > :not(.bha-prop__lock) { opacity: 0.45; }');
    expect(css).not.toContain('.bha-prop.is-locked > .bha-icon');
  });
});
