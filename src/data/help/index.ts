// 도움말·튜토리얼 텍스트 데이터 (GDD 14-2, C.19). 본문은 템플릿이고 {자리표시자}는 종족 설정(FactionConfig)·밸런스 값으로 치환한다.
// 종족 id 분기 없이 종족별 표시 이름이 들어간다. 텍스트는 모두 provisional(임시) — 기획 확정 전 문구다.
import { BALANCE } from '../../config/balance';
import { BLOCK_WORDS, type FactionConfig } from '../../engine/faction';
import glossaryJson from './glossary.json';
import screensJson from './screens.json';
import tutorialJson from './tutorial.json';

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
export const GLOSSARY: readonly GlossaryTerm[] = glossaryJson.terms;
export const SCREEN_HELPS: readonly ScreenHelp[] = screensJson.screens;

/** 튜토리얼 장면 targets 가 가리킬 수 있는 전투 화면 요소 id (battleView 가 data-help 로 단다) */
export const BATTLE_HELP_TARGETS = ['battle.stage', 'battle.tray', 'battle.runrow', 'battle.cast', 'battle.legend', 'battle.sp', 'battle.stored'] as const;

const COMBAT = BALANCE.provisional.combat;

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
  vars.specialBlockName = `${BLOCK_WORDS.special} 블록`;
  vars.storedSkillName = BLOCK_WORDS.stored;
  vars.voidBlockName = `${BLOCK_WORDS.void} 블록`;
  delete vars.basicSkillName;
  vars.trayCapacity = String(COMBAT.trayCapacity);
  vars.chainMax = String(COMBAT.chainMultipliers.length);
  vars.familyList = f.families.map((x) => x.abbr).join('·');
  vars.storedChargesMax = String(COMBAT.storedChargesMax);
  vars.storedPower = String(COMBAT.storedPowerInAttacks);
  vars.storedGuardSeconds = String(COMBAT.storedGuardSeconds);
  vars.weakChain3 = String(BALANCE.provisional.absorb.weakChain3ForAbsorb);
  // 진화 단계 이름 (GDD 20-5 설명용): {tier4} = 바스트로데/평대원, {tier5} = 아란칼/수석 대원
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
  return template.replace(PLACEHOLDER, (_, name: string) => {
    const v = vars[name];
    if (v === undefined) throw new Error(`도움말 자리표시자 {${name}} 를 채울 값이 없다`);
    return v;
  });
}
