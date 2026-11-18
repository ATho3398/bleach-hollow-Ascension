// 전투 스택 표시 목록 (GDD 7-13 스택 표시, C.471 — 사용자 2026-11-17 "적한테 걸리는거면 적 체력바 위에, 나한테 쌓이는거면 내 체력바 위에. 작은 네모 아이콘으로 쌓아"):
// 쌓이는 값·버프/디버프를 장치마다 { 걸린 쪽, 아이콘, 숫자, 이름 } 한 줄로 낸다. 걸린 쪽·아이콘은 데이터(src/data/statusMarks.json, 자세는 초월자 데이터 stances[].icon) —
// 엔진은 장치(kit.stack·chargeShot·mastery·stance·evadeBuff, 물공 블록 상태, 지속 피해, 넉백)만 보고 초월자·종족 id 로 분기하지 않는다. 화면은 이 목록만 그린다.
import MARKS_JSON from '../../data/statusMarks.json';
import { evoText } from '../../data/evolution/uniques';
import { evoMarksOf, evoStat } from './evoUnique';
import {
  kitBare, kitEvadeBuffSecondsLeft, kitSecondOn, stanceBreakTakenOf, stanceDrawPreviewOf, stanceHoldBonusOf, stanceOf,
  type CombatState,
} from './combat';

/** 걸린 쪽: self = 내 체력 막대 위, foe = 적 체력 막대 위 */
export type StatusMarkSide = 'self' | 'foe';

/** 장치 종류 (데이터 표의 키) */
export type StatusMarkKind = 'kitStack' | 'charge' | 'final' | 'stance' | 'draw' | 'broken' | 'hold' | 'evadeBuff' | 'basicBuff' | 'flash' | 'stone' | 'haste' | 'selfDot' | 'foeDot' | 'knockback' | 'evoSelf' | 'evoFoe';

export interface StatusMarkDef {
  on: StatusMarkSide;
  icon: string;
  name: string;
}

export const STATUS_MARK_DEFS: Readonly<Record<StatusMarkKind, StatusMarkDef>> = (MARKS_JSON as { marks: Record<StatusMarkKind, StatusMarkDef> }).marks;

/** 표시 한 칸: key = 화면 칸 재사용 키(장치 + 자세 id), name = 이름(설명 창 제목), value = 네모 옆 짧은 숫자, title = 누르기·마우스 설명(지금 값), full = 가득/지금 자세, focus = 만해 가능 */
export interface StatusMark {
  key: string;
  kind: StatusMarkKind;
  name: string;
  on: StatusMarkSide;
  icon: string;
  value: string;
  title: string;
  full: boolean;
  focus: boolean;
}

const pct = (x: number) => Math.round(x * 100);
const secs = (ticks: number, tickSeconds: number) => Math.max(0, ticks) * tickSeconds;

function mark(kind: StatusMarkKind, value: string, title: string, o: { key?: string; name?: string; icon?: string; full?: boolean; focus?: boolean } = {}): StatusMark {
  const d = STATUS_MARK_DEFS[kind];
  return { key: o.key ?? kind, kind, name: o.name ?? d.name, on: d.on, icon: o.icon ?? d.icon, value, title, full: o.full ?? false, focus: o.focus ?? false };
}

/** 지금 보여 줄 스택·버프/디버프 (0·끝난 것은 빠진다. 자세 스택은 지금 자세면 0 이어도 보인다) */
export function statusMarksOf(s: CombatState, factionId = '*'): StatusMark[] {
  const p = s.params;
  const out: StatusMark[] = [];
  const k = s.kit;
  const kit = p.kit;
  const ts = p.tickSeconds;
  if (kit && k) {
    // 스택 장치 (GDD 12-4 v6.048 아이젠 영창): 융합 중(releaseBare)엔 스택 없음
    const st = kit.blocks.find((b) => b.stack)?.stack;
    if (st && k.stack > 0 && !kitBare(s)) {
      out.push(mark('kitStack', String(k.stack), `${kit.stackName || STATUS_MARK_DEFS.kitStack.name} ${k.stack}/${st.full} — ${st.full}이면 ${st.finisherName}`, { name: kit.stackName || STATUS_MARK_DEFS.kitStack.name, full: k.stack >= st.full }));
    }
    // 충전 평타 (v6.069 월아천충) · 마무리 스택 (두 번째 해방 중 — 최후의 월아천충)
    const chargeName = kit.blocks.find((b) => b.chargeShot)?.chargeShot?.name;
    if (chargeName && k.charges > 0) out.push(mark('charge', String(k.charges), `다음 평타 ${chargeName} ${k.charges}회`, { name: chargeName, full: true }));
    const ms = kit.mastery;
    if (ms && kitSecondOn(s)) {
      out.push(mark('final', String(k.finalStack), `${ms.finisherName} ${k.finalStack}/${ms.stacks} — ${ms.releaseName} 중 평타 1대마다 +1, ${ms.stacks}이면 다음 평타가 ${ms.finisherName}`, { name: ms.finisherName, full: k.finalStack >= ms.stacks }));
    }
    // 자세 모드 (천년혈전, C.460): 자세마다 스택 · 발도 충전 · 자세 무너짐 · 유지 보너스
    const sk = kit.stance;
    if (sk) {
      sk.stances.forEach((x, i) => {
        const n = k.stanceStacks[i] ?? 0;
        const now = i === k.stance;
        if (!now && n <= 0) return;
        out.push(mark('stance', String(n), `${x.name} ${n}/${sk.stackMax}${now ? ' (지금 자세)' : ''} — ${x.name} 자세로 때릴 때마다 +1 (${sk.stackSeconds}초 지속), ${sk.releaseAt} 이상이면 ${x.releaseName}`,
          { key: `stance-${x.id}`, name: x.name, ...(x.icon ? { icon: x.icon } : {}), full: now, focus: now && n >= sk.releaseAt }));
      });
      const cur = stanceOf(s);
      const draw = stanceDrawPreviewOf(s);
      if (draw !== null) out.push(mark('draw', `×${draw.toFixed(1)}`, `${cur?.draw?.name ?? ''} 충전 ×${draw.toFixed(2)}`, { name: `${cur?.draw?.name ?? ''} 충전`, full: true }));
      const broken = stanceBreakTakenOf(s);
      if (broken > 0) {
        const left = secs(k.brokenUntil - s.tick, ts);
        out.push(mark('broken', String(Math.ceil(left)), `${STATUS_MARK_DEFS.broken.name} — 받는 피해 +${pct(broken)}% (${left.toFixed(1)}초)`));
      }
      const hold = stanceHoldBonusOf(s);
      if (hold > 0) out.push(mark('hold', `+${pct(hold)}`, `${cur?.name ?? ''} 유지 — 평타 피해 +${pct(hold)}%`, { name: `${cur?.name ?? ''} 유지` }));
    }
    // 회피 치명 버프 (v6.066)
    const eb = kit.evadeBuff;
    const left = kitEvadeBuffSecondsLeft(s);
    if (eb && left > 0) out.push(mark('evadeBuff', String(Math.ceil(left)), `${STATUS_MARK_DEFS.evadeBuff.name} — 치명 확률 +${pct(eb.critChance)}%p · 치명 피해 +${pct(eb.critDamage)}% (${left.toFixed(1)}초)`));
  }
  // 물공 블록·특성 상태 (GDD 49장, C.103)
  const buffHits = (s.basicBuffs ?? []).reduce((n, b) => n + b.hits, 0);
  if (buffHits > 0) out.push(mark('basicBuff', String(buffHits), `${STATUS_MARK_DEFS.basicBuff.name} ${buffHits}회`));
  if ((s.flashHits ?? 0) > 0) out.push(mark('flash', String(s.flashHits), `${STATUS_MARK_DEFS.flash.name} ${s.flashHits}회`));
  if (s.stoneStance && s.stoneStance.ticks > 0) {
    const left = secs(s.stoneStance.ticks, ts);
    out.push(mark('stone', String(Math.ceil(left)), `${STATUS_MARK_DEFS.stone.name} (${left.toFixed(1)}초)`));
  }
  if (s.basicHaste && s.basicHaste.ticks > 0) {
    const left = secs(s.basicHaste.ticks, ts);
    out.push(mark('haste', String(Math.ceil(left)), `${STATUS_MARK_DEFS.haste.name} −${pct(s.basicHaste.haste)}% (${left.toFixed(1)}초)`));
  }
  // 지속 피해 (내게 걸린 것 / 적에게 건 것) · 넉백 (적)
  if (s.player.dot && s.player.dot.ticks > 0) {
    const left = secs(s.player.dot.ticks, ts);
    out.push(mark('selfDot', String(Math.ceil(left)), `${STATUS_MARK_DEFS.selfDot.name} (${left.toFixed(1)}초)`));
  }
  if (s.enemy.dot && s.enemy.dot.ticks > 0) {
    const left = secs(s.enemy.dot.ticks, ts);
    out.push(mark('foeDot', String(Math.ceil(left)), `${STATUS_MARK_DEFS.foeDot.name} (${left.toFixed(1)}초)`));
  }
  if ((s.knockbackTicks ?? 0) > 0) {
    const left = secs(s.knockbackTicks!, ts);
    out.push(mark('knockback', String(Math.ceil(left)), `${STATUS_MARK_DEFS.knockback.name} (${left.toFixed(1)}초)`));
  }
  // 진화체 고유 능력 스택·버프·충전 (GDD 8-7 1차, C.498): 데이터 mark 가 있는 것만 — 걸린 쪽·아이콘·이름 = uniques.json
  for (const m of evoMarksOf(s)) {
    const name = evoText(m.name, factionId);
    const v = Math.round(m.value * 100) / 100;
    const shown = v > 0 && v < 1 ? `${Math.round(v * 100)}` : String(v);
    out.push(mark(m.on === 'foe' ? 'evoFoe' : 'evoSelf', shown, `${name} ${shown}${m.seconds !== null ? ` (${Math.max(0, m.seconds).toFixed(1)}초)` : ''}`, { key: m.key, name, icon: m.icon }));
  }
  // 진화체 고유 능력 늘 붙는 효과 요약 (C.498 — 백련처럼 바 블록 수에 따라 오르는 값): 평타 피해 +% 가 0 보다 크면 한 칸
  if (s.params.evo) {
    const bp = evoStat(s, 'basicPower');
    const as = evoStat(s, 'attackSpeed');
    if (bp > 0 || as > 0) {
      const parts = [as > 0 ? `공격 속도 +${pct(as)}%` : '', bp > 0 ? `일반 공격 피해 +${pct(bp)}%` : ''].filter(Boolean).join(' · ');
      out.push(mark('evoSelf', `+${pct(Math.max(bp, as))}`, parts, { key: 'evo-passive', name: '고유 능력', icon: 'i-special' }));
    }
  }
  return out;
}
