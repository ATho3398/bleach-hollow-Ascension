# 개발 기록 (패치 기록)

로드맵과 현재 상태는 `docs/GDD.md` 13장. 이 문서는 패치 기록만 둔다.

## 패치 기록 (C.n = PATCH_LABEL)

### C.0 환경 구축
- 레포·배포 워크플로·빈 뼈대 생성. 게임 내용 없음.

### C.1 뼈대 (기획서 v0.2)
- 기획서 `docs/GDD.md` v0.2 (결정 기록 12장). CLAUDE.md 재작성.
- `src/engine/`: 종족 설정 타입·검증(`faction.ts`), 런 로그 구조(`runLog.ts`). 게임 로직 없음.
- `src/data/`: factions(hollow/shinigami), enemies/traits/tiles/titles 빈 스키마 + 데이터 타입(`schema.ts`).
- `src/game.ts`: 세이브 구조에 런 로그 포함(`SAVE_FORMAT_VERSION` 1 유지, 배포된 세이브 없음).
- `balance.ts`: 기획서 2장 확정 템포 수치만 입력, 임시값 구역은 비어 있음. `BALANCE_VERSION` 2.
