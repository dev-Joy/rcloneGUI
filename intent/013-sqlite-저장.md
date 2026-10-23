# 013 SQLite 저장

- 작성: Claude (사후 작성 2026-10-23 — 이미 만든 기능을 TASK_013 기록 · 명세로 정리) · 상태: 완료
- 만든 날: 2026-10-14 · 관련: PRD F26, ADR 0005, 명세 [`docs/specs/2026-10-14-sqlite-store.md`](../docs/specs/2026-10-14-sqlite-store.md) · 커밋 2301269

## 문제

작업 · 설정 · 실행 기록이 JSON 파일 여러 개(jobs.json · settings.json · runs/*/run.json)에 흩어져 있어, 여러 곳을 함께 고칠 때 중간에 꺼지면 어긋날 수 있다.

## 바라는 결과

- 작업 · 설정 · 실행 메타를 `rclonegui.db` 한 파일에 둔다.
- 처음 켤 때 예전 JSON을 한 번 가져오고 원본 파일은 남긴다.

## 영향

- `src/main/store/*` 전체, `index.ts`(DB를 못 열면 오류 창 후 종료).

## 제약

- `jobs.json`이 깨져 있으면 아무것도 가져오지 않는다(반쯤 가져오지 않음).
- 앱보다 새 스키마의 DB는 열지 않는다.

## 결정된 것

- node:sqlite(WAL), 스키마는 `user_version`으로 — ADR 0005(ADR 0004 일부 대체).

## 계획 (한 것)

1. `app-database.ts` 스키마 v1 · 가져오기 트랜잭션
2. 저장소를 DB로
3. app-database.test.ts

## 결과

- reviewer · app-verifier R2 통과(R1: 설정 파싱 예외 · 포맷 · 문서).
- 뒤에 v2(그룹, 024) · v3(제외 패턴, 002)로 올림.
