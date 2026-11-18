// 블록 아이콘 — 주먹 (사용자 2026-11-19 "피스트 아이콘" · 참고 그림: 불꽃 꼬리를 끌며 날아가는 주먹). 정지 그림 한 프레임.
// 불꽃 = fire/fireball(날아가는 불덩이)을 48칸에 놓은 것, 그 머리에 쥔 주먹(옆모습, 주먹 마디가 진행 방향)을 얹는다. pixelfx 에 손 그림이 없어 주먹만 도트 스프라이트로 그렸다.
import { chain } from "../../core/index.js";
import * as fireball from "../fire/fireball.js";
import { ICON } from "./_icon.js";
export const meta = { name: "Icon: fist", desc: "A clenched fist flying right at the head of a fireball, in a 48px square.", tags: ["icon", "fist", "punch"], ...ICON, duration: 1.2, loop: true,
  options: { radius: 10, skin: { o: "#3a1c1a", s: "#fac69a", d: "#c98263", h: "#ffe4c8" }, seed: 5 } };
const FIST = [
  "....ooooooooo....",
  "..oosssssssshoo..",
  ".osssssssossshho.",
  ".osssssssosssssdo",
  ".ossssssssooooooo",
  ".osssssssossshhdo",
  ".osssssssosssssdo",
  "oossssssssooooooo",
  "ossssooooooosshdo",
  "ossssosssshossddo",
  "osdddossssdoooooo",
  "osdddooooooossdo.",
  ".oddddddddosdddo.",
  "..ooddddddooooo..",
  "....oooooo.......",
];
export function create(o) {
  const fx = chain([{ fx: fireball, x: 11, y: 0, radius: o.radius }])(o);
  return { update: (dt) => fx.update(dt), drawBack: (p) => fx.drawBack(p), draw(p) { fx.draw(p); p.sprite(FIST, o.skin, 3, -8); } };
}
