// C.194 (GDD 120장): 종이인형·옛 한 장 그림 위치 전수 점검 — 모든 종족 × 단계 × 진화체 × 성별 × 스킨에서
// ① 땅에 서는 모습은 발 = 그림자 중심 (이동 방식·그림의 발 높이·배율) ② 말풍선은 머리를 가리지 않는다.
// 새 모습(진화체·스킨·종이인형 외형)이 들어와도 이 표를 지나므로 어긋나면 여기서 걸린다.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FACTIONS } from '../src/data/factions';
import { roomOf } from '../src/engine/faction';
import { FORM_TABLE } from '../src/data/evolution';
import { charArt, RIG_LOCOMOTION, type ArtUrls } from '../src/data/art/manifest';
import { skinsFor } from '../src/data/skins';
import { GENDERS, type Gender } from '../src/engine/gender';
import { locoOf } from '../src/ui/bha/loco';
import { bubbleSpot, roomFootShadowPx } from '../src/ui/bha/room';
import { decodePng } from './helpers/png';

/** 그림 아래 끝에서 발바닥(가장 아래 불투명 줄)까지, 그림 높이 대비 */
const footGapCache = new Map<string, number>();
function footGap(src: string): number {
  const path = `public/${src.replace(/^\//, '')}`;
  let g = footGapCache.get(path);
  if (g === undefined) {
    const { w, h, px } = decodePng(path);
    let bot = -1;
    for (let y = h - 1; y >= 0 && bot < 0; y--) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3]! > 40) { bot = y; break; }
    g = (h - 1 - bot) / h;
    footGapCache.set(path, g);
  }
  return g;
}

interface Look { name: string; art: ArtUrls; formId: string | null; factionId: string }
/** 화면에 실제로 나오는 캐릭터 모습 전부 */
function allLooks(): Look[] {
  const out: Look[] = [];
  for (const f of FACTIONS) {
    const room = roomOf(f);
    for (let tier = 0; tier < f.tierNames.length; tier++) {
      const forms: (string | null)[] = tier === 0 ? [null] : FORM_TABLE.filter((x) => x.tier === tier + 1).map((x) => x.id);
      for (const gender of GENDERS as readonly Gender[]) {
        for (const skin of [null, ...skinsFor(f.id).map((s) => s.id)]) {
          const art = charArt(f.id, tier, room.characterArt, '/', undefined, undefined, skin, undefined, gender);
          for (const formId of forms) out.push({ name: `${f.id} ${tier + 1}단계 ${formId ?? '-'} ${gender} ${skin ?? ''}`, art, formId, factionId: f.id });
        }
      }
    }
  }
  return out;
}
const LOOKS = allLooks();
const factionOf = (id: string) => FACTIONS.find((f) => f.id === id)!;

describe('C.194 발 = 그림자 (GDD 120장 1·3·4)', () => {
  it('점검 대상: 종이인형(사신 학생·사신복·아란칼, 남녀)과 옛 한 장 그림(호로)이 모두 들어 있다', () => {
    const looks = new Set(LOOKS.map((l) => l.art.rig?.look ?? l.art.src));
    for (const l of ['shinigami-student', 'shinigami-student-f', 'shinigami-base', 'shinigami-base-f', 'arrancar-base', 'arrancar-base-f']) expect(looks.has(l), l).toBe(true);
    expect(LOOKS.some((l) => !l.art.rig && l.art.src)).toBe(true);
  });

  it('종이인형은 어느 진화체여도 땅에 선다 (진화체 표의 부유·날기가 몸을 띄우지 않는다 — 학생이 그림자 위에 떠 있던 원인)', () => {
    const bad = LOOKS.filter((l) => l.art.rig && locoOf(factionOf(l.factionId), l.formId, l.art) !== RIG_LOCOMOTION).map((l) => l.name);
    expect(bad).toEqual([]);
  });

  it('땅에 서는 모습의 발 높이 = 그림자 중심 (방 4px 안, 걷기·전투 = 확대 기준점 92% ± 그림 높이 2%)', () => {
    const bad: string[] = [];
    for (const l of LOOKS) {
      if (!l.art.src || locoOf(factionOf(l.factionId), l.formId, l.art) !== 'walk') continue; // 부유·날기는 일부러 떠 있다(그림자는 땅에)
      const g = footGap(l.art.src);
      const room = roomFootShadowPx(g, l.art.scale, l.art.offsetY);
      if (Math.abs(room) > 4) bad.push(`${l.name} 방 ${room.toFixed(1)}px`);
      const field = Math.abs(g - 0.08 + l.art.offsetY / 100) * (l.art.fieldScale ?? l.art.scale);
      if (field > 0.02) bad.push(`${l.name} 필드 ${(field * 100).toFixed(1)}%`);
    }
    expect(bad).toEqual([]);
  });

  it('방 발-그림자 계산은 측정값과 맞는다 (C.194 실제 화면: 종이인형 1.78배 = 발이 그림자보다 약 2px 아래)', () => {
    // 실제 화면 측정(844×390): 학생 발 259.8 / 그림자 258 → +1.8px
    expect(roomFootShadowPx(0.072, 1.78)).toBeGreaterThan(1);
    expect(roomFootShadowPx(0.072, 1.78)).toBeLessThan(3);
    expect(Math.abs(roomFootShadowPx(0.07 * 140 / 130, 1))).toBeLessThan(0.5);
  });
});

describe('C.194 말풍선은 머리를 가리지 않는다 (GDD 120장 2)', () => {
  it('방 위 끝 안이면 머리 위, 넘으면 옆(캐릭터가 오른쪽 절반이면 왼쪽)', () => {
    expect(bubbleSpot(80, 30, 300, 600)).toBe('above');
    expect(bubbleSpot(20, 30, 300, 600)).toBe('right');
    expect(bubbleSpot(20, 30, 400, 600)).toBe('left');
  });
  it('말풍선 높이식에 상태 칩 하한(--chip-h)이 없다 — 칩보다 짧은 말풍선이 머리 위로 내려오던 원인', () => {
    const css = readFileSync('src/ui/bha/room.css', 'utf8');
    const rule = css.slice(css.indexOf('.bha-room__bubble {'), css.indexOf('}', css.indexOf('.bha-room__bubble {')));
    expect(rule).not.toContain('--chip-h');
    expect(css).toContain('.bha-room__bubble.is-side');
  });
});
