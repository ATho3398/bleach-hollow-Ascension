# 만해 오라 (2026-11-15, GDD 115-A 138)

사용자 원문: "캐릭별로 만해 오라 찍어야되거든?? 몸 주변에 아우라같은거 나오게하고, 캐릭별로 도트가 다 다르잖아. 캐릭 도트만큼 비우지 말고, 오라 16프레임 도트 애니 만들어줘"

- `bankai-aura.png` — 스프라이트 시트: 16프레임(5칸 × 4줄), 한 칸 152×210, 12fps 반복. 기준점(발) = 칸 안 (76, 197). 투명 배경. (2026-11-15 10% 줄임)
- `bankai-aura.json` — 프레임 자리(Aseprite 형식, `meta.pixelfx` 에 fps·기준점).
- 캐릭터 모양을 파내지 않은 통짜 오라 — 어느 캐릭터든 **몸 뒤에** 깔고 발을 기준점에 맞춘다.
- 만든 코드: `scripts/pixelfx/custom/custom/bankai-aura.js` (pixelfx 커스텀 이펙트 `custom/bankai-aura`).
  - 색 바꾸기: `--opts '{"palette":["어두움", …, "밝음"]}'` (8단), 크기: `height`(기본 148)·`width`(기본 41).
  - 다시 뽑기: `npm run fx:fetch` → `vendor/pixelfx` 에서 `node tools/render.mjs custom/bankai-aura --sheet --gif`
- 게임에는 속성 8색 시트로 들어감(C.459): `public/fx/custom-bankai-aura-<속성>.png`. 화면 연결은 아직(켜는 때·자리 미정).
