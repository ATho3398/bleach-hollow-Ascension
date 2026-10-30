// C.215 (GDD 137장 1~4): 블록 타입 표시 숨김 · 온천 계단 쭉 내려가기 · 밖으로 나가기 고정 + 월드맵 이동 연출 · 블록 안 체인 원 삭제
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { FACTIONS, getFaction } from '../src/data/factions';
import { formHint, FORM_TABLE } from '../src/data/evolution';
import { TRAITS, traitDescription } from '../src/data/traits';
import { ABILITY_SLOT_LABEL } from '../src/engine/evolution';
import { worldMapOf } from '../src/engine/faction';
import { SPA_PATH } from '../src/ui/spaView';
import { departFoot, standFoot, WORLD_DEPART_MS, WORLD_MOVE_MS } from '../src/ui/worldMapView';

const read = (p: string) => readFileSync(p, 'utf8');

describe('137장 1 블록 타입(물리·혼합·특수, 물공) = 데이터 전용, 화면에 안 보임', () => {
  it('특성 설명에 공격 분류가 없다 (두 종족)', () => {
    for (const t of TRAITS) for (const f of FACTIONS) expect(traitDescription(t.id, f.id)).not.toMatch(/물리|혼합|\((?:특수) 공격 블록\)/);
  });
  it('도움말·능력 설명에 공격 분류 글자가 없다', () => {
    for (const p of ['src/data/help/glossary.json', 'src/data/help/screens.json', 'src/data/help/tutorial.json', 'src/data/help/guides.json', 'src/data/evolution/abilities.json']) {
      expect(read(p), p).not.toMatch(/물리|혼합|공격 분류|물공|마공/);
    }
  });
  it('진화 도감 힌트(4단계 아란칼)는 분류 대신 그 분류의 블록 계열 이름', () => {
    for (const f of FACTIONS) for (const form of FORM_TABLE) {
      const h = formHint(form, f.id);
      expect(h).not.toMatch(/물리|혼합|특수 공격/);
    }
    const ar = FORM_TABLE.find((x) => x.label.kind === 'arrancar' && x.label.category === 'physical')!;
    const fams = getFaction('hollow').families.filter((x) => x.category === 'physical').map((x) => x.abbr).join('·');
    expect(formHint(ar, 'hollow')).toContain(`${fams} 계열 공격 특성`);
  });
  it("특성 칸 '물공' 은 화면에서 '기본 공격' · 붕옥 합체 카드에 분류 없음 · 데이터 키는 그대로", () => {
    expect(ABILITY_SLOT_LABEL['물공']).toBe('기본 공격');
    expect(read('src/ui/evolutionPanel.ts')).toContain('ABILITY_SLOT_LABEL[l.slot]');
    expect(read('src/ui/hogyokuView.ts')).not.toContain('분류 ${');
    expect(read('src/data/elements/stats.json')).toContain('"physical"');
  });
});

describe('137장 2 온천 계단: 멈칫 없이 쭉', () => {
  const v = read('src/ui/spaView.ts');
  it('단마다 멈추는 시간이 없고 경로를 프레임마다 따라간다 (물 잠김도 이어서)', () => {
    expect(v).not.toContain('SPA_STEP_PAUSE_MS');
    expect(v).toContain('requestAnimationFrame(frame)');
    expect(v).toContain('const wl = A.wl === null && B.wl === null ? null : wa + (wb - wa) * k;');
    expect(SPA_PATH.slice(2).every((p) => p.wl !== null)).toBe(true);
  });
  it('나갈 때도 같은 경로를 거꾸로 (walkPath(from, 0)', () => {
    expect(v).toContain('walkPath(from, 0, () => {');
  });
});

describe('137장 3 밖으로 고정 · 월드맵 걸어가서 페이드 전환', () => {
  const wm = read('src/ui/worldMapView.ts');
  const app = read('src/ui/app.ts');
  it('기능 스위치 파일 없음, 옛 방 모험 문·장터 경로 없음', () => {
    expect(existsSync('src/config/features.ts')).toBe(false);
    expect(read('src/ui/roomView.ts')).not.toMatch(/'door'|'market'/);
    expect(app).not.toContain('FEATURES');
    expect(app).not.toContain('.bha-prop--door');
    expect(app).not.toContain('.bha-prop--market');
  });
  // C.228 (GDD 153장 3): 목적지까지 걷기 → 한두 걸음 출발 + 바로 페이드로 대체
  it('출발 = 목적지 쪽으로 짧게, 같은 자리면 그대로, 0.5초 안에 전환', () => {
    for (const f of FACTIONS) {
      const L = worldMapOf(f).layout;
      const a = standFoot(L.home), b = standFoot(L.adventure);
      const d = departFoot(a, b);
      expect(Math.hypot(d.x - a.x, d.y - a.y)).toBeLessThan(Math.hypot(b.x - a.x, b.y - a.y) / 2);
      expect(d.x).toBeGreaterThan(a.x);
      expect(departFoot(a, a)).toEqual(a);
    }
    expect(WORLD_DEPART_MS).toBe(400);
    expect(WORLD_MOVE_MS).toBeLessThanOrEqual(500);
  });
  it('장소를 고르면 walkTo → 출발하자마자 페이드 → 화면 전환, 출발 중 입력 잠금', () => {
    expect(wm).toContain('if (walking) return; // 출발하는 동안 입력 잠금');
    expect(wm).toContain('walkTo(p);');
    expect(wm).toContain('if (!fadeStarted && t >= WORLD_FADE_DELAY_MS) startFade();');
    expect(wm).toContain('act[p]();');
    expect(read('src/ui/bha/worldmap.css')).toContain('.bha-worldmap__fade.is-on { opacity: 1;');
  });
  it('뒤로 = 취소하고 제자리 (화면 스택이 걷는 중이면 맡는다)', () => {
    expect(app).toContain("nav.push({ id: 'worldmap', interceptBack: worldMapCancelWalk,");
    expect(wm).toContain('charEntry.foot = standFoot(wm.layout[at]);');
  });
  it('첫 모험 강제도 같은 연출 (잠긴 장소는 걷지 않고 안내만)', () => {
    expect(wm).toContain('if (locked) return hd.onLocked?.(p);');
  });
});

describe('137장 4 블록 안 체인 원 삭제', () => {
  it('블록 마크업에 pips 가 없다 (전투·갤러리·옛 블록 헬퍼)', () => {
    for (const p of ['src/ui/bha/v2/battle.ts', 'src/ui/bha/battle.ts', 'src/ui/battleView.ts', 'src/ui/bha/v2/gallery.ts']) {
      expect(read(p), p).not.toContain('bha-block__pips');
      expect(read(p), p).not.toContain('setV2Pips');
    }
    for (const p of ['src/ui/bha/v2/bha.css', 'src/ui/bha/components/components.css']) expect(read(p), p).not.toContain('.bha-block__pips');
  });
  it('체인은 블록 바 묶음 라벨(체인 알림)로 그대로', () => {
    expect(read('src/ui/battleView.ts')).toContain('v2ChainEl');
  });
});
