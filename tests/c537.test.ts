/** C.537 첫 튜토리얼 중 돌봄 수치 시계 멈춤 · 구급상자 상세 창 안내 창 없앰 (GDD 13-5 v6.200,
 *  사용자 2026-11-24 "-튜토상태에서 나가있으면 배고픔다는거 수정. 튜토에선 수치 안변하게
 *  -튜토에서 구급상자를 사용해보자 창이 그 뒤에 설명창을 가림. 이거 없애.")
 *  튜토리얼 범위 = tutorialInProgress: 홈 안내(home-intro) → 첫 모험(first-run) → 회복 안내(recover) → '다음 할 일'(first-run-room) 중 하나라도 pending */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/balance';
import { RECOVER_SCENES } from '../src/data/help';
import { homeHpOf, newNest, passHomeHp, previewHomeHp } from '../src/engine/nest';
import { markGuideDone, queueGuide } from '../src/engine/tutorial';
import { absenceOf, careClockOf, finishGuide, newSaveData, tickIdle, tutorialInProgress, type SaveData } from '../src/game';
import { spaEnter } from '../src/home';
import { PATCH_LABEL } from '../src/version';

const H = 3_600_000;
const NX = BALANCE.provisional.nest;
const read = (p: string) => readFileSync(p, 'utf8');

/** 회복 안내 중(첫 모험을 다녀와 빈사는 풀린 뒤 — 온천 차례)인 세이브 */
function inRecover(t0: number): SaveData {
  const s = newSaveData('hollow', t0);
  markGuideDone(s.help, 'home-intro');
  markGuideDone(s.help, 'first-run');
  queueGuide(s.help, 'recover');
  Object.assign(s.nest, { hunger: 40, condition: 60, bond: 10, hpFraction: 0.3, lastMealAt: t0, lastTickMs: t0 });
  s.lastSeenAt = t0;
  return s;
}
const vitals = (s: SaveData) => ({ hunger: s.nest.hunger, condition: s.nest.condition, bond: s.nest.bond, hp: homeHpOf(s.nest), weak: s.nest.weakened, tired: s.nest.tired, collapsed: s.nest.collapsed, dead: s.nest.dead });

describe('C.537 튜토리얼 중에는 시간·미접속으로 돌봄 수치가 안 변한다 (GDD 13-5 v6.200)', () => {
  it('튜토리얼 범위 = 홈 안내·첫 모험·회복 안내·다음 할 일 — 새 세이브부터 first-run-room 을 마칠 때까지', () => {
    const s = newSaveData('shinigami', 0);
    expect(tutorialInProgress(s)).toBe(true);
    expect(careClockOf(s)).toEqual({ decay: false, idleHeal: false });
    for (const id of ['home-intro', 'first-run'] as const) markGuideDone(s.help, id);
    expect(tutorialInProgress(s)).toBe(false);
    queueGuide(s.help, 'recover');
    expect(tutorialInProgress(s)).toBe(true);
    markGuideDone(s.help, 'recover');
    queueGuide(s.help, 'first-run-room');
    expect(tutorialInProgress(s)).toBe(true);
    markGuideDone(s.help, 'first-run-room');
    expect(careClockOf(s)).toEqual({ decay: true, idleHeal: true });
  });

  it('튜토리얼 중 미접속 60시간 → 배부름·컨디션·교감·체력·쇠약·빈사 그대로 (48시간 빈사·사망도 없음)', () => {
    const s = inRecover(0);
    s.nest.lastMealAt = 1; // 0 = 시각 모름
    const before = vitals(s);
    const r = absenceOf(s, 60 * H);
    expect(vitals(s)).toEqual(before);
    expect(r.flow.hunger).toBe(0);
    expect(r.collapsed).toBe(false);
    expect(r.died).toBe(false);
    expect(s.lastSeenAt).toBe(60 * H); // 정산 시각은 지금으로
    expect(s.nest.lastTickMs).toBe(60 * H);
    expect(s.nest.lastMealAt).toBe(60 * H); // 쇠약 시계도 밀려 멈춤
    expect(s.runLog.vitals.filter((v) => v.kind === 'collapse' || v.kind === 'death')).toEqual([]);
  });

  it('튜토리얼 중 켜 둔 동안(1분 시계 tickIdle)도 그대로 · 방 체력 미리 보기도 자연 회복 없음', () => {
    const s = inRecover(0);
    const before = vitals(s);
    expect(previewHomeHp(s.nest, 3 * H, careClockOf(s).idleHeal).fraction).toBeCloseTo(0.3);
    tickIdle(s, 3 * H);
    expect(vitals(s)).toEqual(before);
  });

  it('빈사 중 회복 안내(①)에서 나가 있어도 빈사 사망 시계가 안 간다', () => {
    const s = inRecover(0);
    Object.assign(s.nest, { collapsed: true, collapsedAt: 0, hpFraction: 0.1 });
    absenceOf(s, 100 * H);
    expect(s.nest.dead).toBe(false);
    expect(s.nest.collapsed).toBe(true);
  });

  it('튜토리얼 안 플레이어 행동(온천)은 그대로 흐른다 — 튜토리얼 온천은 실제 시간으로 찬다', () => {
    const s = inRecover(0);
    expect(spaEnter(s, 0)).toBeNull();
    tickIdle(s, 5_000);
    expect(homeHpOf(s.nest)).toBeGreaterThan(0.3);
  });

  it('튜토리얼이 끝난 뒤 미접속 → 평소대로 배부름·컨디션·교감이 줄어든다', () => {
    const s = inRecover(0);
    markGuideDone(s.help, 'recover');
    expect(tutorialInProgress(s)).toBe(false);
    absenceOf(s, 24 * H);
    expect(s.nest.hunger).toBeGreaterThan(40);
    expect(s.nest.condition).toBeLessThan(60);
    expect(s.nest.bond).toBe(10 - 2); // 12시간마다 −1
  });

  it('튜토리얼 끝 직후 첫 정산은 튜토리얼 시간을 몰아 빼지 않는다 (끝 시점 = 정산 기준)', () => {
    const s = inRecover(0);
    absenceOf(s, 30 * H); // 튜토리얼 중 30시간 비움 — 멈춤
    tickIdle(s, 30 * H + 10_000);
    markGuideDone(s.help, 'recover');
    queueGuide(s.help, 'first-run-room');
    // 마지막 1분 시계 뒤 50초 만에 '다음 할 일' 카드를 닫는다 — finishGuide 가 그 50초도 멈춘 시계로 먼저 정산
    const end = 30 * H + 60_000;
    finishGuide(s, 'first-run-room', end);
    expect(tutorialInProgress(s)).toBe(false);
    expect(s.nest.hunger).toBe(40);
    expect(s.lastSeenAt).toBe(end);
    expect(s.nest.lastTickMs).toBe(end);
    absenceOf(s, end + 2 * H);
    expect(s.nest.hunger).toBeCloseTo(40 + 2 * NX.idleHungerPerHour, 6); // 끝난 뒤 2시간 몫만
  });

  it('엔진: passHomeHp idleHeal false = 대기 회복 없음, 기본은 그대로', () => {
    const a = newNest(0);
    a.hpFraction = 0.5;
    passHomeHp(a, 1, H, false);
    expect(a.hpFraction).toBe(0.5);
    const b = newNest(0);
    b.hpFraction = 0.5;
    passHomeHp(b, 1, H);
    expect(b.hpFraction).toBeGreaterThan(0.5);
  });

  it('화면 연결: 안내 마침 = finishGuide · 방 체력 미리 보기 = careClockOf · 종족 분기 없음', () => {
    const app = read('src/ui/app.ts');
    expect(app).toContain('finishGuide(save!, id);');
    expect(read('src/ui/roomView.ts')).toContain('previewHomeHp(n, Date.now(), careClockOf(save).idleHeal)');
    const game = read('src/game.ts');
    const body = game.slice(game.indexOf('export function careClockOf'), game.indexOf('export function finishGuide'));
    expect(body).not.toMatch(/hollow|shinigami|factionId/);
  });
});

describe('C.537 회복 안내 ② 구급상자 상세 창이 열리면 안내 창 없음 (GDD 13-5 v6.200)', () => {
  const cure = RECOVER_SCENES.find((s) => s.id === 'cure')!;
  it('목록 단계 = 안내 창 그대로, 상세 창 [사용] 단계 = noCard (강조 테두리만)', () => {
    expect(cure.stages).toHaveLength(2);
    expect(cure.stages![0]!.noCard).toBeUndefined();
    expect(cure.stages![0]!.targets).toEqual(['@[data-item="med-cure"]']);
    expect(cure.stages![1]!.noCard).toBe(true);
    expect(cure.stages![1]!.targets[0]).toContain('[data-act="use"]');
    expect(cure.done).toBe('빈사가 풀렸다!'); // 쓴 뒤 결과 카드는 그대로
  });
  it('오버레이: 실제 조작 중 noCard 단계면 창을 숨기고 테두리·기기 초점은 대상에 남긴다', () => {
    const src = read('src/ui/tutorialOverlay.ts');
    expect(src).toContain('cardless = acting && !!stage?.noCard;');
    expect(src).toContain("if (cardless) card.style.visibility = 'hidden';");
    expect(src).toContain("(card.style.visibility === 'hidden' && !cardless)"); // 창이 없어도 테두리는 대상을 따라간다
    expect(src).toContain('layer.dataset.devOnly = stage ? selectorOf(stage.targets)');
  });
  it('패치 번호', () => {
    // C.538: 패치 번호가 올라가 비교를 '이상'으로 — 옛 기대값 expect(PATCH_LABEL).toBe('C.537');
    expect(Number(PATCH_LABEL.slice(2))).toBeGreaterThanOrEqual(537);
  });
});
