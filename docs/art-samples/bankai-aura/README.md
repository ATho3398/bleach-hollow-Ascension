# 만해 오라 (2026-11-15, GDD 115-A 138)

사용자 원문: "캐릭별로 만해 오라 찍어야되거든?? 몸 주변에 아우라같은거 나오게하고, 캐릭별로 도트가 다 다르잖아. 캐릭 도트만큼 비우지 말고, 오라 16프레임 도트 애니 만들어줘"

- `bankai-aura.png` — 스프라이트 시트: 16프레임(5칸 × 4줄), 한 칸 168×232, 12fps 반복. 기준점(발) = 칸 안 (84, 218). 투명 배경.
- `bankai-aura.json` — 프레임 자리(Aseprite 형식, `meta.pixelfx` 에 fps·기준점).
- 캐릭터 모양을 파내지 않은 통짜 오라 — 어느 캐릭터든 **몸 뒤에** 깔고 발을 기준점에 맞춘다.
- 만든 코드: `scripts/pixelfx/custom/custom/bankai-aura.js` (pixelfx 커스텀 이펙트 `custom/bankai-aura`).
  - 색 바꾸기: `--opts '{"palette":["어두움", …, "밝음"]}'` (8단), 크기: `height`(기본 165)·`width`(기본 46).
  - 다시 뽑기: `npm run fx:fetch` → `vendor/pixelfx` 에서 `node tools/render.mjs custom/bankai-aura --sheet --gif`
- 아직 게임(`public/fx`)에는 안 넣음 — 시안.
