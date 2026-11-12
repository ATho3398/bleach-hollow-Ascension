// 붕옥 화면 (GDD 22-3·22-9 → 244장, C.414): 재료 3종으로 붕옥 개발 10단계(반각성 50% → 공명 100%) → 모든 트랙 등급 1위 → 합체 미리보기 → 확인 2번 → 연출.
// 왼쪽 = 붕옥 그림(개발 % 6단계, 불꽃은 뒤)·둘레 재료 3칸·총 효과, 오른쪽 = 고른 것의 상세 + 아래 고정 [강화], 오른쪽 위 탭 [합체][초월자 도감] = 별도 창 (C.425). 종족 문구는 각 트랙의 종족 설정에서 읽는다 (종족 분기 없음). 수치는 BALANCE.provisional.hogyoku.
import { BALANCE } from '../config/balance';
import { FACTIONS, getFaction } from '../data/factions';
import { formName, tryGetForm } from '../data/evolution';
import { JADE_NAME, TRADE_CURRENCY_NAME } from '../data/economy';
import { HOGYOKU_MATERIAL_NAMES, HOGYOKU_MATERIAL_SOURCE, HOGYOKU_STAGE_NAMES, HOGYOKU_STEP_NAMES, HOGYOKU_TRACK_NAMES, transcendentConditionText } from '../data/hogyoku';
import { HOGYOKU_TRACK_IDS, slotStatBonus, trackStepCost, type HogyokuCost, type HogyokuTrackId } from '../engine/transcend';
import { TRANSCENDENTS, tryGetTranscendent, type TranscendentDef } from '../data/transcendents';
import { roomOf, type FactionConfig } from '../engine/faction';
import { currentStats, formDisplayName, refStatOf } from '../engine/evolution';
import type { FusionRecord } from '../engine/runLog';
import { characterTracks, artSkinOf, artTierIndexOf, developAll, developGate, hogyokuPercent, fusionGate, fusionInputOf, fusionPreview, statBonusOf, trackIsTopRank, type DevelopBlock, type FusionBlock, type SaveData, type TrackKey } from '../game';
import { rankOf } from '../engine/rank';
import { button, chip, h, icon, mountApp, notice, panel, provisionalTag } from './bha/dom';
import { dexCard, dexGrid } from './bha/dexGrid';
import { imageArt, itemDialog } from './bha/itemUi';
import { heroArtOf } from './bha/battle';
import { bindAnim } from './bha/animPlayer';
import { MOSAIC_LOOK_PREFIX, MOSAIC_MARK } from '../data/art/manifest';
import { transcendentNameNode } from './bha/glitchName';

/** 글자·노드 섞인 요소 (초월자 이름 노드를 끼울 때) */
const hx = (tag: string, cls: string, ...parts: (Node | string)[]): HTMLElement => {
  const e = h(tag as 'p', cls);
  e.append(...parts);
  return e;
};
import { statsBlock } from './bha/nest';
import { artIcon, artSrc } from './bha/artIcon';
import { elementsMark } from './bha/element';
import type { Device } from './bha/device';
import { lcdHead, lcdPage } from './bha/lcdpage';
import { toward } from './bha/nestLogic';
import { rebirthMark } from './rebirthView';
import { rankLabel } from './rankView';
import { shownName } from './displayName';
import { asBack } from './bha/screenBack';

const HX = BALANCE.provisional.hogyoku;
/** 퍼센트 (강마다 +0.1% 라 소수 한 자리까지 — 끝의 .0 은 뺀다) */
const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;

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
    case 'tab': return '붕옥이 아직 나타나지 않았다.';
    case 'resonance': return '붕옥이 공명해야 한다 — 두 종족의 스토리를 모두 끝내면.';
    case 'tracks': return '두 캐릭터가 모두 있어야 한다.';
    case 'develop': return `붕옥 개발을 100%(세 강화 모두 ${HX.trackMax}강)까지 채워야 한다.`;
    case 'rank': return '두 캐릭터 모두 등급 1위여야 한다.';
    case 'expedition': return '진행 중인 모험이 있다. 모험을 끝내야 한다.';
    case 'complete': return '초월자 6종을 모두 모았다. 더는 합체할 수 없다.';
  }
}

/** 강화가 막힌 이유 한 줄 (트랙 하나) */
export function developBlockText(b: DevelopBlock, track: HogyokuTrackId): string {
  const m = HOGYOKU_MATERIALS.find((x) => x.id === track)!;
  switch (b) {
    case 'tab': return '붕옥이 아직 나타나지 않았다.';
    case 'max': return `${m.track} ${HX.trackMax}강 — 더 올릴 강이 없다.`;
    case 'resonance': return `반각성 한계 ${HX.trackHalf}강 — ${HX.trackHalf + 1}강부터는 공명이 필요하다(다른 종족의 스토리도 모두 끝내면 붕옥이 공명한다).`;
    case 'short': return `${m.name}${subjectParticle(m.name)} 모자라다 — ${m.from()}에서 얻는다.`;
  }
}

/** 보유 보너스 한 줄: "붕옥 개발 +5% · 초월자 2종 +4% = 전 능력치 +9%" (없으면 null) */
export function bonusLine(save: Pick<SaveData, 'hogyoku' | 'transcendentDex'>): string | null {
  const b = statBonusOf(save);
  if (b.total <= 0) return null;
  const parts: string[] = [];
  if (b.liberation > 0) parts.push(`붕옥 개발 +${pct(b.liberation)}`);
  if (b.transcendents > 0) parts.push(`초월자 ${save.transcendentDex.length}종 +${pct(b.transcendents)}`);
  return `${parts.join(' · ')} = 전 능력치 +${pct(b.total)}`;
}

/** 붕옥 상태 (GDD 244장 2 안 B): 반각성 → 공명 → 합체 가능 */
export function hogyokuStage(save: SaveData): keyof typeof HOGYOKU_STAGE_NAMES {
  if (!save.hogyoku.resonance) return 'half';
  return fusionGate(save).ok ? 'ready' : 'resonance';
}

/** 강화 트랙 3개 = 재료 3종 (GDD 12-3 v6.015): track 세공·정제·주입 · name 재료(고순도 윤활제·혼백 여과기·영압 결정) · 아이콘 · 얻는 곳.
 *  이름은 data/hogyoku 한 곳. 재료 그림이 없어 지금 스프라이트(보석·별·영압 방울)를 새 이름에 맞춰 대신 (마스터 추천안) */
const MAT_ICONS: Record<HogyokuTrackId, string> = { soul: 'i-rare', shard: 'i-special', essence: 'i-sp' };
export const HOGYOKU_MATERIALS: readonly { id: HogyokuTrackId; icon: string; name: string; track: string; from: () => string }[] = HOGYOKU_TRACK_IDS.map((id) => ({
  id, icon: MAT_ICONS[id] ?? 'i-rare', name: HOGYOKU_MATERIAL_NAMES[id], track: HOGYOKU_TRACK_NAMES[id], from: () => HOGYOKU_MATERIAL_SOURCE,
}));

type Material = (typeof HOGYOKU_MATERIALS)[number];
export type MaterialId = HogyokuTrackId;

/** 개발 % 단계 이름 (10% 구간, GDD 12-3 "단계 이름은 개발 % 10% 구간 이름으로 남긴다") — 0~9% = '개발 전' */
export function stepNameOf(percent: number): string {
  const i = Math.floor(Math.max(0, Math.min(100, percent)) / 10);
  return i > 0 ? HOGYOKU_STEP_NAMES[i - 1] ?? '' : '개발 전';
}

/** 지금 얻는 총 효과 (GDD 12-2 "붕옥 개발 글씨 아래에 지금 얻는 총 효과"): 강화 트랙 합 + 초월자 보너스 */
export function totalEffectText(save: Pick<SaveData, 'hogyoku' | 'transcendentDex'>): { main: string; parts: string } {
  const b = statBonusOf(save);
  const parts = [`붕옥 강화 ${save.hogyoku.developed}강 +${pct(b.liberation)}`, `초월자 ${save.transcendentDex.length}종 +${pct(b.transcendents)}`].join(' · ');
  return { main: `두 캐릭터 전 능력치 +${pct(b.total)}`, parts };
}

/** 붕옥 창 선택 (GDD 12-2 v6.014): 강화 트랙(재료 칸) 하나 또는 붕옥 그림(개발 % 요약). 처음 열면 첫 트랙 */
export type HogyokuSel = 'orb' | HogyokuTrackId;
let hogyokuSel: HogyokuSel = HOGYOKU_TRACK_IDS[0]!;

/** 붕옥 그림 단계 (C.423, GDD 12-2 — 사용자 "종합 해방도에 따라 0~19, 20~39, 40~59, 60~79, 80~99, 100일때 모습"):
 *  개발 %(0~100) 로 고른다. 0~59% = 상자 3종(hogyoku.stage1~3) · 60% 부터 드러난 붕옥 · 80~99% 작은 불꽃 · 100% 큰 불꽃 (불꽃은 붕옥 뒤) */
export interface HogyokuLook { art: string; flame: 'hogyoku.flame-calm' | 'hogyoku.flame' | null; band: number }
export function hogyokuLook(percent: number): HogyokuLook {
  const p = Math.max(0, Math.min(100, percent));
  if (p >= 100) return { art: 'hogyoku.orb', flame: 'hogyoku.flame', band: 5 };
  if (p >= 80) return { art: 'hogyoku.orb', flame: 'hogyoku.flame-calm', band: 4 };
  if (p >= 60) return { art: 'hogyoku.orb', flame: null, band: 3 };
  if (p >= 40) return { art: 'hogyoku.stage3', flame: null, band: 2 };
  if (p >= 20) return { art: 'hogyoku.stage2', flame: null, band: 1 };
  return { art: 'hogyoku.stage1', flame: null, band: 0 };
}

/** 큰 불꽃이 켜지는가: 개발 100%(세 트랙 모두 50강)일 때만. 합체 뒤 25강으로 내려가면 꺼진다 */
export function hogyokuFlameOn(save: Pick<SaveData, 'hogyoku'>): boolean {
  return hogyokuLook(hogyokuPercent(save.hogyoku)).flame === 'hogyoku.flame';
}

const absUrl = (src: string) => (typeof document === 'undefined' ? src : new URL(src, document.baseURI).href);

/** 붕옥 그림 칸: 112×116 칸 하나에 상자 그림(112×116)·붕옥(64, 칸 안 24·25 = 상자 속 붕옥 자리)·불꽃(96, 칸 안 8·1 = 불꽃 프레임 안 붕옥 자리 16·24)을 같은 배율(1.5)로 겹친다.
 *  칸 전체가 버튼 — 누르면 개발 % 요약 */
function orbArt(save: SaveData): HTMLButtonElement {
  const per = hogyokuPercent(save.hogyoku);
  const look = hogyokuLook(per);
  const box = h('button', 'bha-hgorb__art') as HTMLButtonElement;
  box.type = 'button';
  box.setAttribute('aria-label', `붕옥 개발 ${per}% 요약`);
  box.dataset.band = String(look.band);
  box.dataset.art = look.art;
  const flameSrc = look.flame ? artSrc(look.flame) : null;
  if (flameSrc) {
    const flame = h('span', `bha-hgorb__flame${look.flame === 'hogyoku.flame-calm' ? ' is-calm' : ''}`);
    flame.style.setProperty('--hg-flame', `url("${absUrl(flameSrc)}")`);
    flame.dataset.flame = look.flame!;
    flame.setAttribute('aria-hidden', 'true');
    box.append(flame);
  }
  const src = artSrc(look.art) ?? artSrc('hogyoku.orb');
  if (src) {
    const img = h('img', `bha-hgorb__img${look.art === 'hogyoku.orb' ? ' is-orb' : ' is-box'}`) as HTMLImageElement;
    img.src = src;
    img.alt = '';
    img.draggable = false;
    box.append(img);
  } else box.append(artIcon('prop.hogyoku', 'i-evolve'));
  return box;
}

/** 왼쪽 판: 가운데 붕옥 그림(누르면 개발 % 요약) · 둘레 재료 3칸 = 강화 트랙(n/50강, 누르면 그 트랙 상세) · 아래 개발 % · 단계 이름 · 지금 얻는 총 효과 */
function orbBoard(save: SaveData, pick: (sel: HogyokuSel) => void): HTMLElement {
  const hg = save.hogyoku;
  const per = hogyokuPercent(hg);
  const board = h('div', 'bha-hgorb');
  board.setAttribute('aria-label', `붕옥 개발 ${per}%`);
  board.dataset.percent = String(per);
  if (hogyokuFlameOn(save)) board.classList.add('is-full');
  const field = h('div', 'bha-hgorb__field');
  const SVG = 'http://www.w3.org/2000/svg';
  const lines = document.createElementNS(SVG, 'svg');
  lines.setAttribute('class', 'bha-hgorb__lines');
  lines.setAttribute('viewBox', '0 0 100 100');
  lines.setAttribute('preserveAspectRatio', 'none');
  lines.setAttribute('aria-hidden', 'true');
  const spots: [number, number][] = [[13, 14], [87, 14], [87, 86]];
  HOGYOKU_MATERIALS.forEach((_, i) => {
    const ln = document.createElementNS(SVG, 'line');
    const [x, y] = spots[i] ?? [13, 86];
    ln.setAttribute('x1', String(x)); ln.setAttribute('y1', String(y)); ln.setAttribute('x2', '50'); ln.setAttribute('y2', '50');
    ln.setAttribute('vector-effect', 'non-scaling-stroke');
    lines.append(ln);
  });
  const art = orbArt(save);
  art.dataset.sel = 'orb';
  art.onclick = () => pick('orb');
  field.append(lines, art);
  for (const m of HOGYOKU_MATERIALS) {
    const lv = hg.tracks[m.id] ?? 0;
    const g = developGate(save, m.id);
    const b = h('button', `bha-hgmat bha-hgmat--${m.id}${g.ok ? ' is-ok' : lv >= HX.trackMax ? ' is-max' : ''}`) as HTMLButtonElement;
    b.type = 'button';
    b.dataset.material = m.id;
    b.dataset.sel = m.id;
    b.dataset.level = String(lv);
    b.setAttribute('aria-label', `${m.track}(${m.name}) ${lv} / ${HX.trackMax}강`);
    b.append(h('small', 'bha-hgmat__t', m.track), icon(m.icon), h('b', 'bha-hgmat__n', `${lv}/${HX.trackMax}강`));
    b.onclick = () => pick(m.id);
    field.append(b);
  }
  const who = h('div', 'bha-hgorb__who');
  who.append(h('b', '', `붕옥 개발 ${per}%`), h('small', '', stepNameOf(per)));
  const eff = totalEffectText(save);
  const total = h('p', 'bha-hgorb__total');
  total.setAttribute('aria-label', '지금 얻는 총 효과');
  total.dataset.bonus = String(statBonusOf(save).total);
  total.append(h('span', 'bha-hgorb__totalcap', '지금 얻는 효과'), h('b', '', eff.main), h('small', '', eff.parts));
  who.append(total);
  board.append(field, who);
  return board;
}

/** 상태 띠: 반각성 / 공명 / 합체 가능 */
function stageChips(stage: ReturnType<typeof hogyokuStage>): HTMLElement {
  const stages = h('div', 'bha-hogyoku__stages');
  stages.setAttribute('aria-label', '붕옥 상태');
  stages.dataset.stage = stage;
  for (const k of ['half', 'resonance', 'ready'] as const) {
    const on = k === stage;
    const c = chip(HOGYOKU_STAGE_NAMES[k], on ? 'rare' : undefined);
    if (!on) c.classList.add('is-off');
    c.dataset.stage = k;
    stages.append(c);
  }
  return stages;
}

/** 상세 칸 줄 하나: 이름표(왼쪽, 줄바꿈 없음) · 값(남는 폭에서 줄바꿈) — 이름표가 폭 0 으로 눌려 한 글자씩 세로로 깨지지 않게 (C.425) */
function hgRow(label: string, value: string | Node, mod?: 'good' | 'bad' | 'em'): HTMLElement {
  const r = h('div', `bha-hgrow${mod ? ` bha-hgrow--${mod}` : ''}`);
  const v = h('span', 'bha-hgrow__value');
  v.append(value);
  r.append(h('span', 'bha-hgrow__label', label), v);
  return r;
}

/** 상세: 트랙 하나 강화 — 지금 몇 강 · 다음 강 재료 수·보유 · 이 트랙으로 얻는 것(지금 누적 + 다음 1강) · 막힌 이유 · 얻는 곳 · 강당 비용 */
function trackDetail(save: SaveData, m: Material): HTMLElement {
  const lv = save.hogyoku.tracks[m.id] ?? 0;
  const g = developGate(save, m.id);
  const p = panel({ title: `${m.track} — ${m.name}`, aside: `${lv}강 / ${HX.trackMax}` });
  p.setAttribute('aria-label', `${m.track} 상세`);
  p.dataset.material = m.id;
  p.dataset.level = String(lv);
  const top = h('div', 'bha-hgitem');
  top.append(icon(m.icon, 'lg'), h('b', '', `보유 ${g.have}`), stageChips(hogyokuStage(save)));
  const rows = h('div', 'bha-hgrows');
  rows.append(hgRow('지금', `${lv}강 — 전 능력치 +${pct(lv * HX.perStepBonus)} (이 트랙 몫)`));
  if (g.cost === null) rows.append(hgRow('다음 강', `없음 — ${HX.trackMax}강 완료`, 'good'));
  else {
    const b = statBonusOf(save);
    const after = slotStatBonus(save.hogyoku.developed + 1, save.transcendentDex.length);
    rows.append(
      hgRow('다음 강', `${g.next}강`, 'em'),
      hgRow('필요 재료 (보유 / 필요)', `${m.name} ${g.have} / ${g.cost}`, g.have >= g.cost ? 'good' : 'bad'),
      hgRow('다음 1강으로 얻는 것', `두 캐릭터 전 능력치 +${pct(HX.perStepBonus)} (영구)`),
      hgRow('강화 뒤 전체', `+${pct(b.total)} → +${pct(after.total)}`, 'good'),
    );
  }
  rows.append(hgRow('강당 재료', `n강 = ${m.name} ${HX.costPerLevel === 1 ? 'n' : `n×${HX.costPerLevel}`}개 (1강 ${trackStepCost(m.id, 1)}개 ~ ${HX.trackMax}강 ${trackStepCost(m.id, HX.trackMax)}개)`), hgRow('얻는 곳', m.from()));
  p.append(top, rows);
  const blocks = g.missing.filter((x) => x !== 'tab' && x !== 'max');
  if (blocks.length) {
    const why = h('div', 'bha-hgwhy');
    why.setAttribute('aria-label', '강화가 막힌 이유');
    for (const x of blocks) why.append(h('p', 'bha-small', `· ${developBlockText(x, m.id)}`));
    p.append(why);
  }
  return p;
}

/** 상세: 붕옥 그림 = 개발 % 요약 — 세 트랙 강 수 · 평균 · 단계 이름 · 반각성/공명 안내 */
function orbDetail(save: SaveData): HTMLElement {
  const hg = save.hogyoku;
  const per = hogyokuPercent(hg);
  const p = panel({ title: '붕옥 개발', aside: `${per}%` });
  p.setAttribute('aria-label', '붕옥 개발 요약');
  p.dataset.percent = String(per);
  const rows = h('div', 'bha-hgrows');
  for (const m of HOGYOKU_MATERIALS) {
    const lv = hg.tracks[m.id] ?? 0;
    rows.append(hgRow(m.track, `${lv} / ${HX.trackMax}강`, lv >= HX.trackMax ? 'good' : undefined));
  }
  const avg = HOGYOKU_MATERIALS.reduce((a, m) => a + (hg.tracks[m.id] ?? 0), 0) / HOGYOKU_MATERIALS.length;
  rows.append(hgRow('평균', `${Math.round(avg * 10) / 10}강 → 개발 ${per}% · ${stepNameOf(per)}`, 'em'));
  p.append(stageChips(hogyokuStage(save)), rows, h('p', 'bha-faint', `개발 % = ${HOGYOKU_MATERIALS.map((x) => x.track).join('·')} 평균 ÷ ${HX.trackMax}. 강마다 두 캐릭터 전 능력치 +${pct(HX.perStepBonus)}(영구). 1~${HX.trackHalf}강 = ${HOGYOKU_STAGE_NAMES.half}, ${HX.trackHalf + 1}강부터 = ${HOGYOKU_STAGE_NAMES.resonance} 필요. 100%(세 강화 모두 ${HX.trackMax}강)면 합체할 수 있다. 합체하면 세 강화가 ${HX.afterFusionLevel}강(개발 ${Math.round((HX.afterFusionLevel / HX.trackMax) * 100)}%)으로 돌아가지만 오른 능력치는 남는다.`));
  return p;
}

export interface HogyokuHandlers {
  /** [강화] = 고른 트랙 1강 */
  onDevelop: (track: HogyokuTrackId) => void;
  /** [일괄 강화] = 가진 재료로 세 트랙 모두 갈 수 있는 데까지 (확인 1번) */
  onDevelopAll: () => void;
  /** 오른쪽 위 탭 [합체] — 붕옥이 안 보이는 별도 창 */
  onFusion: () => void;
  /** 오른쪽 위 탭 [초월자 도감] — 별도 창 */
  onDex: () => void;
}

/** 붕옥 화면 (GDD 12-2 v6.014, C.425 사용자 재지시 "오른쪽 탭 다 지워" · "재료마다 따로 강화"): 왼쪽 판 = 붕옥 그림 + 강화 트랙 3칸 + 개발 % + 지금 얻는 총 효과,
 *  오른쪽 판 = 고른 것(트랙·붕옥 요약)의 상세 하나 + 아래 고정 [강화][일괄 강화]. 머리 오른쪽 위 탭 [합체][초월자 도감] = 별도 창 */
export function hogyokuView(dev: Device, save: SaveData, hd: HogyokuHandlers): void {
  const sub = h('span');
  sub.append(`재료마다 따로 강화한다 `, provisionalTag('임시 수치'));
  const fusionTab = button({ label: '합체', icon: 'i-evolve', size: 'small', onClick: hd.onFusion });
  fusionTab.dataset.sc = 'hogyoku-fusion';
  if (fusionGate(save).ok) fusionTab.classList.add('is-on');
  const dexTab = button({ label: `초월자 도감 ${save.transcendentDex.length}/${TRANSCENDENTS.length}`, icon: 'i-dex', size: 'small', onClick: hd.onDex });
  dexTab.dataset.sc = 'hogyoku-dex';
  const head = lcdHead({ title: '붕옥', sub, aside: [fusionTab, dexTab] });

  const detail = h('div', 'bha-hgdetail');
  detail.setAttribute('aria-live', 'polite');
  const one = button({ label: '강화', icon: 'i-plus', variant: 'primary', block: true, onClick: () => { if (hogyokuSel !== 'orb') hd.onDevelop(hogyokuSel); } });
  one.dataset.sc = 'hogyoku-develop';
  const anyOk = HOGYOKU_TRACK_IDS.some((id) => developGate(save, id).ok);
  const all = button({ label: '일괄 강화', icon: 'i-chain-3', block: true, disabled: !anyOk, onClick: hd.onDevelopAll });
  all.dataset.sc = 'hogyoku-develop-all';
  const foot = h('div', 'bha-hgfoot');
  foot.append(one, all);
  let board: HTMLElement;
  const pick = (sel: HogyokuSel) => {
    hogyokuSel = sel;
    board.querySelectorAll<HTMLElement>('[data-sel]').forEach((b) => {
      b.classList.toggle('is-on', b.dataset.sel === sel);
      b.setAttribute('aria-pressed', String(b.dataset.sel === sel));
    });
    const m = HOGYOKU_MATERIALS.find((x) => x.id === sel);
    detail.replaceChildren(m ? trackDetail(save, m) : orbDetail(save));
    detail.dataset.sel = sel;
    detail.scrollTop = 0;
    // [강화] = 고른 트랙 1강. 붕옥 요약을 보는 중이면 흐림 (재료 칸을 골라야 강화)
    const g = m ? developGate(save, m.id) : null;
    one.disabled = !g?.ok;
    one.setAttribute('aria-label', m ? `${m.track} 강화` : '강화');
    one.replaceChildren(icon('i-plus'), m ? (g!.cost === null ? `${HX.trackMax}강 완료` : `강화 → ${g!.next}강`) : '재료 칸을 골라 강화');
  };
  board = orbBoard(save, pick);
  pick(hogyokuSel);
  const right = h('div', 'bha-hgright');
  right.append(detail, foot);
  lcdPage(dev.view, { cls: 'bha-hogyoku-page bha-hogyoku-main' }, head, [board], [right]);
}

/** 일괄 강화 미리 계산 (확인 창 문구): 세이브를 건드리지 않고 복사본으로 developAll */
export function developAllPreview(save: SaveData): HogyokuCost {
  return developAll(structuredClone(save)).gained;
}

/** 일괄 강화 결과 한 줄: '세공 +3강 · 정제 +2강' (오른 것만) */
export function gainedText(g: HogyokuCost): string {
  return HOGYOKU_MATERIALS.filter((m) => g[m.id] > 0).map((m) => `${m.track} +${g[m.id]}강`).join(' · ') || '오른 강 없음';
}

/** 처음 열면 첫 트랙(세공) 선택 — 붕옥 창을 새로 열 때 부른다 */
export function resetHogyokuSel(): void {
  hogyokuSel = HOGYOKU_TRACK_IDS[0]!;
}

/** 슬롯의 두 캐릭터를 종족 설정 순서(FACTIONS 목록 순)로 (C.425 합체 창 "왼쪽 호로·오른쪽 사신" — 종족 id 분기 없이 설정 순서) */
export function tracksInFactionOrder(save: SaveData): Pick<SaveData, TrackKey>[] {
  const order = (id: string) => FACTIONS.findIndex((f) => f.id === id);
  return [...characterTracks(save)].sort((a, b) => order(a.factionId) - order(b.factionId)); // 초월자 트랙은 합체 재료가 아니다 (GDD 12-4 v6.028)
}

/** 캐릭터 그림 (방 그림과 같은 규칙 — 진화 외형·스킨 포함). 그림이 없으면 아이콘 */
function trackArt(t: Pick<SaveData, TrackKey>): HTMLElement {
  const f = getFaction(t.factionId);
  const art = heroArtOf(roomOf(f), t.factionId, artTierIndexOf(t), artSkinOf(t));
  const box = h('span', 'bha-dexart');
  if (art.src) {
    const img = imageArt(art.src);
    img.style.setProperty('--art-scale', String(art.scale));
    img.style.setProperty('--art-dy', `${art.offsetY}%`);
    box.append(img);
  } else box.append(icon('i-evolve'));
  return box;
}

/** 캐릭터 상세 창 (합체 창 [상세 보기]): 공용 상세 창 틀(itemDialog, 도감 상세와 같은 틀) — 단계·등급·속성·히든·환생 + 능력치 표 */
function trackDetailDialog(save: SaveData, t: Pick<SaveData, TrackKey>): void {
  const f = getFaction(t.factionId);
  const inp = fusionInputOf(t);
  const top = trackIsTopRank(t);
  const rows = h('div', 'bha-hgrows');
  rows.append(
    hgRow('단계', `${t.evolution.tierIndex + 1}단계 ${f.tierNames[t.evolution.tierIndex] ?? ''}`),
    hgRow('등급', top ? `${rankLabel(f, rankOf(t.rank))} ✓` : `${rankLabel(f, rankOf(t.rank))} (합체엔 ${rankLabel(f, 1)} 필요)`, top ? 'good' : 'bad'),
    hgRow('속성', elementsMark([...inp.elements], f.id)),
    hgRow('진화체', inp.hidden ? '히든 진화체' : '일반 진화체'),
    hgRow(f.rebirth.name, `${inp.rebirths}회`),
  );
  const stats = statsBlock(f.id, currentStats(t.evolution, f.id, statBonusOf(save).total), t.evolution.ev, refStatOf(BALANCE.provisional.stats.tierTotals.length - 1), t.evolution.carry);
  itemDialog({ heading: `${f.name} · 합체 재료`, name: trackName(t), desc: '', art: trackArt(t), hero: true, cls: 'bha-dexmodal bha-hgtrackmodal', content: [rows, stats], actions: [] });
}

/** 합체 조건 목록 (충족 ✓ / 미충족 ✗): 개발 100% · 공명 · 두 캐릭터 등급 1위 · 진행 중 모험 없음 · 못 모은 초월자 */
function fusionConditions(save: SaveData): HTMLElement {
  const missing = new Set(fusionGate(save).missing);
  const list = h('div', 'bha-hgrows bha-hgconds');
  list.setAttribute('aria-label', '합체 조건');
  const cond = (key: FusionBlock, label: string, ok: string, ng: string) => {
    const bad = missing.has(key);
    const r = hgRow(`${bad ? '✗' : '✓'} ${label}`, bad ? ng : ok, bad ? 'bad' : 'good');
    r.dataset.cond = key;
    r.dataset.ok = String(!bad);
    list.append(r);
  };
  cond('develop', '붕옥 개발 100%', '완료', `지금 ${hogyokuPercent(save.hogyoku)}% (${HOGYOKU_MATERIALS.map((m) => `${m.track} ${save.hogyoku.tracks[m.id] ?? 0}`).join(' · ')}강)`);
  cond('resonance', HOGYOKU_STAGE_NAMES.resonance, '완료', '두 종족의 스토리를 모두 끝내면');
  cond('rank', '두 캐릭터 모두 등급 1위', '완료', tracksInFactionOrder(save).filter((t) => !trackIsTopRank(t)).map((t) => `${getFaction(t.factionId).name} ${rankLabel(getFaction(t.factionId), rankOf(t.rank))}`).join(' · '));
  cond('expedition', '진행 중인 모험 없음', '없음', '모험을 끝내야 한다');
  cond('complete', '못 모은 초월자가 있다', `${TRANSCENDENTS.length - save.transcendentDex.length}종 남음`, '6종을 모두 모았다');
  if (missing.has('tracks')) cond('tracks', '두 캐릭터가 모두 있다', '', fusionBlockText('tracks'));
  return list;
}

/** 합체 창 (C.425, GDD 12-2 "합체 = 별도 창"): 붕옥은 안 보인다. 사각형 2칸 = 두 캐릭터 그림(종족 설정 순서) + [상세 보기] ·
 *  지금 두 캐릭터라면 → 「○○」 · 조건 목록 · [합체](확인 1 → 확인 2 → 자동 백업 흐름 그대로) */
export function fusionPickView(dev: Device, save: SaveData, hd: { onPreview: () => void }): void {
  const tracks = tracksInFactionOrder(save);
  const sub = h('span', '', `${tracks.map((t) => getFaction(t.factionId).name).join(' + ')} → 초월자 `);
  sub.append(provisionalTag('임시 조건'));
  const head = lcdHead({ title: '합체', sub });
  const pair = h('div', 'bha-hgpair');
  pair.setAttribute('aria-label', '합체할 두 캐릭터');
  tracks.forEach((t, i) => {
    const f = getFaction(t.factionId);
    const card = h('section', 'bha-hgpair__card');
    card.dataset.faction = t.factionId;
    card.append(h('span', 'bha-hgpair__fac', f.name), trackArt(t), h('b', 'bha-hgpair__name', trackName(t)), h('small', 'bha-hgpair__rank', rankLabel(f, rankOf(t.rank))));
    const more = button({ label: '상세 보기', icon: 'i-chevron-right', size: 'small', block: true, onClick: () => trackDetailDialog(save, t) });
    more.dataset.sc = `fusion-detail-${i}`;
    card.append(more);
    if (i > 0) pair.append(h('span', 'bha-hgpair__plus', '+'));
    pair.append(card);
  });
  const right = h('div', 'bha-hgright');
  const detail = h('div', 'bha-hgdetail');
  const p = panel({ title: '초월자 합체', aside: provisionalTag('임시 조건') });
  p.setAttribute('aria-label', '초월자 합체');
  const pv = fusionPreview(save);
  if (pv.def) {
    const now = h('p', 'bha-hgpreview');
    now.dataset.preview = pv.def.id;
    now.append('지금 두 캐릭터라면 → ', hx('b', '', '「', transcendentNameNode(pv.def), '」'));
    p.append(now);
  }
  p.append(fusionConditions(save), h('p', 'bha-faint', '두 캐릭터가 초월자 하나가 되어 사라지고, 새 두 캐릭터가 1단계부터 시작한다. 되돌릴 수 없다 (직전 상태는 자동 백업).'));
  detail.append(p);
  const fg = fusionGate(save);
  const go = button({ label: '합체', icon: 'i-chevron-right', variant: fg.ok ? 'danger' : 'ghost', block: true, disabled: !fg.ok, onClick: hd.onPreview });
  go.dataset.sc = 'hogyoku-preview';
  const foot = h('div', 'bha-hgfoot');
  foot.append(go);
  right.append(detail, foot);
  lcdPage(dev.view, { cls: 'bha-hogyoku-page bha-hogyoku-main bha-hgfusion-page' }, head, [pair], [right]);
}

/** 초월자 그림 칸 (C.430): 데이터 art 키의 그림이 있으면 그 그림(대기 프레임 반복 — 태초 = 검은 구슬 + 후광), 없으면 아이콘 자리 표시.
 *  못 모은 것은 실루엣·? (그림이 있어도 보여 주지 않는다) */
export function transcendentArt(known: boolean, def?: Pick<TranscendentDef, 'id' | 'art' | 'model'>): HTMLElement {
  const box = h('span', `bha-dexart${known ? '' : ' is-silhouette'}`);
  // 그림 키(art) 또는 조각 모델(model — C.431, 화면 관찰자가 합성 그림으로 바꿔 끼움)
  const key = def?.art ?? (def?.model ? `${MOSAIC_LOOK_PREFIX}${def.id}` : undefined);
  const art = known && key ? heroArtOf(roomOf(FACTIONS[0]!), FACTIONS[0]!.id, 0, key) : null;
  if (art?.src && (art.src.includes(MOSAIC_MARK) || (def?.art && art.src.includes(def.art.replace(/\./g, '-'))))) {
    const img = h('img', 'bha-itemart bha-itemart--img bha-trart') as HTMLImageElement;
    img.src = art.src;
    img.alt = '';
    img.draggable = false;
    box.classList.add('has-art');
    box.dataset.art = key!;
    box.append(img);
    bindAnim(box, img, art)?.setLoop('idle');
    return box;
  }
  box.append(icon(known ? 'i-evolve' : 'i-unknown'));
  return box;
}

/** 초월자 도감 창 (C.425, GDD 12-2 "기존 도감 화면 형식"): 진화체 도감과 같은 바둑판 카드(dexGrid·dexCard) — 누르면 공용 상세 창.
 *  모은 것 = 이름·컨셉·몇 번째 합체, 못 모은 것 = ??? + 조건 공개. 붕옥은 안 보인다 */
export function transcendentDexView(dev: Device, save: SaveData): void {
  const owned = new Map(save.transcendentDex.map((e) => [e.id, e]));
  const grid = dexGrid('초월자');
  grid.dataset.owned = String(owned.size);
  for (const d of TRANSCENDENTS) {
    const got = owned.get(d.id);
    const card = got
      ? dexCard({
        name: d.name, unknown: false, art: transcendentArt(true, d), marks: null, badge: `${got.fusionIndex}번째`,
        onOpen: () => itemDialog({ heading: `초월자 ${d.order}`, name: d.name, desc: '', art: transcendentArt(true, d), hero: true, cls: 'bha-dexmodal', actions: [],
          content: [h('p', 'bha-mddetail__body', d.concept), h('p', 'bha-faint', `${got.fusionIndex}번째 합체로 얻었다. 조건: ${transcendentConditionText(d.condition)}`)] }),
      })
      : dexCard({
        name: '???', unknown: true, art: transcendentArt(false), marks: null,
        onOpen: () => itemDialog({ heading: `초월자 ${d.order}`, name: '미발견', desc: `조건: ${transcendentConditionText(d.condition)}`, art: transcendentArt(false), hero: true, cls: 'bha-dexmodal', actions: [] }),
      });
    card.dataset.transcendent = d.id;
    card.dataset.owned = String(!!got);
    grid.append(card);
  }
  const sub = h('span');
  const line = bonusLine(save);
  sub.append('모음 ', h('b', '', String(owned.size)), ` / ${TRANSCENDENTS.length} · ${line ? `보유 보너스 ${line}` : `1종마다 전 능력치 +${pct(HX.perTranscendentBonus)}`} `, provisionalTag('임시 수치'));
  const nodes: HTMLElement[] = [grid];
  if (owned.size >= TRANSCENDENTS.length) nodes.unshift(notice('rare', '초월자 6종을 모두 모았다. 칭호 「붕옥 완성」. 이후 합체는 막히고 육성은 계속된다.', { title: '붕옥 완성' }));
  lcdPage(dev.view, { cls: 'bha-dex-page bha-dexgrid-page bha-hgdex-page', cols: 'minmax(0, 1fr)' }, lcdHead({ title: '초월자 도감', sub }), nodes, []);
}

/** 합체 판정 줄 한 캐릭터: 종족 · 이름 · 속성 · 히든 · 환생 (공격 분류는 화면에 안 보임, GDD 137장 1) */
function charCard(t: Pick<SaveData, TrackKey>): HTMLElement {
  const f = getFaction(t.factionId);
  const inp = fusionInputOf(t);
  const p = panel({ title: `${f.name} · ${trackName(t)}`, aside: elementsMark([...inp.elements], f.id) });
  p.dataset.faction = t.factionId;
  const line = h('p', 'bha-small');
  line.append(`${inp.hidden ? '히든 진화체' : '일반 진화체'} · 환생 ${inp.rebirths}회 `);
  const mark = rebirthMark(inp.rebirths);
  if (mark) line.append(mark);
  p.append(line);
  return p;
}

/** 합체로 사라지는 것 / 남는 것 (GDD 22-3) */
export function fusionLists(): { gone: string[]; keeps: string[] } {
  return {
    gone: [
      '지금 두 캐릭터 (초월자 도감에 전시되고, 초월자로 이어서 키운다)',
      '두 캐릭터 자리의 능력치·노력치·진화·특성·걸음·등급·등급 이력·수련·환생 횟수 — 새 두 캐릭터는 1단계 완전 초기 (환생 계승 없음)',
      `붕옥 강화 세 가지의 ${HX.afterFusionLevel + 1}~${HX.trackMax}강 진행 (다음 합체를 위해 다시 강화)`,
    ],
    keeps: [
      '초월자 = 새 캐릭터 하나: 두 캐릭터의 능력치(높은 쪽)·블록·특성·속성 강화를 그대로 이어받는다. 진화·등급전·스토리·환생 없음, 시간이 지나도 수치가 안 닳는다',
      '도감·칭호 기록, 초월자 도감',
      `붕옥 강화 ${HX.afterFusionLevel}강까지·공명, 강화로 오른 능력치 (새 캐릭터에도)`,
      `음식·가진 타일·${TRADE_CURRENCY_NAME}·${JADE_NAME}·남은 붕옥 재료`,
      '스토리 진행·보스 도감·입은 스킨',
    ],
  };
}

/** 합체 확인 1 (미리보기): 왼쪽 = 두 캐릭터, 오른쪽 = "이 조합이면 ○○" + 사라짐/남음 + [다음 — 최종 확인] */
export function fusionConfirmView(dev: Device, save: SaveData, hd: { onNext: (def: TranscendentDef) => void }): void {
  const pv = fusionPreview(save);
  const head = lcdHead({ title: '초월자 합체 — 확인 1/2', sub: `${characterTracks(save).map((t) => getFaction(t.factionId).name).join(' + ')} → 초월자` });
  const left: HTMLElement[] = characterTracks(save).map(charCard);
  const right: HTMLElement[] = [];
  if (pv.def) {
    const p = panel({ title: '이 조합이면', mod: 'accent', aside: provisionalTag('임시 조건') });
    p.setAttribute('aria-label', '합체 미리보기');
    p.dataset.preview = pv.def.id;
    p.append(hx('p', 'bha-lcdpage__title', '「', transcendentNameNode(pv.def), `」${subjectParticle(pv.def.name)} 된다`), h('p', 'bha-small', pv.def.concept));
    p.append(h('p', 'bha-faint', pv.matched ? '두 캐릭터의 상태가 이 초월자의 조건에 맞았다.' : '조건이 맞는 초월자를 이미 가지고 있어, 아직 없는 초월자 중 표 아래쪽부터 채운다.'));
    if (save.transcendentDex.length === 0) p.append(h('p', 'bha-small', `첫 초월자 보상: ${JADE_NAME} +${HX.firstTranscendentJade}`));
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
  return { title: '합체 최종 확인', body: `되돌릴 수 없다. 두 캐릭터는 「${def.name}」${subjectParticle(def.name)} 되어 이어서 키우고, 새 두 캐릭터가 1단계부터 시작한다. (직전 상태는 자동 백업된다)` };
}

/**
 * 합체 연출: 하얗게 바랬다가 돌아오며 문구 3줄 → 결과(초월자 이름·컨셉, 사라진 두 캐릭터, 새 두 트랙 1단계, 보상) + [둥지로].
 * 3.4초 뒤 결과, [건너뛰기]로 바로. 환생 연출과 같은 bha-evolve 틀
 */
export function fusionView(root: HTMLElement, faction: FactionConfig, record: FusionRecord, save: SaveData, onDone: () => void): void {
  const def = tryGetTranscendent(record.transcendentId)!;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const linesSection = h('section');
  const lines = h('div', 'bha-evolve__lines');
  lines.setAttribute('aria-live', 'polite');
  ['붕옥이 두 영혼을 삼킨다.', '하나가 되었다.', null].forEach((t, i) => {
    const line = t === null ? hx('p', 'bha-evolve__line', '초월자 「', transcendentNameNode(def), '」.') : h('p', 'bha-evolve__line', t);
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
  linesSection.append(h('span'), lines, asBack(button({ label: '건너뛰기', variant: 'ghost', onClick: show })));

  const main = h('div', 'bha-evolve__resmain');
  main.append(transcendentArt(true, def), h('span', 'bha-evolve__eyebrow', `${record.index}번째 합체 · 초월자`), hx('h1', 'bha-evolve__title', transcendentNameNode(def)), h('p', 'bha-evolve__path', def.concept));
  const home = asBack(button({ label: toward(faction.nestName), icon: 'i-nest', variant: 'primary', size: 'lg', block: true, onClick: () => {
    if (timer !== undefined) clearTimeout(timer);
    onDone();
  } }));
  main.append(home);
  const side = h('div', 'bha-evolve__resside');
  const got = panel({ title: '합체 결과', aside: provisionalTag('임시 수치') });
  const dl = h('dl', 'bha-infotable');
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
  row('새로 시작', characterTracks(save).map((t) => `${getFaction(t.factionId).name} 1단계 ${getFaction(t.factionId).tierNames[0]}`).join(' · '));
  row('초월자로 이어서', `${def.name} — 두 캐릭터가 키운 것을 그대로 (진화·${faction.rankBattleName}·스토리·${faction.rebirth.name} 없음)`);
  row('초월자 도감', `${save.transcendentDex.length} / ${TRANSCENDENTS.length}`);
  row('보상', [record.jade ? `${JADE_NAME} +${record.jade}` : null, bonusLine(save)].filter(Boolean).join(' · ') || '없음');
  got.append(dl);
  side.append(got);
  if (save.transcendentDex.length >= TRANSCENDENTS.length) side.append(chip('칭호 「붕옥 완성」', 'rare'));
  result.append(main, side);

  mountApp(root, { cls: 'bha-evolve bha-rebirth bha-fusion' }, h('span', 'bha-evolve__burst'), linesSection, result);
  timer = setTimeout(show, 3400);
}
