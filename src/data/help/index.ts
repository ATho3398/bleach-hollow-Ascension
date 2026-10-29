// 도움말·튜토리얼 텍스트 데이터 (GDD 14-2, C.19). 본문은 템플릿이고 {자리표시자}는 종족 설정(FactionConfig)·밸런스 값으로 치환한다.
// 종족 id 분기 없이 종족별 표시 이름이 들어간다. 텍스트는 모두 provisional(임시) — 기획 확정 전 문구다.
import { riskText, riskZones, stabilityZones, zoneLines } from './riskText';
import { normalSlotNote } from './textFormat';
import { BALANCE } from '../../config/balance';
import { BLOCK_WORDS, type FactionConfig } from '../../engine/faction';
import { fixParticles } from '../../engine/josa';
import glossaryJson from './glossary.json';
import screensJson from './screens.json';
import tutorialJson from './tutorial.json';
import guidesJson from './guides.json';
import { synergyName, tileName } from '../tiles';
import { statName } from '../elements';
import { STAT_IDS } from '../schema';
import type { TextGuideId } from '../../engine/tutorial';

/** 튜토리얼 장면: targets = 전투 화면의 data-help 요소 id (비면 하이라이트 없이 가운데 카드) */
export interface TutorialScene {
  id: string;
  targets: string[];
  title: string;
  body: string;
  /** 카드 안에 보여 줄 샘플 블록 역할 (attack·guard·heal) */
  sample?: string[];
  /** 직접 해 보기 장면: 전투가 다시 흐르고, 블록을 하나 쓰면 done 문구로 바뀐다 */
  practice?: boolean;
  done?: string;
  /** 직접 해 보기에서 [다음]이 열리려면 블록 바에 이만큼 모여야 한다 (다음 체인 설명에 보여 줄 블록, GDD 100장 #40) */
  minBlocks?: number;
}

export interface GlossaryTerm {
  id: string;
  title: string;
  body: string;
}

export interface ScreenHelp {
  id: string;
  title: string;
  body: string;
}

export const TUTORIAL_SCENES: readonly TutorialScene[] = tutorialJson.scenes;
/** 첫 원정 첫 전투 각본의 설명 카드 (GDD 123장 5, C.199): 각본 단계 id(engine/combat/script) → 장면 */
export const SCRIPT_SCENES: Readonly<Record<string, TutorialScene>> = Object.fromEntries(tutorialJson.script.map((x) => [x.id, x as TutorialScene]));
/** 튜토리얼 원정 뒤 회복 안내 카드 (GDD 123장 5 수정 v5.280, C.199): 순서 그대로. 대상 '@선택자' = CSS 선택자 */
export const RECOVER_SCENES: readonly TutorialScene[] = tutorialJson.recover;
export const GLOSSARY: readonly GlossaryTerm[] = glossaryJson.terms;
export const SCREEN_HELPS: readonly ScreenHelp[] = screensJson.screens;
/** 한 번만 뜨는 안내 (C.120, GDD 64·67장): 안내 id → 장면 ('first-absorb' 는 튜토리얼 흡수 화면 위 장면, 저장 상태 없음) */
export const GUIDES: Readonly<Record<TextGuideId | 'first-absorb', readonly TutorialScene[]>> = guidesJson.guides;
/** 처음 켰을 때 홈 안내 (GDD 131장, C.207): 첫 카드 · 방 물건·독 카드(방에 있는 것만) · 마지막 첫 모험 카드 */
export const HOME_INTRO: { intro: Omit<TutorialScene, 'id' | 'targets'>; items: readonly TutorialScene[]; last: Omit<TutorialScene, 'targets'> } = guidesJson.homeIntro;

/** 안내 본문 자리표시자 (종족 설정 helpVars 에 더함): 시작 타일 이름·조합 예시·튜토리얼 수치 */
export function guideVars(f: FactionConfig): Record<string, string> {
  const [prey, elite, rest] = BALANCE.provisional.expedition.starterTiles;
  return {
    'tile.prey': tileName(prey!, f.id), 'tile.elite': tileName(elite!, f.id), 'tile.rest': tileName(rest!, f.id),
    // C.124 (GDD 65장): 뽑기 전용 새 타일 4종
    'tile.training': tileName('env-training', f.id), 'tile.hunter': tileName('hunter-den', f.id), 'tile.spring': tileName('rest-spring', f.id), 'tile.echo': tileName('echo', f.id),
    comboExample: synergyName('oasis', f.id),
    starterCount: String(BALANCE.provisional.expedition.starterTiles.length),
    statEv: String(BALANCE.provisional.tutorialRun.statEv),
    tutorialCell: String(BALANCE.provisional.tutorialRun.cell),
    deckSize: String(BALANCE.provisional.expedition.deckSize),
  };
}

/** 튜토리얼 장면 targets 가 가리킬 수 있는 전투 화면 요소 id (battleView 가 data-help 로 단다) */
export const BATTLE_HELP_TARGETS = ['battle.stage', 'battle.tray', 'battle.runrow', 'battle.cast', 'battle.legend', 'battle.liberation', 'battle.guard', 'battle.hp'] as const; // battle.guard·battle.hp = 각본 전투 카드(C.199) // battle.sp(영력 바)는 C.118, battle.stored(저장 필살기)는 C.134 에 삭제 → battle.liberation

const COMBAT = BALANCE.provisional.combat;
const LIB = BALANCE.provisional.liberation;

/** 본문에서 쓸 수 있는 자리표시자 값: 종족 설정의 문자열 필드(중첩은 a.b)와 밸런스 수치 */
export function helpVars(f: FactionConfig): Record<string, string> {
  const vars: Record<string, string> = {};
  const walk = (prefix: string, value: unknown) => {
    if (typeof value === 'string') vars[prefix] = value;
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value)) walk(prefix ? `${prefix}.${k}` : k, v);
    }
  };
  walk('', f);
  // 블록 이름은 전투 화면과 같은 종족 무관 표기 (GDD 20장 v5.4: 옛 '포효'·'응축 일격' 등 금지)
  vars.voidBlockName = `${BLOCK_WORDS.void} 블록`;
  // 공허 블록 (GDD 101장): 블록이 공허로 바뀔 확률·히든 진화체 피해
  vars.voidChancePct = String(Math.round(COMBAT.voidChance * 100));
  vars.voidChanceMaxPct = String(Math.round(COMBAT.voidChanceMax * 100));
  vars.voidHiddenAttacks = String(COMBAT.voidPowerHiddenInAttacks);
  vars.voidStunSeconds = String(COMBAT.voidStunSeconds);
  // 막기 게이지·[소모품]·[장비] (GDD 105장 수정 v5.233)
  vars.guardGaugeSeconds = String(COMBAT.guardGaugeSeconds);
  vars.guardSeconds = String(COMBAT.guardSeconds);
  vars.gearCooldownSeconds = String(COMBAT.gearCooldownSeconds);
  const BI = BALANCE.provisional.battleItems;
  const potion = BI['battle-potion'];
  const haste = BI['battle-haste'];
  vars.potionPct = potion?.effect === 'heal' ? String(Math.round(potion.fraction * 100)) : '';
  vars.hasteSeconds = haste?.effect === 'haste' ? String(haste.seconds) : '';
  vars.hasteMult = haste?.effect === 'haste' ? String(haste.spawnMult) : '';
  delete vars.basicSkillName;
  vars.trayCapacity = String(COMBAT.trayCapacity);
  vars.chainMax = String(COMBAT.chainMultipliers.length);
  vars.familyList = f.families.map((x) => x.abbr).join('·');
  // 해방 (GDD 83장, 옛 저장형 필살기 자리): {liberation.baseName}·{liberation.name} 은 종족 설정에서 그대로, 수치는 BALANCE
  vars.liberationSeconds = String(LIB.seconds);
  vars.liberationRisk = String(LIB.riskOnEnd);
  // 진화 단계 이름 (GDD 20-5 설명용): {tier4} = 바스트로데/평대원, {tier5} = 아란칼/수석 대원
  // 능력치 자세한 설명 (C.137, GDD 85장 9): 이름은 종족 설정 표기, 수치는 BALANCE 에서 읽는다 (숫자 하드코딩 없음)
  for (const id of STAT_IDS) vars[`stat.${id}`] = statName(id, f.id);
  vars.statRef = String(BALANCE.provisional.stats.tierTotals[0]! / STAT_IDS.length);
  vars.statMax = String(BALANCE.provisional.stats.statMax);
  vars.playerMaxHp = String(COMBAT.playerMaxHp);
  vars.playerHpScale = String(COMBAT.playerHpScale);
  vars.playerAttackSeconds = String(COMBAT.playerAttackSeconds);
  vars.critChancePct = String(Math.round(COMBAT.critChance * 100));
  vars.critChanceMaxPct = String(Math.round(COMBAT.critChanceMax * 100));
  vars.critMultiplier = String(COMBAT.critMultiplier);
  // 광기·자아 설명 (C.141, GDD 84장 9): 손해를 숫자로 — 수치는 BALANCE, 이름은 종족 설정 (ui/riskText.ts)
  const rt = riskText(f);
  // C.185 (GDD 111장 4): 상태 ⓘ 창과 같은 구조 — 한 줄 요약 → 하는 일 → 구간별 손해 → 오르내림, 줄마다 줄바꿈
  vars.riskLead = rt.riskLead;
  vars.riskDoesText = rt.riskDoes.join('\n');
  vars.riskZoneText = zoneLines(riskZones(f)).join('\n');
  vars.riskMoveText = [...rt.riskUp, ...rt.riskDown].join('\n');
  vars.stabilityLead = rt.stabilityLead;
  vars.stabilityDoesText = rt.stabilityDoes.join('\n');
  vars.stabilityZoneText = zoneLines(stabilityZones(f)).join('\n');
  vars.stabilityMoveText = rt.stabilityMove.join('\n');
  vars.normalSlotNote = normalSlotNote(f.slotName);
  vars.tier4 = f.tierNames[3];
  vars.tier5 = f.tierNames[4];
  return vars;
}

const PLACEHOLDER = /\{([A-Za-z0-9_.]+)\}/g;

/** 템플릿에 들어 있는 자리표시자 이름들 */
export function placeholdersOf(template: string): string[] {
  return [...template.matchAll(PLACEHOLDER)].map((m) => m[1]!);
}

/** 자리표시자를 치환한다. 모르는 이름이면 던진다 (조용히 {…} 가 화면에 남지 않게) */
export function renderHelpText(template: string, vars: Record<string, string>): string {
  const text = template.replace(PLACEHOLDER, (_, name: string) => {
    const v = vars[name];
    if (v === undefined) throw new Error(`도움말 자리표시자 {${name}} 를 채울 값이 없다`);
    return v;
  });
  // 종족 이름과 같은 풀이 괄호는 지운다 ("공격(공격)" → "공격"), 조사는 받침에 맞게 (C.93)
  return fixParticles(text.replace(/([가-힣]+)\(\1\)/g, '$1'));
}
