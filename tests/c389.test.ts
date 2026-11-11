// C.389 (GDD 237장): 복귀 = 대기 보상 창 하나 — 노란 복귀 알림 띠 삭제, 비운 동안 줄어든 것은 창 안에
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getFaction } from '../src/data/factions';
import { absenceLossLines } from '../src/ui/bha/roomLogic';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('237장 1: 비운 동안 줄어든 것 줄', () => {
  const H = getFaction('hollow');
  it('줄어든 것만 한 줄(종족 이름), 빈사·사망이면 한 줄 더, 없으면 빈 목록', () => {
    expect(absenceLossLines({ flow: { hunger: 11.4, condition: -3 } }, H)).toEqual([`${H.fullnessName} −11 · 컨디션 −3`]);
    expect(absenceLossLines({ flow: { hunger: 0, condition: 0 }, collapsed: true }, H)).toEqual(['빈사 — 오래 비워 쓰러졌다']);
    expect(absenceLossLines({ flow: { hunger: 40, condition: 0 }, died: true }, H)[1]).toContain('사망');
    expect(absenceLossLines({ flow: { hunger: 0.2, condition: 0 } }, H)).toEqual([]);
  });
});

describe('237장 2·3·4: 창', () => {
  const app = read('src/ui/app.ts');
  it('노란 복귀 알림 띠 없음 (absenceText 토스트 삭제)', () => {
    expect(app).not.toContain("eyebrow: head, title: line");
    expect(app).not.toContain('absenceText(');
  });
  it('보상 창이 뜨면 그 안에, 안 뜨면 줄어든 것만 창(줄어든 것도 없으면 아무것도 안 띄움)', () => {
    expect(app).toContain('showIdleReturn(idle, s, faction, claim, loss)');
    expect(app).toContain('} else if (away && loss.length > 0 && lossOnlyReturnShown(away.hours)) {');
    expect(app).toContain('afterTutorials(() => showAbsenceReturn(away.hours, loss)');
  });
  it('아이콘으로 나중에 받는 창(showIdlePanel)에는 줄어든 것이 없다 · 색은 기존 토큰', () => {
    const v = read('src/ui/idleView.ts');
    const panel = v.slice(v.indexOf('export function showIdlePanel'));
    expect(panel).not.toContain('absenceLossBlock');
    expect(read('src/ui/bha/room.css')).toContain('.bha-idleloss__list li { color: var(--bha-danger); }');
  });
});
