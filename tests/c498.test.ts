// C.498 (GDD 12-1·8-9 v6.129, 사용자 2026-11-19): ① 방 ··· 더보기 = [캐릭터 변경] 한 칸 → 캐릭터 카드 창(호로·사신·연 초월자, 데이터 순서)
// ② 수련장 훈련 인형을 누르면 [전투 들어가기] 중간 화면 없이 곧장 전투 + 적 설정 창 (나가기 = 수련장 — 화면은 밑에 깔림)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FACTIONS } from '../src/data/factions';
import { TRANSCENDENTS } from '../src/data/transcendents';
import { testGrantTranscendent } from '../src/engine/testMode';
import { newSaveData, newTrack, switchTrack, trackIdOf } from '../src/game';
import { CHARACTER_LOCK_TEXT, CHARACTER_PICK_LABEL, characterCards } from '../src/ui/characterPicker';

const read = (p: string) => readFileSync(p, 'utf8');
const [F0, F1] = [FACTIONS[0]!, FACTIONS[1]!];

function twoChars() {
  const now = 1_000;
  const s = newSaveData(F0.id, now);
  s.otherTracks.push({ ...newTrack(F1.id, now, 1), parkedAt: now });
  return s;
}

describe('C.498 캐릭터 카드 목록 (characterCards)', () => {
  it('한 종족만 열렸으면 = 지금 캐릭터 카드 + 다음 종족 잠긴 카드(여는 조건 한 줄), 초월자 카드 없음', () => {
    const cards = characterCards(newSaveData(F0.id, 1_000));
    expect(cards.map((c) => [c.key, c.current, c.locked])).toEqual([[F0.id, true, false], [F1.id, false, true]]);
    expect(cards[1]!.sub).toBe(CHARACTER_LOCK_TEXT);
    expect(cards[1]!.name).toBe(F1.name);
    expect(cards[0]!.sub).toBe(`1단계 ${F0.tierNames[0]}`); // 단계 이름 = 종족 설정 tierNames
  });

  it('지금 캐릭터가 둘째 종족이어도 순서 = 종족 데이터 순서 → 초월자 데이터 순서, 안 연 초월자는 없다', () => {
    const s = twoChars();
    const picked = [TRANSCENDENTS[2]!, TRANSCENDENTS[0]!];
    for (const d of picked) expect(testGrantTranscendent(s, d.id, 2_000)).toBe('added');
    expect(switchTrack(s, F1.id, 3_000)).toBe(true);
    const cards = characterCards(s);
    expect(cards.map((c) => c.key)).toEqual([F0.id, F1.id, `tr:${TRANSCENDENTS[0]!.id}`, `tr:${TRANSCENDENTS[2]!.id}`]);
    expect(cards.filter((c) => c.current).map((c) => c.key)).toEqual([F1.id]);
    expect(cards.some((c) => c.locked)).toBe(false);
    // 초월자 = 진화 없는 트랙 → 단계 줄 대신 트랙 종류 이름, 이름 = 초월자 이름
    const tr = cards[2]!;
    expect(tr.name).toBe(TRANSCENDENTS[0]!.name);
    expect(tr.sub).not.toMatch(/단계/);
  });

  it('카드 키 = 기존 전환 흐름의 트랙 키 — 그 키로 switchTrack 하면 그 캐릭터가 지금 캐릭터', () => {
    const s = twoChars();
    testGrantTranscendent(s, TRANSCENDENTS[0]!.id, 2_000);
    switchTrack(s, F0.id, 2_500);
    for (const c of characterCards(s).filter((x) => !x.current && !x.locked)) {
      expect(switchTrack(s, c.key, 3_000)).toBe(true);
      expect(trackIdOf(s)).toBe(c.key);
    }
  });

  it('잠긴 카드는 가상 3번째 종족이라도 데이터만 본다 (종족 id 분기 없음)', () => {
    const extra = [...FACTIONS, { id: 'third', name: '셋째' }];
    const cards = characterCards(twoChars(), extra, []);
    // 캐릭터 칸(twoTrack.maxTracks)이 다 찼으면 더 열 수 없으니 잠긴 카드도 없다
    expect(cards.map((c) => c.key)).toEqual([F0.id, F1.id]);
  });
});

describe('C.498 화면 연결', () => {
  const room = read('src/ui/roomView.ts');
  const app = read('src/ui/app.ts');
  const picker = read('src/ui/characterPicker.ts');

  it('더보기 = [캐릭터 변경] 한 칸 (옛 캐릭터마다 줄·플레이어 문구 "트랙" 없음)', () => {
    expect(CHARACTER_PICK_LABEL).toBe('캐릭터 변경');
    expect(room).toContain("{ label: CHARACTER_PICK_LABEL, icon: 'i-swap', onClick: hd.onCharacters }");
    expect(room).not.toMatch(/트랙`, icon: 'i-swap'/);
    expect(room).not.toContain('save.otherTracks : []');
    // 창 안 플레이어 문구(따옴표 안 글)에 '트랙'이 없다
    const strings = [...picker.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/'([^']*)'/g)].map((m) => m[1]!);
    expect(strings.filter((t) => t.includes('트랙'))).toEqual([]);
  });

  it('카드 창 = ✕ 닫기 + [닫기] + 뒤로(registerLayer) + 초점 가두기, 종족 id 분기 없음', () => {
    expect(picker).toContain("icon: 'i-close'");
    expect(picker).toContain('registerLayer(layer, close)');
    expect(picker).toContain('trapModalFocus(layer)');
    expect(picker).toContain('enableDragScrollX(strip)');
    expect(picker).not.toMatch(/=== '(hollow|shinigami)'/);
  });

  it('카드를 누르면 기존 전환 흐름(switchTrack → 저장 → 방 다시)', () => {
    expect(app).toContain('onCharacters: () => characterPickerDialog(s, switchTo)');
    expect(app).toMatch(/const switchTo = \(fid: string\): void => \{\s*if \(!canSwitchFaction\(s\) \|\| !switchTrack\(s, fid\)\) return;\s*persist\(\);\s*nestScreen\(\);/);
  });

  it('훈련 인형(방 수련장 물건)을 누르면 수련장 화면을 밑에 깔고 곧장 적 설정 창 전투', () => {
    expect(app).toContain("askDying(s, () => { open('practice', () => practiceScreen(faction)); practiceArena(faction); })");
    // 수련장 화면의 [전투 들어가기]·머리 제목 목록은 그대로 (나가기·본능 수련 토글로 올 때)
    expect(app).toContain("practiceEntryView(root, faction, save?.runLog.battles.length ?? 0, { onEnter: () => practiceArena(faction), title: trainingHead(faction, 'practice') })");
  });
});
