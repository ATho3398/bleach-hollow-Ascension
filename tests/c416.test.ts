// C.416 (GDD 246장 → v6 15-8·15-9): 아란칼화 진화 그림 = 아란칼 · 옛 새형 모델 삭제 · 방 말풍선 자리
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createCombat } from '../src/engine/combat';
import { getEnemy } from '../src/data/enemies';
import { getFaction } from '../src/data/factions';
import { roomOf } from '../src/engine/faction';
import { setActiveGender } from '../src/engine/gender';
import { testEvolveNext, testSkins } from '../src/engine/testMode';
import { artTierIndexOf, newSaveData, recordAscension, type SaveData } from '../src/game';
import { heroArtOf } from '../src/ui/bha/battle';
import { evolvedArtOf } from '../src/ui/evolvedArt';
import { getSkin, SKINS, skinsFor } from '../src/data/skins';
import { COSMETIC_ITEMS } from '../src/data/shop';
import { charArt } from '../src/data/art/manifest';

const read = (p: string) => readFileSync(p, 'utf8');
const won = () => { const c = createCombat(1, { enemy: getEnemy('test-a'), params: {} }); c.status = 'won'; return c; };
const lookOf = (s: SaveData) => { const a = evolvedArtOf(roomOf(getFaction(s.factionId)), s); return a.rig?.look ?? a.src; };

describe('진화 결과 그림 = 바뀐 뒤 모습 (GDD 246장 1)', () => {
  for (const gender of ['male', 'female'] as const) {
    for (const fid of ['hollow', 'shinigami']) {
      it(`${fid} ${gender}: 1→2·2→3·3→4 진화마다 새 단계 그림, 4단계에서 아란칼화/참백도 구상화`, () => {
        setActiveGender(gender);
        const s = newSaveData(fid, 1);
        s.gender = gender;
        s.evolution.ev = { ...s.evolution.ev, spd: 30 };
        const seen: (string | null | undefined)[] = [lookOf(s)];
        for (let t = 0; t < 3; t++) {
          const r = testEvolveNext(s, 1000 + t);
          expect(r.ok).toBe(true);
          expect(s.evolution.tierIndex).toBe(t + 1);
          // 결과 창 그림 = 진화 뒤 단계(artTierIndexOf)·진화로 정해진 외형(look) 그대로 — 진화 전 모습이 아니다
          const art = evolvedArtOf(roomOf(getFaction(fid)), s);
          expect(art).toEqual(heroArtOf(roomOf(getFaction(fid)), fid, artTierIndexOf(s), s.evolution.look ?? null));
          seen.push(lookOf(s));
        }
        if (fid === 'hollow') expect(seen[1]).not.toBe(seen[0]); // 호로 → 길리안
        const before = lookOf(s);
        recordAscension(s, won(), 2000);
        expect(s.evolution.ascended).toBe(true);
        const after = lookOf(s);
        if (getFaction(fid).ascension.lookChange) {
          // 아란칼화 = 이미 있는 아란칼 모델(종이인형 arrancar-base, 여성 -f) — 호로 모습 아님
          expect(after).toBe(gender === 'female' ? 'arrancar-base-f' : 'arrancar-base');
          expect(after).not.toBe(before);
        } else {
          expect(after).toBe(before); // 참백도 구상화는 모습이 그대로(종족 설정 lookChange false)
        }
        setActiveGender('male');
      });
    }
  }
  it('상점 스킨을 입고 있어도 결과 그림은 새 진화체(아란칼)', () => {
    setActiveGender('male');
    const s = newSaveData('hollow', 1);
    Object.assign(s.evolution, { tierIndex: 3, formId: 't4:fire:mixed', formHistory: ['t2:base', 't3:fire', 't4:fire:mixed'], ability: 'atk' });
    s.skin = 'grandfisher';
    recordAscension(s, won(), 1);
    expect(lookOf(s)).toBe('arrancar-base');
  });
  it('화면: 진화 2곳·아란칼화 결과가 evolvedArtOf 를 넘기고, 결과 창이 진화 결과와 같은 그림 칸을 쓴다', () => {
    const app = read('src/ui/app.ts');
    expect(app.match(/evolvedArtOf\(roomOf\(faction\), s0?\)/g)).toHaveLength(3);
    expect(read('src/ui/rankView.ts')).toContain("'bha-evolve__fig bha-evolve__fig--result'");
  });
});

describe('옛 새형(raptor) 삭제 (GDD 246장 2)', () => {
  it('고르는 목록·편집기(테스트 스킨)·상점 품목에서 빠지고, 옛 세이브 id 는 속도형으로 보인다', () => {
    expect(SKINS.some((s) => s.id === 'raptor')).toBe(false);
    expect(skinsFor('hollow').some((s) => s.id === 'raptor')).toBe(false);
    expect(testSkins('hollow').some((s) => s.id === 'raptor')).toBe(false);
    expect(COSMETIC_ITEMS.some((c) => c.id === 'skin-raptor')).toBe(false);
    expect(JSON.stringify(SKINS)).not.toContain('새형');
    expect(getSkin('raptor')?.name).toBe('속도형');
    expect(charArt('hollow', 2, 'char.hollow', '/', undefined, [], 'raptor', undefined, 'male').rig?.look).toBe('speed-base');
  });
});

describe('방 말풍선 = 상태 박스와 캐릭터 사이 고정 (GDD 246장 3)', () => {
  it('상태 박스 아래 자리(--bubble-top)에 놓고 박스를 숨기지 않는다', () => {
    const v = read('src/ui/roomView.ts');
    expect(v).toContain('const placeBubbleSlot = (): boolean =>');
    expect(v).toContain("if (placeBubbleSlot()) return true;");
    expect(v).toContain("if (bubble.classList.contains('is-slot')) scene.classList.remove('is-saying');");
    expect(read('src/ui/bha/room.css')).toContain('.bha-room__bubble.is-slot { top: var(--bubble-top, 0px);');
  });
});
