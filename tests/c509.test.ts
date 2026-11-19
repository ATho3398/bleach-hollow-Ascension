// C.509 점검B(코드) 개선: 타일 배치판 window 리스너 누수(B1) · 종이인형 동작 데이터 분리(B5) · 고유 능력 데이터 검사(B3) · 세이브 못 연 이유(B9) · CSS 날 색 상한(B10)
import './helpers/rigMotions';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gestureListeners } from '../src/ui/bha/road';
import { RIG_PACKS, installRigMotions, loadRigMotions, rigMotionsReady } from '../src/data/art/rig/pose';
import { BALANCE } from '../src/config/balance';
import { evoFileShapeErrors, evoKnown, validateEvoUniques } from '../src/data/evolution/uniques';
import uniquesRaw from '../src/data/evolution/uniques.json';
import { lastLoadSaveError, loadSave, newSaveData, SAVE_FORMAT_VERSION, saveRejectReason, writeSave } from '../src/game';

/** window 대신 쓰는 이벤트 대상: 지금 걸려 있는 리스너 수를 센다 (signal 로 풀리면 줄어든다) */
class CountingTarget extends EventTarget {
  live = 0;
  override addEventListener(type: string, cb: EventListenerOrEventListenerObject | null, opts?: AddEventListenerOptions | boolean): void {
    super.addEventListener(type, cb, opts);
    this.live++;
    const signal = typeof opts === 'object' ? opts.signal : undefined;
    signal?.addEventListener('abort', () => this.live--, { once: true });
  }
}
const ptr = (type: string) => Object.assign(new Event(type), { pointerId: 1, clientX: 0, clientY: 0 });

describe('B1 타일 배치판 window 리스너 (road.ts)', () => {
  it('누르는 동안만 3개가 걸리고, 놓으면 0 — 배치판을 여러 번 열고 닫아도 쌓이지 않는다', () => {
    const win = new CountingTarget();
    const seen: string[] = [];
    for (let i = 0; i < 20; i++) {
      // 배치판 하나 = 리스너 묶음 하나. 만들기만 해서는 아무것도 걸리지 않는다
      const g = gestureListeners(win, { move: () => seen.push('move'), up: () => seen.push('up'), cancel: () => seen.push('cancel') });
      expect(win.live).toBe(0);
      g.listen();
      g.listen(); // 두 번 불러도 한 벌
      expect([win.live, g.active]).toEqual([3, true]);
      win.dispatchEvent(ptr('pointermove'));
      g.unlisten();
      expect([win.live, g.active]).toEqual([0, false]);
    }
    win.dispatchEvent(ptr('pointerup'));
    win.dispatchEvent(ptr('pointercancel'));
    expect(seen).toEqual(Array(20).fill('move')); // 푼 뒤엔 어느 배치판도 반응하지 않는다
  });
  it('roadPlanner 는 window 에 직접 걸지 않고 gestureListeners 로만 건다', () => {
    const road = readFileSync('src/ui/bha/road.ts', 'utf8');
    expect(road.match(/window\.addEventListener/g) ?? []).toHaveLength(0);
    expect(road).toContain('gestureListeners(window,');
  });
});

describe('B5 종이인형 동작 데이터 분리 (pose.ts)', () => {
  it('뼈대는 바로, 동작은 loadRigMotions 로 채운다 — 모든 뼈대에 동작이 있다', async () => {
    await loadRigMotions();
    expect(rigMotionsReady()).toBe(true);
    for (const p of RIG_PACKS) expect(Object.keys(p.motions).length, p.id).toBeGreaterThan(0);
    expect(RIG_PACKS.find((p) => p.id === 'humanoid')!.motions.idle).toBeDefined();
  });
  it('뼈대 하나라도 동작 데이터가 빠지면 어느 뼈대인지 적은 오류', () => {
    expect(() => installRigMotions({ humanoid: {} })).toThrow(/종이인형 동작 데이터 없음: serpent/);
  });
  it('메인 번들 쪽(pose.ts·main.ts)은 동작 JSON 을 정적으로 들이지 않는다', () => {
    const pose = readFileSync('src/data/art/rig/pose.ts', 'utf8');
    expect(pose).not.toMatch(/from '\.\/[a-z-]*motions\.json'/);
    expect(pose).toContain("import('./motionsData')");
    expect(readFileSync('src/main.ts', 'utf8')).toContain('loadRigMotions()');
  });
});

describe('B3 고유 능력 데이터 검사 (uniques.ts)', () => {
  const EB = (BALANCE.provisional as unknown as { evoUniques: NonNullable<Parameters<typeof validateEvoUniques>[1]> }).evoUniques;
  type Mut = (d: any) => void; // eslint-disable-line @typescript-eslint/no-explicit-any
  const errorsWith = (mut: Mut, balance = EB): string[] => {
    const d = structuredClone(uniquesRaw);
    mut(d);
    return validateEvoUniques(d as never, balance);
  };
  const firstRule = (d: any) => d.forms['t4:normal:physical'].shinigami.ability.rules[0]; // eslint-disable-line @typescript-eslint/no-explicit-any

  it('지금 데이터는 모양·값 검사를 모두 통과한다', () => {
    expect(evoFileShapeErrors(uniquesRaw)).toEqual([]);
    expect(validateEvoUniques()).toEqual([]);
    expect(evoKnown().maxChain).toBe(3);
  });
  it('when·kind·element·notElement·chain 오타를 잡는다', () => {
    expect(errorsWith((d) => { firstRule(d).when = 'relase'; }).join()).toMatch(/when 은 release·normal \(relase\)/);
    expect(errorsWith((d) => { firstRule(d).kind = ['skil']; }).join()).toMatch(/모르는 블록 종류 skil/);
    expect(errorsWith((d) => { firstRule(d).element = ['wtaer']; }).join()).toMatch(/모르는 속성 wtaer/);
    expect(errorsWith((d) => { firstRule(d).notElement = ['fyre']; }).join()).toMatch(/모르는 속성 fyre/);
    expect(errorsWith((d) => { firstRule(d).chain = [4]; }).join()).toMatch(/chain 4 은 1~3/);
    expect(errorsWith((d) => { firstRule(d).element = ['void']; }).join()).toBe(''); // void = 공허 블록
  });
  it('종족 키·진화체 id·블록 계열을 대조한다', () => {
    expect(errorsWith((d) => { d.forms['t4:normal:physical'].quincy = d.forms['t4:normal:physical'].hollow; }).join()).toMatch(/모르는 종족 quincy/);
    expect(errorsWith((d) => { d.forms['t9:nothing'] = {}; }).join()).toMatch(/t9:nothing: FORM_TABLE 에 없는 진화체/);
    expect(errorsWith((d) => { firstRule(d).do = [{ act: 'spawn', block: 'make', family: 'family-z' }]; }).join()).toMatch(/shinigami 에 없는 블록 계열 family-z/);
  });
  it('특성 수치(balance traits)가 없으면 잡는다 — 예전엔 효과 0 으로 조용히 꺼졌다', () => {
    const noValue = { ...EB, traits: { ...EB.traits, aspd10: {} } };
    expect(validateEvoUniques(undefined, noValue).join()).toMatch(/특성 aspd10: balance 수치 value 없음/);
    const noLine = { ...EB, traits: { ...EB.traits, obliteration: { line: 0.08, eliteMult: 1.5 } } };
    expect(validateEvoUniques(undefined, noLine).join()).toMatch(/obliteration: balance 수치 weakLine 없음/);
    const gone = { ...EB, traits: Object.fromEntries(Object.entries(EB.traits).filter(([k]) => k !== 'crit6')) };
    expect(validateEvoUniques(undefined, gone).join()).toMatch(/특성 crit6: balance evoUniques.traits 에 수치 칸이 없다/);
  });
  it("on 'timer' 규칙은 같은 이름 시계를 맞추는 act 'timer' 가 있어야 한다 · 버프·스택 정의 안쪽", () => {
    expect(errorsWith((d) => { firstRule(d).on = 'timer'; firstRule(d).timer = 'ghost'; }).join()).toMatch(/시계 ghost 를 맞추는 act 'timer' 가 없다/);
    expect(errorsWith((d) => {
      const a = d.forms['t4:normal:physical'].shinigami.ability;
      a.buffs = { ...(a.buffs ?? {}), b: { on: 'enemy' } };
    }).join()).toMatch(/버프 b on 은 self·foe/);
  });
  it('JSON 모양이 틀리면 어느 칸인지 적는다 (타입 단언 전에)', () => {
    const bad = structuredClone(uniquesRaw) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    bad.forms['t4:normal:physical'].shinigami.ability.rules[0].do = 'add';
    bad.forms['t4:normal:physical'].shinigami.ability.rules[0].chain = '3';
    bad.traits.aspd10.effect = 5;
    const e = evoFileShapeErrors(bad);
    expect(e).toContain('forms.t4:normal:physical.shinigami.rules[0].do: 배열이 아니다');
    expect(e).toContain('forms.t4:normal:physical.shinigami.rules[0].chain: 배열이 아니다');
    expect(e).toContain('traits.aspd10.effect: 글자가 아니다(필수 칸)');
    expect(evoFileShapeErrors(null)).toEqual(['uniques.json: 객체가 아니다']);
  });
});

describe('B9 세이브를 못 연 이유 (loadSave)', () => {
  afterEach(() => vi.restoreAllMocks());
  const mem = (init: Record<string, string> = {}) => {
    const m = new Map(Object.entries(init));
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  };
  it('깨진 JSON·새 형식·옛 형식이면 null + 이유 한 줄 + console 경고, 열리면 이유 없음', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(loadSave(mem({ s: '{not json' }), 's')).toBeNull();
    expect(lastLoadSaveError()).toMatch(/^읽다가 오류: /);
    const s = newSaveData('hollow', 1);
    const newer = JSON.parse(JSON.stringify(s));
    newer.meta.format = SAVE_FORMAT_VERSION + 1;
    expect(loadSave(mem({ s: JSON.stringify(newer) }), 's')).toBeNull();
    expect(lastLoadSaveError()).toBe(`더 새 버전의 세이브(형식 ${SAVE_FORMAT_VERSION + 1})다`);
    expect(warn).toHaveBeenCalledTimes(2);
    const ok = mem();
    writeSave(ok, s, 's');
    expect(loadSave(ok, 's')!.factionId).toBe('hollow');
    expect(lastLoadSaveError()).toBeNull();
    expect(loadSave(mem(), 's')).toBeNull(); // 빈 칸은 오류가 아니다
    expect(lastLoadSaveError()).toBeNull();
  });
  it('saveRejectReason: migrateSave 가 거르는 순서대로 이유', () => {
    expect(saveRejectReason(3)).toBe('세이브 내용이 객체가 아니다');
    expect(saveRejectReason({ hello: 1 })).toBe('세이브에 종족·런 로그·형식 번호가 없다');
    expect(saveRejectReason({ factionId: 'hollow', runLog: {}, meta: { format: 1.5 } })).toBe('형식 번호가 이상하다(1.5)');
    expect(saveRejectReason({ factionId: 'hollow', runLog: {}, meta: { format: 10 } }, 87)).toBe('옛 형식(10)이라 이 버전에서 열지 않는다(형식 87부터)');
  });
});

describe('B10 토큰 밖 CSS 날 색은 늘지 않는다', () => {
  // 2026-11-19 점검B 기준 개수 = 상한 (design-system/ 의 토큰·테마 정의는 셈에서 뺀다). 줄이면 상한도 같이 내린다 — 새 색은 토큰으로
  const CAPS: Record<string, number> = {
    'src/ui/bha/battle-c281.css': 289,
    'src/ui/bha/v2/bha.css': 127,
    'src/ui/bha/components/components.css': 45,
    'src/ui/bha/walk-scene.css': 19,
    'src/ui/bha/components/bha-v2.css': 18,
    'src/ui/bha/battle-scene.css': 10,
    'src/ui/bha/tamago.css': 7,
    'src/ui/bha/device.css': 6,
    'src/ui/bha/screens/screens.css': 5,
    'src/ui/bha/spa.css': 4,
    'src/ui/bha/cosmetics.css': 2,
    'src/ui/bha/expedition.css': 1,
    'src/ui/bha/story.css': 1,
  };
  const RAW_COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/g;
  const cssFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f).replace(/\\/g, '/');
      return statSync(p).isDirectory() ? cssFiles(p) : p.endsWith('.css') ? [p] : [];
    });
  it('파일마다 상한 이하, 상한에 없는 CSS 파일은 0', () => {
    const over: string[] = [];
    let total = 0;
    for (const f of cssFiles('src')) {
      if (f.startsWith('src/ui/bha/design-system/')) continue;
      const n = (readFileSync(f, 'utf8').match(RAW_COLOR) ?? []).length;
      total += n;
      if (n > (CAPS[f] ?? 0)) over.push(`${f}: ${n} > ${CAPS[f] ?? 0}`);
    }
    expect(over).toEqual([]);
    expect(total).toBeLessThanOrEqual(534);
  });
});
