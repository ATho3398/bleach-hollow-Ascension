// C.326 이름·성별 정하기 (GDD 199장 6~8): 이름 규칙 · 세이브 형식 63 마이그레이션 · 이름·성별 기록 · 런 로그 · 화면 흐름(소스) · 이름표
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkName, nameMax, nameWidth, NAME_RULE, parseName } from '../src/engine/playerName';
import { migrateSave, MIN_LOADABLE_SAVE_FORMAT, needsIdentity, newSaveData, SAVE_FORMAT_VERSION, SAVE_MIGRATIONS, setIdentity } from '../src/game';
import { getFaction } from '../src/data/factions';
import { FACTIONS } from '../src/data/factions';
import { useLegacyMigrations } from './helpers/legacyGate';

// C.446: 게임은 형식 87 미만을 열지 않는다(MIN_LOADABLE_SAVE_FORMAT 87) — 이 파일의 옛 형식 마이그레이션 시험 동안만 문턱을 내린다
useLegacyMigrations();

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe('이름 규칙 (199장 6)', () => {
  it('한글만 7자, 영어만 12자, 섞으면 한글 2칸·영어 1칸으로 14칸', () => {
    expect(NAME_RULE).toEqual({ hangulMax: 7, latinMax: 12, widthMax: 14 });
    expect(checkName('가나다라마바사').ok).toBe(true);
    expect(checkName('가나다라마바사아')).toMatchObject({ ok: false, problem: 'long', message: '한글은 7자까지다' });
    expect(checkName('Abcdefghijkl').ok).toBe(true);
    expect(checkName('Abcdefghijklm')).toMatchObject({ ok: false, problem: 'long', message: '영어는 12자까지다' });
    expect(checkName('가나다라마바Ab').ok).toBe(true); // 12 + 2 = 14칸
    expect(checkName('가나다라마바Abc')).toMatchObject({ ok: false, problem: 'long' }); // 15칸
    expect(checkName('권Kwon').ok).toBe(true);
    expect([nameWidth('권Kwon'), nameMax('권Kwon'), nameMax('Kwon')]).toEqual([6, 14, 12]);
  });
  it('빈 이름·공백·숫자·기호·다른 글자·자음만 불가, 안내는 ~다', () => {
    const cases: [string, string][] = [['', 'empty'], ['권 영', 'space'], ['권1', 'digit'], ['권!', 'symbol'], ['권_', 'symbol'], ['権', 'other'], ['ㅋㅋ', 'jamo'], ['가ㄴ', 'jamo'], ['😀', 'symbol']];
    for (const [s, p] of cases) {
      const c = checkName(s);
      expect(c.ok, s).toBe(false);
      if (!c.ok) {
        expect(c.problem, s).toBe(p);
        expect(c.message, s).toMatch(/다$|다 \(/);
      }
    }
  });
  it('조합형(NFD) 한글은 NFC 로 맞춰 받는다, 세이브 값 검사', () => {
    const nfd = '권'.normalize('NFD');
    const c = checkName(nfd);
    expect(c.ok && c.name).toBe('권');
    expect(parseName('권영')).toBe('권영');
    expect(parseName('권 영')).toBeNull();
    expect(parseName(3)).toBeNull();
    expect(parseName(null)).toBeNull();
  });
});

describe('세이브 (199장 8)', () => {
  it('형식 63 · 문턱 54 고정 · 62 → 63: 이름 null(이어할 때 창) · 이름 기록 빈 목록', () => {
    expect(SAVE_FORMAT_VERSION).toBeGreaterThanOrEqual(63);
    expect(MIN_LOADABLE_SAVE_FORMAT).toBe(87);
    expect(typeof SAVE_MIGRATIONS[62]).toBe('function');
    const old = clone(newSaveData('hollow', 1000)) as unknown as Record<string, any>;
    old.meta.format = 62;
    delete old.name;
    delete old.slotLog.identities;
    old.gender = 'female';
    const m = migrateSave(old)!;
    expect(m.meta.format).toBe(SAVE_FORMAT_VERSION);
    expect(m.name).toBeNull();
    expect(m.gender).toBe('female'); // 옛 성별은 그대로 (창의 처음 고른 칸)
    expect(m.slotLog.identities).toEqual([]);
    expect(needsIdentity(m)).toBe(true);
  });
  it('형식 54 세이브도 끝까지 올라오고 이름은 null', () => {
    const old = clone(newSaveData('shinigami', 1000)) as unknown as Record<string, any>;
    old.meta.format = 54;
    delete old.name;
    const m = migrateSave(old);
    expect(m).not.toBeNull();
    expect(m!.name).toBeNull();
  });
  it('새 세이브 이름 null, setIdentity = 규칙 검사 + 슬롯 기록, 저장·불러오기로 남고 깨진 이름은 null', () => {
    const s = newSaveData('hollow', 5);
    expect(s.name).toBeNull();
    expect(setIdentity(s, '권 영', 'male', 'new', 10)).toBe(false);
    expect(s.name).toBeNull();
    expect(setIdentity(s, '권영', 'female', 'new', 10)).toBe(true);
    expect([s.name, s.gender]).toEqual(['권영', 'female']);
    expect(s.slotLog.identities).toEqual([{ at: 10, name: '권영', gender: 'female', source: 'new', factionId: 'hollow', tierIndex: 0 }]);
    // 같은 값으로 설정에서 저장하면 기록을 늘리지 않는다
    expect(setIdentity(s, '권영', 'female', 'settings', 20)).toBe(true);
    expect(s.slotLog.identities).toHaveLength(1);
    expect(setIdentity(s, 'Kwon', 'male', 'settings', 30)).toBe(true);
    expect(s.slotLog.identities.map((r) => r.source)).toEqual(['new', 'settings']);
    expect(needsIdentity(s)).toBe(false);
    const back = migrateSave(clone(s))!;
    expect([back.name, back.gender, back.slotLog.identities.length]).toEqual(['Kwon', 'male', 2]);
    expect(migrateSave({ ...clone(s), name: '12' })!.name).toBeNull();
  });
  it('런 로그 원정 기록에 이름 (9장)', () => {
    expect(read('src/engine/runLog.ts')).toContain('name?: string;');
    expect(read('src/game.ts')).toContain("log.runs.push({ ...buildRunRecord(exp), gender: save.gender, ...(save.name ? { name: save.name } : {}) });");
  });
});

describe('화면 (199장 6·7, 173장 2)', () => {
  const app = read('src/ui/app.ts');
  const view = read('src/ui/identityView.ts');
  it('새 게임 = 종족 → 이름 → 성별 → 시작, 세이브는 성별 뒤에 만든다', () => {
    expect(app).toContain("onPick: (f) => open('identity', identityFlow(f, 'new'");
    expect(app).toContain("setIdentity(save, name, gender, 'new');");
  });
  it('옛 세이브(이름 없음)는 방 전에 한 번, 뒤로 없음(locked)', () => {
    expect(app).toContain("nav.reset({ id: 'identity', locked: true, render: identityFlow(getFaction(loaded.factionId), 'old'");
  });
  it('설정 > 기타 [이름·성별 바꾸기] — 게임 안 설정만, 같은 두 화면', () => {
    expect(app).toContain('onIdentity: inGame && save ? editIdentity : undefined');
    expect(app).toContain("identityFlow(getFaction(s.factionId), 'edit'");
    const sv = read('src/ui/settingsView.ts');
    expect(sv).toContain("label: '이름·성별 바꾸기'");
    expect(sv).not.toContain("panel('이 캐릭터 · 성별'");
  });
  it('한 화면에 \'나중에 바꿀 수 있다\' 한 줄, 주 버튼은 첫 줄 같은 자리(키보드에 안 가림), 종족 분기 없음', () => {
    // GDD 241-A 3: 이름·성별 한 화면 — 이름 아래 빈 자리에 성별 버튼, 외형 안내 문구 없음
    expect(view.match(/IDENTITY_LATER_LINE\)/g)?.length).toBe(1);
    expect(view).toContain('row.append(field, done)');
    expect(view).toContain('body.append(row, msg, list,');
    expect(view).not.toContain('genderLookNote');
    expect(read('src/ui/app.ts')).not.toContain('genderLookNote');
    expect(read('src/ui/bha/screens-lcd.css')).toContain('.bha-ident__main { flex: none; width: 128px;');
    for (const p of ['src/ui/identityView.ts', 'src/engine/playerName.ts']) expect(read(p)).not.toMatch(/'(hollow|shinigami)'/);
  });
  it('종족 설정 이름이 화면 머리 줄에 (종족 json 값)', () => {
    for (const f of FACTIONS) expect(getFaction(f.id).name.length).toBeGreaterThan(0);
    expect(view).toContain('sub: f.name');
  });
});

describe('이름표 (199장 7)', () => {
  it('이름이 있으면 늘 이름 + 작게 진화체 이름, 없으면 예전 규칙', () => {
    const sb = read('src/ui/bha/statusBox.ts');
    expect(sb).toContain("tag.append(el('b', 'bha-room__nameown', save.name), el('span', 'bha-room__nameform', form));");
    expect(read('src/ui/bha/room.css')).toContain('.bha-room__nameform { max-width: 112px;');
  });
});
