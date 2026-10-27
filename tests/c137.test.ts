// C.137 (GDD 85·87장): 스토커 걷기 프레임 · 메노스 그랑데 · 홈 '모험' · 수련장 통합 · 속성 피해 한 줄씩 · 능력치 설명 · 교감
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { getFaction } from '../src/data/factions';
import { roomOf, ROOM_PROPS } from '../src/engine/faction';
import { charArt, artUrls } from '../src/data/art/manifest';
import { GLOSSARY, helpVars, renderHelpText } from '../src/data/help';
import { BALANCE } from '../src/config/balance';

const read = (p: string) => readFileSync(p, 'utf8');

describe('C.137', () => {
  it('87장(89장으로 이관): 스토커 걷기 프레임 6장이 기본 그림 char-hollow 폴더에 있고 move 로 잡힌다', () => {
    for (let i = 1; i <= 6; i++) expect(existsSync(`public/art/char-hollow/move-${i}.png`)).toBe(true);
    const files = [...Array.from({ length: 6 }, (_, i) => `char-hollow/move-${i + 1}.png`), 'char-hollow.png'];
    const a = charArt('hollow', 0, 'char.hollow', '/', undefined, files);
    expect(a.anims?.move?.frames.length).toBe(6);
    expect(a.src).toContain('char-hollow.png');
  });
  it('85장 1: 메노스 그랑데(2단계)는 땅에 붙어 걷고 2배 크기', () => {
    const a = charArt('hollow', 1, 'char.hollow', '/', undefined, ['char-hollow-2.png']);
    expect(a.locomotion).toBe('walk');
    expect(a.scale).toBeGreaterThanOrEqual(2);
  });
  it('85장 2: 문 이름 "모험", 방 물건 크기 ×1.25', () => {
    for (const id of ['hollow', 'shinigami']) expect(roomOf(getFaction(id)).props.door).toBe('모험');
    expect(read('src/ui/bha/room.css')).toContain('* 1.25');
  });
  it('85장 3: 훈련 인형은 방 물건이 아니고 수련장 안에 훈련 인형·번호 쟁탈전 입구가 있다', () => {
    expect((ROOM_PROPS as readonly string[]).includes('dummy')).toBe(false);
    const tv = read('src/ui/trainingView.ts');
    expect(tv).toContain("id: 'practice'"); // C.163: 입구는 머리 제목 토글(trainingTitle)
    expect(tv).toContain('rankBattleName');
    expect(read('src/ui/roomView.ts')).not.toContain('hd.onRank');
    expect(existsSync('public/art/prop-dummy.webp')).toBe(false);
  });
  it('85장 8: 속성 피해 5종은 각각 한 줄(능력치 행과 같은 형식)', () => {
    const el = read('src/ui/bha/element.ts');
    expect(el).toContain('export function elementDamageRows');
    expect(el).toContain("'bha-statrow'");
  });
  it('85장 9: 도움말에 능력치 설명이 있고 수치는 BALANCE 에서 읽는다', () => {
    const term = GLOSSARY.find((t) => t.id === 'stats');
    expect(term).toBeTruthy();
    const f = getFaction('hollow');
    const text = renderHelpText(term!.body, helpVars(f));
    expect(text).toContain(String(BALANCE.provisional.combat.playerMaxHp));
    expect(text).toContain(String(BALANCE.provisional.stats.statMax));
  });
  it('85장 10: 쓰다듬기 → 교감 (호로 종족 설정)', () => {
    expect(getFaction('hollow').nestActions.pet).toBe('교감');
    expect(JSON.stringify(getFaction('hollow').room!.talk)).not.toContain('쓰다듬');
  });
});
