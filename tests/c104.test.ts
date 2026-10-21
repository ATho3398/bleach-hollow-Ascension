import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseFactionConfig } from '../src/engine/faction';
import { FACTIONS } from '../src/data/factions';
import { logoUrl } from '../src/ui/bha/logo';

describe('C.104 종족 로고 (GDD 50)', () => {
  it('모든 종족 설정에 logo 가 있고 그림 파일이 public/art 에 있다', () => {
    for (const f of FACTIONS) {
      expect(f.logo, f.id).toBeTruthy();
      expect(existsSync(`public/art/${f.logo}.png`), f.id).toBe(true);
    }
  });
  it('logoUrl 은 설정 값만 읽고, 없으면 null', () => {
    expect(logoUrl({ logo: 'logo-x' }, '/b/')).toBe('/b/art/logo-x.png');
    expect(logoUrl({}, '/b/')).toBeNull();
  });
  it('logo 는 비어 있지 않은 문자열이어야 한다', () => {
    const base = JSON.parse(JSON.stringify(FACTIONS[0]));
    expect(() => parseFactionConfig({ ...base, logo: '' })).toThrow(/logo/);
  });
});
