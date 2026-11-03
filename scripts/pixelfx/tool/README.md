# 이펙트 배치 도구 (GDD 180장)

사용자 원문(2026-11-04): "이펙트 적용 툴로 만들자 … 툴에다 먼저 구현하면 내가 위치랑 크기, 각도 조정해서 ㅇㅋ하면 그때 적용해라."

| 페이지 | 주소 | 데이터 |
|---|---|---|
| 이펙트 배치 도구 | https://claude.ai/artifact/8zYJY6nUzygqcDZGRG32to | db `fx/editor`(편집 중)·`fx/fixed`(확정) — 문서 필드 `json` = `{ stamp: "v3", families: { "<종족>/<계열 id>": [1블록, 2블록, 3블록] }, at }`, 블록 = `{ hits, gaps[타격 사이 ms], speed(시전 속도), layers: [최대 3 × { fx(pixelfx id), color(element·original), anchor(target·attacker), on[나오는 타격 0부터], delay, dx, dy, scale, angle, rate(재생 속도), altFlip }] }` (stamp v3, v2 는 도구가 옮김) |

v2 (사용자 2026-11-04 01:5x "연타 넣을거면 연타 타이밍 조정도 추가하고, 맞는 이펙트도 넣을 수 있도록 한 공격당 이펙트 최대 3개까지 불러올 수 있게 해. 공격 계열에 사신 참, 권, 귀, 호로 교, 조, 탄 으로 ㄱㄱ 그리고 각 공격계열 별 1블록, 2블록, 3블록도 추가"): pixelfx 244개를 도구 안에서 코드로 바로 그린다(`vendor/pixelfx/src` 를 번들 — 시트를 미리 뽑지 않는다). 게임에 넣을 때 고른 것만 `npm run fx -- add` 로 시트(속성 색이면 8장)를 뽑는다.

- 만들기: `node scripts/pixelfx/tool/build.mjs` → `.fx-pages/fx-tool.html`(git 에 안 올림) → Artifact 로 같은 주소에 다시 올린다.
- 먼저 `npm run fx:fetch`. 항목 = build.mjs ORDER(사신 참·권·귀, 호로 교·조·탄), 처음 값 = 사신 참 sword-slash(속성 색, 타격마다), 연타 = 지금 게임(1/0, 3/110, 3/90).
- 무대 = 실제 전투 1배 캡처 `battle-bg-<종족>.png`(`C268_BG=1 node scripts/c268-proof.cjs`), 맞는 몸 가운데 (257, 153) · 치는 몸 가운데 (587, 153) 페이지 px. 자국 위치·크기·뒤집기·각도는 게임과 같은 식(`src/ui/bha/pixelFx.ts` `pixelFxTransform`, `src/ui/attackFx.ts` pixelMark).
- **확정 처리**(사용자가 "ㅇㅋ"): ArtifactData get `fx/fixed` → `places` 값을 종족 json `families[].pixelFx` 에 넣는다 → 테스트·캡처 → main. 다시 올릴 때 stamp 가 바뀌면 도구는 옛 편집 값을 버리고 게임 값에서 시작한다(확정 안 한 편집 값이 있으면 먼저 넣고 올린다).
