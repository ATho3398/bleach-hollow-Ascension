// C.561 (GDD 8-9 · 14-4 v6.242, 사용자 2026-11-27 "하...상태 창이 버튼이랑 ui 가리는게 맞아? 저거 없애고. 수련장 들어오면, 카드형식으로 본능 수련, 아란칼화 수련,
// 훈련인형 띄우고, 본능수련 누르면 그 때 좌측에 본능수련 리스트, 우측에 해당 수련 이미지랑 정보, 각 수련치 이런거 적으면 되잖니. 수련권은 상점에서 재화 오른쪽 위에
// 띄우는거처럼 무조건 오른쪽 위에 띄우고. 수련장 외에도 오른쪽 위에 골드랑 영옥 갯수 항상(모험때 뺴고) 띄워놓고, 뭐 수련장 가면 그때만 수련권으로 바꾸는 식으로 해."):
// ① 수련장 = 카드 3장 → 본능 수련 = 특수던전식 종목 목록 ② 수련 결과 위 상태 창 삭제 ③ 오른쪽 위 재화 칩(수련장 = 수련권)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getFaction } from '../src/data/factions';
import { newSaveData } from '../src/game';
import { cornerKindOf, cornerValues, TICKET_SCREENS } from '../src/ui/bha/corner';
import { trainingHallCards, type TrainingHallState } from '../src/ui/trainingHallView';
import { trainingGameArt, trainingGateText, trainingLockedText } from '../src/ui/trainingView';
import { TRAINING_GAMES } from '../src/engine/training';

const read = (p: string) => readFileSync(p, 'utf8');
const app = read('src/ui/app.ts');
const hall = read('src/ui/trainingHallView.ts');
const tv = read('src/ui/trainingView.ts');
const corner = read('src/ui/bha/corner.ts');
const st = (o: Partial<TrainingHallState> = {}): TrainingHallState => ({ altarName: '수련장', trainLocked: false, points: 70, pointsMax: 60, practiceCount: 2, ascend: 'open', ...o });
const calls: string[] = [];
const hd = { onTrain: () => void calls.push('train'), onAscend: () => void calls.push('ascend'), onPractice: () => void calls.push('practice') };

describe('수련장 = 카드 3장 (GDD 8-9 v6.242)', () => {
  it('순서 = 본능 수련 · 아란칼화 · 훈련 인형, 이름·한 줄은 종족 설정 (분기 없음)', () => {
    for (const fid of ['hollow', 'shinigami']) {
      const f = getFaction(fid);
      const c = trainingHallCards(f, st(), hd);
      expect(c.map((x) => x.id)).toEqual(['train', 'ascend', 'practice']);
      expect(c.map((x) => x.name)).toEqual([f.training.title, f.ascension.name, '훈련 인형']);
      expect(c[0]!.line).toBe(f.training.hall!.trainDesc);
      expect(c[1]!.line).toBe(f.training.hall!.ascendDesc);
      expect(c[2]!.line).toBe(f.training.hall!.practiceDesc);
      expect(c[0]!.sub).toBe('수련치 60/60'); // 넘친 수련치는 기준에서 자른다
      expect(c[2]!.sub).toBe('이번 생 2판');
      expect(c[1]!.sub).toBe(`상대: ${f.ascension.foe}`);
      for (const x of c) expect(x.line.length).toBeLessThan(60);
    }
    expect(getFaction('shinigami').ascension.name).toBe('참백도 구상화');
    expect(getFaction('shinigami').training.title).toBe('참백도 수련');
    expect(hall).not.toMatch(/'hollow'|'shinigami'/);
  });
  it('카드를 누르면: 본능 수련 = 목록 화면, 아란칼화 = 확인 창, 훈련 인형 = 적 설정 창 전투', () => {
    calls.length = 0;
    for (const c of trainingHallCards(getFaction('hollow'), st(), hd)) c.go();
    expect(calls).toEqual(['train', 'ascend', 'practice']);
    expect(app).toContain("onTrain: () => { if (!trainLocked(s) && !careBlocked(s)) open('training', () => renderTraining(faction, s)); },");
    expect(app).toContain('onAscend: () => askAscension(faction, s),');
    expect(app).toContain('onPractice: () => practiceArena(faction),');
    const ask = app.slice(app.indexOf('function askAscension('), app.indexOf('/** 훈련 인형 적 설정 창 전투:'));
    expect(ask).toContain("yes: '도전', no: '그만둔다',");
    expect(ask).toContain("open('ascension-battle', () => runAscensionBattle(faction), true)");
  });
  it('잠긴 카드 = 자물쇠 + 조건 한 줄, 눌리지 않음 · 아란칼화 완료 = 완료 · 해방 없음 진화체 = 카드 없음', () => {
    const f = getFaction('hollow');
    const locked = trainingHallCards(f, st({ trainLocked: true, ascend: 'tier' }), hd);
    expect(locked.map((x) => x.open)).toEqual([false, false, true]);
    expect(locked[0]!.lockText).toBe(trainingLockedText(f));
    expect(locked[1]!.lockText).toBe(trainingLockedText(f, f.ascension.name));
    expect(hall).toContain('b.disabled = !c.open;');
    expect(hall).toContain("lock.append(icon('i-lock'), el('span', '', c.lockText));");
    const done = trainingHallCards(f, st({ ascend: 'done' }), hd);
    expect(done[1]!.open).toBe(false);
    expect(done[1]!.sub).toBe('완료');
    expect(done[1]!.lockText).toBe('');
    expect(trainingHallCards(f, st({ ascend: 'none' }), hd).map((x) => x.id)).toEqual(['train', 'practice']);
    expect(app).toContain("ascend: access.ok ? 'open' : access.reason,");
  });
  it('카드 CSS = bha 토큰만, 새 색 없음', () => {
    const css = read('src/ui/bha/story.css');
    const mine = css.slice(css.indexOf('.bha-thall__cards'), css.indexOf('.bha-thall__sub'));
    expect(mine.length).toBeGreaterThan(200);
    expect(mine).not.toMatch(/#[0-9a-f]{3,6}\b|rgba?\(/i);
  });
});

describe('본능 수련 = 특수던전식 종목 목록', () => {
  it('왼쪽 종목 4개(이름 + 작은 글자 수련치 n/60), 오른쪽 그림·설명·보상·비용·단계·수련치·[시작]', () => {
    expect(TRAINING_GAMES.length).toBe(4);
    expect(tv).toContain("name.append(el('b', '', cfg.name), el('small', 'bha-faint', ptsText));");
    expect(tv).toContain('const ptsText = `수련치 ${pts}/${TX.pointsToComplete}`;');
    for (const c of ["reward.append(el('b', '', '승리 '), lines.reward);", "cost.append(el('b', '', '비용 '), lines.cost", "stat.append(el('span', 'bha-chip', `${level}단계`), ` ${ptsText}`);", "label: '시작', icon: 'i-play'", 'onClick: () => hd.onPlay(g)']) expect(tv).toContain(c);
    expect(trainingGameArt('duel')).toMatch(/prop-altar\.webp$/); // 종목 그림이 없으면 방 수련장 물건 그림
    expect(tv).toContain("app.dataset.screen = 'training-list';");
  });
  it('시작할 수 없으면 그림 위 자물쇠 + 까닭, [시작] 흐리게', () => {
    const f = getFaction('hollow');
    expect(trainingGateText(f, { ok: true })).toBeNull();
    expect(trainingGateText(f, { ok: false, reason: 'tier' })).toBe('바스트로데가 되면 본능 수련이 열린다.');
    expect(trainingGateText(f, { ok: false, reason: 'tickets' })).toContain('강적·보스를 쓰러뜨리면 가끔 얻는다');
    expect(trainingGateText(f, { ok: false, reason: 'condition' })).toContain('컨디션이');
    expect(tv).toContain("disabled: !gate.ok, onClick: () => hd.onPlay(g)");
  });
  it('옛 수련 화면 조각 없음: 수련권 칸·종목 카드 상세 창·아란칼화 칸', () => {
    expect(tv).not.toContain('bha-train__tickets');
    expect(tv).not.toContain('itemDialog(');
    expect(tv).not.toContain('function ascensionPanel(');
    expect(tv).not.toContain('`남은 수련권 ${t.tickets}`');
  });
});

describe('수련 결과 위 상태 창 삭제', () => {
  it('수련 결과 화면은 statusFillFx(이름·배부름·컨디션·리스크·체력 막대 카드)를 띄우지 않는다', () => {
    expect(tv).not.toContain('statusFillFx(');
    // 같은 부품을 쓰는 다른 화면(방 가방 소모품 사용)은 지우지 않고 그대로 — 보고 목록
    expect(read('src/ui/lcdScreens.ts')).toContain('statusFillFx(');
  });
});

describe('오른쪽 위 재화 칩 (GDD 14-4 v6.242)', () => {
  it('모험 밖 화면 = 골드·영옥, 수련장 화면들 = 수련권, 모험·전투·결과·연출·처음 화면 = 없음', () => {
    for (const id of ['room', 'worldmap', 'market', 'chest', 'shop', 'wanderer', 'expedition-plan', 'tile-place', 'story', 'tower', 'rank', 'dex', 'settings', 'hogyoku', 'spa', 'care', 'photo']) expect(cornerKindOf(id)).toBe('money');
    for (const id of ['practice', 'training', 'training-result']) expect(cornerKindOf(id)).toBe('tickets');
    for (const id of ['expedition', 'training-play', 'practice-battle', 'ascension-battle', 'tower-battle', 'rank-battle', 'special-battle', 'tower-result', 'rank-result', 'ascension-result', 'special-result', 'title', 'slot-new', 'intro', 'evolve-cutscene', 'fusion-scene', 'rebirth-scene', undefined]) expect(cornerKindOf(id)).toBeNull();
    expect([...TICKET_SCREENS]).toEqual(['practice', 'training', 'training-result']);
  });
  it('값: 골드·영옥 = 공유 재화, 수련권 = 지금 트랙 장수', () => {
    const s = newSaveData('hollow', 1);
    s.shared.tradeCoins = 321;
    s.shared.jade = 7;
    s.training.tickets = 5;
    expect(cornerValues('money', s)).toEqual([{ kind: 'trade', value: 321 }, { kind: 'jade', value: 7 }]);
    expect(cornerValues('tickets', s)).toEqual([{ kind: 'ticket', value: 5 }]);
  });
  it('자리: 머리 줄(bha-lcdpage__head·bha-exp__head) 끝, 없으면 LCD 오른쪽 위에 띄움 · 우라하라 칩은 그 칸 안 왼쪽', () => {
    expect(corner).toContain("app.querySelector<HTMLElement>(':scope > header.bha-lcdpage__head, :scope > header.bha-exp__head')");
    expect(corner).toContain("box.classList.toggle('is-float', !head);");
    expect(app).toContain("const inline = root.querySelector<HTMLElement>('.bha-exp__cornerrow, .bha-v2bar') ?? corner;");
    expect(app).toContain('if (inline) host.prepend(wchip.el);');
    expect(app).toContain('tickCorner(); // 오른쪽 위 재화 칩 값');
    const css = read('src/ui/bha/market.css');
    const mine = css.slice(css.indexOf('.bha-corner {'));
    expect(mine).toContain('margin-left: auto;');
    expect(mine).not.toMatch(/#[0-9a-f]{3,6}\b|rgba?\(/i);
  });
  it('화면마다 따로 있던 재화 표시를 합침: 가방 bagWallet · 상점 coinChip · 수련 화면 수련권 칸', () => {
    expect(read('src/ui/lcdScreens.ts')).not.toContain('export function bagWallet(');
    const shop = read('src/ui/shopView.ts');
    expect(shop).not.toContain('const coinChip = ');
    expect(shop).toContain("if (SHOP_PROVISIONAL) wallet.append(provisionalTag('임시 가격'));");
    expect(corner).toContain("trade: ['bha-chip--gold', 'v2-coin', TRADE_CURRENCY_NAME], jade: ['bha-chip--jade', 'v2-gem', JADE_NAME]");
  });
});

describe('기획서', () => {
  it('8-9 · 14-4 구현 표시', () => {
    const g = read('docs/GDD.md');
    expect(g).toMatch(/수련장 = 카드 3장 → 고르면 목록 화면[^\n]*C\.561/);
    expect(g).toMatch(/오른쪽 위 재화 칩[^\n]*C\.561/);
  });
});
