# 개발 기록

## 로드맵
| 단계 | 내용 | 상태 |
|---|---|---|
| 0단계 | 환경 구축(레포, 배포, 빈 뼈대) | 완료 (C.0) |
| 뼈대 | 기획서 v0.2, 엔진·데이터 폴더, 종족 설정 스키마, 런 로그가 들어간 저장 구조 | 완료 (C.1) |
| 프로토타입 | 원정 루프 + 매치3 전투 + 흡수 + 리스크 게이지 + 런 로그 (범위는 GDD 12장). 사용자가 "시작해"라고 하면 시작 | 대기 |

## 패치 기록 (C.n = PATCH_LABEL)

### C.0 환경 구축
- 레포·배포 워크플로·빈 뼈대 생성. 게임 내용 없음.

### C.1 뼈대 (기획서 v0.2)
- 기획서 `docs/GDD.md` v0.2 (결정 기록 12장). CLAUDE.md 재작성.
- `src/engine/`: 종족 설정 타입·검증(`faction.ts`), 런 로그 구조(`runLog.ts`). 게임 로직 없음.
- `src/data/`: factions(hollow/shinigami), enemies/traits/tiles/titles 빈 스키마 + 데이터 타입(`schema.ts`).
- `src/game.ts`: 세이브 구조에 런 로그 포함(`SAVE_FORMAT_VERSION` 1 유지, 배포된 세이브 없음).
- `balance.ts`: 기획서 2장 확정 템포 수치만 입력, 임시값 구역은 비어 있음. `BALANCE_VERSION` 2.
