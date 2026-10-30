// C.207 (GDD 131장): 처음 켰을 때 홈 안내 → 첫 모험 강제
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { HOME_INTRO, renderHelpText, helpVars } from '../src/data/help';
import { FACTIONS } from '../src/data/factions';
import { GUIDE_IDS, guidePending, sanitizeHelpState } from '../src/engine/tutorial';
import { newSaveData } from '../src/game';

const read = (p: string) => readFileSync(p, 'utf8');

describe('131장 1·3 홈 안내 상태', () => {
  it('새 세이브 = 첫 원정·홈 안내 pending, 옛 세이브(키 없음)는 안 뜬다', () => {
    expect(GUIDE_IDS).toContain('home-intro');
    for (const f of FACTIONS) {
      const s = newSaveData(f.id);
      expect(guidePending(s.help, 'first-run')).toBe(true);
      expect(guidePending(s.help, 'home-intro')).toBe(true);
    }
    const old = sanitizeHelpState({ tutorialSeen: true, guides: { 'first-run': 'done' } });
    expect(guidePending(old, 'home-intro')).toBe(false);
    expect(sanitizeHelpState({ guides: { 'home-intro': 'done' } }).guides['home-intro']).toBe('done');
  });
});

describe('131장 1 카드 문구 (종족 설정 이름, 하드코딩 없음)', () => {
  it('방 물건·독 카드 = 대상 선택자가 있고, 두 종족 자리표시자가 모두 채워진다', () => {
    const extra = { outsideName: '밖으로', adventureName: '모험', towerName: '도전의 탑', altarName: '수련장', bookName: '책장', chestName: '가방', marketName: '시장', worldName: '지도', careNames: '먹이·재우기·교감', goPath: '[밖으로] → [모험]' };
    for (const f of FACTIONS) {
      const v = { ...helpVars(f), ...extra };
      for (const sc of [HOME_INTRO.intro, ...HOME_INTRO.items, HOME_INTRO.last]) {
        expect(() => renderHelpText(sc.title, v)).not.toThrow();
        expect(() => renderHelpText(sc.body, v)).not.toThrow();
      }
    }
    for (const it of HOME_INTRO.items) expect(it.targets.length).toBeGreaterThan(0);
    expect(HOME_INTRO.items.map((x) => x.id)).toEqual(['outside', 'altar', 'book', 'chest', 'status', 'hp', 'care', 'idle', 'more']); // C.215: 모험 문·장터 카드 폐기 (137장 3)
  });
});

describe('131장 2·4 첫 모험 강제 (app·room·worldmap)', () => {
  const app = read('src/ui/app.ts');
  it('마지막 카드 = 실제 버튼(밖으로 → 모험)을 눌러 떠나야 끝, 다음 버튼 없이 저절로 닫힘', () => {
    expect(app).toContain(`const go = '.bha-prop--outside, .bha-worldmap [data-place="adventure"]';`);
    expect(app).toContain("act: { selector: go, autoFinish: true, done: () => nav.top !== undefined && nav.top.id !== 'room' && nav.top.id !== 'worldmap' }");
    expect(app).toContain("markGuideDone(s.help, 'home-intro');");
  });
  it('강제 중: 방 다른 버튼 흐린 잠김, 월드맵 홈·시장 잠김, 뒤로 = 짧은 안내', () => {
    expect(app).toContain('forceOutside: forceAdventure,');
    expect(app).toContain("locked: forceAdventure ? ['home', 'market', 'tower', 'spa'] : undefined,"); // C.217: 탑도 잠김 (139장 1)
    expect(app).toContain("const FORCE_HINT = { eyebrow: '튜토리얼', title: '먼저 모험을 떠나자', meta: '' };");
    expect(read('src/ui/roomView.ts')).toContain("if (hd.forceOutside) main.classList.add('is-force-out');");
    expect(read('src/ui/bha/worldmap.css')).toContain('.bha-room.is-force-out .bha-homedock');
  });
  it('탄생 연출 뒤에 뜨고, 도움말에서 다시 보기(방에서)', () => {
    expect(app).toContain("window.setTimeout(() => { if (nav.top?.id === 'room') runHomeIntro(faction); }, 300);");
    expect(app).toContain("label: '홈 안내'");
  });
});

describe('129-1 2 같은 종류: 월드맵 왼쪽 위 [둥지로]/[대원실로] (마스터W 04:33)', () => {
  const wm = readFileSync('src/ui/worldMapView.ts', 'utf8');
  it('공용 spaceBackButton, 이름 = nestName, ▲▼ 맨 앞, 첫 모험 강제 중 잠김, 걷는 중 = 취소 (137장 3)', () => {
    expect(wm).toContain("spaceBackButton(() => (walking ? cancelWalk() : homeLocked ? hd.onLocked?.('home') : hd.onHome()), fixParticles(`${wm.places.home}(으)로`))");
    expect(wm).toContain('const items: SelectItem[] = [{ el: backBtn }, ...WORLD_PLACES.map(');
    expect(wm).toContain('btns.get(hd.focus ?? at)?.focus('); // C.208: 첫 모험 강제 중 focus = 모험
  });
});

