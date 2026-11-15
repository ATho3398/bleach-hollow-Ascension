// 진화·아란칼화 결과 그림 (GDD 241-B 7 · 246장 1): 바뀐 '뒤' 모습 = 그림 단계(artTierIndexOf — 아란칼화를 깬 종족은 ascension.artTier)와
// 진화로 정해진 외형(evolution.look). 상점 스킨(save.skin)은 덮지 않는다 — 진화 연출은 새 진화체 자체를 보여 준다.
import type { ArtUrls } from '../data/art/manifest';
import type { RoomConfig } from '../engine/faction';
import { artTierIndexOf, type SaveData } from '../game';
import { heroArtOf } from './bha/battle';

export function evolvedArtOf(room: RoomConfig, s: Pick<SaveData, 'evolution' | 'factionId'>): ArtUrls {
  return heroArtOf(room, s.factionId, artTierIndexOf(s), s.evolution.look ?? null);
}
