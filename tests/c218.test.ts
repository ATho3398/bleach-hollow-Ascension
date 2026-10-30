// C.218 (GDD 140장 1): 이름 뒤 조사 전수 — 이름을 끼우는 문구는 조사를 두 가지 표기({x}(이)다·{x}은(는) …)로 적고 fixParticles 가 받침에 맞게 고른다.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fixParticles } from '../src/engine/josa';
import { FACTIONS } from '../src/data/factions';
import { guideVars, helpVars, renderHelpText } from '../src/data/help/index';

/** 폴더 아래 파일들 */
function files(dir: string, ext: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p, ext) : p.endsWith(ext) ? [p] : [];
  });
}
/** json 안의 문자열 전부 */
function strings(v: unknown): string[] {
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.flatMap(strings);
  if (v && typeof v === 'object') return Object.values(v).flatMap(strings);
  return [];
}

// 이름 자리 바로 뒤에 받침을 정해 버린 조사 (두 가지 표기가 아닌 것)
const BARE_JSON = /\{[A-Za-z0-9_.]+\}(이다|으로|이|가|을|를|은|는|과|와|로|다)(?![(가-힣])/;
const BARE_TS = /\$\{([^{}]+)\}(이다|으로|이|가|을|를|은|는|과|와|로|다)(?=[ .,!?·—`'")]|$)/;

describe('C.218 조사 전수 (GDD 140장 1)', () => {
  it('(이)다 표기를 받침에 맞게 고른다', () => {
    expect(fixParticles('여기가 대원실(이)다.')).toBe('여기가 대원실이다.');
    expect(fixParticles('여기가 둥지(이)다.')).toBe('여기가 둥지다.');
    expect(fixParticles('호로화(이)다')).toBe('호로화다');
    expect(fixParticles('혼백(으)로 · 호로(으)로 · 저잣거리(으)로')).toBe('혼백으로 · 호로로 · 저잣거리로');
  });

  it('문구 데이터(json)에 받침을 정해 버린 조사 0건', () => {
    const bad = files('src/data', '.json').flatMap((p) => strings(JSON.parse(readFileSync(p, 'utf8'))).filter((s) => BARE_JSON.test(s)).map((s) => `${p}: ${s.slice(0, 60)}`));
    expect(bad).toEqual([]);
  });

  it('화면 코드(ts)의 이름 뒤 조사도 두 가지 표기 — 0건', () => {
    const bad: string[] = [];
    for (const p of files('src', '.ts')) {
      readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
        const m = line.match(BARE_TS);
        if (!m) return;
        if (/^pct\(|%/.test(m[1]!) || /jong|hasBatchim/.test(line)) return; // 퍼센트 수치·받침을 직접 고른 줄
        bad.push(`${p}:${i + 1} ${m[0]}`);
      });
    }
    expect(bad).toEqual([]);
  });

  it('두 종족 안내 문구 — 받침 있는/없는 이름 둘 다 조사가 맞다', () => {
    const json = ['guides', 'glossary', 'screens', 'tutorial'].flatMap((n) => strings(JSON.parse(readFileSync(`src/data/help/${n}.json`, 'utf8'))));
    const templates = json.filter((s) => s.includes('{'));
    for (const f of FACTIONS) {
      const base = { ...helpVars(f), ...guideVars(f) };
      for (const [name, wrong] of [['대원실', /대원실(다|는|가|를|와|으로)(?![가-힣])/], ['둥지', /둥지(이다|은|을|과|으로|이(?![가-힣]))/]] as const) {
        const vars = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, /[가-힣]$/.test(v) ? name : v]));
        for (const t of templates) {
          let out: string;
          try { out = renderHelpText(t, vars); } catch { continue; } // 이 종족에 없는 자리 (다른 종족 전용 문구)
          expect(out, `${f.id} ${t.slice(0, 50)}`).not.toMatch(wrong);
          expect(out).not.toMatch(/[가-힣](이\(가\)|을\(를\)|은\(는\)|과\(와\)|\(으\)로|\(이\)[가-힣])/);
        }
      }
    }
  });

  it('사신 홈 안내 첫 장 = "여기가 대원실이다." · 호로 = "둥지다."', () => {
    const intro = JSON.parse(readFileSync('src/data/help/guides.json', 'utf8')).homeIntro.intro as { body: string };
    const body = (id: string) => renderHelpText(intro.body, { ...helpVars(FACTIONS.find((f) => f.id === id)!), ...guideVars(FACTIONS.find((f) => f.id === id)!) });
    expect(body('shinigami')).toContain('여기가 대원실이다.');
    expect(body('hollow')).toContain('여기가 둥지다.');
  });
});
