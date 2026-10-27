// C.160 (GDD 98장 A5): 전투 화면 깨짐 점검 — 위 한 줄 넘침·칩 겹침·알림 겹침·키 배지·로그 창 · 덤: 방 말풍선이 상태 칩을 가림
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8');
const battle = read('src/ui/battleView.ts');
const css = read('src/ui/bha/v2/bha.css');

describe('C.160 위 한 줄은 적 이름·등급 칩·약점·시간·버튼만', () => {
  it('패턴·페이즈·졸개·임시 칩과 알림은 필드 가운데 칩 줄(fieldTags)로', () => {
    for (const n of ['patternChipEl()', 'phaseChip', 'minionChip', 'v2TempChip()', "v2Notice('', opts.notice"]) {
      expect(battle).toContain(`fieldTags.append(${n}`);
      expect(battle).not.toContain(`foeHead.append(${n}`);
      expect(battle).not.toContain(`foeName.append(${n}`);
    }
    expect(battle).toContain('arena.append(units, fieldTags, meStatus, topRow'); // C.183: 내 상태 칩(meStatus)은 필드 아래 가운데 고정 자리
    expect(battle).toContain('mountV2Root(root, faction, arena, controls'); // 알림을 루트에 띄우지 않는다 (위 한 줄과 겹쳤다)
  });
  it('칩·버튼은 줄지 않고 이름만 말줄임(최소 4글자, 전체 이름은 title)', () => {
    expect(css).toContain('.bha-root .bha-v2toprow .bha-chip,.bha-root .bha-v2toprow .bha-btn,.bha-root .bha-v2toprow .bha-v2time{flex:none}');
    expect(css).toContain('.bha-root .bha-v2foename__text{flex:0 1 auto;min-width:4em}');
    expect(battle).toContain('foeTitle.title = enemyName');
  });
  it('가운데 칩 줄은 나와 적 머리 게이지 사이(필드 가운데 기준), 로그 창이 열리면 숨김', () => {
    expect(css).toMatch(/\.bha-v2fieldtags\{position:absolute;left:calc\(50% - 72px\);width:132px;top:48px;z-index:3/);
    expect(css).toContain('.bha-root .bha-field:has(>.bha-battle__logpanel:not([hidden])) .bha-v2fieldtags{visibility:hidden}');
  });
  it('로그 창은 강공격 예고 띠 아래·적 체력 줄 위, 키 배지는 버튼 위 끝', () => {
    expect(css).toContain('.bha-root .bha-field .bha-battle__logpanel{top:70px;max-height:calc(100% - 112px)}');
    expect(css).toContain('.bha-root .bha-v2bar .bha-keycap{top:-7px;right:-4px}');
  });
  it('보스 기믹이 있으면 보스 칩', () => {
    expect(battle).toContain("if (opts.boss || s.boss) foeName.append(v2Chip('보스', 'danger'))");
  });
});

describe('C.160 덤: 방 말풍선', () => {
  it('캐릭터 머리 위 가운데에 서고 대사 동안 상태 칩을 숨긴다 (C.176 GDD 104장 1 — C.170 옆 허리 높이 되돌림, 장면 변수 공유)', () => {
    const room = read('src/ui/roomView.ts');
    expect(room).toContain("scene.style.setProperty('--head-y'");
    expect(room).toContain("scene.style.setProperty('--chip-h'");
    expect(room).toContain("scene.classList.add('is-saying')");
    const rc = read('src/ui/bha/room.css');
    expect(rc).toContain('left: clamp(25%, var(--char-x, 50%), 75%);');
    expect(rc).toContain('.is-saying > .bha-room__status, .is-saying > .bha-room__statusinfo { visibility: hidden; }');
    expect(rc).not.toContain('left: 50%; top: 14%;');
  });
});
