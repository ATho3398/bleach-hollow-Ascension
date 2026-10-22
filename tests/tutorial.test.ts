// 첫 플레이 튜토리얼·도움말 (GDD 14-2, C.19)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../src/data/enemies';
import { FACTIONS } from '../src/data/factions';
import {
  BATTLE_HELP_TARGETS, GLOSSARY, helpVars, placeholdersOf, renderHelpText, SCREEN_HELPS, TUTORIAL_SCENES,
} from '../src/data/help';
import { createCombat, step, type CombatInput } from '../src/engine/combat';
import {
  frameTicks, isTutorialActive, markTutorialSeen, newHelpState, sanitizeHelpState, shouldAutoShowTutorial, startTutorial, tutorialNext, tutorialPrev,
  tutorialSkip,
} from '../src/engine/tutorial';
import { loadSave, migrateSave, newSaveData, SAVE_FORMAT_VERSION, SAVE_KEY, writeSave } from '../src/game';
import { placeCard, unionRect } from '../src/ui/helpLayout';
import { useLegacyMigrations } from './helpers/legacyGate';

useLegacyMigrations(); // 옛 형식 마이그레이션 시험 (C.120, GDD 61장)

describe('튜토리얼 상태 머신', () => {
  it('장면을 순서대로 지나 마지막에서 끝난다', () => {
    let s = startTutorial(8);
    const seen = [s.index];
    while (isTutorialActive(s)) {
      s = tutorialNext(s);
      if (isTutorialActive(s)) seen.push(s.index);
    }
    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(s.status).toBe('completed');
  });

  it('이전은 첫 장면에서 멈추고, 끝난 뒤에는 움직이지 않는다', () => {
    let s = startTutorial(3);
    expect(tutorialPrev(s).index).toBe(0);
    s = tutorialNext(tutorialNext(s));
    expect(tutorialPrev(s).index).toBe(1);
    const done = tutorialNext(s);
    expect(done.status).toBe('completed');
    expect(tutorialNext(done)).toEqual(done);
    expect(tutorialPrev(done)).toEqual(done);
    expect(tutorialSkip(done).status).toBe('completed');
  });

  it('건너뛰기는 어느 장면에서든 끝낸다', () => {
    const s = tutorialSkip(tutorialNext(startTutorial(8)));
    expect(s.status).toBe('skipped');
    expect(isTutorialActive(s)).toBe(false);
  });

  it('다시 시작하면 처음 장면부터 다시 한다', () => {
    const skipped = tutorialSkip(startTutorial(8));
    expect(skipped.status).toBe('skipped');
    expect(startTutorial(8)).toEqual({ index: 0, count: 8, status: 'active' });
    expect(startTutorial(0).status).toBe('completed');
  });

  it('한 번만 자동 표시한다', () => {
    const help = newHelpState();
    expect(shouldAutoShowTutorial(help)).toBe(true);
    markTutorialSeen(help);
    expect(shouldAutoShowTutorial(help)).toBe(false);
  });
});

describe('튜토리얼 플래그 저장·마이그레이션', () => {
  it('새 세이브는 아직 안 본 상태이고 저장·로드를 거쳐도 유지된다', () => {
    const save = newSaveData('hollow');
    expect(save.help.tutorialSeen).toBe(false);
    markTutorialSeen(save.help);
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    writeSave(storage, save);
    expect(loadSave(storage)!.help.tutorialSeen).toBe(true);
    expect(mem.has(SAVE_KEY)).toBe(true);
  });

  it('이전 형식(10) 세이브는 "이미 봄"이 아니라 아직 안 봄으로 올라간다', () => {
    const old = JSON.parse(JSON.stringify(newSaveData('hollow')));
    delete old.help;
    old.meta.format = 10;
    const m = migrateSave(old)!;
    expect(m.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(SAVE_FORMAT_VERSION).toBeGreaterThanOrEqual(11);
    expect(m.help).toEqual({ tutorialSeen: false, guides: {} });
  });

  it('깨진 플래그는 안 본 것으로 되돌린다', () => {
    expect(sanitizeHelpState(undefined)).toEqual({ tutorialSeen: false, guides: {} });
    expect(sanitizeHelpState({ tutorialSeen: 'yes' })).toEqual({ tutorialSeen: false, guides: {} });
    expect(sanitizeHelpState({ tutorialSeen: true })).toEqual({ tutorialSeen: true, guides: {} });
    // C.120 안내 상태: 모르는 id·값은 버린다
    expect(sanitizeHelpState({ tutorialSeen: true, guides: { 'first-run': 'done', x: 'done', 'tile-draw': 1 } })).toEqual({ tutorialSeen: true, guides: { 'first-run': 'done' } });
  });
});

describe('도움말·튜토리얼 텍스트 데이터', () => {
  it('샘플 블록 장면과 직접 해 보기 장면이 있다 (Q-3)', () => {
    const sample = TUTORIAL_SCENES.find((x) => x.sample?.length);
    expect(sample?.sample?.every((r) => ['attack', 'guard', 'heal'].includes(r))).toBe(true);
    const tries = TUTORIAL_SCENES.filter((x) => x.practice);
    expect(tries).toHaveLength(1);
    expect(tries[0]!.targets).toContain('battle.tray');
    expect(tries[0]!.done?.length).toBeGreaterThan(5);
    // 직접 해 보기는 마지막 안내 바로 앞
    expect(TUTORIAL_SCENES[TUTORIAL_SCENES.length - 2]!.practice).toBe(true);
  });

  it('장면은 7~9개, 모두 id·제목·본문이 있고 id 가 겹치지 않는다', () => {
    expect(TUTORIAL_SCENES.length).toBeGreaterThanOrEqual(6);
    expect(TUTORIAL_SCENES.length).toBeLessThanOrEqual(9);
    for (const sc of TUTORIAL_SCENES) {
      expect(sc.id.length).toBeGreaterThan(0);
      expect(sc.title.length).toBeGreaterThan(0);
      expect(sc.body.length).toBeGreaterThan(10);
    }
    expect(new Set(TUTORIAL_SCENES.map((x) => x.id)).size).toBe(TUTORIAL_SCENES.length);
  });

  it('대상 요소 id 는 전투 화면이 다는 data-help 목록 안에 있다 (대상 없는 장면은 처음·마지막 안내뿐)', () => {
    const known = new Set<string>(BATTLE_HELP_TARGETS);
    for (const sc of TUTORIAL_SCENES) for (const t of sc.targets) expect(known.has(t)).toBe(true);
    expect(TUTORIAL_SCENES.filter((x) => x.targets.length === 0).length).toBeLessThanOrEqual(2);
    // 실제 전투 화면 소스가 그 id 를 모두 단다
    const src = readFileSync('src/ui/battleView.ts', 'utf-8');
    for (const t of BATTLE_HELP_TARGETS) expect(src).toContain(`'${t}'`);
  });

  it('용어 사전은 요구된 용어(13개 + 계열·콤보 블록·등급전 − SP·필살 블록 2개, C.118)를 모두 갖고 id 중복이 없다', () => {
    const ids = GLOSSARY.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(14);
    expect(ids).not.toContain('sp');
    expect(ids).not.toContain('special-block');
    expect(ids).toEqual(expect.arrayContaining(['family', 'combo', 'rank']));
    for (const t of GLOSSARY) {
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.body.length).toBeGreaterThan(10);
    }
    const sids = SCREEN_HELPS.map((x) => x.id).sort();
    expect(sids).toEqual(['battle', 'evolution', 'expedition', 'nest']);
  });

  it('모든 자리표시자가 모든 종족 설정에서 값으로 풀린다', () => {
    const templates = [
      ...TUTORIAL_SCENES.flatMap((x) => [x.title, x.body, ...(x.done ? [x.done] : [])]),
      ...GLOSSARY.flatMap((x) => [x.title, x.body]),
      ...SCREEN_HELPS.flatMap((x) => [x.title, x.body]),
    ];
    for (const f of FACTIONS) {
      const vars = helpVars(f);
      for (const tpl of templates) {
        for (const name of placeholdersOf(tpl)) expect(vars[name], `${f.id}: {${name}}`).toBeTruthy();
        const out = renderHelpText(tpl, vars);
        expect(out).not.toMatch(/[{}]/);
      }
    }
    expect(() => renderHelpText('{unknownName}', helpVars(FACTIONS[0]!))).toThrow();
  });

  it('종족별 표시 이름은 치환 결과에 나오고, 원문 템플릿에는 종족 id·종족 이름·표시 이름이 하드코딩되지 않는다', () => {
    const raw = JSON.stringify([TUTORIAL_SCENES, GLOSSARY, SCREEN_HELPS]);
    const names = new Set<string>();
    for (const f of FACTIONS) {
      names.add(f.id);
      // 종족마다 다른 표시 이름만 본다 (양 종족이 같은 낱말 — 범례 공격·막기·회복, 기술 블록 — 은 종족 이름이 아니다, GDD 20장 v5.7)
      const differs = (k: string, v: string) => FACTIONS.some((o) => helpVars(o)[k] !== v);
      for (const [k, v] of Object.entries(helpVars(f))) if (!k.startsWith('traitKindNames.') && v.length >= 2 && !/^[a-z]+$/i.test(v) && differs(k, v)) names.add(v);
    }
    // 원작·세계관 고유 이름
    ['웨코문도', '아쥬커스', '길리안', '바스트로데', '아란칼', '세군도 에타파', '레수렉시온', '에스파다', '참백도', '영압'].forEach((n) => names.add(n));
    for (const n of names) expect(raw.includes(n), `원문에 "${n}" 하드코딩`).toBe(false);
    // 종족마다 다른 표시 이름이 실제로 본문에 들어간다
    const rendered = FACTIONS.map((f) => renderHelpText(TUTORIAL_SCENES.map((x) => x.body).join(' '), helpVars(f)));
    for (const [i, f] of FACTIONS.entries()) {
      // 블록 이름은 전투 화면과 같은 종족 무관 표기 (GDD 20장 v5.4): 옛 '응축 일격'·'포효' 등은 나오지 않는다
      expect(rendered[i]).toContain(helpVars(f).storedSkillName);
      expect(rendered[i]).toContain(helpVars(f).voidBlockName);
      for (const old of [f.storedSkillName]) expect(rendered[i]).not.toContain(old);
    }
    if (FACTIONS.length > 1) expect(new Set(rendered).size).toBe(FACTIONS.length);
  });
});

describe('튜토리얼 일시정지는 전투 결과에 영향이 없다', () => {
  const enemy = ENEMIES.find((e) => e.class === 'normal' && !e.testOnly)!;
  /** 틱 번호 → 입력 (같은 입력 기록) */
  const script = new Map<number, CombatInput>([[30, { type: 'use', cell: 0 }], [60, { type: 'use', cell: 0 }], [90, { type: 'stored' }], [120, { type: 'use', cell: 1 }]]);

  function play(seed: number, haltAt: (frame: number) => boolean): string {
    const s = createCombat(seed, { enemy });
    let acc = 0;
    let tick = 0;
    for (let frame = 0; frame < 20000 && s.status === 'playing'; frame++) {
      const f = frameTicks(acc, 16, 1, 100, haltAt(frame));
      acc = f.acc;
      for (let i = 0; i < f.ticks && s.status === 'playing'; i++) {
        const input = script.get(tick++);
        step(s, input ? [input] : []);
      }
    }
    return JSON.stringify({ status: s.status, hp: s.enemy.hp, php: s.player.hp, stored: s.storedGauge, tray: s.tray.map((b) => b.kind), tick: s.tick });
  }

  it('중간에 몇 번이든 멈췄다 풀어도 같은 시드면 결과가 같다', () => {
    for (const seed of [1, 7, 12345]) {
      const base = play(seed, () => false);
      const paused = play(seed, (frame) => (frame >= 40 && frame < 200) || (frame >= 500 && frame < 520) || frame % 97 < 5);
      expect(paused).toBe(base);
    }
  });

  it('멈춘 프레임은 시간을 쌓지 않는다', () => {
    expect(frameTicks(30, 5000, 2, 100, true)).toEqual({ acc: 30, ticks: 0 });
    expect(frameTicks(0, 250, 2, 100, false)).toEqual({ acc: 0, ticks: 5 });
  });
});

describe('설명 카드 배치', () => {
  const viewports = [{ width: 390, height: 844 }, { width: 360, height: 740 }];
  const cardH = 220;

  it('대상 위·아래 중 공간이 있는 쪽에 놓고 항상 화면 안에 들어온다', () => {
    for (const vp of viewports) {
      for (let top = 0; top < vp.height - 40; top += 40) {
        const target = { top, left: 10, width: vp.width - 20, height: 60 };
        const p = placeCard(target, cardH, vp);
        expect(p.left).toBeGreaterThanOrEqual(12);
        expect(p.left + p.width).toBeLessThanOrEqual(vp.width - 12);
        expect(p.top).toBeGreaterThanOrEqual(12);
        expect(p.top + cardH).toBeLessThanOrEqual(vp.height - 12);
        if (p.clear) {
          const overlap = p.top < target.top + target.height && p.top + cardH > target.top;
          expect(overlap).toBe(false);
        }
      }
    }
  });

  it('대상이 없으면 가운데, 대상이 위쪽이면 아래에, 아래쪽이면 위에 놓는다', () => {
    const vp = viewports[0]!;
    expect(placeCard(null, cardH, vp).side).toBe('center');
    expect(placeCard({ top: 20, left: 0, width: 100, height: 60 }, cardH, vp).side).toBe('below');
    expect(placeCard({ top: 700, left: 0, width: 100, height: 60 }, cardH, vp).side).toBe('above');
    // 보호 영역(블록 바)을 가리는 자리는 피한다
    const tray = { top: 300, left: 4, width: 382, height: 64 };
    const p = placeCard({ top: 240, left: 0, width: 100, height: 40 }, cardH, vp, [tray]);
    expect(p.clear).toBe(true);
    expect(p.top + cardH <= tray.top || p.top >= tray.top + tray.height).toBe(true);
    expect(unionRect([{ top: 10, left: 5, width: 10, height: 10 }, { top: 40, left: 0, width: 30, height: 5 }])).toEqual({ top: 10, left: 0, width: 30, height: 35 });
    expect(unionRect([])).toBeNull();
  });
});
