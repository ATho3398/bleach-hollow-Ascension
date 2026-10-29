// 이동 방식 = 걷기 하나 (GDD 125장, C.200): 부유·날기 삭제. 진화체 표·종족 설정·그림 manifest 에 이동 방식 값이 없고,
// 화면에는 떠오름(data-loco·떠 있는 높이)·날기 돌진 연출이 없다 — 모든 진화체가 땅에 서서 걷고 발 = 그림자.
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FORM_TABLE } from '../src/data/evolution';
import { FACTIONS } from '../src/data/factions';
import { ART_MANIFEST, charArt } from '../src/data/art/manifest';
import { roomOf } from '../src/engine/faction';
import { lungePlan } from '../src/ui/attackFx';
import { ATTACK_FX } from '../src/ui/attackFxConfig';
import { charTopOffset } from '../src/ui/bha/room';

const read = (p: string) => readFileSync(p, 'utf8');
function srcFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? srcFiles(join(dir, d.name)) : /\.(ts|css|json)$/.test(d.name) ? [join(dir, d.name)] : []));
}

describe('모든 진화체 걷기 (GDD 125장)', () => {
  it('진화체 표·종족 설정·그림 manifest 에 이동 방식 값이 없다', () => {
    for (const f of FORM_TABLE) expect('locomotion' in f, f.id).toBe(false);
    expect(read('src/data/evolution/forms.json')).not.toContain('locomotion');
    for (const f of FACTIONS) expect('locomotion' in f, f.id).toBe(false);
    for (const [k, e] of Object.entries(ART_MANIFEST)) expect('locomotion' in e, k).toBe(false);
  });

  it('모든 종족 × 단계 × 진화체의 캐릭터 그림에 이동 방식이 없다 (어느 진화체여도 땅에 서서 걷는다)', () => {
    for (const fac of FACTIONS) {
      const room = roomOf(fac);
      for (let tier = 0; tier < fac.tierNames.length; tier++) {
        const art = charArt(fac.id, tier, room.characterArt, '/');
        expect('locomotion' in art, `${fac.id} ${tier + 1}단계`).toBe(false);
      }
    }
    expect(FORM_TABLE.length).toBeGreaterThan(0);
  });

  it('이동 방식 모듈·부유/날기 연출·?loco= 개발 파라미터가 없다', () => {
    expect(existsSync('src/engine/locomotion.ts')).toBe(false);
    expect(existsSync('src/ui/bha/loco.ts')).toBe(false);
    expect(existsSync('src/ui/bha/loco.css')).toBe(false);
    for (const p of srcFiles('src')) {
      const s = read(p);
      for (const bad of ['data-loco', 'dataset.loco', 'bha-loco-', '--loco-', 'LOCO_LIFT', "get('loco')"]) expect(s.includes(bad), `${p}: ${bad}`).toBe(false);
    }
  });

  it('몸통박치기는 걷기 모양 하나: 세로 이동(떠올랐다 내리꽂기) 없음', () => {
    for (const lv of [ATTACK_FX.basic, ATTACK_FX.chain2]) {
      const t = lungePlan(lv, 1, 100).keyframes.map((k) => String(k.transform));
      expect(t.every((x) => !x.includes('translateY'))).toBe(true);
      expect(t[1]).toContain(`rotate(${(-lv.tiltDeg).toFixed(1)}deg)`);
    }
  });

  it('방 머리 높이(상태 칩·말풍선 자리)는 떠 있는 높이 없이 그림 윗변 그대로', () => {
    // 그림 없음: 몸 상자 윗변 = −(8×2 + 75 + 10)/2 + 8
    expect(charTopOffset({ src: null, frames: null, scale: 1, offsetY: 0 })).toBe(-(16 + 75 + 10) / 2 + 8);
    // 정사각 그림 배율 1: 상자 윗변 + (140 − 130)
    expect(charTopOffset({ src: 'a.png', frames: null, scale: 1, offsetY: 0 })).toBeCloseTo(-(16 + 140 + 10) / 2 + 8 + 10, 5);
  });

  it('전투 내 캐릭터도 발밑 그림자가 보인다 (발 = 그림자 중심, 그림 아래 8%)', () => {
    const css = read('src/ui/bha/battle-scene.css');
    const rule = css.slice(css.indexOf('.bha-hero__shadow {'), css.indexOf('}', css.indexOf('.bha-hero__shadow {')));
    expect(rule).not.toContain('display: none');
    expect(rule).toContain('bottom: 5%; height: 6%'); // 중심 = 5% + 3% = 8%
  });
});
