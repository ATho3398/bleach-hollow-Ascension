// 붕옥 탭 (GDD 22-3·22-9, C.59): 1단계 게이지 → 해방(+5%) → 2단계 게이지 + 모든 트랙 등급 1위 → 합체 미리보기 → 확인 2번 → 연출.
// 왼쪽 = 붕옥 게이지·합체 조건, 오른쪽 = 초월체 도감(전시)·보유 보너스. 종족 문구는 각 트랙의 종족 설정에서 읽는다 (종족 분기 없음). 수치는 BALANCE.provisional.hogyoku.
import { BALANCE } from '../config/balance';
import { getFaction } from '../data/factions';
import { formName, tryGetForm } from '../data/evolution';
import { categoryName } from '../data/elements';
import { JADE_NAME, SOUL_CRYSTAL_NAME, TRADE_CURRENCY_NAME } from '../data/economy';
import { TRANSCENDENTS, tryGetTranscendent, type TranscendentDef } from '../data/transcendents';
import type { FactionConfig } from '../engine/faction';
import { formDisplayName, playerElementsOf } from '../engine/evolution';
import type { FusionRecord } from '../engine/runLog';
import { allTracks, fusionGate, fusionInputOf, fusionPreview, statBonusOf, trackIsTopRank, type FusionBlock, type SaveData, type TrackKey } from '../game';
import { rankOf } from '../engine/rank';
import { button, chip, h, info, meter, mountApp, notice, panel, provisionalTag } from './bha/dom';
import { elementsMark } from './bha/element';
import type { Device } from './bha/device';
import { lcdHead, lcdPage } from './bha/lcdpage';
import { toward } from './bha/nestLogic';
import { rebirthMark } from './rebirthView';
import { rankLabel } from './rankView';
import { shownName } from './displayName';

const HX = BALANCE.provisional.hogyoku;
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** 받침이 있으면 '이', 없으면 '가' (한글이 아니면 '이(가)') */
export function subjectParticle(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return '이(가)';
  return code % 28 === 0 ? '가' : '이';
}

/** 트랙 하나의 이름: 진화체 이름(없으면 단계 이름) */
export function trackName(t: Pick<SaveData, 'factionId' | 'evolution'>): string {
  const f = getFaction(t.factionId);
  return shownName(formDisplayName(t.evolution, f.id));
}

/** 합체가 막힌 이유 한 줄 */
export function fusionBlockText(b: FusionBlock): string {
  switch (b) {
    case 'tab': return '붕옥 탭이 아직 열리지 않았다.';
    case 'liberation': return '먼저 붕옥을 해방해야 한다.';
    case 'tracks': return '두 캐릭터가 모두 있어야 한다.';
    case 'gauge': return `붕옥 2단계에 ${SOUL_CRYSTAL_NAME} ${HX.fusionCost}개를 먹여야 한다.`;
    case 'rank': return '두 캐릭터 모두 등급 1위여야 한다.';
    case 'expedition': return '진행 중인 원정이 있다. 원정을 끝내야 한다.';
    case 'complete': return '초월체 6종을 모두 모았다. 더는 합체할 수 없다.';
  }
}

/** 보유 보너스 한 줄: "붕옥 해방 +5% · 초월체 2종 +4% = 전 능력치 +9%" (없으면 null) */
export function bonusLine(save: Pick<SaveData, 'hogyoku' | 'transcendentDex'>): string | null {
  const b = statBonusOf(save);
  if (b.total <= 0) return null;
  const parts: string[] = [];
  if (b.liberation > 0) parts.push(`붕옥 해방 +${pct(b.liberation)}`);
  if (b.transcendents > 0) parts.push(`초월체 ${save.transcendentDex.length}종 +${pct(b.transcendents)}`);
  return `${parts.join(' · ')} = 전 능력치 +${pct(b.total)}`;
}

/** 초월체 도감 (전시): 6칸, 모은 것은 이름·컨셉·몇 번째 합체, 못 모은 것은 ??? */
function transcendentDexPanel(save: SaveData): HTMLElement {
  const owned = new Map(save.transcendentDex.map((e) => [e.id, e]));
  const p = panel({ title: '초월체 도감', aside: `${owned.size} / ${TRANSCENDENTS.length}` });
  p.setAttribute('aria-label', '초월체 도감');
  p.dataset.owned = String(owned.size);
  const list = info(TRANSCENDENTS.map((d) => {
    const got = owned.get(d.id);
    return got
      ? { label: `${d.order}. ${d.name} · ${got.fusionIndex}번째 합체`, value: d.concept, mod: 'stack' as const }
      : { label: `${d.order}. ???`, value: '아직 만나지 못한 초월체' };
  }));
  list.querySelectorAll('.bha-info__row').forEach((row, i) => {
    const d = TRANSCENDENTS[i]!;
    (row as HTMLElement).dataset.transcendent = d.id;
    (row as HTMLElement).dataset.owned = String(owned.has(d.id));
  });
  p.append(list);
  const line = bonusLine(save);
  p.append(h('p', 'bha-faint', line ? `보유 보너스: ${line}` : `보유 보너스: 붕옥 해방 +${pct(HX.liberatedBonus)}, 초월체 1종마다 +${pct(HX.perTranscendentBonus)} (두 캐릭터 모두)`));
  if (owned.size >= TRANSCENDENTS.length) p.append(notice('rare', '초월체 6종을 모두 모았다. 칭호 「붕옥 완성」. 이후 합체는 막히고 육성은 계속된다.', { title: '붕옥 완성' }));
  return p;
}

/** 두 캐릭터 조건 표: 이름 · 등급(1위면 ✓) */
function rankChecklist(save: SaveData): HTMLElement {
  const tracks = allTracks(save);
  const dl = info(tracks.map((t) => {
    const f = getFaction(t.factionId);
    const top = trackIsTopRank(t);
    return { label: `${f.name} · ${trackName(t)}`, value: top ? `${rankLabel(f, rankOf(t.rank))} ✓` : `${rankLabel(f, rankOf(t.rank))} → ${rankLabel(f, 1)} 필요`, mod: top ? ('good' as const) : ('bad' as const) };
  }));
  dl.setAttribute('aria-label', '합체 조건');
  dl.querySelectorAll('.bha-info__row').forEach((row, i) => ((row as HTMLElement).dataset.top = String(trackIsTopRank(tracks[i]!))));
  return dl;
}

export interface HogyokuHandlers {
  onFeed: () => void;
  onLiberate: () => void;
  onPreview: () => void;
}

/** 붕옥 탭 본 화면 */
export function hogyokuView(dev: Device, save: SaveData, hd: HogyokuHandlers): void {
  const hg = save.hogyoku;
  const sub = h('span');
  sub.append(`${SOUL_CRYSTAL_NAME} `, h('b', 'bha-num', String(save.shared.soulCrystals)), '개 · 두 캐릭터가 같이 쌓는다 ', provisionalTag('임시 수치'));
  const head = lcdHead({ title: '붕옥', sub });

  const core = panel({ title: hg.liberated ? '붕옥 — 해방됨' : '붕옥' });
  core.setAttribute('aria-label', '붕옥 게이지');
  const crystals = save.shared.soulCrystals;
  if (!hg.liberated) {
    const full = hg.fed >= HX.liberateCost;
    core.append(meter({ kind: 'stored', label: '1단계 · 해방', icon: 'i-rare', value: hg.fed, max: HX.liberateCost, full, lg: true }));
    core.append(h('p', 'bha-small', `${SOUL_CRYSTAL_NAME} ${HX.liberateCost}개를 먹이면 붕옥이 해방된다 → 두 캐릭터 모두 전 능력치 +${pct(HX.liberatedBonus)} (영구, 합체 뒤에도 유지).`));
    if (full) {
      const lib = button({ label: '붕옥 해방', icon: 'i-rare', variant: 'primary', block: true, onClick: hd.onLiberate });
      lib.dataset.sc = 'hogyoku-liberate';
      core.append(lib);
    } else {
      const feed = button({ label: `${SOUL_CRYSTAL_NAME} 먹이기 (${Math.min(crystals, HX.liberateCost - hg.fed)}개)`, icon: 'i-plus', variant: 'primary', block: true, disabled: crystals <= 0, onClick: hd.onFeed });
      feed.dataset.sc = 'hogyoku-feed';
      core.append(feed);
    }
  } else {
    core.append(notice('good', `두 캐릭터 모두 전 능력치 +${pct(HX.liberatedBonus)} (영구).`, { title: '붕옥 해방', icon: 'i-check' }));
    const full = hg.fusionFed >= HX.fusionCost;
    core.append(meter({ kind: 'sp', label: '2단계 · 합체', icon: 'i-rare', value: hg.fusionFed, max: HX.fusionCost, full, lg: true }));
    if (!full) {
      const feed = button({ label: `${SOUL_CRYSTAL_NAME} 먹이기 (${Math.min(crystals, HX.fusionCost - hg.fusionFed)}개)`, icon: 'i-plus', variant: 'primary', block: true, disabled: crystals <= 0, onClick: hd.onFeed });
      feed.dataset.sc = 'hogyoku-feed';
      core.append(feed);
    }
  }

  const fusion = panel({ title: '초월체 합체', aside: provisionalTag('임시 조건') });
  fusion.setAttribute('aria-label', '초월체 합체');
  fusion.append(h('p', 'bha-small', `해방된 붕옥에 ${SOUL_CRYSTAL_NAME} ${HX.fusionCost}개 + 두 캐릭터 모두 등급 1위 → 두 캐릭터가 초월체 하나가 된다. 되돌릴 수 없다.`), rankChecklist(save));
  const gate = fusionGate(save);
  const shown = gate.missing.filter((m) => m !== 'tab' && m !== 'rank');
  for (const m of shown) fusion.append(h('p', 'bha-faint', `· ${fusionBlockText(m)}`));
  const prev = button({ label: '합체 미리보기', icon: 'i-chevron-right', variant: gate.ok ? 'danger' : 'ghost', block: true, disabled: !gate.ok, onClick: hd.onPreview });
  prev.dataset.sc = 'hogyoku-preview';
  fusion.append(prev);

  lcdPage(dev.view, { cls: 'bha-hogyoku-page' }, head, [core, fusion], [transcendentDexPanel(save)]);
}

/** 합체 판정 줄 한 캐릭터: 종족 · 이름 · 속성 · 분류 · 히든 · 환생 */
function charCard(t: Pick<SaveData, TrackKey>): HTMLElement {
  const f = getFaction(t.factionId);
  const inp = fusionInputOf(t);
  const p = panel({ title: `${f.name} · ${trackName(t)}`, aside: elementsMark([...inp.elements], f.id) });
  p.dataset.faction = t.factionId;
  const line = h('p', 'bha-small');
  line.append(`분류 ${categoryName(inp.category, f.id)} · ${inp.hidden ? '히든 진화체' : '일반 진화체'} · 환생 ${inp.rebirths}회 `);
  const mark = rebirthMark(inp.rebirths);
  if (mark) line.append(mark);
  p.append(line);
  return p;
}

/** 합체로 사라지는 것 / 남는 것 (GDD 22-3) */
export function fusionLists(): { gone: string[]; keeps: string[] } {
  return {
    gone: [
      '지금 두 캐릭터 (초월체 도감에 전시된다)',
      '두 캐릭터의 능력치·노력치·진화·특성·걸음·등급·등급 이력·수련·환생 횟수 — 새 두 캐릭터는 1단계 완전 초기 (환생 계승 없음)',
      `붕옥 2단계 게이지 (${SOUL_CRYSTAL_NAME} ${HX.fusionCost}개 사용)`,
    ],
    keeps: [
      '도감·칭호 기록, 초월체 도감',
      `붕옥 해방 (+${pct(HX.liberatedBonus)}는 새 캐릭터에도)`,
      `먹이·가진 타일·${TRADE_CURRENCY_NAME}·${JADE_NAME}·남은 ${SOUL_CRYSTAL_NAME}`,
      '스토리 진행·보스 도감·입은 스킨',
    ],
  };
}

/** 합체 확인 1 (미리보기): 왼쪽 = 두 캐릭터, 오른쪽 = "이 조합이면 ○○" + 사라짐/남음 + [다음 — 최종 확인] */
export function fusionConfirmView(dev: Device, save: SaveData, hd: { onNext: (def: TranscendentDef) => void }): void {
  const pv = fusionPreview(save);
  const head = lcdHead({ title: '초월체 합체 — 확인 1/2', sub: `${allTracks(save).map((t) => getFaction(t.factionId).name).join(' + ')} → 초월체` });
  const left: HTMLElement[] = allTracks(save).map(charCard);
  const right: HTMLElement[] = [];
  if (pv.def) {
    const p = panel({ title: '이 조합이면', mod: 'accent', aside: provisionalTag('임시 조건') });
    p.setAttribute('aria-label', '합체 미리보기');
    p.dataset.preview = pv.def.id;
    p.append(h('p', 'bha-lcdpage__title', `「${pv.def.name}」${subjectParticle(pv.def.name)} 된다`), h('p', 'bha-small', pv.def.concept));
    p.append(h('p', 'bha-faint', pv.matched ? '두 캐릭터의 상태가 이 초월체의 조건에 맞았다.' : '조건이 맞는 초월체를 이미 가지고 있어, 아직 없는 초월체 중 표 아래쪽부터 채운다.'));
    if (save.transcendentDex.length === 0) p.append(h('p', 'bha-small', `첫 초월체 보상: ${JADE_NAME} +${HX.firstTranscendentJade}`));
    right.push(p);
  }
  const lists = fusionLists();
  const ul = (items: string[]) => {
    const u = h('ul', 'bha-stack bha-stack--tight');
    for (const t of items) u.append(h('li', 'bha-small', t));
    return u;
  };
  left.push(panel({ title: '사라진다' }, ul(lists.gone)), panel({ title: '남는다' }, ul(lists.keeps)));
  const next = button({ label: '다음 — 최종 확인', icon: 'i-chevron-right', variant: 'danger', block: true, disabled: !pv.def, onClick: () => pv.def && hd.onNext(pv.def) });
  next.dataset.sc = 'fusion-next';
  right.push(next);
  lcdPage(dev.view, { cls: 'bha-hogyoku-page bha-fusion-page' }, head, left, right);
}

/** 최종 확인(확인 2) 문구 */
export function fusionFinalText(def: TranscendentDef): { title: string; body: string } {
  return { title: '합체 최종 확인', body: `되돌릴 수 없다. 두 캐릭터는 「${def.name}」${subjectParticle(def.name)} 되어 사라지고, 새 두 캐릭터가 1단계부터 시작한다. (직전 상태는 자동 백업된다)` };
}

/**
 * 합체 연출: 하얗게 바랬다가 돌아오며 문구 3줄 → 결과(초월체 이름·컨셉, 사라진 두 캐릭터, 새 두 트랙 1단계, 보상) + [둥지로].
 * 3.4초 뒤 결과, [건너뛰기]로 바로. 환생 연출과 같은 bha-evolve 틀
 */
export function fusionView(root: HTMLElement, faction: FactionConfig, record: FusionRecord, save: SaveData, onDone: () => void): void {
  const def = tryGetTranscendent(record.transcendentId)!;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const linesSection = h('section');
  const lines = h('div', 'bha-evolve__lines');
  lines.setAttribute('aria-live', 'polite');
  ['붕옥이 두 영혼을 삼킨다.', '하나가 되었다.', `초월체 「${def.name}」.`].forEach((t, i) => {
    const line = h('p', 'bha-evolve__line', t);
    line.style.setProperty('--k', String(i));
    lines.append(line);
  });
  const result = h('section', 'bha-evolve__result');
  result.hidden = true;
  const show = () => {
    if (timer !== undefined) clearTimeout(timer);
    linesSection.hidden = true;
    result.hidden = false;
  };
  linesSection.append(h('span'), lines, button({ label: '건너뛰기', variant: 'ghost', onClick: show }));

  const main = h('div', 'bha-evolve__resmain');
  main.append(h('span', 'bha-evolve__eyebrow', `${record.index}번째 합체 · 초월체`), h('h1', 'bha-evolve__title', def.name), h('p', 'bha-evolve__path', def.concept));
  const home = button({ label: toward(faction.nestName), icon: 'i-nest', variant: 'primary', size: 'lg', block: true, onClick: () => {
    if (timer !== undefined) clearTimeout(timer);
    onDone();
  } });
  main.append(home);
  const side = h('div', 'bha-evolve__resside');
  const got = panel({ title: '합체 결과', aside: provisionalTag('임시 수치') });
  const dl = h('dl', 'bha-info');
  const row = (label: string, value: string) => {
    const r = h('div', 'bha-info__row bha-info__row--stack');
    r.append(h('dt', '', label), h('dd', '', value));
    dl.append(r);
  };
  row('하나가 된 두 캐릭터', record.characters.map((c) => {
    const f = getFaction(c.factionId);
    const form = c.formId ? tryGetForm(c.formId) : undefined;
    return `${f.name} ${shownName(form ? formName(form, f.id, c.elements) : f.tierNames[c.tierIndex]!)}`;
  }).join(' + '));
  row('새로 시작', allTracks(save).map((t) => `${getFaction(t.factionId).name} 1단계 ${getFaction(t.factionId).tierNames[0]}`).join(' · '));
  row('초월체 도감', `${save.transcendentDex.length} / ${TRANSCENDENTS.length}`);
  row('보상', [record.jade ? `${JADE_NAME} +${record.jade}` : null, bonusLine(save)].filter(Boolean).join(' · ') || '없음');
  got.append(dl);
  side.append(got);
  if (save.transcendentDex.length >= TRANSCENDENTS.length) side.append(chip('칭호 「붕옥 완성」', 'rare'));
  result.append(main, side);

  mountApp(root, { cls: 'bha-evolve bha-rebirth bha-fusion' }, h('span', 'bha-evolve__burst'), linesSection, result);
  timer = setTimeout(show, 3400);
}
