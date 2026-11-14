// C.456 (GDD 12-4 v6.081): 초월자 화면에 진화 단계·진화체 대신 '초월자' · 무월 이치고 그림(몸 뒤·몸 앞 불꽃 레이어) · 아이젠 크기 ×0.85
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ART_MANIFEST, layerFiles, layeredArt } from '../src/data/art/manifest';
import { TRANSCENDENTS } from '../src/data/transcendents';
import { newSaveData, noEvolutionLabel } from '../src/game';
import { slotTitle } from '../src/ui/startView';

const read = (p: string) => readFileSync(p, 'utf8');
const KEY = 'char.transcendent-ichigo-mugetsu';
const FILES = [
  'char-transcendent-ichigo-mugetsu.png',
  ...Array.from({ length: 16 }, (_, i) => `char-transcendent-ichigo-mugetsu/back-${i + 1}.png`),
  ...Array.from({ length: 40 }, (_, i) => `char-transcendent-ichigo-mugetsu/front-${i + 1}.png`),
];

describe('초월자 = 진화 단계·진화체 없이 초월자 이름 · 초월자', () => {
  it('진화 없는 트랙 종류만 이름·종류를 돌려준다 (id 분기 없음)', () => {
    const s = newSaveData('hollow', 0);
    expect(noEvolutionLabel(s)).toBeNull();
    for (const d of TRANSCENDENTS) expect(noEvolutionLabel({ factionId: 'hollow', transcendentId: d.id })).toEqual({ name: d.name, kind: '초월자' });
  });
  it('화면들이 진화체 대신 그 이름을 쓴다 (방 이름표·상태·장비·사진·도감·슬롯)', () => {
    expect(read('src/ui/bha/statusBox.ts')).toContain('const kind = trackRulesOf(save).label;');
    expect(read('src/ui/lcdScreens.ts')).toContain('evolutionColumns(faction, evo, own)');
    for (const f of ['src/ui/equipView.ts', 'src/ui/photoView.ts', 'src/ui/dexView.ts', 'src/saveSlots.ts']) expect(read(f)).toContain('noEvolutionLabel(save)');
    expect(slotTitle({ slot: 0, state: 'ok', factionId: 'hollow', tierIndex: 3, expeditions: 0, playedAt: null, inExpedition: false, ownTitle: '초월자 이치고' }, undefined)).toBe('초월자 이치고');
  });
});

describe('무월 이치고 그림', () => {
  it('데이터: 이치고 kit.mastery.releaseArt = 무월 그림 키', () => {
    const withArt = TRANSCENDENTS.filter((d) => d.kit?.mastery?.releaseArt).map((d) => [d.id, d.kit!.mastery!.releaseArt]);
    expect(withArt).toEqual([['ichigo', KEY]]);
  });
  it('그림 파일: 몸 144×144 한 장 + 몸 뒤 16 · 몸 앞 40 프레임, 120ms', () => {
    for (const f of FILES) expect(existsSync(`public/art/${f}`)).toBe(true);
    expect(existsSync('public/art/char-transcendent-ichigo-mugetsu/back-17.png')).toBe(false);
    expect(existsSync('public/art/char-transcendent-ichigo-mugetsu/front-41.png')).toBe(false);
    expect(ART_MANIFEST[KEY]?.layers).toEqual({ back: 'back', front: 'front', ms: 120 });
  });
  it('layeredArt = 몸 + 레이어마다 자기 길이', () => {
    expect(layerFiles(KEY, 'back', FILES)).toHaveLength(16);
    const a = layeredArt(KEY, '/', ART_MANIFEST, FILES)!;
    expect(a.src).toBe('/art/char-transcendent-ichigo-mugetsu.png');
    expect(a.layers!.back).toHaveLength(16);
    expect(a.layers!.front).toHaveLength(40);
    expect(a.layers!.front[39]).toBe('/art/char-transcendent-ichigo-mugetsu/front-40.png');
    expect(a.layers!.ms).toBe(120);
    expect(layeredArt(KEY, '/', ART_MANIFEST, [])).toBeNull(); // 몸 그림 파일이 없으면 그림 그대로
  });
  it('전투: 두 번째 해방 중에만 바꿔 입는다 (데이터 키로, id 분기 없음)', () => {
    const src = read('src/ui/battleView.ts');
    expect(src).toContain('tryGetTranscendent(s.params.kit.id)?.kit?.mastery?.releaseArt');
    expect(src).toContain('heroSecond?.set(kitSecondOn(s))');
  });
});

describe('아이젠 크기 ×0.85 (provisional)', () => {
  it('방 1.5 → 1.28 · 필드 1.12 → 0.95', () => {
    expect(ART_MANIFEST['char.transcendent-aizen']).toEqual({ scale: 1.28, fieldScale: 0.95 });
  });
});
