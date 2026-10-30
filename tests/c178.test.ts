// C.178 설정 개편 (GDD 103장): 탭 4개 · 저장해야 반영 · 공통 + 슬롯 설정(항목별 우선) · 소리 막대 · 시작 화면 [설정]
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { activeSlotSettings, parseSlotSettings, setActiveSlotSettings, SLOT_SETTING_KEYS } from '../src/ui/settingsScope';
import { FX_SETTINGS_KEY, loadCommonFxSettings, loadFxSettings, parseFxSettings, withSlotFx } from '../src/ui/fxSettings';
import { bgmBarOf, defaultBgmSettings, withBgmBar, withSlotBgm } from '../src/ui/bgm';
import { KEY_HINTS_KEY, loadCommonKeyHints, loadKeyHints } from '../src/ui/keyHints';
import { migrateSave, newSaveData, sanitizeSlotSettings, MIN_LOADABLE_SAVE_FORMAT, SAVE_FORMAT_VERSION } from '../src/game';

const read = (p: string) => readFileSync(p, 'utf8');
function store(init: Record<string, string> = {}) {
  const m = new Map<string, string>(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

afterEach(() => setActiveSlotSettings(null));

describe('슬롯 설정 (103장 5): 항목별로 공통보다 우선', () => {
  it('parse: 아는 항목만, 막대는 0~100 정수, 비면 null', () => {
    expect(parseSlotSettings({ shake: false, sfxVolume: 140.4, bgmVolume: -3, foo: 1, keyHints: 'x' })).toEqual({ shake: false, sfxVolume: 100, bgmVolume: 0 });
    expect(parseSlotSettings({})).toBeNull();
    expect(parseSlotSettings(null)).toBeNull();
    expect(parseSlotSettings([1])).toBeNull();
    expect(SLOT_SETTING_KEYS).toEqual(['damageNumbers', 'vibration', 'shake', 'keyHints', 'sfxVolume', 'bgmVolume']);
  });
  it('전투 효과·효과음: 슬롯에 있는 항목만 덮고 나머지는 공통', () => {
    const st = store({ [FX_SETTINGS_KEY]: JSON.stringify({ damageNumbers: true, vibration: true, shake: true, sfxVolume: 40, sound: true }) });
    setActiveSlotSettings({ shake: false, sfxVolume: 0 });
    const fx = loadFxSettings(st, false);
    expect(fx).toMatchObject({ damageNumbers: true, vibration: true, shake: false, sfxVolume: 0, sound: false });
    expect(loadCommonFxSettings(st, false)).toMatchObject({ shake: true, sfxVolume: 40, sound: true }); // 공통 값은 그대로
    setActiveSlotSettings(null);
    expect(loadFxSettings(st, false).sfxVolume).toBe(40);
    expect(withSlotFx(loadCommonFxSettings(st, false), { sfxVolume: 75 }).sound).toBe(true);
  });
  it('단축키 표시: 슬롯 값 우선', () => {
    const st = store({ [KEY_HINTS_KEY]: '1' });
    setActiveSlotSettings({ keyHints: false });
    expect(loadKeyHints(st)).toBe(false);
    expect(loadCommonKeyHints(st)).toBe(true);
    expect(activeSlotSettings()).toEqual({ keyHints: false });
  });
  it('배경음 막대: 0 = 끔, 슬롯 값이 공통 위에', () => {
    const c = { ...defaultBgmSettings(), volume: 0.6 };
    expect(bgmBarOf(c)).toBe(60);
    expect(bgmBarOf({ on: false, volume: 0.6 })).toBe(0);
    expect(withBgmBar(c, 0)).toMatchObject({ on: false, volume: 0.6 });
    expect(withBgmBar({ ...c, on: false }, 35)).toMatchObject({ on: true, volume: 0.35 });
    expect(withSlotBgm(c, { bgmVolume: 20 })).toMatchObject({ on: true, volume: 0.2 });
    expect(withSlotBgm(c, {})).toBe(c);
  });
});

describe('효과음 = 막대 (103장 3)', () => {
  it('옛 켬/끔 값은 막대로: sound true → 50, false → 0, sfxVolume 이 있으면 그것', () => {
    expect(parseFxSettings('{"sound":true}')).toMatchObject({ sound: true, sfxVolume: 50 });
    expect(parseFxSettings('{"sound":false}')).toMatchObject({ sound: false, sfxVolume: 0 });
    expect(parseFxSettings('{"sfxVolume":30,"sound":true}')).toMatchObject({ sound: true, sfxVolume: 30 });
    expect(parseFxSettings('{"sfxVolume":0}')).toMatchObject({ sound: false, sfxVolume: 0 });
  });
  it('설정 화면: 25/50% 버튼 폐지, 막대 0~100·◀▶ 5씩·0 = 끔·놓으면 효과음 미리 듣기', () => {
    const s = read('src/ui/settingsView.ts');
    expect(read('src/ui/bgm.ts')).not.toContain('BGM_VOLUMES');
    expect(s).toContain('export const VOLUME_KEY_STEP = 5;');
    expect(s).toContain("input.max = '100';");
    expect(s).toContain("out.textContent = v === 0 ? '끔' : String(v);");
    expect(s).toContain("emitFeedback('guard', { vibration: false, sound: true, sfxVolume: v });");
    expect(read('src/ui/fx.ts')).toContain('MASTER_VOLUME * tn.vol * (volume / SFX_LEGACY_VOLUME)');
  });
});

describe('설정 화면 (103장 1·2·4)', () => {
  const s = read('src/ui/settingsView.ts');
  it('탭 4개 화면/소리/전투/기타, ◀▶ 로 오간다, 소리와 전투 효과 분리', () => {
    expect(s).toContain("{ id: 'screen', label: '화면' },\n  { id: 'sound', label: '소리' },\n  { id: 'battle', label: '전투' },\n  { id: 'etc', label: '기타' },");
    expect(s).toContain("if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;");
    expect(s).toContain("sound: [soundPanel, ...musicNodes],");
    expect(s).toContain("battle: [fxPanel, ctlPanel],");
    expect(s).not.toContain("{ key: 'sound', label: '효과음'");
  });
  it('저장해야 반영 · 저장 안 하고 뒤로면 [저장][저장 안 함][취소] (기본 = 저장)', () => {
    expect(s).toContain("title: '바꾼 설정 저장'");
    expect(s).toContain("yes: '저장', no: '취소',");
    expect(s).toContain("alt: { label: '저장 안 함'");
    // 화면으로 열렸을 때는 설정 화면 안의 취소 처리기가 먼저 가로챈다(◀ 버튼·Esc·폰 뒤로가기), 레이어(전투 일시정지)는 레이어 취소가
    expect(s).toContain('registerCancelHook((top) => {');
    expect(s).toContain('unregister = registerLayer(layer, () => ctl.requestClose(close));');
    const c = read('src/ui/confirmDialog.ts');
    expect(c).toContain('alt?: { label: string; onClick: () => void };');
  });
  it('[공통]/[이 슬롯] 토글 · 줄마다 슬롯 표시 · 슬롯 설정 지우기 = 확인(기본 아니오)', () => {
    expect(s).toContain("id === 'common' ? '공통' : '이 슬롯'");
    expect(s).toContain("text = !slotable(k) ? '공통만' : inSlot ? '슬롯' : '';");
    expect(s).toContain("yes: '지우기', no: '아니오', danger: true,");
  });
  it('시작 화면 [설정] = 공통만, 방에서 연 설정은 슬롯 토글', () => {
    expect(read('src/ui/startView.ts')).toContain("button({ label: '설정', icon: 'i-settings', onClick: h.onSettings })");
    const a = read('src/ui/app.ts');
    expect(a).toContain('commonOnly: !inGame,');
    expect(a).toContain("onSettings: settingsOpener(false),\n      onImport: () => {");
    expect(a).toContain('bindSlotSettings();');
  });
});

describe('세이브 (61장: 마이그레이션 없음)', () => {
  it('형식·문턱 47, 새 세이브 settings = null, 저장·불러오기로 남고 깨진 값은 버린다', () => {
    expect([SAVE_FORMAT_VERSION, MIN_LOADABLE_SAVE_FORMAT]).toEqual([58, 54]); // C.220 · C.223 · C.213 · C.198: 문턱 54 고정(123장 6) // C.195 // C.188 // C.184 // C.181
    const s = newSaveData('hollow');
    expect(s.settings).toBeNull();
    s.settings = { shake: false, sfxVolume: 30 };
    const m = migrateSave(JSON.parse(JSON.stringify(s)))!;
    expect(m.settings).toEqual({ shake: false, sfxVolume: 30 });
    expect(sanitizeSlotSettings({ a: 'x', b: Number.NaN })).toBeNull();
    expect(sanitizeSlotSettings('x')).toBeNull();
  });
});
