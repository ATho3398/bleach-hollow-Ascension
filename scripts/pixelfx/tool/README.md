# 이펙트 배치 도구 (GDD 180장)

사용자 원문(2026-11-04): "이펙트 적용 툴로 만들자 … 툴에다 먼저 구현하면 내가 위치랑 크기, 각도 조정해서 ㅇㅋ하면 그때 적용해라."

| 페이지 | 주소 | 데이터 |
|---|---|---|
| 이펙트 배치 도구 | https://claude.ai/artifact/8zYJY6nUzygqcDZGRG32to | db `fx/editor`(편집 중)·`fx/fixed`(확정) — 문서 필드 `json` = `{ stamp, places: { "<종족>/<계열 id>": FamilyPixelFx }, at }` |

- 만들기: `node scripts/pixelfx/tool/build.mjs` → `.fx-pages/fx-tool.html`(git 에 안 올림) → Artifact 로 같은 주소에 다시 올린다.
- 항목 = 종족 설정 `families[].pixelFx` 가 있는 계열(지금 사신 참). 시트 = `public/fx/<sheet>-<속성 id>`.
- 무대 = 실제 전투 1배 캡처 `battle-bg.png`(`C268_BG=1 C268_ELS=fire node scripts/c268-proof.cjs`), 맞는 몸 가운데 (257, 153) 페이지 px. 자국 위치·크기·뒤집기·각도는 게임과 같은 식(`src/ui/bha/pixelFx.ts` `pixelFxTransform`, `src/ui/attackFx.ts` pixelMark).
- **확정 처리**(사용자가 "ㅇㅋ"): ArtifactData get `fx/fixed` → `places` 값을 종족 json `families[].pixelFx` 에 넣는다 → 테스트·캡처 → main. 다시 올릴 때 stamp 가 바뀌면 도구는 옛 편집 값을 버리고 게임 값에서 시작한다(확정 안 한 편집 값이 있으면 먼저 넣고 올린다).
